# Cycling Reader — agent instructions

A private, single-user ad-free reader for cycling journalism. Read
[`CONTEXT.md`](CONTEXT.md) before writing code — this project's vocabulary is
precise and several near-synonyms mean different things.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, via the `gh` CLI. External PRs are not
a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical labels, unchanged: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See
`docs/agents/domain.md`.

## This repository is public

The code is public; the reading data is not. Secrets belong in GitHub Secrets
and Worker secrets, never in the repo and never in an issue. See
[ADR-0002](docs/adr/0002-public-repository-private-content.md).
