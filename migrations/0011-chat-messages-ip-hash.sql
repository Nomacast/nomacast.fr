-- migrations/0011-chat-messages-ip-hash.sql
-- Lot H : ajoute une colonne ip_hash à chat_messages pour permettre le rate limit
-- 10 msg/min/IP. Bonus : réutilisable pour les analytics phase 1
-- (RAPPORT-ANALYTICS.md) plus tard.
--
-- ip_hash est un SHA-256 de l'IP du client concatenée à un secret env
-- (CHAT_IP_HASH_SECRET). Permet la deduplication / rate limit sans stocker
-- d'IP en clair (RGPD compliance).
--
-- À exécuter dans la console SQL D1 web :
--   dash.cloudflare.com → Storage & Databases → D1 → nomacast-events → Console

-- 1. Ajout de la colonne (NULL pour les messages historiques)
ALTER TABLE chat_messages ADD COLUMN ip_hash TEXT;

-- 2. Index sur (ip_hash, created_at) pour les queries de rate limit
--    « COUNT(*) WHERE ip_hash = ? AND created_at > datetime('now', '-1 minute') »
CREATE INDEX IF NOT EXISTS idx_chat_messages_ip_time
  ON chat_messages(ip_hash, created_at);

-- Vérification
SELECT COUNT(*) AS messages_existants_sans_ip
  FROM chat_messages
 WHERE ip_hash IS NULL;
