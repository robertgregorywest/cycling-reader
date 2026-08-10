import { beforeEach, describe, expect, it } from 'vitest'
import { FONTS, fontPath } from '../../src/worker/fonts/index.ts'
import type { Font } from '../../src/worker/fonts/index.ts'
import { STYLESHEET_PATH } from '../../src/worker/styles.ts'
import { anArticle, seed } from './support/articles.ts'
import { reader, readerAs, signIn } from './support/reader.ts'

/**
 * Asking for the latest.
 *
 * The reader lives on an open tab across three devices, and an Ingest Run
 * lands every two hours underneath it. The way to the latest is the masthead
 * title, which on the index is a link to the index — and which is worth
 * nothing at all unless the browser is told the page it already holds is not
 * an answer. Both halves are asserted here because either alone is a refresh
 * that does not refresh.
 */

let cookie: string

beforeEach(async () => {
  cookie = await signIn()
})

async function open(path: string): Promise<string> {
  const response = await readerAs(cookie, path)

  expect(response.status).toBe(200)
  return response.text()
}

/** Where the masthead title goes, when it goes anywhere. */
function titleLink(body: string, kind: 'refresh' | 'home'): string | null {
  const match = new RegExp(`<a class="masthead__${kind}" href="(?<href>[^"]*)"`).exec(body)

  return match?.groups?.['href']?.replaceAll('&amp;', '&') ?? null
}

describe('the title on the index', () => {
  it('is a link back to the index itself', async () => {
    await seed(anArticle())

    expect(titleLink(await open('/'), 'refresh')).toBe('/')
  })

  it('keeps the filter, so asking for the latest is not choosing a Section again', async () => {
    await seed(anArticle({ section: 'tech' }))

    const body = await open('/?section=tech&source=cyclingnews')

    expect(titleLink(body, 'refresh')).toBe('/?section=tech&source=cyclingnews')
  })

  it('is still the heading, so the page still says what it is', async () => {
    expect(await open('/')).toContain('<h1>')
  })

  it('says what pressing it does, for a reader who cannot see that it is the title', async () => {
    expect(await open('/')).toContain('reload for the latest')
  })

  it('is not the way back to somewhere else: the index is already there', async () => {
    expect(titleLink(await open('/'), 'home')).toBeNull()
  })
})

describe('the title elsewhere', () => {
  it('is the way back on an Article, and not a refresh', async () => {
    await seed(anArticle({ guid: 'an-article' }))

    const body = await open('/article/cyclingnews/an-article')

    expect(titleLink(body, 'home')).toBe('/')
    expect(titleLink(body, 'refresh')).toBeNull()
  })

  it('is the way back from the Archive, which changes only when the reader changes it', async () => {
    const body = await open('/archive')

    expect(titleLink(body, 'home')).toBe('/')
    expect(titleLink(body, 'refresh')).toBeNull()
  })
})

describe('following it', () => {
  it('is a Visit like any other opening of the index', async () => {
    await seed(anArticle())

    // The first arrival counts what has arrived since never.
    expect(await open('/')).toContain('1 new')

    // The second is measured from the first, which is a moment ago. What is
    // unread is still unread and still undimmed; the count is not the signal
    // that survives, and is not meant to be.
    expect(await open('/')).toContain('Nothing new')
  })
})

describe('what the browser is allowed to keep', () => {
  it.each([
    ['the index', '/'],
    ['the index under a filter', '/?section=racing'],
    ['an Article', '/article/cyclingnews/an-article'],
    ['the Archive', '/archive'],
  ])('nothing of %s, which is a view of state that moves underneath it', async (_what, path) => {
    await seed(anArticle({ guid: 'an-article' }))

    const response = await readerAs(cookie, path)

    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('nothing of the sign-in page either, cookie or no cookie', async () => {
    const response = await reader('/sign-in')

    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each([
    ['the stylesheet', STYLESHEET_PATH],
    ['the reading typeface', fontPath(FONTS[0] as Font)],
  ])('but all of %s, whose bytes genuinely never change', async (_what, path) => {
    const response = await readerAs(cookie, path)

    expect(response.headers.get('cache-control')).toContain('immutable')
  })
})
