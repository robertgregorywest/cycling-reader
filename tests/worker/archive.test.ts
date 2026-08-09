import { beforeEach, describe, expect, it } from 'vitest'
import { mirrorKey, mirrorPath } from '../../src/worker/mirror.ts'
import { ARCHIVE_PATH } from '../../src/worker/views/archive.tsx'
import { articlePath } from '../../src/worker/views/article.tsx'
import { savePath } from '../../src/worker/views/save.tsx'
import { aStub, anArticle, hoursAgo, seed, seedWithImages } from './support/articles.ts'
import { sourceCdn } from './support/cdn.ts'
import { readerAs, signIn } from './support/reader.ts'

/**
 * The Archive: the Articles kept on purpose, at a destination of their own.
 *
 * A destination and not a chip on the index, because the Archive is a different
 * thing from the Stream — permanent, Mirrored, and meant to outlive the Source
 * — and filing it behind a filter on the disposable collection would make the
 * durable one the hardest thing to reach (ADR-0009).
 */

const HERO = 'https://cdn.mos.cms.futurecdn.net/2topYbW6G5ADgqfFFwzeLW-1280-80.jpg'
const IN_BODY = 'https://cdn.mos.cms.futurecdn.net/aaaaaaaaaaaaaaaaaaaaaa.jpg'

let cookie: string

beforeEach(async () => {
  cookie = await signIn()
  sourceCdn()
})

async function save(article: { source: string; guid: string }): Promise<void> {
  const response = await readerAs(cookie, savePath(article), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ saved: 'yes', return: '/' }).toString(),
  })

  expect(response.status).toBe(303)
}

async function archive(): Promise<string> {
  const response = await readerAs(cookie, ARCHIVE_PATH)

  expect(response.status).toBe(200)
  return response.text()
}

describe('the Archive', () => {
  it('is reachable from the index', async () => {
    const body = await (await readerAs(cookie, '/')).text()

    expect(body).toContain(`href="${ARCHIVE_PATH}"`)
  })

  it('lists what has been Saved', async () => {
    const kept = anArticle({ guid: 'kept', headline: 'Worth keeping' })
    await seed(kept, anArticle({ guid: 'passing', headline: 'Read once and gone' }))

    await save(kept)

    const body = await archive()
    expect(body).toContain('Worth keeping')
    expect(body).not.toContain('Read once and gone')
  })

  it('says so plainly when nothing has been kept yet', async () => {
    await seed(anArticle())

    expect(await archive()).toContain('Nothing Saved yet')
  })

  it('drops an Article that has been un-Saved', async () => {
    const article = anArticle({ headline: 'Kept, then not' })
    await seed(article)
    await save(article)

    await readerAs(cookie, savePath(article), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ saved: 'no', return: '/' }).toString(),
    })

    expect(await archive()).not.toContain('Kept, then not')
  })

  it('lists newest first, as the index does', async () => {
    const older = anArticle({
      guid: 'older',
      headline: 'Published yesterday',
      publishedAt: hoursAgo(30),
    })
    const newer = anArticle({
      guid: 'newer',
      headline: 'Published this hour',
      publishedAt: hoursAgo(1),
    })
    await seed(older, newer)

    await save(older)
    await save(newer)

    const body = await archive()
    expect(body.indexOf('Published this hour')).toBeLessThan(body.indexOf('Published yesterday'))
  })

  it('keeps a Stub, whose photography is most of what it has', async () => {
    const stub = aStub({ headline: 'A Stub worth keeping', heroImageUrl: HERO })
    await seed(stub)

    await save(stub)

    expect(await archive()).toContain('A Stub worth keeping')
  })

  it('counts nothing New and reports no health: it is not triage', async () => {
    const article = anArticle()
    await seed(article)
    await save(article)

    const body = await archive()
    expect(body).not.toContain('class="new')
    expect(body).not.toContain('class="health')
  })

  it('is behind the passphrase, like everything else', async () => {
    expect((await readerAs('', ARCHIVE_PATH)).status).toBe(302)
  })
})

describe('the index, once an Article has been Saved', () => {
  it('still lists it: Saving keeps an Article, it does not hide one', async () => {
    const article = anArticle({ headline: 'Kept and still here' })
    await seed(article)

    await save(article)

    expect(await (await readerAs(cookie, '/')).text()).toContain('Kept and still here')
  })

  it('shows it as Saved, and offers the way back to the Stream', async () => {
    const article = anArticle()
    await seed(article)

    await save(article)

    const body = await (await readerAs(cookie, '/')).text()
    expect(body).toContain('save__star--on')
    expect(body).toContain('name="saved" value="no"')
  })
})

describe('a Saved Article, with its Source CDN unavailable', () => {
  it('renders its hero image from the reader’s own storage', async () => {
    const article = anArticle({ heroImageUrl: HERO })
    await seed(article)
    await save(article)

    const body = await (await readerAs(cookie, articlePath(article))).text()

    expect(body).toContain(`src="${mirrorPath(await mirrorKey(HERO))}"`)
    expect(body).not.toContain(HERO)
  })

  it('renders every image in its body from the reader’s own storage', async () => {
    const article = await seedWithImages(anArticle({ heroImageUrl: null }), IN_BODY)
    await save(article)

    const body = await (await readerAs(cookie, articlePath(article))).text()

    expect(body).toContain(`src="${mirrorPath(await mirrorKey(IN_BODY))}"`)
    expect(body).not.toContain('cdn.mos.cms.futurecdn.net')
  })

  it('offers no CDN candidates for a Mirrored image: there is one width of it', async () => {
    const article = await seedWithImages(anArticle({ heroImageUrl: null }), IN_BODY)
    await save(article)

    const body = await (await readerAs(cookie, articlePath(article))).text()

    expect(body).not.toContain('srcset')
  })

  it('keeps the alt text the Extraction took with it', async () => {
    const article = await seedWithImages(anArticle({ heroImageUrl: null }), IN_BODY)
    await save(article)

    expect(await (await readerAs(cookie, articlePath(article))).text()).toContain(
      'alt="A photograph"',
    )
  })

  it('shows its thumbnail in the Archive from storage too', async () => {
    const article = anArticle({ heroImageUrl: HERO })
    await seed(article)
    await save(article)

    const body = await archive()

    expect(body).toContain(`src="${mirrorPath(await mirrorKey(HERO))}"`)
    expect(body).not.toContain('cdn.mos.cms.futurecdn.net')
  })
})

describe('an Article still in the Stream', () => {
  it('is served its images from the Source CDN, as the Stream always is', async () => {
    const article = await seedWithImages(anArticle({ heroImageUrl: HERO }), IN_BODY)

    const body = await (await readerAs(cookie, articlePath(article))).text()

    expect(body).toContain('cdn.mos.cms.futurecdn.net')
    expect(body).not.toContain(mirrorPath(''))
  })
})
