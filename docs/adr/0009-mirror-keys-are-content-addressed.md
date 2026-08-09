# Mirror keys are the digest of the image's canonical URL, and the Archive is a destination

Saving copies an Article's images into R2 synchronously, before Saving reports
success ([ADR-0005](0005-stream-expires-archive-persists.md)). That leaves two
questions this decides: what an object is called, and where the reader finds
what they have kept.

## The key is `sha256(canonical URL)` plus the published extension

Not the Article's identity — `source/guid/position` would have been the obvious
shape, and is wrong in three ways at once.

**Saving twice would copy twice.** The acceptance criterion is that Saving is
idempotent, and a key derived from *when* or *which Article* asked makes that a
thing to enforce rather than a thing that is true. A key derived from the image
means the second Saving finds the object with `head` and copies nothing.

**A photograph reused across a week of coverage would be stored once per
Article.** The Sources reuse rider portraits heavily. Content addressing shares
one object between every Article carrying it, without either Article knowing
about the other.

**A Revision would orphan the key.** Re-Extraction rewrites `article_images`,
so a key tied to `position` describes an image that may no longer be at that
position. Tied to the URL, the same photograph in the revised body is Mirrored
to the same place — and is already there.

The canonical URL is hashed, not the URL actually fetched. Mirroring asks the
CDN for 1280 pixels — the widest candidate the reading column ever uses, so a
Mirrored image is never smaller than what the reader would have been served, and
never the several megabytes an unresized original can be. That width is this
application's choice and may change; what identifies the photograph does not.

### Consequences

Objects are immutable, so the route serving them sets a year's caching honestly
rather than hopefully. It is `private`: the Archive is behind the passphrase
like everything else ([ADR-0003](0003-passphrase-auth-not-cloudflare-access.md)),
and a shared cache has no business holding it.

A key arriving in a URL is checked against `^[0-9a-f]{64}\.[a-z0-9]{2,4}$` before
the bucket is asked, so a request cannot name an object Mirroring would not have
written.

**Un-Saving deletes nothing.** An object is shared by every Article carrying
that photograph, so deleting one safely needs reference counting — over a few
hundred kilobytes, against a 10 GB free tier. The Mirror key stays recorded too:
it records that a copy exists, which remains true, and clearing it would send
rendering back to the Source CDN while the reader's own copy sat in the bucket.
Un-Saving is therefore cheap, and re-Saving is free.

## The Archive is a destination, not a filter on the index

`/archive`, linked from the masthead of every page, rather than a chip beside
Racing and Tech.

The Archive is a different thing from the Stream — permanent, Mirrored, and
meant to outlive the Source — and burying the durable part of the collection
inside the disposable part makes it the hardest thing to reach. It also carries
none of the index's furniture: no filters, no New count, no health footer. None
of those are questions the Archive answers. Nothing arrives in it except by the
reader's own hand, so there is no "since when" for it to report.

### Saving does not remove an Article from the index

The index lists every Article the reader has, Saved ones included and marked
with a filled star. Saved is a fact about durability — it is the one act that
exempts an Article from Expiry — and not a fact about visibility. A control that
made a row vanish when pressed would read as a control that hid it, and an
Article Saved to read later would have to be hunted down in a second place to
read at all.

`saved_at IS NOT NULL` therefore appears in exactly two queries: the Archive's
listing, and — when it is built — Expiry's delete predicate.
