import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { expire, horizonAt, RETENTION_DAYS } from '../../../src/expiry/expire.ts'
import { D1ExpiryStore, SqliteExpiryStore, type ExpiryStore } from '../../../src/expiry/store.ts'
import { D1ArticleStore, D1HttpDatabase } from '../../../src/ingest/store/d1.ts'
import { SqliteArticleStore } from '../../../src/ingest/store/sqlite.ts'
import type { ArticleStore } from '../../../src/ingest/store/store.ts'
import type { Article, ArticleImage } from '../../../src/shared/article.ts'
import { TEST_CREDENTIALS, fakeD1 } from '../../support/d1.ts'
import { setReadingState } from '../../support/ingest.ts'

/**
 * Expiry is the one thing in this system that cannot be undone, so it is held
 * to both real store implementations — D1 over HTTP as the daily workflow runs
 * it, and the local SQLite file — against the same migration SQL, exactly as
 * the Article store is. A delete predicate that is wrong in production and
 * right in a fake is the worst bug this repository could ship.
 *
 * The three cases the horizon is made of are here: a day inside it, a day
 * outside it, and a Saved Article far outside it, which never goes at all.
 */

/** The run's clock. Every instant below is placed relative to this one. */
const NOW = new Date('2026-08-09T06:00:00.000Z')

/** Thirty days before NOW: 2026-07-10T06:00:00.000Z. */
const HORIZON = horizonAt(NOW)

const ARTICLE: Article = {
  source: 'cyclingnews',
  guid: 'Djx8QZAfLkekqGKNHgJzwj',
  url: 'https://www.cyclingnews.com/pro-cycling/racing/an-article/',
  headline: 'An Article',
  teaser: 'A teaser',
  author: 'A Journalist',
  section: 'racing',
  publishedAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  bodyHtml: '<p>A body.</p>',
  extractionMethod: 'targeted',
  textLength: 7,
  heroImageUrl: 'https://cdn.mos.cms.futurecdn.net/hero.jpg',
  heroImageAlt: 'A hero image',
  firstSeenAt: NOW.toISOString(),
}

const IMAGE: ArticleImage = {
  position: 0,
  url: 'https://cdn.mos.cms.futurecdn.net/one.jpg',
  alt: 'A photograph',
  caption: 'A caption',
}

/** Days before the run's clock, as an Article's publication instant. */
function daysOld(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

const INSIDE = daysOld(RETENTION_DAYS - 1)
const OUTSIDE = daysOld(RETENTION_DAYS + 1)
const LONG_OUTSIDE = daysOld(220)

/** Each implementation, opened the way the code that owns it opens it. */
interface Implementation {
  readonly articles: ArticleStore
  readonly expiry: ExpiryStore
  /** Saving is the Worker's to write, so it is written here as the Worker
   * writes it rather than through an ingest store that has no business
   * doing so. */
  readonly save: (guid: string, savedAt: string | null) => Promise<void>
  readonly close: () => void
}

const IMPLEMENTATIONS: readonly {
  readonly name: string
  readonly open: () => Implementation
}[] = [
  {
    name: 'the local SQLite store',
    open: () => {
      const directory = mkdtempSync(join(tmpdir(), 'cycling-reader-expiry-'))
      const path = join(directory, 'reader.db')
      const articles = SqliteArticleStore.open(path)
      const expiry = SqliteExpiryStore.open(path)

      return {
        articles,
        expiry,
        save: async (guid, savedAt) => {
          setReadingState(path, { source: 'cyclingnews', guid }, { readAt: null, savedAt })
        },
        close: () => {
          articles.close()
          expiry.close()
          rmSync(directory, { recursive: true, force: true })
        },
      }
    },
  },
  {
    name: 'the D1 store',
    open: () => {
      const d1 = fakeD1()
      const database = new D1HttpDatabase(TEST_CREDENTIALS, d1.fetch)

      return {
        articles: new D1ArticleStore(database),
        expiry: new D1ExpiryStore(database),
        save: async (guid, savedAt) => {
          await database.batch([
            {
              sql: 'UPDATE articles SET saved_at = ? WHERE source = ? AND guid = ?',
              params: [savedAt, 'cyclingnews', guid],
            },
          ])
        },
        close: () => d1.close(),
      }
    },
  },
]

describe.each(IMPLEMENTATIONS)('Expiry against $name', ({ open }) => {
  let implementation: Implementation

  beforeEach(() => {
    implementation = open()
  })

  afterEach(() => {
    implementation.close()
  })

  /** An Article published then, with one image inside it. */
  async function publish(guid: string, publishedAt: string): Promise<void> {
    await implementation.articles.addArticle({ ...ARTICLE, guid, publishedAt }, [IMAGE])
  }

  function held(guid: string): Promise<unknown> {
    return implementation.articles.article('cyclingnews', guid)
  }

  function run(): Promise<{ readonly deleted: number; readonly horizon: string }> {
    return expire({ store: implementation.expiry, now: () => NOW })
  }

  it('measures the horizon at thirty days before the run', async () => {
    expect((await run()).horizon).toBe(HORIZON)
    expect(HORIZON).toBe('2026-07-10T06:00:00.000Z')
  })

  it('keeps a Stream Article a day inside the horizon', async () => {
    await publish('inside', INSIDE)

    expect((await run()).deleted).toBe(0)
    expect(await held('inside')).not.toBeNull()
  })

  it('deletes a Stream Article a day outside the horizon', async () => {
    await publish('outside', OUTSIDE)

    expect((await run()).deleted).toBe(1)
    expect(await held('outside')).toBeNull()
  })

  it('never deletes a Saved Article, however far outside the horizon', async () => {
    await publish('saved', LONG_OUTSIDE)
    await implementation.save('saved', '2026-02-01T09:00:00.000Z')

    expect((await run()).deleted).toBe(0)
    expect(await held('saved')).not.toBeNull()
    expect(await implementation.articles.images('cyclingnews', 'saved')).toHaveLength(1)
  })

  it('deletes an un-Saved Article past the horizon on the next run', async () => {
    await publish('returned', LONG_OUTSIDE)
    await implementation.save('returned', '2026-02-01T09:00:00.000Z')
    await run()

    // Un-Saved: back to the Stream, and back to Expiry.
    await implementation.save('returned', null)

    expect((await run()).deleted).toBe(1)
    expect(await held('returned')).toBeNull()
  })

  it('removes the image records of the Articles it deletes, and only those', async () => {
    await publish('outside', OUTSIDE)
    await publish('inside', INSIDE)

    await run()

    expect(await implementation.articles.images('cyclingnews', 'outside')).toEqual([])
    expect(await implementation.articles.images('cyclingnews', 'inside')).toHaveLength(1)
  })

  it('answers with how many Articles it deleted, so an anomaly is visible', async () => {
    await publish('one', OUTSIDE)
    await publish('two', LONG_OUTSIDE)
    await publish('three', INSIDE)

    const first = await run()
    expect(first.deleted).toBe(2)

    // Nothing is left behind the horizon, so a second run deletes nothing —
    // the count is of Articles that went, not of Articles it looked at.
    expect((await run()).deleted).toBe(0)
  })
})

describe('the retention horizon', () => {
  it('is thirty days, to the instant', () => {
    expect(horizonAt(new Date('2026-08-09T06:00:00.000Z'))).toBe('2026-07-10T06:00:00.000Z')
  })

  it('takes an override, which only a test uses', () => {
    expect(horizonAt(new Date('2026-08-09T06:00:00.000Z'), 1)).toBe('2026-08-08T06:00:00.000Z')
  })
})
