# Extraction is targeted first, Readability second, Stub last

Mozilla Readability is the default answer for this problem, and it was rejected
as the *primary* strategy. Both Sources run the same Future PLC platform and
render bodies server-side into a stable `#article-body` container, so a targeted
extractor covers both publications with one implementation. More importantly,
Readability is a paragraph-density heuristic and discards what looks peripheral
— which includes **classification and results tables**, frequently the most
valuable part of a race report.

Extraction therefore tries the targeted selector, validates the result, falls
back to Readability when validation fails, and stores a Stub when that fails
too. Every Article records which method produced it.

## Consequences

A Source redesign breaks the targeted path, and without instrumentation the
fallback would absorb the failure silently while Articles quietly got worse.
Recording the method per Article turns that into a visible cliff in the data
rather than a vague sense that the reader has degraded.

The Tag Allowlist is an allowlist rather than a denylist for the same reason: a
denylist means every new promotional widget Future ships lands in the reading
view until noticed, whereas an allowlist fails towards omitting something rare.
Because Extraction runs at ingest, stored bodies are already clean and the
Worker emits them verbatim — no sanitisation cost is paid at render time, and
the security invariant lives at exactly one boundary.
