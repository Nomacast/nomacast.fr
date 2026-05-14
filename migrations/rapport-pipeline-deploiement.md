# Rapport : refonte du pipeline de déploiement Nomacast

**Date** : 14 mai 2026
**Périmètre** : `nomacast.fr` — site statique B2B live streaming
**Statut** : ✅ Mis en production

---

## 1. Problème initial

Le déploiement `nomacast.fr` souffrait d'instabilités chroniques côté Cloudflare Pages :

- Builds bloqués en statut **"queued"** ou **"Waiting for other builds to finish"** plusieurs fois par semaine
- Échecs récurrents en fin de pipeline avec un message vague : *"Deployment failed due to an internal error"*
- Nécessité régulière de nettoyer manuellement les builds zombies pour débloquer la file
- Plus de 40 runs accumulés visibles sur GitHub Actions au moment du diagnostic

**Cause racine identifiée :**

1. **Limite Cloudflare** : 3 builds concurrents par compte. Lorsque la synchronisation Google Drive → GitHub poussait plusieurs commits successifs (un par fichier modifié), la file de build s'engorgait rapidement.
2. **Builds zombies** : un build qui ne termine pas proprement laisse Cloudflare croire qu'un slot est toujours occupé, bloquant tous les builds suivants indéfiniment.
3. **Bug récurrent sur le publish des Functions** : erreur générique "Unknown internal error occurred" côté API Cloudflare lors de la publication des Pages Functions, surtout avec d'anciennes versions de wrangler.

---

## 2. Solution architecturale retenue

**Bypasser entièrement la file de build Cloudflare** en passant à un déploiement **Direct Upload via GitHub Actions**.

Le site étant 100% statique (pas de `npm build`, pas de framework), aucune raison d'utiliser le build runner de Cloudflare. Direct Upload upload directement les fichiers via l'API Cloudflare, sans passer par la file partagée.

### Comparaison avant / après

| Aspect | Avant | Après |
|---|---|---|
| Trigger du deploy | Push GitHub → build natif Cloudflare | Push GitHub → GitHub Actions → Direct Upload |
| File d'attente | Cloudflare (3 builds max, fragile) | Aucune (Direct Upload) |
| Concurrence | Builds qui s'empilent | `cancel-in-progress: true` : seul le dernier push importe |
| Commits par batch de modifs | N commits (1 par fichier) | 1 commit groupé via Git Trees API |
| Durée typique d'un deploy | 1-2 min (quand ça marchait) | ~30-45 s |
| Bug "Unknown internal error" | Présent (wrangler 3.x) | Résolu (wrangler 4.x) |
| Cache CDN après deploy | Manuel via dashboard | Automatique via curl API |

---

## 3. Composants mis en place

### 3.1. Workflow GitHub Actions

**Fichier** : `.github/workflows/deploy.yml`

Rôle : déclenche un déploiement Direct Upload sur chaque push à `main`, puis purge le cache Cloudflare.

```yaml
name: Deploy Nomacast

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    name: Deploy to Cloudflare Pages
    permissions:
      contents: read
      deployments: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          wranglerVersion: "4"
          command: pages deploy . --project-name=nomacast-fr --branch=main --commit-dirty=true

      - name: Purge Cloudflare cache
        if: success()
        run: |
          curl -X POST "https://api.cloudflare.com/client/v4/zones/${{ secrets.CLOUDFLARE_ZONE_ID }}/purge_cache" \
            -H "Authorization: Bearer ${{ secrets.CLOUDFLARE_API_TOKEN }}" \
            -H "Content-Type: application/json" \
            --data '{"purge_everything":true}'
```

**Points clés :**
- `wranglerVersion: "4"` est **obligatoire**. Wrangler 3.x déclenche le bug "Failed to publish your Function. Got error: Unknown internal error occurred". Wrangler 4 résout ce problème.
- Le `concurrency` annule tout deploy en cours dès qu'un nouveau push arrive, empêchant l'empilement.
- Le project Cloudflare s'appelle `nomacast-fr` (avec tiret), pas `nomacast`.
- Le step de purge ne s'exécute que si le deploy a réussi (`if: success()`).

### 3.2. Fichier d'exclusion Cloudflare

**Fichier** : `.assetsignore` à la racine du repo

Liste des fichiers à ne pas servir publiquement bien qu'ils soient dans le repo :

```
.github
*.py
README.md
CHANGELOG.md
.gitignore
.vscode
.idea
Thumbs.db
```

Note : Cloudflare Pages exclut déjà automatiquement `.git`, `node_modules`, `.DS_Store`. Le dossier `functions/` n'est pas exclu (détecté nativement par Pages comme Cloudflare Functions).

### 3.3. Script Apps Script v3 (sync Drive → GitHub)

**Évolution** : v2 (1 commit par fichier) → v3 (1 commit groupé pour N fichiers)

**Méthode** : utilisation de l'API Git Trees de GitHub à la place de l'API Contents :
1. Récupération du SHA HEAD de la branche
2. Création d'un blob par fichier modifié
3. Création d'un tree avec `base_tree` (conserve tout le reste de l'arborescence)
4. Création d'un commit pointant sur ce tree
5. Mise à jour de la ref `refs/heads/main`

**Bénéfices** :
- 1 commit groupé par batch de modifs au lieu de N commits successifs
- 1 deploy au lieu de N deploys cascadés
- 1 notification au lieu de N notifications
- Token GitHub sécurisé dans Script Properties (clé `GITHUB_TOKEN`), plus en dur dans le code

**Format des messages de commit :**
- 1 fichier modifié : `Drive sync: chemin/du/fichier.ext`
- N fichiers modifiés : `Drive sync: N fichiers` + liste des chemins en description

---

## 4. Configuration

### 4.1. Secrets GitHub repo `Nomacast/nomacast.fr`

| Nom | Source | Usage |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens | Auth pour wrangler deploy + purge cache |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → Overview sidebar droite | Identifie le compte Cloudflare |
| `CLOUDFLARE_ZONE_ID` | Cloudflare → zone nomacast.fr → Overview sidebar | Identifie la zone DNS pour purge cache |

### 4.2. Permissions du token Cloudflare

Le token API Cloudflare doit avoir :
- **Cloudflare Pages : Edit** (ou Workers: Edit, qui couvre Pages)
- **Zone : Cache Purge : Purge** sur la zone `nomacast.fr`

### 4.3. Script Properties Apps Script

| Property | Value |
|---|---|
| `GITHUB_TOKEN` | Token PAT GitHub avec scope `repo` |
| `FILE_STATES` | JSON auto-géré par le script (state per-file) |

### 4.4. Dashboard Cloudflare Pages

Dans **Workers & Pages → nomacast-fr → Settings → Builds → Branch control** :
- **Production branch deployments** : ❌ désactivé
- **Preview branches** : None

Cette désactivation est cruciale pour éviter qu'un build natif Cloudflare se déclenche en parallèle du workflow GitHub Actions.

---

## 5. Fonctionnement au quotidien

### 5.1. Workflow utilisateur

1. Modification d'un ou plusieurs fichiers dans `G:\Mon Drive\NOMACAST\`
2. Google Drive Desktop synchronise les modifications vers le cloud (quelques secondes)
3. Trigger Apps Script horaire (toutes les minutes) détecte les modifications via le state per-file
4. Si modifications détectées : création d'un commit groupé sur `main` via Git Trees API
5. GitHub Actions détecte le push, lance le workflow `Deploy Nomacast`
6. wrangler v4 fait un Direct Upload vers Cloudflare Pages (Functions incluses)
7. Curl API purge le cache CDN
8. Site à jour sur `https://nomacast.fr`

**Durée totale typique** : ~1-2 minutes entre la sauvegarde dans Drive et la mise en ligne.

### 5.2. Cas du burst de modifications

Si plusieurs fichiers sont modifiés en rapide succession :

- **Apps Script v3** : un seul commit est créé pour l'ensemble (au prochain tick du trigger)
- **Si plusieurs commits arrivent quand même** (par exemple : modifs étalées sur plusieurs minutes) : le `concurrency: cancel-in-progress` annule les deploys en cours et ne garde que le dernier
- **Résultat** : peu importe combien de commits arrivent en rafale, un seul deploy aboutit, avec l'état final du repo

---

## 6. Pièges rencontrés et leçons retenues

### 6.1. Nom du projet Cloudflare

Le projet s'appelle `nomacast-fr` (avec tiret), pas `nomacast`. Erreur `Project not found [code: 8000007]` si on confond.

### 6.2. Wrangler version

Wrangler 3.x déclenche un bug Cloudflare au moment du publish des Functions : `Failed to publish your Function. Got error: Unknown internal error occurred`. Spécifier `wranglerVersion: "4"` dans le workflow règle le problème.

### 6.3. Google Drive ne gère pas les fichiers/dossiers cachés

Drive Desktop ignore les noms commençant par `.` (point). Conséquence : impossible de créer `.github/workflows/deploy.yml` ou `.assetsignore` via Drive. Il faut passer par l'interface web GitHub pour ces fichiers spécifiques.

### 6.4. Token GitHub à stocker dans Script Properties

Mettre le token en dur dans le code Apps Script est un risque sécurité (le code peut être partagé, et un copier-coller dans un chat expose le token).

Solution : `PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN')`. Le token reste accessible au script mais n'apparaît plus dans le code source.

Piège secondaire : l'UI Apps Script a deux boutons distincts pour les Script Properties (un "Add" et un "Save" final). Oublier le Save final fait perdre la propriété sans avertissement.

### 6.5. Notifications "Cancelled" en cascade

Avec `cancel-in-progress: true`, chaque burst de pushes génère plusieurs runs cancelled avant un run succeeded final. C'est **le comportement voulu** et le signe que l'anti-queue fonctionne. La notif "succeeded" finale est la seule qui compte vraiment.

### 6.6. Durée trompeuse affichée dans GitHub Actions

La durée affichée dans la liste des workflow runs inclut le temps passé en queue avant qu'un runner soit attribué. Pendant la phase de migration où l'ancien script v2 avait généré 40+ runs, certains affichaient 5+ minutes alors que le deploy lui-même prenait 32 secondes. La durée d'exécution réelle est visible en cliquant sur le run et en regardant chaque step individuellement.

---

## 7. Bénéfices mesurés

- ✅ **Zéro intervention manuelle** pour débloquer des builds queued
- ✅ **Temps de déploiement divisé par 2-3** (~30-45 s vs 1-2 min en moyenne)
- ✅ **N commits → 1 commit** quand plusieurs fichiers sont modifiés simultanément
- ✅ **Cache CDN purgé automatiquement** à chaque deploy réussi
- ✅ **Token GitHub sécurisé** (plus en dur dans le code source)
- ✅ **Logs accessibles** dans l'onglet Actions GitHub avec détail par step
- ✅ **Notifications natives** GitHub Mobile possibles pour suivre les deploys

---

## 8. Points d'attention pour la suite

- **Surveiller occasionnellement** l'onglet Actions GitHub pour repérer un échec récurrent qui passerait inaperçu
- **Renouveler le token GitHub** si une expiration a été configurée (à vérifier dans `github.com/settings/tokens`)
- **Tester l'impact si Cloudflare modifie son API** : un upgrade de wrangler-action ou wrangler peut nécessiter d'ajuster le `wranglerVersion`
- **Le `.assetsignore` doit rester à jour** si de nouveaux fichiers sensibles sont ajoutés au repo (clés API en clair, scripts internes, etc.)
- **Apps Script a une limite d'exécution de 6 minutes** par run : si la taille du Drive ou le nombre de fichiers modifiés en un batch devient très important, prévoir une pagination

---

## 9. Documents et fichiers associés

| Fichier | Emplacement | Rôle |
|---|---|---|
| `deploy.yml` | `.github/workflows/` | Pipeline GitHub Actions |
| `.assetsignore` | racine du repo | Exclusions Direct Upload |
| `drive-to-github-sync.gs` | Google Apps Script `Nomacast Drive Sync` | Sync Drive → GitHub v3 |

---

*Pipeline opérationnel et stable depuis le 14 mai 2026.*
