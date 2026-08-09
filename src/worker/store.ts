import type { SourceId } from '../shared/article.ts'
import type { ExtractionMethod } from '../shared/extraction.ts'
import type { Section } from '../shared/section.ts'
import type { IndexFilter } from './filters.ts'
import { NO_FILTER } from './filters.ts'

/**
 * What the reader reads. The Worker never writes an Article and never extracts
 * one: ingest owns everything in these tables (ADR-0001).
 *
 * The statements live here rather than in `ingest/store/sql.ts` because the
 * two runtimes ask different questions of the same columns — an Ingest Run
 * writes whole Articles, the index reads a list — and because neither source
 * root imports the other.
 */

/**
 * One line of the index. Deliberately not a `StoredArticle`: the body of a
 * hundred Articles is several megabytes of HTML that the index never renders,
 * and `SELECT *` would move all of it to serve a list of headlines.
 */
export interface IndexEntry {
  readonly source: SourceId
  readonly guid: string
  /** The Article's URL at its Source. */
  readonly url: string
  readonly headline: string
  readonly teaser: string
  readonly section: Section
  readonly publishedAt: string
  readonly heroImageUrl: string | null
  /**
   * An Article whose Extraction failed, read by following the link to its
   * Source. A Stub is a legitimate Article and not an error state, so it is
   * listed like any other — it is only where the link goes that differs.
   */
  readonly isStub: boolean
  /**
   * Read is shown dimmed rather than removed: what has been covered should be
   * legible without the index rearranging itself around it.
   */
  readonly isRead: boolean
  /**
   * The Updated Marker: a Revision that post-dates the moment this Article was
   * Read — a race report that has gained its results since it was looked at.
   * Always false for an Article never Read, where there is no "since".
   */
  readonly isUpdated: boolean
}

/**
 * Enough to scroll through without being a second day's reading, and small
 * enough that the page stays quick on a phone. The Stream is thirty days deep
 * and arrives at roughly a hundred Articles a day, so an unbounded index would
 * be thousands of entries; nothing in the reader is served by rendering them.
 */
export const INDEX_LIMIT = 100

const selectIndex = (filter: IndexFilter): string => `SELECT
  source, guid, url, headline, teaser, section, published_at, updated_at,
  hero_image_url, extraction_method, read_at
FROM articles${where(filter)}
ORDER BY published_at DESC
LIMIT ?`

/**
 * The filter, as SQL. Section and Source in this order here and in `binds`
 * below, because the two are read together and a placeholder counted in one
 * order and filled in the other is a bug that still returns rows.
 *
 * The fragments are fixed text and the values are always bound, so a query
 * parameter never reaches the database as SQL.
 */
function where(filter: IndexFilter): string {
  const conditions: string[] = []

  if (filter.section !== null) conditions.push('section = ?')
  if (filter.source !== null) conditions.push('source = ?')

  return conditions.length === 0 ? '' : `\nWHERE ${conditions.join(' AND ')}`
}

function binds(filter: IndexFilter): readonly string[] {
  const values: string[] = []

  if (filter.section !== null) values.push(filter.section)
  if (filter.source !== null) values.push(filter.source)

  return values
}

interface IndexRow {
  source: string
  guid: string
  url: string
  headline: string
  teaser: string
  section: string
  published_at: string
  updated_at: string
  hero_image_url: string | null
  extraction_method: string
  read_at: string | null
}

/**
 * The index, newest first, through whatever filter the reader is reading it
 * under.
 *
 * By publication and not by first seen: a Revision is not news, and an Article
 * corrected this morning must not climb back over what has been published
 * since.
 */
export async function indexEntries(
  database: D1Database,
  filter: IndexFilter = NO_FILTER,
  limit: number = INDEX_LIMIT,
): Promise<readonly IndexEntry[]> {
  const { results } = await database
    .prepare(selectIndex(filter))
    .bind(...binds(filter), limit)
    .all<IndexRow>()

  return results.map(toIndexEntry)
}

/**
 * One Article, as the article view renders it.
 *
 * This one does carry the body, which is the whole point of it, and so is read
 * a single row at a time and never in a list.
 */
export interface ReaderArticle {
  readonly source: SourceId
  readonly guid: string
  /** The Article at its Source: the link out, and the whole of how a Stub is
   * read. */
  readonly url: string
  readonly headline: string
  readonly teaser: string
  readonly author: string | null
  readonly section: Section
  readonly publishedAt: string
  readonly updatedAt: string
  /** Clean body HTML, already sanitised at ingest and emitted verbatim.
   * Empty when the Article is a Stub. */
  readonly bodyHtml: string
  readonly extractionMethod: ExtractionMethod
  readonly heroImageUrl: string | null
  readonly heroImageAlt: string | null
  readonly isStub: boolean
  /** When this Article was first opened, or null if it never has been. */
  readonly readAt: string | null
}

const SELECT_ARTICLE = `SELECT
  source, guid, url, headline, teaser, author, section,
  published_at, updated_at, body_html, extraction_method,
  hero_image_url, hero_image_alt, read_at
FROM articles
WHERE source = ? AND guid = ?`

interface ArticleRow {
  source: string
  guid: string
  url: string
  headline: string
  teaser: string
  author: string | null
  section: string
  published_at: string
  updated_at: string
  body_html: string
  extraction_method: string
  hero_image_url: string | null
  hero_image_alt: string | null
  read_at: string | null
}

/** The Article at this Source and guid, or null — a guid typed wrong, or an
 * Article that has since Expired. */
export async function readerArticle(
  database: D1Database,
  source: string,
  guid: string,
): Promise<ReaderArticle | null> {
  const row = await database.prepare(SELECT_ARTICLE).bind(source, guid).first<ArticleRow>()

  return row === null ? null : toReaderArticle(row)
}

/**
 * Opening an Article marks it Read, and the first opening is the one that
 * counts: `read_at` records when the reader first got to it, so a second
 * reading on a second device must not move it.
 *
 * This is the Worker's one write, and it is not to an Article's content —
 * ingest owns all of that (ADR-0001). Read state is the reader's.
 */
const MARK_READ = 'UPDATE articles SET read_at = ? WHERE source = ? AND guid = ? AND read_at IS NULL'

export async function markRead(
  database: D1Database,
  article: ReaderArticle,
  now: Date,
): Promise<void> {
  if (article.readAt !== null) return

  await database.prepare(MARK_READ).bind(now.toISOString(), article.source, article.guid).run()
}

/**
 * How many Articles arrived since the Last Visit.
 *
 * New is counted against arrival — `first_seen_at`, which re-Extraction never
 * touches — and not against publication, so a Revision does not make an
 * Article New again any more than it returns it to the top of the index.
 *
 * The count is over the whole reader and not through the current filter: New
 * is a fact about the reader's Last Visit, not about the lens they happen to
 * be looking through, and a count that changed when a chip was pressed would
 * be a count of something else.
 *
 * `COALESCE` to the empty string covers the reader that has never visited,
 * where everything is New: every ISO instant sorts after `''`.
 */
const COUNT_NEW = `SELECT COUNT(*) AS articles
FROM articles
WHERE first_seen_at > COALESCE((SELECT last_visit_at FROM app_state WHERE id = 1), '')`

const ADVANCE_LAST_VISIT = 'UPDATE app_state SET last_visit_at = ? WHERE id = 1'

/**
 * Opening the index is the visit: the New count is taken against the Last
 * Visit, and the Last Visit then becomes now.
 *
 * Counted and advanced in one batch, which D1 runs as one transaction, so the
 * count and the moment it was taken against cannot come apart — two round
 * trips could count Articles that the advance then declares already seen.
 *
 * This is the only number the reader is ever shown. There is deliberately no
 * cumulative unread total anywhere: at roughly a hundred Articles a day
 * against a realistic reading rate such a number only ever climbs, and a
 * reading application should not become a source of obligation.
 */
export async function recordVisit(database: D1Database, now: Date): Promise<number> {
  const [counted] = await database.batch<{ articles: number }>([
    database.prepare(COUNT_NEW),
    database.prepare(ADVANCE_LAST_VISIT).bind(now.toISOString()),
  ])

  return counted?.results[0]?.articles ?? 0
}

const MARK_ALL_READ = 'UPDATE articles SET read_at = ? WHERE read_at IS NULL'

/**
 * Everything Read, in one action — what a week away is worth on returning.
 *
 * Deliberately every Article and not the filtered ones: this is the thing that
 * clears the New count, and a New count is not something a Section can hold a
 * share of. The Last Visit advances with it for the same reason.
 *
 * `read_at IS NULL` keeps the first reading the one that counts, exactly as
 * opening a single Article does.
 */
export async function markAllRead(database: D1Database, now: Date): Promise<void> {
  const at = now.toISOString()

  await database.batch([
    database.prepare(MARK_ALL_READ).bind(at),
    database.prepare(ADVANCE_LAST_VISIT).bind(at),
  ])
}

function toReaderArticle(row: ArticleRow): ReaderArticle {
  return {
    source: row.source as SourceId,
    guid: row.guid,
    url: row.url,
    headline: row.headline,
    teaser: row.teaser,
    author: row.author,
    section: row.section as Section,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    bodyHtml: row.body_html,
    extractionMethod: row.extraction_method as ExtractionMethod,
    heroImageUrl: row.hero_image_url,
    heroImageAlt: row.hero_image_alt,
    isStub: row.extraction_method === 'stub',
    readAt: row.read_at,
  }
}

/**
 * What the index footer reports: whether the reader is current, and whether
 * what is in it was extracted well.
 *
 * Both failures this describes are silent ones (ADR-0006). An Ingest Run that
 * stopped running produces a reader that simply has nothing new in it, which
 * on a quiet news day looks the same as a reader working perfectly; a Source
 * redesign produces Articles that still read, only worse.
 */
export interface ReaderHealth {
  /**
   * When the last Ingest Run that succeeded wholly finished, or null before
   * the first one there ever was — a database freshly migrated, which is not a
   * degradation and must not be reported as one.
   */
  readonly lastSucceededAt: string | null
  /**
   * The Extraction method split across the Articles the index is showing,
   * rather than across the last Run alone: one bad Run is noise, and what the
   * footer is for is the trend the reader is actually reading.
   */
  readonly extractionMethods: Readonly<Record<ExtractionMethod, number>>
}

/**
 * By `started_at`, matching the index the migration puts on that column, and
 * not by `finished_at`: Runs cannot overlap — the workflow holds a
 * non-cancelling concurrency group — so the two orders agree, and only one of
 * them is indexed.
 */
const SELECT_LAST_SUCCEEDED = `SELECT finished_at
FROM ingest_runs
WHERE outcome = 'succeeded'
ORDER BY started_at DESC
LIMIT 1`

/**
 * The split over the same window the index lists — the same filter and the
 * same limit — so that the footer describes the page it sits at the bottom of
 * rather than the whole thirty-day Stream.
 */
const selectExtractionSplit = (filter: IndexFilter): string => `SELECT
  extraction_method, COUNT(*) AS articles
FROM (SELECT extraction_method FROM articles${where(filter)} ORDER BY published_at DESC LIMIT ?)
GROUP BY extraction_method`

/** How the footer reads its two facts: one round trip, not two. */
export async function readerHealth(
  database: D1Database,
  filter: IndexFilter = NO_FILTER,
  limit: number = INDEX_LIMIT,
): Promise<ReaderHealth> {
  const [succeeded, split] = await database.batch<Record<string, unknown>>([
    database.prepare(SELECT_LAST_SUCCEEDED),
    database.prepare(selectExtractionSplit(filter)).bind(...binds(filter), limit),
  ])

  const extractionMethods = { targeted: 0, readability: 0, stub: 0 }

  for (const row of split?.results ?? []) {
    const method = row['extraction_method'] as ExtractionMethod
    if (method in extractionMethods) extractionMethods[method] = row['articles'] as number
  }

  return {
    lastSucceededAt: (succeeded?.results[0]?.['finished_at'] as string | undefined) ?? null,
    extractionMethods,
  }
}

function toIndexEntry(row: IndexRow): IndexEntry {
  return {
    source: row.source as SourceId,
    guid: row.guid,
    url: row.url,
    headline: row.headline,
    teaser: row.teaser,
    section: row.section as Section,
    publishedAt: row.published_at,
    heroImageUrl: row.hero_image_url,
    isStub: row.extraction_method === 'stub',
    isRead: row.read_at !== null,
    isUpdated: revisedSinceRead(row.updated_at, row.read_at),
  }
}

/**
 * Whether a Revision post-dates the Read. Never for an Article never Read: an
 * Updated Marker on something never opened would be telling the reader that
 * something changed since a moment that never happened.
 */
function revisedSinceRead(updatedAt: string, readAt: string | null): boolean {
  if (readAt === null) return false

  // NaN from either side compares false, which is the right answer: an
  // unreadable timestamp is not evidence of a Revision.
  return new Date(updatedAt).getTime() > new Date(readAt).getTime()
}
