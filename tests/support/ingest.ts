import { SOURCES } from '../../src/ingest/config.ts'
import { parseFeed } from '../../src/ingest/feed.ts'
import type { SourceId } from '../../src/shared/article.ts'
import { FIXTURES, readFixture } from '../fixtures/corpus.ts'
import { readFeedFixture } from '../fixtures/feeds.ts'

/**
 * The dependencies an Ingest Run is driven with in tests: both Feeds and both
 * Sources' pages served from the committed corpus, and no network.
 */

/** Serve each Source's Feed from the Feed corpus. */
export function fetchFeedFromCorpus(url: string): Promise<string> {
  const source = SOURCES.find((candidate) => candidate.feedUrl === url)
  if (source === undefined) return Promise.reject(new Error(`No Feed fixture for ${url}`))
  return Promise.resolve(readFeedFixture(source.id))
}

/**
 * The page corpus, by the URL each page has at its Source.
 *
 * `cyclingweekly-redesigned-body-container` shares its URL with the page it
 * was derived from, so it is attached to a different Article — the one under
 * an unrecognised path — where it stands in for the Future PLC redesign that
 * defeats the targeted path and sends the Run to Readability.
 */
const PAGES: ReadonlyMap<string, string> = new Map([
  ...FIXTURES.filter((entry) => entry.kind !== 'redesigned-body-container').map(
    (entry) => [entry.url, entry.name] as const,
  ),
  [urlBeneath('cyclingweekly', 'travel/'), 'cyclingweekly-redesigned-body-container'],
])

/** The URL of the one item a Feed carries beneath a path. */
function urlBeneath(source: SourceId, path: string): string {
  const found = parseFeed(readFeedFixture(source), source).filter((item) =>
    new URL(item.url).pathname.startsWith(`/${path}`),
  )
  if (found.length !== 1) {
    throw new Error(`Expected one ${source} item beneath ${path}, found ${found.length}`)
  }
  return found[0]!.url
}

/**
 * Serve an Article's page from the page corpus. A URL the corpus does not hold
 * is served the Source's own 404 page, which is what an Ingest Run meets when
 * an Article is pulled after the Feed advertised it, and which yields a Stub.
 */
export function fetchPageFromCorpus(url: string): Promise<string> {
  return Promise.resolve(readFixture(PAGES.get(url) ?? 'cyclingnews-removed-article'))
}

/** A clock that does not move, so that a Run's timestamps are assertable. */
export function fixedClock(instant: string): () => Date {
  const date = new Date(instant)
  return () => date
}
