-- Migration 0017 — Ajout champ description event (FR-3)
-- nomacast-event-description-v1
-- Champ optionnel, max 500 caractères (validation côté API).
-- Affiché sur : page waiting participant, page live participant, mail d'invitation, page event-admin client.

ALTER TABLE events ADD COLUMN description TEXT;
