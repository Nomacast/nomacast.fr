-- migrations/0008-chat-messages.sql
-- C5 — Chat interactif
--
-- Table chat_messages : Q&A et chat libre.
-- - kind = 'message' (chat libre) ou 'question' (Q&A modéré)
-- - status = 'pending' (en attente de modération) | 'approved' | 'rejected'
-- - invitee_id NULL si event public (auteur anonyme)
-- - author_name : nom affiché (de l'invitee.full_name ou champ libre pour publics)
-- - author_kind : 'invitee' (event privé) | 'guest' (event public) | 'admin' (Jérôme/client en preview)
--
-- Index : recherche rapide des messages approved d'un event, triés par date.

CREATE TABLE IF NOT EXISTS chat_messages (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invitee_id    TEXT REFERENCES invitees(id) ON DELETE SET NULL,
  author_name   TEXT NOT NULL,
  author_kind   TEXT NOT NULL DEFAULT 'guest' CHECK(author_kind IN ('invitee', 'guest', 'admin')),
  content       TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'message' CHECK(kind IN ('message', 'question')),
  status        TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('pending', 'approved', 'rejected')),
  created_at    TEXT NOT NULL,
  approved_at   TEXT,
  rejected_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_event_status_time
  ON chat_messages(event_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_event_pending
  ON chat_messages(event_id, status)
  WHERE status = 'pending';
