import type { Appearance } from '../appearance.ts'
import { nextAppearance } from '../appearance.ts'
import { STYLESHEET_HREF } from '../styles.ts'

/**
 * What every page is built out of: the head, and the one line of furniture
 * above the reading.
 *
 * There is deliberately very little of it. The reader is two pages, and the
 * chrome's job is to stay out of the way of both.
 */

/** Where the appearance control posts. A form rather than a script: nothing in
 * the reader runs JavaScript, and a preference is a thing the server stores. */
export const APPEARANCE_PATH = '/appearance'

export function Head({ title }: { readonly title: string }) {
  return (
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      {/* The reading is private (ADR-0002), and a `workers.dev` hostname is
          public DNS. */}
      <meta name="robots" content="noindex, nofollow" />
      <title>{title}</title>
      <link rel="stylesheet" href={STYLESHEET_HREF} />
    </head>
  )
}

/**
 * The masthead: where the reader is, and how the page looks.
 *
 * On an Article the title becomes the way back to the index, because a reader
 * finishing an Article wants the next one and the browser's own back button is
 * a gesture, not a target.
 */
export function Masthead({
  appearance,
  returnTo,
  home,
  elsewhere,
}: {
  readonly appearance: Appearance
  /** The path this page is at, so that changing the appearance returns to it. */
  readonly returnTo: string
  /**
   * The index this page is a way back to, filter and all — absent on the index
   * itself, which is already there.
   *
   * The filter travels with the reader: someone who opened an Article from
   * within Tech expects the way back to be Tech, and an index that had quietly
   * reset to everything would make them choose their Section twice.
   */
  readonly home?: string
  /**
   * The other collection, named and linked: the Archive from the Stream, the
   * Stream from the Archive.
   *
   * The Archive is a destination rather than a chip on the index, because it is
   * a different thing from the Stream and burying the durable part of the
   * collection inside the disposable part makes it the hardest thing to reach
   * (ADR-0009). A destination needs somewhere to be reached from, and there is
   * exactly one piece of furniture on every page.
   */
  readonly elsewhere?: { readonly href: string; readonly label: string }
}) {
  return (
    <header class="masthead">
      {home !== undefined ? (
        <a class="masthead__home" href={home}>
          Cycling Reader
        </a>
      ) : (
        <h1>Cycling Reader</h1>
      )}
      <div class="masthead__controls">
        {elsewhere === undefined ? null : (
          <a class="masthead__elsewhere" href={elsewhere.href}>
            {elsewhere.label}
          </a>
        )}
        <AppearanceControl appearance={appearance} returnTo={returnTo} />
      </div>
    </header>
  )
}

/** How each appearance shows itself: what it is now, not what it would become,
 * because a control that displays its own effect is a control that has to be
 * read twice. */
const GLYPH: Readonly<Record<Appearance, string>> = {
  auto: '◐',
  light: '☀',
  dark: '☾',
}

const NAME: Readonly<Record<Appearance, string>> = {
  auto: 'following the device',
  light: 'light',
  dark: 'dark',
}

/**
 * Three states in one control, cycling: follow the device, light, dark.
 *
 * `auto` is the state a reader needs to be able to get back to — pinning dark
 * in the evening should not mean waking up to it — so it is on the cycle
 * rather than being the absence of a choice.
 */
function AppearanceControl({
  appearance,
  returnTo,
}: {
  readonly appearance: Appearance
  readonly returnTo: string
}) {
  const next = nextAppearance(appearance)

  return (
    <form class="appearance" method="post" action={APPEARANCE_PATH}>
      <input type="hidden" name="appearance" value={next} />
      <input type="hidden" name="return" value={returnTo} />
      <button type="submit">
        <span aria-hidden="true">{GLYPH[appearance]}</span>
        <span class="offscreen">
          Appearance: {NAME[appearance]}. Switch to {NAME[next]}.
        </span>
      </button>
    </form>
  )
}
