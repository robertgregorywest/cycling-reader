import { DatabaseSync } from 'node:sqlite'
import type { D1Credentials } from '../../src/ingest/store/d1.ts'
import { applyMigrations } from '../../src/ingest/store/migrations.ts'

/**
 * D1's HTTP API, served in the test process from a real SQLite database.
 *
 * The point of this is narrow and worth stating: it fakes *the network*, and
 * nothing else. The schema is the migration SQL D1 runs, the SQL engine is
 * SQLite as D1 is, and the statements are the ones the production store emits.
 * What is stubbed is the transport — so the D1 store can be held to the same
 * behaviour the SQLite store is held to, in a suite that takes no network and
 * no Cloudflare account.
 *
 * It is deliberately strict: a request with the wrong token, the wrong path or
 * a statement SQLite rejects comes back as a failure in the shape the real API
 * returns, because the store's handling of those is the part that only shows
 * up in production otherwise.
 */

export const TEST_CREDENTIALS: D1Credentials = {
  accountId: 'account-under-test',
  databaseId: 'database-under-test',
  apiToken: 'token-under-test',
}

/** A request as the endpoint takes it: statements, each with its own values. */
export interface FakeD1Request {
  readonly batch: readonly { readonly sql: string; readonly params?: readonly unknown[] }[]
}

export interface FakeD1 {
  /** Pass to `D1HttpDatabase` in place of the global. */
  readonly fetch: typeof globalThis.fetch
  /** The requests it has served, for asserting on how writes were batched. */
  readonly requests: readonly FakeD1Request[]
  close(): void
}

/**
 * `migrated: false` gives what Cloudflare hands over when a D1 database is
 * created: nothing at all, not even the record of what has been applied.
 */
export function fakeD1({ migrated = true }: { readonly migrated?: boolean } = {}): FakeD1 {
  const database = new DatabaseSync(':memory:')
  database.exec('PRAGMA foreign_keys = ON')
  if (migrated) applyMigrations(database)

  const requests: FakeD1Request[] = []
  const path = `/client/v4/accounts/${TEST_CREDENTIALS.accountId}/d1/database/${TEST_CREDENTIALS.databaseId}/query`

  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input.toString())
    const headers = new Headers(init?.headers)

    if (headers.get('authorization') !== `Bearer ${TEST_CREDENTIALS.apiToken}`) {
      return failure(401, 10000, 'Authentication error')
    }
    if (url.pathname !== path) {
      return failure(404, 7404, `No D1 database at ${url.pathname}`)
    }

    const body = JSON.parse(String(init?.body)) as FakeD1Request
    requests.push(body)

    try {
      return success(execute(database, body.batch))
    } catch (error) {
      // D1 reports a rejected statement as a failed request, not as a 200 with
      // a sad result in it.
      return failure(500, 7500, error instanceof Error ? error.message : String(error))
    }
  }

  return {
    fetch: fetch as typeof globalThis.fetch,
    requests,
    close: () => database.close(),
  }
}

interface StatementResult {
  readonly results: readonly Record<string, unknown>[]
  readonly meta: { readonly changes: number }
}

/**
 * Run a request's statements in order, as one transaction — which is what D1
 * does with them, and what lets an Article and its images be written as one
 * thing.
 *
 * A statement carrying no values may itself be several statements, because
 * that is the one form D1 accepts semicolon-separated SQL in, and it is how a
 * migration file is applied. One with values may not be, and is refused here
 * in D1's own words, so that a batching mistake fails in the suite rather than
 * against the live database.
 */
function execute(
  database: DatabaseSync,
  batch: FakeD1Request['batch'],
): readonly StatementResult[] {
  const results: StatementResult[] = []

  database.exec('BEGIN')
  try {
    for (const { sql, params = [] } of batch) {
      const before = totalChanges(database)

      if (statementCount(sql) > 1) {
        if (params.length > 0) {
          throw new Error(
            'The request is malformed: params with multiple statements is not supported',
          )
        }

        // `exec` takes several statements, which is exactly the latitude D1
        // gives an unparameterised one. Rows are not reported back from this
        // form, and nothing sending it — applying a migration file — reads
        // any.
        database.exec(sql)
        results.push({ results: [], meta: { changes: totalChanges(database) - before } })
        continue
      }

      // D1 binds at most a hundred values to a statement.
      if (params.length > 100) {
        throw new Error(`too many SQL variables: ${params.length}`)
      }

      const rows = database.prepare(sql).all(...(params as never[])) as Record<string, unknown>[]
      results.push({ results: rows, meta: { changes: totalChanges(database) - before } })
    }

    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  return results
}

/** Statements in a fragment of SQL, counted the crude way that suffices for
 * SQL this repository wrote: no semicolon appears inside a literal, because
 * every value travels as a bound parameter. */
function statementCount(sql: string): number {
  return sql.split(';').filter((statement) => statement.trim() !== '').length
}

function totalChanges(database: DatabaseSync): number {
  return (database.prepare('SELECT total_changes() AS changes').get() as { changes: number })
    .changes
}

function success(result: readonly StatementResult[]): Response {
  return Response.json({ success: true, errors: [], messages: [], result })
}

function failure(status: number, code: number, message: string): Response {
  return Response.json({ success: false, errors: [{ code, message }], result: [] }, { status })
}
