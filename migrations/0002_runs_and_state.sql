-- Ingest Runs, and the single row of application state.
--
-- Applied to D1 in production and to the local SQLite file in tests, from this
-- same file, so the two store implementations cannot drift.
--
-- Every timestamp is an ISO 8601 instant in UTC.

-- An Ingest Run is the unit of health reporting: it either succeeds wholly or
-- fails loudly (ADR-0006). One row per Run, written once when the Run ends —
-- including when it ends badly, because a Run that failed without recording
-- itself is exactly the silent failure the ADR exists to prevent.
--
-- This is what the index footer reads: last successful Run, what it admitted,
-- and how its Extractions were obtained.
CREATE TABLE ingest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,

  admitted INTEGER NOT NULL,
  -- Counted apart from admitted: three quarters of items are Revised at least
  -- once, so a Run that admits nothing and revises twenty is healthy.
  revised INTEGER NOT NULL,

  -- The Extraction method split, as columns rather than a JSON blob, because
  -- the footer and any later look at degradation both query it. A rising
  -- readability count against a falling targeted count is a Source redesign.
  targeted INTEGER NOT NULL,
  readability INTEGER NOT NULL,
  stub INTEGER NOT NULL,

  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed')),
  -- Why a failed Run failed. Null when it succeeded.
  failure TEXT
);

-- The footer wants the most recent Run, and the most recent successful one.
CREATE INDEX ingest_runs_started_at ON ingest_runs (started_at DESC);

-- One row, holding Last Visit: the sole basis for deciding what is New.
--
-- Deliberately not a users table. The system is single-user by decision, and a
-- users table would be a lie told to keep a familiar shape — the same decision
-- that puts read_at on the Article rather than in a join table.
CREATE TABLE app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  -- Null until the index has been opened once, when every Article is New.
  last_visit_at TEXT
);

-- Seeded here so that every reader of app_state can assume the row exists.
INSERT INTO app_state (id, last_visit_at) VALUES (1, NULL);
