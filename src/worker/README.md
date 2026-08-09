# The Worker

The reading experience: a Hono application with server-rendered JSX, deployed
to Cloudflare Workers and reachable from any device behind a single passphrase.

It **reads and never writes Articles**. Extraction happens in an Ingest Run on
GitHub Actions, where there is no 10 ms CPU ceiling
([ADR-0001](../../docs/adr/0001-split-ingest-and-serve-runtimes.md)), and body
HTML arrives here already sanitised — so the Worker emits it verbatim and pays
no sanitisation cost at render time. The security invariant sits at exactly one
boundary, and that boundary is ingest.

| File | Holds |
| --- | --- |
| `index.tsx` | The application: the routes, and the fetch handler Cloudflare runs and the tests drive |
| `session.ts` | The passphrase exchanged for a signed cookie, and the guard every other route sits behind |
| `store.ts` | The reader's own SQL. Ingest's statements live in `ingest/store/sql.ts`; the two ask different questions of the same columns |
| `filters.ts` | The lens the index is read through — a Section, a Source, or both — carried in the URL |
| `images.ts` | The Source CDN's width convention, applied at render time |
| `body.ts` | The stored body made ready to render: responsive images, and a box for a results table to scroll in |
| `appearance.ts` | Light and dark, and the cookie the reader's override lives in ([ADR-0008](../../docs/adr/0008-appearance-is-a-cookie-not-a-script.md)) |
| `fonts/` | The reading typeface, bundled as bytes and served from a route |
| `time.ts` | Relative time, as the index shows it, and how old is stale |
| `styles.ts` | The stylesheet, served from a route so that it too sits behind the passphrase |
| `views/` | The pages |

## Everything is behind the passphrase

Cloudflare Access cannot protect a `workers.dev` hostname
([ADR-0003](../../docs/adr/0003-passphrase-auth-not-cloudflare-access.md)), so
there is no edge layer enforcing privacy and `requireSession` is registered
over `*` before any route. A route added later is therefore private by default
rather than by remembering. The sign-in page is the single exception, and it
carries its own inline styling for that reason: it cannot link to a stylesheet
it is not allowed to fetch.

## Running it

```sh
pnpm dev          # wrangler dev, against the live D1 database
pnpm run deploy   # what the push-to-main workflow runs
```

Both need `PASSPHRASE_HASH` and `COOKIE_SECRET`. In production they are Worker
secrets; locally they go in `.dev.vars`, which is git-ignored. See
[`docs/setup.md`](../../docs/setup.md).

## What is not here yet

Prev/next, Saving and the Archive — tickets #11 onwards.

**Every index entry for a Stub links straight to its Source**, because
following that link is the whole of how a Stub is read. The Stub's own page
exists and renders properly — headline, teaser, hero image and the link out —
for a Stub arrived at directly, and for the prev/next navigation that will walk
past one.
