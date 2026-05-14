-- migrations/0010-revert-stream-subdomain.sql
-- REVERT du Lot 18 : le custom subdomain stream.nomacast.fr est bloqué par
-- Cloudflare (erreur 1014 "CNAME Cross-User Banned") car le CNAME pointe
-- vers un autre compte CF. Activer un vrai custom subdomain nécessite
-- Cloudflare for SaaS (plan Business+).
--
-- On revient à l'URL native iframe.videodelivery.net qui fonctionne sans config.
--
-- À exécuter dans la console SQL D1 web :
--   dash.cloudflare.com -> Storage & Databases -> D1 -> nomacast-events -> Console
--
-- Idempotent : relancer ne fait rien si toutes les URLs sont déjà au format natif.

UPDATE events
   SET stream_playback_url = 'https://iframe.videodelivery.net/' || stream_uid,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE stream_uid IS NOT NULL
   AND stream_playback_url LIKE '%stream.nomacast.fr%';

-- Vérification : doit retourner 0 si la migration est complète
SELECT COUNT(*) AS still_using_custom_subdomain
  FROM events
 WHERE stream_uid IS NOT NULL
   AND stream_playback_url LIKE '%stream.nomacast.fr%';

-- Note : tu peux supprimer le DNS record stream.nomacast.fr de ton zone
-- Cloudflare puisqu'il n'est plus utilisé. Pas urgent.
