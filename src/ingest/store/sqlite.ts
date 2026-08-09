import { DatabaseSync } from 'node:sqlite'
import type {
  Article,
  ArticleImage,
  SourceId,
  StoredArticle,
  StoredArticleImage,
} from '../../shared/article.ts'
import type { RunRecord } from '../../shared/run.ts'
import { applyMigrations } from './migrations.ts'
import {
  DELETE_IMAGES,
  INSERT_ARTICLE,
  INSERT_IMAGE,
  INSERT_RUN,
  SELECT_ARTICLE,
  SELECT_IMAGES,
  SELECT_LAST_RUN,
  UPDATE_ARTICLE,
  insertArticleParams,
  insertImageParams,
  insertRunParams,
  selectRevisions,
  toRunRecord,
  toStoredArticle,
  toStoredImage,
  updateArticleParams,
  type ArticleRow,
  type ImageRow,
  type RunRow,
  type SqlValue,
} from './sql.ts'
import type { ArticleStore } from './store.ts'

/**
 * The local SQLite Article store: what the tests write to, and what the CLI
 * writes to so that an Ingest Run can be inspected by opening a file.
 *
 * It exists to be a *real* store rather than a convenient one. It runs the
 * same migration SQL as D1 and the same statements as the D1 store, so a
 * column that is missing, misnamed or too strict in production fails here
 * first.
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
    applyMigrations(database)
    return new SqliteArticleStore(database)
  }

  close(): void {
    this.database.close()
  }

  async knownRevisions(
    source: SourceId,
    guids: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (guids.length === 0) return new Map()

    const rows = this.database
      .prepare(selectRevisions(guids.length))
      .all(source, ...guids) as { guid: string; updated_at: string }[]

    return new Map(rows.map((row) => [row.guid, row.updated_at]))
  }

  async addArticle(article: Article, images: readonly ArticleImage[]): Promise<void> {
    // One Article and its images are one write: an Article whose images were
    // half-written would be a reading experience with holes in it.
    this.transaction(() => {
      this.run(INSERT_ARTICLE, insertArticleParams(article))
      this.writeImages(article, images)
    })
  }

  async reviseArticle(article: Article, images: readonly ArticleImage[]): Promise<void> {
    this.transaction(() => {
      const revised = this.run(UPDATE_ARTICLE, updateArticleParams(article))

      // Revising an Article the store does not hold means the Run decided a
      // Revision against something that is not there. ADR-0006: say so.
      if (revised.changes === 0) {
        throw new Error(`No Article to revise: ${article.source} ${article.guid}`)
      }

      // The new body's images replace the old body's rather than joining them:
      // an image at position 3 of a revised Article is the third image the
      // reader now sees, not the third one they saw yesterday.
      this.run(DELETE_IMAGES, [article.source, article.guid])
      this.writeImages(article, images)
    })
  }

  private writeImages(article: Article, images: readonly ArticleImage[]): void {
    for (const image of images) {
      this.run(INSERT_IMAGE, insertImageParams(article, image))
    }
  }

  async lastRun(): Promise<RunRecord | null> {
    const row = this.database.prepare(SELECT_LAST_RUN).get() as RunRow | undefined

    return row === undefined ? null : toRunRecord(row)
  }

  async recordRun(run: RunRecord): Promise<void> {
    this.run(INSERT_RUN, insertRunParams(run))
  }

  async article(source: SourceId, guid: string): Promise<StoredArticle | null> {
    const row = this.database.prepare(SELECT_ARTICLE).get(source, guid) as ArticleRow | undefined

    return row === undefined ? null : toStoredArticle(row)
  }

  async images(source: SourceId, guid: string): Promise<readonly StoredArticleImage[]> {
    const rows = this.database.prepare(SELECT_IMAGES).all(source, guid) as unknown as ImageRow[]

    return rows.map(toStoredImage)
  }

  private run(sql: string, params: readonly SqlValue[]): { changes: number | bigint } {
    return this.database.prepare(sql).run(...params)
  }

  private transaction(write: () => void): void {
    this.database.exec('BEGIN')
    try {
      write()
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}
