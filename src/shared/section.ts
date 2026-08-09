/**
 * Section — the reader's own normalised subject taxonomy, into which every
 * Source's URL paths are mapped so that filtering is comparable across
 * publications that use different vocabularies. See CONTEXT.md.
 *
 * A Category — the raw subject label a Feed emits — is never one of these.
 */
export const SECTIONS = ['racing', 'womens', 'teams-riders', 'tech', 'news', 'other'] as const

export type Section = (typeof SECTIONS)[number]

/**
 * A Section's name as the reader sees it on a filter.
 *
 * Shared for the same reason a Source's name is: ingest owns the mapping from
 * a Source's URL paths into these, and the reader owns what they are called on
 * the page. The vocabulary is one vocabulary, so a filter chip means the same
 * thing whichever Source an Article came from.
 */
export const SECTION_NAMES: Readonly<Record<Section, string>> = {
  racing: 'Racing',
  womens: 'Women’s',
  'teams-riders': 'Teams & Riders',
  tech: 'Tech',
  news: 'News',
  other: 'Other',
}

export function sectionName(section: Section): string {
  return SECTION_NAMES[section]
}

/** Whether a string off a query parameter names a Section. Anything else is
 * not a filter the reader can have chosen, so it is not one. */
export function isSection(value: unknown): value is Section {
  return typeof value === 'string' && (SECTIONS as readonly string[]).includes(value)
}

/**
 * The Section an Article from an unrecognised part of a Source is admitted as.
 * New coverage appears as a visible bucket rather than silently going missing.
 */
export const UNRECOGNISED_SECTION: Section = 'other'
