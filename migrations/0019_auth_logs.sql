-- Migration 0019 — Table auth_logs (Lot F sécu)
-- nomacast-auth-logs-v1
--
-- Trace toutes les tentatives de connexion (réussies ET échouées) sur /event-admin/login.
-- Utilisé pour :
--   - Détection brute force (corrélation IP, fréquence)
--   - Forensics si compromission soupçonnée
--   - Conformité RGPD : aucune IP en clair, seulement hash HMAC
--
-- Rétention : pas de purge auto pour l'instant (à ajouter en V2 — purge auto > 90 jours).

CREATE TABLE IF NOT EXISTS auth_logs (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  login TEXT,
  ip_hash TEXT,
  success INTEGER NOT NULL,
  reason TEXT,
  user_agent TEXT,
  attempted_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_logs_ip_hash ON auth_logs (ip_hash, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_logs_event ON auth_logs (event_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_logs_attempted ON auth_logs (attempted_at DESC);
