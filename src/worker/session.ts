import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { verifyPassphrase } from '../shared/passphrase.ts'
import type { Env } from './env.ts'

/**
 * The session: a passphrase exchanged once for a long-lived signed cookie.
 *
 * There is no edge layer enforcing this. Cloudflare Access cannot protect a
 * `workers.dev` hostname (ADR-0003), so *everything* the Worker serves sits
 * behind `requireSession` — the index, and any static asset the reader grows
 * later. The sign-in page is the single exception, and it is deliberately
 * self-contained for that reason: it carries its own styling rather than
 * linking to a stylesheet it is not allowed to fetch.
 *
 * The cookie carries the moment of signing in and nothing else. Its value is
 * not consulted: what authenticates the reader is that the signature verifies
 * against `COOKIE_SECRET`, so a forged or edited cookie is refused whatever it
 * says. The instant is there to be read by a human debugging a session, and
 * because a cookie with an empty value is easy to mistake for no cookie.
 */

export const SIGN_IN_PATH = '/sign-in'

const COOKIE_NAME = 'reader_session'

/**
 * A year. Three devices re-entering a passphrase every few weeks is the
 * friction that would make the reader stop being used, and a longer session is
 * the deliberate trade for a single-user application guarding a reading list.
 */
const SESSION_SECONDS = 365 * 24 * 60 * 60

type ReaderContext = Context<{ Bindings: Env }>

/**
 * Refuse anything that is not the sign-in page to a reader without a valid
 * cookie.
 *
 * A redirect rather than a 401, because every route this guards is a page a
 * browser navigated to, and the reader arriving at a passphrase field is the
 * useful outcome. A stale or tampered cookie is cleared on the way past, so
 * that a reader whose signing key has been rotated is not stuck presenting a
 * cookie the Worker will never again accept.
 */
export function requireSession(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (new URL(c.req.url).pathname === SIGN_IN_PATH) return next()

    if (await signedIn(c)) return next()

    deleteCookie(c, COOKIE_NAME, { path: '/' })
    return c.redirect(SIGN_IN_PATH, 302)
  }
}

/**
 * `getSignedCookie` returns `false` for a cookie whose signature does not
 * verify and `undefined` for one that is not there. Both are the same answer
 * here, and neither is an error worth distinguishing at the form: a forged
 * cookie and no cookie both mean sign in.
 */
export async function signedIn(c: ReaderContext): Promise<boolean> {
  const cookie = await getSignedCookie(c, c.env.COOKIE_SECRET, COOKIE_NAME)

  return typeof cookie === 'string' && cookie !== ''
}

/** Whether the submitted passphrase is the one the Worker's secret was made
 * from. */
export async function correctPassphrase(c: ReaderContext, passphrase: string): Promise<boolean> {
  return verifyPassphrase(passphrase, c.env.PASSPHRASE_HASH)
}

/**
 * `Secure` and `HttpOnly` because the cookie is the whole of the reader's
 * privacy, and `SameSite=Lax` because following a link to the reader from
 * elsewhere should land on the Article rather than on the sign-in form.
 */
export async function startSession(c: ReaderContext, now: Date): Promise<void> {
  await setSignedCookie(c, COOKIE_NAME, now.toISOString(), c.env.COOKIE_SECRET, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: SESSION_SECONDS,
  })
}
