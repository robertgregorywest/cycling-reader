import { DatabaseSync } from 'node:sqlite'
import { JSDOM, VirtualConsole } from 'jsdom'
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

/**
 * A page fetcher that remembers what it was asked for, so that a test can say
 * an Article was *not* re-fetched — which is the whole of "unchanged" and is
 * invisible in the store, because an unchanged Article re-Extracted would look
 * exactly like one left alone.
 */
export function recordingPageFetcher(): {
  readonly fetchPage: (url: string) => Promise<string>
  readonly fetched: readonly string[]
} {
  const fetched: string[] = []
  return {
    fetched,
    fetchPage(url: string) {
      fetched.push(url)
      return fetchPageFromCorpus(url)
    },
  }
}

/**
 * The Source's Feed re-served with one item's timestamp advanced: a Revision
 * as a Feed expresses one, rather than as the store would.
 *
 * `updated` is where three quarters of items carry their Revision; `pubDate`
 * is what the fifth carrying no `updated` are judged by. The element is
 * created if the item has none, because gaining an `updated` is itself how a
 * Source announces the first Revision of such an item.
 */
export function fetchFeedRevising(
  source: SourceId,
  guid: string,
  elements: readonly ('updated' | 'pubDate')[],
  to: Date,
): (url: string) => Promise<string> {
  return async (url: string) => {
    const xml = await fetchFeedFromCorpus(url)
    const config = SOURCES.find((candidate) => candidate.feedUrl === url)
    if (config?.id !== source) return xml
    return elements.reduce((revised, element) => advanceTimestamp(revised, guid, element, to), xml)
  }
}

/** Feed dates are RFC 822, which is what `toUTCString` writes. */
function advanceTimestamp(xml: string, guid: string, element: string, to: Date): string {
  const window = new JSDOM(xml, { contentType: 'text/xml', virtualConsole: new VirtualConsole() })
    .window
  const document = window.document

  const item = Array.from(document.getElementsByTagName('item')).find((candidate) =>
    Array.from(candidate.children).some(
      (child) => child.nodeName === 'guid' && child.textContent?.trim() === guid,
    ),
  )
  if (item === undefined) throw new Error(`No Feed item with guid ${guid}`)

  const existing = Array.from(item.children).find((child) => child.nodeName === element)
  const target = existing ?? item.appendChild(document.createElement(element))
  target.textContent = to.toUTCString()

  return new window.XMLSerializer().serializeToString(document)
}

/**
 * Set the reading state on a stored Article, written directly through SQL
 * because it is the Worker's to write and an ingest store has no business
 * doing so. Needs a store opened on a file rather than in memory.
 */
export function setReadingState(
  database: string,
  article: { readonly source: SourceId; readonly guid: string },
  state: { readonly readAt: string | null; readonly savedAt: string | null },
): void {
  const connection = new DatabaseSync(database)
  try {
    connection
      .prepare('UPDATE articles SET read_at = ?, saved_at = ? WHERE source = ? AND guid = ?')
      .run(state.readAt, state.savedAt, article.source, article.guid)
  } finally {
    connection.close()
  }
}
