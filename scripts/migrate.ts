/**
 * Apply the migrations to D1.
 *
 *   pnpm migrate         # apply everything D1 has not seen
 *   pnpm migrate --list  # say what that would be, and stop
 *
 * The local SQLite store needs none of this: it applies the same files itself
 * when it opens. D1 is the one database that has to be told.
 *
 * Credentials come from the environment — a local `.dev.vars` here, repository
 * secrets in a workflow. See docs/setup.md.
 */
import { D1HttpDatabase } from '../src/ingest/store/d1.ts'
import { applyMigrationsToD1, pendingMigrationsOnD1 } from '../src/ingest/store/migrations.ts'

const list = process.argv.slice(2).includes('--list')

const database = D1HttpDatabase.fromEnvironment()

if (list) {
  const pending = await pendingMigrationsOnD1(database)

  for (const name of pending) console.log(`pending  ${name}`)
  console.log(pending.length === 0 ? 'D1 is already at the current schema' : `${pending.length} pending`)
} else {
  const applied = await applyMigrationsToD1(database)

  for (const name of applied) console.log(`applied  ${name}`)
  console.log(
    applied.length === 0 ? 'D1 is already at the current schema' : `${applied.length} applied to D1`,
  )
}
