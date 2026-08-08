# Ingest runs on GitHub Actions; serving runs on Cloudflare Workers

Cloudflare's Workers free plan allows **10 ms of CPU and 50 subrequests per
invocation**, which is hostile to Extraction — DOM parsing costs tens to
hundreds of milliseconds per Article, and one Ingest Run needs far more than 50
outbound fetches. Rather than chunk Extraction across cron invocations to
appease those limits, an Ingest Run executes as a scheduled GitHub Action on
full Node, with no CPU ceiling and unrestricted npm access, writing finished
rows into D1 over HTTP; the Worker only ever reads.

## Consequences

Ingestion is a batch workload on a batch runtime and serving is a read workload
on an edge runtime, so neither is optimised against the other's constraints. The
Extraction code is plain Node, which means it can be run locally against saved
HTML with no network, no Cloudflare account and no deploy — the property that
makes recovering from a Source redesign a twenty-minute job. The cost is two
deployment targets and a credential shared between them.
