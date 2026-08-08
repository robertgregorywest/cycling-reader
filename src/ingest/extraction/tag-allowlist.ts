/**
 * The Tag Allowlist — the set of HTML elements preserved during Extraction.
 * Anything unlisted is discarded, so newly introduced page furniture is
 * excluded by default rather than on discovery. See CONTEXT.md and ADR-0004.
 */
export const TAG_ALLOWLIST: ReadonlySet<string> = new Set([
  // Prose
  'p',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'code',
  'hr',
  'br',
  // Inline emphasis and links
  'a',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'sub',
  'sup',
  'span',
  // Lists
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  // Tables — results and classifications are frequently the most valuable
  // part of a race report, which is why Readability is the fallback and not
  // the primary path.
  'table',
  'caption',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  // Images and their captions
  'figure',
  'figcaption',
  'img',
])

/**
 * Attributes kept on an allowlisted element. Everything else — inline styles,
 * analytics hooks, `data-*`, lazy-loading machinery — is dropped, because the
 * stored body is emitted verbatim by the Worker.
 */
export const ATTRIBUTE_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
  a: ['href'],
  img: ['src', 'alt'],
  th: ['colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
}

/**
 * Elements that are neither content nor furniture: the Source's own layout
 * wrappers, which hold allowlisted content one or two levels down. Extraction
 * descends through these and keeps nothing of them.
 *
 * This list is deliberately short and specific to the Future PLC platform both
 * Sources run. A wrapper that disappears in a redesign takes its content with
 * it, which fails validation and is caught by the fixture corpus — the same
 * loud failure the allowlist is chosen for.
 */
export const TRANSPARENT_CONTAINER_CLASSES: readonly string[] = [
  'table-wrapper',
  'table__container',
  'image-full-width-wrapper',
  'image-widthsetter',
]

/** Wrapper elements that are transparent regardless of class. */
export const TRANSPARENT_CONTAINER_TAGS: ReadonlySet<string> = new Set(['picture'])

/**
 * Block-level allowlisted elements. Used to decide where whitespace between
 * elements carries no meaning.
 */
export const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'p',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'hr',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'table',
  'caption',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'figure',
  'figcaption',
])

/**
 * Text the Source renders as instructions to the reader rather than as
 * journalism. The allowlist governs structure, and normally that is enough:
 * this text sits in a wrapper the targeted path discards. Readability, though,
 * re-parents stray text into paragraphs of its own before Extraction ever sees
 * it, putting it beyond the allowlist's reach — so it is matched by its exact
 * text, and only in full.
 */
export const FURNITURE_TEXT: ReadonlySet<string> = new Set([
  'swipe to scroll horizontally',
  'share this article',
  'copy link',
  'join the conversation',
  'the latest race content, interviews, features, reviews and expert buying guides, direct to your inbox!',
])

/**
 * Allowlisted elements that carry meaning while holding no text, and so must
 * survive the empty-element prune.
 */
export const SELF_SUFFICIENT_TAGS: ReadonlySet<string> = new Set(['img', 'br', 'hr'])
