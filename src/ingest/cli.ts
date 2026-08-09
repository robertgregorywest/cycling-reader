/**
 * Run an Ingest Run against a local SQLite file, for real, so that what it did
 * can be inspected by opening the database rather than inferred from a test.
 *
 *   pnpm ingest                        # writes ./local/cycling-reader.db
 *   pnpm ingest --db /tmp/reader.db
 *   pnpm ingest --source cyclingweekly # one Source only
 *
 * The file it writes is local and ignored by git: this repository is public
 * and the reading content is not.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { SOURCES } from './config.ts'
import { ingest, type IngestReport } from './run.ts'
import { SqliteArticleStore } from './store/sqlite.ts'

const DEFAULT_DATABASE = 'local/cycling-reader.db'

/** The Sources answer a browser-shaped request; they are entitled to know us. */
const USER_AGENT = 'cycling-reader (+https://github.com/robertgregorywest/cycling-reader)'

const options = parseArguments(process.argv.slice(2))
const sources = SOURCES.filter(
  (source) => options.source === null || source.id === options.source,
)

if (sources.length === 0) {
  console.error(`No such Source: ${options.source}`)
  console.error(`Sources: ${SOURCES.map((source) => source.id).join(', ')}`)
  process.exit(1)
}

mkdirSync(dirname(options.database), { recursive: true })
const store = SqliteArticleStore.open(options.database)

try {
  const report = await ingest({
    sources,
    fetchFeed: fetchText,
    fetchPage: fetchText,
    now: () => new Date(),
    store,
  })
  print(options.database, report)
} finally {
  store.close()
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  return await response.text()
}

function print(database: string, report: IngestReport): void {
  console.log(`database    ${database}`)
  console.log(`started     ${report.startedAt}`)
  console.log(`finished    ${report.finishedAt}`)
  console.log(`admitted    ${report.admitted}`)
  console.log(`revised     ${report.revised}`)
  console.log(`skipped     ${counts(report.skipped)}`)
  console.log(`extraction  ${counts(report.extractionMethods)}`)
  console.log()

  for (const source of report.sources) {
    console.log(`${source.source}`)
    console.log(`  feed items  ${source.feedItems}`)
    console.log(`  admitted    ${source.admitted}`)
    console.log(`  revised     ${source.revised}`)
    console.log(`  skipped     ${counts(source.skipped)}`)
    console.log(`  extraction  ${counts(source.extractionMethods)}`)
  }
}

function counts(record: Readonly<Record<string, number>>): string {
  const reported = Object.entries(record).filter(([, count]) => count > 0)
  if (reported.length === 0) return 'none'
  return reported.map(([name, count]) => `${name} ${count}`).join(', ')
}

function parseArguments(argv: readonly string[]): {
  readonly database: string
  readonly source: string | null
} {
  let database = DEFAULT_DATABASE
  let source: string | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (flag === '--db' && value !== undefined) {
      database = value
      index += 1
    } else if (flag === '--source' && value !== undefined) {
      source = value
      index += 1
    } else {
      console.error(`Usage: pnpm ingest [--db <path>] [--source <${SOURCES.map((entry) => entry.id).join('|')}>]`)
      process.exit(1)
    }
  }

  return { database, source }
}
