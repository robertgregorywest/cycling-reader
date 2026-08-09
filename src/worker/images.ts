/**
 * Images, at the size the screen actually needs.
 *
 * Both Sources run the same Future PLC platform and serve their photography
 * from one CDN, which exposes arbitrary sizes through a filename convention:
 * `…/2topYbW6G5ADgqfFFwzeLW-1280-80.jpg` is that image at 1280 pixels wide and
 * quality 80, and `…/2topYbW6G5ADgqfFFwzeLW.jpg` is the original. Requesting a
 * width means rewriting the name.
 *
 * Canonical URLs are stored unrewritten, so this happens at render time: the
 * stored URL stays the one Mirroring will fetch, and the same Article serves
 * different bytes to a phone and to a laptop.
 */

const CDN_HOST = 'cdn.mos.cms.futurecdn.net'

/** `-<width>-<quality>` before the extension, which the convention allows to
 * be absent. */
const SIZED = /^(?<name>.+?)(?:-\d+-\d+)?(?<extension>\.[a-z]+)$/i

/** What the CDN is asked for. Higher gains little at these sizes and costs
 * bytes on a phone, which is the connection that matters. */
const QUALITY = 80

/**
 * The same image at a given width.
 *
 * A URL from anywhere else is returned untouched: a Mirrored image is served
 * from the reader's own storage at whatever size it was Mirrored, and a Source
 * that moves its photography elsewhere should degrade to full-size images
 * rather than to broken ones.
 */
export function atWidth(url: string, width: number): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }

  if (parsed.hostname !== CDN_HOST) return url

  const groups = SIZED.exec(parsed.pathname)?.groups
  if (groups === undefined) return url

  parsed.pathname = `${groups['name']}-${width}-${QUALITY}${groups['extension']}`
  return parsed.toString()
}

/**
 * `src` and `srcset` for an image displayed at `width` CSS pixels, offering
 * the CDN's own resize to a screen with more device pixels than that.
 *
 * Two candidates rather than a full set: the index thumbnail has one display
 * size, so the only question a browser has to answer is how dense its screen
 * is.
 */
export function candidates(url: string, width: number): { src: string; srcSet: string } {
  return {
    src: atWidth(url, width),
    srcSet: `${atWidth(url, width)} 1x, ${atWidth(url, width * 2)} 2x`,
  }
}

/**
 * The widths an image in the article view is offered at.
 *
 * The reading column is 34rem — around 640 CSS pixels at a browser's default —
 * so 640 covers a laptop, 1280 covers it at twice the pixel density, and 420
 * is the phone, which is the connection that matters.
 */
const READING_WIDTHS: readonly number[] = [420, 640, 1280]

/**
 * What the browser is told the image will occupy, so that it can choose a
 * candidate before the stylesheet has arrived. The column is capped at the
 * measure, and is the width of the viewport below that, less the shell's
 * padding.
 */
export const READING_SIZES = '(min-width: 40rem) 34rem, calc(100vw - 2rem)'

/**
 * A full set of width candidates for photography shown at reading size, where
 * unlike the index thumbnail the display width is not one number: it is the
 * viewport until it is the measure.
 */
export function readingSrcSet(url: string): string {
  return READING_WIDTHS.map((width) => `${atWidth(url, width)} ${width}w`).join(', ')
}

/** The candidate a browser without `srcset` support gets, and the one the
 * chooser starts from: the reading column at one device pixel per CSS pixel. */
export function readingSrc(url: string): string {
  return atWidth(url, READING_WIDTHS[1] as number)
}
