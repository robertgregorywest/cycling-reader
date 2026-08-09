import type {
  Article,
  ArticleImage,
  SourceId,
  StoredArticle,
  StoredArticleImage,
} from '../../shared/article.ts'
import type { RunRecord } from '../../shared/run.ts'
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
 * The production Article store: D1, over its HTTP API.
 *
 * The Ingest Run does not shell out to `wrangler` to write. A CLI invoked per
 * Article would give a subprocess per write, errors only as parsed stderr, and
 * a dependency on whichever wrangler version the runner happened to install.
 * The HTTP API gives real status codes and real error messages.
 *
 * It runs the same statements the SQLite store runs — see `sql.ts` — so what
 * the tests exercise is what production executes.
 */
export class D1ArticleStore implements ArticleStore {
  constructor(private readonly database: D1Database) {}

  async knownRevisions(
    source: SourceId,
    guids: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (guids.length === 0) return new Map()

    const [revisions] = await this.database.batch<{ guid: string; updated_at: string }>([
      { sql: selectRevisions(guids.length), params: [source, ...guids] },
    ])

    return new Map((revisions?.rows ?? []).map((row) => [row.guid, row.updated_at]))
  }

  /**
   * One Article and the images within it in one request. D1 runs the
   * statements of a request in order and as one transaction, so an Article
   * whose images were half-written — a reading experience with holes in it —
   * is not a state this can leave behind.
   */
  async addArticle(article: Article, images: readonly ArticleImage[]): Promise<void> {
    await this.database.batch([
      { sql: INSERT_ARTICLE, params: insertArticleParams(article) },
      ...imageStatements(article, images),
    ])
  }

  async reviseArticle(article: Article, images: readonly ArticleImage[]): Promise<void> {
    const [updated] = await this.database.batch([
      { sql: UPDATE_ARTICLE, params: updateArticleParams(article) },
      // The new body's images replace the old body's rather than joining them:
      // an image at position 3 of a revised Article is the third image the
      // reader now sees, not the third one they saw yesterday.
      { sql: DELETE_IMAGES, params: [article.source, article.guid] },
      ...imageStatements(article, images),
    ])

    // Revising an Article the store does not hold means the Run decided a
    // Revision against something that is not there. ADR-0006: say so. An
    // UPDATE that matched nothing is a success as far as SQL is concerned, so
    // the row count is the only place this is visible.
    if (updated?.changes === 0) {
      throw new Error(`No Article to revise: ${article.source} ${article.guid}`)
    }
  }

  async lastRun(): Promise<RunRecord | null> {
    const [found] = await this.database.batch<RunRow>([{ sql: SELECT_LAST_RUN, params: [] }])

    const row = found?.rows[0]
    return row === undefined ? null : toRunRecord(row)
  }

  async recordRun(run: RunRecord): Promise<void> {
    await this.database.batch([{ sql: INSERT_RUN, params: insertRunParams(run) }])
  }

  async article(source: SourceId, guid: string): Promise<StoredArticle | null> {
    const [found] = await this.database.batch<ArticleRow>([
      { sql: SELECT_ARTICLE, params: [source, guid] },
    ])

    const row = found?.rows[0]
    return row === undefined ? null : toStoredArticle(row)
  }

  async images(source: SourceId, guid: string): Promise<readonly StoredArticleImage[]> {
    const [found] = await this.database.batch<ImageRow>([
      { sql: SELECT_IMAGES, params: [source, guid] },
    ])

    return (found?.rows ?? []).map(toStoredImage)
  }
}

/**
 * One statement per image rather than one multi-row INSERT: D1 permits a
 * hundred bound parameters per statement, and an Article with a generous
 * photo essay in it would exceed that in a single VALUES list. Statements in
 * a request are not similarly capped.
 */
function imageStatements(
  article: Article,
  images: readonly ArticleImage[],
): readonly D1Statement[] {
  return images.map((image) => ({
    sql: INSERT_IMAGE,
    params: insertImageParams(article, image),
  }))
}

/** One statement and the values bound into it, in the order the `?` appear. */
export interface D1Statement {
  readonly sql: string
  readonly params: readonly SqlValue[]
}

/** What a statement did, for the callers that must know. */
export interface D1Result<Row> {
  readonly rows: readonly Row[]
  /** Rows written. Zero from an UPDATE means it matched nothing. */
  readonly changes: number
}

/**
 * The D1 HTTP API, narrowed to the one thing an Ingest Run does with it: send
 * statements and read back what they returned.
 *
 * Kept as an interface so that the store can be exercised in tests against a
 * database that is real — the same migration SQL, the same SQL engine — while
 * the transport is not.
 */
export interface D1Database {
  batch<Row = never>(statements: readonly D1Statement[]): Promise<readonly D1Result<Row>[]>
}

export interface D1Credentials {
  readonly accountId: string
  readonly databaseId: string
  readonly apiToken: string
}

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'

/**
 * D1 over HTTP.
 *
 * Every statement of a call goes in one request, and D1 runs a request's
 * statements as one transaction: a Run that admits fifteen Articles costs
 * fifteen round trips rather than fifteen plus one per image, and each Article
 * arrives whole or not at all.
 *
 * Two limits shape what may be sent, both established against the live API
 * rather than assumed: a statement may bind at most a hundred values, and a
 * request carrying several statements must send them separately rather than as
 * one semicolon-separated string, because that form accepts no parameters.
 */
export class D1HttpDatabase implements D1Database {
  constructor(
    private readonly credentials: D1Credentials,
    /** Injected so a test can serve the API without a network. */
    private readonly fetch: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  /**
   * Read the credentials from the environment, where the workflow puts them
   * from repository secrets. They are never committed: the repository is
   * public (ADR-0002).
   */
  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env): D1HttpDatabase {
    return new D1HttpDatabase({
      accountId: required(environment, 'CLOUDFLARE_ACCOUNT_ID'),
      databaseId: required(environment, 'D1_DATABASE_ID'),
      apiToken: required(environment, 'CLOUDFLARE_API_TOKEN'),
    })
  }

  async batch<Row = never>(
    statements: readonly D1Statement[],
  ): Promise<readonly D1Result<Row>[]> {
    const { accountId, databaseId, apiToken } = this.credentials
    const response = await this.fetch(
      `${CLOUDFLARE_API}/accounts/${accountId}/d1/database/${databaseId}/query`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiToken}`,
          'content-type': 'application/json',
        },
        // Statements travel individually, each with its own values. The
        // endpoint's other shape — one `sql` string of several statements —
        // takes no parameters at all ("params with multiple statements is not
        // supported"), and inlining an Article's body into SQL text is not a
        // trade this system makes.
        body: JSON.stringify({
          batch: statements.map((statement) => ({
            sql: statement.sql,
            params: statement.params,
          })),
        }),
      },
    )

    const body = (await response.json().catch(() => null)) as D1ResponseBody<Row> | null

    // Failure is loud and carries D1's own words: an Ingest Run that swallowed
    // a rejected write would leave a gap in the reader that nothing reports.
    if (!response.ok || body === null || body.success !== true) {
      throw new Error(`D1 refused the write: ${describe(response.status, body)}`)
    }

    return body.result.map((result) => ({
      rows: result.results ?? [],
      changes: result.meta?.changes ?? 0,
    }))
  }
}

interface D1ResponseBody<Row> {
  readonly success: boolean
  readonly errors?: readonly { readonly code?: number; readonly message?: string }[]
  readonly result: readonly {
    readonly results?: readonly Row[]
    readonly meta?: { readonly changes?: number }
  }[]
}

function describe(status: number, body: D1ResponseBody<unknown> | null): string {
  const errors = body?.errors ?? []
  if (errors.length === 0) return `HTTP ${status}`
  return errors.map((error) => `${error.message ?? 'unknown'} (${error.code ?? status})`).join('; ')
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set. See docs/setup.md.`)
  }
  return value
}
