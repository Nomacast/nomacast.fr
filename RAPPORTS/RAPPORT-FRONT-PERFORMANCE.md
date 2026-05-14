# Rapport : front-end, performance et architecture média

**Date** : 14 mai 2026
**Périmètre** : architecture du site statique, vidéo hero, images, CSP, optimisations performance

---

## 1. Stack front

| Brique | Choix |
|---|---|
| Framework | **Aucun** — HTML/CSS/JS vanilla |
| CMS | **Aucun** — pas de WordPress, pas de plugins |
| Build | **Aucun** — pas de `npm run build`, livraison directe |
| Polices | Google Fonts : Outfit (titres) + Plus Jakarta Sans (body) |
| Anti-bot | Cloudflare Turnstile (lazy-loadé) |
| Analytics | Google Tag Manager `GTM-M99NLF45` → GA4 |

Choix structurant : **un fichier modifié = un déploiement**. Pas de pipeline de build à debugger, pas de surface d'attaque sur des dépendances.

---

## 2. Architecture vidéo hero — état final

### Historique des tentatives

| LOT | Date | Approche | Résultat |
|---|---|---|---|
| v1 (avant LOT 12) | — | 2 balises `<video>` statiques + `display:none` CSS desktop/mobile | ❌ Le navigateur télécharge les 2 sources malgré le `display:none` (5.8 MB + 3.1 MB) |
| LOT 12 | 10/05 | 1 balise vidéo créée en JS au runtime via `matchMedia('(max-width: 768px)')` | ✅ Une seule vidéo, mais LCP toujours ~9s |
| LOT 13 | 10/05 | Image poster `og-image.webp` (19 KB) en z-index 2, fade-in vidéo au `canplay` | ❌ Lighthouse mesure LCP sur la vidéo qui prend la place du poster |
| **LOT 14** | 10/05 | **Vidéo créée en JS uniquement après interaction OU `load+1s`** | ✅ LCP 4.6s, score 84 |
| LOT 15 | 10/05 | Sans timer fallback (interaction-only) | Abandonné : score identique mais ~5 % de visiteurs ne voient jamais la vidéo |

### État final déployé (marqueur `lot14-lazy-on-interaction`)

- Pas de `<link rel="preload" as="video">` dans le head
- Pas de balise `<video>` dans le HTML
- Création JS au runtime selon viewport :
  - Mobile (`< 768px`) : `mashup-mobile.mp4` (3.1 MB, 720p, no audio)
  - Desktop : `mashup.mp4` (5.8 MB)
- Déclenchement : `scroll`, `click`, `keydown`, `touchstart`, `mousemove` OU `load + 1s`
- `<noscript>` fallback pour ~0.5 % utilisateurs sans JS
- CSS poster image (`og-image.webp`) en LCP candidate, z-index 2, fade-out au `canplay`

### Mobile cas-clients (LOT 16)

Sur mobile, **plus aucune vidéo** ne charge sur les pages cas-clients :
```js
if (window.matchMedia('(max-width: 768px)').matches) return;
```
Seul le poster spécifique à chaque cas reste affiché (cf §4).

### ⚠️ Note importante

L'ancienne mémoire ("nomacast-video-v2", "2 R2 versions statiques", "DO NOT revert to JS-injected source") **est obsolète**. La conclusion finale du chantier perf (LOT 12-14, 10/05/2026) a justement été de **basculer en JS-injecté** pour éliminer le double-download.

---

## 3. Hébergement vidéos

| Fichier | Hébergement | Taille | Usage |
|---|---|---|---|
| `mashup.mp4` | Cloudflare R2 | ~5.8 MB | Hero desktop |
| `mashup-mobile.mp4` | Cloudflare R2 | ~3.1 MB | Hero mobile |
| Vidéos cas-clients | R2 | variable | Pages cas-clients (desktop uniquement) |

Vidéos R2 orphelines : à nettoyer périodiquement (item pending).

---

## 4. Images

### Migration WebP

| Date | Décision | Élément technique |
|---|---|---|
| — | Toutes les images servies en `.webp` | Patch via `patch_to_webp.py` (502 swaps) |
| — | Originaux `.jpg/.jpeg/.png` conservés | Fallback de sécurité, suppressibles ~1 semaine après stabilisation |
| — | SVG préservé | `favicon.svg`, icônes |
| 07/05 | Favicon unique SVG monochrome | `/favicon.svg` (262 octets, N blanc sur cercle `#5FA3D9`). Pas de variantes PNG/ICO. Lien dans tous les `<head>` (37 pages) |
| — | Exception : `johnson-johnson.jpg` reste en JPG | Rendu plus propre du texte cursif rouge que la conversion WebP |

### og:image (LOT 21, 10/05)

| Type de page | og:image |
|---|---|
| Pages générales | `og-image.webp` générique (logo Nomacast) |
| **Cas-clients** | Image spécifique au cas (3 occurrences mises à jour par page : `og:image`, `twitter:image`, JSON-LD `image`) |

| Cas | og:image = poster hero |
|---|---|
| comedie-francaise | `images/cas-clients/comedie-francaise.webp` |
| digital-benchmark-berlin | `ebg-berlin.webp` |
| figma-conference | `figma.webp` |
| gl-events | `gl-events.webp` |
| johnson-johnson | `johnson-johnson.webp` |
| louvre-lahorde | `louvre-lahorde.webp` |
| morning | `morning.webp` |

**Cohérence parfaite** : le poster vidéo et l'og:image d'une page cas-client sont la même image.

---

## 5. CSP — Content Security Policy

| Date | Décision | Élément technique |
|---|---|---|
| 10/05 (LOT 17) | **278 URLs absolues → relatives** sur 32 fichiers HTML | `https://www.nomacast.fr/images/...` → `/images/...`. Auto-résolu sur origine courante |
| 10/05 (LOT 17) | **CSP élargie dans `_headers`** | `img-src 'self' https://www.nomacast.fr https://nomacast.fr data: blob: ...` + `connect-src` idem |
| 10/05 | **Meta tags og: conservés en URL absolue** | Bots externes Facebook/Twitter/Google exigent du absolu |

### Bug détecté qui a déclenché ce chantier

Le site est servi sur 2 domaines : `nomacast.fr` et `www.nomacast.fr`. Quand un visiteur arrivait sur `nomacast.fr` (sans www), la CSP `img-src 'self'` n'autorisait que `nomacast.fr` → toutes les images depuis `www.nomacast.fr` étaient **bloquées silencieusement**. Symptôme : tous les logos clients cassés sur la home.

### Recommandation Cloudflare Page Rules (pending)

- 301 `*nomacast.fr/index.html` → `*nomacast.fr/`
- 301 `*nomacast.fr/en/index.html` → `*nomacast.fr/en/`
- `sitemap.xml` : Cache Level Bypass (évite version périmée pour Googlebot)

---

## 6. Optimisations performance (chantier 9-10 mai 2026)

### Évolution score Lighthouse local mobile (home FR)

| Étape | Score | LCP | TBT | Bande passante |
|---|---|---|---|---|
| Init | 67 | 8.4s | 350ms | 9.6 MB |
| LOT 11 (Turnstile lazy) | 74 | 8.3s | 100ms | 9.6 MB |
| LOT 12 (vidéo unique) | 69 | 8.8s | 290ms | 4.1 MB |
| LOT 13 (poster image) | 73 | 9.0s | 160ms | 4.1 MB |
| **LOT 14 (vidéo lazy)** | **84** | **4.6s** | **60ms** | **4.1 MB** |

**Gain net** : +17 points score, −45 % LCP, −83 % TBT, −57 % bande passante, console 75 erreurs → 1.

### Détail des optimisations actives

| Marqueur | Date | Mécanisme |
|---|---|---|
| `nav-cta-fix-v1` | — | Nav header alignement |
| `lot11-turnstile-lazy` | 09/05 | Turnstile chargé uniquement au focus form OU IntersectionObserver (rootMargin 300px). −71 % TBT |
| `lot12-video-single` | 10/05 | Vidéo créée en JS, plus de double-download |
| `lot13-poster-lcp` | 10/05 | Image poster en LCP candidate |
| `lot14-lazy-on-interaction` | 10/05 | Vidéo sur interaction OU `load+1s` |
| `lot16-desktop-video-only` | 10/05 | Cas-clients : 0 vidéo sur mobile |
| `lot17-csp-fix` | 10/05 | URLs relatives + CSP élargie |
| `lot19-video-fullscreen` | 10/05 | Fix vidéo qui n'apparaissait que sur moitié gauche (conflit cascade CSS `transform`) |
| `lot20-photo-ronde-mobile` | 10/05 | Photo à propos en cercle 225×225 centrée sur mobile |
| `lot24-fix-margins` | 10/05 | Marges divider/h2 pages légales : 165px → 81px |

### Optimisations rejetées

| Proposition | Décision | Raison |
|---|---|---|
| `font-display: optional` sur Google Fonts | Rejeté | Typographie = identité visuelle non négociable |
| LOT 15 interaction-only sans fallback | Abandonné | Score identique au LOT 14 mais ~5 % visiteurs immobiles ne voient pas la vidéo |

---

## 7. Patterns identifiés (à réutiliser)

1. **Cloudflare Turnstile = tueur de TBT** : toujours lazy-load au focus du form
2. **Vidéo avec `display:none` ≠ pas téléchargée** : préférer création JS au runtime
3. **Lighthouse n'interagit jamais** : un trigger sur interaction = LCP fixé sur le contenu statique
4. **CSP avec/sans www** : auditer en local sur les deux domaines, le bug est silencieux
5. **Variabilité PSI Cloud ±15-30 points** : ne pas chasser, mesurer en local sur 5 runs ou attendre Field Data CrUX (28 jours)

---

## 8. Markers idempotents en code (référence)

Les scripts Python utilisent des markers pour rester ré-exécutables sans casser. Markers actifs en production :

```
nav-cta-fix-v1
lot11-turnstile-lazy
lot12-video-single
lot13-poster-lcp
lot14-lazy-on-interaction
lot16-desktop-video-only
lot17-csp-fix
lot18-seo, data-lot18-seo
lot18-5-seo
lot19-video-fullscreen
lot20-photo-ronde-mobile
lot21-og-cas-client
lot23-faq-agences, data-lot23-faq
lot24-fix-margins
```

Convention : tout patch Python idempotent doit ancrer son marker dans un commentaire HTML/CSS détectable au prochain run.

---

## 9. Métriques de référence (10/05/2026)

| Métrique mobile home FR | Valeur |
|---|---|
| Score Performance | 84 |
| FCP | 1.2s |
| **LCP** | **4.6s** |
| TBT | 60ms |
| CLS | 0 |
| Speed Index | 1.3s |
| Bande passante | 4.1 MB |

**Étape suivante** : check Field Data CrUX dans Google Search Console (Signaux Web essentiels) après ~28 jours en prod.

---

*État de référence pour l'architecture front Nomacast au 14 mai 2026.*
