# Cycling Reader

A private, single-user reading application for cycling journalism. It ingests
articles from a small set of publications on a schedule, strips the advertising
and page furniture, and serves what remains as a calm reading experience
available from any device.

> **This repository is public; the reading experience is not.** Articles, read
> state and saved items live in Cloudflare D1 and R2 — never in git. What is
> public here is the extractor, the schema and the Worker. See
> [ADR-0002](docs/adr/0002-public-repository-private-content.md).

## Design

Read [`CONTEXT.md`](CONTEXT.md) first — it defines the vocabulary the code uses.
Terms like Stream, Archive, Stub, Section and New have precise meanings here and
are not interchangeable with their everyday senses.

The decisions behind the architecture, and the alternatives rejected, are in
[`docs/adr/`](docs/adr/):

| ADR | Decision |
| --- | --- |
| [0001](docs/adr/0001-split-ingest-and-serve-runtimes.md) | Ingest on GitHub Actions, serve on Cloudflare Workers |
| [0002](docs/adr/0002-public-repository-private-content.md) | Public repository, private content |
| [0003](docs/adr/0003-passphrase-auth-not-cloudflare-access.md) | In-app passphrase rather than Cloudflare Access |
| [0004](docs/adr/0004-targeted-extraction-with-readability-fallback.md) | Targeted extraction, Readability fallback, Stub last |
| [0005](docs/adr/0005-stream-expires-archive-persists.md) | Stream expires at 30 days; saving mirrors to an archive |
| [0006](docs/adr/0006-ingest-runs-fail-loudly.md) | Ingest runs assert their own success |

## Shape

```
Ingest  ── GitHub Actions, every 2h ──────────────────────────────┐
          parse feeds → section allowlist → skip paid & live      │
          → fetch new and revised → extract → write D1            │
                                                                  ▼
Serve   ── Cloudflare Worker (Hono, server-rendered) ────────  D1 + R2
          passphrase cookie → compact index → article view

Lifecycle  stream expires at 30 days; saving mirrors images and keeps
```

## Status

Extraction, its fixture corpus, and the Ingest Run into a local SQLite store
are built. Revision detection, D1, the health tripwires and the Worker are not.

## Working on it

```sh
pnpm install
pnpm test          # no network required, or permitted
pnpm typecheck
pnpm extract                          # list the fixture corpus
pnpm extract cyclingnews-race-report  # print an Extraction, to inspect by eye
pnpm extract cyclingnews-race-report --text
pnpm golden:update # after changing Extraction on purpose; read the diff
pnpm ingest        # an Ingest Run against both live Feeds, into local/
pnpm ingest --db /tmp/reader.db --source cyclingweekly
```

`pnpm ingest` is the only command here that touches the network. It writes a
SQLite file, applying the same migrations D1 runs, so an Ingest Run can be
inspected by opening the database. The file is git-ignored: the repository is
public and the reading content is not.

[`src/README.md`](src/README.md) explains the source layout;
[`migrations/`](migrations/) holds the schema both stores run against;
[`tests/fixtures/README.md`](tests/fixtures/README.md) explains the corpus and
how to refresh it after a Source redesign.

## Running costs

£0. Cloudflare Workers, D1 and R2 free tiers; GitHub Actions is unmetered on
public repositories.
