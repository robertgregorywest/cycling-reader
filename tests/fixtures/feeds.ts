import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SourceId } from '../../src/shared/article.ts'

/**
 * The Feed corpus: real RSS from every Source, committed, so that an Ingest
 * Run is driven by what the Sources actually publish rather than by XML
 * written to make the parser pass.
 *
 * Provenance and the two normalisations applied are documented in README.md
 * alongside this file.
 */
export interface FeedFixture {
  readonly source: SourceId
  /** The Feed's URL at its Source. */
  readonly url: string
  /** ISO date the Feed was retrieved. */
  readonly retrievedAt: string
  /** Items kept from the fifty the Feed served. */
  readonly items: number
}

export const FEED_FIXTURES: readonly FeedFixture[] = [
  {
    source: 'cyclingnews',
    url: 'https://www.cyclingnews.com/feeds.xml',
    retrievedAt: '2026-08-09',
    items: 6,
  },
  {
    source: 'cyclingweekly',
    url: 'https://www.cyclingweekly.com/feeds.xml',
    retrievedAt: '2026-08-09',
    items: 6,
  },
  {
    source: 'velo',
    url: 'https://velo.outsideonline.com/feed',
    retrievedAt: '2026-08-10',
    items: 6,
  },
]

export function readFeedFixture(source: SourceId): string {
  return readFileSync(
    fileURLToPath(new URL(`./feeds/${source}.xml`, import.meta.url)),
    'utf8',
  )
}
