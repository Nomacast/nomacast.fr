# Documentation Nomacast — Index

**Date** : 14 mai 2026
**Projet** : site `nomacast.fr` — live streaming corporate B2B
**Statut** : production stable

---

## Comment lire cette documentation

Chaque rapport couvre **un domaine fonctionnel**. Tous sont indépendants et se lisent dans n'importe quel ordre. Le chat interactif (en cours de développement) est volontairement exclu.

Format de chaque rapport : **date** (quand disponible) + **décision** + **éléments techniques nécessaires à la compréhension**.

---

## Liste des rapports

| # | Fichier | Périmètre |
|---|---|---|
| 0 | `RAPPORT-PIPELINE.md` | **Mécanique de déploiement** (GitHub Actions, wrangler, Direct Upload, Apps Script v3, purge cache) — déjà en place |
| 1 | `RAPPORT-INFRASTRUCTURE.md` | **Hosting, DNS, email** (Cloudflare Pages, zone DNS, Resend, DKIM/SPF/DMARC, secrets, env vars, healthcheck) |
| 2 | `RAPPORT-FRONT-PERFORMANCE.md` | **Architecture front** (vidéo hero, images WebP, CSP, lazy loading, optimisations LCP/TBT) |
| 3 | `RAPPORT-BILINGUE-SEO.md` | **FR/EN + SEO** (structure URL, hreflang, glossaire, sitemap, mots-clés, conversion fantôme) |
| 4 | `RAPPORT-FORMULAIRES-TRACKING-ADS.md` | **Formulaires + tracking + marketing** (Pages Function envoyer, Turnstile, GA4/GTM, Google Ads FR/EN) |
| 5 | `RAPPORT-CONFIGURATEUR.md` | **`tarifs.html` / `pricing.html`** (simulateur, codes partenaires KV, back-office admin, add-ons) |
| 6 | `RAPPORT-CONVENTIONS-WORKFLOW.md` | **Design system + éditorial + workflow** (couleurs, polices, terminologie, structure pages, règles de modif) |

---

## Vue d'ensemble en une page

### Stack
- **Hosting** : Cloudflare Pages (project `nomacast-fr`)
- **Source** : GitHub `Nomacast/nomacast.fr` (public)
- **Sync édition** : Google Drive → Apps Script v3 → GitHub
- **Deploy** : GitHub Actions → wrangler v4 → Direct Upload → purge cache
- **Email** : Resend (`noreply@nomacast.fr`)
- **Tracking** : GTM `GTM-M99NLF45` → GA4
- **Ads** : 2 campagnes Google Ads (FR + EN), filet de sécurité 275 € sans conv/30j

### Architecture du site
- HTML/CSS/JS vanilla, pas de framework, pas de build
- Bilingue FR/EN (sous-répertoire `/en/`)
- 54 URLs au sitemap (27 FR + 27 EN) + 2 FAQ depuis 11/05
- Vidéo hero lazy-loadée (interaction OU `load+1s`)
- Images en WebP, fallback JPG/PNG conservés
- Configurateur tarifs avec codes partenaires en KV + back-office admin

### État production (14/05/2026)
- Score Lighthouse mobile home : **84** (LCP 4.6s, TBT 60ms)
- Toutes les Pages Functions opérationnelles
- Pipeline déploiement stable (~30-45 s par deploy)
- Repo GitHub public, secrets externalisés

---

## Pending récapitulatifs

### Bloquant
- [ ] **SIRET** dans `mentions-legales.html` + `en/legal-notice.html` (toujours commenté)
- [ ] **Bug healthcheck** : `request.formData()` Workers ne lit pas `--data-urlencode` → passer en multipart/form-data

### Important
- [ ] Soumettre `sitemap.xml` à Google Search Console (après LOT 25/36)
- [ ] DMARC : passer en `p=quarantine` après 4-6 semaines d'observation (fenêtre ~20/06/2026)
- [ ] Test formulaire post-deploy (`mail-tester.com`)

### À faire à terme
- [ ] LinkedIn Post Inspector + Facebook Debug : refresh og:image après LOT 21
- [ ] Nettoyer vidéos R2 orphelines
- [ ] Supprimer les originaux `.jpg/.jpeg/.png` une fois `.webp` stabilisés
- [ ] Suppression de l'env var `PARTNER_CODES_JSON` (obsolète, remplacée par KV)
- [ ] Recréation conversion "Clic Mail" + objectif "Contact" dans Google Ads
- [ ] Dans 3 semaines (~04/06/2026) : check Field Data CrUX dans Search Console

---

## Contradictions historiques tranchées

Le CHANGELOG comporte plusieurs entrées contradictoires (notes d'intention jamais appliquées, états antérieurs invalidés par des sessions ultérieures). Voici les arbitrages retenus dans cette documentation :

| Sujet | Mention historique contradictoire | Vérité actée |
|---|---|---|
| Email FROM | `noreply@send.nomacast.fr` (plusieurs entrées CHANGELOG anciennes) | **`noreply@nomacast.fr`** (LOT 39 du 11/05/2026, testé et confirmé) |
| Architecture vidéo hero | "2 R2 versions statiques + DO NOT revert to JS-injected" (mémoire ancienne) | **Vidéo créée en JS au runtime, lazy-load sur interaction** (LOT 14 du 10/05/2026, état final) |
| og:image cas-clients | "Generic og-image.webp (specific = future improvement, deferred)" (mémoire ancienne) | **Spécifique par cas-client** (LOT 21 du 10/05/2026) |
| `PARTNER_CODES_JSON` | Variable d'env active | **Plus utilisée depuis migration KV** (07/05/2026), suppressible du dashboard |
| `envoyer.php` (PHP) | Fichier PHP LWS encore présent | **Supprimé** 11/05/2026, remplacé par `functions/envoyer.php.js` |
| Hosting | LWS | **Cloudflare** (LWS = registrar uniquement depuis 09/05/2026) |

En cas de doute futur, **ces rapports priment** sur les mentions historiques du CHANGELOG ou de toute mémoire antérieure.

---

*Documentation Nomacast — référence au 14 mai 2026.*
