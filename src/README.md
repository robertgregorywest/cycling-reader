# Source layout

One package, three source roots — two deploy targets do not justify workspace
overhead at this size.

| Root | Runtime | Holds |
| --- | --- | --- |
| `ingest/` | Node, on GitHub Actions | The Ingest Run: Feeds, the Section Allowlist, Extraction, writes to D1 |
| `worker/` | Cloudflare Workers | The reading experience. Reads only; never extracts |
| `shared/` | Both | Domain types and the schema the two runtimes agree on |

`ingest/` may import from `shared/`. `worker/` may import from `shared/`.
Neither imports from the other: they run on different runtimes with different
budgets, which is the whole point of
[ADR-0001](../docs/adr/0001-split-ingest-and-serve-runtimes.md).
