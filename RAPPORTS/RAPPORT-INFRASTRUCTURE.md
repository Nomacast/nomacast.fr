# Rapport : infrastructure Nomacast

**Date** : 14 mai 2026
**Périmètre** : hosting, DNS, email, secrets et variables d'environnement
**Complémente** : `RAPPORT-PIPELINE.md` (mécanique de déploiement)

---

## 1. Vue d'ensemble

| Brique | Service | Notes |
|---|---|---|
| Hosting | **Cloudflare Pages** (project `nomacast-fr`) | Site statique, pas de framework |
| CDN / WAF | Cloudflare | Zone `nomacast.fr` |
| DNS | Cloudflare (zone propre) | LWS = registrar uniquement |
| Email envoi | **Resend** | Domaine racine `nomacast.fr` |
| Email réception | Google Workspace | Sélecteur DKIM `google` |
| Source code | GitHub `Nomacast/nomacast.fr` (public depuis 11/05/2026) | Source de vérité |
| Sync édition | Google Drive → GitHub (Apps Script v3) | Voir RAPPORT-PIPELINE |

---

## 2. Hosting Cloudflare Pages

| Date | Décision | Élément technique |
|---|---|---|
| — | Project Cloudflare = `nomacast-fr` (avec tiret) | Confondre avec `nomacast` → `Project not found [code: 8000007]` |
| — | Site 100 % statique, pas de build runner | Pas de `npm build`, Direct Upload via wrangler v4 |
| — | Build natif Cloudflare désactivé | Settings > Builds > Branch control off, production ET preview. Évite double-deploy avec GitHub Actions |
| — | Pas de `.htaccess` (Apache obsolète) | 404 géré via `404.html` à la racine + routage natif Pages |
| — | Fichier `_headers` pilote Content-Type | Déclare `text/plain` pour `/robots.txt`, `application/xml` pour `/sitemap.xml`, `text/plain` pour `/llms.txt`. Évite warning Lighthouse "robots.txt invalid" |
| 10/05 | CSP élargie pour bi-domaine | `img-src 'self' https://www.nomacast.fr https://nomacast.fr data: blob:` (LOT 17) |
| 10/05 | Pages Function `functions/` détectée nativement par Cloudflare Pages | Pas besoin d'exclure ce dossier dans `.assetsignore` |

---

## 3. DNS Cloudflare (zone `nomacast.fr`)

| Date | Décision | Élément technique |
|---|---|---|
| 09/05 | LWS = registrar uniquement, plus aucune dépendance infra | Verrou de transfert maintenu. Hébergement mutualisé LWS résiliable |
| 09/05 | DKIM LWS `dkim._domainkey` supprimé | Orphelin depuis arrêt envois LWS. Clé 1024 bits, sélecteur générique `dkim` à ne plus réutiliser |
| 09/05 | **SPF racine simplifié** | `v=spf1 include:_spf.google.com ~all`. Resend hors car return-path sur `send.nomacast.fr` (SPF propre `include:amazonses.com`) |
| 09/05 | 2 sélecteurs DKIM actifs | `google._domainkey` (Google Workspace) + `resend._domainkey` (Resend). Pour tout futur service : nouveau sélecteur dédié |
| 09/05 | DMARC en mode observation | `v=DMARC1; p=none; rua=mailto:dmarc@nomacast.fr; ruf=mailto:dmarc@nomacast.fr; fo=1; adkim=r; aspf=r; pct=100` |
| 09/05 | Alias `dmarc@nomacast.fr` créé | Compte principal Google Workspace. Filtre Gmail recommandé : Vers → Archive + label DMARC |
| 09/05 | Observation DMARC 4-6 semaines minimum avant `quarantine` | Sinon mails légitimes non alignés vont en spam |

### Sous-domaine `send.nomacast.fr`

Hébergement des records Resend historiques :
- MX `send` → Resend EU
- TXT `send` → SPF `include:amazonses.com`
- `resend._domainkey.send` → DKIM Resend

**Important** : malgré la présence de ces records, le FROM email utilise le **domaine racine** (voir §4). Les records sous-domaine servent au return-path et à l'historique DKIM.

---

## 4. Email envoi — Resend

| Date | Décision | Élément technique |
|---|---|---|
| — | FROM email = `noreply@nomacast.fr` (domaine racine) | Domaine validé dans Resend. **Toute tentative de passage à `noreply@send.nomacast.fr` casse Resend avec `?error=send`** (testé 11/05/2026) |
| — | Code dans `functions/envoyer.php.js` | `` from: `Formulaire Nomacast <noreply@${DOMAINE}>` `` avec `DOMAINE='nomacast.fr'` |
| — | Pages Function (pas du PHP, malgré le nom de fichier) | Hérité de l'ancien `envoyer.php` LWS, nom conservé pour ne pas casser les `<form action="envoyer.php">` existants |
| 11/05 | **Ancien `envoyer.php` PHP supprimé du repo** | Plus utilisé depuis migration Cloudflare Pages |
| 11/05 | Resend API key stockée en env var | `RESEND_API_KEY` dans Cloudflare Pages, jamais dans le code source |

⚠️ **Piège** : le CHANGELOG mentionne à plusieurs endroits historiques `noreply@send.nomacast.fr` (notes d'intention jamais appliquées). **Ne pas suivre ces mentions**. Le LOT 39 (11/05/2026) tranche définitivement.

---

## 5. Secrets et variables d'environnement

### 5.1. Secrets GitHub repo `Nomacast/nomacast.fr`

| Secret | Source | Usage |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens | wrangler deploy + purge cache. Permissions : Pages:Edit + Zone:Cache Purge |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → Overview sidebar | Identifie le compte |
| `CLOUDFLARE_ZONE_ID` | Cloudflare → zone nomacast.fr → Overview | Pour purge cache zone |
| `HEALTHCHECK_TOKEN` | Généré par Jérôme | Bypass Turnstile/RateLimit du workflow daily |

### 5.2. Variables d'environnement Cloudflare Pages

| Variable | Type | Usage |
|---|---|---|
| `RESEND_API_KEY` | Encrypted | Authentification Resend |
| `TURNSTILE_SECRET_KEY` | Encrypted | Validation challenge Turnstile (rotée 11/05/2026) |
| `HEALTHCHECK_TOKEN` | Encrypted | Comparé au header `X-Healthcheck-Token` reçu |
| ~~`PARTNER_CODES_JSON`~~ | ~~Plaintext~~ | **Plus utilisée depuis migration KV** (suppression possible) |

### 5.3. KV namespace

| Namespace | ID | Binding | Usage |
|---|---|---|---|
| `nomacast_partners` | `8a26bab4f86e41b2a9e490981b9b9aa1` | `PARTNERS` | Codes partenaires configurateur (cf RAPPORT-CONFIGURATEUR) |

### 5.4. Script Properties Apps Script

| Property | Usage |
|---|---|
| `GITHUB_TOKEN` | PAT GitHub scope `repo`, jamais en dur dans le code |
| `FILE_STATES` | State per-file auto-géré par le script |

### 5.5. Secrets non rotés assumés

| Secret | État | Décision |
|---|---|---|
| Google PageSpeed API key | Exposée dans `script.py` et `script_PAGESPEED.py` (repo public) | Décision assumée de ne pas rotater (risque maîtrisé) |
| Tokens partenaires opaques | Visibles dans URL `?p=xxxxxx` | Acceptable : 36 milliards de combinaisons, 6 chars sans caractères ambigus |

---

## 6. Healthcheck quotidien

| Date | Décision | Élément technique |
|---|---|---|
| 11/05 | Workflow GitHub Action `.github/workflows/health-check.yml` | Cron `0 8 * * *` UTC (10h Paris été), `workflow_dispatch` pour run manuel |
| 11/05 | Endpoint : `POST https://nomacast.fr/envoyer.php` avec header `X-Healthcheck-Token` | Vérifie redirection 302 vers `/merci.html` |
| 11/05 | `functions/envoyer.php.js` patché pour bypass | Origin / Turnstile / RateLimit bypassés si token valide. Sujet email préfixé `[HEALTHCHECK]` pour filtrage Gmail |
| 11/05 | **Bug en cours** | Premier run manuel renvoie `?error=email` : `request.formData()` Workers ne lit pas correctement les champs `--data-urlencode`. À investiguer : passer en multipart/form-data |

---

## 7. Référentiel de fichiers / dossiers

| Chemin | Rôle |
|---|---|
| `functions/envoyer.php.js` | Pages Function : envoi email + redirection |
| `functions/nmc-7k9q3p2x/api/partners.js` | API CRUD codes partenaires (admin) |
| `_headers` | Headers HTTP + CSP |
| `404.html` | Page d'erreur (routage natif Pages) |
| `.assetsignore` | Exclusions Direct Upload (cf RAPPORT-PIPELINE) |
| `.github/workflows/deploy.yml` | Pipeline déploiement |
| `.github/workflows/health-check.yml` | Healthcheck quotidien |
| `nmc-7k9q3p2x.html` | Back-office admin (slug obfusqué, `noindex,nofollow,noarchive,nosnippet`) |

---

## 8. Points à surveiller

- **DMARC** : passer en `p=quarantine` après 4-6 semaines d'observation (à partir du 09/05/2026, donc fenêtre ~20/06)
- **Bug healthcheck** : à corriger pour avoir un vrai monitoring
- **Rotation `RESEND_API_KEY`** : pas de date d'expiration définie, à reprévoir périodiquement
- **`PARTNER_CODES_JSON`** : supprimable du dashboard Cloudflare maintenant que KV est validé

---

*État de référence pour l'infrastructure Nomacast au 14 mai 2026.*
