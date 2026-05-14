-- Migration 0013 : technical_alerts
-- Stocke les signalements de problèmes techniques émis par les participants
-- via le bouton "Signaler un problème technique" sur la page chat live.
-- Ces alertes sont affichées dans une page feed (vMix Browser Input).

CREATE TABLE IF NOT EXISTS technical_alerts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('audio','video','both')),
  invitee_id TEXT,
  author_label TEXT,
  country TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  dismissed_at TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_id) REFERENCES invitees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_technical_alerts_event_created
  ON technical_alerts (event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_technical_alerts_event_dismissed
  ON technical_alerts (event_id, dismissed_at);
