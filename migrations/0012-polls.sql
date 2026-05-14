-- migrations/0012-polls.sql
-- Phase A des sondages : 3 tables (polls, poll_options, poll_votes)
--
-- MVP :
-- - 1 sondage 'live' à la fois par event (logique côté worker, pas contrainte DB)
-- - Choix unique (type='single'). 'multi' réservé pour évolution future.
-- - results_visibility='live' par défaut (tous voient les % en temps réel)
-- - 1 vote / personne / sondage (UNIQUE constraint sur poll_id + voter_key)
-- - voter_key = invitee.id en privé, ip_hash en public

-- 1. Sondages
CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  question TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'single',
  status TEXT NOT NULL DEFAULT 'draft',
  results_visibility TEXT NOT NULL DEFAULT 'live',
  created_at TEXT NOT NULL,
  launched_at TEXT,
  closed_at TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_polls_event_status
  ON polls(event_id, status);

CREATE INDEX IF NOT EXISTS idx_polls_event_created
  ON polls(event_id, created_at);

-- 2. Options de chaque sondage
CREATE TABLE IF NOT EXISTS poll_options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_poll_options_poll
  ON poll_options(poll_id, position);

-- 3. Votes individuels (1 ligne = 1 vote)
CREATE TABLE IF NOT EXISTS poll_votes (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  voter_key TEXT NOT NULL,
  voted_at TEXT NOT NULL,
  UNIQUE(poll_id, voter_key),
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll
  ON poll_votes(poll_id);

CREATE INDEX IF NOT EXISTS idx_poll_votes_option
  ON poll_votes(option_id);

-- Vérification : ces 3 SELECT doivent retourner 0
SELECT COUNT(*) AS polls FROM polls;
SELECT COUNT(*) AS poll_options FROM poll_options;
SELECT COUNT(*) AS poll_votes FROM poll_votes;
