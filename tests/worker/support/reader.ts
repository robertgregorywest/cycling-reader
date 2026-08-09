import { env } from 'cloudflare:workers'
import app from '../../../src/worker/index.tsx'
import { TEST_PASSPHRASE } from './secrets.ts'

/**
 * The Worker, driven at its own seam.
 *
 * A Hono application is a fetch handler, so the highest seam the reader has
 * needs no harness beyond constructing a Request — and the binding it is given
 * is the real D1 the pool provides, not a mock.
 */

const ORIGIN = 'https://cycling-reader.test'

export async function reader(path: string, init: RequestInit = {}): Promise<Response> {
  return app.fetch(new Request(`${ORIGIN}${path}`, init), env)
}

/** As a signed-in reader: the same request, carrying a cookie the Worker
 * issued. */
export function readerAs(cookie: string, path: string, init: RequestInit = {}): Promise<Response> {
  return reader(path, { ...init, headers: { ...init.headers, cookie } })
}

/** Sign in the way a reader does — through the form — and keep the cookie. */
export async function signIn(passphrase: string = TEST_PASSPHRASE): Promise<string> {
  const response = await reader('/sign-in', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ passphrase }).toString(),
  })

  const cookie = response.headers.get('set-cookie')
  if (cookie === null) throw new Error('Signing in set no cookie')

  return cookie.split(';')[0] as string
}
