# Rapport : conventions éditoriales, design system et workflow

**Date** : 14 mai 2026
**Périmètre** : conventions de contenu, terminologie, design system, workflow de modification

---

## 1. Design system

### Couleurs

| Variable | Valeur | Usage |
|---|---|---|
| Cyan principal | `#5A98D6` | Accents, CTA, indicateur de page courante |
| Cyan light | `#EAF2FA` | Backgrounds doux |
| Navy | `#0b1929` | Sections sombres, footer |
| Off-white | `#f3f6fa` | Background pages |
| Cyan (favicon) | `#5FA3D9` | Cercle favicon SVG |

### Typographie

| Police | Usage |
|---|---|
| **Outfit** | Titres (H1, H2, H3) |
| **Plus Jakarta Sans** | Body, paragraphes, UI |

### Espacement

```css
var(--h-pad): clamp(24px, 5vw, 64px)
var(--max): 1180px
```

### CTA standard

```css
box-shadow: 0 2px 6px rgba(14,165,233,.35);
/* hover */
box-shadow: 0 6px 16px rgba(14,165,233,.55);
```

---

## 2. ⚠️ INTERDICTIONS

### Pas d'emojis Unicode

Le site Nomacast **n'utilise jamais** d'emojis/pictos Unicode, souvent typés "IA" :

```
📹 💡 🎛️ 🎙️ 📦 🌍 💬 💰 📅 🌐 📡 🎥 🎨 🎬
```

**À la place** : numéros 01/02/03 (style `.benefice-num` d'`agences-partenaires.html`).

Le LOT 33 (10/05) a supprimé tous les emojis résiduels sur 8 pages : prestations, services, faq FR/EN, index FR/EN, tarifs, en/pricing.

### Pas de typographies "IA"

- Pas d'em dashes Unicode (`—`) en abondance : éliminés (LOT V4 chat-interactif, 15 occurrences remplacées par `|`, `·`, `,`, parenthèses)
- Préférer la ponctuation française standard

---

## 3. Terminologie validée

### Géographique

| Contexte | Format |
|---|---|
| Footer / zone géographique | `Paris · France · Europe` (avec point médian) |
| Prose | `Paris, France et Europe` ou `Paris, France & Europe` |
| **À éviter** | `France entière` |

### Délais / CTA

| Original | Validé |
|---|---|
| "Devis gratuit" | **"Devis sous 24h"** sur les CTA boutons |
| "à la clôture de l'événement" | "dès la fin de l'événement" |
| "Appeler" (mobile nav) | **Remplacé par "Devis sous 24h"** (anchor `#contact`, sans icône) |

**Conservé volontairement** dans la prose : 10 occurrences `Devis gratuit et personnalisé sous 24h` dans `<p class="contact-pitch">` (argument de différenciation, pas un CTA).

### Pages spécifiques

- **`tarifs.html` / `en/pricing.html`** : **PAS de CTA "Devis sous 24h"** — le formulaire intégré est lui-même le mécanisme de conversion (voir RAPPORT-CONFIGURATEUR)

### Capitalisation / formulations

- "Directeur Technique" (capitalisé)
- "5G et/ou satellite"
- "Pack sonorisation duplex"
- FAQ positionnée après section contact

### EN — wording standard

| FR | EN choisi |
|---|---|
| Devis sous 24h | Quote in 24h |
| Voir le matériel inclus | See included equipment |
| Direction technique en autonomie | Solo tech direction (vs "Technical direction in autonomy" trop long sur mobile) |
| Zéro coupure live | Zero downtime |

---

## 4. Structure standardisée — pages services

### Sidebar "Toujours compris" (identique sur TOUTES les pages services)

1. 3 caméras 4K
2. Éclairage professionnel
3. Régie vidéo
4. Récupération audio depuis la console du lieu
5. Vidéo finale remise dès la fin de l'événement
6. Paris : 0 € de transport · Province et international au devis

### Sidebar "Sur demande"

Options spécifiques selon page + **TOUJOURS inclure** :
- Diffusion live multi-plateformes
- Routeur 5G dédié si nécessaire

### Section "Le déroulé" (sur TOUTES les pages services)

4 étapes :
1. **Brief**
2. **Installation**
3. **Captation**
4. **Livraison**

### Section "Formats disponibles" (sur certaines pages)

Quand pertinent :
- Interview & table ronde : **6 configurations**
- Émission live : **6 formats**

**Pas de "Formats"** sur : conférence/multiplex/4K/multi-plateformes (1 seul dispositif standard).

---

## 5. Pages hub et organisation globale (10-11/05)

### Pages créées récemment

| Date | Page | Rôle |
|---|---|---|
| 11/05 (LOT 28) | `prestations.html` (FR) + `en/services.html` (EN) | Hub services |
| 11/05 (LOT 29) | `faq.html` (FR) | 40 questions agglomérées en 9 catégories |
| 11/05 (LOT 30) | `en/faq.html` (EN) | 40 questions traduites |

### Refonte `prestations.html` (LOT 33, 10/05)

Template copié de `agences-partenaires.html` :
- 4 sections : Hero / 6 cards / Toujours compris / CTA
- "À partir de 1 500 € HT" répété 3× dans la page
- Cards 01-06 cliquables (hover cyan + flèche)
- Menu : Prestations / Services = current page

### Logique de menu "FAQ" (LOT 30)

| Page actuelle | "FAQ" dans le menu pointe vers |
|---|---|
| `index.html` ou `en/index.html` | `#faq` (ancre interne) |
| `faq.html` ou `en/faq.html` | inactif (current page) |
| Toutes les autres | `faq.html` ou `en/faq.html` |

### Logique de menu "Prestations" (LOT 32)

| Page actuelle | "Prestations" dans le menu pointe vers |
|---|---|
| `index.html` ou `en/index.html` | `#prestations` (ancre) |
| `prestations.html` ou `en/services.html` | inactif (current page) |
| Toutes les autres | `prestations.html` ou `en/services.html` |

### Footer (LOT 37, 11/05)

Pattern partout (48 pages) :
- Colonne Prestations : `Voir toutes les prestations →` en gras (FR) / `View all services →` (EN)
- Pattern identique à `Voir tous les cas clients →`

---

## 6. Convention nav header (pages internes)

Sur **toutes les pages autres que l'index**, le lien "Prestations" / "Services" doit pointer vers la page hub `prestations.html` / `services.html` (**pas** vers `index.html#prestations`, **pas** vers `#prestations`).

---

## 7. Workflow de modification — règles

### Principes

| Règle | Pourquoi |
|---|---|
| **Modifications ciblées uniquement** | Jérôme envoie un fichier de référence à jour. Pas de réécriture complète, pas de retour à une version antérieure |
| **Source de vérité = GitHub** | Repo `Nomacast/nomacast.fr` public depuis 11/05. URL canonique pour fetch |
| **Sync Drive → GitHub ne propage pas les suppressions** | Pour supprimer un fichier du repo : interface GitHub web (icône poubelle) |
| **Livrer uniquement les fichiers récemment modifiés** | Pas de zip global, pas de fichiers non-modifiés |

### Stratégies de fetch (testées au 11/05)

| Méthode | Statut |
|---|---|
| `raw.githubusercontent.com/Nomacast/nomacast.fr/main/{fichier}` | ❌ `PERMISSIONS_ERROR` |
| `github.com/.../raw/refs/heads/main/{fichier}` | ❌ bloqué par robots.txt |
| `github.com/Nomacast/nomacast.fr/blob/main/{fichier}` | ⚠️ OK mais tronqué au-delà de ~1000 lignes |
| `https://nomacast.fr/{fichier}` | ⚠️ OK mais rendu markdown / contenu cuit |
| **Upload en pièce jointe** | ✅ Obligatoire pour fichiers longs (`index.html`, `tarifs.html`) |

### Scripts Python en bloc

Fournir un script Python à exécuter par Jérôme à la racine du repo `nomacast.fr` **UNIQUEMENT** si écrire le script coûte moins de ressources que d'appliquer les modifs directement :
- Cas typique : nombreux fichiers, pattern répétitif stable
- Sinon : modifier directement

**Règles pour les scripts** :
- stdlib uniquement
- Marqueurs idempotents (ex. `nomacast-floatcall-fix-v1`)
- Regex sur ancre stable
- Sortie console claire (✅/⏭/❌)

### Marqueurs idempotents — convention

Tout patch automatisé doit ancrer son marker dans un commentaire HTML/CSS détectable au prochain run :

```html
<!-- chat-interactif-nav-v1 -->
<!-- nomacast-video-preload-v2 -->
<!-- lot17-csp-fix -->
```

### Piège : obfuscation d'emails dans le chat

Lors de copier-coller depuis Claude.ai ou GitHub web, les emails littéraux comme `[email protected]` sont parfois obfusqués (anti-scraping) en `[email protected]`. 

**Solutions** :
- Concaténation : `'health' + '@' + 'nomacast.fr'`
- Faire télécharger le fichier brut sans copier-coller
- Utiliser des emails sans le pattern `<word>@<domain>`

---

## 8. Conventions de propagation

### Pairage de pages similaires

Toute modification structurelle sur l'une propagée à l'autre dans la même session :

| Pair | Type |
|---|---|
| `tarifs.html` ↔ `en/pricing.html` | FR/EN — Garde-fou obligatoire avant modif (voir RAPPORT-CONFIGURATEUR) |
| `corporate-event-filming.html` ↔ `corporate-video-production.html` | Landings EN simples — trust bar copiée mot pour mot |
| Toute page FR ↔ son équivalent EN | Cohérence bilingue |

### Audit anti-résidus avant livraison EN

`grep -i` sur stop-words FR fermés :
```
prestations, cas clients, agences, tarifs, devis,
appeler, matériel, propriété, expérience, fichier,
installation, voir les, configurer
```

Cross-check des liens internes : tous les `href` non-externes doivent pointer sur un fichier existant.

---

## 9. Conventions de référence

### Fichiers de configuration centraux

| Fichier | Rôle |
|---|---|
| `nomacast-config.json` | Single source of truth pour vidéos, logos, témoignages |
| `_headers` | Headers HTTP, CSP, Content-Type |
| `sitemap.xml` | 54 URLs (27 FR + 27 EN) + faq depuis LOT 36 |

### Schema.org

| Page | Schema.org |
|---|---|
| Toutes (`<head>`) | `WebSite`, `Organization` |
| Pages services | `Service` |
| Pages cas-clients | `Article` (avec `image` spécifique) |
| Pages FAQ et pages avec FAQ | `FAQPage` (HTML et JSON-LD synchronisés) |
| Home FR/EN | `knowsAbout` enrichi 17 entrées |
| Page admin `nmc-7k9q3p2x.html` | aucun (`noindex,nofollow,noarchive,nosnippet`) |

---

## 10. Auto-entrepreneur / juridique

| Élément | Valeur |
|---|---|
| Statut | Auto-entrepreneur EI |
| Nom | Jérôme Bouquillon |
| Adresse | 14 rue de l'Aubrac, 75012 Paris |
| SIRET | **PENDING** — toujours commenté `<!-- <p>SIRET ... -->` dans `mentions-legales.html` et `en/legal-notice.html` |
| Email pro | `evenement@nomacast.fr` (Google Workspace) |
| Hébergeur affiché | Cloudflare Inc. (San Francisco) + filiale RGPD Cloudflare Ireland Ltd (Dublin) |

---

## 11. Cohérence retenue (résumé décisionnel)

| Décision | Justification |
|---|---|
| Pas d'emojis Unicode | Identité visuelle non-IA |
| Numéros 01/02/03 sur cards | Pattern unifié, vu sur agences-partenaires |
| Outfit + Plus Jakarta Sans | Identité typographique, non négociable (refus `font-display: optional`) |
| "Paris · France · Europe" footer | SEO Paris + cohérence zone |
| "Devis sous 24h" CTA | Promesse claire et engageante |
| Pages services structure standardisée | Reproductibilité + lisibilité commerciale |
| Page hub `prestations.html` | Convention de menu : ancres uniquement sur index, page hub partout ailleurs |
| Parité FR/EN stricte | Évite les angles morts de traduction |
| Tarifs.html intouchable | Fragilité éprouvée (LOT 6 defer abandonné) |
| Modifications ciblées par fichier | Réduit risque de régression |
| Marqueurs idempotents | Patch ré-exécutable sans casser |

---

*État de référence pour les conventions éditoriales Nomacast au 14 mai 2026.*
