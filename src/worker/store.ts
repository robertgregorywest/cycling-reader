import type { SourceId } from '../shared/article.ts'
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
