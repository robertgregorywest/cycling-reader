import type { SourceId } from './article.ts'

/**
 * A Source's name as the reader sees it.
 *
 * Shared because both runtimes need it and neither owns it: ingest holds the
 * Feed URL and the Section Allowlist, which are its business alone, but the
 * name is what the index prints against every Article.
 */
export const SOURCE_NAMES: Readonly<Record<SourceId, string>> = {
  cyclingnews: 'Cyclingnews',
  cyclingweekly: 'Cycling Weekly',
}

export function sourceName(id: SourceId): string {
  return SOURCE_NAMES[id]
}

/** Every Source, in the order the index offers them as a filter. Derived from
 * the names rather than listed again, so a third Source is added once. */
export const SOURCE_IDS = Object.keys(SOURCE_NAMES) as readonly SourceId[]

/** Whether a string off a query parameter names a Source. */
export function isSourceId(value: unknown): value is SourceId {
  return typeof value === 'string' && (SOURCE_IDS as readonly string[]).includes(value)
}
