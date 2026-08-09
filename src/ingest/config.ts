import type { SourceId } from '../shared/article.ts'
import type { Section } from '../shared/section.ts'

/**
 * The Sources the reader draws from, and the Section Allowlist that governs
 * whether an Article enters the reader at all.
 *
 * This lives in the repository rather than the database: it changes when code
 * changes, it benefits from review, and the repository is public regardless.
 */
export interface SourceConfig {
  readonly id: SourceId
  readonly feedUrl: string
  /**
   * URL path prefixes mapped into the Section vocabulary. The longest
   * matching prefix wins; a path matching none is admitted as `other`, so new
   * coverage appears as a visible bucket rather than going missing.
   */
  readonly sectionPaths: Readonly<Record<string, Section>>
  /**
   * Paths carrying commerce rather than journalism — reviews, deals, buying
   * guides. Articles beneath them are skipped.
   */
  readonly commercePaths: readonly string[]
  /**
   * Paths beneath which the Source publishes live blogs. Live blogs are
   * skipped: they are unreadable after the fact and would occupy the index.
   */
  readonly liveBlogPaths: readonly string[]
}

export const SOURCES: readonly SourceConfig[] = [
  {
    id: 'cyclingnews',
    feedUrl: 'https://www.cyclingnews.com/feeds.xml',
    sectionPaths: {
      'pro-cycling/racing': 'racing',
      'pro-cycling/womens-cycling': 'womens',
      'pro-cycling/teams-riders': 'teams-riders',
      'pro-cycling/doping': 'news',
      'pro-cycling/safety': 'news',
      'pro-cycling/rules': 'news',
      'cycling-tech-components': 'tech',
    },
    // Cyclingnews publishes some deals beneath `cycling-tech-components`
    // alongside genuine tech journalism, so a path exclusion cannot separate
    // them. Those Articles are admitted as `tech`. The Feed's affiliate flag
    // is set on no item and cannot be used to do better.
    commercePaths: ['deals', 'reviews', 'buyers-guides'],
    liveBlogPaths: ['pro-cycling/live'],
  },
  {
    id: 'cyclingweekly',
    feedUrl: 'https://www.cyclingweekly.com/feeds.xml',
    sectionPaths: {
      racing: 'racing',
      news: 'news',
      fitness: 'other',
      travel: 'other',
      'cycling-tech': 'tech',
    },
    commercePaths: ['reviews', 'products', 'group-tests', 'deals', 'buying-guides'],
    // Cycling Weekly publishes no live blogs; Cyclingnews covers the racing
    // it would. If one appears, it arrives under an unrecognised path and is
    // admitted as `other` until a path is added here.
    liveBlogPaths: [],
  },
]

export function sourceConfig(id: SourceId): SourceConfig {
  const found = SOURCES.find((source) => source.id === id)
  if (found === undefined) throw new Error(`No such Source: ${id}`)
  return found
}
