-- Migration 0014 : interactions étendues
-- À exécuter en console D1 statement par statement.
--
-- 7 features ajoutées :
--   T1. pre_event_questions  — questions posées avant le live
--   T2. ideas + idea_votes   — mur d'idées / brainstorming
--   T3. event_quotes         — citations à retenir (cartes LinkedIn)
--   C1. event_reactions      — emojis éphémères broadcast
--   C2. event_presence       — heartbeat connexion participants
--   C3. event_resources      — liens / documents partagés
--   C4. event_ctas           — CTA pendant live

-- ============================================================
-- T1. Pre-event Q&A
-- ============================================================
CREATE TABLE IF NOT EXISTS pre_event_questions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  invitee_id TEXT,
  author_name TEXT NOT NULL,
  author_email TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','promoted')),
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  promoted_at TEXT,
  promoted_message_id TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_id) REFERENCES invitees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pre_event_questions_event_status ON pre_event_questions (event_id, status);
CREATE INDEX IF NOT EXISTS idx_pre_event_questions_event_created ON pre_event_questions (event_id, created_at DESC);

-- ============================================================
-- T2. Ideas / Brainstorming
-- ============================================================
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  invitee_id TEXT,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','pinned')),
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_id) REFERENCES invitees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ideas_event_status ON ideas (event_id, status);

CREATE TABLE IF NOT EXISTS idea_votes (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  voter_key TEXT NOT NULL,
  voted_at TEXT NOT NULL,
  UNIQUE (idea_id, voter_key),
  FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_idea_votes_idea ON idea_votes (idea_id);

-- ============================================================
-- T3. Quotes (participants soumettent, admin modère)
-- ============================================================
CREATE TABLE IF NOT EXISTS event_quotes (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  invitee_id TEXT,
  author_name TEXT NOT NULL,
  speaker_name TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','pinned')),
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_id) REFERENCES invitees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_quotes_event_status ON event_quotes (event_id, status);

-- ============================================================
-- C1. Reactions emoji éphémères
-- ============================================================
CREATE TABLE IF NOT EXISTS event_reactions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  invitee_id TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_reactions_event_created ON event_reactions (event_id, created_at DESC);

-- ============================================================
-- C2. Presence (heartbeat connexion)
-- ============================================================
CREATE TABLE IF NOT EXISTS event_presence (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  invitee_id TEXT,
  anon_key TEXT,
  last_seen TEXT NOT NULL,
  UNIQUE (event_id, invitee_id),
  UNIQUE (event_id, anon_key),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_presence_event_seen ON event_presence (event_id, last_seen DESC);

-- ============================================================
-- C3. Resources downloadables
-- ============================================================
CREATE TABLE IF NOT EXISTS event_resources (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'link' CHECK (kind IN ('link','pdf','slides','image','video','file')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_resources_event_order ON event_resources (event_id, sort_order);

-- ============================================================
-- C4. CTAs (call-to-action pendant live)
-- ============================================================
CREATE TABLE IF NOT EXISTS event_ctas (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  activated_at TEXT,
  deactivated_at TEXT,
  expires_in_seconds INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_ctas_event_active ON event_ctas (event_id, active);
