/**
 * The named entities the Sources emit. Numeric references are handled
 * generally, so this list only has to cover the handful of names that appear.
 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
}

/**
 * How many times to unescape. Both Sources escape some values twice — a
 * headline arrives inside CDATA still carrying `&amp;#039;` where an
 * apostrophe belongs — so one pass leaves entity text visible to the reader.
 * Two passes clear it; more would start decoding text that was meant
 * literally.
 */
const MAX_PASSES = 2

/**
 * Unescape a value taken from a Feed, including the doubly-encoded ones, and
 * reduce its whitespace to single spaces. Feed values are stored and shown as
 * text, never as HTML.
 */
export function feedText(raw: string): string {
  return unescapeEntities(raw).replace(/\s+/g, ' ').trim()
}

/** Unescape HTML entities, repeatedly, for values escaped more than once. */
export function unescapeEntities(raw: string): string {
  let text = raw
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const next = unescapeOnce(text)
    if (next === text) return text
    text = next
  }
  return text
}

function unescapeOnce(text: string): string {
  return text.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, reference: string) => {
    if (reference.startsWith('#x') || reference.startsWith('#X')) {
      return codePoint(Number.parseInt(reference.slice(2), 16)) ?? whole
    }
    if (reference.startsWith('#')) {
      return codePoint(Number.parseInt(reference.slice(1), 10)) ?? whole
    }
    return NAMED_ENTITIES[reference.toLowerCase()] ?? whole
  })
}

function codePoint(value: number): string | null {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return null
  try {
    return String.fromCodePoint(value)
  } catch {
    return null
  }
}
