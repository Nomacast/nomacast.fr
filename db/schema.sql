-- Nomacast · Chat interactif · Schema D1
-- Base : nomacast-events (Database ID : 6af04086-6735-4d72-8d9e-7a2ff1b024dc)
-- À exécuter dans la console D1 du Dashboard Cloudflare, OU via :
--   wrangler d1 execute nomacast-events --file=db/schema.sql --remote
--
-- Conventions SQLite :
--   - IDs : TEXT (nano-id 12 chars ou UUID)
--   - Dates : TEXT au format ISO 8601 (datetime('now') pour les defaults)
--   - Booleans : INTEGER 0/1 (SQLite n'a pas de type BOOLEAN natif)
--   - JSON : TEXT contenant du JSON sérialisé

-- ============================================================
-- TABLE events
-- ============================================================
-- Un event = une session chat interactif (conférence, séminaire, webinar).
-- Status workflow : draft → live → ended.
-- Les champs stream_* sont réservés pour la phase 1 (Cloudflare Stream Live),
-- ils restent NULL tant que Stream Live n'est pas branché.

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  client_name TEXT,
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  audience_estimate INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  primary_color TEXT DEFAULT '#5A98D6',
  logo_url TEXT,
  white_label INTEGER DEFAULT 0,
  subtitles INTEGER DEFAULT 0,
  modes_json TEXT,
  access_mode TEXT DEFAULT 'public',
  stream_uid TEXT,
  stream_playback_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_scheduled ON events(scheduled_at);

-- ============================================================
-- TABLE invitees
-- ============================================================
-- Un invitee = une personne autorisée à rejoindre le chat d'un event donné.
-- magic_token = token aléatoire pour l'URL magic link /chat/:slug?token=xxx.
-- ON DELETE CASCADE : si on supprime un event, ses invités disparaissent aussi.

CREATE TABLE IF NOT EXISTS invitees (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  company TEXT,
  magic_token TEXT UNIQUE NOT NULL,
  invited_at TEXT,
  last_seen_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  UNIQUE (event_id, email)
);

CREATE INDEX IF NOT EXISTS idx_invitees_event ON invitees(event_id);
CREATE INDEX IF NOT EXISTS idx_invitees_token ON invitees(magic_token);
CREATE INDEX IF NOT EXISTS idx_invitees_email ON invitees(email);
