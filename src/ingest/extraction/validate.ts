import type { CleanBody } from './clean.ts'

/**
 * A body shorter than this is a teaser, a paywall notice or the wreckage of a
 * failed selector — not an Article. Roughly two short paragraphs.
 */
export const MINIMUM_TEXT_LENGTH = 400

/**
 * The opening words of the Source's share bar. If one of these leads the body,
 * page furniture has been admitted ahead of the journalism and the result is
 * not trustworthy, whichever path produced it.
 */
const SHARE_BAR_OPENINGS: readonly RegExp[] = [
  /^copy link\b/i,
  /^share this article\b/i,
  /^share\b/i,
  /^facebook\b/i,
  /^join the conversation\b/i,
]

export type ValidationFailure =
  | 'no-paragraph'
  | 'below-minimum-length'
  | 'begins-with-share-bar'

/** Returns the reason the body is unacceptable, or `null` if it is acceptable. */
export function findValidationFailure(body: CleanBody): ValidationFailure | null {
  if (!/<p[\s>]/i.test(body.html)) return 'no-paragraph'
  if (body.textLength < MINIMUM_TEXT_LENGTH) return 'below-minimum-length'
  if (beginsWithShareBar(body.html)) return 'begins-with-share-bar'
  return null
}

function beginsWithShareBar(html: string): boolean {
  const opening = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return SHARE_BAR_OPENINGS.some((pattern) => pattern.test(opening))
}
