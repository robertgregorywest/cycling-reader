import { beforeEach, describe, expect, it } from 'vitest'
import { STYLESHEET_PATH } from '../../src/worker/styles.ts'
import { anArticle, seed } from './support/articles.ts'
import { reader, readerAs, signIn } from './support/reader.ts'

/**
 * Light and dark: the device's preference, and the reader's override of it.
 *
 * Reading in the evening is most of what this reader is for, so the appearance
 * is not an afterthought bolted on later. It is a cookie rather than something
 * a script applies after paint, which is why it can be asserted here at all:
 * the appearance a page is rendered in is in the page.
 */

let cookie: string

beforeEach(async () => {
  cookie = await signIn()
})

/** Change the appearance the way the control does, and keep what the reader is
 * left holding. */
async function choose(
  appearance: string,
  returnTo = '/',
): Promise<{ status: number; location: string | null; cookie: string }> {
  const response = await readerAs(cookie, '/appearance', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ appearance, return: returnTo }).toString(),
  })

  return {
    status: response.status,
    location: response.headers.get('location'),
    cookie: response.headers.get('set-cookie') ?? '',
  }
}

describe('the appearance', () => {
  it('follows the device until the reader says otherwise', async () => {
    const body = await (await readerAs(cookie, '/')).text()

    expect(body).toContain('data-theme="auto"')

    const stylesheet = await (await readerAs(cookie, STYLESHEET_PATH)).text()

    expect(stylesheet).toContain('@media (prefers-color-scheme: dark)')
    expect(stylesheet).toContain(':root[data-theme="auto"]')
  })

  it('is remembered for a year once chosen', async () => {
    const { cookie: set } = await choose('dark')

    expect(set).toContain('reader_appearance=dark')
    expect(set).toContain('Max-Age=31536000')
    expect(set).toContain('Path=/')
  })

  it('renders the page in what was chosen, rather than correcting it after paint', async () => {
    await choose('dark')

    const body = await (await readerAs(`${cookie}; reader_appearance=dark`, '/')).text()

    expect(body).toContain('data-theme="dark"')
    // Nothing runs a script to do this.
    expect(body).not.toContain('<script')
  })

  it('can be handed back to the device, which is a choice and not the absence of one', async () => {
    const { cookie: set } = await choose('auto')

    // Removed rather than stored: following the device is the state with no
    // cookie in it.
    expect(set).toContain('reader_appearance=')
    expect(set).toContain('Max-Age=0')
  })

  it('returns the reader to the page they were reading', async () => {
    await seed(anArticle({ guid: 'Djx8QZAfLkekqGKNHgJzwj' }))

    const { status, location } = await choose('dark', '/article/cyclingnews/Djx8QZAfLkekqGKNHgJzwj')

    expect(status).toBe(303)
    expect(location).toBe('/article/cyclingnews/Djx8QZAfLkekqGKNHgJzwj')
  })

  it.each([
    ['somewhere else entirely', 'https://example.com/phish'],
    ['a protocol-relative address', '//example.com/phish'],
  ])('will not be talked into sending the reader to %s', async (_what, returnTo) => {
    const { location } = await choose('dark', returnTo)

    expect(location).toBe('/')
  })

  it('is unmoved by a value that is not an appearance', async () => {
    const { status, cookie: set } = await choose('chartreuse')

    expect(status).toBe(303)
    expect(set).toBe('')
  })

  it('is not a way past the passphrase', async () => {
    const response = await reader('/appearance', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ appearance: 'dark', return: '/' }).toString(),
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/sign-in')
  })
})
