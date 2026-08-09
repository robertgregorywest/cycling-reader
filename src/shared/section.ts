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
 * The Section an Article from an unrecognised part of a Source is admitted as.
 * New coverage appears as a visible bucket rather than silently going missing.
 */
export const UNRECOGNISED_SECTION: Section = 'other'
