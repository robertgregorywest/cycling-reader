import latinExtItalic from './source-serif-4-latin-ext-italic.woff2'
import latinExt from './source-serif-4-latin-ext.woff2'
import latinItalic from './source-serif-4-latin-italic.woff2'
import latin from './source-serif-4-latin.woff2'

/**
 * The reading typeface, self-hosted.
 *
 * Source Serif 4, variable on weight and optical size, under the SIL Open Font
 * License — the licence text sits beside the files. Typeface is the single
 * largest lever on whether the reader feels like a magazine rather than a
 * feed, and it is a lever that cannot be pulled from a CDN here: every route
 * sits behind the passphrase (ADR-0003), and a third-party font request would
 * also tell someone else which Articles are being read and when.
 *
 * The files are bundled into the Worker as bytes and served from a route,
 * exactly as the stylesheet is, so a deploy carries its own fonts and there is
 * nothing else to keep in step.
 */

/**
 * Latin *and* Latin Extended, which is not padding: cycling is reported in
 * names — Pogačar, Jakobsen, Küng, Vollering — and a missing Ext subset sets
 * every one of them in the fallback face mid-sentence. The two are separate
 * files under separate unicode ranges because that is how a browser reading an
 * English-language Article avoids the second one entirely.
 *
 * Italic is a real cut rather than a slant the browser invents, because a
 * synthesised italic is the most visible way a page can look cheap.
 */
export interface Font {
  /** The path segment it is served at, versioned by the file it came from. */
  readonly file: string
  readonly bytes: ArrayBuffer
  readonly style: 'normal' | 'italic'
  readonly unicodeRange: string
}

/**
 * The ranges are Google Fonts' own subsetting of this family, kept verbatim
 * against the files they describe: they are a property of what was subset, not
 * a choice being made here.
 */
const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'

const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'

export const SERIF_FAMILY = 'Source Serif 4'

/** Weights the variable file carries, and the range `@font-face` must declare
 * for a browser to use one file for all of them. */
const WEIGHTS = '300 700'

export const FONTS: readonly Font[] = [
  {
    file: 'source-serif-4-latin.woff2',
    bytes: latin,
    style: 'normal',
    unicodeRange: LATIN,
  },
  {
    file: 'source-serif-4-latin-ext.woff2',
    bytes: latinExt,
    style: 'normal',
    unicodeRange: LATIN_EXT,
  },
  {
    file: 'source-serif-4-latin-italic.woff2',
    bytes: latinItalic,
    style: 'italic',
    unicodeRange: LATIN,
  },
  {
    file: 'source-serif-4-latin-ext-italic.woff2',
    bytes: latinExtItalic,
    style: 'italic',
    unicodeRange: LATIN_EXT,
  },
]

/** Where the files are served. Under the passphrase like everything else. */
export const FONT_PATH_PREFIX = '/font/'

export function fontPath(font: Font): string {
  return `${FONT_PATH_PREFIX}${font.file}`
}

export function fontByFile(file: string): Font | undefined {
  return FONTS.find((font) => font.file === file)
}

/**
 * The `@font-face` rules, generated from the same table the files are served
 * from, so a font added or renamed cannot end up declared at one path and
 * served at another.
 *
 * `swap`, because the Article is words: the reader should be reading them in
 * the fallback serif while a hundred kilobytes of variable font arrives, not
 * looking at a blank page waiting for it.
 */
export function fontFaces(): string {
  return FONTS.map(
    (font) => `@font-face {
  font-family: "${SERIF_FAMILY}";
  font-style: ${font.style};
  font-weight: ${WEIGHTS};
  font-display: swap;
  src: url("${fontPath(font)}") format("woff2");
  unicode-range: ${font.unicodeRange};
}`,
  ).join('\n\n')
}
