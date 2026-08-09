import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import type {
  Article,
  ArticleImage,
  SourceId,
  StoredArticle,
  StoredArticleImage,
} from '../../shared/article.ts'
import type { ExtractionMethod } from '../../shared/extraction.ts'
import type { Section } from '../../shared/section.ts'
import type { ArticleStore } from './store.ts'

/** The migrations D1 runs in production, applied here to a local file. */
const MIGRATIONS = new URL('../../../migrations/', import.meta.url)

/**
 * The local SQLite Article store: what the tests write to, and what the CLI
 * writes to so that an Ingest Run can be inspected by opening a file.
 *
 * It exists to be a *real* store rather than a convenient one. It runs the
 * same migration SQL as D1, so a column that is missing, misnamed or too
 * strict in production fails here first.
 */
export class SqliteArticleStore implements ArticleStore {
  private constructor(private readonly database: DatabaseSync) {}

  /**
   * Open a database and bring it up to the current schema. `:memory:` gives a
   * database that lives as long as the store, which is what tests want.
   */
  static open(path: string): SqliteArticleStore {
    const database = new DatabaseSync(path)
    database.exec('PRAGMA foreign_keys = ON')
    migrate(database)
    return new SqliteArticleStore(database)
  }

  close(): void {
    this.database.close()
  }

  async knownGuids(source: SourceId, guids: readonly string[]): Promise<ReadonlySet<string>> {
    if (guids.length === 0) return new Set()

    const placeholders = guids.map(() => '?').join(', ')
    const rows = this.database
      .prepare(`SELECT guid FROM articles WHERE source = ? AND guid IN (${placeholders})`)
      .all(source, ...guids) as { guid: string }[]

    return new Set(rows.map((row) => row.guid))
  }

  async addArticle(article: Article, images: readonly ArticleImage[]): Promise<void> {
    // One Article and its images are one write: an Article whose images were
    // half-written would be a reading experience with holes in it.
    this.database.exec('BEGIN')
    try {
      this.database
        .prepare(
          `INSERT INTO articles (
             source, guid, url, headline, teaser, author, section,
             published_at, updated_at, body_html, extraction_method, text_length,
             hero_image_url, hero_image_alt, first_seen_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
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
        )

      const insertImage = this.database.prepare(
        `INSERT INTO article_images (source, guid, position, url, alt, caption)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      for (const image of images) {
        insertImage.run(
          article.source,
          article.guid,
          image.position,
          image.url,
          image.alt,
          image.caption,
        )
      }

      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  async article(source: SourceId, guid: string): Promise<StoredArticle | null> {
    const row = this.database
      .prepare('SELECT * FROM articles WHERE source = ? AND guid = ?')
      .get(source, guid) as ArticleRow | undefined

    return row === undefined ? null : toArticle(row)
  }

  async images(source: SourceId, guid: string): Promise<readonly StoredArticleImage[]> {
    const rows = this.database
      .prepare('SELECT * FROM article_images WHERE source = ? AND guid = ? ORDER BY position')
      .all(source, guid) as unknown as ImageRow[]

    return rows.map((row) => ({
      position: row.position,
      url: row.url,
      alt: row.alt,
      caption: row.caption,
      mirrorKey: row.mirror_key,
    }))
  }
}

/**
 * Apply every migration the database has not seen, in name order. The record
 * of what has been applied is kept the way `wrangler d1 migrations` keeps it,
 * so the same directory drives both stores.
 */
function migrate(database: DatabaseSync): void {
  database.exec(
    `CREATE TABLE IF NOT EXISTS d1_migrations (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT UNIQUE,
       applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
     )`,
  )

  const applied = new Set(
    (database.prepare('SELECT name FROM d1_migrations').all() as { name: string }[]).map(
      (row) => row.name,
    ),
  )

  const directory = fileURLToPath(MIGRATIONS)
  const pending = readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .filter((name) => !applied.has(name))

  for (const name of pending) {
    database.exec(readFileSync(fileURLToPath(new URL(name, MIGRATIONS)), 'utf8'))
    database.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name)
  }
}

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
  text_length: number
  hero_image_url: string | null
  hero_image_alt: string | null
  read_at: string | null
  saved_at: string | null
  first_seen_at: string
}

interface ImageRow {
  position: number
  url: string
  alt: string | null
  caption: string | null
  mirror_key: string | null
}

function toArticle(row: ArticleRow): StoredArticle {
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
