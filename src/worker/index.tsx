import { Hono } from 'hono'
import type { Env } from './env.ts'
import { SIGN_IN_PATH, correctPassphrase, requireSession, startSession } from './session.ts'
import { indexEntries, readerHealth } from './store.ts'
import { STYLESHEET, STYLESHEET_PATH } from './styles.ts'
import { IndexPage } from './views/index.tsx'
import { document } from './views/page.tsx'
import { SignInPage } from './views/sign-in.tsx'

/**
 * The reader. A Hono application is a fetch handler, which is both what
 * Cloudflare runs and what the tests drive directly.
 *
 * It reads and never writes Articles: Extraction happens in an Ingest Run on
 * GitHub Actions, where there is no 10 ms CPU ceiling (ADR-0001). Body HTML
 * arrives here already sanitised, so the Worker emits it verbatim and pays no
 * sanitisation cost at render time — the security invariant sits at exactly
 * one boundary, and that boundary is ingest.
 */
const app = new Hono<{ Bindings: Env }>()

/**
 * First, and over everything. Nothing this application serves is public
 * except the sign-in page itself — including the stylesheet, because there is
 * no edge layer enforcing that and a route added later must be behind the
 * check by default rather than by remembering (ADR-0003).
 */
app.use('*', requireSession())

app.get(SIGN_IN_PATH, (c) => c.html(document(<SignInPage failed={false} />)))

/**
 * A wrong passphrase re-renders the form with a 401 rather than redirecting:
 * the reader has typed something and deserves to be told it was wrong in the
 * same breath.
 *
 * There is no rate limit here beyond the cost of the key derivation. The
 * hostname is unadvertised, the passphrase is long and generated, and a
 * counter would need somewhere to live — a D1 write on every failed attempt is
 * a worse trade than it looks for a single-user reader.
 */
app.post(SIGN_IN_PATH, async (c) => {
  const submitted = (await c.req.parseBody())['passphrase']

  if (typeof submitted !== 'string' || !(await correctPassphrase(c, submitted))) {
    return c.html(document(<SignInPage failed={true} />), 401)
  }

  await startSession(c, new Date())

  // 303, so that a reload of the index is a reload of the index rather than a
  // resubmitted passphrase.
  return c.redirect('/', 303)
})

app.get('/', async (c) => {
  const [entries, health] = await Promise.all([indexEntries(c.env.DB), readerHealth(c.env.DB)])

  return c.html(document(<IndexPage entries={entries} health={health} now={new Date()} />))
})

/**
 * Immutable, because the stylesheet is part of the deployed Worker: a change
 * to it is a new deploy and a new script, never a stale cache.
 */
app.get(STYLESHEET_PATH, (c) =>
  c.body(STYLESHEET, 200, {
    'content-type': 'text/css; charset=utf-8',
    'cache-control': 'public, max-age=31536000, immutable',
  }),
)

export default app
