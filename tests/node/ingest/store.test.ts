import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteArticleStore } from '../../../src/ingest/store/sqlite.ts'
import type { Article } from '../../../src/shared/article.ts'

/**
 * The local SQLite store is a real store, not a fake: it runs the same
 * migration SQL D1 runs, so a column that is missing, misnamed or too
 * permissive in production fails here first. These tests are about the
 * schema's own promises — the ones an Ingest Run relies on and cannot check
 * for itself.
 */

let store: SqliteArticleStore

beforeEach(() => {
  store = SqliteArticleStore.open(':memory:')
})

afterEach(() => {
  store.close()
})

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

describe('an Article the store holds', () => {
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

  it('refuses a Section outside the reader\'s vocabulary', async () => {
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
        { position: 0, url: 'https://cdn.mos.cms.futurecdn.net/one.jpg', alt: null, caption: null },
        { position: 0, url: 'https://cdn.mos.cms.futurecdn.net/two.jpg', alt: null, caption: null },
      ]),
    ).rejects.toThrow()

    expect(await store.article('cyclingnews', ARTICLE.guid)).toBeNull()
  })

  it('keeps images in the order they are read', async () => {
    await store.addArticle(ARTICLE, [
      { position: 1, url: 'https://cdn.mos.cms.futurecdn.net/two.jpg', alt: 'Two', caption: null },
      { position: 0, url: 'https://cdn.mos.cms.futurecdn.net/one.jpg', alt: 'One', caption: 'A caption' },
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

describe('an Article the store revises', () => {
  const REVISED: Article = {
    ...ARTICLE,
    headline: 'An Article, with the results',
    teaser: 'A fuller teaser',
    updatedAt: '2026-08-09T09:30:00.000Z',
    bodyHtml: '<p>A body.</p><table><tr><td>1</td></tr></table>',
    textLength: 8,
  }

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
      { position: 0, url: 'https://cdn.mos.cms.futurecdn.net/one.jpg', alt: 'One', caption: null },
      { position: 1, url: 'https://cdn.mos.cms.futurecdn.net/two.jpg', alt: 'Two', caption: null },
    ])
    await store.reviseArticle(REVISED, [
      { position: 0, url: 'https://cdn.mos.cms.futurecdn.net/three.jpg', alt: 'Three', caption: null },
    ])

    expect((await store.images('cyclingnews', ARTICLE.guid)).map((image) => image.url)).toEqual([
      'https://cdn.mos.cms.futurecdn.net/three.jpg',
    ])
  })

  it('refuses to revise an Article it does not hold', async () => {
    await expect(store.reviseArticle(REVISED, [])).rejects.toThrow(/No Article to revise/)
  })
})

describe('a database file the store opens', () => {
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
