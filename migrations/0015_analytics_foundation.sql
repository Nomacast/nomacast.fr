-- Migration 0015 : analytics foundation
-- Date prévue : mai 2026
-- A déployer en chronologique après 0014.
--
-- 5 blocs additifs, aucun ALTER destructif, aucun breaking change.
-- Déployable à chaud (même pendant un event live).
--
-- A. Table visits             - tracking détaillé des ouvertures de page (clics uniques, timeline)
-- B. Table event_presence_history - historique heartbeats (drop-off chart, durée connexion)
-- C. ALTER invitees           - auto-inscription publique + lead capture + RGPD
-- D. ALTER events             - inscription publique configurable + texte consentement
-- E. Table event_reports      - PDFs de bilan archivés
--
-- IMPORTANT - Console D1 :
-- La console web ne supporte pas les commentaires -- entre statements.
-- Soit retirer les commentaires intercalaires avant de coller,
-- soit utiliser : wrangler d1 execute nomacast-events --remote --file=./migrations/0015_analytics_foundation.sql

-- ============================================================
-- A. Visits — tracking détaillé des ouvertures de page
-- ============================================================
-- Diffère de invitees.last_seen_at (snapshot écrasé) :
-- ici on insère 1 row par GET, pour comptabiliser les clics uniques,
-- voir la timeline d'engagement, et identifier la source du trafic.
CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  invitee_id TEXT,
  anon_key TEXT,
  visited_at TEXT NOT NULL,
  page_kind TEXT NOT NULL CHECK (page_kind IN ('invite','public','register','event-admin','replay')),
  user_agent TEXT,
  country_code TEXT,
  ip_hash TEXT,
  referrer TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_id) REFERENCES invitees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_visits_event_time ON visits (event_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_invitee ON visits (invitee_id);
CREATE INDEX IF NOT EXISTS idx_visits_anon ON visits (anon_key);
CREATE INDEX IF NOT EXISTS idx_visits_event_kind ON visits (event_id, page_kind);

-- ============================================================
-- B. Presence history — historique des heartbeats pour analytics
-- ============================================================
-- event_presence (mig 0014) reste un snapshot UPSERT pour le "qui est en ligne maintenant".
-- event_presence_history collecte CHAQUE ping (INSERT only) pour reconstituer
-- la courbe de présence (drop-off chart) et calculer la durée de connexion par viewer.
-- Volumétrie : ~60 inserts/min pour 30 viewers, ~3600 rows pour un event d'1h. Négligeable D1.
CREATE TABLE IF NOT EXISTS event_presence_history (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  invitee_id TEXT,
  anon_key TEXT,
  pinged_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_id) REFERENCES invitees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_presence_history_event_time ON event_presence_history (event_id, pinged_at);
CREATE INDEX IF NOT EXISTS idx_presence_history_invitee ON event_presence_history (invitee_id);
CREATE INDEX IF NOT EXISTS idx_presence_history_anon ON event_presence_history (anon_key);

-- ============================================================
-- C. ALTER invitees — auto-inscription publique + lead capture + RGPD
-- ============================================================
-- source : 'admin_invited' (existant historique) | 'self_registered' (inscription publique)
-- job_title : intitulé du poste (le mot 'function' est réservé en SQL)
-- phone : téléphone (lead capture optionnel)
-- consent_at : timestamp du consentement RGPD principal (collecte des interactions event)
-- consent_marketing_at : timestamp du consentement marketing séparé (= "j'accepte que le client me recontacte")
-- anonymized_at : droit à l'oubli — quand non-NULL, full_name/email/phone sont vidés mais les agrégats restent
-- registered_via : slug de la page d'inscription utilisée (utile si une personne s'inscrit à plusieurs events)
ALTER TABLE invitees ADD COLUMN source TEXT NOT NULL DEFAULT 'admin_invited' CHECK (source IN ('admin_invited','self_registered'));
ALTER TABLE invitees ADD COLUMN job_title TEXT;
ALTER TABLE invitees ADD COLUMN phone TEXT;
ALTER TABLE invitees ADD COLUMN consent_at TEXT;
ALTER TABLE invitees ADD COLUMN consent_marketing_at TEXT;
ALTER TABLE invitees ADD COLUMN anonymized_at TEXT;
ALTER TABLE invitees ADD COLUMN registered_via TEXT;

CREATE INDEX IF NOT EXISTS idx_invitees_source ON invitees (event_id, source);

-- ============================================================
-- D. ALTER events — inscription publique configurable
-- ============================================================
-- access_mode reste 'public' | 'private' (compat totale avec le code existant).
-- requires_registration : flag additionnel applicable quand access_mode='public'.
--   0 = accès direct au /chat/<slug> (comportement actuel)
--   1 = redirection vers /chat/<slug>/register avant accès
-- client_organization_name : nom à afficher dans le form d'inscription publique ("Vous êtes invité par X")
-- data_purpose : finalité RGPD affichée au consentement marketing ("X pourra vous recontacter pour Y")
ALTER TABLE events ADD COLUMN requires_registration INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN client_organization_name TEXT;
ALTER TABLE events ADD COLUMN data_purpose TEXT;

-- ============================================================
-- E. Event reports — PDFs de bilan archivés
-- ============================================================
-- Stockés sur R2 (bucket REPORTS_BUCKET à créer côté Cloudflare),
-- envoyés au client par Resend à la fermeture de l'event.
-- Permet régénération + re-envoi depuis admin/reports.html.
-- generated_by : 'auto' (trigger sur status=ended) | 'manual_admin' | 'manual_client'
-- status : 'generated' (PDF créé, pas encore envoyé) | 'sent' (envoyé OK) | 'failed' (erreur Resend ou génération) | 'superseded' (remplacé par une régénération ultérieure)
CREATE TABLE IF NOT EXISTS event_reports (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER,
  sent_to_email TEXT,
  sent_at TEXT,
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','sent','failed','superseded')),
  error_message TEXT,
  generated_by TEXT NOT NULL DEFAULT 'auto' CHECK (generated_by IN ('auto','manual_admin','manual_client')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_reports_event_time ON event_reports (event_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_reports_status ON event_reports (status);
