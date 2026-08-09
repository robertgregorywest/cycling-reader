# Setup

The steps only a human can perform, ordered by when they are first needed. Most
of the system needs none of them: Extraction and the Ingest Run into a local
SQLite store run with nothing but Node.

Nothing here is required to run `pnpm test` — the suite takes no network and no
credentials.

## Now — local development

Needed for tickets #2, #3 and #4. No Cloudflare account, no money, no network
at test time.

- **Node 22.13 or newer** — the version this repo declares in `engines`.
- **pnpm 10.15** — pinned via `packageManager`, so `corepack enable` gets you
  the right one.

```sh
node -v
corepack enable
pnpm install
pnpm test
```

`pnpm ingest` is the one local command that reaches the network: it runs an
Ingest Run against both live Feeds and writes a SQLite file under `local/`,
which is git-ignored because the repository is public and the reading content
is not.

## Before ticket #5 — Cloudflare

Ticket [#5](https://github.com/robertgregorywest/cycling-reader/issues/5) is the
first that needs an account. Work through these in order.

### 1. Create a Cloudflare account

Free tier at [dash.cloudflare.com](https://dash.cloudflare.com). No domain is
required — the reader is served from a `workers.dev` subdomain, which is why
authentication is an in-app passphrase rather than Cloudflare Access
([ADR-0003](adr/0003-passphrase-auth-not-cloudflare-access.md)).

No payment method is needed for Workers or D1.

### 2. Authenticate wrangler

Interactive; opens a browser. Needed to create the database and the bucket, and
again at ticket #7 to deploy the Worker. Nothing in the ingest path uses
wrangler: it reaches D1 over the HTTP API
([ADR-0007](adr/0007-d1-over-http-not-wrangler.md)).

```sh
npx wrangler login
```

### 3. Find your account ID

```sh
npx wrangler whoami
```

### 4. Create the D1 database

```sh
npx wrangler d1 create cycling-reader
```

Record the database ID it prints.

### 5. Create the R2 bucket

```sh
npx wrangler r2 bucket create cycling-reader-images
```

> **Expect friction here, and only here.** Activating R2 for the first time on
> an account typically asks for a payment method, even though the free tier —
> 10 GB of storage, no egress fees — costs nothing to use at this scale. This is
> the one place the £0 claim meets a card form.
>
> **This step is skippable for now.** R2 is used only by ticket
> [#12](https://github.com/robertgregorywest/cycling-reader/issues/12) (Saving,
> Mirroring and the Archive). Tickets #5 through #11 never touch it, so skipping
> this yields a complete, working reader without the durable Archive. If you
> would rather not put a card on file at all, the alternative is to mirror
> images into D1 as blobs — less clean, but comfortably inside the 5 GB tier for
> a personal Archive, and it keeps the system card-free.

### 6. Create an API token

Dashboard → **My Profile** → **API Tokens** → **Create Token** → **Custom
token**.

| Scope | Permission |
| --- | --- |
| Account · Workers Scripts | Edit |
| Account · D1 | Edit |
| Account · Workers R2 Storage | Edit — omit if step 5 was skipped |

The token is shown once. Copy it before leaving the page.

### 7. Add the GitHub Secrets

Each command prompts for the value, so nothing reaches your shell history.

```sh
gh secret set CLOUDFLARE_API_TOKEN     # from step 6
gh secret set CLOUDFLARE_ACCOUNT_ID    # from step 3
gh secret set D1_DATABASE_ID           # from step 4
```

The repository is public
([ADR-0002](adr/0002-public-repository-private-content.md)), so a committed
credential is a public disclosure. Secrets live here and in Worker secrets,
never in the repository and never in an issue.

### 8. Keep the same three values locally

The ingest and migration commands read them from the environment. A `.dev.vars`
file in the repository root is git-ignored and is loaded automatically:

```sh
CLOUDFLARE_ACCOUNT_ID=…
D1_DATABASE_ID=…
CLOUDFLARE_API_TOKEN=…
```

### 9. Create the schema in D1

```sh
pnpm migrate --list   # what D1 has not seen yet
pnpm migrate          # apply it
```

This applies `migrations/*.sql` — the same files the local SQLite store applies
to itself — and records them the way `wrangler d1 migrations` would. Run it
again whenever a migration is added; it is idempotent.

### 10. Let Actions commit

**Settings** → **Actions** → **General** → **Workflow permissions** → **Read and
write permissions**.

The ingest workflow commits a heartbeat so that GitHub's sixty-day auto-disable
of scheduled workflows never silently stops the system
([ADR-0006](adr/0006-ingest-runs-fail-loudly.md)). Without this setting the
workflow fails with a permissions error that reads like an authentication
problem.

## Before ticket #7 — the reader

### Choose a passphrase

It guards everything. Set it directly as a Worker secret; it should not be
written down in this repository, in an issue, or in a chat transcript.

```sh
npx wrangler secret put PASSPHRASE_HASH
npx wrangler secret put COOKIE_SECRET
```

For `COOKIE_SECRET`, paste the output of:

```sh
openssl rand -base64 32
```

`PASSPHRASE_HASH` is a hash of your chosen passphrase, not the passphrase
itself. The exact command to produce it depends on the algorithm the Worker
uses and is documented in ticket
[#7](https://github.com/robertgregorywest/cycling-reader/issues/7).

### Choose a workers.dev subdomain

The first deploy prompts for one if the account has never deployed a Worker. The
reader will then live at:

```
cycling-reader.<your-subdomain>.workers.dev
```

That is the URL bookmarked on every device, so pick something you are content to
type.

## Notes

**Scheduled workflows only run from the default branch.** The ingest, Expiry and
export crons stay dormant until their workflow files are merged to `main`. This
is expected, not a misconfiguration.

**The body typeface is vendored, not fetched.** Source Serif 4 is OFL-licensed,
so the subset variable font is committed to the repository. No runtime request
to a third party, and nothing to sign up for.

## Summary

| Ticket | What you need |
| --- | --- |
| #2–#4 | Node 22.13, pnpm |
| #5 | Cloudflare account, wrangler login, D1 database, API token, three GitHub Secrets, the same three in `.dev.vars`, `pnpm migrate`, Actions write permission |
| #7 | A passphrase, a `workers.dev` subdomain |
| #12 | An R2 bucket — the only step that may want a payment method |
