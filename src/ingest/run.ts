import type { Article, SourceId } from '../shared/article.ts'
import { STUB, type Extraction, type ExtractionMethod } from '../shared/extraction.ts'
import type { RunRecord } from '../shared/run.ts'
import { SKIP_REASONS, admit, type SkipReason } from './admission.ts'
import type { SourceConfig } from './config.ts'
import { extract } from './extraction/index.ts'
import { parseFeed, type FeedItem } from './feed.ts'
import { imagesWithin } from './images.ts'
import type { ArticleStore } from './store/store.ts'
import { tripwire } from './tripwires.ts'

/**
 * Everything an Ingest Run touches outside itself. Passing them in is what
 * makes the Run the seam the tests drive: the same code path serves fixture
 * responses in a test and both live Feeds from the CLI.
 */
export interface IngestDependencies {
  readonly sources: readonly SourceConfig[]
  readonly fetchFeed: (url: string) => Promise<string>
  readonly fetchPage: (url: string) => Promise<string>
  /** The Run's clock. Every timestamp it writes comes from here. */
  readonly now: () => Date
  readonly store: ArticleStore
}

/** What one Source contributed to a Run. */
export interface SourceReport {
  readonly source: SourceId
  /** Items the Feed offered. Zero means the Feed did not parse. */
  readonly feedItems: number
  readonly admitted: number
  /** Known Articles re-fetched and re-Extracted because they were Revised. */
  readonly revised: number
  readonly skipped: Readonly<Record<SkipReason, number>>
  readonly extractionMethods: Readonly<Record<ExtractionMethod, number>>
  /**
   * When the newest item the Section Allowlist would admit was published, or
   * null if the Feed offered none. This is what "the Feed has something newer
   * than the previous Run" is read from, so it counts admissible items only:
   * a Feed whose only fresh item is a product review is offering nothing.
   */
  readonly newestAdmissible: string | null
}

/**
 * What a Run did. An Ingest Run is the unit of health reporting, so the report
 * is the Run's output rather than something recovered from logs afterwards —
 * and it is the record written to `ingest_runs`, with the detail the tripwires
 * needed added to it.
 */
export interface IngestReport extends RunRecord {
  readonly skipped: Readonly<Record<SkipReason, number>>
  readonly sources: readonly SourceReport[]
}

/**
 * A single scheduled pass: read every Feed, admit qualifying items, extract
 * their bodies, and write the Articles.
 *
 * Sources are read one after another rather than at once. There are two of
 * them, and a Run that is polite to the Sources it depends on is worth more
 * than a Run that finishes a few seconds sooner.
 *
 * The Run then asserts its own success before returning: it records what it
 * did, and reports a failed outcome when a tripwire fires (ADR-0006). A Run
 * that could not finish at all records itself as failed and rethrows, because
 * the alternative — an unrecorded Run — is the silent failure the whole of
 * this exists to prevent.
 */
export async function ingest(dependencies: IngestDependencies): Promise<IngestReport> {
  const startedAt = dependencies.now().toISOString()
  // Read before the Feeds, not after: this is the previous Run, and the row
  // this Run is about to write must not be the one it compares itself against.
  const previousRun = await dependencies.store.lastRun()
  const sources: SourceReport[] = []

  try {
    for (const source of dependencies.sources) {
      sources.push(await ingestSource(source, dependencies))
    }
  } catch (error) {
    await dependencies.store.recordRun(
      summarise(startedAt, sources, dependencies.now(), reasonFor(error)),
    )
    throw error
  }

  // Counted first, then judged: the tripwires read the same report the caller
  // is handed and the row is written from, so there is one account of the Run
  // rather than one for the health check and another for everyone else.
  const done = summarise(startedAt, sources, dependencies.now(), null)
  const failure = tripwire(done, previousRun?.startedAt ?? null)

  const report = failure === null ? done : { ...done, outcome: 'failed' as const, failure }
  await dependencies.store.recordRun(report)
  return report
}

/** What the Run did, counted up, and what became of it. */
function summarise(
  startedAt: string,
  sources: readonly SourceReport[],
  finishedAt: Date,
  failure: string | null,
): IngestReport {
  return {
    startedAt,
    finishedAt: finishedAt.toISOString(),
    admitted: sum(sources.map((report) => report.admitted)),
    revised: sum(sources.map((report) => report.revised)),
    skipped: mergeCounts(SKIP_REASONS, sources.map((report) => report.skipped)),
    extractionMethods: mergeCounts(
      EXTRACTION_METHODS,
      sources.map((report) => report.extractionMethods),
    ),
    outcome: failure === null ? 'succeeded' : 'failed',
    failure,
    sources,
  }
}

/** What went wrong, in words the failure mail can be read from. */
function reasonFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const EXTRACTION_METHODS: readonly ExtractionMethod[] = ['targeted', 'readability', 'stub']

async function ingestSource(
  source: SourceConfig,
  dependencies: IngestDependencies,
): Promise<SourceReport> {
  const items = parseFeed(await dependencies.fetchFeed(source.feedUrl), source.id)
  const skipped = emptyCounts(SKIP_REASONS)
  const extractionMethods = emptyCounts(EXTRACTION_METHODS)

  const admissible: { readonly item: FeedItem; readonly section: Article['section'] }[] = []
  for (const item of items) {
    const admission = admit(item, source)
    if (!admission.admitted) {
      skipped[admission.reason] += 1
      continue
    }
    admissible.push({ item, section: admission.section })
  }

  // Asked once, for the whole Feed: a Run that admits nothing new — the usual
  // outcome between publications — should not cost fifty queries to discover
  // it. The answer carries each known Article's stored Revision timestamp, so
  // the same query decides both novelty and Revision.
  const known = await dependencies.store.knownRevisions(
    source.id,
    admissible.map(({ item }) => item.guid),
  )

  let admitted = 0
  let revised = 0
  for (const { item, section } of admissible) {
    const storedRevision = known.get(item.guid)
    if (storedRevision !== undefined && revisionOf(item, dependencies.now()) <= storedRevision) {
      skipped['already-ingested'] += 1
      continue
    }

    // The page is fetched again for a Revision: the Feed carries no body, so
    // the only way to learn that a race report has gained its results table is
    // to read the page again.
    const extraction = await extractArticle(item, dependencies)
    const images = imagesWithin(extraction.html)
    const article = toArticle(item, section, extraction, dependencies.now())

    if (storedRevision === undefined) {
      await dependencies.store.addArticle(article, images)
      admitted += 1
    } else {
      await dependencies.store.reviseArticle(article, images)
      revised += 1
    }

    extractionMethods[extraction.method] += 1
  }

  return {
    source: source.id,
    feedItems: items.length,
    admitted,
    revised,
    skipped,
    extractionMethods,
    newestAdmissible: newestPublication(admissible.map(({ item }) => item)),
  }
}

/**
 * When the newest of these items was published, or null if none of them says.
 *
 * Publication rather than Revision: a Revised Article is not a new Article,
 * and an item whose `updated` has advanced has already been admitted. An item
 * carrying neither timestamp cannot be placed in time at all, and is left out
 * rather than being treated as having arrived just now — which would fire a
 * tripwire on every Run.
 */
function newestPublication(items: readonly FeedItem[]): string | null {
  const published = items
    .map((item) => item.publishedAt ?? item.updatedAt)
    .filter((instant): instant is string => instant !== null)

  // ISO 8601 in UTC throughout, which orders lexically.
  return published.length === 0 ? null : published.reduce((a, b) => (a > b ? a : b))
}

/**
 * The instant this item was last changed at its Source, as the Feed reports
 * it, and the value a stored Article's is compared against.
 *
 * About a fifth of items carry no `updated`; those are judged by `pubDate`
 * instead, and Revisions to them are accepted as missed rather than guessed
 * at. Timestamps are ISO 8601 in UTC throughout, which orders lexically.
 */
function revisionOf(item: FeedItem, now: Date): string {
  return item.updatedAt ?? item.publishedAt ?? now.toISOString()
}

/**
 * A page that cannot be fetched is not a failed Run. The Article was
 * advertised by the Feed and exists; it is stored as a Stub and read by
 * following the link to its Source, which is what a Stub is for.
 */
async function extractArticle(
  item: FeedItem,
  dependencies: IngestDependencies,
): Promise<Extraction> {
  let html: string
  try {
    html = await dependencies.fetchPage(item.url)
  } catch {
    return STUB
  }
  return extract(html, { url: item.url })
}

function toArticle(
  item: FeedItem,
  section: Article['section'],
  extraction: Extraction,
  now: Date,
): Article {
  // published_at is NOT NULL because Expiry deletes by age alone. An item with
  // no pubDate falls back to its Revision timestamp, and then to the moment
  // the Run met it — never to nothing.
  const publishedAt = item.publishedAt ?? item.updatedAt ?? now.toISOString()

  return {
    source: item.source,
    guid: item.guid,
    url: item.url,
    headline: item.headline,
    teaser: item.teaser,
    author: item.author,
    section,
    publishedAt,
    // Written from the same function Revision detection reads, so that a
    // stored timestamp and the one the next Run compares against cannot drift.
    updatedAt: revisionOf(item, now),
    bodyHtml: extraction.html,
    extractionMethod: extraction.method,
    textLength: extraction.textLength,
    heroImageUrl: item.heroImageUrl,
    heroImageAlt: item.heroImageAlt,
    firstSeenAt: now.toISOString(),
  }
}

function emptyCounts<Key extends string>(keys: readonly Key[]): Record<Key, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<Key, number>
}

function mergeCounts<Key extends string>(
  keys: readonly Key[],
  counts: readonly Readonly<Record<Key, number>>[],
): Record<Key, number> {
  const total = emptyCounts(keys)
  for (const count of counts) {
    for (const key of keys) total[key] += count[key]
  }
  return total
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
