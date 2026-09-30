-- Rehearsal-only schema. Never applied automatically by the coordinator.
CREATE TABLE _faultcite_drain_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  epoch INTEGER NOT NULL CHECK (epoch >= 1),
  pause_generation INTEGER NOT NULL DEFAULT 0 CHECK (pause_generation >= 0),
  paused INTEGER NOT NULL CHECK (paused IN (0, 1)),
  pause_id TEXT,
  CHECK ((paused = 0 AND pause_id IS NULL) OR (paused = 1 AND length(pause_id) BETWEEN 8 AND 128))
);
INSERT INTO _faultcite_drain_state(singleton, epoch, paused, pause_id) VALUES (1, 1, 0, NULL);
CREATE TABLE _faultcite_drain_tickets (
  id TEXT PRIMARY KEY,
  epoch INTEGER NOT NULL CHECK (epoch >= 1),
  kind TEXT NOT NULL CHECK (kind IN ('writer', 'export'))
);
