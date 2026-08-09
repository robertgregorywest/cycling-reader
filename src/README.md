# Source layout

One package, four source roots — two deploy targets do not justify workspace
overhead at this size.

| Root | Runtime | Holds |
| --- | --- | --- |
| `ingest/` | Node, on GitHub Actions | The Ingest Run: Feeds, the Section Allowlist, Extraction, writes to D1 |
| `expiry/` | Node, on GitHub Actions | Expiry: the retention horizon, and the deletion behind it |
| `worker/` | Cloudflare Workers | The reading experience. Reads only; never extracts |
| `shared/` | Both | Domain types and the schema the two runtimes agree on |

Each root is checked against the types of the runtime it runs on:
`tsconfig.json` covers the Node half and `tsconfig.worker.json` the Worker,
where `process` does not exist and `D1Database` does. `pnpm typecheck` runs
both, and `pnpm test` runs the matching pair of Vitest projects — `node`, and
`worker` inside workerd itself against a real D1 binding.

`migrations/` at the repository root holds the schema. It is applied to D1 by
`pnpm migrate` and to the local SQLite store by the store itself, so the two
implementations cannot drift. Both stores also run the same statements, which
live in `ingest/store/sql.ts` for the same reason.

`ingest/` may import from `shared/`. `worker/` may import from `shared/`.
Neither imports from the other: they run on different runtimes with different
budgets, which is the whole point of
[ADR-0001](../docs/adr/0001-split-ingest-and-serve-runtimes.md).

`expiry/` is on the Node side of that line and may import from `shared/` and
from `ingest/store/`, whose D1 transport and migrations are how anything on
this side of the line reaches the database — `scripts/migrate.ts` reaches for
the same two. It is a root of its own rather than a file inside `ingest/`
because Expiry is not part of an Ingest Run and must not be able to become one:
a wedged ingest must not stop deletion, and an Expiry bug must not stop the
reader updating
([ADR-0005](../docs/adr/0005-stream-expires-archive-persists.md)).
