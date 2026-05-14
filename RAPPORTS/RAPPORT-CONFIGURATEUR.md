# Rapport : configurateur tarifs (tarifs.html / pricing.html)

**Date** : 14 mai 2026
**Périmètre** : simulateur de devis interactif, codes partenaires, back-office admin, add-ons

---

## 1. Vue d'ensemble

| Élément | Valeur |
|---|---|
| Pages | `tarifs.html` (FR) et `en/pricing.html` (EN) |
| Rôle | Simulateur tarifaire interactif servant lui-même de formulaire de conversion |
| **Statut critique** | **FRAGILE — ne pas modifier sans garde-fou** |
| Tarif plancher | 1 500 € HT (point d'entrée) |

### Pourquoi ces deux pages sont à part

- Le formulaire **est** le simulateur (pas de CTA "Devis sous 24h" séparé : le formulaire-simulateur est lui-même le mécanisme de conversion)
- Le footer y est en 3 colonnes (pas 4) — section "Agences" volontairement absente
- Toute modif structurelle propagée à la fois sur FR et EN dans la même session (parité stricte)

⚠️ **Règle absolue** : interdit de modifier `tarifs.html` ou `en/pricing.html` (la décision LOT 6 "defer configurateur" a été définitivement abandonnée). Si une modif est inévitable :
1. Vérifier la présence des marqueurs structurels (`grep -c "data-addon=\"photographe\"" tarifs.html` et `grep -c "class=\"tech-banner\"" tarifs.html` doivent retourner 1)
2. Le timestamp DOCTYPE seul **ne garantit pas** l'intégrité du contenu

---

## 2. Architecture du configurateur

### Steps actuels (5 étapes)

| Step | Contenu |
|---|---|
| 01 | Type d'événement / configuration de base |
| 02 | Durée |
| **Bandeau "Vue technique"** | Toggle global (entre Step 02 et Step 03) — voir §5 |
| 03 | Options techniques |
| 04 | Add-ons post-événement (Best-of / Interviews / Photographe) |
| 05 | Coordonnées + envoi |

### Toggle HT/TTC (fix 07/05)

- Fonction `shown(ht)` : retourne `Math.round(ht * TVA)` quand `state.ttc === true`
- Appelée à 3 endroits clés (L2075, L2077, L2138 — initialisation et refresh des prix)
- Event listener du toggle TTC (L2359) appelle déjà `render()`

**Données HT volontairement préservées** :
- L2395, L2398 : texte récapitulatif copy-paste avec mention explicite "HT"
- L2422-2425 : hidden fields (`h-cfg-options`, `h-cfg-addons`, `h-cfg-total`) envoyés au formulaire et back-office en HT (facturation)

---

## 3. Codes partenaires — architecture KV (07/05)

### Évolution

| Date | État | Stockage |
|---|---|---|
| 06/05 (matin) | Codes en clair dans `tarifs.html` (objet `PARTNER_CODES`) | HTML servi |
| 06/05 (soir) | Migration en Pages Function `/api/validate-code` + variable d'env `PARTNER_CODES_JSON` | Cloudflare Pages env var Plaintext |
| 07/05 | Ajout code DIXXIT (22e code) | Procédure variable d'env |
| **07/05 (refonte)** | **Migration KV + tokens opaques + back-office HTML** | **Cloudflare KV namespace `nomacast_partners`** |

### Pourquoi la refonte

Avant : codes partenaires lisibles dans l'URL (`?code=FIGMA`) → un visiteur pouvait deviner les codes en testant des noms (Sodexo, Brainsonic) et constater l'existence de remises pour eux.

### Architecture finale (Option B)

**Stockage Cloudflare KV** :
- Namespace : `nomacast_partners` (ID `8a26bab4f86e41b2a9e490981b9b9aa1`)
- Binding dans Pages : `PARTNERS`
- Une seule clé : `data`

```json
{
  "tokens": { "token_opaque": "CODE" },
  "codes": {
    "CODE": {
      "displayName": "Figma",
      "type": "...",
      "active": true,
      "durations": [...],
      "forceOptions": [...],
      "discountTiers": [...],
      "description": "...",
      "createdAt": "..."
    }
  }
}
```

Modifications **instantanées** (pas de redéploiement nécessaire).

### Tokens opaques

- 6 caractères
- Alphabet `abcdefghjkmnpqrstuvwxyz23456789` (sans `i`, `l`, `o`, `0`, `1` pour éviter confusion)
- 36 milliards de combinaisons théoriques
- URL : `?p=e52vnc` au lieu de `?code=FIGMA`

### Endpoint `/api/validate-code`

- Lit dans KV
- Header `Cache-Control: no-store` (empêche divination par cache CDN)
- **Rétro-compat indéfinie** pour anciens liens `?code=NOMCODE` (décision Jérôme, aucun partenaire externe à prévenir)
- Validation regex serveur historique : `/^[A-Z0-9]{2,30}$/` (majuscules + chiffres, 2-30 caractères, pas de tirets ni underscore)

---

## 4. Back-office admin

| Élément | Valeur |
|---|---|
| URL HTML | `nmc-7k9q3p2x.html` (slug obfusqué) |
| API | `functions/nmc-7k9q3p2x/api/partners.js` (CRUD) |
| Robots | `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">` |
| Présence dans `robots.txt` | **AUCUNE** (ce serait révéler le slug) |
| Authentification | **Aucune** — protégée uniquement par l'obscurité de l'URL |

### Procédure en cas de fuite suspectée

Changer le slug :
1. Renommer la page HTML
2. Renommer le dossier `functions/nmc-7k9q3p2x/`
3. Mettre à jour les références internes

Acceptable pour un compte solo.

### Règles d'usage

- **Modifications de configuration partenaire** (display name, type, statut actif) : passer par l'admin, jamais éditer le KV à la main sauf cas exceptionnel
- **KV est le système de stockage de référence** pour toute donnée modifiable à la volée. Plus jamais de variable d'env nécessitant un redéploiement

---

## 5. Add-ons post-événement (3) — 07/05

3 add-ons calculés **hors mécanique partenaire** (pas de remise grille A, pas de charm, pas d'absorption) :

### Best-of monté
Inclus dans le périmètre standard.

### Interviews
Inclus dans le périmètre standard.

### Photographe événementiel (ajouté 07/05)

- `state.addons.photographe = false` (default)
- Tarifs `ADDON_PRICES.photographe` :

| Format | Prix HT |
|---|---|
| Demi-journée | 1 150 € (= jour entier, livrable identique) |
| Jour | 1 150 € |
| 2 jours | 1 750 € |
| 3 jours | 2 350 € |

Logique : +600 €/jour additionnel.

**Matériel** (`ADDON_MATERIEL.photographe`) : 1× Canon EOS 5D Mark IV ou équivalent, 3× objectifs, édition, livraison J+1/J+2 via weblink de 100+ photographies.

### Refactor tracking GA4 (07/05)

`buildAddons()` refactoré : `forEach` sur les 3 add-ons, tracking GA4 en map `addonLabels` + lookup générique `ADDON_PRICES[addonId]` (au lieu de ternaires en cascade). **Pattern à reproduire** pour tout futur add-on.

---

## 6. Bandeau "Vue technique" (07/05)

Avant : `<label class="tech-switch">` planqué en bas de Step 02.
Après : `<label class="tech-banner">` dark inversé sans icône, inséré **entre Step 02 et Step 03** (3e enfant de `.steps`).

### Wording

| Lang | Titre | Description |
|---|---|---|
| FR | `Voir le matériel inclus` | `Micros, trépieds, ordinateur, câblage… le matériel technique prévu pour chaque partie du dispositif.` |
| EN | `See included equipment` | `Mics, tripods, computer, cabling… the technical kit included for every part of your setup.` |

### Implémentation

- `id="tech-switch"` conservé sur l'input pour préserver les références JS (`setTechMode()`, listener `change`, auto-activation agence)
- CSS : background slate dark `linear-gradient(135deg, #1a2332, #0f1825)`, bordure cyan fine, glow radial cyan en haut-gauche via `::before`
- Animation chain `.steps` à 5 enfants : bandeau hérite `.16s`, Step 03 → `.24s` (nth-child(4)), Step 04 → `.32s` (nth-child(5))

### Pourquoi entre Step 02 et Step 03

- Ce n'est **pas** une option configurable, c'est un mode d'affichage global
- Le mettre dans sa propre carte le rend visible immédiatement sans le confondre avec les options techniques
- Design dark inversé sans icône : sur page blanche avec déjà des accents cyan (CTA "Recevoir mon devis", duration cards actives, options actives), un 3e élément cyan diluerait la hiérarchie

---

## 7. Décisions techniques actées (récap)

| Décision | Justification |
|---|---|
| 3 add-ons hors mécanique partenaire | Pas de remise grille A, pas de charm, pas d'absorption |
| Photographe demi-journée = jour entier | Livrable identique : 100+ photos éditées, livraison J+1/J+2 |
| Tokens opaques 6 chars sans caractères ambigus | Suffisant pour le périmètre (quelques dizaines de partenaires) |
| Page admin protégée par obscurité de l'URL | Acceptable compte solo, slug changeable si fuite |
| Rétro-compat indéfinie `?code=NOMCODE` | Aucun partenaire externe à prévenir |
| KV = stockage de référence | Plus jamais de variable d'env nécessitant redéploiement |
| Parité FR/EN stricte | Toute modif structurelle propagée aux deux dans la même session |
| Garde-fou anti-régression | Vérifier marqueurs `data-addon="photographe"` et `class="tech-banner"` avant édition |
| Variable d'env `PARTNER_CODES_JSON` obsolète | Suppression du dashboard Cloudflare possible après validation conditions réelles |

---

## 8. Fichiers liés

| Fichier | Rôle |
|---|---|
| `tarifs.html` | Simulateur FR (gros fichier, demander upload en pièce jointe si modif nécessaire — non accessible via raw GitHub au-delà de ~1000 lignes) |
| `en/pricing.html` | Simulateur EN |
| `functions/api/validate-code.js` | Validation des codes/tokens depuis KV |
| `functions/nmc-7k9q3p2x/api/partners.js` | API CRUD admin |
| `nmc-7k9q3p2x.html` | Interface admin (slug obfusqué) |

---

*État de référence pour le configurateur tarifs au 14 mai 2026.*
