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
