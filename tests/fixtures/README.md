# The fixture corpus

Real HTML and RSS from both Sources, committed so that a Future PLC redesign
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

## The Feed corpus

`feeds/cyclingnews.xml` and `feeds/cyclingweekly.xml` are the Feeds the Ingest
Run is driven with. Between them they carry every case admission has to decide:

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

The Ingest Run tests serve each Article's page from `pages/` by its URL, and
serve `cyclingnews-removed-article` for any Article the page corpus does not
hold — which is the page a Run meets when an Article is pulled after the Feed
advertised it. The `travel` Article is served
`cyclingweekly-redesigned-body-container`, so that one Extraction in every Run
takes the Readability path.

### The two normalisations

Each file holds the six items above out of the fifty the Feed served, and the
contents of `<content:encoded>` are emptied. Everything else — the channel
header, the whitespace, the escaping — is as served.

Emptying `<content:encoded>` records a decision rather than saving space: the
Feeds carry a partial body there, and the reader never reads it. Bodies come
from the Article's page, so a fixture that offered one would let a bug pass
unnoticed.

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
