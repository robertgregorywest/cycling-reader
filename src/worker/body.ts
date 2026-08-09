import { READING_SIZES, readingSrcSet } from './images.ts'

/**
 * The stored body, made ready to render.
 *
 * Extraction sanitises (ADR-0001), so nothing here is a security measure and
 * nothing here may become one: this adds presentation the stored HTML
 * deliberately does not carry — responsive image candidates, and a scroll
 * container around a results table — and it must leave everything else exactly
 * as ingest wrote it.
 *
 * It is string rewriting rather than parsing because the input is not
 * arbitrary HTML from the web: it is the output of this project's own cleaner,
 * where `img` carries `src` and `alt` and nothing else, and where every tag is
 * on the Tag Allowlist. A parser on the Worker's 10 ms budget would be paying
 * for generality that the boundary at ingest already removed.
 */

/** `<img src="…" alt="…">`, as the cleaner writes it: the two attributes the
 * Attribute Allowlist keeps on an image, in either order, and no others. */
const IMAGE = /<img\s+([^>]*?)\/?>/gi
const SRC = /\bsrc="([^"]*)"/i

export function presentBody(html: string): string {
  return wrapTables(responsiveImages(html))
}

/**
 * Every body image at the size the screen needs, from the Source CDN's width
 * convention — the same trade the index thumbnail makes, at the size the
 * photography deserves.
 *
 * `loading="lazy"` on every one of them, and not on the hero: a race report
 * carries a dozen images and the reader has seen none of them yet.
 */
function responsiveImages(html: string): string {
  return html.replace(IMAGE, (whole, attributes: string) => {
    const src = SRC.exec(attributes)?.[1]
    if (src === undefined || src === '') return whole

    return `<img ${attributes.trim()} srcset="${readingSrcSet(src)}" sizes="${READING_SIZES}" loading="lazy" decoding="async">`
  })
}

/**
 * A results table, in a box of its own that scrolls sideways.
 *
 * Classification tables are frequently the most valuable part of a race report
 * — they are the reason Extraction is targeted rather than heuristic — and a
 * seven-column table on a phone has only two honest outcomes: scroll the table
 * or scroll the page. Scrolling the page breaks every other line of prose on
 * it, so the table scrolls within its own container.
 *
 * The container is focusable, because a region that scrolls and cannot be
 * reached from a keyboard is a region a keyboard reader cannot read, and
 * labelled, so that landing on it announces what it is.
 */
function wrapTables(html: string): string {
  let output = ''
  let at = 0

  while (true) {
    const start = html.indexOf('<table', at)
    if (start === -1) break

    const end = closingTag(html, start)
    if (end === -1) break

    output += html.slice(at, start)
    output += `<div class="scroller" tabindex="0" role="region" aria-label="Table">${html.slice(start, end)}</div>`
    at = end
  }

  return output + html.slice(at)
}

/**
 * The index just past the `</table>` closing the table that opens at `start`,
 * counting nested tables so that a table inside a cell is wrapped once, with
 * its parent, rather than twice.
 */
function closingTag(html: string, start: number): number {
  const tags = /<(\/?)table\b/gi
  tags.lastIndex = start

  let depth = 0

  for (let match = tags.exec(html); match !== null; match = tags.exec(html)) {
    depth += match[1] === '/' ? -1 : 1

    if (depth === 0) {
      const close = html.indexOf('>', match.index)
      return close === -1 ? -1 : close + 1
    }
  }

  return -1
}
