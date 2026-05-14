-- migrations/0007-stream-fields.sql
-- C4 — Cloudflare Stream Live
--
-- Ajoute les champs nécessaires pour stocker la live input Cloudflare Stream
-- associée à un event. Idempotent : SQLite ignore l'ALTER si la colonne existe
-- déjà (à condition d'avoir vérifié avant), donc on protège chaque ADD COLUMN
-- via les pragmas et un test conditionnel — mais SQLite ne supporte pas
-- IF NOT EXISTS sur ADD COLUMN, donc on documente plutôt qu'on protège.
--
-- Avant d'exécuter : vérifier que les colonnes n'existent pas déjà via :
--   wrangler d1 execute nomacast-events --command "PRAGMA table_info(events)"
--
-- Note : deserializeEvent dans functions/api/admin/events/[id].js référence
-- déjà stream_uid et stream_playback_url. Ces champs sont peut-être absents
-- ou présents en base — à vérifier avant de lancer la migration.

ALTER TABLE events ADD COLUMN stream_uid TEXT;
ALTER TABLE events ADD COLUMN stream_rtmps_url TEXT;
ALTER TABLE events ADD COLUMN stream_rtmps_key TEXT;
ALTER TABLE events ADD COLUMN stream_playback_url TEXT;
ALTER TABLE events ADD COLUMN stream_created_at TEXT;
