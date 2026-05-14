# Rapport : formulaires, tracking et Google Ads

**Date** : 14 mai 2026
**Périmètre** : Pages Function envoyer, Resend, Turnstile, GA4/GTM, campagnes Google Ads

---

## 1. Pages Function `envoyer.php.js`

Fichier : `functions/envoyer.php.js` (Cloudflare Worker, malgré l'extension `.js` ET le nom `envoyer.php` historique).

### Chaîne de traitement

```
POST /envoyer.php
  ├── Healthcheck bypass ? (header X-Healthcheck-Token == env.HEALTHCHECK_TOKEN)
  │     → si oui : skip Origin/Turnstile/RateLimit, prefix [HEALTHCHECK] au sujet
  ├── Validation Origin (anti-CSRF)
  ├── Validation Turnstile (token)
  ├── Validation honeypot (champ caché doit être vide)
  ├── Validation champs (email valide, etc.)
  ├── Détection langue : formData.get("lang") === "en" ?
  ├── Envoi Resend : from: `Formulaire Nomacast <noreply@nomacast.fr>`
  └── Redirection 302 :
        FR : /merci.html?type={type}
        EN : /en/thank-you.html?type={type}
        Erreur : /merci.html?error=xxx (ou en/thank-you)
```

### Codes d'erreur

| Param URL | Cause |
|---|---|
| `?error=captcha` | Turnstile failed |
| `?error=email` | Format email invalide ou champ vide |
| `?error=send` | Resend rejette (souvent FROM domaine non vérifié) |
| `?error=origin` | Origin invalide (CSRF) |

### Multilingue (LOT 1 / 07-08/05)

| Élément | FR | EN |
|---|---|---|
| Constantes | `PAGE_MERCI_FR`, `PAGE_ERREUR_FR` | `PAGE_MERCI_EN`, `PAGE_ERREUR_EN` |
| Sujet email admin | normal | préfixé `[EN]` |
| Corps email | normal | ajout `Language : English` |
| Template auto-reply | FR | EN |

Routing inchangé : Cloudflare normalise `/envoyer.php` qu'il vienne de FR ou de `/en/`.

---

## 2. Formulaires — état d'audit (08/05/2026)

**Audit synthétique des 31 formulaires du site** :

| Critère | Couverture |
|---|---|
| Toutes pages FR : `<form action="envoyer.php">` sans champ `lang` | 100 % → fallback FR par défaut |
| Toutes pages EN : `<form action="../envoyer.php">` + `<input type="hidden" name="lang" value="en">` | 100 % |
| Turnstile présent | 100 % |
| Honeypot présent | 100 % |
| Champ `source` adapté par page | `LP {theme} (hero)` ou `LP {theme} (bottom)` |
| GA4 `phone_location` adapté | ex. `'phone_location': 'quote-event-filming'` |

---

## 3. Bug critique résolu : conversion fantôme (LOT 2, 08/05)

### Problème détecté

Conversion Google Ads comptée sur `devis-captation-evenement.html` **sans mail Resend reçu**. Cause :
- Le script de `merci.html` / `en/thank-you.html` poussait l'event `form_submit` à **chaque chargement de page**, peu importe la provenance (bookmark, lien partagé, robot ignorant le `noindex`)
- → conversion fantôme

### Fix appliqué

L'event `form_submit` ne se déclenche **que si** `?type=` est présent dans l'URL :
```js
const params = new URLSearchParams(window.location.search);
if (params.get("type")) {
  dataLayer.push({ event: "form_submit", form_type: params.get("type") });
}
```

Le paramètre `?type=` est ajouté par `envoyer.php` **après validation serveur** (Turnstile + honeypot + champs). Une visite directe sans soumission valide ne compte plus.

### Nettoyage simultané

- Switcher de langue visible (FR · EN) retiré des 2 pages destinations one-way (`merci.html`, `en/thank-you.html`)
- 3 balises `<link rel="alternate" hreflang="...">` supprimées (sans effet SEO sur `noindex,nofollow`)
- `<link rel="canonical">` conservé

### Effet attendu sur reporting

- Conversions Ads deviennent **plus précises**
- Ratio conversions Ads ↔ mails Resend reçus ≈ 1:1
- Si baisse brutale du compteur après deploy = part fantôme avant fix

---

## 4. Turnstile (anti-bot)

| Date | Décision | Élément technique |
|---|---|---|
| 10/05 (LOT 11) | **Lazy-load** : Turnstile chargé uniquement au focus form OU IntersectionObserver (rootMargin 300px) | TBT 350 → 100 ms (−71 %). Marqueur `lot11-turnstile-lazy` |
| 11/05 | **Secret Key rotée** | Ancienne clé exposée en commit historique (`envoyer.php` PHP). Nouvelle clé en env var `TURNSTILE_SECRET_KEY` Cloudflare Pages |
| 11/05 | **Ancien `envoyer.php` PHP supprimé** | Obsolète depuis migration Cloudflare Pages Functions |

**Pending** : remplacer placeholder Turnstile site key `0x4AAAAAAAxxxxxxx` par la vraie clé (mention du backlog chat-interactif, à vérifier côté forms standards).

---

## 5. Healthcheck quotidien (11/05)

Détaillé dans `RAPPORT-INFRASTRUCTURE.md`. Résumé :

| Élément | Valeur |
|---|---|
| Workflow | `.github/workflows/health-check.yml` |
| Cron | `0 8 * * *` UTC (10h Paris été) |
| Endpoint | `POST https://nomacast.fr/envoyer.php` |
| Header | `X-Healthcheck-Token` |
| Bypass | Origin/Turnstile/RateLimit |
| Notification d'échec | GitHub envoie un mail auto à l'owner |
| Filtrage Gmail | Sujet préfixé `[HEALTHCHECK]` |
| **Bug en cours** | `request.formData()` Workers ne lit pas `--data-urlencode`. À investiguer : passer en multipart/form-data |

---

## 6. GA4 + GTM

| Élément | Valeur |
|---|---|
| GTM container | `GTM-M99NLF45` |
| Events poussés | `form_submit` (avec `form_type` et `phone_location`) |
| Garde-fou | Déclenchement uniquement si `?type=` présent dans l'URL (LOT 2) |
| Page activation GTM `merci.html` | Pending dans le backlog initial |

---

## 7. Google Ads — campagnes

### Campagne FR — "Nomacast | Conversions FR"

| Paramètre | Valeur |
|---|---|
| Type | Search, "Maximiser les clics" |
| CPC max | 2,00 € |
| Budget peak | 6,50 €/jour (~195 €/mois) |
| Géo | France + IDF +30 % + 3 pays francophones premium (Belgique, Suisse, Luxembourg, tous à 0 %) |
| Display + partenaires | **désactivés** |

### Campagne EN — "Nomacast | Conversions EN" (créée 09/05)

| Paramètre | Valeur |
|---|---|
| Type | Search, "Maximiser les clics" |
| CPC max | 2,50 € (marché plus compétitif) |
| Budget | 8 €/jour (~240 €/mois) — refus de la reco Google à 13,76 € |
| Géo (Présence ou intérêt) | France entière + 18 villes : Londres, Dublin, Berlin, Munich, Frankfurt, Amsterdam, Bruxelles, Zurich, Genève, Madrid, Barcelone, Milan, Rome, NY, SF, LA, Toronto, Montréal |
| Diffusion | Lun-Ven 100 %, Sam-Dim −30 % |

### Mots-clés EN (14)

- **10 exact géo-ciblés Paris** : `[live streaming paris]`, `[event live streaming paris]`, `[corporate live streaming]`, `[event filming paris]`, `[video production paris]`, `[conference filming paris]`, `[corporate video paris]`, `[event videographer paris]`, `[webcast paris]`, `[live event production paris]`
- **4 phrase plus larges** : `"live streaming events"`, `"corporate event filming"`, `"professional live streaming"`, `"event production paris"`
- **Aucun en requête large**

### Annonces (2 RSA par campagne)

- Annonce 1 : axe produit/prix (chemin `streaming/paris`)
- Annonce 2 : axe confiance/références (chemin `streaming/events`)
- 15 titres × 4 descriptions par annonce
- **Aucun titre épinglé**

### Sitelinks EN (7) — URLs vérifiées contre fichiers réels

| Texte | URL |
|---|---|
| Event Filming | `/en/quote-event-filming.html` |
| Conference Filming | `/en/quote-conference-seminar-filming.html` |
| Event Live Streaming | `/en/quote-event-live-streaming.html` |
| Corporate Live Show | `/en/quote-corporate-live-show.html` |
| Roundtable Filming | `/en/quote-interview-roundtable-filming.html` |
| Pricing Estimate | `/en/pricing.html` |
| Get a Quote | `/en/quote-live-streaming-paris.html` |

### Audiences en mode Observation (niveau campagne EN)

Très grande entreprise (10000+), Voyageurs d'affaires, Services pub & marketing (in-market), Services évènementiels (in-market), Planification d'événements pro (in-market), Emplois de cadres, Industrie technologique.

### UTM template

```
{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}
&utm_content={creative}&utm_term={keyword}&gclid={gclid}
```

---

## 8. Filet de sécurité Google Ads (09/05)

**Règle automatique** : pause campagne si 275 € dépensés sans conversion sur 30 jours roulants. Étendue à toutes les campagnes.

| Effet calibré | FR | EN |
|---|---|---|
| Budget mensuel | 195 € | 240 € |
| Protection | 1,41× budget (~6 sem) | 1,15× budget (~5 sem) |

Google évalue chaque campagne **indépendamment** : FR seule dépasse → FR pause. Pas d'interaction croisée.

---

## 9. Calendrier saisonnier (validé 09/05)

| Période | FR €/j | EN €/j | Total/j |
|---|---|---|---|
| Mai-Juin (peak printemps) | 6,50 € | 8 € | 14,50 € |
| **Juillet-Août (off)** | **0 €** | **0 €** | **0 €** |
| Sept-Oct (rentrée + peak) | 6,50-8 € | 8-10 € | 14,50-18 € |
| Nov-Déc | 6,50 € | 8 € | 14,50 € |
| Janv-Fév (creux) | 4 € | 4 € | 8 € |
| Mars-Avril (peak) | 6,50-8 € | 8 € | 14,50-16 € |

**Dates clés** :
- 30 juin (soir) : pause des 2 campagnes
- 25 août : réactivation EN
- 28 août (vendredi) : réactivation FR (3-4 jours warm-up Google avant pic du 1er sept)

**Économie annuelle vs budget plat** : ~25 % (~3 800-4 200 € vs 5 200 €).

---

## 10. Pilotage selon perfs mai-juin

| Conversions mai-juin | Action sept-oct |
|---|---|
| 0 | 14,50 €/jour stable, réévaluer fin sept |
| 1-3 | Garder + ajouter Enhanced Conversions et call tracking |
| 4+ | 18 €/jour + bascule FR vers "Maximiser conversions" (ou Target CPA si ≥30 conversions cumulées) |

**À surveiller en hebdo** : clics/CTR par campagne et mot-clé, conversions, Search Terms Report (négatifs), perfs RSA produit vs confiance, perfs audiences en Observation.

---

## 11. Valeur des conversions

| Conversion | Valeur | Note |
|---|---|---|
| Form Submit | 500 € (vs 200 € précédent) | Proxy lead-to-deal raisonnable sur panier moyen 2 000 € |
| Click Phone | Secondaire | Smart Bidding optimise quasi-uniquement sur form submits |

**Enhanced Conversions** : actives ✓

---

## 12. Décisions techniques actées

- **100 % manuel**, aucune utilisation de l'IA generator Google (risque de pollution mots-clés en requête large + titres génériques)
- **URLs sitelinks vérifiées avant saisie** contre la liste réelle des fichiers — ne plus déduire d'URL par pattern
- **`/pricing` plutôt que `/quote-4k-filming`** dans sitelinks EN : "4K" trop technique, "Pricing" universellement cherché en B2B
- **`/tarifs.html` et `/pricing.html` promus comme cibles de sitelink** : vraies pages de conversion via formulaire intégré
- **Une seule règle multi-campagne** : Google évalue par campagne indépendamment, pas de duplication nécessaire
- **Audiences EN au niveau campagne** : sans impact diffusion tant qu'il n'y a qu'un seul groupe d'annonces (Captation)

---

## 13. Pending

- [ ] Recréation propre de la conversion "Clic Mail" + objectif "Contact"
- [ ] Vérifier label `n81SCKCN46EcENCEva9D` côté Click Phone sur 30 jours
- [ ] Test formulaire post-deploy (mail-tester.com pour score complet)
- [ ] Search Console : check impressions "vidéaste événementiel", "videographer paris", "webcast" sur 4-6 semaines
- [ ] Google Ads : Quality Score `[event videographer paris]` (attendu +1 à +2) et CPC moyen mots exacts (attendu −10 à −20 %)
- [ ] Fix bug healthcheck (`?error=email`)

---

*État de référence pour les formulaires et le marketing Nomacast au 14 mai 2026.*
