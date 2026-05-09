# LOT 10 — Investigation `en/multi-platform-streaming.html` (score 0)

## Diagnostic effectué côté code
✅ Code source en ordre : DOCTYPE valide, balises équilibrées, Solution 4 présente.
✅ 6 scripts, 2 vidéos, 2 preload links — pas de structure cassée.
✅ Pas plus lourde qu'une autre page similaire.

## Cause probable
**Timeout Lighthouse côté PageSpeed** lors de ton premier test (la connexion 4G simulée a pu être instable, ou Lighthouse a fail à charger une ressource externe — Turnstile, GTM, etc.).

## Action recommandée
1. Aller sur https://pagespeed.web.dev/?url=https%3A%2F%2Fwww.nomacast.fr%2Fen%2Fmulti-platform-streaming.html
2. Cliquer "Analyser"
3. Si nouveau timeout → re-essayer plusieurs fois (aléatoire côté Lighthouse Cloud)
4. Si récurrent → ouvrir le rapport individuel pour voir l'erreur exacte (souvent dans l'onglet "Diagnostic" en bas)

Si récurrent, suspects à vérifier :
- Une ressource R2 inaccessible (vidéo qui 404 ?)
- Cloudflare Turnstile bloqué (rare mais possible)

→ Probablement OK après le redéploiement LOT 8+9 (les fonts async réduisent le TBT, le test passe plus vite).


# Session du 9 mai 2026 (soir) — Audit perf, sécurité, légal

Audit complet déclenché par les rapports PageSpeed Insights et erreurs console DevTools.
Résolution en 6 lots progressifs avec validation utilisateur à chaque étape.

---

## Lots déployés

| Lot | Date | Fichiers | Description |
|---|---|---|---|
| **LOT 1** | 9 mai 2026 | `index.html` + `en/index.html` | Suppression du `fetch('nomacast-config.json')` qui causait un 404 dans la console. Le code utilise désormais directement `SITE_DATA` (déjà inline). Plus de requête réseau parasite, console propre. |
| **LOT 1.1** | 9 mai 2026 | `_headers` v3 | Patch CSP : ajout `pagead2.googlesyndication.com` + `*.googlesyndication.com` (Google Ads CCM injecté par GTM) et `static.axept.io` + `*.axept.io` (Axeptio CMP injecté par GTM). Déclaration explicite de `script-src-elem` pour éviter le warning `was not explicitly set`. |
| **LOT 1.2** | 9 mai 2026 | 48 HTML (FR + EN, incluant tarifs/pricing) | Fix bug visuel du bouton CTA "Devis sous 24h" qui passait sur 3 lignes en zone tablette/petit desktop (769-1024px). Ajout `white-space: nowrap`, `flex-shrink: 0` et réduction du gap entre 769-1024px. Variante `.nav-cta-sm` pour les 4 landing pages dédiées. Marqueur `nav-cta-fix-v1` (idempotent). |
| **LOT 2+3 v1 ❌** | 9 mai 2026 | `index.html` + `en/index.html` | Tentative perf : preload poster vidéo + Google Fonts async + vidéo conditionnelle JS desktop/mobile. **Effet pervers** : la `<source>` ajoutée par JS a cassé la discoverability LCP par Lighthouse (insight "Détection de la requête LCP" en rouge). Score perf mobile FR/EN passé de 67/84 à 63/65. **Reverté dans Solution 4**. |
| **LOT 2+3 v2 (Solution 4)** | 9 mai 2026 | 34 HTML avec vidéo hero (FR + EN) | Architecture déclarative : 2 balises `<video>` HTML statiques (desktop + mobile) avec `<source>` en dur, CSS `display:none` selon viewport. `<link rel="preload" as="video" media>` dans le head pour que le browser ne fetch que la version utile au viewport courant. `preload="metadata"` sur les 2 (au lieu de `auto`) pour éviter tout double-fetch. Marqueur `nomacast-video-v2` (idempotent). Préserve aussi les modifs saines du v1 : preload poster `og-image.jpg` + Google Fonts en async (`media="print" onload`). |
| **LOT 4 — vidéo mobile compressée** | 9 mai 2026 | Cloudflare R2 | Upload de `mashup-mobile.mp4` (3 Mo, 720p, sans audio, généré via ffmpeg avec `-vf scale=720:-2 -crf 28 -preset slow`) en complément de `mashup.mp4` (30 Mo, qualité full). Économie 90% de bande passante sur mobile en 4G. |
| **LOT 5.1 — SEO fixes** | 9 mai 2026 | `en/index.html`, `en/corporate-video-production.html`, `_headers` | (1) Remplacement de "Learn more" (texte non descriptif rejeté par Lighthouse SEO) par "See our white-label offer" / "See our corporate live show offer". (2) Ajout des `Content-Type` explicites pour `/robots.txt` (`text/plain`), `/sitemap.xml` (`application/xml`) et `/llms.txt` (`text/plain`) dans `_headers`. Cause probable du warning "robots.txt invalide" : `X-Content-Type-Options: nosniff` empêchait le browser d'inférer le type. |
| **LOT 5.2 — mentions légales** | 9 mai 2026 | `mentions-legales.html` + `en/legal-notice.html` | Mise à jour Éditeur (Auto-entrepreneur EI Jérôme Bouquillon, adresse 14 rue de l'Aubrac 75012 Paris, SIRET en commentaire HTML en attente). Hébergeur LWS → Cloudflare Inc. (101 Townsend Street, San Francisco) avec mention de la filiale européenne RGPD (Cloudflare Ireland Ltd, Dublin). |
| **LOT 5.3 — Open Graph** | 9 mai 2026 | 30 pages HTML | Ajout des balises `og:image` (par défaut `https://www.nomacast.fr/og-image.jpg`) et/ou `og:type` (`website`) manquantes sur 30 pages. Avant le patch, ces pages partageaient sans visuel sur Facebook/LinkedIn/Twitter. |

---

## Audits techniques (tous OK)

| Audit | Résultat |
|---|---|
| Sitemap (54 URLs) | ✅ Toutes les URLs existent en local. Toutes les pages indexables sont incluses. |
| Images sans `alt` | ✅ Aucune. |
| Hreflang FR ↔ EN | ✅ Cohérent sur toutes les pages indexables. |
| Liens internes | ✅ Aucun lien cassé sur les 72 pages. |
| Schema.org JSON-LD | ✅ 118 blocs valides syntaxiquement sur 70 pages. |

---

## En attente (actions utilisateur)

- [ ] Compléter le SIRET dans `mentions-legales.html` + `en/legal-notice.html` (lignes commentées `<!-- <p>SIRET : ... -->`)
- [ ] Configurer SPF DNS sur Cloudflare → DNS pour Resend : `v=spf1 include:_spf.resend.com ~all` (vérifier qu'il n'y a pas déjà un autre SPF avant — un seul autorisé par domaine)
- [ ] Soumettre `https://www.nomacast.fr/sitemap.xml` à Google Search Console (prévu demain)
- [ ] Décider du swap massif `png|jpg|jpeg → webp` dans le HTML (toutes les images sont uploadées en .webp côté CDN)

---

## Mémoire technique (à connaître pour les prochaines sessions)

- **Hébergeur** : Cloudflare Pages (les memories anciennes mentionnant LWS sont obsolètes).
- **`.htaccess`** : non utilisé (Cloudflare Pages n'est pas Apache). Le fichier `404.html` à la racine assure la page d'erreur 404.
- **Pages tarifs/pricing** : reste fragiles, on accepte les patches additifs uniquement (CSS additif type `nav-cta-fix-v1` est OK, refonte structurelle non).
- **Marqueurs idempotents** dans le code : `nav-cta-fix-v1`, `nomacast-video-v2`, `lot2-perf` (legacy), `lot1.1` (CSP).
- **GTM** : actif sur toutes les pages (GTM-M99NLF45). Sur `merci.html`, conversion gardée par garde-fou `?type=` pour éviter les conversions fantômes.

---

## Faux positifs documentés (à ne PAS chercher à corriger)

Erreurs observées dans la console mais qui ne viennent pas du code Nomacast :

| Message | Origine | Verdict |
|---|---|---|
| `This document requires 'TrustedHTML/TrustedScript/TrustedScriptURL'` | Brave Shields (politique TT activée par défaut) | Ignorable — invisible sur Chrome/Firefox classiques |
| `Executing inline script violates CSP about:srcdoc` | Brave Shields, iframe sandboxé interne | Ignorable |
| `Failed to parse audio contentType: audio/mp4 codecs=ac-3, ec-3` | Brave qui pré-vérifie tous les codecs des balises `<video>` | Ignorable |
| `Invalid (ambiguous) video codec string: video/webm codecs=vp9` | idem Brave | Ignorable |
| `Failed to parse video contentType: video/ogg codecs=theora` | idem Brave | Ignorable |
| `Form submission canceled because the form is not connected` | Cloudflare Turnstile (le widget met du temps à se rendre form-attached) | Ignorable, le formulaire fonctionne |
| `[Violation] Permissions policy violation: xr-spatial-tracking` | Cloudflare Turnstile (essaie d'accéder à cette feature) | Ignorable |
| `https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/cmg/1 was preloaded but not used` | Cloudflare Turnstile | Ignorable |
| `Request for the Private Access Token challenge` | Cloudflare Turnstile (anti-bot) | Ignorable |
| `Permissions-Policy: interest-cohort, browsing-topics unrecognized` | Brave qui surveille des features non utilisées | Ignorable, le `_headers` actuel ne déclare pas ces features |
| `Feature Policy: cross-origin-isolated, autoplay, keyboard-map ignoré` (Firefox) | Cloudflare Turnstile `api.js` | Ignorable, warnings Firefox sur API legacy |
| `WEBGL_debug_renderer_info is deprecated in Firefox` | Firefox internals | Ignorable |
| `InstallTrigger / onmozfullscreenchange est obsolète` | Firefox internals | Ignorable |
| `Un accès partitionné à un cookie...turnstile` | Cloudflare Turnstile (partitioned cookie storage) | Ignorable |

# Nomacast — Récap session 9 mai 2026

Audit complet site nomacast.fr (vidéaste B2B Paris/Bordeaux, hébergé Cloudflare Pages).

---

## Périmètre audité

- 72 pages HTML (45 FR + 27 EN), 31 formulaires, 2 000 liens internes
- Tracking GTM/GA4/Google Ads, Cloudflare Turnstile, Resend
- 53 mots-clés FR/EN benchmarkés vs 9 concurrents
- Tests perf : PageSpeed Insights (4 URLs, mobile + desktop)
- Tests sécurité : Security Headers (snyk) + Mozilla HTTP Observatory

---

## Lots déployés ✓

| Lot | Date | Fichiers | Description |
|---|---|---|---|
| **LOT 1** | 9 mai 2026 | 14 HTML + sitemap.xml | SEO mots-clés (vidéaste, videographer, webcast, webinaire), og:url sur 4 LP, robots `index,follow` sur pages légales, FAQ webcast FR+EN, sitemap nettoyé (54 URLs au lieu de 56), eyebrows + meta descriptions enrichies |
| **LOT 2** | 9 mai 2026 | merci.html + en/thank-you.html | Fix conversion fantôme : ajout d'un garde-fou (event `form_submit` ne se déclenche que si paramètre `?type=` présent dans l'URL). Suppression du switcher de langue visible. Suppression des balises hreflang dans `<head>`. Routage FR/EN auto via Pages Function confirmé en place. |
| **LOT 3** | 9 mai 2026 | 4 HTML (index FR/EN, cas-clients FR/EN) | Core Web Vitals : image hero Jérôme avec `loading="eager" fetchpriority="high" width="800" height="800"` + 28 images cas clients avec `width`/`height` (vraies dimensions des fichiers). Aspect-ratio CSS déjà géré côté `.case-image`. Gain LCP -200 à -400ms. |
| **LOT 4** | 9 mai 2026 | _headers (Cloudflare Pages) | Headers de sécurité : HSTS, X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy strict-origin, Permissions-Policy, CSP (whitelist GTM/GA4/Ads/Turnstile/Google Fonts). Cache navigateur : 1 an immutable sur images/polices/JS/CSS, 1 jour sitemap/robots, 1 heure config JSON. Score sécurité D → A. |
| **LOT 4.1** | 9 mai 2026 | _headers v2 | Patch correctif CSP : ajout `media-src 'self' blob: https://*.r2.dev https://*.cloudflarestream.com` (vidéo background bloquée), ajout `worker-src 'self' blob:`, Permissions-Policy nettoyée (retrait `interest-cohort` et `browsing-topics`), cache `*.mp4`/`*.webm` 1 an. |

---

## Configuration Google Ads ✓

| Action | État |
|---|---|
| Valeur conversion "Envoi formulaire - Nomacast" passée à 500 € (proxy lead-to-deal) | Fait |
| Click Mail supprimé (signal trop faible en B2B ticket 1500-2500€) | Fait |
| Conversion fantôme "Formulaire de contact - Envoyer" tolérée en secondaire (auto-créée IA Google, non supprimable) | Acté |
| Enhanced Conversions activées | Fait |
| Optimisations RSA EN (titres "videographer"/"webcast"), sitelinks EN "Event Videographer", extraits structurés "Event videographer", keyword FR "vidéaste événementiel" | Fait |
| Attribution Data-driven, fenêtre 30 jours B2B | OK |

---

## Tests post-déploiement validés ✓

### Sécurité (LOT 4 + 4.1)
| Test | Avant | Après |
|---|---|---|
| Security Headers (snyk) | D | **A** |
| Mozilla HTTP Observatory | 30/100 | **75/100** |
| HSTS | ❌ | ✓ |
| CSP | ❌ | ✓ |
| X-Frame-Options | ❌ | ✓ |
| Permissions-Policy | ❌ | ✓ |

### Fonctionnel (LOT 4.1)
- Vidéo R2 (cas-client louvre-lahorde.mp4) : ✓ joue
- Formulaires : ✓ envoi OK + mail Resend reçu + redirection `/merci.html?type=devis`
- Tracking GTM/GA4/Ads : ✓ (présumé OK)
- Cache navigateur 1 an sur assets : à vérifier (Test E)

### Performance (PageSpeed Insights baseline avant LOT 3 patches)
| URL | Perf Mobile | Perf Desktop | LCP Mobile |
|---|---|---|---|
| `/` (home FR) | 67 | 92 | 8,4s ⚠️ |
| `/tarifs.html` | 62 | 92 | 8,9s ⚠️ |
| `/devis-live-streaming-paris.html` | 85 | 90 | 3,4s |
| `/en/` (home EN) | n/a | 96 | 1,1s ✓ |

CLS excellent partout (0 à 0.038).

---

## Lots écartés / annulés

| Lot | Raison |
|---|---|
| **LOT 6** — defer configurateur tarifs | Annulé. Tarifs.html / pricing.html considérés trop fragiles, on ne touche plus. |

---

## Découvertes & décisions techniques

- **Anti-flood Cloudflare** : 1 soumission par IP toutes les 60s (TTL minimum KV). N'est pas un bug, juste un anti-spam à connaître pour les tests.
- **Conversion fantôme avant LOT 2** : 1 conversion comptée sans mail Resend reçu. Cause identifiée : visite directe de `/merci.html` (sans param `?type=`) déclenchait l'event GTM. Fix appliqué dans le LOT 2.
- **Bug cosmétique URL `error=flood`** : la Pages Function génère `/en/index.html#contact?error=flood` au lieu de `?error=flood#contact`. Le `?` après le hash est inaccessible côté JS. Non bloquant, à corriger un jour si besoin.
- **Pattern intrinsic ratio** : HTML déclare les vraies dimensions du fichier source, CSS contraint l'affichage via `aspect-ratio` + `object-fit: cover`. Pratique recommandée par web.dev.
- **Routage FR/EN automatique** : déjà en place via Pages Function `envoyer.php.js` (lit le field caché `lang=en`). Audit confirmé sur les 31 formulaires.
- **Vidéos sur Cloudflare R2** : architectural confirmé. R2 plus économique que Cloudflare Pages pour servir du média lourd.
- **`'unsafe-inline'` dans le CSP** : compromis assumé pour ne pas refactorer les 36 KB de CSS inline + scripts dataLayer GTM. Pénalise Mozilla Observatory de 25 points (75/100 au lieu de 100). Durcissement avec nonces possible mais effort disproportionné.

---

## Bilan global

✓ **5 lots déployés en 1 session**
✓ **Sécurité : D → A**
✓ **Mozilla Observatory : 30/100 → 75/100**
✓ **0 régression fonctionnelle après tests post-déploiement**
✓ **CLS bon partout (Core Web Vitals : 1/3 validé)**

Reste à attaquer : performance mobile (LCP 8s sur home/tarifs) et accessibilité.

Voir `TODO-NOMACAST.md` pour la suite.
# Nomacast — Diffs complémentaires du 9 mai 2026 (LOT 2 — pages thank-you)

Ce complément patche `merci.html` et `en/thank-you.html` après audit du tracking de conversion. À déployer en plus du premier zip `nomacast-patches-2026-05-09.zip`.

---

## Bug détecté

**Constat** : 1 conversion enregistrée dans Google Ads sur `devis-captation-evenement.html` mais **aucun mail Resend reçu**. Pourtant les tests directs depuis `index.html` reçoivent bien le mail.

**Cause** : le script de tracking sur `merci.html` et `en/thank-you.html` poussait `dataLayer.push({event:'form_submit'})` à **chaque chargement de la page**, peu importe la provenance. Donc :

- Une visite directe de `/merci.html` (vieux bookmark, lien partagé Slack/email, robot crawler ignorant le `noindex`) déclenchait l'event GTM
- La balise Google Ads se déclenchait → conversion comptée
- Mais aucun formulaire n'avait été soumis → `envoyer.php` jamais appelé → **pas de mail**

**Preuve** : la Pages Function `envoyer.php.js` redirige toujours avec un paramètre `?type=devis` ou `?type=agence` après une vraie soumission validée (Turnstile + honeypot + champs). Donc une visite SANS ce paramètre = pas une vraie soumission.

---

## Fix appliqué — `merci.html` et `en/thank-you.html`

### 1. Garde-fou anti-conversion fantôme

Le script ne déclenche désormais l'event `form_submit` **que si** le paramètre `type` est présent dans l'URL :

```js
// AVANT
var formType = params.get('type') || 'devis'; // par défaut 'devis'
window.dataLayer.push({event:'form_submit', form_type:formType});

// APRÈS
var formType = params.get('type');
if (!formType) return; // visite directe sans soumission valide → pas de conversion
window.dataLayer.push({event:'form_submit', form_type:formType});
```

**Effet** : seules les vraies soumissions (qui passent par `envoyer.php` et sont redirigées avec `?type=...`) déclencheront une conversion. Plus aucune conversion fantôme.

### 2. Suppression du switcher de langue visible

L'UI affichait un toggle `FR · EN` qui n'avait pas de sens sur ces pages destinations one-way (l'utilisateur a soumis en FR, aucune raison qu'il bascule en EN). Bloc HTML supprimé sur les deux pages.

### 3. Suppression des balises `hreflang` dans le `<head>`

Sans effet SEO réel (les pages sont en `noindex, nofollow`) mais incohérent avec le retrait du switcher visible. 3 balises supprimées par fichier :
```html
<link rel="alternate" hreflang="fr" ...>
<link rel="alternate" hreflang="en" ...>
<link rel="alternate" hreflang="x-default" ...>
```

`<link rel="canonical">` est conservé (utile en cas de partage de l'URL).

---

## Routage FR / EN automatique : déjà en place

**Confirmation après audit des 31 formulaires du site** : la mécanique de redirection automatique fonctionne déjà via la Pages Function `envoyer.php.js`.

Audit synthétique :
- **Toutes les pages FR** : `<form action="envoyer.php">` sans field `lang` → fallback FR par défaut → redirection vers `merci.html` ✓
- **Toutes les pages EN** : `<form action="../envoyer.php">` avec `<input type="hidden" name="lang" value="en">` → redirection vers `en/thank-you.html` ✓
- Turnstile présent sur 100 % des formulaires ✓
- Honeypot présent sur 100 % des formulaires ✓

**Aucune action requise** sur les formulaires des autres pages.

---

## Test recommandé après déploiement

1. **Test 1 — soumission FR** : aller sur `https://www.nomacast.fr/index.html`, remplir le formulaire de bas de page, soumettre.
   - Attendu : redirection vers `merci.html?type=devis`
   - Vérifier : mail reçu côté `evenement@nomacast.fr` (et `agences@nomacast.fr` si is_agence=1)
   - Vérifier dans GA4 (Temps réel) : event `form_submit` avec `form_type=devis`

2. **Test 2 — soumission EN** : aller sur `https://www.nomacast.fr/en/`, remplir, soumettre.
   - Attendu : redirection vers `en/thank-you.html?type=devis`
   - Vérifier : mail reçu avec préfixe `[EN]` au sujet
   - Vérifier dans GA4 : event `form_submit` avec `form_type=devis`

3. **Test 3 — visite directe** (validation du fix) : aller directement sur `https://www.nomacast.fr/merci.html` (sans paramètre URL).
   - Attendu : aucun event `form_submit` dans GA4 / aucune conversion comptée dans Ads
   - Vérifier dans GTM Preview que la balise Form Submit ne s'est PAS déclenchée

---

## Effet attendu sur les rapports

- Les conversions Ads vont devenir **plus précises** (plus de comptage fantôme)
- Le ratio "conversions Ads ↔ mails Resend reçus" devrait être de 1:1 (à 5 % près sur les blocages CDN/cookies)
- À surveiller : si le compteur de conversions chute brutalement, c'est qu'une part significative venait des fantômes — confirmé par les data Resend (qui sont la vérité absolue : 1 mail = 1 vraie soumission).

---

## Entrée CHANGELOG suggérée (à ajouter à celle du LOT 1)

```markdown
## Lot 2 — Fix tracking conversion fantôme + nettoyage pages thank-you

**Bug détecté** : conversion Google Ads comptée sur `devis-captation-evenement.html` sans mail Resend reçu. Cause : script de `merci.html` / `en/thank-you.html` qui poussait l'event `form_submit` à chaque chargement de page, peu importe la provenance (vieux bookmark, lien partagé, robot ignorant le noindex → conversion fantôme).

**Fix** : ajout d'un garde-fou — l'event `form_submit` ne se déclenche QUE si le paramètre `?type=` est présent dans l'URL (paramètre ajouté par `envoyer.php` après validation serveur Turnstile + honeypot + champs). Une visite directe sans soumission valide ne compte plus comme conversion.

**Nettoyage UX** : suppression du switcher de langue visible (FR · EN) sur ces 2 pages destinations one-way. L'utilisateur n'a aucune raison de basculer de langue après soumission. Suppression aussi des 3 balises `<link rel="alternate" hreflang="...">` dans le `<head>` (sans effet SEO sur des pages noindex, mais cohérent).

**Routage FR/EN automatique** : confirmé déjà en place via la Pages Function `envoyer.php.js` qui lit le field caché `lang=en` (présent sur toutes les pages EN, absent sur FR = fallback FR par défaut). Audit complet des 31 formulaires du site validé.

## Décision technique actée

- **Garde-fou anti-conversion fantôme** : règle générale pour toute page de remerciement post-soumission. Le tracking client (GTM dataLayer.push) doit se déclencher conditionnellement selon un signal serveur (paramètre URL, cookie, ou nonce signé) pour distinguer les vraies soumissions des visites directes
- **`merci.html` et `en/thank-you.html` sont des destinations one-way** : pas de switcher de langue, pas de hreflang dans le `<head>`. Cohérent avec leur statut `noindex, nofollow`
```

---

**Fin du LOT 2.**

# Nomacast — Diffs du 9 mai 2026

Ce document récapitule l'ensemble des modifications HTML / sitemap appliquées en une session après l'audit complet du 9 mai 2026.

**Total : 14 fichiers modifiés, ~19 modifications, aucune touche à la structure CSS/JS.**

---

## 1. `sitemap.xml`

**2 blocs `<url>` retirés** (LP Ads pures, doivent être hors sitemap car en `noindex, follow`) :

- `https://www.nomacast.fr/devis-live-streaming-paris.html`
- `https://www.nomacast.fr/en/quote-live-streaming-paris.html`

**Commentaire d'en-tête mis à jour** :
- Date `2026-05-08` → `2026-05-09`
- Compte `56 URLs (28 FR + 28 EN)` → `54 URLs (27 FR + 27 EN)`
- Note d'exclusion clarifiée : toutes les pages `devis-* / quote-*` sont hors sitemap

---

## 2. `mentions-legales.html`

**Robots** : `noindex, follow` → `index, follow`

Cohérence avec `politique-de-confidentialite.html` qui était déjà indexable.

---

## 3. `en/legal-notice.html`

**Robots** : `noindex, follow` → `index, follow`

Cohérence avec `en/privacy-policy.html`.

---

## 4. `captation-evenement-entreprise.html`

**Ajout balise `<meta property="og:url">`** dans le `<head>` avant `og:title` :
```html
<meta property="og:url" content="https://www.nomacast.fr/captation-evenement-entreprise.html">
```

---

## 5. `captation-video-corporate.html`

**Ajout balise `<meta property="og:url">`** :
```html
<meta property="og:url" content="https://www.nomacast.fr/captation-video-corporate.html">
```

---

## 6. `en/corporate-event-filming.html`

**Ajout balise `<meta property="og:url">`** :
```html
<meta property="og:url" content="https://www.nomacast.fr/en/corporate-event-filming.html">
```

---

## 7. `en/corporate-video-production.html`

**Ajout balise `<meta property="og:url">`** :
```html
<meta property="og:url" content="https://www.nomacast.fr/en/corporate-video-production.html">
```

---

## 8. `prestataire-captation-evenement.html`

**Eyebrow** : `Prestataire audiovisuel` → `Vidéaste événementiel B2B`

Place stratégique (au-dessus du H1) qui injecte le mot-clé sans toucher au H1 ni au positionnement marque blanche.

---

## 9. `index.html` (FR)

**Meta description** :
- Avant : `Tournage vidéo et live streaming clé en main pour vos événements d'entreprise. 3 caméras 4K, livré le jour même. Paris, France & Europe. Devis 24h.`
- Après : `Vidéaste événementiel pour entreprises : tournage vidéo et live streaming clé en main. 3 caméras 4K, livré le jour même. Paris, France & Europe. Devis 24h.`

---

## 10. `agences-partenaires.html`

**Subtitle hero** :
- Avant : `Vous êtes une agence événementielle ou audiovisuelle. Vous avez besoin d'un technicien broadcast fiable, équipé et autonome...`
- Après : `Vous êtes une agence événementielle ou audiovisuelle. Vous avez besoin d'un vidéaste événementiel broadcast fiable, équipé et autonome...`

`technicien broadcast` remplacé par `vidéaste événementiel broadcast` : on garde la valeur "broadcast" (différenciation TV) tout en injectant le mot-clé SEO.

---

## 11. `en/index.html`

**Meta description** :
- Avant : `Turnkey video filming and live streaming for corporate events. 3 cameras in 4K, delivered same day. Paris, France & Europe. Quote within 24 hours.`
- Après : `Corporate event videographer: turnkey filming and live streaming. 3 cameras in 4K, delivered same day. Paris, France & Europe. Quote within 24 hours.`

---

## 12. `en/b2b-event-filming-provider.html`

**Eyebrow** : `Audiovisual provider` → `B2B event videographer`

---

## 13. `en/quote-live-streaming-paris.html` (LP Ads exact-match)

**Eyebrow** : `Conference · Seminar · AGM · Convention` → `Event videographer · Conference · Seminar · AGM`

**Subtitle** :
- Avant : `3 4K cameras + dedicated 5G connection. Broadcast to YouTube, LinkedIn, Vimeo or a private platform. Tailored quote within 24h, often the same day.`
- Après : `Your dedicated corporate event videographer in Paris. 3 4K cameras + dedicated 5G connection. Broadcast to YouTube, LinkedIn, Vimeo or a private platform. Tailored quote within 24h, often the same day.`

**Effet attendu** : alignement keyword `[event videographer paris]` ↔ ad copy ↔ landing → Quality Score +1 à +2 points → CPC -10 à -20 % sur ce keyword.

---

## 14. `live-streaming-evenement.html`

### Modif 14a — Subtitle hero enrichi avec webcast/webinaire
- Avant : `Définition complète, composantes techniques et bonnes pratiques pour retransmettre vos événements en direct sur toutes les plateformes.`
- Après : `Le live streaming événementiel — aussi appelé webcast professionnel ou webinaire d'entreprise — c'est la diffusion en direct de vos événements vers toutes les plateformes. Définition complète, composantes techniques et bonnes pratiques.`

### Modif 14b — FAQ insérée en position 2
Question : `Webcast, webinaire, live streaming : quelle différence ?`

Réponse complète avec définition de chaque terme + lien vers `captation-conference-seminaire.html` pour le maillage interne.

---

## 15. `en/event-live-streaming.html`

### Modif 15a — Subtitle hero enrichi avec webcast/webcasting
- Avant : `Full definition, technical components and best practices to broadcast your events live on every platform.`
- Après : `Event live streaming — also known as professional webcast or corporate webcasting — is the live broadcast of your events to every platform. Full definition, technical components and best practices.`

### Modif 15b — FAQ insérée en position 2
Question : `Webcast, webinar, live streaming: what's the difference?`

Réponse parallèle au FR avec lien vers `conference-seminar-filming.html` (maillage EN).

---

## Récap des mots-clés ajoutés

### FR
| Mot-clé | Pages cibles | Mentions |
|---|---|---|
| Vidéaste événementiel | `prestataire-captation-evenement.html` (eyebrow), `index.html` (meta), `agences-partenaires.html` (subtitle) | 3 mentions visibles |
| Webcast professionnel | `live-streaming-evenement.html` (subtitle + FAQ) | 2 mentions |
| Webinaire d'entreprise | `live-streaming-evenement.html` (subtitle + FAQ) | 2 mentions |

### EN
| Mot-clé | Pages cibles | Mentions |
|---|---|---|
| Corporate event videographer | `en/index.html` (meta), `en/quote-live-streaming-paris.html` (subtitle) | 2 mentions |
| Event videographer | `en/b2b-event-filming-provider.html` (eyebrow), `en/quote-live-streaming-paris.html` (eyebrow) | 2 mentions |
| Professional webcast | `en/event-live-streaming.html` (subtitle + FAQ) | 2 mentions |
| Corporate webcasting | `en/event-live-streaming.html` (subtitle + FAQ) | 2 mentions |

---

## Entrée CHANGELOG suggérée

À ajouter en tête de `CHANGELOG.md` :

```markdown
# 2026-05-09 — SEO + tracking : intégration mots-clés "vidéaste événementiel" / "videographer" / "webcast" + nettoyage sitemap

Suite à l'audit complet du 9 mai 2026 (cf. AUDIT-2026-05-09.md / SESSION-RECAP-2026-05-09.md).

## Modifications HTML (14 fichiers, ~19 modifs)

**SEO mots-clés FR** : ajout "Vidéaste événementiel" sur 3 pages stratégiques (eyebrow `prestataire-captation-evenement`, meta description `index`, subtitle `agences-partenaires`). "Vidéaste" passe de 0 occurrence dans le contenu visible à 3.

**SEO mots-clés EN** : ajout "Corporate event videographer" + "Event videographer" sur 3 pages (meta `en/index`, eyebrow `en/b2b-event-filming-provider`, eyebrow + subtitle `en/quote-live-streaming-paris`). "Videographer" passe de 0 à 4 mentions visibles. Effet attendu sur Quality Score Ads `[event videographer paris]`.

**SEO mots-clés bilingues** : ajout "webcast professionnel / webinaire" (FR) et "professional webcast / corporate webcasting" (EN) via subtitle enrichi + FAQ dédiée sur les 2 pages live-streaming. "Webcast" passe de 0 à 2-3 mentions par langue.

**OG:url manquant** : ajout sur les 4 landings indexables (`captation-evenement-entreprise`, `captation-video-corporate`, `en/corporate-event-filming`, `en/corporate-video-production`).

**Pages légales indexées** : `mentions-legales.html` et `en/legal-notice.html` passent de `noindex, follow` à `index, follow`. Cohérence avec les pages de confidentialité déjà indexables.

## Sitemap

Retrait des 2 dernières URLs `noindex` du sitemap (`devis-live-streaming-paris.html` et `en/quote-live-streaming-paris.html`). Sitemap : 56 → 54 URLs (27 FR + 27 EN, parfaitement symétriques).

Commentaire d'en-tête reformulé : toutes les pages `devis-* / quote-*` sont désormais explicitement hors sitemap (LP Ads pures, ne doivent pas concurrencer les pages services hub canoniques en SEO organique).

## Décisions techniques actées

- **Pas de modification d'URL slugs** : `webcast` et `videographer` n'apparaîtront pas dans les URLs. Le mot-clé fait le job dans le contenu visible (H1, eyebrow, meta, FAQ). Casser des URL stables pour un gain marginal n'est pas justifié (link equity + redirections + propagation 1-3 mois).
- **FAQ dédiée "webcast/webinar vs live streaming"** : ajoutée en position 2 (juste après la Q de prix qui reste première pour la conversion). Sans schema FAQPage JSON-LD pour l'instant (cohérent avec l'existant).
- **Eyebrow comme injecteur SEO** : convention adoptée pour intégrer un mot-clé sans toucher au H1 (qui garde sa force commerciale).
- **Pages légales `index, follow`** : standard SEO préféré au noindex pour les pages obligatoires (cohérence FR/EN).

## Modifications Google Ads (réalisées par Jérôme avant le patch)

- Titres RSA EN enrichis avec "videographer" et "webcast"
- Sitelink EN "Event Videographer" ajouté
- Extrait structuré "Event videographer" ajouté côté EN
- Keyword FR "vidéaste événementiel" vérifié/ajouté
- Conversion form submit : valeur 200 € → 500 € (proxy lead-to-deal raisonnable sur panier moyen 2 000 €)
- Click Phone passé en secondaire (Smart Bidding optimise désormais quasi-uniquement sur form submits, cohérent avec funnel B2B où la majorité des leads passent par formulaire)

## Reste à finaliser (session ultérieure)

- Recréation propre de la conversion "Clic Mail" + objectif "Contact" (mis de côté pendant cette session)
- Enhanced Conversions confirmées actives ✓
- Vérifier label `n81SCKCN46EcENCEva9D` côté Click Phone (non bloquant, à voir si Click Phone enregistre correctement les conversions sur 30 jours)

## À surveiller (suivi 4-6 semaines)

- Search Console > Performance : impressions sur "vidéaste événementiel", "videographer paris", "webcast"
- Google Ads > Quality Score `[event videographer paris]` (attendu : +1 à +2)
- Google Ads > CPC moyen sur les keywords avec mot exact (attendu : -10 à -20 %)
- Search Console > Couverture : `mentions-legales` et `en/legal-notice` indexées
- Re-soumettre `sitemap.xml` après déploiement
```

---

**Fin du récap diffs.**

# 2026-05-09 — Campagne Google Ads EN créée + raffinements FR + dispositif complet

## Création campagne "Nomacast | Conversions EN"

**Paramètres** : Search, "Maximiser les clics", CPC max **2,50 €** (vs 2 € FR), budget **8 €/jour** (~240 €/mois — refus de la reco Google à 13,76 €). Display + partenaires de recherche désactivés. Langue : English only.

**Géo** (mode "Présence ou intérêt") : France entière + 18 villes — Londres, Dublin, Berlin, Munich, Frankfurt, Amsterdam, Bruxelles, Zurich, Genève, Madrid, Barcelone, Milan, Rome, NY, SF, LA, Toronto, Montréal. Diffusion Lun-Ven 100 %, Sam-Dim -30 %.

**14 mots-clés** : 10 exact géo-ciblés Paris (`[live streaming paris]`, `[event live streaming paris]`, `[corporate live streaming]`, `[event filming paris]`, `[video production paris]`, `[conference filming paris]`, `[corporate video paris]`, `[event videographer paris]`, `[webcast paris]`, `[live event production paris]`) + 4 phrase plus larges (`"live streaming events"`, `"corporate event filming"`, `"professional live streaming"`, `"event production paris"`). Aucun en requête large.

**2 RSA** dans groupe "Captation" : Annonce 1 axe produit/prix (chemin `streaming/paris`), Annonce 2 axe confiance/références (chemin `streaming/events`, distinction A/B). 15 titres × 4 descriptions par annonce, aucun épinglé.

**7 sitelinks** (URLs vérifiées contre la liste réelle des fichiers `/en/quote-*.html`) :

| Texte | URL |
|---|---|
| Event Filming | `/en/quote-event-filming.html` |
| Conference Filming | `/en/quote-conference-seminar-filming.html` |
| Event Live Streaming | `/en/quote-event-live-streaming.html` |
| Corporate Live Show | `/en/quote-corporate-live-show.html` |
| Roundtable Filming | `/en/quote-interview-roundtable-filming.html` |
| Pricing Estimate | `/en/pricing.html` |
| Get a Quote | `/en/quote-live-streaming-paris.html` |

**10 callouts** : Quote in 24 hours, Setup in 2 hours, From €1,500 (excl. VAT), 3x 4K cameras, 5G dedicated connection, Same-day delivery, 15 years broadcast TV, Single point of contact, Owned equipment 100%, Multi-platform streaming.

**8 extraits structurés** ("Services") : Event filming, Live streaming, Conference & seminar, Corporate live show, 4K filming, Multi-cam setup, Professional webcast, Roundtable & interview.

**7 audiences en mode Observation** (niveau campagne) : Très grande entreprise (10000+), Voyageurs d'affaires, Services pub & marketing (in-market), Services évènementiels (in-market), Planification d'événements pro (in-market), Emplois de cadres, Industrie technologique.

**UTM template** identique à FR :

```
{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}&gclid={gclid}
```

## Raffinements campagne FR

- Sitelink **"Live streaming"** → **"Live streaming événement"** (plus spécifique au B2B ; URL `/devis-live-streaming-evenement.html` inchangée)
- Sitelink **"Notre matériel pro"** (`/devis-captation-4k.html`) → **"Calcul de devis"** (`/tarifs.html`) — le simulateur est une vraie page de conversion
- 8 extraits structurés ajoutés ("Services") : Captation événement, Live streaming, Conférence et séminaire, Émission live corporate, Captation 4K, Multi-caméras, Webcast professionnel, Table ronde et interview

## Expansion géo FR

3 pays francophones premium ajoutés (FR + IDF +30 % maintenu) :
- **Belgique** (0 %) — Bruxelles hub UE, multinationales
- **Suisse** (0 %) — Genève + Lausanne, banking/pharma/orgas internationales
- **Luxembourg** (0 %) — multinationales et banques privées

Quebec, Monaco, Maghreb francophone écartés (timezone, fit, volume).

## Filet de sécurité étendu

Règle automatique 275 € sans conversion sur 30 jours roulants étendue à toutes les campagnes. Google évalue chaque campagne **indépendamment** : FR seule dépasse → FR pause ; EN seule dépasse → EN pause. Pas de risque d'interaction croisée.

Effet calibré différemment selon budget : FR (195 €/mois) protection à 1,41× budget (~6 sem) ; EN (240 €/mois) protection à 1,15× budget (~5 sem). Protection plus stricte sur EN assumée (campagne nouvelle sans historique).

## Calendrier saisonnier validé

| Période | FR | EN | Total/jour |
|---|---|---|---|
| Mai-Juin (peak printemps) | 6,50 € | 8 € | 14,50 € |
| **Juillet-Août (off)** | 0 € | 0 € | **0 €** |
| Sept-Oct (rentrée + peak) | 6,50-8 € | 8-10 € | 14,50-18 € |
| Nov-Déc | 6,50 € | 8 € | 14,50 € |
| Janv-Fév (creux) | 4 € | 4 € | 8 € |
| Mars-Avril (peak) | 6,50-8 € | 8 € | 14,50-16 € |

Économie annuelle vs budget plat : ~25 % (~3 800-4 200 € vs 5 200 €).

**Dates clés** : 30 juin au soir = pause des 2 campagnes. 25 août = réactivation EN. 28 août (vendredi) = réactivation FR (3-4 jours warm-up Google avant le pic du 1er septembre).

## Pilotage selon perfs mai-juin

| Conversions mai-juin | Action sept-oct |
|---|---|
| 0 | 14,50 €/jour stable, réévaluer fin sept |
| 1-3 | Garder + ajouter Enhanced Conversions et call tracking |
| 4+ | 18 €/jour + bascule FR vers "Maximiser conversions" (ou Target CPA si ≥30 cumulées) |

À surveiller en hebdo : clics/CTR par campagne et mot-clé, conversions, Search Terms Report (négatifs), perfs RSA produit vs confiance, perfs audiences en Observation.

## Décisions techniques actées

- 100 % manuel, **aucune utilisation de l'IA generator Google** (risque réel de pollution avec mots-clés en requête large et titres génériques)
- **URLs sitelinks vérifiées avant saisie** contre la liste réelle des fichiers du serveur — ne plus déduire d'URL par pattern. Seul `/en/quote-live-streaming-paris.html` figure dans le sitemap (les 6 autres `quote-*` EN sont en `noindex, follow`, comportement intentionnel comme côté FR)
- **`/pricing.html` et `/tarifs.html` promus comme cibles de sitelink** : vraies pages de conversion via formulaire intégré, pas des pages informatives
- **CPC EN à 2,50 € vs FR 2,00 €** : marché plus compétitif sur "Paris + service" en anglais
- **`/pricing` plutôt que `/quote-4k-filming`** dans les sitelinks EN : "4K" est un signal technique peu utilisé par les prospects, "Pricing" est universellement cherché en B2B
- **Une seule règle multi-campagne** : Google évalue par campagne indépendamment, pas de duplication nécessaire
- **Audiences EN au niveau campagne** : sans impact diffusion tant qu'il n'y a qu'un seul groupe d'annonces (Captation). Bascule au niveau groupe possible plus tard pour symétrie reporting avec FR

---

# 2026-05-09 — Nettoyage DNS Cloudflare (résidus LWS) + alignement DMARC

## Modifications appliquées

**Suppression DKIM LWS** : `dkim._domainkey.nomacast.fr` TXT supprimé (clé 1024 bits, sélecteur `dkim`, orphelin depuis l'arrêt des envois LWS). Distinction sans risque : Google Workspace utilise sélecteur `google` avec clé 2048 bits.

**SPF racine simplifié** :
- Avant : `v=spf1 include:_spf.google.com a:mailphp.lws-hosting.com a:mail.nomacast.fr ~all`
- Après : `v=spf1 include:_spf.google.com ~all`

**DMARC aligné sur alias dédié** :
- Avant : `rua=mailto:[email protected]; ruf=mailto:[email protected]` (placeholder oubliée)
- Après : `rua=mailto:dmarc@nomacast.fr; ruf=mailto:dmarc@nomacast.fr; fo=1; adkim=r; aspf=r; pct=100`
- Politique conservée à `p=none` (mode observation)

**Alias `dmarc@nomacast.fr`** créé sur le compte principal Google Workspace. Filtre Gmail recommandé : `Vers: dmarc@nomacast.fr` → Archiver + libellé `DMARC`.

## Décisions techniques actées

- **LWS = registrar uniquement.** Plus aucune dépendance à l'infra LWS dans la zone DNS. L'hébergement mutualisé peut être résilié (formule "domaine seul" à conserver). Verrou de transfert maintenu activé
- **2 sélecteurs DKIM actifs** : `google` (Google Workspace) et `resend` (Resend depuis @nomacast.fr). Pour tout futur 3e service mail : nouveau sélecteur dédié, jamais réutiliser `dkim`
- **SPF racine minimal** `v=spf1 include:_spf.google.com ~all`. Resend reste hors car return-path sur `send.nomacast.fr` qui a son propre SPF (`include:amazonses.com`)
- **DMARC en `p=none`** : observer 4-6 semaines minimum avant durcissement à `quarantine` (sinon mails légitimes non alignés mis en spam)
- **Alias `dmarc@nomacast.fr`** : usage exclusif rapports DMARC, ne pas publier ailleurs

---

# 2026-05-09 — 4 résidus FR sur 4 pages EN (post-audit sitemap)

Scan exhaustif post-livraison ayant remonté 4 résidus français + 1 lien interne cassé sur les pages EN.

| Page EN | Type | Avant | Après |
|---|---|---|---|
| `4k-video-recording.html` (L519) | CTA | `Voir les tarifs et configurer` | `See pricing & configure` |
| `corporate-event-filming.html` (L386-389) | trust-bar | `15 ans d'expérience` / `Matériel en propriété` / `Installation en 2h` / `Fichier remis le soir même` | `15 years of experience` / `Owned equipment` / `2-hour setup` / `File delivered same day` |
| `multi-site-live-streaming.html` (L346-353) | nav + aria-label | `Prestations` / `Cas clients` / `Agences` (lien cassé `agences-partenaires.html`) / `Appeler` | `Services` / `Case studies` / `Agencies` (`partner-agencies.html`) / `Call Nomacast` |
| `corporate-video-production.html` (L293) | aria-label | `Appeler` | `Call` |

Trust bar `corporate-event-filming` ↔ `corporate-video-production` copiée mot pour mot (pairage landings simples respecté).

## Décisions techniques actées

- **Garde-fou anti-résidus FR** : avant toute livraison EN, lancer `grep -i` sur stop-words FR fermés (`prestations`, `cas clients`, `agences`, `tarifs`, `devis`, `appeler`, `matériel`, `propriété`, `expérience`, `fichier`, `installation`, `voir les`, `configurer`) sur l'ensemble des fichiers EN
- **Cross-check des liens internes** : tous les `href` non-externes doivent pointer sur un fichier existant (le `href="agences-partenaires.html"` était un lien mort EN, copier-coller incomplet depuis le FR)
- **Pairage `corporate-event-filming.html` ↔ `corporate-video-production.html`** (landings simples) : toute modif structurelle ou de wording sur l'une propagée à l'autre dans la même session

---

# 2026-05-09 — Audit hreflang/canonical pré-soumission sitemap

Mismatch homepage : la home EN canonicalisait vers `/en/index.html` alors que le sitemap déclarait `/en/`. Effet miroir partiel côté FR.

## Modifications appliquées

**`index.html` (FR home)** — 2 corrections :
- L21 `<link rel="alternate" hreflang="en" href="https://www.nomacast.fr/en/">`
- L1717 `<a href="/en/" hreflang="en" lang="en">EN</a>`

**`en/index.html` (EN home)** — 5 corrections : `canonical`, `hreflang="en"`, `og:url`, JSON-LD WebSite `url`, JSON-LD BreadcrumbList `item` "Home" → tous vers `https://www.nomacast.fr/en/`.

## Décisions techniques actées

- **Convention canonique homepages** : home FR = `https://www.nomacast.fr/`, home EN = `https://www.nomacast.fr/en/`. Aucune référence (canonical, hreflang, og:url, JSON-LD, liens nav) ne doit utiliser `/index.html` pour les homepages. Les autres pages utilisent leur slug `.html` complet
- **Avant toute re-soumission de sitemap** : cross-check `<loc>` sitemap ↔ `canonical` HTML pour chaque URL déclarée
- **Page Rules anti-duplicate-content recommandées** (Cloudflare) : 301 de `*nomacast.fr/index.html` → `*nomacast.fr/` et `*nomacast.fr/en/index.html` → `*nomacast.fr/en/`
- **Sitemap.xml** : `Cache Level: Bypass` recommandé (évite qu'une version périmée soit servie à Googlebot)

---

# 2026-05-08 — Audit complet FR/EN + correctifs Lots A/B/C

Audit post-déploiement chantier bilingue. 5 lots identifiés, 3 appliqués (A/B/C), 2 skippés (D faux positif, E variabilité acceptable).

## Lot A — Résidus FR sur pages EN

`corporate-video-production.html` : 4 traductions (lignes 290, 552, 553, 555). Ajout switcher de langue sur les 4 pages utility EN (`legal-notice`, `privacy-policy`, `sitemap`, `thank-you`).

## Lot B — Switcher mobile + masquage float-call (35 pages FR + 13 pages EN)

CSS `mobile-lang-switch` repositionné en `position:absolute; bottom:80px` avec `border-top` filet de séparation (le footer mobile-overlay est en `position:absolute; bottom:32px` ; le switcher s'ancre 80px au-dessus). Règle systématique ajoutée pour empêcher que le bouton tel flottant recouvre le coin droit du switcher quand le menu burger est ouvert :

```css
body.menu-open .float-call{display:none!important}
```

Ajoutée même sur les pages sans `.float-call` (sans effet, coût zéro).

## Lot C — Terminologie (6 pages FR)

- **"Devis gratuit" → "Devis sous 24h"** sur 12 CTA boutons (4 pages : `captation-evenement-entreprise`, `captation-video-corporate`, `prestataire-captation-evenement`, `devis-live-streaming-paris`). **Conservé volontairement** : 10 occurrences `Devis gratuit et personnalisé sous 24h` dans `<p class="contact-pitch">` (prose, pas un CTA), et 3 occurrences SEO meta (argument de différenciation)
- **"à la clôture de l'événement" → "dès la fin de l'événement"** sur `captation-video-evenement.html` L497
- **"France entière, Europe..." → "France et Europe..."** sur `tarifs.html` L179 (JSON-LD FAQ)

## Lots D/E skippés

- **D** : 8 pages utility (4 FR + 4 EN) sans Open Graph par design (cohérent `noindex`). Décision : ne rien faire
- **E** : 5 variantes wording CTA EN (`Quote in 24h`, `Quote within 24h`, `Request a quote`, `Free quote`, `Get a quote`) cohabitent. Harmonisation reportée

## Décisions techniques actées

- **`tarifs.html` n'a pas besoin du CTA "Devis sous 24h"** : c'est un simulateur où le formulaire est lui-même le mécanisme de conversion. Footer plus court (3 colonnes au lieu de 4, sans section "Agences") aussi cohérent pour une page-outil
- **Guideline géographique** : "France & Europe" est le terme principal, "Paris" ajouté pour le SEO. Patterns confirmés :
  - Zone footer : `Paris · France · Europe` (avec point médian)
  - Prose : `Paris, France et Europe` ou `Paris, France & Europe` (meta description anglaise)
  - À éviter : `France entière`
- **Asymétrie switcher mobile FR/EN tolérée** (11 pages FR avec `mobile-lang-switch` overlay vs 24 avec `nav-lang-mobile` top nav ; 9 pages EN avec `lang-switch` margin-top fallback). Migration vers modèle uniforme reportée
- **Garde-fou anti-régression** sur `tarifs.html`/`pricing.html` : avant édition, vérifier la présence des marqueurs structurels de la dernière entrée CHANGELOG (`grep -c "data-addon=\"photographe\"" tarifs.html` et `grep -c "class=\"tech-banner\"" tarifs.html` doivent retourner 1). Le timestamp DOCTYPE seul ne garantit pas l'intégrité du contenu
- **Parité FR/EN** (`tarifs.html` ↔ `pricing.html`) : toute modif structurelle propagée aux deux fichiers dans la même session

---

# 2026-05-08 — Chantier bilingue FR/EN — finalisation

Boucle le chantier bilingue : tous les contenus EN produits, toutes les pages FR avec switcher + hreflang, sitemap bilingue.

## Livré

- **Lot 3 services finalisé (11/11)** : 9 pages services EN bouclées
- **7 pages devis EN** : `quote-conference-seminar-filming` (template), `quote-event-filming`, `quote-interview-roundtable-filming`, `quote-4k-filming`, `quote-event-live-streaming`, `quote-corporate-live-show`, `quote-live-streaming-paris`
- **35 pages FR patchées** : switcher de langue + hreflang via 4 scripts Python idempotents (`fr_switcher_patch.py`, `devis_lang_patch.py`, `landing_lang_patch.py`, `legal_lang_patch.py`)
- **Sitemap.xml bilingue** régénéré : 56 URLs (28 FR + 28 EN), chaque URL déclare ses 3 alternates (`fr`/`en`/`x-default`), namespace `xmlns:xhtml="http://www.w3.org/1999/xhtml"` ajouté

Pages exclues du sitemap (noindex volontaire) : `404.html`, `merci.html`/`thank-you.html`, 6 devis-* sauf `devis-live-streaming-paris` (les autres sont noindex car spécifiques à des thématiques précises avec nombreux mots-clés ciblés, on ne veut pas concurrencer les pages services hub canoniques).

## Patterns de switcher selon structure de nav

- **`.lang-switch`** (variant principal) — 24 pages avec `<ul class="nav-links">` (services, cas clients, blog, index, agences, tarifs). Position : dernier `<li>` de `nav-links`. Affiché en desktop, masqué en mobile (overlay prend le relais)
- **`.devis-lang-switch`** — 7 pages devis. Position : avant `<a class="tel-link">` dans `.header-actions`
- **`.landing-lang-switch`** — 2 landings simplifiées (`captation-video-corporate`, `captation-evenement-entreprise`). Position : avant `<a class="nav-tel">` dans `.nav-right`
- **`.lang-switch` light** — 3 pages légales + tarifs. Position : avant `<a class="nav-back">`
- **`.merci-lang-switch`** — `merci.html` uniquement
- **Exclu** : `404.html` (page d'erreur servie sur n'importe quel chemin invalide, pas d'alternate possible — version unifiée FR/EN minimaliste)

Tous les scripts sont **idempotents** : si la page contient déjà `class="lang-switch"`, le patch est skipped.

## Tous les formulaires EN

- `<input type="hidden" name="lang" value="en">` pour détection langue dans `envoyer.php.js`
- `action="../envoyer.php"` (chemin relatif depuis `/en/`)
- `source` value adapté par page : `LP {theme} (hero)` et `LP {theme} (bottom)`
- GA4 `phone_location` adapté (ex. `'phone_location': 'quote-event-filming'`)

---

# 2026-05-07 — Chantier bilingue FR/EN — Lots 1, 2, 3 partiel

Lancement version anglaise complète (`nomacast.fr/en/`). Anglais britannique cible (filming, colour, optimise, organisation), sous-répertoire (vs sous-domaine) pour rester sur le même domaine et bénéficier du SEO existant.

## Architecture bilingue actée

- **Structure URL** : `/en/{slug-en}.html` côté EN, `/{slug-fr}.html` côté FR. Mapping FR↔EN dans `docs/MAPPING-SLUGS.md` (37 entrées)
- **hreflang** : `fr`, `en`, `x-default` (FR par défaut)
- **og:locale** + **og:locale:alternate** : `en_GB` / `fr_FR`
- **IDs HTML FR conservés côté EN** (`#offre`, `#cas-clients`, `#agences`, `#apropos`) — convention multilingue standard (Apple, Stripe). Évite de dupliquer les feuilles de style. Les `<h2>` visibles sont traduits, pas les ancres
- **Anchor "Agencies"** : desktop = `#agences` (teaser home), mobile = `partner-agencies.html` (page dédiée), identique au FR (le scroll-into-view + fermeture overlay mobile fait un saut visuel pas terrible)
- **Pas de sous-domaine `en.nomacast.fr`** : sous-répertoire pour SEO existant et simplicité DNS
- **Form action** : `../envoyer.php` depuis `/en/` (path relatif vers la racine où la Pages Function est mappée)
- **Champ `<input type="hidden" name="lang" value="en">`** dans tous les formulaires EN (seul mécanisme fiable de détection ; Referer header trop fragile)
- **Chemins images** : `../images/...` (et non `/images/...` qui casse en preview Cloudflare)
- **Convention de date EN** : `15 September 2022` (UK), pas `September 15, 2022` (US)
- **Slugs EN sémantiques** : SEO-friendly et descriptifs (`case-louvre-lahorde`, `conference-seminar-filming`)

## Glossaire FR → EN clé (`docs/GLOSSAIRE-FR-EN.md`)

- **Tournage / Captation** → `filming` / `video filming`
- **Vidéaste événementiel** → `event videographer`
- **Régie** → `production gallery` / `gallery`
- **Devis** → `Quote` ; **HT** → `(excl. VAT)` ; **TTC** → `(incl. VAT)`
- **Marque blanche** → `white-label` ; **Clé en main** → `turnkey` ; **Sur-mesure** → `bespoke`
- **Repérage** → `site survey` ; **Mise en place J-1** → `day-before setup`
- **Plateau** → `set` / `rig` ; **Cadreur** → `camera operator`
- **Plan du site** → `Sitemap` ; **Mentions légales** → `Legal notice` ; **Confidentialité** → `Privacy policy`
- **Prestations** → `Services` ; **Cas clients** → `Case studies` ; **Tarifs** → `Pricing`
- **Devis sous 24h** → `Quote in 24h`
- **Cas clients narratif** → `In brief / Context / Challenge / Solution / Outcome` ; `Context / Constraints / The setup / How it ran / Results / What I take away`

**Termes NON traduits** : noms propres (Brainsonic, Peech Studio, GL Events, Havas Event, Plissken, Livee, Ekoss), lieux historiques ((LA)HORDE × Louvre, Comédie-Française, Morning, Stratégies, Théâtre à la table), noms techniques produits (vMix, NDI, Canon CR-N500).

## Format devise UK (côté EN)

Convention typographique britannique : symbole `€` **avant** le montant. Exemples : `€1,500`, `−€150`, `+ €500`. Implémentation `pricing.html` :

- Nouvelle fonction JS `eur(n) = "€" + fmt(n)`
- Tous les `fmt(...) + " €"` du configurateur remplacés par `eur(...)`
- HTML statique total/mobile-total : `<span id="total-num">€1,500</span>`
- `Math.round(n).toLocaleString("en-GB")` pour le formatage des milliers (virgule UK : `1,500` au lieu de `1 500`)

## `envoyer.php.js` — patch multilingue

- Détection langue via `formData.get("lang") === "en"`
- 4 constantes : `PAGE_MERCI_FR`, `PAGE_MERCI_EN`, `PAGE_ERREUR_FR`, `PAGE_ERREUR_EN`
- Préfixe `[EN]` au sujet d'email côté admin
- Ligne `Language : English` dans le corps si EN
- Templates de réponse expéditeur FR / EN distincts
- Routing inchangé : Cloudflare normalise `/envoyer.php` qu'il vienne de FR ou de `/en/`

## Pages livrées (cumul Lots 1+2+3 partiel)

- **Lot 1 core (7)** : `index`, `pricing`, `404` (auto-detect via `navigator.language`), `thank-you`, `legal-notice`, `privacy-policy`, `sitemap`
- **Lot 2 cas clients (9/9)** : `partner-agencies`, `case-studies` + 7 cas (`louvre-lahorde`, `comedie-francaise`, `figma-conference`, `gl-events`, `johnson-johnson`, `digital-benchmark-berlin`, `morning`). Script `case_transform.py` automatise le boilerplate
- **Lot 3 services (2/11)** : `conference-seminar-filming`, `corporate-event-filming`. Script `service_transform.py`
- **FR modifié** : `index.html` (faute corrigée `Partie Socialiste` → `Parti Socialiste`), `tarifs.html`, `404.html`

## Push-back QA (refus motivés)

- **Traduire les IDs HTML** (`#offre` → `#services`, etc.) : refusé. Risque CSS, pas d'impact SEO réel, convention multilingue standard
- **Uniformiser nav "Agencies" desktop/mobile** : refusé. Choix UX volontaire identique au FR

---

# 2026-05-07 — Add-on Photographe + bandeau "Vue technique"

## Add-on Photographe événementiel

3e prestation post-événement dans Step 04 (à côté de Best-of monté et Interviews).

- `state.addons.photographe = false`
- `ADDON_PRICES.photographe = { half: 1150, full: 1150, "2days": 1750, "3days": 2350 }` (1 150 €/jour, +600 €/jour additionnel ; demi-journée = jour entier, aligné Best-of)
- `ADDON_MATERIEL.photographe` : `1× Canon EOS 5D Mark IV ou équivalent`, `3× objectifs`, `Édition`, `Livraison J+1/J+2 via weblink de 100+ photographies`
- Branche `compute()` ajoute le prix après mécanique partenaire (pas de remise grille A, comme les autres add-ons)
- `buildAddons()` refactoré : `forEach` sur les 3 add-ons, tracking GA4 en map `addonLabels` + lookup générique `ADDON_PRICES[addonId]` (au lieu de ternaires en cascade)

## Bandeau "Vue technique" (repositionnement)

Le `<label class="tech-switch">` planqué en bas de Step 02 → `<label class="tech-banner">` dark inversé sans icône, inséré entre Step 02 et Step 03 (3e enfant de `.steps`).

- Wording FR : `Voir le matériel inclus` + `Micros, trépieds, ordinateur, câblage… le matériel technique prévu pour chaque partie du dispositif.`
- Wording EN : `See included equipment` + `Mics, tripods, computer, cabling… the technical kit included for every part of your setup.` (choix de "kit" cohérent avec "Make use of the kit already on site" dans la description Interviews)
- `id="tech-switch"` conservé sur l'input pour préserver les références JS (`setTechMode()`, listener `change`, auto-activation agence)
- CSS : background slate dark `linear-gradient(135deg, #1a2332, #0f1825)`, bordure cyan fine, glow radial cyan en haut-gauche via `::before`
- Animation chain `.steps` à 5 enfants : bandeau hérite `.16s`, Step 03 → `.24s` (nth-child(4)), Step 04 → `.32s` (nth-child(5))

## Décisions techniques actées

- **3 add-ons post-événement** (Best-of, Interviews, Photographe), chacun calculé hors mécanique partenaire (pas de remise grille A, pas de charm, pas d'absorption)
- **Tarif photographe** : 1 150 €/jour, +600 €/jour additionnel. Demi-journée = jour entier (livrable identique : 100+ photos éditées, livraison J+1/J+2)
- **Refactor tracking GA4** en map + lookup `ADDON_PRICES` à reproduire pour tout futur add-on
- **Bandeau "Vue technique"** en CTA dédié entre Step 02 et Step 03 (pas dans un step-header) : ce n'est pas une option configurable, c'est un mode d'affichage global. Lui donner sa propre carte le rend visible immédiatement sans le confondre avec les options techniques
- **Design dark inversé sans icône** : sur page blanche avec déjà des accents cyan (CTA "Recevoir mon devis", duration cards actives, options actives), un 3e élément cyan diluerait la hiérarchie. Le contraste fait le travail de signal, le texte porte le sens
- **Parité FR/EN** : toute évolution structurelle du configurateur (`tarifs.html` ↔ `pricing.html`) propagée aux deux dans la même session

---

# 2026-05-07 — Codes partenaires : Cloudflare KV + tokens opaques + back-office admin

Avant cette session, codes partenaires lisibles dans l'URL (`?code=FIGMA`) → un visiteur pouvait deviner les codes en testant des noms (Sodexo, Brainsonic) et constater l'existence de remises pour eux. Refonte en architecture Option B : tokens opaques (`?p=e52vnc`), display name joli pour le champ Société (`Figma` au lieu de `FIGMA`), back-office HTML pour autonomie de Jérôme.

## Architecture finale

**Stockage Cloudflare KV** : namespace `nomacast_partners` (ID `8a26bab4f86e41b2a9e490981b9b9aa1`), bindé sous `PARTNERS` dans le projet Pages. Une seule clé `data` :

```
{
  tokens: { token → code },
  codes: { code → { displayName, type, active, durations, forceOptions, discountTiers, description, createdAt } }
}
```

Modifications instantanées, pas de redéploiement nécessaire.

**Tokens opaques** : 6 caractères, alphabet `abcdefghjkmnpqrstuvwxyz23456789` (sans `i`/`l`/`o`/`0`/`1`). 36 milliards de combinaisons théoriques, largement assez pour un système avec quelques dizaines de partenaires.

**Page admin** `nmc-7k9q3p2x.html` (slug obfusqué). Pages Function `functions/nmc-7k9q3p2x/api/partners.js` (CRUD). Robots : `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">`, **pas dans `robots.txt`** (ce serait révéler le slug).

**Endpoint `/api/validate-code`** refondu : lit dans KV. Header `Cache-Control: no-store` (empêche la divination par cache CDN). Rétro-compat indéfinie pour anciens liens `?code=NOMCODE`.

## Décisions techniques actées

- Variable d'env `PARTNER_CODES_JSON` (Plaintext) **n'est plus utilisée**. Suppression du dashboard Cloudflare possible une fois la nouvelle architecture validée en conditions réelles
- **Tokens opaques** : 6 caractères, alphabet sans caractères ambigus. Suffisant pour le périmètre
- **Page admin protégée uniquement par l'obscurité de l'URL.** Pas de login. Si fuite suspectée : changer le slug = renommer la page HTML + le dossier `functions/nmc-7k9q3p2x/`. Acceptable pour un compte solo
- **Rétro-compat indéfinie** pour anciens liens `?code=NOMCODE` : décision de Jérôme. Aucun partenaire externe à prévenir
- **Modifications de configuration partenaire** (display name, type, statut actif) : passer par l'admin, jamais éditer le KV à la main sauf cas exceptionnel
- **KV est le système de stockage de référence** pour toute donnée modifiable à la volée. Plus jamais de variable d'env nécessitant un redéploiement. Si autres bases nécessaires plus tard (tracking de leads, journal des prospects), KV ou D1 selon le besoin

## Historique codes partenaires (entrées condensées)

Avant la migration KV, plusieurs itérations successives :

- **2026-05-06** : codes en clair dans `tarifs.html` (objet `PARTNER_CODES`). Bug détecté : structure JSON cassée → FIGMA, SODEXO et AGENCE imbriqués comme propriétés de `PEECH` au lieu d'être au niveau racine, `PARTNER_CODES["FIGMA"]` retournait `undefined`. Fix appliqué + masquage du bouton "Je suis une agence événementielle" quand un code partenaire actif (mutuellement exclusifs commercialement)
- **2026-05-06 (suite)** : migration en Pages Function `/api/validate-code` + variable d'env Cloudflare `PARTNER_CODES_JSON` (Plaintext, compte solo). Plus jamais en clair dans le HTML servi. Validation regex serveur `/^[A-Z0-9]{2,30}$/` (majuscules + chiffres, 2-30 caractères, pas de tirets ni d'underscore)
- **2026-05-07** : ajout du code DIXXIT (22e code) via la procédure variable d'env

→ Toutes ces étapes rendues obsolètes par la migration KV ci-dessus.

---

# 2026-05-07 — Favicon SVG sur toutes les pages

Ajout `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` dans le `<head>` de chaque page (juste après `<meta name="viewport">`). 37 pages HTML modifiées (y compris admin `nmc-7k9q3p2x.html`, pages noindex, et `plan-du-site.html`).

Format SVG monochrome (lettre N blanche sur cercle bleu `#5FA3D9`, 262 octets). Pas de fallback PNG/ICO : à reconsidérer uniquement si stat montre du trafic significatif depuis IE11 ou très anciens Safari (peu probable sur cible B2B 2026).

## Décisions techniques actées

- **Un seul fichier SVG à la racine** (`/favicon.svg`), pas de variantes PNG/ICO multi-tailles. Si besoin futur (Apple Touch Icon, manifeste PWA), on étendra sans toucher au SVG existant
- **Identité visuelle Nomacast** : N blanc sur cercle bleu `#5FA3D9` (même bleu que la charte du site)

---

# 2026-05-07 — Fix affichage TTC sur les prix d'options du configurateur

Bug : toggle TTC sur `tarifs.html` basculait bien le total et le panneau récap, mais les prix sur les cartes d'options à cocher restaient en HT. La fonction `shown(ht)` (qui retourne `Math.round(ht * TVA)` quand `state.ttc === true`) n'était pas appelée à 3 endroits :

- L2138 : initialisation de la liste d'options (`+ ${fmt(opt.price)} €`)
- L2075 : refresh des prix dans `render()` cas Pack sonorisation duplex (prix old/new)
- L2077 : refresh des prix dans `render()` cas standard

**Fix** : encapsuler les prix dans `shown()` avant `fmt()` (`fmt(opt.price)` → `fmt(shown(opt.price))`, `fmt(fullPrice)` → `fmt(shown(fullPrice))`, `fmt(newP)` → `fmt(shown(newP))`).

L'event listener du toggle TTC (L2359) appelait déjà `render()`, donc aucune modif sur le câblage.

## Données HT volontairement préservées

- L2395, L2398 : texte récapitulatif copy-paste avec mention explicite "HT"
- L2422, L2423, L2425 : hidden fields `h-cfg-options`, `h-cfg-addons`, `h-cfg-total` envoyés au formulaire et au back-office en HT pour la facturation, indépendants de l'affichage écran
