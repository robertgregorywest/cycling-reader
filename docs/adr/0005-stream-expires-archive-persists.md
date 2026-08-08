# Stream Articles expire at 30 days; Saving promotes to a Mirrored Archive

Storage is not the constraint — ~100 Articles/day at ~30 KB is ~1.3 GB/year
against D1's 5 GB free tier, so everything could simply be kept. Retention is a
*reading* decision instead: the reader is for following cycling day to day, and
an index that accumulates indefinitely stops being calm.

Expiry is therefore by **age alone** — 30 days, `saved = 0` — rather than by
read state or a fixed cap. Age-plus-read-state and newest-N caps both make the
horizon unpredictable, and a deletion rule the user cannot predict feels
indistinguishable from data loss even when working correctly.

## Consequences

Expiry is irreversible and runs unattended, so `published_at` is `NOT NULL` at
insert, the delete predicate is explicit about `saved = 0`, and each run logs a
count so an anomalous spike is visible.

Saving is the single act that promotes an Article from Stream to Archive, and it
triggers Mirroring **synchronously**. Deferring Mirroring to a nightly job would
leave a window in which a Saved Article could lose its images to a CDN purge —
precisely the failure archiving exists to prevent. Stream images are hotlinked
from Future's CDN, which imposes no hotlink protection, sets `immutable`
year-long caching, and exposes arbitrary widths through a `-{width}-{quality}`
filename convention, giving responsive `srcset` at no cost. Canonical CDN URLs
are stored unrewritten so Mirroring can fill in a nullable mirror key later
without re-extraction.
