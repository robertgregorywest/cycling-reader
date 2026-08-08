# The repository is public; the content is not

GitHub Actions bills 2,000 minutes/month on private repositories but is
unmetered on public ones. At a two-hourly cadence an Ingest Run costs roughly
2–3 minutes, or ~900 minutes/month — survivable privately, but leaving no
headroom for the Mirroring and Expiry jobs. The repository is therefore public.

This is safe because **publishing the repository does not publish the reading
experience**: Articles, Read state and the Archive live exclusively in D1 and
R2, never in git. What becomes public is the extractor, the schema and the
Worker — code with no confidentiality value.

## Consequences

Credentials must live in GitHub Secrets and Worker secrets without exception; a
committed `.env` is now a public disclosure rather than a private embarrassment.
Anyone reading the repository can see which Sources are ingested and how, which
is accepted.
