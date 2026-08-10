# A Section Allowlist may refine `racing` into `womens` by Category, per Source

Section admission is by URL path alone ([`admission.ts`](../../src/ingest/admission.ts)),
deliberately: Categories are a Source's own raw labels, not comparable between
Sources, and a single Article carries several. That held for Cyclingnews and
Cycling Weekly, which both separate `pro-cycling/womens-cycling` (or
equivalent) from `pro-cycling/racing` at the path level.

Velo — not yet an onboarded Source, but the case this decision anticipates —
does not. A Tour de France Femmes report and a Tour de France report sit at
the same depth under `road/road-racing`; nothing in the path distinguishes
them. Left alone, every Article Velo publishes about the women's peloton would
be admitted as `racing`, indistinguishable from the men's.

Velo's Feed does reliably tag this coverage `Women's Cycling`. Rather than
generalise Section admission to read Categories everywhere — reopening the
comparability problem the path-only rule exists to avoid — `SourceConfig`
gained one narrow, opt-in field: `categorySections`. A Source with no entries
is unaffected. Where entries exist, they refine a `racing` result only —
never `tech`, `news`, or any other Section — into the mapped Section, keyed by
the Source's own literal Category string. Onboarding Velo itself — its Feed
fixture, page corpus and golden Extractions — is separate work; this decision
only concerns admission's shape once that happens.

## Consequences

The refinement is scoped as tightly as the problem: it fires once, after path
resolution, and only on `racing`. A gear Article Velo happens to tag `Women's
Cycling` stays `tech`; only the racing bucket is ever split by this path.

This is a per-Source escape hatch, not a second admission mechanism. Adding a
fourth Source whose paths *do* separate `womens` from `racing` should use
`sectionPaths`, as Cyclingnews and Cycling Weekly do — `categorySections`
exists for the case where the path genuinely carries no such signal at all.

Velo's Category strings are read verbatim from its Feed and are exactly as
fragile as any other scraped label: a rename on Velo's end (`Women's Cycling`
becoming something else) silently drops the refinement rather than erroring,
and the Article falls back to `racing`. Nothing currently surfaces that
regression; the same silent-degradation risk [ADR-0004](0004-targeted-extraction-with-readability-fallback.md)
accepts for Extraction method is accepted here for the same reason — the
alternative is validating a Source's own vocabulary at ingest, which is more
machinery than a five-word admission rule earns.
