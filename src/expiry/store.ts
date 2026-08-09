import { DatabaseSync } from 'node:sqlite'
import type { D1Database } from '../ingest/store/d1.ts'
import { applyMigrations } from '../ingest/store/migrations.ts'

/**
 * Where an Expiry run deletes, and the SQL it deletes with.
 *
 * Two real implementations again, for the reason the Article store has two
 * (`ingest/store/store.ts`): D1 over HTTP is what the schedule runs, and the
 * local SQLite file is what the tests run and what `pnpm expire` prunes when
 * asked to look at a database on disk. A hand-written fake would let the suite
 * pass while the production predicate was wrong, and this predicate is the one
 * in the system whose mistakes cannot be undone.
 */
export interface ExpiryStore {
  /**
   * Delete every Stream Article published before `horizon`, and the image
   * records within them. Answers with how many Articles went.
   */
  expire(horizon: string): Promise<number>
}

/**
 * The two halves of the delete predicate, written once and bound identically
 * into both statements below.
 *
 * `saved_at IS NULL` is the Archive's exemption and is stated explicitly
 * rather than left to a join or a flag — Expiry is irreversible, so the
 * condition that protects the Archive is one line, in the same place, in both
 * statements.
 *
 * `published_at IS NOT NULL` is redundant against the schema, which declares
 * the column NOT NULL precisely so that Expiry has an age to judge by, and
 * `published_at < ?` would exclude a null anyway. It is written out because
 * the failure it guards against — an Article with no publication timestamp
 * quietly matching, or quietly never expiring — is invisible until it has
 * already happened.
 */
const PAST_THE_HORIZON = 'saved_at IS NULL AND published_at IS NOT NULL AND published_at < ?'

/**
 * The images first, while the Articles that own them are still there.
 *
 * The foreign key would cascade this, but the cascade depends on
 * `PRAGMA foreign_keys` being on in whichever database is running the
 * statement, and an orphaned image row is a row nothing will ever look at
 * again to notice. Deleting them explicitly makes the outcome the same
 * everywhere, and makes the Article count that follows a count of Articles
 * rather than of Articles plus their photographs.
 */
export const DELETE_EXPIRED_IMAGES = `DELETE FROM article_images WHERE (source, guid) IN (
  SELECT source, guid FROM articles WHERE ${PAST_THE_HORIZON}
)`

export const DELETE_EXPIRED_ARTICLES = `DELETE FROM articles WHERE ${PAST_THE_HORIZON}`

/** Expiry against D1: what the daily workflow runs. */
export class D1ExpiryStore implements ExpiryStore {
  constructor(private readonly database: D1Database) {}

  /**
   * Both statements in one request, which D1 runs as one transaction: an
   * Article whose images were deleted while the Article itself survived would
   * be a page with holes in it, and there is no run afterwards that would
   * repair it.
   */
  async expire(horizon: string): Promise<number> {
    const [, articles] = await this.database.batch([
      { sql: DELETE_EXPIRED_IMAGES, params: [horizon] },
      { sql: DELETE_EXPIRED_ARTICLES, params: [horizon] },
    ])

    return articles?.changes ?? 0
  }
}

/** Expiry against a local SQLite file: the tests, and `pnpm expire --db`. */
export class SqliteExpiryStore implements ExpiryStore {
  private constructor(private readonly database: DatabaseSync) {}

  static open(path: string): SqliteExpiryStore {
    const database = new DatabaseSync(path)
    database.exec('PRAGMA foreign_keys = ON')
    // The same migrations D1 runs, so a predicate that names a column the
    // schema does not have fails here rather than in production.
    applyMigrations(database)
    return new SqliteExpiryStore(database)
  }

  close(): void {
    this.database.close()
  }

  async expire(horizon: string): Promise<number> {
    this.database.exec('BEGIN')
    try {
      this.database.prepare(DELETE_EXPIRED_IMAGES).run(horizon)
      const articles = this.database.prepare(DELETE_EXPIRED_ARTICLES).run(horizon)
      this.database.exec('COMMIT')
      return Number(articles.changes)
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}
