# The fixture corpus

Real HTML and RSS from every Source, committed so that a Source redesign
presents as a failing test rather than a guessing game, and so that Extraction
and the Ingest Run can be repaired with no network and no cloud account. See
[ADR-0004](../../docs/adr/0004-targeted-extraction-with-readability-fallback.md).

`pages/` holds the pages. `golden/` holds the body each page currently extracts
to; `corpus.ts` records where each page came from. `feeds/` holds one Feed per
Source, recorded in `feeds.ts`.

## What each page is here to cover

| Fixture | Covers |
| --- | --- |
| `cyclingnews-race-report` | A race report with a stage result and a general classification table |
| `cyclingnews-news-item` | A short news item |
| `cyclingnews-paid-article` | A paid Article (`cf:isPaid` is `true` in the Feed) |
| `cyclingnews-live-blog` | A live blog |
| `cyclingnews-removed-article` | A page that defeats both paths, yielding a Stub |
| `cyclingweekly-race-report` | The same race, on the second Source |
| `cyclingweekly-news-item` | A short news item on the second Source |
| `cyclingweekly-tech-review` | A tech piece |
| `cyclingweekly-redesigned-body-container` | A page that defeats the targeted path, so Readability runs |
| `velo-race-report` | A race report on a Source running neither platform above |
| `velo-womens-race-report` | Tagged `Women's Cycling` in the Feed, refining `racing` into `womens` (ADR-0010) |
| `velo-news-item` | A short news item |
| `velo-tech-piece` | A gear piece under `road/road-gear` |
| `velo-tech-piece-gravel` | A gear piece under `gravel/gravel-gear`, proving the longest-prefix win over `gravel` |
| `velo-unrecognised-path` | A path the Section Allowlist does not map, admitted as `other` |

Every Velo page here extracts by Readability: Velo runs no platform the
targeted extractor's `#article-body` selector recognises, so the targeted path
is never expected to succeed for it (ADR-0011) — there is no Velo equivalent
of `cyclingweekly-redesigned-body-container`, because no live Velo page
behaves any differently from another in this respect.

## The Feed corpus

`feeds/cyclingnews.xml`, `feeds/cyclingweekly.xml` and `feeds/velo.xml` are the
Feeds the Ingest Run is driven with. Between the first two they carry every
case admission has to decide:

| Item | Covers |
| --- | --- |
| `pro-cycling/racing/…felix-gall…` | An Article whose page is in `pages/` and extracts cleanly |
| `pro-cycling/womens-cycling/…van-der-breggen…` | A second mapped Section on the same Source |
| `pro-cycling/teams-riders/…pogacar…` | An item with no `updated`, whose page is gone — a Stub |
| `pro-cycling/doping/…carboni…` | A path mapped to `news` rather than to its own Section |
| `pro-cycling/live/…stage-8-live…` | A live blog, excluded |
| `cycling-tech-components/…disc-brake…` | A paid Article (`cf:isPaid` is `true`), excluded |
| `racing/…vollering…`, `news/…papa-was…` | Cycling Weekly's two mapped Sections |
| `products/…`, `group-tests/…`, `reviews/pedals/…` | Commerce paths, excluded |
| `travel/…` | An unrecognised path, admitted as `other` |

`feeds/velo.xml` carries the six pages above, admitting cleanly into `racing`,
`womens` (via Category, not path — ADR-0010), `news`, `tech` twice (proving
the longest-prefix win) and `other`. Velo has no commerce path distinct from
its gear coverage to exclude, and no paid flag or live blog to demonstrate —
see the `SourceConfig` comments in `src/ingest/config.ts`.

The Ingest Run tests serve each Article's page from `pages/` by its URL, and
serve `cyclingnews-removed-article` for any Article the page corpus does not
hold — which is the page a Run meets when an Article is pulled after the Feed
advertised it. The `travel` Article is served
`cyclingweekly-redesigned-body-container`, so that one Extraction in every Run
takes the Readability path.

### Velo's Feed shape

Velo's `<description>` is a WordPress excerpt, not the plain teaser text the
other two Sources carry: a leading `<figure><img>` holding the hero image (Velo
sets no `media:content` or `enclosure` at all), the real teaser text, then a
"Read the full article at… on…" line pointing back at the Source. `parseFeed`
parses it as HTML rather than reading it as plain text so that one path covers
both shapes — see `parseDescription` in `src/ingest/feed.ts`.

Velo's Feed also carries no `<updated>` element on any item, ever: every
Article is judged by `pubDate` alone, which `revisionOf` already falls back to.
`tests/node/ingest/feed.test.ts` skips the "carries an updated timestamp on
some items" assertion for this Source rather than asserting something the
Source never does.

### Revisions

No fixture records a Revision, because a Revision is a Feed served twice rather
than a second document: the tests re-serve the same Feed with one item's
`updated` — or, for the item carrying none, its `pubDate` — advanced, which is
exactly what a Source does when a race report gains its results.

### The two normalisations

Each file holds the six items above out of the fifty the Feed served, and the
contents of `<content:encoded>` are emptied. Everything else — the channel
header, the whitespace, the escaping — is as served.

Emptying `<content:encoded>` records a decision rather than saving space: the
Feeds carry a partial body there, and the reader never reads it. Bodies come
from the Article's page, so a fixture that offered one would let a bug pass
unnoticed. Velo's Feed carries no `<content:encoded>` at all, so `feeds/velo.xml`
holds its six items exactly as served, with nothing emptied.

## Provenance

Every page was retrieved from its Source on the date recorded in `corpus.ts`,
which also holds the URL. Two entries need explaining:

- **`cyclingnews-removed-article`** is the Source's own 404 page, served for an
  article path that does not exist. It is the page an Ingest Run meets when an
  Article is pulled after the Feed advertised it, and it defeats both paths.
- **`cyclingweekly-redesigned-body-container`** is `cyclingweekly-news-item`
  with `id="article-body"` renamed to `id="article-content"`, and nothing else
  altered. Both Sources run the same platform and render the same container, so
  no live page defeats the targeted path while leaving an Article behind it —
  which is exactly the failure the Readability fallback exists for. Renaming the
  container is the smallest faithful stand-in for the redesign.

Every Velo page's retrieval date is later than the other two Sources': it was
onboarded afterwards. Velo item dates in `feeds/velo.xml` were deliberately
chosen from before the fixed clock the Ingest Run tests anchor to
(`2026-08-09T06:00:00Z`) rather than from the day of retrieval — an item dated
after it would read, to `admittedNothingNew`, as a Run that dropped something
on the floor.

## The one normalisation

The contents of `<script>` and `<style>` elements are emptied; the elements
themselves, and every other byte, are as served. This is a 85% size reduction on
pages that are mostly bundled JavaScript, and it cannot affect Extraction:
bodies are server-rendered, the targeted path never looks at scripts, and
Readability discards them before it starts.

## Refreshing a fixture

Fetch the page, empty its script and style contents, and replace the file. Then
run `pnpm golden:update` and **read the diff** — it is the only view of what the
reader will actually be shown. A change to `golden/` is a change to the reading
experience, and belongs in the commit that caused it.

A Feed fixture is refreshed the same way: fetch the Feed, keep the items the
table above names, empty `<content:encoded>`, and update `retrievedAt` and the
item count in `feeds.ts`. The Ingest Run tests assert exact counts, so a
refresh that changes what the Feed offers will say so.

## Copyright

These pages are third-party journalism, retained here as test fixtures for a
single-user personal tool, in the way a browser cache retains them. They are not
served to anyone: the reader's own content lives in D1 and R2 and never in git
([ADR-0002](../../docs/adr/0002-public-repository-private-content.md)).
