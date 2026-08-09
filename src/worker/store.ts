import type { SourceId } from '../shared/article.ts'
import type { ExtractionMethod } from '../shared/extraction.ts'
import type { Section } from '../shared/section.ts'

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
}

/**
 * Enough to scroll through without being a second day's reading, and small
 * enough that the page stays quick on a phone. The Stream is thirty days deep
 * and arrives at roughly a hundred Articles a day, so an unbounded index would
 * be thousands of entries; nothing in the reader is served by rendering them.
 */
export const INDEX_LIMIT = 100

const SELECT_INDEX = `SELECT
  source, guid, url, headline, teaser, section, published_at,
  hero_image_url, extraction_method
FROM articles
ORDER BY published_at DESC
LIMIT ?`

interface IndexRow {
  source: string
  guid: string
  url: string
  headline: string
  teaser: string
  section: string
  published_at: string
  hero_image_url: string | null
  extraction_method: string
}

/**
 * The index, newest first.
 *
 * By publication and not by first seen: a Revision is not news, and an Article
 * corrected this morning must not climb back over what has been published
 * since.
 */
export async function indexEntries(
  database: D1Database,
  limit: number = INDEX_LIMIT,
): Promise<readonly IndexEntry[]> {
  const { results } = await database.prepare(SELECT_INDEX).bind(limit).all<IndexRow>()

  return results.map(toIndexEntry)
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
 * The split over the same window the index lists, so that the footer describes
 * the page it sits at the bottom of rather than the whole thirty-day Stream.
 */
const SELECT_EXTRACTION_SPLIT = `SELECT extraction_method, COUNT(*) AS articles
FROM (SELECT extraction_method FROM articles ORDER BY published_at DESC LIMIT ?)
GROUP BY extraction_method`

/** How the footer reads its two facts: one round trip, not two. */
export async function readerHealth(
  database: D1Database,
  limit: number = INDEX_LIMIT,
): Promise<ReaderHealth> {
  const [succeeded, split] = await database.batch<Record<string, unknown>>([
    database.prepare(SELECT_LAST_SUCCEEDED),
    database.prepare(SELECT_EXTRACTION_SPLIT).bind(limit),
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
  }
}
