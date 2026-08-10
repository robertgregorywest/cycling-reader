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
  /**
   * Whether this Source runs the platform the targeted extractor's selector
   * is written against, so that a low targeted rate is evidence of something
   * having changed at the Source rather than of the Source's normal shape.
   * `false` excludes it from the Readability-fallback tripwire (ADR-0011)
   * rather than have a Source that was never going to be targeted read as one
   * that broke, on every Run, forever.
   */
  readonly targetedExtraction: boolean
  /**
   * A narrow, deliberate exception to Section admission being by URL path
   * alone: Categories naming these values refine a `racing` result into the
   * mapped Section, for Sources whose paths do not themselves separate that
   * coverage out. Never overrides any Section but `racing`, and never applies
   * unless a Source opts in here — a Source with no entries behaves exactly
   * as before. See ADR-0010.
   */
  readonly categorySections?: Readonly<Record<string, Section>>
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
    targetedExtraction: true,
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
    targetedExtraction: true,
  },
  {
    id: 'velo',
    feedUrl: 'https://velo.outsideonline.com/feed',
    sectionPaths: {
      'road/road-racing': 'racing',
      'road/road-gear': 'tech',
      'gravel/gravel-gear': 'tech',
      gravel: 'racing',
      mountain: 'racing',
      news: 'news',
    },
    // Velo runs no path distinct from its gear coverage for reviews or
    // buyer's guides — they publish beneath `road/road-gear` and
    // `gravel/gravel-gear` alongside genuine gear journalism, the same
    // ambiguity Cyclingnews documents above. Gear Articles are admitted as
    // `tech` rather than excluded.
    commercePaths: [],
    liveBlogPaths: [],
    // Velo does not run the Future PLC platform the targeted extractor's
    // `#article-body` selector is written against, so every Article here
    // takes the Readability path — not a redesign, but this Source's normal
    // shape (ADR-0011).
    targetedExtraction: false,
    // Velo runs no `womens-cycling` path the way Cyclingnews does: a Tour de
    // France Femmes report lives at the same depth under `road/road-racing`
    // as any men's race report. Its Feed does tag this coverage `Women's
    // Cycling` reliably, so Section admission refines `racing` by that
    // Category here rather than leave women's racing indistinguishable from
    // men's (ADR-0010).
    categorySections: {
      "Women's Cycling": 'womens',
    },
  },
]

export function sourceConfig(id: SourceId): SourceConfig {
  const found = SOURCES.find((source) => source.id === id)
  if (found === undefined) throw new Error(`No such Source: ${id}`)
  return found
}
