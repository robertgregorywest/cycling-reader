import { UNRECOGNISED_SECTION, type Section } from '../shared/section.ts'
import type { SourceConfig } from './config.ts'
import type { FeedItem } from './feed.ts'

/**
 * Why an item a Feed offered did not become an Article. Every skip has a
 * reason, and every reason is counted in the Ingest Run's report: an item
 * disappearing silently is the failure this vocabulary exists to prevent.
 */
export const SKIP_REASONS = ['paid', 'live-blog', 'commerce-path', 'already-ingested'] as const

export type SkipReason = (typeof SKIP_REASONS)[number]

export type Admission =
  | { readonly admitted: true; readonly section: Section }
  | { readonly admitted: false; readonly reason: SkipReason }

/**
 * Apply the Section Allowlist, which governs whether an Article enters the
 * reader at all.
 *
 * Admission is by URL path, not by the Source's own Categories: Categories are
 * not comparable between Sources and a single Article carries several. A path
 * the Allowlist does not recognise is admitted as `other` rather than dropped,
 * so that a Source's new coverage appears as a visible bucket.
 *
 * Whether the Article is already stored is not this function's business; the
 * Ingest Run owns that reason.
 */
export function admit(item: FeedItem, source: SourceConfig): Admission {
  if (item.paid) return { admitted: false, reason: 'paid' }

  const path = pathOf(item.url)
  if (matchesAny(path, source.liveBlogPaths)) return { admitted: false, reason: 'live-blog' }
  if (matchesAny(path, source.commercePaths)) return { admitted: false, reason: 'commerce-path' }

  return { admitted: true, section: sectionOf(path, source) }
}

/** The Section a Source's URL path maps into. Longest matching prefix wins. */
export function sectionOf(path: string, source: SourceConfig): Section {
  let best: { readonly prefix: string; readonly section: Section } | null = null

  for (const [prefix, section] of Object.entries(source.sectionPaths)) {
    if (!isBeneath(path, prefix)) continue
    if (best === null || prefix.length > best.prefix.length) best = { prefix, section }
  }

  return best?.section ?? UNRECOGNISED_SECTION
}

/** The path of an Article's URL, without its leading or trailing slashes. */
export function pathOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, '')
  } catch {
    return ''
  }
}

/**
 * Prefixes match whole path segments: `news` matches `news/some-article` but
 * never `newsletter-signup`.
 */
function isBeneath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

function matchesAny(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => isBeneath(path, prefix))
}
