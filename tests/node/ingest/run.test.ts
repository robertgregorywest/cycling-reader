import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { SOURCES, sourceConfig } from '../../../src/ingest/config.ts'
import { ingest, type IngestReport } from '../../../src/ingest/run.ts'
import { SqliteArticleStore } from '../../../src/ingest/store/sqlite.ts'
import type { SourceId, StoredArticle, StoredArticleImage } from '../../../src/shared/article.ts'
import { parseFeed } from '../../../src/ingest/feed.ts'
import { readFixture } from '../../fixtures/corpus.ts'
import { readFeedFixture } from '../../fixtures/feeds.ts'
import {
  fetchFeedFromCorpus,
  fetchFeedRevising,
  fetchPageFromCorpus,
  fixedClock,
  recordingPageFetcher,
  setReadingState,
} from '../../support/ingest.ts'

/**
 * The Ingest Run is the seam: one entry point, its dependencies passed in, a
 * report returned. These tests drive it with both committed Feeds and the
 * committed page corpus, and assert both the report and the rows it left
 * behind — which is the whole of admission, Extraction dispatch and storage.
 */

const RUN_AT = '2026-08-09T06:00:00.000Z'

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

describe('a first Run against both Feeds', () => {
  it('admits the Articles both Sources published', async () => {
    const report = await run()

    expect(report.admitted).toBe(7)
    expect(report.sources.map((source) => [source.source, source.feedItems, source.admitted])).toEqual([
      ['cyclingnews', 6, 4],
      ['cyclingweekly', 6, 3],
    ])
  })

  it('reports what it skipped, by reason', async () => {
    const report = await run()

    expect(report.skipped).toEqual({
      paid: 1,
      'live-blog': 1,
      'commerce-path': 3,
      'already-ingested': 0,
    })
  })

  it('reports which method produced each Extraction', async () => {
    const report = await run()

    expect(report.extractionMethods).toEqual({ targeted: 4, readability: 1, stub: 2 })
  })

  it('runs between the two instants it reports', async () => {
    const report = await run()

    expect(report.startedAt).toBe(RUN_AT)
    expect(report.finishedAt).toBe(RUN_AT)
  })
})

describe('a Run repeated immediately', () => {
  it('admits nothing, and says why', async () => {
    await run()
    const second = await run()

    expect(second.admitted).toBe(0)
    expect(second.revised).toBe(0)
    expect(second.skipped['already-ingested']).toBe(7)
    expect(second.extractionMethods).toEqual({ targeted: 0, readability: 0, stub: 0 })
  })

  it('re-fetches no Article whose timestamps have not moved', async () => {
    await run()
    const pages = recordingPageFetcher()
    await run({ fetchPage: pages.fetchPage })

    expect(pages.fetched).toEqual([])
  })
})

/**
 * Three quarters of items carry an `updated` later than their `pubDate`, so
 * this is a primary path: a race report admitted before the finish gains its
 * results table later, and the reader is owed it.
 */
describe('a Revision', () => {
  /** The race report is the Article Revisions are exercised against. */
  const RACE_REPORT = feedItem('cyclingnews', '/pro-cycling/racing/')
  /** The Stub — an item carrying no `updated`, judged by its `pubDate`. */
  const NO_UPDATED = feedItem('cyclingnews', '/pro-cycling/teams-riders/')
  const REVISED_AT = new Date('2026-08-09T09:30:00.000Z')

  /** The Feed as the Source serves it once the race report has been Revised. */
  function revisedFeed(
    guid = RACE_REPORT.guid,
    elements: readonly ('updated' | 'pubDate')[] = ['updated'],
  ) {
    return fetchFeedRevising('cyclingnews', guid, elements, REVISED_AT)
  }

  function runCyclingnews(
    overrides: Partial<Parameters<typeof ingest>[0]> = {},
  ): Promise<IngestReport> {
    return run({ sources: [sourceConfig('cyclingnews')], ...overrides })
  }

  it('re-fetches and re-Extracts the Article', async () => {
    await runCyclingnews()
    const pages = recordingPageFetcher()
    const report = await runCyclingnews({ fetchFeed: revisedFeed(), fetchPage: pages.fetchPage })

    expect(pages.fetched).toEqual([RACE_REPORT.url])
    expect(report.extractionMethods).toEqual({ targeted: 1, readability: 0, stub: 0 })
  })

  it('is reported apart from the Articles admitted', async () => {
    await runCyclingnews()
    const report = await runCyclingnews({ fetchFeed: revisedFeed() })

    expect(report.admitted).toBe(0)
    expect(report.revised).toBe(1)
    expect(report.sources.map((source) => [source.admitted, source.revised])).toEqual([[0, 1]])
    expect(report.skipped['already-ingested']).toBe(3)
  })

  it('is detected from the published timestamp when the Feed carries no updated', async () => {
    await runCyclingnews()
    const report = await runCyclingnews({ fetchFeed: revisedFeed(NO_UPDATED.guid, ['pubDate']) })

    expect(report.revised).toBe(1)
    expect((await store.article('cyclingnews', NO_UPDATED.guid))?.updatedAt).toBe(
      REVISED_AT.toISOString(),
    )
  })

  it('advances the stored Revision timestamp, so the next Run leaves it alone', async () => {
    await runCyclingnews()
    await runCyclingnews({ fetchFeed: revisedFeed() })

    expect((await store.article('cyclingnews', RACE_REPORT.guid))?.updatedAt).toBe(
      REVISED_AT.toISOString(),
    )

    const pages = recordingPageFetcher()
    const third = await runCyclingnews({ fetchFeed: revisedFeed(), fetchPage: pages.fetchPage })

    expect(pages.fetched).toEqual([])
    expect(third.revised).toBe(0)
  })

  it('does not move the Article in publication order', async () => {
    await runCyclingnews()
    const admitted = await store.article('cyclingnews', RACE_REPORT.guid)
    // The Source moved `pubDate` as well; a corrected typo is still not news.
    const report = await runCyclingnews({
      fetchFeed: revisedFeed(RACE_REPORT.guid, ['updated', 'pubDate']),
    })

    expect(report.revised).toBe(1)
    const revised = await store.article('cyclingnews', RACE_REPORT.guid)
    expect(revised?.publishedAt).toBe(admitted?.publishedAt)
    expect(revised?.firstSeenAt).toBe(admitted?.firstSeenAt)
  })

  it('replaces the images the old body held rather than adding to them', async () => {
    await runCyclingnews()
    const before = await store.images('cyclingnews', RACE_REPORT.guid)
    // The page the Revision fetches is a different one, so the images the
    // reader is now owed are different images.
    await runCyclingnews({
      fetchFeed: revisedFeed(),
      fetchPage: (url) =>
        url === RACE_REPORT.url
          ? Promise.resolve(readFixture('cyclingnews-news-item'))
          : fetchPageFromCorpus(url),
    })

    const after = await store.images('cyclingnews', RACE_REPORT.guid)
    expect(after.map((image) => image.position)).toEqual(after.map((_, index) => index))
    expect(after.map((image) => image.url)).not.toEqual(before.map((image) => image.url))
    expect(after.length).toBeLessThan(before.length)
  })

  describe('against an Article the reader has Read and Saved', () => {
    let directory: string

    beforeEach(() => {
      // The reading state lives in a file the Worker would also write to, so
      // this Run writes to a file rather than to memory.
      store.close()
      directory = mkdtempSync(join(tmpdir(), 'cycling-reader-'))
      store = SqliteArticleStore.open(join(directory, 'reader.db'))
      return () => rmSync(directory, { recursive: true, force: true })
    })

    it('leaves the reading state exactly as it was', async () => {
      await runCyclingnews()
      setReadingState(
        join(directory, 'reader.db'),
        { source: 'cyclingnews', guid: RACE_REPORT.guid },
        { readAt: '2026-08-09T07:00:00.000Z', savedAt: '2026-08-09T07:01:00.000Z' },
      )

      const report = await runCyclingnews({ fetchFeed: revisedFeed() })

      expect(report.revised).toBe(1)
      const article = await store.article('cyclingnews', RACE_REPORT.guid)
      expect(article?.readAt).toBe('2026-08-09T07:00:00.000Z')
      expect(article?.savedAt).toBe('2026-08-09T07:01:00.000Z')
      expect(article?.updatedAt).toBe(REVISED_AT.toISOString())
    })
  })
})

/** The one item a Source's Feed carries beneath a path. */
function feedItem(source: SourceId, path: string) {
  const found = parseFeed(readFeedFixture(source), source).filter((item) =>
    new URL(item.url).pathname.startsWith(path),
  )
  if (found.length !== 1) {
    throw new Error(`Expected one ${source} item beneath ${path}, found ${found.length}`)
  }
  return found[0]!
}

describe('the Section Allowlist', () => {
  it('maps each Source\'s URL paths into the shared Section vocabulary', async () => {
    await run()

    expect(await sectionOf('/pro-cycling/racing/')).toBe('racing')
    expect(await sectionOf('/pro-cycling/womens-cycling/')).toBe('womens')
    expect(await sectionOf('/pro-cycling/teams-riders/')).toBe('teams-riders')
    expect(await sectionOf('/pro-cycling/doping/')).toBe('news')
    expect(await sectionOf('cyclingweekly.com/racing/')).toBe('racing')
    expect(await sectionOf('cyclingweekly.com/news/')).toBe('news')
  })

  it('admits an Article from an unrecognised path as the other Section', async () => {
    await run()

    // Cycling Weekly's travel writing is beneath no path the Allowlist maps,
    // so it arrives as a visible bucket rather than going missing.
    expect(await sectionOf('cyclingweekly.com/travel/')).toBe('other')
  })

  it('excludes commerce paths', async () => {
    await run()

    for (const path of ['/reviews/', '/products/', '/group-tests/']) {
      expect(await articleBeneath(path)).toBeNull()
    }
  })

  it('excludes paid Articles', async () => {
    await run()

    expect(await articleBeneath('/cycling-tech-components/')).toBeNull()
  })

  it('excludes live blogs', async () => {
    await run()

    expect(await articleBeneath('/pro-cycling/live/')).toBeNull()
  })
})

describe('an admitted Article', () => {
  it('is keyed by its Source plus the Feed\'s opaque guid', async () => {
    await run()
    const article = await articleBeneath('/pro-cycling/racing/')

    expect(article?.source).toBe('cyclingnews')
    expect(article?.guid).toBe('UVteXtQVfvW2utai8CMLnJ')
    expect(await store.article('cyclingweekly', 'UVteXtQVfvW2utai8CMLnJ')).toBeNull()
  })

  it('carries the headline, teaser, author and hero image the Feed gave it', async () => {
    await run()
    const article = await articleBeneath('/pro-cycling/racing/')

    expect(article?.headline).toContain('Vuelta a Burgos')
    expect(article?.teaser).not.toBe('')
    expect(article?.author).toBe('Laura Weislo')
    expect(article?.heroImageUrl).toMatch(/^https:\/\/cdn\.mos\.cms\.futurecdn\.net\//)
  })

  it('carries the body its Extraction produced', async () => {
    await run()
    const article = await articleBeneath('/pro-cycling/racing/')

    expect(article?.extractionMethod).toBe('targeted')
    expect(article?.bodyHtml).toContain('<p>')
    expect(article?.textLength).toBeGreaterThan(1000)
  })

  it('is published at an instant, never at nothing', async () => {
    await run()

    for (const article of await allArticles()) {
      expect(article.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
    }
  })

  it('is updated at its publication when the Feed carried no updated timestamp', async () => {
    await run()
    const article = await articleBeneath('/pro-cycling/teams-riders/')

    expect(article?.updatedAt).toBe(article?.publishedAt)
  })

  it('records when the Run met it, and no reading state', async () => {
    await run()
    const article = await articleBeneath('/pro-cycling/racing/')

    expect(article?.firstSeenAt).toBe(RUN_AT)
    expect(article?.readAt).toBeNull()
    expect(article?.savedAt).toBeNull()
  })
})

describe('a failed Extraction', () => {
  it('is stored as a Stub with a link to its Source, not dropped', async () => {
    await run()
    // The Feed advertised this Article; its page has since been removed.
    const stub = await articleBeneath('/pro-cycling/teams-riders/')

    expect(stub?.extractionMethod).toBe('stub')
    expect(stub?.bodyHtml).toBe('')
    expect(stub?.textLength).toBe(0)
    expect(stub?.headline).toContain('Paris-Roubaix')
    expect(stub?.teaser).not.toBe('')
    expect(stub?.heroImageUrl).not.toBeNull()
    expect(stub?.url).toContain('https://www.cyclingnews.com/pro-cycling/teams-riders/')
  })

  it('is a Stub when the page cannot be fetched at all', async () => {
    const report = await run({
      sources: [sourceConfig('cyclingweekly')],
      fetchPage: () => Promise.reject(new Error('ETIMEDOUT')),
    })

    expect(report.admitted).toBe(3)
    expect(report.extractionMethods).toEqual({ targeted: 0, readability: 0, stub: 3 })
  })
})

describe('the images within an Article', () => {
  it('are recorded individually, in the order they are read', async () => {
    await run()
    const images = await imagesBeneath('/pro-cycling/racing/')

    expect(images.length).toBeGreaterThan(1)
    expect(images.map((image) => image.position)).toEqual(images.map((_, index) => index))
  })

  it('hold the canonical CDN URL and alt text, and no Mirror key yet', async () => {
    await run()
    const [first] = await imagesBeneath('/pro-cycling/racing/')

    expect(first?.url).toMatch(/^https:\/\/cdn\.mos\.cms\.futurecdn\.net\//)
    expect(first?.alt).toContain('Felix Gall')
    expect(first?.alt).not.toMatch(/&(#[0-9]+|[a-z]+);/i)
    expect(first?.mirrorKey).toBeNull()
  })

  it('hold the caption the Source gave the image', async () => {
    await run()
    const [first] = await imagesBeneath('/pro-cycling/racing/')

    expect(first?.caption).toBe("Felix Gall on the winner's podium (Image credit: Getty Images)")
  })

  it('records nothing for a Stub, which has no body to read images from', async () => {
    await run()
    const stub = await articleBeneath('/pro-cycling/teams-riders/')

    expect(await store.images('cyclingnews', stub?.guid ?? '')).toEqual([])
  })
})

describe('a Run against one Source', () => {
  it('reads only that Source\'s Feed', async () => {
    const report = await run({ sources: [sourceConfig('cyclingnews')] })

    expect(report.sources.map((source) => source.source)).toEqual(['cyclingnews'])
    expect(report.admitted).toBe(4)
  })
})

async function allArticles(): Promise<readonly StoredArticle[]> {
  const articles: StoredArticle[] = []
  for (const source of SOURCES) {
    for (const guid of await guidsOf(source.id)) {
      const article = await store.article(source.id, guid)
      if (article !== null) articles.push(article)
    }
  }
  return articles
}

/** Every guid the store holds for a Source, asked through the interface. */
async function guidsOf(source: SourceId): Promise<readonly string[]> {
  const guids = parseFeed(readFeedFixture(source), source).map((item) => item.guid)
  return [...(await store.knownRevisions(source, guids)).keys()]
}

async function articleBeneath(path: string): Promise<StoredArticle | null> {
  const found = (await allArticles()).filter((article) => article.url.includes(path))
  if (found.length > 1) throw new Error(`More than one Article beneath ${path}`)
  return found[0] ?? null
}

async function imagesBeneath(path: string): Promise<readonly StoredArticleImage[]> {
  const article = await articleBeneath(path)
  if (article === null) throw new Error(`No Article beneath ${path}`)
  return await store.images(article.source, article.guid)
}

async function sectionOf(path: string): Promise<string | undefined> {
  return (await articleBeneath(path))?.section
}
