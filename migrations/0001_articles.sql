-- Articles and the images within them.
--
-- This is the schema both store implementations run against: D1 in
-- production, and a local SQLite file in tests and for manual inspection. It
-- is applied to both from this file, so the two cannot drift.
--
-- Every timestamp is an ISO 8601 instant in UTC.

CREATE TABLE articles (
  -- An Article is identified by its Source plus the Feed's opaque guid.
  source TEXT NOT NULL,
  guid TEXT NOT NULL,

  url TEXT NOT NULL,
  headline TEXT NOT NULL,
  teaser TEXT NOT NULL,
  author TEXT,

  -- The reader's own normalised taxonomy, never a Source's raw Category.
  section TEXT NOT NULL CHECK (
    section IN ('racing', 'womens', 'teams-riders', 'tech', 'news', 'other')
  ),

  -- NOT NULL because Expiry deletes by age alone: a null published_at would
  -- be an Article that never expires and never sorts.
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  -- Empty when the Article is a Stub. Sanitised at ingest, so the Worker
  -- emits it verbatim.
  body_html TEXT NOT NULL,
  extraction_method TEXT NOT NULL CHECK (
    extraction_method IN ('targeted', 'readability', 'stub')
  ),
  text_length INTEGER NOT NULL,

  -- The Feed's hero image, retained even for a Stub.
  hero_image_url TEXT,
  hero_image_alt TEXT,

  -- The reader's state. Never touched by re-Extraction.
  read_at TEXT,
  saved_at TEXT,

  first_seen_at TEXT NOT NULL,

  PRIMARY KEY (source, guid)
);

-- The index is ordered by publication, and Expiry selects by it.
CREATE INDEX articles_published_at ON articles (published_at DESC);

CREATE TABLE article_images (
  source TEXT NOT NULL,
  guid TEXT NOT NULL,
  -- Ordinal position within the body, from zero.
  position INTEGER NOT NULL,

  -- The canonical Source CDN URL, stored unrewritten so that Mirroring can
  -- populate mirror_key later without re-Extraction.
  url TEXT NOT NULL,
  alt TEXT,
  caption TEXT,
  mirror_key TEXT,

  PRIMARY KEY (source, guid, position),
  FOREIGN KEY (source, guid) REFERENCES articles (source, guid) ON DELETE CASCADE
);
