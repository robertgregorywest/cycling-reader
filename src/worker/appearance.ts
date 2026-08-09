import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Env } from './env.ts'

/**
 * Light and dark: the device's preference, and the reader's override of it.
 *
 * The override is a cookie rather than `localStorage` because the page is
 * server-rendered and nothing here runs JavaScript. A stored preference the
 * server cannot see would mean rendering the wrong appearance and correcting
 * it after paint, which is a flash of the wrong colours on every navigation —
 * on an evening's reading, the one thing a dark mode exists to avoid.
 *
 * `auto` is not the absence of a choice, it is a choice: a reader who has
 * pinned dark and wants to go back to following the device needs somewhere to
 * go back to.
 */
export type Appearance = 'auto' | 'light' | 'dark'

const COOKIE_NAME = 'reader_appearance'

/** A year, like the session: an appearance chosen once should still be there
 * next winter. */
const REMEMBER_SECONDS = 365 * 24 * 60 * 60

const APPEARANCES: readonly Appearance[] = ['auto', 'light', 'dark']

/** Not `HttpOnly`, and deliberately unsigned: this is a display preference,
 * not a credential. The worst a forged one can do is set the colours. */
export function readAppearance(c: Context<{ Bindings: Env }>): Appearance {
  const cookie = getCookie(c, COOKIE_NAME)

  return isAppearance(cookie) ? cookie : 'auto'
}

export function rememberAppearance(c: Context<{ Bindings: Env }>, appearance: Appearance): void {
  if (appearance === 'auto') {
    // Removed rather than stored, so that following the device is the state
    // with no cookie in it — which is also what a new device starts in.
    deleteCookie(c, COOKIE_NAME, { path: '/' })
    return
  }

  setCookie(c, COOKIE_NAME, appearance, {
    path: '/',
    secure: true,
    sameSite: 'Lax',
    maxAge: REMEMBER_SECONDS,
  })
}

/** The one control cycles, because two buttons for three states is a control
 * that has to be explained. */
export function nextAppearance(appearance: Appearance): Appearance {
  const at = APPEARANCES.indexOf(appearance)

  return APPEARANCES[(at + 1) % APPEARANCES.length] as Appearance
}

export function isAppearance(value: unknown): value is Appearance {
  return typeof value === 'string' && (APPEARANCES as readonly string[]).includes(value)
}
