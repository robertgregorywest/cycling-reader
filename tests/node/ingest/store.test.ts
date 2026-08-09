import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { D1ArticleStore, D1HttpDatabase } from '../../../src/ingest/store/d1.ts'
import { SqliteArticleStore } from '../../../src/ingest/store/sqlite.ts'
import type { ArticleStore } from '../../../src/ingest/store/store.ts'
import type { Article } from '../../../src/shared/article.ts'
import { TEST_CREDENTIALS, fakeD1, type FakeD1 } from '../../support/d1.ts'

/**
 * The Article store has two real implementations rather than one plus a fake:
 * D1 over HTTP in production, and a local SQLite file in tests and for manual
 * inspection. A hand-written fake would let the suite pass while the
 * production SQL was wrong, which is the most likely serious bug in the
 * system, so both are held to the same behaviour here — against the same
 * migration SQL, running the same statements.
 *
 * These tests are about the schema's own promises: the ones an Ingest Run
 * relies on and cannot check for itself.
 */

const ARTICLE: Article = {
  source: 'cyclingnews',
  guid: 'Djx8QZAfLkekqGKNHgJzwj',
  url: 'https://www.cyclingnews.com/pro-cycling/racing/an-article/',
  headline: 'An Article',
  teaser: 'A teaser',
  author: 'A Journalist',
  section: 'racing',
  publishedAt: '2026-08-08T14:41:47.000Z',
  updatedAt: '2026-08-08T14:50:46.000Z',
  bodyHtml: '<p>A body.</p>',
  extractionMethod: 'targeted',
  textLength: 7,
  heroImageUrl: 'https://cdn.mos.cms.futurecdn.net/hero.jpg',
  heroImageAlt: 'A hero image',
  firstSeenAt: '2026-08-09T06:00:00.000Z',
}

const REVISED: Article = {
  ...ARTICLE,
  headline: 'An Article, with the results',
  teaser: 'A fuller teaser',
  updatedAt: '2026-08-09T09:30:00.000Z',
  bodyHtml: '<p>A body.</p><table><tr><td>1</td></tr></table>',
  textLength: 8,
}

/** Each implementation, opened the way the code that owns it opens it. */
const IMPLEMENTATIONS: readonly {
  readonly name: string
  readonly open: () => { readonly store: ArticleStore; readonly close: () => void }
}[] = [
  {
    name: 'the local SQLite store',
    open: () => {
      const store = SqliteArticleStore.open(':memory:')
      return { store, close: () => store.close() }
    },
  },
  {
    name: 'the D1 store',
    open: () => {
      const d1 = fakeD1()
      const store = new D1ArticleStore(new D1HttpDatabase(TEST_CREDENTIALS, d1.fetch))
      return { store, close: () => d1.close() }
    },
  },
]

describe.each(IMPLEMENTATIONS)('$name', ({ open }) => {
  let store: ArticleStore
  let close: () => void

  beforeEach(() => {
    ;({ store, close } = open())
  })

  afterEach(() => {
    close()
  })

  describe('an Article it holds', () => {
    it('comes back as it was written', async () => {
      await store.addArticle(ARTICLE, [])

      expect(await store.article('cyclingnews', ARTICLE.guid)).toEqual({
        ...ARTICLE,
        readAt: null,
        savedAt: null,
      })
    })

    it('is identified by its Source as well as its guid', async () => {
      await store.addArticle(ARTICLE, [])

      expect(await store.article('cyclingweekly', ARTICLE.guid)).toBeNull()
      expect(await store.knownRevisions('cyclingweekly', [ARTICLE.guid])).toEqual(new Map())
      expect(await store.knownRevisions('cyclingnews', [ARTICLE.guid])).toEqual(
        new Map([[ARTICLE.guid, ARTICLE.updatedAt]]),
      )
    })

    it('cannot be written twice under the same key', async () => {
      await store.addArticle(ARTICLE, [])

      await expect(store.addArticle(ARTICLE, [])).rejects.toThrow(/UNIQUE|PRIMARY/i)
    })
  })

  describe('the schema an Ingest Run writes through', () => {
    it('refuses an Article with no publication timestamp, which Expiry depends on', async () => {
      await expect(
        store.addArticle({ ...ARTICLE, publishedAt: null as unknown as string }, []),
      ).rejects.toThrow(/NOT NULL/i)
    })

    it("refuses a Section outside the reader's vocabulary", async () => {
      await expect(
        store.addArticle({ ...ARTICLE, section: 'Racing' as Article['section'] }, []),
      ).rejects.toThrow(/CHECK/i)
    })

    it('refuses an Extraction method it does not know', async () => {
      await expect(
        store.addArticle(
          { ...ARTICLE, extractionMethod: 'guesswork' as Article['extractionMethod'] },
          [],
        ),
      ).rejects.toThrow(/CHECK/i)
    })

    it('writes an Article and its images as one, or neither', async () => {
      await expect(
        store.addArticle(ARTICLE, [
          {
            position: 0,
            url: 'https://cdn.mos.cms.futurecdn.net/one.jpg',
            alt: null,
            caption: null,
          },
          {
            position: 0,
            url: 'https://cdn.mos.cms.futurecdn.net/two.jpg',
            alt: null,
            caption: null,
          },
        ]),
      ).rejects.toThrow()

      expect(await store.article('cyclingnews', ARTICLE.guid)).toBeNull()
    })

    it('keeps images in the order they are read', async () => {
      await store.addArticle(ARTICLE, [
        {
          position: 1,
          url: 'https://cdn.mos.cms.futurecdn.net/two.jpg',
          alt: 'Two',
          caption: null,
        },
        {
          position: 0,
          url: 'https://cdn.mos.cms.futurecdn.net/one.jpg',
          alt: 'One',
          caption: 'A caption',
        },
      ])

      expect(await store.images('cyclingnews', ARTICLE.guid)).toEqual([
        {
          position: 0,
          url: 'https://cdn.mos.cms.futurecdn.net/one.jpg',
          alt: 'One',
          caption: 'A caption',
          mirrorKey: null,
        },
        {
          position: 1,
          url: 'https://cdn.mos.cms.futurecdn.net/two.jpg',
          alt: 'Two',
          caption: null,
          mirrorKey: null,
        },
      ])
    })
  })

  describe('an Article it revises', () => {
    it('carries what the Source changed, including its Revision timestamp', async () => {
      await store.addArticle(ARTICLE, [])
      await store.reviseArticle(REVISED, [])

      const article = await store.article('cyclingnews', ARTICLE.guid)
      expect(article?.headline).toBe(REVISED.headline)
      expect(article?.teaser).toBe(REVISED.teaser)
      expect(article?.bodyHtml).toBe(REVISED.bodyHtml)
      expect(article?.textLength).toBe(REVISED.textLength)
      expect(article?.updatedAt).toBe(REVISED.updatedAt)
    })

    it('keeps the place in publication order it was admitted at', async () => {
      await store.addArticle(ARTICLE, [])
      await store.reviseArticle({ ...REVISED, publishedAt: '2026-08-09T09:30:00.000Z' }, [])

      const article = await store.article('cyclingnews', ARTICLE.guid)
      expect(article?.publishedAt).toBe(ARTICLE.publishedAt)
      expect(article?.firstSeenAt).toBe(ARTICLE.firstSeenAt)
    })

    it('holds the images of the body it now has, not of the body it had', async () => {
      await store.addArticle(ARTICLE, [
        {
          position: 0,
          url: 'https://cdn.mos.cms.futurecdn.net/one.jpg',
          alt: 'One',
          caption: null,
        },
        {
          position: 1,
          url: 'https://cdn.mos.cms.futurecdn.net/two.jpg',
          alt: 'Two',
          caption: null,
        },
      ])
      await store.reviseArticle(REVISED, [
        {
          position: 0,
          url: 'https://cdn.mos.cms.futurecdn.net/three.jpg',
          alt: 'Three',
          caption: null,
        },
      ])

      expect((await store.images('cyclingnews', ARTICLE.guid)).map((image) => image.url)).toEqual([
        'https://cdn.mos.cms.futurecdn.net/three.jpg',
      ])
    })

    it('refuses to revise an Article it does not hold', async () => {
      await expect(store.reviseArticle(REVISED, [])).rejects.toThrow(/No Article to revise/)
    })
  })
})

describe('a database file the SQLite store opens', () => {
  let directory: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'cycling-reader-'))
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it('keeps what an earlier Run wrote, and applies each migration once', async () => {
    const path = join(directory, 'reader.db')

    const first = SqliteArticleStore.open(path)
    await first.addArticle(ARTICLE, [])
    first.close()

    const second = SqliteArticleStore.open(path)
    try {
      expect(await second.knownRevisions('cyclingnews', [ARTICLE.guid])).toEqual(
        new Map([[ARTICLE.guid, ARTICLE.updatedAt]]),
      )
    } finally {
      second.close()
    }
  })
})

describe('the D1 store over HTTP', () => {
  let d1: FakeD1
  let store: D1ArticleStore

  beforeEach(() => {
    d1 = fakeD1()
    store = new D1ArticleStore(new D1HttpDatabase(TEST_CREDENTIALS, d1.fetch))
  })

  afterEach(() => {
    d1.close()
  })

  const IMAGES = [
    { position: 0, url: 'https://cdn.mos.cms.futurecdn.net/one.jpg', alt: 'One', caption: null },
    { position: 1, url: 'https://cdn.mos.cms.futurecdn.net/two.jpg', alt: 'Two', caption: null },
  ]

  it('writes an Article and every image within it in one request', async () => {
    await store.addArticle(ARTICLE, IMAGES)

    expect(d1.requests).toHaveLength(1)
    expect(d1.requests[0]?.batch.map(({ sql }) => sql.split(' ').slice(0, 3).join(' '))).toEqual([
      'INSERT INTO articles',
      'INSERT INTO article_images',
      'INSERT INTO article_images',
    ])
  })

  it('asks one question of a whole Feed', async () => {
    await store.knownRevisions('cyclingnews', ['one', 'two', 'three'])

    expect(d1.requests).toHaveLength(1)
    expect(d1.requests[0]?.batch).toHaveLength(1)
    expect(d1.requests[0]?.batch[0]?.params).toEqual(['cyclingnews', 'one', 'two', 'three'])
  })

  it("stays inside D1's ceiling of a hundred values per statement, for a whole Feed at once", async () => {
    // A Feed carries fifty items, and every one of them may be admissible.
    const guids = Array.from({ length: 50 }, (_, index) => `guid-${index}`)

    await expect(store.knownRevisions('cyclingnews', guids)).resolves.toEqual(new Map())
  })

  it('writes an Article whose photography would overrun a single bound statement', async () => {
    const images = Array.from({ length: 40 }, (_, position) => ({
      position,
      url: `https://cdn.mos.cms.futurecdn.net/${position}.jpg`,
      alt: null,
      caption: null,
    }))

    await store.addArticle(ARTICLE, images)

    expect(await store.images('cyclingnews', ARTICLE.guid)).toHaveLength(images.length)
  })

  it('costs nothing when a Feed offers nothing', async () => {
    expect(await store.knownRevisions('cyclingnews', [])).toEqual(new Map())
    expect(d1.requests).toHaveLength(0)
  })

  it('says so in D1s own words when D1 refuses a write', async () => {
    await store.addArticle(ARTICLE, [])

    await expect(store.addArticle(ARTICLE, [])).rejects.toThrow(
      /D1 refused the write:.*(UNIQUE|PRIMARY)/i,
    )
  })

  it('fails loudly rather than silently when the credentials are wrong', async () => {
    const wrong = new D1ArticleStore(
      new D1HttpDatabase({ ...TEST_CREDENTIALS, apiToken: 'not-the-token' }, d1.fetch),
    )

    await expect(wrong.addArticle(ARTICLE, [])).rejects.toThrow(
      /D1 refused the write: Authentication error/,
    )
  })

  it('reads its credentials from the environment, and complains by name for a missing one', () => {
    expect(() =>
      D1HttpDatabase.fromEnvironment({
        CLOUDFLARE_ACCOUNT_ID: 'an-account',
        D1_DATABASE_ID: 'a-database',
      }),
    ).toThrow(/CLOUDFLARE_API_TOKEN is not set/)
  })
})
