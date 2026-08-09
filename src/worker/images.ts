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
