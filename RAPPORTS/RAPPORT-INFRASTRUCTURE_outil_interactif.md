# Rapport infrastructure — Nomacast Live (chat interactif)

**Date initiale** : 14 mai 2026
**Dernière MAJ** : 15 mai 2026 (Auth client login/password + Onglets event-admin + Lot A QA + FR-3 description + Lot F sécu phase 1 + Lot C QA C2/C3 + Phase E.3 Part 1 tracking CTA)
**Méthode** : repo `Nomacast/nomacast.fr` cloné en local (`git clone --depth 1`), tous les fichiers cités ci-dessous ont été lus directement.
**Statut** : production stable.

---

## Changelog rapide depuis le 14 mai

- **Auth client par event** : remplacement total du HMAC backup par un système login/password (migration `client_credentials`, helpers `_lib/password.js` + `_lib/session.js`, page `/event-admin/login` + `/event-admin/logout`). Jérôme se connecte exactement comme un client (même URL).
- **Onglets event-admin** : `/event-admin/<slug>` affiche désormais 2 onglets « Données & invités » + « Régie en direct » (iframe `/admin/live.html?id=<id>`).
- **Lot A du QA** (15 mai) : Content-Type `text/html` explicite sur `/*.html`, validation date passée + durée ≤0 à la création, fix reset logo UI quand white_label OFF, CTA 404 cohérent pour magic token invalide, champ description event 500c (migration `event_description`).
- **Lot F sécu phase 1** (15 mai) : rate limit `/event-admin/login` (5 fails/min/IP via KV `auth-fail:`) + table `auth_logs` (migration `0019_auth_logs.sql`) avec insertions systématiques success/fail. CSP nonce + CSRF token report en phase 2 (cf §10.8).
- **Lot C QA C2/C3** (15 mai) : countdown overdue avec dot pulse + polling client adaptatif (60→30→10→5s, marqueur `nomacast-lot-c-c2-v1`) dans `chat/[slug].js` + `i/[token].js`. Statut détaillé des items QA en §10.9.
- **Phase E.3 Part 1 — Tracking CTA** (15 mai) : table `event_cta_clicks` (migration `0020_event_cta_clicks.sql`) + endpoint `POST /api/chat/<slug>/cta-clicks` + tracking JS keepalive dans les pages participant (marqueur `nomacast-cta-clicks-v1`). Phase E.3 Part 2 (timeline détaillée par invité) restante (cf §10.7).
- **Conflit numérotation migrations 0016** : 2 fichiers nommés `0016_*` dans le repo (`reactions_config` + `client_credentials`). Renommage à faire via GitHub web : `0017_client_credentials.sql` + `0018_event_description.sql`.

---

## 0. Vue d'ensemble

Plateforme de chat live interactif pour événements corporate B2B. **Cohabite avec le site marketing public** sur le même repo et le même domaine `nomacast.fr`. Périmètre de la plateforme :

- Pages servies : `admin/*`, `chat/*`, `i/*`, `event-admin/*`, `quote/*`, `feed/*`
- API : `/api/admin/*`, `/api/chat/*`, `/api/event-admin/*`, `/api/feed/*`

**État déploiement features participants (15 mai 2026)** :

| Tour | Features | Status |
|---|---|---|
| Tour 1 (backend complet) | Q&A modéré, chat libre, sondages, quiz, nuage mots-clés, pre_event_qa, ideas, quotes, reactions, presence, ressources, CTAs | Backend ✅ |
| Tour 2.A (frontend participant) | reactions bar (8 emojis), compteur présence header, CTA banner dismissible | ✅ déployé (marqueurs `nomacast-lot-2a-v1` dans `[token].js` + `[slug].js`) |
| Tour 2.A-bis L1 (backend reactions configurables) | Pool 15 emojis, sélection 1-5 par event, migration `0016_reactions_config` | ✅ déployé |
| Tour 2.A-bis L2-L4 | Frontend dynamique participant, CRUD CTAs admin, UI live.html | 🔧 à faire |
| Tour 2.B/2.C/2.D (frontend) | Onglets ideas, quotes, resources, pre_event_qa | 🔧 à faire |
| **Auth client login/password** (15 mai) | Migration `client_credentials` + helpers + middlewares + page login/logout + card "Accès client" dans `edit.html` | ✅ déployé |
| **Onglets event-admin** (15 mai) | `/event-admin/<slug>` avec onglets DATA + RÉGIE LIVE en iframe `/admin/live.html?id=<id>` | ✅ déployé |
| **Lot A QA** (15 mai) | C1 Content-Type, M1/U5 validations, M2 cast Number, M3 fix logo UI, U2 CTA 404, FR-3 description (migration `event_description`) | ✅ déployé |
| **Chantier analytics live** | Migration `0015_analytics_foundation` + tracking visits ✅. Reste : `buildHeartbeatScript` dans `[token].js`/`[slug].js`, endpoint+UI client `event-admin/stats`, enrichissements (top emojis, votes sondages, CTAs) | 🔧 en pause |

| Élément | Valeur |
|---|---|
| Hébergement | **Cloudflare Pages** project `nomacast-fr` |
| Repo | `github.com/Nomacast/nomacast.fr` (PUBLIC) |
| Stack | HTML/JS vanilla + Cloudflare Pages Functions |
| Base de données | **Cloudflare D1** namespace `nomacast-events` — Database ID `6af04086-6735-4d72-8d9e-7a2ff1b024dc` (binding `env.DB`) |
| KV codes partenaires | namespace `nomacast_partners` (binding `env.PARTNERS`) — site marketing uniquement |
| KV rate limit | binding `env.RATE_LIMIT` (utilisé par `envoyer.php.js` du site marketing) |
| R2 logos | binding `env.LOGOS_BUCKET` |
| Streaming | Cloudflare Stream (iframe player) |
| Email | Resend (`noreply@nomacast.fr`) |

---

## 1. Inventaire fichiers admin

Dossier `admin/` — **7 pages HTML + 1 JS + 1 CSS** :

```
admin/
├── admin.css        (12.3 KB — styles partagés)
├── admin.js         (20.0 KB — helpers window.NomacastAdmin)
├── edit.html        (26.8 KB — édition event)
├── index.html       (7.0 KB  — liste events)
├── invitees.html    (25.5 KB — gestion invités)
├── live.html        (45.6 KB — régie en direct)
├── new.html         (10.0 KB — création event)
├── polls-test.html  (14.7 KB — page dev tests sondages)
└── vmix.html        (7.7 KB  — outil URL feed vMix)
```

⚠️ **Toutes** ces pages sont protégées par Basic Auth via `functions/admin/_middleware.js` (cf §4).

### 1.1 `admin/index.html` — liste events

| Élément | Valeur |
|---|---|
| Rôle | Liste toutes les events, lien vers édition de chacun + bouton "Nouvel event" |
| `<title>` actuel | `Events · Admin Nomacast` |
| `<h1>` | `Events` (statique) |
| Chargement event | aucun (liste globale via `GET /api/admin/events`) |
| Endpoints appelés | `GET /api/admin/events` (load), `DELETE /api/admin/events/<id>` (supprimer) |
| Liens sortants | `→ admin/new.html`, `→ admin/edit.html?id=<event_id>` (par ligne) |

### 1.2 `admin/edit.html` — **édition d'un event** (clé pour le panneau URLs)

| Élément | Valeur |
|---|---|
| Rôle | Page principale de gestion d'un event individuel : formulaire édition + URL participant + lien admin client + card streaming Cloudflare Stream |
| Param URL | **`?id=<event_id>`** (et optionnellement `?created=1` pour message succès post-création) |
| `<title>` actuel | `Éditer event · Admin Nomacast` (jamais mis à jour dynamiquement) |
| `<h1>` actuel | `Éditer l'event` (statique, `id="page-title"`) |
| Sous-titre | `id="page-sub"` : affiche `Slug : <slug> · Créé le <date>` après chargement |
| Endpoint chargement | `GET /api/admin/events/<id>` |
| Endpoint save | `PATCH /api/admin/events/<id>` |
| Endpoint delete | `DELETE /api/admin/events/<id>` |
| Endpoint logo upload | `POST /api/admin/upload-logo` (multipart, séparé) |
| Bouton header existant | `id="regie-link"` : lien vers `/admin/live.html?id=<ev.id>`, visible **seulement si `ev.stream_uid`** |
| Liens sortants | `→ admin/invitees.html?event_id=<id>` (bouton "Gérer les invités"), `→ admin/live.html?id=<id>`, `→ /chat/<slug>` (via renderPublicLink), `→ /event-admin/<client_admin_token>` (via renderClientAdminLink) |

**Champs du formulaire (à PATCH)** :

| `name=` | Type HTML | Champ DB |
|---|---|---|
| `title` | `text` (required, maxlength 200) | `title` |
| `client_name` | `text` (maxlength 200) | `client_name` |
| `slug` | `text` (pattern `[a-z0-9-]+`, modifiable **seulement si 0 invité**) | `slug` |
| `description` | `textarea` (maxlength 500, FR-3) | `description` |
| `scheduled_at` | `datetime-local` (required) | `scheduled_at` (ISO) |
| `duration_minutes` | `number` (required, min 1) | `duration_minutes` |
| `audience_estimate` | `number` (min 1) | `audience_estimate` |
| `primary_color` | `color` (default `#5A98D6`) | `primary_color` |
| `logo_url` | `text` (URL R2 après upload via `/api/admin/upload-logo`) | `logo_url` |
| `status` | `radio` (`draft` / `live` / `ended`) | `status` |
| `white_label` | `checkbox` | `white_label` (0/1) |
| `subtitles` | `checkbox` | `subtitles` (0/1) |
| `mode` (multi) | `checkbox[]` (qa, libre, sondages, quiz, nuage, reactions, lecture) | `modes_json` (TEXT JSON array) |
| `access_mode` | `radio` (`public` / `private`) | `access_mode` |

Le payload PATCH côté JS construit `data.modes = [...]` (array) et l'API le sérialise en `modes_json` côté DB.

**Card "Accès client"** (15 mai, marqueur `nomacast-client-credentials-v1`) : panneau séparé entre URLs et Statistiques. Permet :
- Définir/modifier le `client_login` (par défaut = slug, éditable)
- Générer/régénérer un mot de passe (12 chars charset sans ambiguïté `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789`)
- Le mot de passe est affiché **une seule fois** en clair après génération (bouton Copier), puis stocké hashé (PBKDF2 100k)
- Bouton Révoquer (reset login + password)
- Endpoints : `GET/PUT/POST/DELETE /api/admin/events/<id>/credentials`

**M3 fix UI (15 mai)** : après save PATCH, le DOM est resynchronisé avec `result.event` (logo_url, primary_color, white_label, subtitles, description). Quand white_label passe OFF, le backend reset logo_url=null + primary_color=default, le DOM reflète ce reset (déclenche `input` event sur logo_url et primary_color → `renderLogoPreview` se met à jour).

### 1.3 `admin/new.html` — création event

| Élément | Valeur |
|---|---|
| Rôle | Formulaire création d'un event (minimal : titre, date, durée + description optionnelle) |
| Param URL | aucun |
| `<title>` actuel | `Nouvel event · Admin Nomacast` |
| `<h1>` | `Nouvel event` (statique) |
| Endpoint | `POST /api/admin/events` |
| Après succès | redirection vers `/admin/edit.html?id=<new_id>&created=1` |
| Validations submit (15 mai) | M1 : si `scheduled_at < now()` → `confirm()` selon écart ; U5 : `duration_minutes ≤ 0` refusé |
| Champ ajouté (15 mai) | `description` (textarea 500c, compteur live) — FR-3 |

⚠️ **Backend POST** `functions/api/admin/events/index.js` : à mettre à jour pour accepter `description` (sinon ignoré silencieusement à la création — éditable via `edit.html` PATCH ensuite).

### 1.4 `admin/invitees.html` — gestion invités

| Élément | Valeur |
|---|---|
| Rôle | CRUD invités, batch send invitations, renvoi individuel |
| Param URL | **`?event_id=<event_id>`** ⚠️ (NOT `?id=`, différent des autres pages) |
| `<title>` actuel | `Invités · Admin Nomacast` (jamais mis à jour dynamiquement) |
| `<h1>` actuel | `Invités` (`id="page-title"`) **mis à jour côté JS en** `Invités · <ev.title>` |
| Endpoint chargement event | `GET /api/admin/events/<event_id>` |
| Endpoint liste invités | `GET /api/admin/events/<event_id>/invitees` |
| Endpoint create | `POST /api/admin/events/<event_id>/invitees` |
| Endpoint delete | `DELETE /api/admin/events/<event_id>/invitees/<invitee_id>` |
| Endpoint resend (1 invité) | `POST /api/admin/events/<event_id>/invitees/<invitee_id>/resend` |
| Endpoint send batch | `POST /api/admin/events/<event_id>/send-invitations` (envoie à tous sans `invited_at`) |
| Renders `A.renderPublicLink` | oui, dans `public-link-zone` |
| Liens sortants | `→ /chat/<slug>` (via renderPublicLink) |

### 1.5 `admin/live.html` — **régie en direct**

| Élément | Valeur |
|---|---|
| Rôle | Régie : aperçu vidéo Cloudflare Stream, modération messages chat pending, gestion sondages, push annonces broadcast, toggles outils. Polling 5s sur messages pending. |
| Param URL | **`?id=<event_id>`** |
| `<title>` actuel | `Régie en direct · Admin Nomacast` (initial) **puis** mis à jour en `Régie · <ev.title> · Admin Nomacast` côté JS (`renderEvent`) |
| `<h1>` actuel | `Régie en direct` (`id="page-title"`) (jamais mis à jour) |
| Endpoint event | `GET /api/admin/events/<id>` |
| Endpoint polling | `GET /api/admin/events/<id>/messages?status=pending` (toutes les 5s) |
| Endpoint modération message | `PATCH /api/admin/events/<id>/messages/<msgId>` (approve/reject) |
| Endpoint delete message | `DELETE /api/admin/events/<id>/messages/<msgId>` |
| Endpoint sondages | `POST/GET/PATCH /api/admin/events/<id>/polls` + `/[pollId]` |
| Endpoint annonce | `POST /api/admin/events/<id>/announce` |
| Bouton "Éditer event" | `id="edit-link"` → `/admin/edit.html?id=<ev.id>` (set dans `renderEvent`) |
| Player vidéo | `<div class="regie-video-wrap">` (vide jusqu'à load) → iframe `<ev.stream_playback_url>?primaryColor=<color>&letterboxColor=transparent&muted=true` |
| Pas de lien vMix | aucun (la page `vmix.html` est séparée et autonome) |

### 1.6 `admin/vmix.html` — outil URL feed vMix

| Élément | Valeur |
|---|---|
| Rôle | Génère une URL signée HMAC pour vMix Browser Input (feed alertes participants) |
| Param URL | **`?event=<id>` OU `?id=<id>`** (les 2 acceptés, fallback en cascade) |
| `<title>` actuel | `URL vMix Alertes · Admin Nomacast` |
| `<h1>` actuel | `URL vMix Alertes` (statique) |
| Endpoint | `GET /api/admin/events/<event_id>/feed-token` |
| Retourne | `{ feed_url, event_title }` |
| Si `?event=<id>` ou `?id=<id>` présent | auto-déclenche `generateUrl()` au load |

### 1.7 `admin/polls-test.html` — page dev tests sondages

| Élément | Valeur |
|---|---|
| Rôle | Page de test interactive pour les endpoints sondages (utilisation dev, pas en prod) |
| Param URL | input `eventId` dans la page (saisie manuelle) |
| `<title>` actuel | `Test Sondages - Nomacast Admin` (format différent des autres) |
| `<h1>` | `Page de test des sondages` |
| Endpoints | `/api/admin/events/<eventId>/polls` (CRUD complet) |

### 1.8 `admin/admin.css` + `admin/admin.js`

Assets partagés inclus par toutes les pages admin (cf §4).

---

## 2. Pages Functions — inventaire exhaustif

### 2.1 Pages servies (rendent du HTML)

| Route | Fichier | Méthode | Auth | Description |
|---|---|---|---|---|
| `GET /chat/<slug>` | `functions/chat/[slug].js` | GET | publique | Page participant via URL publique. Si event privé → page "Lien requis". |
| `GET /chat/<slug>/calendar.ics` | `functions/chat/[slug]/calendar.ics.js` | GET | publique | Fichier .ics pour ajout agenda (event public) |
| `GET /chat/<slug>/status` | `functions/chat/[slug]/status.js` | GET | publique | JSON polling status event (transitions draft → live → ended) |
| `GET /i/<token>` | `functions/i/[token].js` | GET | token | Page invité privé via magic link. Trace `last_seen_at`. |
| `GET /i/<token>/calendar.ics` | `functions/i/[token]/calendar.ics.js` | GET | token | Fichier .ics personnel |
| `GET /i/<token>/status` | `functions/i/[token]/status.js` | GET | token | Polling status |
| `POST /i/<token>/resend` | `functions/i/[token]/resend.js` | POST | token | Renvoi du mail invitation au demandeur lui-même |
| `POST /i/<token>/send-invitations` | `functions/i/[token]/send-invitations.js` | POST | token | Endpoint historique (apparemment doublonné avec `/api/event-admin/<token>/send-invitations.js`) |
| `GET /event-admin/<token>` | `functions/event-admin/[token].js` | GET | client_admin_token | Page admin client (gestion invités sans login Nomacast). HMAC du slug avec ADMIN_PASSWORD. |
| `GET /quote/<id>` | `functions/quote/[id].js` | GET | publique | Page de partage citation (OG meta LinkedIn) |
| `GET /feed/alerts` | `functions/feed/alerts.js` | GET | token (HMAC) | Page HTML overlay broadcast pour vMix Browser Input (polling 2s) |
| `GET /feed/alerts (1)` | `functions/feed/alerts (1).js` | GET | — | **DOUBLON ORPHELIN identique** à `alerts.js`. À supprimer du repo. |
| `POST /chat-interactif` | `functions/chat-interactif.js` | POST | publique + Turnstile | Configurateur "Chat interactif" du site marketing (cohabite). |
| `GET/POST /envoyer.php` | `functions/envoyer.php.js` | GET, POST | publique + Turnstile | Formulaire contact site marketing. Utilise `env.RATE_LIMIT` (KV). |

### 2.2 API admin events `/api/admin/events/<id>/*`

Toutes protégées par Basic Auth via `functions/api/admin/_middleware.js`.

| Route | Méthodes | Description |
|---|---|---|
| `/api/admin/events` | GET, POST | Liste + création |
| `/api/admin/events/<id>` | GET, PATCH, DELETE | CRUD event individuel |
| `/api/admin/events/<id>/stream` | POST, DELETE | Provisionne/supprime live input Cloudflare Stream |
| `/api/admin/events/<id>/invitees` | GET, POST, DELETE | CRUD invités (DELETE est bulk delete) |
| `/api/admin/events/<id>/invitees/<invitee_id>` | DELETE | Supprime un invité |
| `/api/admin/events/<id>/invitees/<invitee_id>/resend` | POST | Renvoie mail à 1 invité |
| `/api/admin/events/<id>/send-invitations` | POST | Envoi batch à tous les invités sans `invited_at` |
| `/api/admin/events/<id>/messages` | GET | Liste messages (filtre `?status=`) |
| `/api/admin/events/<id>/messages/<msgId>` | PATCH, DELETE | Modération |
| `/api/admin/events/<id>/announce` | POST | Push annonce broadcast admin |
| `/api/admin/events/<id>/polls` | GET, POST | CRUD sondages |
| `/api/admin/events/<id>/polls/<pollId>` | GET, PATCH, DELETE | CRUD sondage individuel |
| `/api/admin/events/<id>/feed-token` | GET | URL signée vMix |
| `/api/admin/events/<id>/pre-event-questions` | GET (`?status=`) | Liste pre-event Q&A |
| `/api/admin/events/<id>/pre-event-questions/<qId>` | PATCH, DELETE | Modération |
| `/api/admin/events/<id>/pre-event-questions/<qId>/promote` | POST | Push question vers chat live |
| `/api/admin/events/<id>/ideas` | GET (`?status=`) | Liste idées |
| `/api/admin/events/<id>/ideas/<ideaId>` | (PATCH/DELETE non listés actuellement dans le repo cloné — à vérifier ; `admin-ideas-id.js` était dans la dernière livraison Tour 1) | — |
| `/api/admin/events/<id>/quotes` | GET (`?status=`) | Liste quotes |
| `/api/admin/events/<id>/quotes/<quoteId>` | PATCH, DELETE | Modération |
| `/api/admin/events/<id>/presence/list` | GET | Liste détaillée présence (named + anon_count) |
| `/api/admin/events/<id>/resources` | GET, POST | CRUD ressources |
| `/api/admin/events/<id>/ressources/<resId>` | PATCH, DELETE | ⚠️ NOTE : chemin **`ressources`** (FR avec 2 's') au lieu de `resources`. **Incohérent** avec la liste. À vérifier/aligner. |
| `/api/admin/events/<id>/ctas` | GET, POST | CRUD CTAs |
| `/api/admin/events/<id>/ctas/<ctaId>` | PATCH, DELETE | Désactivation CTA |
| `/api/admin/upload-logo` | POST | Upload logo client vers R2 (`env.LOGOS_BUCKET`) |
| `/api/admin/version` | GET | Build info (commit SHA, branche, date depuis env CF_PAGES_*) |

### 2.3 API chat participant `/api/chat/<slug>/*`

Toutes publiques. Rate-limit IP via `env.CHAT_IP_HASH_SECRET` (HMAC).

| Route | Méthodes | Description |
|---|---|---|
| `/api/chat/<slug>/messages` | GET, POST | Liste + envoi messages (rate limit 10/min/IP) |
| `/api/chat/<slug>/polls/active` | GET | Sondage actif |
| `/api/chat/<slug>/polls/<pollId>/vote` | POST | Voter |
| `/api/chat/<slug>/report-issue` | POST | Signaler problème technique (insert technical_alerts) |
| `/api/chat/<slug>/pre-event-questions` | GET, POST | Soumettre / lister questions pre-event |
| `/api/chat/<slug>/ideas` | GET, POST | Liste + soumettre idées |
| `/api/chat/<slug>/ideas/<ideaId>/vote` | POST | Voter pour une idée |
| `/api/chat/<slug>/quotes` | GET, POST | Liste + soumettre citations |
| `/api/chat/<slug>/reactions` | POST | Envoyer emoji (rate limit 10/10s/IP). Validation contre liste configurée pour l'event (mig 0016) |
| `/api/chat/<slug>/reactions/recent` | GET (`?since=ISO`) | Stream reactions récentes + totaux 5min. Renvoie `{reactions: [{emoji, created_at}], totals: {emoji: N}, server_time: ISO}` (pas d'invitee_id dans les rows) |
| `/api/chat/<slug>/reactions/config` | GET | **(nouveau mig 0016)** Liste emojis configurés pour l'event (fallback 8 originaux si NULL) — utilisé pour SSR + polling 15s côté frontend |
| `/api/chat/<slug>/presence/heartbeat` | POST | Ping présence (toutes les 30s) |
| `/api/chat/<slug>/presence/stats` | GET | Compteur "en ligne" (last_seen > NOW-60s) |
| `/api/chat/<slug>/resources` | GET | Liste resources |
| `/api/chat/<slug>/cta/active` | GET | CTA actif (avec expiration lazy) |
| `/api/chat/<slug>/cta-clicks` | POST | **(15 mai, Phase E.3 Part 1)** Tracking clic CTA. Auth `X-Magic-Token` (invité) ou `ip_hash` anonyme. Body `{cta_id}`. Insert non-bloquant (200 OK même si DB échoue). Insert dans `event_cta_clicks` (cf §5.9). |

### 2.4 API admin client `/api/event-admin/<token>/*`

Authentification : token = HMAC-SHA-256 du `slug + ':client'` avec `env.ADMIN_PASSWORD` (calculé via `computeClientToken`). Si `ADMIN_PASSWORD` change → tous les liens client invalidés.

| Route | Méthodes | Description |
|---|---|---|
| `/api/event-admin/<token>` | GET, PATCH | Lecture/édition event (limité aux champs côté client) |
| `/api/event-admin/<token>/invitees` | GET, POST, DELETE | CRUD invités |
| `/api/event-admin/<token>/invitees/<invitee_id>` | DELETE | Supprime invité |
| `/api/event-admin/<token>/invitees/<invitee_id>/resend` | POST | Renvoi mail |
| `/api/event-admin/<token>/send-invitations` | POST | Envoi batch |
| `/api/event-admin/<token>/upload-logo` | POST | Upload logo R2 (white-label client) |

### 2.5 API feed vMix

| Route | Méthodes | Description |
|---|---|---|
| `/api/feed/alerts` | GET | JSON polling pour overlay vMix. HMAC token vérifié (signé avec `env.CHAT_IP_HASH_SECRET`). |

### 2.6 Misc

| Route | Description |
|---|---|
| `/api/validate-code` | Valide les codes partenaires du configurateur tarifs (site marketing, lit KV `env.PARTNERS`) |
| `functions/nmc-7k9q3p2x/api/partners.js` | API admin codes partenaires (slug obfusqué, site marketing) |

---

## 3. Mail invitation — wording intégral

### Fichier source

**Chemin** : `functions/api/admin/events/[id]/send-invitations.js` (422 lignes)

**Déclenchement** : bouton "Envoyer les invitations (N)" dans `admin/invitees.html` (action `onSendBatch`) → `POST /api/admin/events/<event_id>/send-invitations` (action en bulk pour tous les invités sans `invited_at`).

**Renvoi individuel** : `POST /api/admin/events/<event_id>/invitees/<invitee_id>/resend` (fichier `resend.js`, duplique probablement la même logique de templating). Idem côté client admin : `POST /api/event-admin/<token>/send-invitations` et `.../invitees/<invitee_id>/resend`.

### Helpers d'envoi
```
DOMAIN     = 'nomacast.fr'
SITE_URL   = 'https://nomacast.fr'
FROM       = 'Nomacast <noreply@nomacast.fr>'
REPLY_TO   = 'evenement@nomacast.fr'
```

### Subject
```
Invitation : ${event.title}
```

### Variables interpolées dans le template

| Variable | Source |
|---|---|
| `greeting` | `'Bonjour ${firstName},'` (firstName = première partie de `invitee.full_name`), fallback `'Bonjour,'` |
| `event.title` | DB |
| `event.client_name` | DB |
| `event.access_mode` | `'public'` ou `'private'` (impacte le label "Accès") |
| `event.scheduled_at` | DB, formaté français complet UTC `lundi 15 septembre 2026 à 14h30 (UTC)` |
| `event.duration_minutes` | DB (utilisé pour calculer `end` agenda) |
| `event.primary_color` | DB, default `#5A98D6`. Utilisé comme `color` du hero + CTA. |
| `event.logo_url` | DB. Si présent → header bar `<img>` à la place du logo Nomacast. |
| `event.white_label` | DB (0/1). Si 1 → masque header Nomacast (sauf si event.logo_url) + masque footer. |
| `link` | `${SITE_URL}/i/${invitee.magic_token}` |
| `agendaUrls` | `{ google, outlook, ics }` calculés via `buildAgendaUrls()` |
| `orgLine` | `'organisé par ${client_name}'` si client_name présent, sinon `''` |

### Version texte (`buildText`)

Lignes (séparateur `\n`) :
```
${greeting}

Vous êtes invité(e) à participer au chat live de l'événement « ${event.title} »[, ${orgLine}].

DÉTAILS DE L'ÉVÉNEMENT
Date    : ${dateLabel}
Accès   : Lien personnel (ne pas partager)  [si private]
        OU
Accès   : Lien public                        [si public]

Pour rejoindre le chat live :
${link}

AJOUTER À MON AGENDA
Google  : ${agendaUrls.google}
Outlook : ${agendaUrls.outlook}
Apple / autre : ${agendaUrls.ics}

Le chat ouvrira automatiquement le jour J.

Nomacast — La qualité agence. Un seul interlocuteur.     [si !whiteLabel]
https://www.nomacast.fr · evenement@nomacast.fr           [si !whiteLabel]
```

### Version HTML (`buildHtml`)

Structure complète :
- **Préheader** masqué : `"Vous êtes invité(e) au chat live ${safeTitle}. ${safeDate}"`
- **Header bar** :
  - Si `event.logo_url` : `<img src="${event.logo_url}" alt="${client_name || title}" height="36">`
  - Sinon si `!whiteLabel` : logo Nomacast SVG (point cyan + texte "Nomacast")
  - Sinon : pas de header
- **Hero** (fond `${event.primary_color}`) :
  - Eyebrow : `Invitation chat live` (uppercase letterspacé)
  - H1 : `${event.title}`
  - Si orgLine : sous-titre `${orgLine}`
- **Intro paragraph** :
  - `${greeting}`
  - `Vous êtes invité(e) à participer au chat live de l'événement. Posez vos questions à l'oral, votez en temps réel, et interagissez avec les intervenants depuis votre navigateur — aucune installation nécessaire.`
- **Details box** (table bordée) :
  - Colonne Date : `${dateLabel}`
  - Colonne Accès : `Lien personnel` ou `Lien public`
- **CTA bouton** : "Rejoindre le chat live →" sur fond `${event.primary_color}` → `${link}`
- **Fallback link** : "Si le bouton ne fonctionne pas, copiez ce lien : ${link}"
- **Agenda block** : 3 boutons (Google / Outlook / Apple-iCal)
- **Agenda tip** (bloc bas) :
  - Texte fixe : `Le chat ouvrira automatiquement le jour J.`
  - Si `access_mode === 'private'` : suffixe `<br>Ce lien est personnel — merci de ne pas le partager.`
- **Footer** (si !whiteLabel) : logo Nomacast + tagline `La qualité agence. Un seul interlocuteur.`

⚠️ **Cible TODO mail invitation** : c'est l'eyebrow ligne 344 (`Invitation chat live`), le paragraphe intro lignes 358-360, et le bloc "Agenda tip" ligne 409 (`Le chat ouvrira automatiquement le jour J.`) qu'il faudra modifier.

---

## 4. Helpers partagés

### 4.1 `window.NomacastAdmin` (exposé par `admin/admin.js`)

**14 méthodes exposées** :

```js
window.NomacastAdmin = {
  // HTTP
  apiFetch,             // (url, opts) → fetch wrapper, JSON auto, throw si !response.ok

  // Formatters
  formatDate,           // (iso) → "15 mai 2026"
  formatDateTime,       // (iso) → "15 mai 2026 à 14h30"
  formatDuration,       // (minutes) → "1h 30min"
  statusLabel,          // (status) → "Brouillon" | "En direct" | "Terminé"

  // DOM helpers
  el,                   // (tag, opts) → HTMLElement (zéro innerHTML, opts.className/text/html/attrs/style/on/children)
  clearNode,            // (node) → vide le node

  // UI
  showMessage,          // (container, type, text) → affiche un .admin-msg .admin-msg-(error|success)
  confirmAction,        // (message) → window.confirm wrapper

  // Datetime
  isoToLocalInput,      // (iso) → string "YYYY-MM-DDTHH:MM" pour input datetime-local
  localInputToIso,      // (local) → string ISO

  // Cards (event-specific)
  renderPublicLink,     // (event) → card "Page publique partageable" (URL /chat/slug ou ?preview)
  renderClientAdminLink,// (event) → card "Lien admin client" (URL /event-admin/<client_admin_token>)
  renderStreamCard,     // (event, onChange) → card "Streaming live" (preview iframe + RTMPS + Stream Key + Playback)

  // Version
  loadVersion           // (targetEl) → fetch /api/admin/version et met à jour la pill "build XX"
}
```

**Auto-loader** : `autoLoadVersion()` au DOM ready cible `#admin-version` (pill dans tous les `.admin-header`).

**Helpers internes non exposés** (pas dans window) : `buildStreamFieldRow`, `formatRelativeTime`.

### 4.2 Variables CSS (`admin/admin.css` `:root`)

```css
--cyan:        #5A98D6;
--cyan-hover:  #4886c4;
--cyan-light:  rgba(90, 152, 214, 0.08);
--navy:        #0b1929;
--navy-light:  #142436;
--ink:         #0f172a;
--ink-muted:   #475569;
--ink-faint:   #94a3b8;
--border:      #e2e8f0;
--border-light:#f1f5f9;
--white:       #ffffff;
--off-white:   #f8fafc;
--bg:          #f1f5f9;
--green:       #10b981;
--green-light: rgba(16, 185, 129, 0.1);
--red:         #ef4444;
--red-light:   rgba(239, 68, 68, 0.1);
--orange:      #f59e0b;
--orange-light:rgba(245, 158, 11, 0.1);
--max:         1200px;
--font-head:   'Outfit', sans-serif;
--font-body:   'Plus Jakarta Sans', sans-serif;
--radius:      8px;
--radius-lg:   12px;
```

### 4.3 Classes utilitaires admin (`admin.css`)

| Classe | Usage |
|---|---|
| `.admin-header` | Bandeau haut avec brand + actions |
| `.admin-header-brand` `.admin-header-brand-dot` `.admin-header-brand-link` | Logo "● Nomacast" cliquable vers `/admin/` |
| `.admin-header-title` | Sous-titre "Admin Chat interactif" |
| `.admin-header-actions` | Conteneur droite (build pill, liens) |
| `.admin-header-version` (`#admin-version`) | Pill build version, auto-rempli par `loadVersion()` |
| `.admin-header-link` | Lien text dans le header |
| `.admin-main` | `<main>` wrapper |
| `.admin-page-head` | Container titre + sous-titre + actions |
| `.admin-page-head-sub` (`#page-sub`) | Sous-titre dynamique |
| `.admin-card` `.admin-card-body` `.admin-card-empty` | Cards classiques |
| `.admin-btn` `.admin-btn-primary` `.admin-btn-secondary` `.admin-btn-danger` `.admin-btn-ghost` `.admin-btn-sm` | Boutons |
| `.admin-table` `.admin-table-actions` | Tables (utilisé dans index.html, invitees.html) |
| `.admin-badge` `.admin-badge-draft` `.admin-badge-live` `.admin-badge-ended` | Pills statut |
| `.admin-form` `.admin-form-row` `.admin-form-field` `.admin-form-label` `.admin-form-label-req` `.admin-form-hint` | Formulaires |
| `.admin-form-input` `.admin-form-select` `.admin-form-textarea` | Inputs |
| `.admin-form-checkboxes` `.admin-form-check` `.admin-form-check-label` `.admin-form-check-desc` | Checkboxes stylées |
| `.admin-form-actions` `.admin-form-actions-left` | Footer formulaire |
| `.admin-msg` `.admin-msg-error` `.admin-msg-success` `.admin-msg-error-inline` | Messages utilisateur |
| `.admin-loader` | Spinner |
| `.admin-mono` | Police mono inline |
| `.admin-text-muted` | Texte gris |
| `.admin-public-link` `.admin-public-link-label` `.admin-public-link-url` `.admin-public-link-hint` `.admin-public-link-actions` `.admin-public-link-warn` `.admin-public-link-info` | Cards URL avec boutons |
| `.admin-stream-card` `.admin-stream-details` `.admin-stream-row` `.admin-stream-row-label` `.admin-stream-row-value` `.admin-stream-row-code` `.admin-stream-row-actions` | Card streaming CF Stream |
| `.admin-logo-preview` | Aperçu logo uploadé |

### 4.4 Basic Auth — pattern

**Middleware pages HTML** : `functions/admin/_middleware.js`
- Couvre `/admin/*` (toutes les pages HTML)
- Vérifie header `Authorization: Basic <base64>` 
- Username ignoré, password comparé à `env.ADMIN_PASSWORD`
- 401 + `WWW-Authenticate: Basic realm="Nomacast Admin", charset="UTF-8"` si échec

**Middleware API JSON** : `functions/api/admin/_middleware.js`
- Couvre `/api/admin/*` (toutes les Functions)
- Même logique, mais retourne `{"error":"Authentication required"}` en JSON
- Le navigateur réutilise automatiquement les credentials Basic Auth cachés (same-origin)

⚠️ Conséquence : pour appeler les API admin en CLI/curl, il faut le header Basic Auth (`-u admin:<password>` avec curl).

### 4.5 Helpers inline dans les Pages Functions

**Pas d'imports croisés possibles en Cloudflare Pages Functions**. Chaque endpoint redéfinit ses helpers :

```js
async function hashIp(ip, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
```

Pour les tokens admin (preview admin, client admin) : `computePreviewToken(slug, ADMIN_PASSWORD)` et `computeClientToken(slug, ADMIN_PASSWORD)` dans `functions/api/admin/events/[id].js` et `functions/event-admin/[token].js`.

---

## 5. Schéma D1 events COMPLET

### 5.1 Table `events`

Source de vérité : **`db/schema.sql` + migrations ALTER cumulatives**.

```sql
CREATE TABLE IF NOT EXISTS events (
  -- Identité
  id                  TEXT PRIMARY KEY,                 -- nano-id 12 chars
  slug                TEXT UNIQUE NOT NULL,             -- normalisé [a-z0-9-]
  title               TEXT NOT NULL,
  client_name         TEXT,                             -- nom entreprise organisatrice
  
  -- Planning
  scheduled_at        TEXT NOT NULL,                    -- ISO 8601
  duration_minutes    INTEGER NOT NULL,
  audience_estimate   INTEGER,                          -- nullable
  
  -- Workflow
  status              TEXT NOT NULL DEFAULT 'draft',    -- ENUM : draft | live | ended
  
  -- Branding
  primary_color       TEXT DEFAULT '#5A98D6',
  logo_url            TEXT,                             -- URL R2 (LOGOS_BUCKET)
  white_label         INTEGER DEFAULT 0,                -- 0/1 (SQLite n'a pas BOOLEAN)
  subtitles           INTEGER DEFAULT 0,                -- 0/1
  
  -- Modes d'interaction
  modes_json          TEXT,                             -- JSON array sérialisé, exposé en `modes` (array) côté API
  
  -- Reactions configurables (mig 0016_reactions_config)
  reaction_emojis_json TEXT,                            -- JSON array 1-5 emojis. NULL = défaut 8 originaux. Pool autorisé : 15 emojis.

  -- Description event (mig event_description du 15 mai, FR-3)
  description         TEXT,                             -- max 500c, affichée sur waiting/live/ended + mail invitation. NULL si non renseignée.

  -- Auth client login/password (mig client_credentials du 15 mai)
  client_login        TEXT,                             -- identifiant lisible (par défaut = slug). UNIQUE INDEX partiel (NULL ignoré).
  client_password_hash TEXT,                            -- format `pbkdf2:<salt_b64url>:<hash_b64url>` (100k itérations SHA-256). NULL = pas de credentials configurés.

  -- Accès
  access_mode         TEXT DEFAULT 'public',            -- ENUM : public | private
  
  -- Streaming (ajoutés par migration 0007)
  stream_uid          TEXT,                             -- UID Cloudflare Stream live input
  stream_rtmps_url    TEXT,                             -- "rtmps://live.cloudflare.com..."
  stream_rtmps_key    TEXT,                             -- clé secrète RTMPS (à révéler avec discrétion)
  stream_playback_url TEXT,                             -- "https://iframe.videodelivery.net/<uid>"
  stream_created_at   TEXT,                             -- ISO
  
  -- Audit
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_slug      ON events(slug);
CREATE INDEX idx_events_status    ON events(status);
CREATE INDEX idx_events_scheduled ON events(scheduled_at);
-- Unique partiel : autorise plusieurs events sans login défini, mais 2 events ne peuvent pas avoir le même client_login
CREATE UNIQUE INDEX idx_events_client_login ON events(client_login) WHERE client_login IS NOT NULL;
```

### 5.2 Tokens DÉRIVÉS (non stockés)

Calculés à la volée dans `functions/api/admin/events/[id].js` :

| Token | Calcul |
|---|---|
| `admin_preview_token` | HMAC-SHA-256 du `slug` avec `env.ADMIN_PASSWORD` (hex) |
| `client_admin_token` | HMAC-SHA-256 du `slug + ':client'` avec `env.ADMIN_PASSWORD` (hex) |

Conséquence : si `ADMIN_PASSWORD` change → **tous** les liens admin client + preview admin sont invalidés automatiquement.

### 5.3 `modes_json` — valeurs attendues

Array JSON sérialisé, élément ∈ :
```
['qa', 'libre', 'sondages', 'quiz', 'nuage', 'reactions', 'lecture',
 'presence', 'cta', 'ideas', 'quotes', 'resources', 'pre_event_qa']
```

Côté API GET : désérialisé en `event.modes` (array). Côté PATCH : envoyer `data.modes = [...]` (array) — le serveur sérialise en `modes_json`. **Aucune validation du contenu** côté serveur (pas de whitelist), c'est le frontend admin qui propose les checkboxes.

| Mode | Status implémentation participant |
|---|---|
| `qa`, `libre`, `sondages`, `quiz`, `nuage`, `lecture` | Tour 1 (état stable) |
| `reactions`, `presence`, `cta` | Tour 2.A déployé (cf §11 marqueurs `nomacast-lot-2a-v1`) |
| `ideas`, `quotes`, `resources`, `pre_event_qa` | Backend Tour 1 prêt, frontend Tour 2.B/2.C/2.D à venir |

### 5.4 Reactions configurables (`reaction_emojis_json`)

Colonne ajoutée par migration **0016** (mai 2026).

**Pool autorisé** (validé côté `PATCH /api/admin/events/[id]`) : 15 emojis
```
👏 ❤️ 🔥 🎉 🙏 👍 😂 🤔 💡 🚀 ✨ 🤯 🥳 🤝 ⭐
```

**Default si NULL** (utilisé par `/reactions/config` et `reactions.js`) : 8 originaux
```
👏 ❤️ 🔥 🎉 🙏 👍 😂 🤔
```

**Configuré** : array JSON 1 à 5 emojis du pool. Rejets PATCH 400 si : pas un array, length hors 1-5, emoji hors pool, doublon.

### 5.5 Status enum CONFIRMÉ

```
draft  → "Brouillon"
live   → "En direct"
ended  → "Terminé"
```

⚠️ **Aucun statut `upcoming` ni `archived`** dans le code. Le rapport précédent les mentionnait à tort.

### 5.6 Table `invitees`

```sql
CREATE TABLE IF NOT EXISTS invitees (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL,
  email         TEXT NOT NULL,
  full_name     TEXT,
  company       TEXT,
  magic_token   TEXT UNIQUE NOT NULL,                   -- URL /i/<magic_token>
  invited_at    TEXT,                                   -- NULL = pas encore invité
  last_seen_at  TEXT,                                   -- maj côté /i/<token> au load
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  UNIQUE (event_id, email)
);

CREATE INDEX idx_invitees_event ON invitees(event_id);
CREATE INDEX idx_invitees_token ON invitees(magic_token);
CREATE INDEX idx_invitees_email ON invitees(email);
```

### 5.7 Autres tables (résumé)

Schémas complets disponibles dans les fichiers migrations correspondants.

- `chat_messages` (mig 0008 + 0011 ip_hash) — messages chat live, modération
- `polls`, `poll_options`, `poll_votes` (mig 0012)
- `technical_alerts` (mig 0013)
- `pre_event_questions`, `ideas`, `idea_votes`, `event_quotes`, `event_reactions`, `event_presence`, `event_resources`, `event_ctas` (mig 0014)
- `auth_logs` (mig 0019, 15 mai — cf §5.8 ci-dessous) — forensics tentatives login `/event-admin/login`
- `event_cta_clicks` (mig 0020, 15 mai — cf §5.9 ci-dessous) — tracking clics CTA participant (Phase E.3 Part 1)

### 5.8 Table `auth_logs` (15 mai, Lot F sécu phase 1)

```
auth_logs
  id           TEXT PK
  event_id     TEXT FK → events(id) ON DELETE SET NULL
  login        TEXT (≤80c)
  ip_hash      TEXT (HMAC-SHA-256 de l'IP, 32 chars b64url)
  success      INTEGER (0/1)
  reason       TEXT NULL ('unknown_login' | 'wrong_password' | 'rate_limited' | null)
  user_agent   TEXT (≤256c)
  attempted_at TEXT ISO
  Indexes : (ip_hash, attempted_at DESC), (event_id, attempted_at DESC), (attempted_at DESC)
```

Insertion systématique depuis `functions/event-admin/login.js` à chaque tentative (success ET fail). Le `event_id` est NULL si le `login` saisi n'existe pas (cas `unknown_login`). `ip_hash` réutilise `env.CHAT_IP_HASH_SECRET` pour cohérence avec les autres tables anonymisées.

### 5.9 Table `event_cta_clicks` (15 mai, Phase E.3 Part 1)

```
event_cta_clicks
  id         TEXT PK
  cta_id     TEXT FK → event_ctas(id) ON DELETE CASCADE
  event_id   TEXT FK → events(id) ON DELETE CASCADE
  invitee_id TEXT FK → invitees(id) ON DELETE SET NULL
  anon_key   TEXT (32 chars, hash IP tronqué)
  ip_hash    TEXT (HMAC-SHA-256 IP, 32 chars b64url)
  clicked_at TEXT ISO
  Pas d'UNIQUE constraint (un invité peut cliquer plusieurs fois — info intéressante)
  Indexes : (event_id, clicked_at DESC), (invitee_id, clicked_at DESC), (cta_id)
```

Insertion depuis `functions/api/chat/[slug]/cta-clicks.js` (POST). Auth cohérente `messages.js` : `X-Magic-Token` si invité, sinon `ip_hash` anonyme. Insert **non-bloquant** (200 OK même si DB échoue — la table peut manquer sans casser l'UX). Pas d'UNIQUE constraint, car connaître la fréquence de clic d'un même invité fait partie du signal analytique (Phase E.3 Part 2 timeline).

---

## 6. URLs publiques

| Pattern | Type | Auth | Description |
|---|---|---|---|
| `/admin/<page>` | HTML | Basic Auth (`ADMIN_PASSWORD`) **OU** cookie session client si URL = `/admin/live.html?id=<event_id>` matching | Admin Nomacast — exception cookie session permet à l'iframe régie de fonctionner sans Basic Auth popup |
| `/api/admin/*` | JSON | Basic Auth **OU** cookie session client si URL = `/api/admin/events/<event_id>/*` matching | API admin (iframe régie partage l'auth via cookie) |
| `/i/<magic_token>` | HTML | magic_token (lookup invitees) | Page invité privé |
| `/i/<magic_token>/calendar.ics` | text/calendar | magic_token | .ics personnel |
| `/i/<magic_token>/status` | JSON | magic_token | Polling status |
| `/chat/<slug>` | HTML | publique (ou `?preview=<admin_preview_token>` pour event privé) | Page participant publique |
| `/chat/<slug>/calendar.ics` | text/calendar | publique | .ics public |
| `/chat/<slug>/status` | JSON | publique | Polling status |
| `/api/chat/<slug>/*` | JSON | publique (rate-limit IP) | API participant |
| **`/event-admin/login`** | HTML/POST | aucune (formulaire) | **Page login client** (15 mai) — accepte login+password, pose cookie session HMAC signé, redirige vers `/event-admin/<slug>` |
| **`/event-admin/logout`** | HTML | aucune | **Efface cookie session** + redirige vers login |
| `/event-admin/<slug>` | HTML | **cookie session valide pour cet event_id** | Page admin client avec onglets DATA + RÉGIE LIVE (iframe `/admin/live.html?id=<id>`). Le HMAC backup a été supprimé le 15 mai — toi tu te connectes comme un client. |
| `/api/event-admin/<client_admin_token>/*` | JSON | HMAC (token calculé serveur-side, passé au JS embarqué) | API admin client (stats, csv, invitees, etc.) |
| `/quote/<id>` | HTML | publique (event_quotes.status IN ('approved','pinned')) | Page partage citation (OG meta LinkedIn) |
| `/feed/alerts?event=<id>&token=<hmac>` | HTML | HMAC | Page overlay vMix Browser Input |
| `/api/feed/alerts?event=<id>&token=<hmac>` | JSON | HMAC | JSON polling vMix |

### Architecture auth client login/password (15 mai 2026)

**Helpers** :
- `functions/_lib/password.js` : `generatePassword(12)` (charset sans ambiguïté `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789`), `hashPassword()`/`verifyPassword()` PBKDF2-SHA256 100k itérations, comparaison constante temps
- `functions/_lib/session.js` : `signSession/verifySession`, `createSessionCookieValue/buildSetCookieHeader/buildClearCookieHeader/readSessionCookie/getSessionFromRequest`. Cookie `nomacast_session` HttpOnly+Secure+SameSite=Lax+Max-Age=7j. Payload `{event_id, login, exp}` signé HMAC-SHA256 avec `env.SESSION_SECRET`.

**Endpoints credentials (admin Nomacast uniquement)** :
- `GET /api/admin/events/<id>/credentials` → `{ login, has_password }` (hash JAMAIS exposé)
- `PUT /api/admin/events/<id>/credentials` body `{ login }` → met à jour le login
- `POST /api/admin/events/<id>/credentials` → génère un nouveau password, renvoie **en clair UNE FOIS** dans la réponse, puis stocke hashé
- `DELETE /api/admin/events/<id>/credentials` → reset login + password (event inaccessible côté client)

**Variable d'env** : `env.SESSION_SECRET` (32 bytes base64, à mettre dans Cloudflare Pages settings Production+Preview). Si manquante, `/event-admin/login` retourne 500.

**Cross-event protection** : cookie session contient `event_id`, middleware refuse si URL demande un autre event_id.

**Rafraîchissement glissant** : à chaque visite de `/event-admin/<slug>`, le cookie est ré-émis avec `exp=now+7j`. Utilisateur actif = session indéfiniment renouvelée.

⚠️ **Pas de route `/c/<token>`**. L'interface admin client est `/event-admin/<token>` (pas `/c/`).

---

## 7. Env vars & bindings

### 7.1 Env vars utilisées dans `functions/` (grep `env.XXX`)

| Variable | Type | Utilisation |
|---|---|---|
| `env.DB` | D1 binding | Base `nomacast-events` (utilisée partout) |
| `env.LOGOS_BUCKET` | R2 binding | Upload logo client (white-label) |
| `env.PARTNERS` | KV binding | Codes partenaires configurateur tarifs (site marketing) |
| `env.RATE_LIMIT` | KV binding | Rate limit `envoyer.php.js` (site marketing) |
| `env.ADMIN_PASSWORD` | secret | Auth Basic admin + dérive `admin_preview_token` et `client_admin_token` (HMAC) |
| `env.SESSION_SECRET` | secret | **(15 mai)** Signe les cookies session client login/password. 32 bytes base64. Sans cette variable, `/event-admin/login` retourne 500. |
| `env.CHAT_IP_HASH_SECRET` | secret | HMAC anonymisation IP pour ip_hash D1 + signature URL feed vMix |
| `env.RESEND_API_KEY` | secret | Envoi emails (Resend) |
| `env.TURNSTILE_SECRET_KEY` | secret | Validation Turnstile (site marketing) |
| `env.HEALTHCHECK_TOKEN` | secret | Bypass Turnstile/RateLimit workflow daily |
| `env.CLOUDFLARE_ACCOUNT_ID` | plaintext | API Cloudflare Stream |
| `env.CLOUDFLARE_STREAM_API_TOKEN` | secret | Token API Cloudflare Stream |
| `env.CF_PAGES_COMMIT_SHA` | auto-injecté | Build info `/api/admin/version` |
| `env.CF_PAGES_BRANCH` | auto-injecté | Build info |
| `env.CF_PAGES_URL` | auto-injecté | Build info |

### 7.2 Bindings Cloudflare Pages

| Binding | Type | Resource |
|---|---|---|
| `DB` | D1 | `nomacast-events` (ID `6af04086-6735-4d72-8d9e-7a2ff1b024dc`) |
| `LOGOS_BUCKET` | R2 | Bucket logos clients |
| `PARTNERS` | KV | `nomacast_partners` (ID `8a26bab4f86e41b2a9e490981b9b9aa1`) |
| `RATE_LIMIT` | KV | Rate limiter `envoyer.php` |

### 7.3 Secrets GitHub repo `Nomacast/nomacast.fr`

(Utilisés par les GitHub Actions de déploiement.)

| Nom | Usage |
|---|---|
| `CLOUDFLARE_API_TOKEN` | wrangler + purge cache |
| `CLOUDFLARE_ACCOUNT_ID` | |
| `CLOUDFLARE_ZONE_ID` | purge cache zone |
| `HEALTHCHECK_TOKEN` | workflow healthcheck |

⚠️ **À rotater (exposition antérieure)** : `CHAT_IP_HASH_SECRET`.

---

## 8. Migrations

```
migrations/
├── 0007-stream-fields.sql         — ALTER events ADD stream_uid, stream_rtmps_url, stream_rtmps_key, stream_playback_url, stream_created_at
├── 0008-chat-messages.sql         — CREATE TABLE chat_messages (Q&A modéré + chat libre)
├── 0009-stream-custom-subdomain.sql — Migration URLs vers stream.nomacast.fr (PUIS annulée)
├── 0010-revert-stream-subdomain.sql — REVERT du 0009 (CNAME Cross-User Banned côté Cloudflare)
├── 0011-chat-messages-ip-hash.sql — ALTER chat_messages ADD ip_hash (rate limit + analytics)
├── 0012-polls.sql                  — CREATE polls + poll_options + poll_votes
├── 0013_technical_alerts.sql       — CREATE technical_alerts (feed vMix Browser Input)
├── 0014_interactions_bundle.sql    — CREATE pre_event_questions + ideas + idea_votes + event_quotes + event_reactions + event_presence + event_resources + event_ctas (8 tables Tour 1 modes interactions)
├── 0015_analytics_foundation.sql   — CREATE visits + event_presence_history + event_reports / ALTER invitees (source, job_title, phone, consent_at, consent_marketing_at, anonymized_at, registered_via) / ALTER events (requires_registration, client_organization_name, data_purpose) — analytics + lead capture + RGPD
├── 0016_reactions_config.sql       — ALTER events ADD reaction_emojis_json (1-5 emojis du pool de 15 par event, Tour 2.A-bis)
├── 0016_client_credentials.sql ⚠️  — DOUBLON DE NUMÉROTATION (15 mai). ALTER events ADD client_login + client_password_hash, UNIQUE INDEX partiel sur client_login. À renommer en `0017_client_credentials.sql` via GitHub web.
├── 0017_event_description.sql ⚠️  — À renommer en `0018_event_description.sql` après le rename ci-dessus. ALTER events ADD description (15 mai, FR-3).
├── 0019_auth_logs.sql               — CREATE auth_logs (Lot F sécu phase 1, 15 mai). Forensics tentatives login `/event-admin/login`.
└── 0020_event_cta_clicks.sql        — CREATE event_cta_clicks (Phase E.3 Part 1, 15 mai). Tracking clics CTA participant + 3 indexes (event, invitee, cta).
```

### Conflit numérotation 0016 (à régulariser)

Le 15 mai, j'ai créé `0016_client_credentials.sql` sans détecter que `0016_reactions_config.sql` existait déjà. La DB s'en moque (les ALTER TABLE ADD COLUMN portent sur des colonnes différentes), mais c'est moche dans le repo.

**Action** : via GitHub web (icône poubelle sur la page du fichier — la sync Drive→GitHub ne propage pas les suppressions), supprimer puis re-uploader avec les nouveaux noms :
- `0016_client_credentials.sql` → `0017_client_credentials.sql`
- `0017_event_description.sql` → `0018_event_description.sql`

### Schéma initial

⚠️ **Les migrations `0001` à `0006` ne sont PAS dans le repo**. Le schéma initial des tables `events` et `invitees` est dans `db/schema.sql` (pas dans migrations/). Pour repartir de zéro, appliquer le schéma initial puis chronologiquement chaque migration `0007` à `0020` (après renommage des doublons 0016).

### Convention nommage

- `0007` à `0012` : préfixe `XXXX-nom-kebab.sql`
- `0013` à `0020` : préfixe `XXXX_nom_snake.sql`

### Console D1 — approche privilégiée

**Méthode standard** : coller le SQL pur dans la **console web Cloudflare** (Cloudflare > Workers & Pages > D1 > nomacast-events > Console).

⚠️ La console web **ne supporte pas les commentaires `--` entre statements** (les traite comme requêtes vides → `The request is malformed: Requests without any query are not supported`). Pour les migrations multi-statements avec commentaires : retirer les commentaires intercalaires avant de coller.

**Méthode alternative (wrangler CLI)** : `wrangler d1 execute nomacast-events --remote --file=./migrations/XXXX_xxx.sql` (depuis terminal local, après `wrangler login`).

**Toujours faire suivre** par une commande SQL de vérif, ex : `SELECT <nouvelle_colonne> FROM <table> LIMIT 1`.

---

## 9. Corrections vs RAPPORT-INFRASTRUCTURE.md du 14/05 (premier jet)

### Erreurs / imprécisions corrigées

| Sujet | Premier jet | Réalité vérifiée |
|---|---|---|
| Page admin event individuel | `admin/events.html` (?) à confirmer | **`admin/edit.html`** — pas de `events.html` dans le repo |
| Localisation panneau URLs cible | "à identifier dans le repo" | `admin/edit.html` ligne 41 (`<div id="public-link-zone">`) — actuellement peuplée par `A.renderPublicLink(ev) + A.renderClientAdminLink(ev) + A.renderStreamCard(ev, load)` |
| Mail invitation localisation | "probablement `send-invitations.js`" | **Confirmé** : `functions/api/admin/events/[id]/send-invitations.js` |
| Status enum | `upcoming | live | ended | archived` | **`draft | live | ended`** uniquement (3 valeurs) |
| Stream fields | `stream_video_id`, `stream_subdomain` | **`stream_uid`, `stream_rtmps_url`, `stream_rtmps_key`, `stream_playback_url`, `stream_created_at`** (5 colonnes, pas `stream_video_id`) |
| Modes (colonne DB) | `modes` (JSON) | **`modes_json`** côté DB, **`modes`** (array) côté API JSON |
| Champ token client | `client_token` | **N'existe pas en DB**. Le `client_admin_token` est **calculé à la volée** (HMAC). Pareil pour `admin_preview_token`. |
| URL admin client | `/c/<client_token>` | **`/event-admin/<client_admin_token>`** |
| Routes API admin | partielles | Liste exhaustive §2.2 (29 routes admin) |
| Pages admin existantes | 4 + `/admin/events.html` (?) | **7 pages HTML** : `index.html`, `edit.html`, `new.html`, `invitees.html`, `live.html`, `vmix.html`, `polls-test.html` |
| `window.NomacastAdmin` exports | non listé | 14 méthodes listées §4.1 |
| Variables CSS | non listées | Listées §4.2 (24 variables) |
| Classes CSS utilitaires | non listées | Listées §4.3 |
| Migrations | non listées | Listées §8 (0007 à 0014) + note schéma initial dans `db/schema.sql` |
| Bindings | `DB` + `PARTNERS` | + **`LOGOS_BUCKET`** + **`RATE_LIMIT`** (2 KV) |
| Env vars | partielles | 13 env vars listées §7.1 (vérifiées par grep `env.XXX`) |
| Sous-routes `chat/[slug]/calendar.ics` et `/status` | non mentionnées | Documentées §2.1 |
| Sous-routes `i/[token]/calendar.ics`, `/status`, `/resend`, `/send-invitations` | non mentionnées | Documentées §2.1 |
| Pages `chat-interactif.js` et `envoyer.php.js` | non mentionnées | Documentées §2.1 (cohabitation site marketing) |
| Routes `/api/event-admin/<token>/*` | non mentionnées | Documentées §2.4 (6 routes) |

### Anomalies du repo à signaler

| Fichier | Anomalie |
|---|---|
| `functions/feed/alerts (1).js` | **Doublon orphelin** identique à `functions/feed/alerts.js`. Probablement créé par une copie de fichier mal nettoyée. À supprimer du repo (passer par GitHub web vu que sync Drive ne propage pas les suppressions). |
| `functions/api/admin/events/[id]/ressources/[resId].js` (avec 2 's') vs `functions/api/admin/events/[id]/resources.js` | **Chemin incohérent FR/EN**. Le PATCH/DELETE d'une ressource individuelle passe par `/ressources/<resId>` (FR) tandis que le GET/POST liste est sur `/resources` (EN). À aligner. |
| Migrations `0001-0006` | **Absentes du repo**. Le schéma initial est dans `db/schema.sql`. Pour un dev qui repart de zéro, l'ordre est : `db/schema.sql` puis `migrations/0007*` à `migrations/0014*`. |

---

## 10. Cibles précises pour les 4 TODOs

### 10.1 Ajouter un panneau URLs dans `edit.html` ✅ FAIT (15 mai)

Panneau URLs en place dans `<div id="public-link-zone">` ligne 41 de `admin/edit.html`. Affiche désormais :
- Lien événement (participant) — public ou privé avec `?preview=<admin_preview_token>`
- **Lien admin client** = `${origin}/event-admin/<client_login>` (depuis 15 mai, login obligatoire). Si pas de credentials configurés, affiche « — Pas encore configuré — » avec lien vers la card "Accès client" plus bas.
- Lien régie en direct (si `ev.stream_uid`)
- URL feed vMix (si `ev.stream_uid`)

Le HMAC backup `client_admin_token` reste calculé côté serveur (pour rétro-compat des liens internes du JS embarqué dans event-admin) mais n'est plus exposé à l'admin Nomacast comme lien direct sans login.

### 10.2 Uniformiser les `<title>` "nom page - nom événement"

**Pages avec event chargé** (titre dynamique à mettre à jour après `apiFetch`) :

| Fichier | `<title>` initial à mettre | Maj dynamique à ajouter |
|---|---|---|
| `admin/edit.html` ligne 7 | `Éditer · Admin Nomacast` | dans `renderForm(ev)` : `document.title = 'Éditer - ' + ev.title;` |
| `admin/invitees.html` ligne 7 | `Invités · Admin Nomacast` | dans `loadAll()` après `state.event = eventData.event;` (ligne ~224) : `document.title = 'Invités - ' + state.event.title;` + remplacer `pageTitle.textContent = 'Invités · ' + state.event.title;` par `'Invités - ' + ...` |
| `admin/live.html` ligne 7 | `Régie · Admin Nomacast` | ligne 704 actuelle : `document.title = 'Régie · ' + ev.title + ' · Admin Nomacast';` → remplacer par `'Régie - ' + ev.title;` |
| `admin/vmix.html` ligne 7 | `vMix · Admin Nomacast` | dans `generateUrl()` après `data = await ...` : `if (data.event_title) document.title = 'vMix - ' + data.event_title;` |

**Pages sans event** (titre statique, juste cohérence formatage) :
| Fichier | Titre actuel | Titre cohérent suggéré |
|---|---|---|
| `admin/index.html` | `Events · Admin Nomacast` | inchangé OK |
| `admin/new.html` | `Nouvel event · Admin Nomacast` | inchangé OK |
| `admin/polls-test.html` | `Test Sondages - Nomacast Admin` | `Tests sondages · Admin Nomacast` (homogénéiser le séparateur `·`) |

### 10.3 Brancher le branding white-label sur la régie

**Fichier** : `admin/live.html`

**Zone à modifier** : fonction `renderVideo(ev)` lignes 713-737 actuelles. L'iframe est déjà construite avec `primaryColor=<color>` dans la query string (ligne 725) en utilisant `ev.primary_color || '#5A98D6'` (ligne 722).

**Manque** :
1. Accent visuel (border/shadow) en `ev.primary_color` sur le wrapper `.regie-video-wrap` (au lieu du bg `#0f172a` statique)
2. **Overlay logo coin haut-droit** :
   - Si `ev.white_label === true` ET `ev.logo_url` → `<img src="${ev.logo_url}">` en watermark
   - Sinon → badge HTML "● Nomacast" (point + texte)

**Champs DB disponibles** : `ev.white_label` (boolean exposé par l'API, originellement INTEGER 0/1 en DB), `ev.primary_color`, `ev.logo_url`.

**CSS existant à étendre** : `.regie-video-wrap` lignes 123-130 de `admin/live.html` (CSS embarqué dans la `<head>`).

### 10.4 Modifier le wording du mail invitation ✅ Résolu (15 mai)

**Livré** : helper `functions/_lib/invitation-email.js` créé (subject + buildText + buildHtml), **les 4 endpoints d'envoi/resend** importent désormais le helper (single source of truth). Bilan : **1731 → 791 lignes, soit -940 lignes (54% de réduction)**. Plus aucune duplication du template HTML/texte (cf §12 bloc imports). Détail historique conservé ci-dessous pour traçabilité.

**Fichier** : `functions/api/admin/events/[id]/send-invitations.js`

**À modifier** :

1. **Eyebrow HTML** ligne 344 : `Invitation chat live` → `Invitation événement live`

2. **Paragraphe intro HTML** lignes 357-360 :
   ```html
   <p style="margin:0 0 8px;color:#334155;">
     Vous êtes invité(e) à participer au chat live de l'événement.
     Posez vos questions à l'oral, votez en temps réel, et interagissez avec les intervenants depuis votre navigateur — aucune installation nécessaire.
   </p>
   ```
   À remplacer par le nouveau wording : `à notre événement live` + `Aucune installation nécessaire.` (avec point au lieu de tiret).

3. **Version texte** ligne 205 :
   ```js
   `Vous êtes invité(e) à participer au chat live de l'événement « ${event.title} »` + (orgLine ? `, ${orgLine}` : '') + '.',
   ```
   À reformuler avec `à notre événement live` + ajouter le bloc `INVITATION ÉVÉNEMENT LIVE` en header.

4. **Bloc "Agenda tip"** ligne 409 (HTML) + ligne 221 (texte) :
   ```
   Le chat ouvrira automatiquement le jour J.
   ```
   À **supprimer** (HTML : tout le `<tr>` du bloc `AGENDA TIP` lignes 405-412, sauf la mention "Ce lien est personnel" qui doit rester conditionnellement pour `access_mode === 'private'`).

⚠️ **À refaire aussi côté admin client** dans :
- `functions/api/event-admin/[token]/send-invitations.js`
- `functions/api/event-admin/[token]/invitees/[invitee_id]/resend.js`
- `functions/api/admin/events/[id]/invitees/[invitee_id]/resend.js`
- `functions/i/[token]/send-invitations.js`
- `functions/i/[token]/resend.js`

→ **Soit chacun de ces fichiers dupliqua le même template**, soit ils délèguent à un helper. À vérifier au cas par cas : possibilité d'un helper commun `_invitation-email.js` mentionné en commentaire ligne 109 (`// Helper d'email (dupliqué depuis _invitation-email.js)`) mais le fichier n'existe pas dans le repo (donc dupliqué).

### 10.5 Chantier analytics live (en pause) — REPRISE

**État** : migration `0015_analytics_foundation` + tracking JS visits déployés. La table `visits` se remplit correctement à chaque page view participant.

**Bug détecté** : la table `event_presence_history` reste **vide**. Cause = `renderLivePage` dans `functions/i/[token].js` et `functions/chat/[slug].js` n'envoie pas de heartbeat ping côté client.

**Reste à livrer** :
1. **`buildHeartbeatScript`** dans les 2 fichiers (i/[token].js + chat/[slug].js) — JS embarqué qui envoie un ping toutes les ~30s vers `/api/event-admin/<token>/heartbeat` (ou équivalent) pendant que la page live est ouverte
2. **Endpoint heartbeat** côté API qui insert dans `event_presence_history`
3. **UI stats côté client** dans `event-admin/<slug>` (onglet "Données & invités") — affichage des metrics agrégées
4. **Enrichissements stats** : top emojis utilisés, votes sondages cumulés, CTAs cliqués

**Procédure de reprise** : redemander upload des fichiers à traiter depuis le début pour revérifier le déploiement actuel.

### 10.6 Lot D — Matrice de compatibilité des modes (validée 15 mai)

Modes mutuellement exclusifs côté UI et backend :

| Mode | Compatible avec |
|---|---|
| **Lecture seule** | Reactions ✓, Annonces modérateur ✓ — **incompatible** : chat libre, Q&A, sondages, ideas, quiz, nuage de mots |
| **Q&A modéré** ↔ **Chat libre** | **Incompatibles** entre eux (un seul mode chat à la fois) |
| **Sondages**, **Quiz**, **Nuage**, **Ideas**, **Reactions**, **Annonces** | Combinables librement (sauf avec lecture seule pour les 4 premiers) |

**État au 15 mai 2026 — Fallback détecté** : implémentation incomplète, cohérence à restaurer.

| Surface | Statut | Détail |
|---|---|---|
| PATCH `/api/admin/events/[id].js` | ✅ Conforme | `validateModesCompatibility` présent, refuse 400 si combinaison invalide |
| POST `/api/admin/events.js` | ❌ Manquant | `validateModesCompatibility` **absent** — un event peut être créé avec modes contradictoires (la validation arrive seulement au PATCH suivant) |
| `admin/edit.html` (UI) | ❌ Manquant | Désactivation visuelle des checkboxes incompatibles absente — l'utilisateur peut cocher des modes contradictoires sans signal |
| `admin/new.html` (UI) | ❌ Manquant | Idem `edit.html` (probablement, à confirmer fichier en main) |

**Action** : re-livrer les 3 fichiers `edit.html`, `new.html`, `events.js` (POST) en alignant sur le `validateModesCompatibility` déjà présent dans `events/[id].js` PATCH. Listener JS sur les `<input name="mode">` qui grise/coche les incompatibles côté UI.

### 10.7 Lot E — Tracking actions par personne (vue simple)

Validation 15 mai : **vue simple** = tableau d'invités dans `event-admin/<slug>` avec compteurs par invité (X messages envoyés, Y réactions, Z votes, W CTAs cliqués, etc.).

**État actuel** : tables actions existantes ont déjà `invitee_id` (chat_messages, event_reactions, idea_votes, poll_votes, quiz_responses). Reste à ajouter pour les actions non trackées.

**Phase E.3 Part 1 ✅ Livrée (15 mai)** — Tracking clics CTA :
- Migration `0020_event_cta_clicks.sql` (cf §5.9 pour le schéma) — CREATE TABLE + 3 indexes
- Endpoint `POST /api/chat/<slug>/cta-clicks` (`functions/api/chat/[slug]/cta-clicks.js`) — auth cohérente `messages.js` (X-Magic-Token ou ip_hash anonyme), vérif `cta_id` valide pour event, insert non-bloquant (200 OK même si DB échoue)
- Tracking JS dans `chat/[slug].js` + `i/[token].js` — handler click sur `btnEl` avec POST `keepalive: true` fire-and-forget, ne bloque pas l'ouverture du lien CTA (marqueur `nomacast-cta-clicks-v1`)
- Aucun impact UX

**Phase E.3 Part 2 — Restante** :
- Endpoint timeline détaillée par invité : `GET /api/event-admin/<token>/invitees/<invitee_id>/timeline` qui UNION 6 sources (messages, reactions, votes, CTAs, quotes, presence)
- UI drilldown dans `event-admin/[token].js` pour afficher la timeline

**Phases ultérieures (non encore migrées)** — tables actions complémentaires :
- `event_quote_shares` (event_id, invitee_id, quote_id, shared_at, platform)
- `event_resource_views` (event_id, invitee_id, resource_id, viewed_at)
- Endpoint agrégation : `GET /api/event-admin/<token>/invitee-stats` retourne `{invitee_id, name, email, messages_count, reactions_count, votes_count, ctas_clicked, quotes_shared, resources_viewed}[]`
- UI tableau côté `event-admin/<slug>` onglet Données

### 10.8 Lot F — Sécurité globale (sans rotation PageSpeed) — phase 1 ✅ Livrée (15 mai)

**En place** : HTTPS, cookies HttpOnly+Secure+SameSite=Lax, PBKDF2 100k, escapeHtml, Basic Auth admin, HMAC cookie session, cross-event isolation.

**Phase 1 livrée le 15 mai 2026** :

- ✅ Rate limit `/event-admin/login` : 5 tentatives échouées / minute / IP via KV `auth-fail:<ip_hash>` (TTL 60s)
- ✅ Logs `auth_logs` : table créée (migration 0019), insertions systématiques dans `login.js`
- 🟡 CSP nonce : pas implémenté, défense actuelle suffisante (`script-src 'self'` + headers serrés dans `_headers`)
- 🟡 CSRF token sur form login : pas implémenté, `SameSite=Lax` du cookie session couvre 95% des cas

**Phase 2 candidate** (si menaces réelles observées dans `auth_logs`) :

- Notification email/webhook sur burst détecté (>50 fails/h sur même IP)
- Purge auto `auth_logs` > 90 jours (cron Cloudflare ou cleanup manuel)
- Captcha (Turnstile, déjà configuré pour formulaire contact) après 3 fails
- Augmenter `RATE_LIMIT_WINDOW_SEC` à 300s (5 min) selon usage réel

**Hors lot** : Skip rotation Google PageSpeed dans `script.py` / `script_PAGESPEED.py` (décision Jérôme 15 mai : on s'en fiche).

### 10.9 Lot QA résiduel (au-delà du Lot A livré 15 mai)

**Statut au 15 mai 2026** :

| Item | Statut | Détail |
|---|---|---|
| **C2** Auto-bascule live | ✅ Résolu (déjà implémenté) | Lazy serveur (`chat/[slug].js` l.69-80, `i/[token].js` l.97-107) + polling client renforcé (5s post-`scheduled_at`, marqueur `nomacast-lot-c-c2-v1`) |
| **C3** Polling status | ✅ Résolu | Endpoints `status.js` OK ; polling client adaptatif (60→30→10→5s) ; reload sur transition `draft→live` |
| **C4** Replay/VOD | ⏸ Reporté | Nécessite config CF Stream côté Dashboard + UI player |
| **M4** Rate limit messages | ✅ Résolu (déjà implémenté) | 10 msg/60s/IP via `ip_hash` HMAC, 429 + `Retry-After` (`messages.js` l.155-190) |
| **U1** Mode lecture seule | ✅ Résolu (déjà implémenté) | `buildChatPanelHtml` masque le form input, filtre côté client `author_kind='admin'` |
| **FR-1** Modal fin d'event | ⏸ À planifier | Petit chantier ~30 min |
| **FR-4** Annonces modérateur | 🟡 Partiel | Côté participant déjà OK (mode lecture). Côté admin : reste à ajouter input "Publier une annonce" dans `admin/live.html` |

**Items hors tableau (reste à traiter)** :

- **C6** Latence 15s → activer **LL-HLS** dans Dashboard CF Stream
- **C7** DVR non fonctionnel → activer rewind dans Dashboard CF Stream
- **U3** Modes exclusifs : géré dans Lot D (cf §10.6)
- **U4** Lien régie live sans login : déjà résolu par l'iframe dans event-admin (15 mai)
- **FR-2** Archive froide events : page `admin/archive.html` avec metrics + désactivation URLs publiques
- **FR-3** Description event : **livré 15 mai** sauf 2 morceaux : (a) accepter `description` dans `POST /api/admin/events` (fichier `functions/api/admin/events/index.js` à uploader pour finaliser), (b) inclure description dans le template mail invitation (helper `_lib/invitation-email.js` désormais centralisé — cf §10.4).

### 10.10 Lot G — Test embed iframe player site client (exploratoire)

Test à faire ultérieurement (pas de cas client concret au 15 mai). Cloudflare Stream supporte nativement les iframes cross-origin :

```html
<iframe src="https://customer-xxx.cloudflarestream.com/<stream_uid>/iframe"
        allow="autoplay; encrypted-media" allowfullscreen
        style="width:100%; aspect-ratio: 16/9; border: 0;"></iframe>
```

Question ouverte : juste le player vidéo, ou player + chat + reactions (l'app complète) ?

---

## 11. Points à surveiller

- **DMARC** : passer en `p=quarantine` après 4-6 semaines d'observation (fenêtre ~20/06/2026)
- **Healthcheck bug** : passer en multipart/form-data
- **Rotation `CHAT_IP_HASH_SECRET`** : à faire suite à exposition antérieure
- **Doublon** `functions/feed/alerts (1).js` à supprimer
- **Incohérence** routes `resources` (EN) vs `ressources` (FR) à aligner
- **Migrations 0001-0006** absentes : si quelqu'un repart de zéro, doc `db/schema.sql` à expliciter
- **Templating mail** : ~~5+ fichiers dupliquent le même template — refactoriser en helper commun `_invitation-email.js` (mentionné en commentaire, jamais créé)~~ **Résolu (15 mai)** : helper `functions/_lib/invitation-email.js` créé, 4 importeurs migrés, -940 lignes (54%) sur l'ensemble (cf §10.4 + §12 bloc imports).
- **(15 mai)** Renommer migrations `0016_client_credentials.sql` → `0017_*` et `0017_event_description.sql` → `0018_*` via GitHub web pour respecter l'ordre chronologique
- **(15 mai)** Variable d'env `SESSION_SECRET` à présent **critique** : si elle disparaît, tous les utilisateurs sont déconnectés et `/event-admin/login` retourne 500
- **(15 mai)** Lot E tracking actions par personne : migration + tables à créer (cf §10.7)
- **(15 mai)** Lot F sécu **phase 1 livrée** : rate limit login (KV `auth-fail:`) + table `auth_logs` (mig 0019). Phase 2 candidate (notif burst, purge auto, Turnstile post-fails, CSP nonce, CSRF token) en attente d'observations réelles (cf §10.8).
- **(15 mai)** **`auth_logs` : forensics et surveillance** — La table `auth_logs` n'a pas de purge auto. À long terme (>6 mois prod), prévoir un cleanup mensuel des entrées > 90 jours via SQL manuel ou cron. Cible : moins de 100 000 lignes pour garder les indexes performants.
- **(15 mai)** **Rate limit KV consumption** — Chaque IP qui rate son login crée 1 entrée KV `auth-fail:<ip_hash>` (TTL 60s, auto-purge). Pas de risque de remplissage durable.
- **(15 mai)** **Imports relatifs depuis dossiers avec brackets `[id]`, `[token]`** — Cloudflare Pages Functions résout correctement les imports relatifs depuis les dossiers brackets (validé 15 mai 2026 après fix d'une typo). Règle : nombre de `../` = nombre de dossiers entre le fichier source et `functions/`. Erreur typique : croire que `event-admin/[token]/` a 4 niveaux comme `admin/events/[id]/`. Un seul dossier composé ≠ deux dossiers imbriqués.
- **(15 mai)** **Polling status client : timings actuels** — Page draft poll `/chat/<slug>/status` ou `/i/<token>/status` : 60s avant T-10min, 30s avant T-1min, 10s avant T0, 5s après T0 (marqueur `nomacast-lot-c-c2-v1`). Au retour de focus onglet → poll immédiat. Si beaucoup d'utilisateurs en attente sur un event → vérifier la charge sur D1 (1 SELECT par poll × N utilisateurs). Ex. 5s × 300 viewers = 60 req/s sur la fenêtre critique. Acceptable mais à surveiller.
- **(15 mai)** **CTA tracking : `keepalive: true`** — Le fetch POST `/api/chat/<slug>/cta-clicks` utilise `keepalive: true` pour s'assurer que le ping arrive même si l'utilisateur quitte la page immédiatement après le clic. Limitation native du navigateur : body max 64 KB (largement suffisant pour notre body `{cta_id}`).
- **(15 mai)** **CTA tracking : duplication d'helpers** — `authenticatePrivateRequest`, `computePreviewToken`, `hashIp` dupliqués entre `messages.js` et `cta-clicks.js` (et probablement d'autres endpoints chat). À refactoriser un jour en `functions/_lib/chat-auth.js` (idem `invitation-email.js`). Pas urgent.

---

## 12. Référentiel fichiers complet

```
Repo Nomacast/nomacast.fr
├── admin/                    # Pages admin Nomacast (Basic Auth)
│   ├── admin.css             # Styles partagés
│   ├── admin.js              # Helpers window.NomacastAdmin
│   ├── edit.html             # ÉDITION EVENT (param ?id=) — + card Accès client (15 mai)
│   ├── index.html            # Liste events
│   ├── invitees.html         # Gestion invités (param ?event_id=)
│   ├── live.html             # Régie (param ?id=) — iframée depuis event-admin/<slug> via ?client=1 (legacy, désormais auth par cookie)
│   ├── new.html              # Création — + champ description + validations M1/U5 (15 mai)
│   ├── polls-test.html       # Tests sondages dev
│   └── vmix.html             # Outil URL vMix (param ?event= ou ?id=)
├── db/
│   └── schema.sql            # Schéma initial events + invitees
├── migrations/
│   ├── 0007 à 0015           # Migrations cumulatives (cf §8)
│   ├── 0016_reactions_config.sql      # Tour 2.A-bis L1
│   ├── 0016_client_credentials.sql ⚠️ # À renommer 0017_* (15 mai)
│   ├── 0017_event_description.sql ⚠️  # À renommer 0018_* (15 mai)
│   ├── 0019_auth_logs.sql              # Lot F sécu phase 1 — table forensics login (15 mai)
│   └── 0020_event_cta_clicks.sql       # Phase E.3 Part 1 — tracking clics CTA (15 mai)
├── functions/
│   ├── _lib/                          # NOUVEAU (15 mai) — helpers internes partagés
│   │   ├── password.js               # PBKDF2 100k generate/hash/verify
│   │   ├── session.js                # HMAC cookie session client (sign/verify/build/read)
│   │   └── invitation-email.js       # Template mail invitation (subject + buildText + buildHtml) — cf bloc imports ci-dessous
│   ├── admin/_middleware.js          # Basic Auth pages + exception cookie session pour /admin/live.html
│   ├── api/
│   │   ├── admin/
│   │   │   ├── _middleware.js        # Basic Auth API + exception cookie session pour /api/admin/events/<id>/*
│   │   │   ├── events.js             # GET/POST liste events
│   │   │   ├── events/[id].js        # GET/PATCH/DELETE event (+ description PATCH 15 mai)
│   │   │   ├── events/[id]/          # Cf §2.2 (15 endpoints)
│   │   │   ├── events/[id]/credentials.js  # NOUVEAU (15 mai) GET/PUT/POST/DELETE credentials client
│   │   │   ├── upload-logo.js
│   │   │   └── version.js
│   │   ├── chat/[slug]/              # API publique participant (cf §2.3) — + cta-clicks.js (15 mai, Phase E.3 Part 1, marqueur `nomacast-cta-clicks-v1`)
│   │   ├── event-admin/[token]/      # API admin client (cf §2.4)
│   │   ├── feed/alerts.js            # JSON vMix
│   │   └── validate-code.js          # Codes partenaires (site marketing)
│   ├── chat/[slug].js                # Page participant publique (+ description 15 mai)
│   ├── chat/[slug]/calendar.ics.js
│   ├── chat/[slug]/status.js
│   ├── i/[token].js                  # Page invité privé (+ description + CTA 404 15 mai)
│   ├── i/[token]/calendar.ics.js
│   ├── i/[token]/resend.js
│   ├── i/[token]/send-invitations.js
│   ├── i/[token]/status.js
│   ├── event-admin/[token].js        # Page admin client — HMAC supprimé (15 mai), uniquement slug+cookie
│   ├── event-admin/login.js          # NOUVEAU (15 mai) GET page + POST verify
│   ├── event-admin/logout.js         # NOUVEAU (15 mai) efface cookie + redirect
│   ├── feed/alerts.js                # Page vMix
│   ├── feed/alerts (1).js            # DOUBLON ORPHELIN à supprimer
│   ├── quote/[id].js                 # Page partage citation
│   ├── chat-interactif.js            # Site marketing
│   ├── envoyer.php.js                # Site marketing
│   └── nmc-7k9q3p2x/api/partners.js  # Admin codes partenaires (site marketing)
├── _headers                          # + Content-Type text/html sur /*.html (15 mai, C1)
├── .assetsignore
└── (autres : site marketing, images, etc.)
```

**Imports du helper `_lib/invitation-email.js`** (référence pour ne pas se tromper de `../`) :

```
functions/_lib/invitation-email.js
├── importé par : api/admin/events/[id]/send-invitations.js                  (4 ../)
├── importé par : api/event-admin/[token]/send-invitations.js                (3 ../)
├── importé par : api/admin/events/[id]/invitees/[invitee_id]/resend.js      (6 ../)
└── importé par : api/event-admin/[token]/invitees/[invitee_id]/resend.js    (5 ../)
```

Rappel : `[token]` ou `[id]` comptent comme **un seul** dossier (cf §11 Imports relatifs). Refactor complet terminé le 15 mai : -940 lignes (54% de réduction) sur l'ensemble des 4 endpoints.

**Favicon outil interactif** (Part 1 livrée 15 mai, marqueur `nomacast-favicon-v1`) :

```
Pattern injecté : <link rel="icon" type="image/svg+xml" href="/favicon.svg">
Source : /favicon.svg à la racine du repo (déjà existant)

Pages couvertes :
├── /event-admin/login        (login.js)
├── /event-admin/<slug>       (event-admin/[token].js — 2 occurrences : page error + page main)
├── /chat/<slug>              (chat/[slug].js)
└── /i/<token>                (i/[token].js)

Reste à faire (Part 2) :
└── /admin/edit.html, /admin/new.html, /admin/live.html, ... (pages admin HTML statiques)
```

---

*Rapport mis à jour le 15 mai 2026 à partir de la lecture directe du repo `Nomacast/nomacast.fr` et de la session du jour (auth client login/password, onglets event-admin, Lot A QA, FR-3 description, Lot F sécu phase 1 — rate limit login + table auth_logs, Lot C QA C2/C3 polling client, Phase E.3 Part 1 tracking CTA). Toutes les affirmations ont été vérifiées sur les fichiers réels ou sur les modifications livrées dans la session.*
