import { Hono } from 'hono'
import { isAppearance, readAppearance, rememberAppearance } from './appearance.ts'
import type { Env } from './env.ts'
import { FONT_PATH_PREFIX, fontByFile } from './fonts/index.ts'
import { SIGN_IN_PATH, correctPassphrase, requireSession, startSession } from './session.ts'
import { indexEntries, markRead, readerArticle, readerHealth } from './store.ts'
import { STYLESHEET, STYLESHEET_PATH } from './styles.ts'
import { ArticlePage } from './views/article.tsx'
import { APPEARANCE_PATH } from './views/chrome.tsx'
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

  return c.html(
    document(
      <IndexPage
        entries={entries}
        health={health}
        appearance={readAppearance(c)}
        now={new Date()}
      />,
    ),
  )
})

/**
 * One Article. Opening it is what marks it Read — never scrolling past it in
 * the index — and the mark is written before the page is returned, so that the
 * laptop picked up at lunch already knows what the phone read at breakfast.
 *
 * The write is on a GET, which is ordinarily a thing not to do. It is right
 * here: opening an Article is the reader's whole intent, and the alternative
 * is read state managed by hand, which is the chore this exists to remove.
 * Nothing about the Article's content is touched — that is ingest's alone
 * (ADR-0001) — and the write is idempotent, so a reload costs one no-op UPDATE.
 */
app.get('/article/:source/:guid', async (c) => {
  const article = await readerArticle(c.env.DB, c.req.param('source'), c.req.param('guid'))

  // An Article that Expired while its link sat in another tab. Not an error
  // worth a page of its own: the index is where the reader wants to be.
  if (article === null) return c.notFound()

  await markRead(c.env.DB, article, new Date())

  return c.html(document(<ArticlePage article={article} appearance={readAppearance(c)} />))
})

/**
 * The appearance, changed. A form post and a redirect, because the reader runs
 * no JavaScript: the preference is stored where the server can see it, so a
 * page is rendered in the chosen appearance rather than corrected into it
 * after paint.
 */
app.post(APPEARANCE_PATH, async (c) => {
  const form = await c.req.parseBody()
  const chosen = form['appearance']

  if (isAppearance(chosen)) rememberAppearance(c, chosen)

  return c.redirect(returnTo(form['return']), 303)
})

/**
 * Where the appearance control sends the reader back to. Only a path within
 * the reader is honoured: a form field is the reader's own input, and an open
 * redirect is a thing to not have rather than a thing to not worry about.
 */
function returnTo(field: unknown): string {
  if (typeof field !== 'string') return '/'
  if (!field.startsWith('/') || field.startsWith('//')) return '/'

  return field
}

/**
 * The reading typeface, from the Worker's own bundle.
 *
 * Behind the passphrase like everything else (ADR-0003), and immutable for a
 * year: the file name is the name of the subset it holds, and a change to the
 * font is a new deploy of a new script rather than a stale cache.
 */
app.get(`${FONT_PATH_PREFIX}:file`, (c) => {
  const font = fontByFile(c.req.param('file'))

  if (font === undefined) return c.notFound()

  return c.body(font.bytes, 200, {
    'content-type': 'font/woff2',
    'cache-control': 'public, max-age=31536000, immutable',
  })
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
