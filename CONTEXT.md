# Cycling Reader

A private, single-user reading application. It ingests cycling journalism from a
small set of publications on a schedule, strips the advertising and page
furniture, and presents what remains as a calm reading experience available from
any device.

The reader is deliberately a *stream*, not a library: most of what arrives is
read once and discarded. Anything worth keeping must be kept on purpose.

## Language

### Sources and ingestion

**Source**:
A publication the reader draws from, such as Cyclingnews or Cycling Weekly.
_Avoid_: Site, feed, publisher

**Feed**:
The RSS document a Source publishes. It carries headlines, teasers and hero
images, but never article bodies.
_Avoid_: RSS, stream

**Ingest Run**:
A single scheduled pass that reads every Feed, admits qualifying items, and
extracts their bodies. Runs are the unit of health reporting — an Ingest Run
either succeeds wholly or fails loudly.
_Avoid_: Job, sync, refresh, crawl

**Section Allowlist**:
The set of Source URL paths admitted at ingest. Governs *whether an Article
enters the reader at all*.
_Avoid_: Filter, whitelist, category filter

### Articles

**Article**:
A single piece of journalism from a Source, identified by the Source plus the
Feed's opaque `guid`. An Article always exists once admitted, whether or not its
body was successfully extracted.
_Avoid_: Post, story, item, entry

**Stub**:
An Article whose Extraction failed, retained with only its headline, teaser and
hero image, and read by following the link to the Source. A Stub is a legitimate
Article, not an error state.
_Avoid_: Failed article, partial, placeholder

**Extraction**:
The act of reducing a Source's article page to clean reading content, and the
result of doing so. Records which method produced it, so a degradation in
quality is visible rather than silent.
_Avoid_: Parsing, scraping, cleaning

**Tag Allowlist**:
The set of HTML elements preserved during Extraction. Governs *what survives
inside an Article's body*. Anything unlisted is discarded, so newly introduced
page furniture is excluded by default.
_Avoid_: Filter, whitelist, sanitiser config

**Section**:
The reader's own normalised subject taxonomy — `racing`, `womens`,
`teams-riders`, `tech`, `news`, `other` — into which every Source's URL paths are
mapped. Sections are comparable across Sources.
_Avoid_: Category, topic, tag

**Category**:
A raw subject label as emitted by a Source's Feed. Categories are not comparable
between Sources and exist only as ingest input. Never shown to the reader.

**Revision**:
A change to an Article at its Source after first ingest, detected when the
Feed's `updated` timestamp advances. Most Articles are revised at least once.
_Avoid_: Update, edit, version

**Updated Marker**:
The indication shown against an Article whose Revision post-dates the moment it
was Read. Absent for Articles never Read.

### Reading

**Read**:
An Article the reader has opened. Set once, on opening, and never cleared by a
Revision. A property of the Article that persists across devices.
_Avoid_: Seen, viewed, consumed

**New**:
An Article that arrived since the Last Visit. Independent of Read — an old
Article never opened is unread but not New. Only New is ever counted; unread is
never totalled or badged.
_Avoid_: Unread, fresh, recent

**Last Visit**:
The moment the reader most recently opened the index. The sole basis for
deciding what is New.
_Avoid_: Last seen, last login, last sync

**Saved**:
An Article the reader has deliberately marked to keep. Saving is the only act
that exempts an Article from Expiry, and the only thing that triggers Mirroring.
_Avoid_: Starred, bookmarked, favourited, pinned

**Stream**:
The Articles that have not been Saved — disposable by design, subject to Expiry,
with images served from the Source's CDN.

**Archive**:
The Articles that have been Saved — permanent, with Mirrored images, and
intended to remain readable after the Source has moved on.

**Expiry**:
The scheduled deletion of Stream Articles past the retention horizon. Expiry is
irreversible and never touches the Archive.
_Avoid_: Cleanup, pruning, garbage collection, purge

**Mirroring**:
Copying an Archive Article's images into storage the reader controls, performed
at the moment of Saving so that no window exists in which a Saved Article can
lose its images.
_Avoid_: Caching, downloading, backup
