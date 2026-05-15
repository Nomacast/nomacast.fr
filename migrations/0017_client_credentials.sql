-- Migration 0016 : credentials client pour /event-admin
-- Date prévue : mai 2026
-- A déployer en chronologique après 0015.
--
-- Ajoute la possibilité pour le client d'accéder à /event-admin/<slug> et à la régie /admin/live.html
-- via login/password (au lieu du token HMAC global qui n'identifie personne).
--
-- nomacast-client-credentials-v1
--
-- Workflow :
--   1. Admin Nomacast génère login + password sur admin/edit.html (panneau "Accès client")
--   2. Le password est hashé PBKDF2-SHA256 (100 000 itérations) et stocké dans client_password_hash
--   3. Le login en clair est stocké dans client_login (unique global, contraint par index)
--   4. Le password en clair n'est affiché qu'UNE SEULE FOIS dans la réponse de l'API de génération
--   5. Le client se connecte via /event-admin/login, reçoit un cookie session HMAC signé (7j glissants)
--
-- IMPORTANT : la console D1 web n'accepte pas les commentaires entre statements.
-- À retirer pour coller dans la console, ou utiliser wrangler d1 execute.

-- client_login : identifiant unique global (alphanum + tirets + underscores), 3-64 caractères
-- client_password_hash : format "pbkdf2:<salt_b64url>:<hash_b64url>"
--   - salt 16 bytes random
--   - hash 32 bytes (SHA-256, 256 bits)
--   - 100 000 itérations PBKDF2
ALTER TABLE events ADD COLUMN client_login TEXT;
ALTER TABLE events ADD COLUMN client_password_hash TEXT;

-- Index unique partiel : permet plusieurs events sans credentials (NULL) sans conflit,
-- mais garantit l'unicité dès que client_login est rempli.
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_client_login ON events (client_login) WHERE client_login IS NOT NULL;
