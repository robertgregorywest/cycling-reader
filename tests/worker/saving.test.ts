import { beforeEach, describe, expect, it } from 'vitest'
import { mirrorKey, mirrorPath } from '../../src/worker/mirror.ts'
import { articlePath } from '../../src/worker/views/article.tsx'
import { savePath } from '../../src/worker/views/save.tsx'
import { anArticle, seed, seedWithImages } from './support/articles.ts'
import {
  bodyFor,
  fetched,
  mirrored,
  mirroredBody,
  sourceCdn,
  sourceCdnGone,
} from './support/cdn.ts'
import { readerAs, signIn } from './support/reader.ts'
import { heroMirrorKey, imageMirrorKeys, savedAt } from './support/state.ts'

/**
 * Saving: the promotion from Stream to Archive.
 *
 * Saving is the only act that exempts an Article from Expiry, and the only
 * thing that triggers Mirroring — which happens here and now, synchronously,
 * because a nightly job would leave a window in which a Saved Article could
 * lose its images to a CDN purge (ADR-0005). So what is asserted here is mostly
 * one thing said several ways: an Article is never recorded Saved until every
 * one of its images is in the bucket.
 */

const HERO = 'https://cdn.mos.cms.futurecdn.net/2topYbW6G5ADgqfFFwzeLW-1280-80.jpg'
const FIRST = 'https://cdn.mos.cms.futurecdn.net/aaaaaaaaaaaaaaaaaaaaaa.jpg'
const SECOND = 'https://cdn.mos.cms.futurecdn.net/bbbbbbbbbbbbbbbbbbbbbb.jpg'

let cookie: string

beforeEach(async () => {
  cookie = await signIn()
  sourceCdn()
})

/** Saving as the reader does it: the form, on the index or on the Article. */
async function press(
  article: { source: string; guid: string },
  saved: 'yes' | 'no' = 'yes',
  from = '/',
): Promise<Response> {
  return readerAs(cookie, savePath(article), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ saved, return: from }).toString(),
  })
}

describe('Saving an Article', () => {
  it('is reachable from the index', async () => {
    const article = anArticle()
    await seed(article)

    const body = await (await readerAs(cookie, '/')).text()

    expect(body).toContain(`action="${savePath(article)}"`)
  })

  it('is reachable from the article view', async () => {
    const article = anArticle()
    await seed(article)

    const body = await (await readerAs(cookie, articlePath(article))).text()

    expect(body).toContain(`action="${savePath(article)}"`)
  })

  it('records the moment it was Saved', async () => {
    const article = anArticle()
    await seed(article)

    await press(article)

    expect(await savedAt(article.source, article.guid)).not.toBeNull()
  })

  it('returns the reader to where they pressed it, filter and all', async () => {
    const article = anArticle()
    await seed(article)

    const response = await press(article, 'yes', '/?section=tech')

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/?section=tech')
  })

  it('goes to the index rather than anywhere a form field asks for', async () => {
    const article = anArticle()
    await seed(article)

    const response = await press(article, 'yes', 'https://elsewhere.example/')

    expect(response.headers.get('location')).toBe('/')
  })

  it('is a 404 for an Article that Expired while its link sat in another tab', async () => {
    const response = await press({ source: 'cyclingnews', guid: 'never-existed' })

    expect(response.status).toBe(404)
  })
})

describe('Mirroring, at the moment of Saving', () => {
  it('copies every image in the Article into the bucket before reporting success', async () => {
    const article = await seedWithImages(anArticle({ heroImageUrl: HERO }), FIRST, SECOND)

    const response = await press(article)

    expect(response.status).toBe(303)
    expect(await mirrored()).toHaveLength(3)
  })

  it('copies the hero image, which no Article body holds', async () => {
    const article = anArticle({ heroImageUrl: HERO })
    await seed(article)

    await press(article)

    expect(await mirrored()).toEqual([await mirrorKey(HERO)])
  })

  it('records a Mirror key against each of the Article images', async () => {
    const article = await seedWithImages(anArticle({ heroImageUrl: HERO }), FIRST, SECOND)

    await press(article)

    expect(await heroMirrorKey(article.source, article.guid)).toBe(await mirrorKey(HERO))
    expect(await imageMirrorKeys(article.source, article.guid)).toEqual([
      await mirrorKey(FIRST),
      await mirrorKey(SECOND),
    ])
  })

  it('puts the Source’s own bytes under the key', async () => {
    const article = anArticle({ heroImageUrl: HERO })
    await seed(article)

    await press(article)

    expect(await mirroredBody(await mirrorKey(HERO))).toBe(bodyFor(HERO))
  })

  it('asks the CDN for the reading width rather than for the original', async () => {
    const article = anArticle({ heroImageUrl: HERO })
    await seed(article)

    await press(article)

    expect(fetched).toEqual([
      'https://cdn.mos.cms.futurecdn.net/2topYbW6G5ADgqfFFwzeLW-1280-80.jpg',
    ])
  })

  it('Mirrors an Article with no images at all without complaint', async () => {
    const article = anArticle({ heroImageUrl: null })
    await seed(article)

    const response = await press(article)

    expect(response.status).toBe(303)
    expect(await savedAt(article.source, article.guid)).not.toBeNull()
    expect(await mirrored()).toEqual([])
  })
})

describe('Saving twice', () => {
  it('stores no second copy of anything', async () => {
    const article = await seedWithImages(anArticle({ heroImageUrl: HERO }), FIRST)
    await press(article)

    await press(article)

    expect(await mirrored()).toHaveLength(2)
  })

  it('copies nothing the second time', async () => {
    const article = await seedWithImages(anArticle({ heroImageUrl: HERO }), FIRST)
    await press(article)

    sourceCdn()
    await press(article)

    expect(fetched).toEqual([])
  })

  it('leaves the same keys recorded', async () => {
    const article = await seedWithImages(anArticle({ heroImageUrl: HERO }), FIRST)
    await press(article)
    const first = await imageMirrorKeys(article.source, article.guid)

    await press(article)

    expect(await imageMirrorKeys(article.source, article.guid)).toEqual(first)
  })

  it('copies a photograph carried twice within one Article only once', async () => {
    const article = await seedWithImages(anArticle({ heroImageUrl: HERO }), FIRST, FIRST)

    await press(article)

    expect(fetched).toHaveLength(2)
    expect(await mirrored()).toHaveLength(2)
  })

  it('shares one object between two Articles carrying the same photograph', async () => {
    const one = await seedWithImages(anArticle({ guid: 'one', heroImageUrl: HERO }), FIRST)
    const two = await seedWithImages(anArticle({ guid: 'two', heroImageUrl: HERO }), FIRST)

    await press(one)
    await press(two)

    expect(await mirrored()).toHaveLength(2)
    expect(await imageMirrorKeys('cyclingnews', 'two')).toEqual([await mirrorKey(FIRST)])
  })
})

describe('Saving that cannot Mirror', () => {
  beforeEach(() => {
    sourceCdnGone()
  })

  it('does not Save the Article', async () => {
    const article = anArticle({ heroImageUrl: HERO })
    await seed(article)

    await press(article)

    expect(await savedAt(article.source, article.guid)).toBeNull()
  })

  it('says so rather than redirecting to a star that quietly failed to light', async () => {
    const article = anArticle({ heroImageUrl: HERO })
    await seed(article)

    const response = await press(article)

    expect(response.status).toBe(502)
    expect(await response.text()).toContain('Saving failed')
  })

  it('records no Mirror key for the images it could not copy', async () => {
    const article = await seedWithImages(anArticle({ heroImageUrl: HERO }), FIRST)

    await press(article)

    expect(await heroMirrorKey(article.source, article.guid)).toBeNull()
    expect(await imageMirrorKeys(article.source, article.guid)).toEqual([null])
  })
})

describe('un-Saving', () => {
  it('returns the Article to the Stream, and so to Expiry', async () => {
    const article = anArticle({ heroImageUrl: HERO })
    await seed(article)
    await press(article)

    await press(article, 'no')

    expect(await savedAt(article.source, article.guid)).toBeNull()
  })

  it('reaches the Source for nothing: there is nothing to copy in letting go', async () => {
    const article = anArticle({ heroImageUrl: HERO })
    await seed(article)
    await press(article)

    sourceCdn()
    await press(article, 'no')

    expect(fetched).toEqual([])
  })

  it('keeps the Mirrored copy, so that changing one’s mind back is free', async () => {
    const article = await seedWithImages(anArticle({ heroImageUrl: HERO }), FIRST)
    await press(article)

    await press(article, 'no')

    expect(await mirrored()).toHaveLength(2)
    expect(await imageMirrorKeys(article.source, article.guid)).toEqual([await mirrorKey(FIRST)])
  })

  it('is idempotent: asking for the Stream twice leaves it in the Stream', async () => {
    const article = anArticle()
    await seed(article)

    await press(article, 'no')
    const response = await press(article, 'no')

    expect(response.status).toBe(303)
    expect(await savedAt(article.source, article.guid)).toBeNull()
  })
})

describe('a Mirrored image', () => {
  it('is served from the reader’s own storage', async () => {
    const article = anArticle({ heroImageUrl: HERO })
    await seed(article)
    await press(article)

    const response = await readerAs(cookie, mirrorPath(await mirrorKey(HERO)))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(await response.text()).toBe(bodyFor(HERO))
  })

  it('is behind the passphrase, like everything else', async () => {
    const article = anArticle({ heroImageUrl: HERO })
    await seed(article)
    await press(article)

    const response = await readerAs('', mirrorPath(await mirrorKey(HERO)))

    expect(response.status).toBe(302)
  })

  it('is a 404 for a key nothing was Mirrored under', async () => {
    const response = await readerAs(cookie, mirrorPath(`${'0'.repeat(64)}.jpg`))

    expect(response.status).toBe(404)
  })

  it('is a 404 for anything that is not a key Mirroring would have written', async () => {
    const response = await readerAs(cookie, mirrorPath('..%2Fsecret'))

    expect(response.status).toBe(404)
  })
})
