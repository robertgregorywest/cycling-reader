# An Ingest Run must fail loudly, because its failures are otherwise invisible

Every plausible failure in this system is silent. A Source redesign routes
Extraction to the Readability fallback and Articles quietly get worse. GitHub
disables scheduled workflows after 60 days of repository inactivity, and "no new
cycling news" is indistinguishable from a quiet news day. A changed Feed URL
produces a run that ingests nothing and exits green. In three of those cases the
Action passes, and GitHub only sends mail on failure — so a green tick beside an
empty database is the default outcome.

An Ingest Run therefore asserts its own success and exits non-zero when a Feed
parses to zero items, when nothing new is admitted despite the Feed's newest
item post-dating the previous run, or when the Readability-fallback rate exceeds
20%.

## Consequences

Failures arrive as mail rather than as a page someone has to remember to visit.
Last successful run, Articles added, and the Extraction method split are
additionally surfaced in the index footer, because staleness is the failure most
worth noticing and the index is the one place guaranteed to be looked at.

A fixture corpus of real Source HTML backs this up: golden tests assert that
results tables survive, that `.ad-unit` and newsletter blocks do not, and that
bodies never begin with the share bar's "Copy link". When a Source redesigns, a
new fixture turns the breakage into a failing test instead of a guessing game.
The workflow also commits a heartbeat so the 60-day auto-disable never fires,
and holds a non-cancelling concurrency group so a slow run cannot race the next.
