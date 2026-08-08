import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The fixture corpus: real Source HTML, committed, so that a Future PLC
 * redesign presents as a failing test rather than a guessing game (ADR-0004).
 *
 * Provenance and the one normalisation applied are documented in README.md
 * alongside this file.
 */
export interface Fixture {
  /** Fixture name; also the file name without its extension. */
  readonly name: string
  readonly source: 'cyclingnews' | 'cyclingweekly'
  /** What this page is in the corpus to cover. */
  readonly kind:
    | 'race-report'
    | 'news-item'
    | 'paid-article'
    | 'live-blog'
    | 'tech-piece'
    | 'removed-article'
    | 'redesigned-body-container'
  /** The page's URL at its Source. */
  readonly url: string
  /** ISO date the page was retrieved. */
  readonly retrievedAt: string
  /** Non-empty when the committed HTML differs from what the Source served. */
  readonly derivation?: string
}

export const FIXTURES: readonly Fixture[] = [
  {
    name: 'cyclingnews-race-report',
    source: 'cyclingnews',
    kind: 'race-report',
    url: 'https://www.cyclingnews.com/pro-cycling/racing/vuelta-a-burgos-felix-gall-seals-overall-victory-as-red-bull-bora-hansgrohe-take-out-final-stage/',
    retrievedAt: '2026-08-08',
  },
  {
    name: 'cyclingnews-news-item',
    source: 'cyclingnews',
    kind: 'news-item',
    url: 'https://www.cyclingnews.com/pro-cycling/womens-cycling/anna-van-der-breggen-abandons-the-tour-de-france-femmes/',
    retrievedAt: '2026-08-08',
  },
  {
    name: 'cyclingnews-paid-article',
    source: 'cyclingnews',
    kind: 'paid-article',
    url: 'https://www.cyclingnews.com/cycling-tech-components/hot-burning-knife-blades-on-our-wheels-the-controversial-story-of-disc-brake-adoption-in-the-peloton-10-years-on/',
    retrievedAt: '2026-08-08',
  },
  {
    name: 'cyclingnews-live-blog',
    source: 'cyclingnews',
    kind: 'live-blog',
    url: 'https://www.cyclingnews.com/pro-cycling/live/tour-de-france-femmes-stage-8-live-longest-stage-of-the-race-may-suit-sprinters-or-a-breakaway/',
    retrievedAt: '2026-08-08',
  },
  {
    name: 'cyclingnews-removed-article',
    source: 'cyclingnews',
    kind: 'removed-article',
    url: 'https://www.cyclingnews.com/pro-cycling/racing/this-article-has-been-removed-abc123/',
    retrievedAt: '2026-08-08',
    derivation:
      'None. This is the Source\'s own 404 page, served for an article path that does not exist — the page an Ingest Run meets when an Article is pulled after the Feed advertised it.',
  },
  {
    name: 'cyclingweekly-race-report',
    source: 'cyclingweekly',
    kind: 'race-report',
    url: 'https://www.cyclingweekly.com/racing/demi-vollering-snatches-yellow-jersey-in-daring-attack-to-win-tour-de-france-femmes-stage-8',
    retrievedAt: '2026-08-08',
  },
  {
    name: 'cyclingweekly-news-item',
    source: 'cyclingweekly',
    kind: 'news-item',
    url: 'https://www.cyclingweekly.com/news/papa-was-an-absolute-legend-charity-cyclist-dies-one-day-after-riding-across-australia',
    retrievedAt: '2026-08-08',
  },
  {
    name: 'cyclingweekly-tech-review',
    source: 'cyclingweekly',
    kind: 'tech-piece',
    url: 'https://www.cyclingweekly.com/reviews/pedals/wolf-tooth-mk0-del-pedal-review-a-brilliant-off-road-pedal-system-but-is-it-worth-the-premium-over-the-standard-del-version',
    retrievedAt: '2026-08-08',
  },
  {
    name: 'cyclingweekly-redesigned-body-container',
    source: 'cyclingweekly',
    kind: 'redesigned-body-container',
    url: 'https://www.cyclingweekly.com/news/papa-was-an-absolute-legend-charity-cyclist-dies-one-day-after-riding-across-australia',
    retrievedAt: '2026-08-08',
    derivation:
      'cyclingweekly-news-item with id="article-body" renamed to id="article-content", standing in for the Future PLC redesign that defeats the targeted path. Nothing else is altered.',
  },
]

export function fixture(name: string): Fixture {
  const found = FIXTURES.find((candidate) => candidate.name === name)
  if (found === undefined) throw new Error(`No such fixture: ${name}`)
  return found
}

export function readFixture(name: string): string {
  return readFileSync(fixturePath(name), 'utf8')
}

export function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./pages/${name}.html`, import.meta.url))
}
