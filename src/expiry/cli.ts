/**
 * Run Expiry: delete Stream Articles past the retention horizon.
 *
 *   pnpm expire                  # prunes ./local/cycling-reader.db
 *   pnpm expire --db /tmp/reader.db
 *   pnpm expire --store d1       # what the daily workflow runs, against D1
 *
 * Expiry is deliberately not part of an Ingest Run. On its own schedule, a
 * wedged ingest does not stop deletion and an Expiry bug does not stop the
 * reader updating (ADR-0005).
 *
 * `--store d1` needs the three Cloudflare credentials in the environment —
 * from repository secrets in the workflow, and from a local `.dev.vars` here.
 * See docs/setup.md.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { D1HttpDatabase } from '../ingest/store/d1.ts'
import { expire, RETENTION_DAYS, type ExpiryReport } from './expire.ts'
import { D1ExpiryStore, SqliteExpiryStore, type ExpiryStore } from './store.ts'

const DEFAULT_DATABASE = 'local/cycling-reader.db'

const options = parseArguments(process.argv.slice(2))
const target = open(options)

let report: ExpiryReport
try {
  report = await expire({ store: target.store, now: () => new Date() })
} finally {
  target.close()
}

// The count is the point of the run being reported at all: Expiry is
// irreversible and unattended, so an anomalous number is only visible if every
// run says what its number was.
console.log(`store       ${target.description}`)
console.log(`started     ${report.startedAt}`)
console.log(`finished    ${report.finishedAt}`)
console.log(`retention   ${RETENTION_DAYS} days`)
console.log(`horizon     ${report.horizon}`)
console.log(`deleted     ${report.deleted}`)

function open(options: Options): {
  readonly store: ExpiryStore
  readonly description: string
  readonly close: () => void
} {
  if (options.store === 'd1') {
    return {
      store: new D1ExpiryStore(D1HttpDatabase.fromEnvironment()),
      description: 'D1',
      close: () => {},
    }
  }

  mkdirSync(dirname(options.database), { recursive: true })
  const store = SqliteExpiryStore.open(options.database)
  return { store, description: options.database, close: () => store.close() }
}

interface Options {
  readonly store: 'sqlite' | 'd1'
  readonly database: string
}

function parseArguments(argv: readonly string[]): Options {
  let store: Options['store'] = 'sqlite'
  let database = DEFAULT_DATABASE

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (flag === '--db' && value !== undefined) {
      database = value
      index += 1
    } else if (flag === '--store' && (value === 'sqlite' || value === 'd1')) {
      store = value
      index += 1
    } else {
      console.error('Usage: pnpm expire [--store <sqlite|d1>] [--db <path>]')
      process.exit(1)
    }
  }

  return { store, database }
}
