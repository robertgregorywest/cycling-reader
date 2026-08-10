import { beforeEach, describe, expect, it } from 'vitest'
import { SOURCES, sourceConfig } from '../../../src/ingest/config.ts'
import { parseFeed } from '../../../src/ingest/feed.ts'
import { ingest, type IngestReport } from '../../../src/ingest/run.ts'
import { SqliteArticleStore } from '../../../src/ingest/store/sqlite.ts'
import type { ArticleStore } from '../../../src/ingest/store/store.ts'
import type { SourceId } from '../../../src/shared/article.ts'
import { readFixture } from '../../fixtures/corpus.ts'
import { readFeedFixture } from '../../fixtures/feeds.ts'
import {
  fetchFeedFromCorpus,
  fetchFeedRevising,
  fetchPageFromCorpus,
  fixedClock,
} from '../../support/ingest.ts'

/**
 * ADR-0006: an Ingest Run asserts its own success and fails loudly, because
 * every plausible failure here is otherwise silent and GitHub only sends mail
 * on failure.
 *
 * Each tripwire is driven from the same seam the real Run uses — the Feeds and
 * pages a Run is given — rather than by calling the check with a hand-made
 * report, because what is being tested is that a *Run* in that condition
 * fails, not that a predicate returns true.
 */

const RUN_AT = '2026-08-09T06:00:00.000Z'
const LATER = '2026-08-09T12:00:00.000Z'

/** Newer than every item in the Feed corpus, and later than the first Run. */
const PUBLISHED_SINCE = new Date('2026-08-09T09:30:00.000Z')

let store: SqliteArticleStore

beforeEach(() => {
  store = SqliteArticleStore.open(':memory:')
  return () => store.close()
})

function run(overrides: Partial<Parameters<typeof ingest>[0]> = {}): Promise<IngestReport> {
  return ingest({
    sources: SOURCES,
    fetchFeed: fetchFeedFromCorpus,
    fetchPage: fetchPageFromCorpus,
    now: fixedClock(RUN_AT),
    store,
    ...overrides,
  })
}

describe('a Run that went well', () => {
  it('succeeds, and says so', async () => {
    const report = await run()

    expect(report.outcome).toBe('succeeded')
    expect(report.failure).toBeNull()
  })

  it('records itself: what it did, when, and how its bodies were obtained', async () => {
    const report = await run()

    expect(await store.lastRun()).toEqual({
      startedAt: RUN_AT,
      finishedAt: RUN_AT,
      admitted: 13,
      revised: 0,
      extractionMethods: { targeted: 4, readability: 7, stub: 2 },
      outcome: 'succeeded',
      failure: null,
    })
  })

  it('records one row per Run, so that a Run has a predecessor to be judged against', async () => {
    await run()
    await run({ now: fixedClock(LATER) })

    expect((await store.lastRun())?.startedAt).toBe(LATER)
  })
})

/**
 * A Feed carries its last fifty items regardless of the news, so zero items is
 * never a quiet day: it is a changed Feed URL, a Source outage, or a document
 * that is no longer RSS.
 */
describe('a Feed that parses to zero items', () => {
  const EMPTY = '<?xml version="1.0"?><rss version="2.0"><channel><title>A Source</title></channel></rss>'

  it('fails the Run, naming the Source', async () => {
    const report = await run({ fetchFeed: () => Promise.resolve(EMPTY) })

    expect(report.outcome).toBe('failed')
    expect(report.failure).toMatch(/cyclingnews: the Feed parsed to zero items/)
  })

  it('fails the Run when only one of the two Sources is affected', async () => {
    const report = await run({
      fetchFeed: (url) =>
        url === sourceConfig('cyclingweekly').feedUrl
          ? Promise.resolve(EMPTY)
          : fetchFeedFromCorpus(url),
    })

    expect(report.admitted).toBe(10)
    expect(report.failure).toMatch(/cyclingweekly/)
  })
})

/**
 * The Source published something since the previous Run looked, and this Run
 * admitted nothing: whatever sits between the Feed and the store is dropping
 * Articles on the floor.
 */
describe('a Run that admits nothing the Feed says is newer than the previous Run', () => {
  /** The Feed, re-served with one item published after the first Run. */
  function feedPublishedSince() {
    return fetchFeedRevising(
      'cyclingnews',
      guidBeneath('cyclingnews', '/pro-cycling/racing/'),
      ['pubDate'],
      PUBLISHED_SINCE,
    )
  }

  it('fails the Run', async () => {
    await run({ sources: [sourceConfig('cyclingnews')] })

    const second = await run({
      sources: [sourceConfig('cyclingnews')],
      fetchFeed: feedPublishedSince(),
      now: fixedClock(LATER),
    })

    expect(second.admitted).toBe(0)
    expect(second.outcome).toBe('failed')
    expect(second.failure).toMatch(/cyclingnews: admitted nothing/)
  })

  it('says nothing of the kind on the first Run there ever was', async () => {
    // Nothing to be newer *than*, and every item is admitted anyway.
    const report = await run({ fetchFeed: feedPublishedSince() })

    expect(report.outcome).toBe('succeeded')
  })

  it('leaves a Run alone when the Feed offers nothing since the previous one', async () => {
    await run()
    const second = await run({ now: fixedClock(LATER) })

    expect(second.admitted).toBe(0)
    expect(second.outcome).toBe('succeeded')
  })

  /**
   * The Section Allowlist excludes commerce paths by design, so a Run that
   * admitted nothing because the only fresh item was a product review is a Run
   * that worked.
   */
  it('leaves a Run alone when the one fresh item is not admissible', async () => {
    await run({ sources: [sourceConfig('cyclingweekly')] })

    const second = await run({
      sources: [sourceConfig('cyclingweekly')],
      fetchFeed: fetchFeedRevising(
        'cyclingweekly',
        guidBeneath('cyclingweekly', '/reviews/'),
        ['pubDate'],
        PUBLISHED_SINCE,
      ),
      now: fixedClock(LATER),
    })

    expect(second.admitted).toBe(0)
    expect(second.outcome).toBe('succeeded')
  })
})

/**
 * Bodies arriving through Readability rather than the targeted path is what a
 * Source redesign looks like from here (ADR-0004). The Articles still read,
 * which is exactly why nobody would notice.
 */
describe('a Run whose Extractions fall back to Readability', () => {
  /** Every page served as the redesigned body container, which defeats the
   * targeted path at both Future PLC Sources. */
  const redesigned = () => Promise.resolve(readFixture('cyclingweekly-redesigned-body-container'))

  /**
   * Velo carries enough real admitted bodies (6) on its own to cross the
   * per-Source floor, unlike either Future PLC Source's small fixture feed —
   * so it is the seam this asks through: "if a Source the tripwire judges
   * fell back this often, would it be caught?" (ADR-0011). Overriding one
   * field of the real, checked-in config is the smallest way to ask that
   * without fabricating a Feed.
   */
  it('is judged per Source, naming the one that crossed the threshold', async () => {
    const report = await run({ sources: [{ ...sourceConfig('velo'), targetedExtraction: true }] })

    expect(report.extractionMethods).toEqual({ targeted: 0, readability: 6, stub: 0 })
    expect(report.outcome).toBe('failed')
    expect(report.failure).toBe(
      'velo: Readability produced 6 of 6 bodies (100%), above the 20% a Source redesign is read from',
    )
  })

  it('does not judge a Source that runs no platform the targeted path was ever written against', async () => {
    // Velo, unmodified: the same 100% Readability rate above, but exempt
    // rather than failing every Run — this is that Source's normal shape.
    const report = await run({ sources: [sourceConfig('velo')] })

    expect(report.extractionMethods).toEqual({ targeted: 0, readability: 6, stub: 0 })
    expect(report.outcome).toBe('succeeded')
  })

  /**
   * Neither Future PLC Source's fixture feed carries enough admitted items on
   * its own to cross the per-Source floor even at a 100% fallback rate — the
   * fixture corpus is sized for admission and Extraction dispatch, not for
   * exercising a tripwire that needs real-world volume to fire. A redesign at
   * either Source is still caught in production, where a Source publishes far
   * more than five Articles between Runs.
   */
  it('does not fail a Run where every Source stayed under the floor', async () => {
    const report = await run({
      sources: [sourceConfig('cyclingnews'), sourceConfig('cyclingweekly')],
      fetchPage: redesigned,
    })

    expect(report.extractionMethods.targeted).toBe(0)
    expect(report.outcome).toBe('succeeded')
  })

  /**
   * Two bodies, one of them from the fallback, is not evidence of a redesign;
   * it is a Run that extracted two bodies. Failing it would train the one
   * person who reads the failure mail to ignore it.
   */
  it('says nothing about a handful of bodies', async () => {
    const report = await run({ sources: [sourceConfig('cyclingweekly')] })

    expect(report.extractionMethods.readability).toBe(1)
    expect(report.extractionMethods.targeted).toBeLessThan(4)
    expect(report.outcome).toBe('succeeded')
  })
})

/**
 * The failure ADR-0006 exists to prevent is a Run nobody hears about. A Run
 * that could not finish must therefore still leave its row behind.
 */
describe('a Run that could not finish at all', () => {
  it('records itself as failed, in the words of what went wrong, and rethrows', async () => {
    const unreachable = (url: string) =>
      url === sourceConfig('cyclingweekly').feedUrl
        ? Promise.reject(new Error('ETIMEDOUT'))
        : fetchFeedFromCorpus(url)

    await expect(run({ fetchFeed: unreachable })).rejects.toThrow('ETIMEDOUT')

    expect(await store.lastRun()).toMatchObject({
      startedAt: RUN_AT,
      outcome: 'failed',
      failure: 'ETIMEDOUT',
      // What the Run managed before it died is recorded, not discarded.
      admitted: 4,
    })
  })

  it('records what a store that refused a write did to it', async () => {
    // The Run's own store refuses the Articles but keeps the Run's row, which
    // is the arrangement that matters: D1 rejecting a write must not take the
    // record of the Run down with it.
    const refusing: ArticleStore = {
      knownRevisions: (source, guids) => store.knownRevisions(source, guids),
      addArticle: () => Promise.reject(new Error('D1 refused the write: no such table')),
      reviseArticle: (article, images) => store.reviseArticle(article, images),
      lastRun: () => store.lastRun(),
      recordRun: (record) => store.recordRun(record),
      article: (source, guid) => store.article(source, guid),
      images: (source, guid) => store.images(source, guid),
    }

    await expect(run({ store: refusing })).rejects.toThrow('D1 refused the write')

    expect(await store.lastRun()).toMatchObject({
      outcome: 'failed',
      failure: 'D1 refused the write: no such table',
      admitted: 0,
    })
  })
})

/** The guid of the one item a Source's Feed carries beneath a path. */
function guidBeneath(source: SourceId, path: string): string {
  const found = parseFeed(readFeedFixture(source), source).filter((item) =>
    new URL(item.url).pathname.startsWith(path),
  )
  if (found.length !== 1) {
    throw new Error(`Expected one ${source} item beneath ${path}, found ${found.length}`)
  }
  return found[0]!.guid
}
