-- Mirroring: where the Archive's own copy of an Article's images is recorded.
--
-- `article_images.mirror_key` was there from the first migration, because the
-- canonical Source URL was always stored unrewritten so that Mirroring could
-- fill in a key later. The hero image is the one image an Article carries
-- outside that table — the Feed gives it, and a Stub has one even though it has
-- no body to hold it — so it needs a key of its own.

ALTER TABLE articles ADD COLUMN hero_mirror_key TEXT;

-- The Archive, which is a destination and not a filter on the index: a partial
-- index over the Saved rows alone, ordered the way the Archive lists them. The
-- Stream is thirty days deep at a hundred Articles a day and the Archive is a
-- few hundred rows, so without this the smaller collection would be the one
-- that costs a scan of the larger.
CREATE INDEX articles_saved ON articles (published_at DESC)
WHERE saved_at IS NOT NULL;
