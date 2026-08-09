# D1 is reached over its HTTP API, including for migrations

An Ingest Run writes to D1 over the HTTP API rather than by shelling out to
`wrangler` from the Action. A CLI invoked per Article would give a subprocess
per write, errors available only as parsed stderr, and a dependency on whichever
wrangler version the runner happened to install that morning. The HTTP API gives
real status codes and D1's own error text, which is what ADR-0006 needs to fail
loudly against.

**Migrations are applied the same way**, by `pnpm migrate`, which is a departure
from the original plan of `wrangler d1 migrations apply`. Wrangler's D1
subcommands require a configuration file naming the database by id, and this
repository is public (ADR-0002). Applying `migrations/*.sql` over the same HTTP
client keeps every Cloudflare identifier in secrets, and keeps wrangler's
bookkeeping — the same `d1_migrations` table, one row per file, applied in name
order — so the two remain interchangeable if that constraint ever relaxes.

## Consequences

Three facts about the API are load-bearing, and were established against the
live endpoint rather than from documentation, which describes none of them:

- A request may carry several statements, each with its own bound values, as
  `{"batch": [{"sql": …, "params": […]}, …]}`. The documented shape — one `sql`
  string of semicolon-separated statements — accepts no parameters at all, and
  inlining an Article's body into SQL text is not a trade this system makes.
- D1 runs a request's statements as one transaction. An Article and the images
  within it are therefore written whole or not at all, which is why they are
  sent together.
- A statement may bind at most a hundred values. A Feed of fifty items fits in
  one query; an Article's images take one statement each rather than a single
  multi-row insert, which would not.

A fake of the HTTP endpoint stands in for the network in tests, so the D1 store
is exercised against the real migration SQL and a real SQL engine with no
Cloudflare account. It is deliberately strict about the three facts above: the
first draft of the store batched the way the documentation implied, and the
suite passed against a fake that was wrong in the same way. Only the live API
said otherwise.
