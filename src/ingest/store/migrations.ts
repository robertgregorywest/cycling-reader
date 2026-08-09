import { readFileSync, readdirSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import type { D1Database } from './d1.ts'

/**
 * The migrations, and applying them to either database.
 *
 * `migrations/` is the one description of the schema: the local SQLite store
 * applies it when it opens, and D1 has it applied by `pnpm migrate`. Two store
 * implementations against one directory of SQL is what stops the production
 * schema and the tested schema from drifting apart.
 *
 * Applying them to D1 is done here rather than by `wrangler d1 migrations`
 * because wrangler requires the database's id in a configuration file, and
 * this repository is public (ADR-0002). The bookkeeping is wrangler's, though
 * — the same `d1_migrations` table, the same one-row-per-file record — so the
 * two remain interchangeable.
 */

const MIGRATIONS = new URL('../../../migrations/', import.meta.url)

/** The table `wrangler d1 migrations` keeps its record in, kept here too. */
const MIGRATIONS_TABLE = 'd1_migrations'

/** Every migration file, in name order. */
export function migrationNames(): readonly string[] {
  return readdirSync(fileURLToPath(MIGRATIONS))
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

export function readMigration(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, MIGRATIONS)), 'utf8')
}

/**
 * Apply every migration the database has not seen, in name order. The record
 * of what has been applied is kept the way `wrangler d1 migrations` keeps it,
 * so the same directory drives both stores.
 */
export function applyMigrations(database: DatabaseSync): void {
  database.exec(CREATE_MIGRATIONS_TABLE)

  const applied = new Set(
    (database.prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`).all() as { name: string }[]).map(
      (row) => row.name,
    ),
  )

  for (const name of migrationNames().filter((name) => !applied.has(name))) {
    database.exec(readMigration(name))
    database.prepare(RECORD_MIGRATION).run(name)
  }
}

const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
)`

const RECORD_MIGRATION = `INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (?)`

/**
 * Apply to D1 every migration it has not seen, in name order, and answer with
 * what was applied.
 *
 * Each migration goes in one request with the row recording it, so a migration
 * that half-applied and then claimed to be done is not a state this can leave
 * behind. Migrations are applied one request at a time rather than all at
 * once, so that a failure stops at the file that failed with the ones before
 * it recorded.
 */
export async function applyMigrationsToD1(database: D1Database): Promise<readonly string[]> {
  const pending = await pendingMigrationsOnD1(database)

  for (const name of pending) {
    // A migration file is several statements sent as one, which D1 permits
    // only where nothing is bound into them — so a migration is written as
    // literal SQL, and the name recorded alongside it travels separately.
    await database.batch([
      { sql: readMigration(name), params: [] },
      { sql: RECORD_MIGRATION, params: [name] },
    ])
  }

  return pending
}

/**
 * The migrations D1 has not seen, in the order they would be applied. Creates
 * the record table if this is the first time anything has asked, which is what
 * makes a fresh database answer with everything rather than an error.
 */
export async function pendingMigrationsOnD1(database: D1Database): Promise<readonly string[]> {
  await database.batch([{ sql: CREATE_MIGRATIONS_TABLE, params: [] }])

  const [record] = await database.batch<{ name: string }>([
    { sql: `SELECT name FROM ${MIGRATIONS_TABLE}`, params: [] },
  ])
  const applied = new Set((record?.rows ?? []).map((row) => row.name))

  return migrationNames().filter((name) => !applied.has(name))
}
