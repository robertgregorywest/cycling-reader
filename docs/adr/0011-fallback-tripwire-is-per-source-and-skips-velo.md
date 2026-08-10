# The Readability-fallback tripwire is judged per Source, and Velo is exempt

ADR-0006 fails a Run when the Readability-fallback rate exceeds 20%, reasoning
that the Sources do not reach that rate "without something having changed at
them" (ADR-0004). That reasoning assumed every Source runs the platform the
targeted extractor's `#article-body` selector is written against. Onboarding
Velo broke the assumption in two ways at once.

**Velo is not on that platform**, so its Articles take the Readability path
unconditionally — checked directly against its fixture corpus (`tests/fixtures/
golden/velo-*.html`), none of which extract as `targeted`. A rate summed
across every Source, as ADR-0006 originally computed it, would therefore
permanently exceed 20% the moment Velo represents any meaningful share of a
Run's bodies — not because anything redesigned, but because a wholly healthy
Run now includes a Source that was never going to be targeted.

**The sum was already the wrong shape**, independent of Velo. `admittedNothingNew`
is deliberately judged per Source, with the comment explaining why: "a redesign
… happens to one Source while the other carries on, and a Run summed across
both would hide it." The identical argument applies to the fallback rate, and
had simply not yet been exercised by a Source shaped differently enough to
expose it.

`fallbackRateTooHigh` therefore iterates `run.sources` rather than reading
`run.extractionMethods`, judging each Source against its own targeted/Readability
split, and `SourceConfig` gained `targetedExtraction: boolean` — `false` for
Velo — so a Source is excluded from the check entirely rather than judged
against a rate it could never fall under. `SourceReport` carries a copy of the
flag rather than the tripwire looking it up again by id: `ingest` is a seam a
test drives with a `SourceConfig` it built itself, and a tripwire that
re-fetched the real, checked-in config by id would silently judge the wrong
Source whenever a test's Source diverged from it.

## Consequences

A Cyclingnews or Cycling Weekly redesign is now caught *and named* rather than
diluted into a Run-wide average alongside a healthy Source — the failure
message reads `cyclingnews: Readability produced …` rather than a bare
percentage. `MINIMUM_EXTRACTIONS` (5) is now a per-Source floor: a Source
contributing a handful of bodies to a Run is no longer judged at all, which is
the same tolerance ADR-0006 always intended, applied at the granularity the
tripwire actually reasons at.

If Velo's markup ever settles into something a targeted selector could cover,
flipping `targetedExtraction` to `true` re-admits it to the check — nothing
else about this decision would need to change.
