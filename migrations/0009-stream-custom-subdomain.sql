-- migrations/0009-stream-custom-subdomain.sql
-- Lot 18 : migration des stream_playback_url vers le custom subdomain stream.nomacast.fr
--
-- Avant : https://iframe.videodelivery.net/<uid>
-- Après : https://stream.nomacast.fr/<uid>/iframe
--
-- À exécuter dans la console SQL D1 web :
--   dash.cloudflare.com → Storage & Databases → D1 → nomacast-events → Console
--
-- Idempotent : relancer ne fait rien si toutes les URLs sont déjà au nouveau format.

UPDATE events
   SET stream_playback_url = 'https://stream.nomacast.fr/' || stream_uid || '/iframe',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE stream_uid IS NOT NULL
   AND (stream_playback_url IS NULL
        OR stream_playback_url LIKE '%iframe.videodelivery.net%'
        OR stream_playback_url LIKE '%customer-%.cloudflarestream.com%');

-- Vérification : doit retourner 0 si la migration est complète
SELECT COUNT(*) AS to_migrate
  FROM events
 WHERE stream_uid IS NOT NULL
   AND stream_playback_url NOT LIKE 'https://stream.nomacast.fr/%';
