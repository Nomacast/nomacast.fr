-- Migration 0020 — Table event_cta_clicks (Lot E Phase 3)
-- nomacast-cta-clicks-v1
--
-- Trace chaque clic sur un CTA banner pendant un event live.
-- Utilisé pour :
--   - Compteur de clics par CTA (admin régie + bilan event)
--   - Timeline détaillée par invité (vue drilldown event-admin)
--   - Mesure de conversion / engagement
--
-- Pas d'UNIQUE constraint : un invité peut cliquer plusieurs fois sur le même CTA
-- (et c'est intéressant à mesurer — clic répété = forte intention).

CREATE TABLE IF NOT EXISTS event_cta_clicks (
  id TEXT PRIMARY KEY,
  cta_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  invitee_id TEXT,
  anon_key TEXT,
  ip_hash TEXT,
  clicked_at TEXT NOT NULL,
  FOREIGN KEY (cta_id) REFERENCES event_ctas(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_id) REFERENCES invitees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_cta_clicks_event_time ON event_cta_clicks (event_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_cta_clicks_invitee ON event_cta_clicks (invitee_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_cta_clicks_cta ON event_cta_clicks (cta_id);
