import { serializeSigned } from 'hono/utils/cookie'
import { describe, expect, it } from 'vitest'
import { STYLESHEET_PATH } from '../../src/worker/styles.ts'
import { TEST_COOKIE_SECRET, TEST_PASSPHRASE } from './support/secrets.ts'
import { reader, readerAs, signIn } from './support/reader.ts'

/**
 * Access. ADR-0003 is load-bearing in a way the other decisions are not: the
 * reader stores extracted copyrighted text, which is defensible as a private
 * tool in the way Pocket is, and would not be as a public deployment. There is
 * no Cloudflare Access in front of this — it cannot protect a `workers.dev`
 * hostname — so these are the only tests standing between the two.
 */

describe('a reader who has not signed in', () => {
  it.each([
    ['the index', '/'],
    ['the stylesheet', STYLESHEET_PATH],
    ['a route that does not exist', '/nothing-here'],
    ['a path that looks like a static asset', '/fonts/source-serif.woff2'],
  ])('is sent to sign in from %s', async (_what, path) => {
    const response = await reader(path)

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/sign-in')
  })

  it('is given the sign-in page itself', async () => {
    const response = await reader('/sign-in')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('name="passphrase"')
  })

  it('is told nothing about what is behind it', async () => {
    const body = await (await reader('/sign-in')).text()

    expect(body).not.toContain('Article')
    expect(body).not.toContain('Cyclingnews')
  })
})

describe('the passphrase', () => {
  it('is exchanged for a signed cookie when it is right', async () => {
    const response = await reader('/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ passphrase: TEST_PASSPHRASE }).toString(),
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/')

    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('reader_session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    // A year, so that three devices are not re-entering it weekly.
    expect(cookie).toContain('Max-Age=31536000')
  })

  it('is exchanged for nothing when it is wrong', async () => {
    const response = await reader('/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ passphrase: 'not the passphrase' }).toString(),
    })

    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('admits a reader to the index once it has been given', async () => {
    const cookie = await signIn()

    const response = await readerAs(cookie, '/')

    expect(response.status).toBe(200)
  })
})

describe('a cookie that was not issued here', () => {
  it('is refused when its value has been edited', async () => {
    const { name, value, signature } = await parts(await signIn())

    const tampered = `${name}=${value.replace(/.$/, 'X')}.${signature}`

    expect((await readerAs(tampered, '/')).status).toBe(302)
  })

  it('is refused when its signature has been edited', async () => {
    const { name, value, signature } = await parts(await signIn())

    const tampered = `${name}=${value}.${signature.replace(/^./, 'X')}`

    expect((await readerAs(tampered, '/')).status).toBe(302)
  })

  it('is refused when it was signed with another key', async () => {
    // A forgery is exactly this: a well-formed cookie, correctly signed, by
    // someone who does not have COOKIE_SECRET.
    const forged = await serializeSigned(
      'reader_session',
      new Date().toISOString(),
      `${TEST_COOKIE_SECRET} but not quite`,
    )

    expect((await readerAs(forged.split(';')[0] as string, '/')).status).toBe(302)
  })

  it('is refused when it carries no signature at all', async () => {
    expect((await readerAs('reader_session=2026-08-09T09:00:00.000Z', '/')).status).toBe(302)
  })

  it('is cleared on the way past, so a stale one is not presented forever', async () => {
    const response = await readerAs('reader_session=nonsense.nonsense', '/')

    expect(response.headers.get('set-cookie') ?? '').toContain('Max-Age=0')
  })
})

/**
 * A signed cookie taken apart: the value, and the signature over it. Split on
 * the first `=` and the last `.`, because the signature is base64 and carries
 * both characters itself.
 */
async function parts(cookie: string): Promise<{ name: string; value: string; signature: string }> {
  const separator = cookie.indexOf('=')
  const signed = cookie.slice(separator + 1)
  const dot = signed.lastIndexOf('.')

  return {
    name: cookie.slice(0, separator),
    value: signed.slice(0, dot),
    signature: signed.slice(dot + 1),
  }
}
