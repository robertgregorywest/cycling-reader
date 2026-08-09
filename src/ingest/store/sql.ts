import type {
  Article,
  ArticleImage,
  SourceId,
  StoredArticle,
  StoredArticleImage,
} from '../../shared/article.ts'
import type { ExtractionMethod } from '../../shared/extraction.ts'
import type { RunOutcome, RunRecord } from '../../shared/run.ts'
import type { Section } from '../../shared/section.ts'

/**
 * The SQL both Article stores run, and the mapping from rows back to domain
 * objects.
 *
 * The two implementations differ in how they reach a database — one binds
 * against a local file, the other posts to D1 over HTTP — but they must not
 * differ in *what they ask it*. A column list written out twice is a column
 * list that will eventually disagree with itself, and the disagreement would
 * surface in production, where the tests are not.
 *
 * The parameter order of each statement is fixed by the matching `…Params`
 * function below it, so the two are read together and changed together.
 */

/** What either store can bind. D1 accepts the same JSON scalars. */
export type SqlValue = string | number | null

export const INSERT_ARTICLE = `INSERT INTO articles (
  source, guid, url, headline, teaser, author, section,
  published_at, updated_at, body_html, extraction_method, text_length,
  hero_image_url, hero_image_alt, first_seen_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

export function insertArticleParams(article: Article): readonly SqlValue[] {
  return [
    article.source,
    article.guid,
    article.url,
    article.headline,
    article.teaser,
    article.author,
    article.section,
    article.publishedAt,
    article.updatedAt,
    article.bodyHtml,
    article.extractionMethod,
    article.textLength,
    article.heroImageUrl,
    article.heroImageAlt,
    article.firstSeenAt,
  ]
}

/**
 * The columns listed here are the ones the Source owns. `read_at` and
 * `saved_at` are the reader's; `published_at` and `first_seen_at` place the
 * Article in the index, and a Revision is not news, so a corrected typo must
 * not masquerade as a new Article. Naming the columns explicitly rather than
 * replacing the row is what keeps that true.
 */
export const UPDATE_ARTICLE = `UPDATE articles SET
  url = ?, headline = ?, teaser = ?, author = ?, section = ?,
  updated_at = ?, body_html = ?, extraction_method = ?, text_length = ?,
  hero_image_url = ?, hero_image_alt = ?
WHERE source = ? AND guid = ?`

export function updateArticleParams(article: Article): readonly SqlValue[] {
  return [
    article.url,
    article.headline,
    article.teaser,
    article.author,
    article.section,
    article.updatedAt,
    article.bodyHtml,
    article.extractionMethod,
    article.textLength,
    article.heroImageUrl,
    article.heroImageAlt,
    article.source,
    article.guid,
  ]
}

export const INSERT_IMAGE = `INSERT INTO article_images (source, guid, position, url, alt, caption)
VALUES (?, ?, ?, ?, ?, ?)`

export function insertImageParams(article: Article, image: ArticleImage): readonly SqlValue[] {
  return [article.source, article.guid, image.position, image.url, image.alt, image.caption]
}

export const DELETE_IMAGES = 'DELETE FROM article_images WHERE source = ? AND guid = ?'

export const SELECT_ARTICLE = 'SELECT * FROM articles WHERE source = ? AND guid = ?'

export const SELECT_IMAGES =
  'SELECT * FROM article_images WHERE source = ? AND guid = ? ORDER BY position'

/**
 * One query answers both questions a Run asks of a Feed item — is it known,
 * and has it been Revised since — for a whole Feed at once.
 *
 * A Feed carries fifty items and D1 permits a hundred bound parameters per
 * statement, so the Source's whole Feed fits in one query with room to spare.
 */
export function selectRevisions(count: number): string {
  const placeholders = new Array(count).fill('?').join(', ')
  return `SELECT guid, updated_at FROM articles WHERE source = ? AND guid IN (${placeholders})`
}

export const INSERT_RUN = `INSERT INTO ingest_runs (
  started_at, finished_at, admitted, revised, targeted, readability, stub, outcome, failure
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`

export function insertRunParams(run: RunRecord): readonly SqlValue[] {
  return [
    run.startedAt,
    run.finishedAt,
    run.admitted,
    run.revised,
    run.extractionMethods.targeted,
    run.extractionMethods.readability,
    run.extractionMethods.stub,
    run.outcome,
    run.failure,
  ]
}

/**
 * The Run before this one, whatever became of it.
 *
 * Whatever became of it, because this is what "newer than the previous Run"
 * is measured against: the last time an Ingest Run looked at the Feeds. A
 * failed Run looked too — it may even have admitted Articles before its
 * tripwire fired — so measuring against the last *successful* Run would raise
 * a second, spurious alarm on top of every real one until the real one is
 * fixed.
 */
export const SELECT_LAST_RUN = 'SELECT * FROM ingest_runs ORDER BY started_at DESC LIMIT 1'

/** A row of `articles`, as either store reads it back. */
export interface ArticleRow {
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
  text_length: number
  hero_image_url: string | null
  hero_image_alt: string | null
  read_at: string | null
  saved_at: string | null
  first_seen_at: string
}

export interface ImageRow {
  position: number
  url: string
  alt: string | null
  caption: string | null
  mirror_key: string | null
}

/** A row of `ingest_runs`, as either store reads it back. */
export interface RunRow {
  started_at: string
  finished_at: string
  admitted: number
  revised: number
  targeted: number
  readability: number
  stub: number
  outcome: string
  failure: string | null
}

export function toRunRecord(row: RunRow): RunRecord {
  return {
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    admitted: row.admitted,
    revised: row.revised,
    extractionMethods: {
      targeted: row.targeted,
      readability: row.readability,
      stub: row.stub,
    },
    outcome: row.outcome as RunOutcome,
    failure: row.failure,
  }
}

export function toStoredArticle(row: ArticleRow): StoredArticle {
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
    textLength: row.text_length,
    heroImageUrl: row.hero_image_url,
    heroImageAlt: row.hero_image_alt,
    readAt: row.read_at,
    savedAt: row.saved_at,
    firstSeenAt: row.first_seen_at,
  }
}

export function toStoredImage(row: ImageRow): StoredArticleImage {
  return {
    position: row.position,
    url: row.url,
    alt: row.alt,
    caption: row.caption,
    mirrorKey: row.mirror_key,
  }
}
