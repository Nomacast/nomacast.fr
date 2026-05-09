const TVA = 1.20;
const PLATFORMS = ["YouTube","LinkedIn","Facebook","Twitch","Vimeo","Teams","Zoom","RTMP custom","Autre"];

// Codes partenaires : récupérés à la volée via /api/validate-code (Pages Function Cloudflare)
// L'objet est peuplé dynamiquement après validation côté serveur, jamais en clair dans le HTML.
const PARTNER_CODES = {};
// Cache des display names jolis (renvoyés par l'API), indexé par code interne
const PARTNER_DISPLAY_NAMES = {};

const CONFIG = {
  base: 1500,
  durations: {
    half:    { price: 1500, label: "Demi-journée", joursEq: 1 },
    full:    { price: 1750, label: "Journée",      joursEq: 1 },
    "2days": { price: 2500, label: "2 jours",      joursEq: 2 },
    "3days": { price: 3250, label: "3 jours",      joursEq: 3 }
  }
};

// Multiplicateur de remise par durée, basé sur le delta entre tarif "plein" (1750/jour) et base réelle.
// Sur demi-journée et journée : pas de delta, mult = 1.0.
// Sur 2 jours : (1750 × 2) / 2500 = 1.4. Sur 3 jours : (1750 × 3) / 3250 ≈ 1.615.
// Effet : la remise effective est plus généreuse sur les multi-jours, exponentielle avec la durée.
const REMISE_MULT = {
  half:   1.0,
  full:   1.0,
  "2days": (1750 * 2) / 2500,
  "3days": (1750 * 3) / 3250
};

// Économie dégressive : delta entre tarif "plein" (1750 € / jour) et la base réelle facturée.
// Cette remise est implicite dans le tarif dégressif (le client la paie déjà via la base réduite),
// mais on la rend visible dans le bandeau "Remise tarif partenaire" pour matérialiser la générosité
// du tarif multi-jours. Affichée uniquement quand un code partenaire est actif.
//   - Demi-journée : 0 (pas de notion de jour entier)
//   - Journée : 0 (1 750 € facturé pour 1 jour, pas de delta)
//   - 2 jours : 1 750 × 2 - 2 500 = 1 000 €
//   - 3 jours : 1 750 × 3 - 3 250 = 2 000 €
const DEGRESSIF_SAVINGS = {
  half: 0,
  full: 0,
  "2days": 1750 * 2 - 2500,
  "3days": 1750 * 3 - 3250
};

// Liste des options proposées par le configurateur. dayMultiplied = prix multiplié selon la durée.
// dayMultiplied : prix ×1.6 sur 2j, ×2.1 sur 3j+ (tarif dégressif)
// 5g et cadreur_hf ont leur propre grille de prix par durée (PRICE_5G_BY_DUR / PRICE_CADREUR_HF_BY_DUR)
const OPTIONS = [
  { id:"stream",     label:"Diffusion en direct",                desc:"Vers une ou plusieurs plateformes au choix : YouTube, LinkedIn, Teams, Zoom…",  price:250, platforms:true },
  { id:"son",        label:"Pack sonorisation",                  desc:"Si votre salle n'est pas sonorisée : technicien son, micros HF et enceinte",   price:750, dayMultiplied:true },
  { id:"duplex",     label:"Intervenant à distance",             desc:"Un participant qui n'est pas sur place se joint en visio HD, intégré directement à l'image", price:250, montageH:3 },
  { id:"reperage",   label:"Repérage du lieu",                   desc:"Visite technique avant l'événement pour anticiper les contraintes (lumière, son, accès, électricité)", price:350 },
  { id:"veille",     label:"Installation la veille",             desc:"Montage la veille au soir pour démarrer le jour J en toute tranquillité. Tarif Île-de-France, province et international au devis.",  price:650 },
  { id:"cam_sup",    label:"Caméra supplémentaire",              desc:"Pour filmer le public, les réactions de salle, ou un second espace (networking, atelier…)", price:250, dayMultiplied:true, montageH:3 },
  { id:"lumiere",    label:"Pack lumière",                       desc:"Pour une mise en lumière haute qualité de vos intervenants et du décor : technicien lumière dédié, projecteurs et habillage scène",   price:750, dayMultiplied:true },
  { id:"ecran",      label:"Écran de retour pour les intervenants", desc:"L'intervenant voit ce qui est diffusé en direct (utile pour suivre ses slides ou voir les invités à distance)", price:150, dayMultiplied:true, montageH:3 },
  { id:"rush4k",     label:"Fichiers caméras bruts (rushs 4K)",  desc:"Tous les fichiers vidéo originaux de chaque caméra, livrés sur disque. Utile si vous comptez retravailler le contenu.", price:250 },
  { id:"5g",         label:"Connexion 5G de secours",            desc:"Réseau internet autonome pour fiabiliser le streaming si le wifi du lieu est insuffisant ou peu fiable", price:350, montageH:3 },
  { id:"montage_tc", label:"Montage par chapitres",              desc:"Découpage de la vidéo finale selon les moments-clés que vous indiquez (minutages précis)", price:300 },
  { id:"cadreur_hf", label:"Caméra avec cadreur (liaison sans fil)", desc:"Un cadreur professionnel équipé d'une caméra sans fil, pour suivre l'action en mouvement : filmer le public, les intervenants qui se déplacent dans la salle, ou un second espace en parallèle (networking, atelier, backstage).", price:850, outsidePartner:true, montageH:3 }
];

// Grilles de prix dégressifs par durée pour les options qui ne suivent pas le multiplicateur standard.
// 5G : prix linéaire dégressif (le routeur est partagé, seuls les forfaits data prorata s'ajoutent).
const PRICE_5G_BY_DUR       = { half: 350, full: 350, "2days": 500, "3days": 650 };
// Cadreur HF : 850 €/jour linéaire pur (pas de dégressivité, le cadreur freelance facture sa journée).
const PRICE_CADREUR_HF_BY_DUR = { half: 850, full: 850, "2days": 1700, "3days": 2550 };

// ═══ Contenus post-événement — Step 04 ═══
// Hors mécanique partenaire : tarif fixe, ajouté tel quel au total.
// Best-of varie selon la durée de l'événement (montage proportionnel à la matière tournée).
const ADDON_PRICES = {
  bestof: { half: 1150, full: 1150, "2days": 1650, "3days": 2150 },
  interviews: 300,
  photographe: { half: 1150, full: 1150, "2days": 1750, "3days": 2350 }
};

// Détail technique du matériel pour les add-ons, affiché dans la "Vue technique"
const ADDON_MATERIEL = {
  bestof: [
    "1× Réalisateur/monteur dédié sur place",
    "1× Caméra Panasonic GH5",
    "1× Stabilisateur DJI RS3",
    "1× Micro cravate Rode",
    "1× Torche lumière",
    "Montage 2 jours · Habillage en sus/fourni par le client",
    "Livraison de 1 vidéo Full HD à J+2",
    "Sous-titrage VO inclus"
  ],
  interviews: [
    "Captation au matériel déjà installé pour l'événement principal",
    "1× Micro cravate inclus",
    "Jusqu'à 3 interviews",
    "Montage léger inclus (cuts, raccord, étalonnage de base)",
    "Livraison J+1 en Full HD"
  ],
  photographe: [
    "1× Canon EOS 5D Mark IV ou équivalent",
    "3× objectifs",
    "Édition",
    "Livraison J+1/J+2 via weblink de 100+ photographies"
  ]
};

// Détail technique des matériels par option, affiché dans la "Vue technique" déroulable
// quand l'option est cochée ou forcée par un code partenaire.
const OPTION_MATERIEL = {
  stream: [
    "Configuration multi-RTMP (jusqu'à 5 plateformes simultanées)"
  ],
  son: [
    "1× Technicien son",
    "1× Console multipiste",
    "4× Micros HF (mains ou serre-tête)"
  ],
  lumiere: [
    "1× Technicien lumière",
    "2× Aputure 300x",
    "2× Trépieds 2m"
  ],
  reperage: [
    "Visite technique sur site (1/2 journée)",
    "Plan de tournage adapté au lieu"
  ],
  duplex: [
    "Logiciel de visioconférence intégré à la régie",
    "Latence < 200ms",
    "Envoi du son de l'intervenant via enceinte dédiée"
  ],
  veille: [
    "Montage du plateau la veille au soir",
    "Tests complets en conditions réelles",
    "Plateau prêt pour démarrage immédiat le jour J",
    "Filage sur demande"
  ],
  cam_sup: [
    "1× Caméra Panasonic CX350 4K (ou équivalent)",
    "1× Trépied vidéo"
  ],
  rush4k: [
    "Fichiers natifs 4K de chaque caméra (XF-AVC / MP4 H.264)",
    "Disque dur SSD remis le jour même"
  ],
  ecran: [
    "1× Écran retour 24 pouces sur pied",
    "Câble vidéo dédié + alimentation"
  ],
  "5g": [
    "1× Routeur 5G d'agrégation multi-opérateurs",
    "Bonding cellulaire (Orange + SFR + Bouygues + Free)",
    "Bande passante dédiée jusqu'à 200 Mb/s upload"
  ],
  montage_tc: [
    "Montage des fichiers selon timecodes fournis",
    "Export en Full HD MP4 H.264",
    "1 aller-retour de modification inclus"
  ],
  cadreur_hf: [
    "1× Cadreur freelance senior dédié",
    "1× Caméra Blackmagic 4K (ou équivalent)",
    "1× Émetteur/récepteur HF HDMI/SDI",
    "1× Trépied vidéo"
  ]
};

// Affiche/masque le détail du matériel directement sous chaque option cochée (ou forcée par un partenaire).
// Le bloc s'insère dans la ligne option elle-même, juste sous la description, quand l'option est active.
function refreshTechOptions() {
  const partnerCode = state.partnerCode ? PARTNER_CODES[state.partnerCode] : null;
  const forcedSet = new Set(partnerCode ? partnerCode.forceOptions : []);
  OPTIONS.forEach(opt => {
    const row = document.querySelector('.option[data-id="'+opt.id+'"]');
    if (!row) return;
    const isActive = state.options[opt.id] || forcedSet.has(opt.id);
    let materialBlock = row.querySelector(".option-material");
    if (isActive && OPTION_MATERIEL[opt.id]) {
      if (!materialBlock) {
        materialBlock = document.createElement("div");
        materialBlock.className = "option-material";
        // Insère après option-label (qui contient label + desc + plateformes)
        const labelEl = row.querySelector(".option-label");
        if (labelEl) labelEl.appendChild(materialBlock);
      }
      materialBlock.innerHTML = '<div class="option-material-title">Matériel inclus</div>' +
        '<ul class="option-material-list">' +
        OPTION_MATERIEL[opt.id].map(m => "<li>" + m + "</li>").join("") +
        '</ul>';
    } else if (materialBlock) {
      materialBlock.remove();
    }
  });
}

const state = { event:"conference", duration:"half", options:{}, addons:{ bestof:false, interviews:false, photographe:false }, ttc:false, partnerCode:null, partnerDisplayName:null, platforms:[], isAgence:false, activationOrder:[] };
const fmt = n => Math.round(n).toLocaleString("fr-FR");
const shown = ht => state.ttc ? Math.round(ht * TVA) : Math.round(ht);

function getDurPrice(durKey) {
  const stdPrice = CONFIG.durations[durKey].price;
  if (!state.partnerCode) return stdPrice;
  const code = PARTNER_CODES[state.partnerCode];
  // Prix explicite défini par le code partenaire pour cette durée
  if (code.durations && code.durations[durKey] != null) {
    return code.durations[durKey];
  }
  return stdPrice;
}

// Multiplicateur de prix pour les options dayMultiplied selon la durée.
// Tarif dégressif agressif : le 2e jour coûte 60% du 1er, le 3e jour coûte 50%.
// Total cumulé : 1j=1.0, 2j=1.6, 3j+=2.1 (au lieu de 1, 2, 3 en plein tarif).
function getDayMult(durKey) {
  if (durKey === "2days") return 1.6;
  if (durKey === "3days") return 2.1;
  return 1;
}

// Calcul du temps de montage estimé sur site (en heures), basé sur la combinaison d'options.
// Logique :
//   - Base : 2h
//   - +1h si "Intervenant à distance" coché (toujours, cumulable)
//   - +1h si 1 ou 2 dans le groupe {Pack lumière, Écran retour, Connexion 5G} cochés
//   - +2h si les 3 du groupe sont cochés (saturation logistique)
//   - Pack sonorisation : 0h (technicien dédié qui travaille en parallèle)
//   - Caméra supplémentaire : 0h (montage rapide)
//   - Plafond global : 4h max sur site
function getMontageH() {
  let h = 2; // base
  // Intervenant à distance : toujours +1h, cumulable
  if (state.options.duplex) h += 1;
  // Groupe lumière/écran/5G : +1h pour 1 ou 2 cochés, +2h si les 3
  const groupCount = (state.options.lumiere ? 1 : 0)
                   + (state.options.ecran ? 1 : 0)
                   + (state.options["5g"] ? 1 : 0);
  if (groupCount === 3) h += 2;
  else if (groupCount >= 1) h += 1;
  // Plafond global à 4h
  return Math.min(h, 4);
}

// Calcule la remise comptable totale du tarif partenaire pour affichage dans le bandeau :
//   - Valeur catalogue des options forcées effectivement cochées (= ce qui est offert au client)
//   - + Remise forfaitaire effective appliquée (Grille A, plafonnée par le plancher de marge)
//   - + Remise son↔duplex de 250 € si Pack sonorisation est réduit (bundle son↔duplex actif)
function getPartnerSavings() {
  if (!state.partnerCode) return 0;
  const code = PARTNER_CODES[state.partnerCode];
  const dayMult = getDayMult(state.duration);
  // Partie 1 : valeur des options forcées effectivement cochées
  let total = 0;
  code.forceOptions.forEach(id => {
    if (!state.options[id]) return;
    const opt = OPTIONS.find(o => o.id === id);
    if (!opt) return;
    // Calcul du prix plein selon l'option (mêmes règles que computeNaive)
    if (id === "5g") total += PRICE_5G_BY_DUR[state.duration];
    else if (opt.dayMultiplied) total += Math.round(opt.price * dayMult);
    else total += opt.price;
  });
  // Partie 2 : remise forfaitaire effective déjà calculée par compute()
  const r = compute();
  total += r.partnerDiscount || 0;
  // Partie 3 : remise son↔duplex (Pack son passé de 750 à 500 € via bundle)
  const sonDuplex = getSonDuplexLogic();
  if (state.options.son && sonDuplex.sonPrice !== null) {
    total += 250;
  }
  return total;
}

// Logique conditionnelle son ↔ duplex (Pack sonorisation et Intervenant à distance)
// Trois cas pour les options actives, plus deux cas d'anticipation pour signaler la promesse au visiteur :
//   1. son seul coché → duplex AFFICHÉ comme Offert (anticipation : ajouter duplex sera gratuit)
//   2. duplex seul coché → son AFFICHÉ avec prix barré 750→500 (anticipation : ajouter son coûtera 500)
//   3. son + duplex selon l'ordre d'activation :
//      - Si son a été coché AVANT duplex : son 750 € + duplex OFFERT (bundle classique)
//      - Si duplex a été coché AVANT son : duplex 250 € + son 500 € (remise pour mutualisation)
// L'ordre est mémorisé via state.activationOrder qui contient ['son','duplex'] ou ['duplex','son']
// quand les 2 sont actifs. On le met à jour à chaque toggle.
function getSonDuplexLogic() {
  const sonActive = !!state.options.son;
  const duplexActive = !!state.options.duplex;
  if (!sonActive && !duplexActive) return { sonPrice: null, duplexFree: false };
  // Son coché seul : on affiche déjà la promesse que duplex sera Offert (incentive bundle)
  if (sonActive && !duplexActive) return { sonPrice: null, duplexFree: true };
  // Duplex coché seul : on affiche déjà la promesse de remise sur Pack son (incentive bundle)
  if (!sonActive && duplexActive) return { sonPrice: 500, duplexFree: false };
  // Les 2 actifs : on regarde l'ordre
  const order = state.activationOrder || [];
  const sonIdx = order.indexOf("son");
  const duplexIdx = order.indexOf("duplex");
  // Si son est marqué avant duplex dans l'ordre → bundle classique (duplex offert)
  if (sonIdx !== -1 && duplexIdx !== -1 && sonIdx < duplexIdx) {
    return { sonPrice: null, duplexFree: true };
  }
  // Si duplex est marqué avant son → remise sur son (500€ par jour au lieu de 750€)
  return { sonPrice: 500, duplexFree: false };
}

// Calcule la remise forfaitaire applicable selon les paliers du code partenaire.
// Le seuil est calculé sur le total HT HORS Pack sonorisation, HORS Intervenant à distance, HORS Cadreur HF.
//   - son exclu : pour concentrer la remise sur les options à coût marginal nul
//   - duplex exclu : pour neutraliser l'ordre du bundle son↔duplex (rendre le calcul chemin-indépendant)
//   - cadreur_hf exclu : option hors mécanique partenaire (s'ajoute après le plafond)
// Le palier le plus bas requiert "au moins 1 option payante cochée" (≥1 option non offerte).
// Le montant de la remise est ensuite multiplié par REMISE_MULT[duration] pour rendre la remise
// exponentielle avec la durée (×1.0 demi-j et journée, ×1.4 sur 2j, ×1.615 sur 3j).
// Renvoie { amount, plancher, charmAllowed } : montant de remise + plancher de marge à respecter.
function getPartnerDiscount(baseHT, optsLines) {
  const code = state.partnerCode ? PARTNER_CODES[state.partnerCode] : null;
  if (!code || !code.discountTiers) return { amount: 0, plancher: 0, charmAllowed: false };
  let htHorsExclus = baseHT;
  let nbOptionsPayantes = 0;
  optsLines.forEach(ln => {
    if (ln.outsidePartner) return;        // cadreur_hf : hors mécanique partenaire
    if (ln.isForcedByPartner) return;     // forced (reperage, veille, 5g, montage_tc) : pas comptés
    // À ce stade : option payante OU duplex offert par bundle son+duplex.
    // Dans tous les cas, le client a coché la case → compte dans nb_payantes.
    nbOptionsPayantes++;
    if (ln.id === "son") return;          // exclu de htHorsExclus uniquement
    if (ln.id === "duplex") return;       // exclu de htHorsExclus uniquement
    htHorsExclus += ln.price;
  });
  // RÈGLE : si aucune option payante n'est cochée, AUCUN palier de remise ne s'applique.
  // Le client paie la base + addons + cadreur HF sans remise grille A. Pas de charm non plus.
  if (nbOptionsPayantes === 0) {
    const MARGE_MIN_NULL = { half: 1500, full: 1500, "2days": 2000, "3days": 3000 };
    let plancherNull = MARGE_MIN_NULL[state.duration] || 1500;
    if (state.options.lumiere) plancherNull += 400;
    if (state.options.son)     plancherNull += 550;
    return { amount: 0, plancher: plancherNull, charmAllowed: false };
  }
  // Trouver le palier le plus haut atteint
  // Conditions sur les paliers :
  //   - Au moins 1 option payante cochée (vérifié plus haut, sinon return amount=0)
  //   - charmAllowed : si true, le palier autorise le charm pricing en plus de la remise grille A
  const hasMarginOption = !!(state.options.son || state.options.lumiere);
  let amount = 0;
  let charmAllowed = false;
  for (let i = code.discountTiers.length - 1; i >= 0; i--) {
    const tier = code.discountTiers[i];
    if (htHorsExclus >= tier.minHT) {
      if (tier.requiresMarginOption && !hasMarginOption) continue;
      amount = tier.amount;
      charmAllowed = !!tier.charmAllowed;
      break;
    }
  }
  // Multiplicateur de remise par durée + arrondi au-dessus à la tranche de 5 €.
  // Exemple : 150 × 1.4 = 210 €. 150 × 1.615 = 242,25 → arrondi à 245 €.
  amount = Math.ceil(amount * (REMISE_MULT[state.duration] || 1) / 5) * 5;
  // Plancher de marge : marge nette minimum + coûts réels des packs
  // Voir CHANGELOG.md, section "Plancher de rentabilité personnel" et "Coûts internes (sous-traitance)"
  const MARGE_MIN = { half: 1500, full: 1500, "2days": 2000, "3days": 3000 };
  const COSTS = {
    lumiere: { half: 400, full: 400, "2days": 800, "3days": 1200 },
    son:     { half: 550, full: 550, "2days": 825, "3days": 1237.5 }
  };
  let plancher = MARGE_MIN[state.duration] || 1500;
  if (state.options.lumiere) plancher += COSTS.lumiere[state.duration] || 400;
  if (state.options.son)     plancher += COSTS.son[state.duration]     || 550;
  return { amount, plancher, charmAllowed };
}

// ═══ MOTEUR DE CALCUL ═════════════════════════════════════════════════════════
// Architecture en deux étages :
//   1. computeNaive(stateOverride) : calcul "brut" pour un panier donné. Pure fonction du panier,
//      sans aucune mémoire d'état, donc déterministe et chemin-indépendant.
//   2. compute() : enveloppe monotone par-dessus computeNaive. Garantit que ajouter une option
//      ne fait JAMAIS baisser la remise affichée. Pour ça, on calcule la remise pour le panier
//      complet ET pour tous les sous-paniers (récursif avec mémoïsation), et on prend le maximum.
//
// Cette architecture remplace l'ancien système avec mémoire d'état (_lastBrut, _lastDiscount,
// _lastTotal, _lastAbsorbableSet) qui créait une chemin-dépendance : pour le même panier final,
// le total pouvait varier selon l'ordre d'activation des options. La nouvelle architecture
// est mathématiquement déterministe ET garantit la non-décroissance de la remise.
// ═══════════════════════════════════════════════════════════════════════════════

// Liste des options éligibles à la mécanique d'absorption à 2 950 €.
// Hors Pack son et Pack lumière (coûts internes trop élevés pour être offerts).
// Hors cadreur_hf (option premium hors mécanique partenaire, voir CHANGELOG).
// Hors options forced du partenaire (déjà offertes par défaut).
const ABSORBABLE_BASE_IDS = ["stream", "duplex", "cam_sup", "ecran", "rush4k", "5g", "montage_tc", "reperage", "veille"];

// ─────────────────────────────────────────────────────────────────────────────
// computeNaive : moteur de calcul du devis pour un panier donné.
//
// RÈGLES DU MOTEUR PAR ORDRE DE PRIORITÉ (les règles hautes priment toujours
// sur les basses) :
//
//   1. PLANCHER DE MARGE MINIMUM
//      1500 € (demi-j et journée), 2000 € (2 jours), 3000 € (3 jours+),
//      + coûts packs (lumière, son). Aucune remise ne peut faire descendre
//      le total sous ce plancher.
//
//   2. PAS DE REMISE SANS OPTION PAYANTE
//      Si nbOptionsPayantes === 0, remise = 0 €.
//
//   3. LE TOTAL NE PEUT PAS BAISSER QUAND ON COCHE UNE OPTION
//      Pour toute option payante O ajoutée à un panier P : total(P+O) ≥ total(P).
//      Équivalent : remise(P+O) ≤ remise(P) + prix(O). Ajouter une option ne peut
//      jamais faire descendre le total facturé. Implémentée dans l'enveloppe.
//
//   4. CAP 150 € ABSOLU SUR LA 1ÈRE OPTION PAYANTE
//      Quand nbPayantesEffective === 1, remise = 150 € (toutes options
//      incluses, y compris Pack lumière). Override des règles 5 et 7.
//
//   5. CAP REMISE 50 % DE LA SOMME DES PRIX DES OPTIONS PAYANTES
//      Quand nbPayantesEffective ≥ 2, remise totale ≤ 50 % de la somme
//      des prix des options payantes cochées. Sauf palier psy (exception).
//
//   6. NON-DÉCROISSANCE STRICTE DE LA REMISE
//      Pour toute option O ajoutée : delta_remise ≥ 0.
//      Cède devant règle 3 (delta_total ≥ 0) et règle 5 (cap 50 %) en cas
//      de conflit mathématique.
//
//   7. CHARM PRICING MONOTONE vers paliers psy 1950 / 2950 / 3950 / 4950 / 5950.
//      CHARM_MAX_BONUS = 250 €, bypass 50 € au seuil 2000, 250 € au seuil 4000.
//
//   8. PLAFOND STRICT 2950 € sur MORNING/SOLARIS demi-j et journée uniquement
//      (AGENCE et multi-jours exclus).
//
//   9. htHorsExclus (CALCUL DE PALIER GRILLE A) : exclut son, duplex, cadreur HF
//      pour neutraliser l'ordre du bundle.
//
//   10. BUNDLE son+duplex : si son first → duplex offert. Si duplex first →
//       son passe à 500 €. Total facturé identique dans les deux cas.
//
//   11. FLOOR 2950 € : si totalAvantRemise > 3000 € ET total descend sous 2950 €
//       sur MORNING/SOLARIS demi-j et journée, on remonte le total à 2950 €.
//
//   12. COMPTAGE OPTIONS PAYANTES : toutes options cochées hors forced du
//       partenaire et hors cadreur HF. Inclut son, duplex, et duplex offert
//       par bundle.
//
// L'enveloppe monotone (computeWithEnvelope) ajoute en plus :
//   - Règle 3 : cap absolu remise(P) ≤ sub.remise + prix(O) (priorité 3)
//   - Règle 5 : cap 50 % du panier complet (priorité 5, prime sur règle 6)
//   - Règle 6 : non-décroissance large remise (cède devant 3 et 5)
//   - Règle 14 (secondaire) : delta total +50 € minimum (sauf palier psy)
// ─────────────────────────────────────────────────────────────────────────────
function computeNaive(stateOverride) {
  // stateOverride permet de calculer pour un panier différent du state courant
  // (utilisé par l'enveloppe monotone pour explorer les sous-paniers).
  const s = stateOverride || state;
  const baseHT = getDurPriceFor(s);
  const dayMult = getDayMult(s.duration);
  const partnerCode = s.partnerCode ? PARTNER_CODES[s.partnerCode] : null;
  const forcedSet = new Set(partnerCode ? partnerCode.forceOptions : []);
  const sonDuplex = getSonDuplexLogicFor(s);
  let optsHT = 0;
  let cadreurHFPrice = 0; // géré séparément, hors mécanique partenaire
  const lines = [];
  OPTIONS.forEach(opt => {
    if (!s.options[opt.id]) return;
    const isForcedByPartner = forcedSet.has(opt.id);
    const isDuplexFreeBySon = (opt.id === "duplex") && sonDuplex.duplexFree;
    const isFree = isForcedByPartner || isDuplexFreeBySon;
    const isSonDiscounted = (opt.id === "son" && sonDuplex.sonPrice !== null);
    // Calcul du prix plein selon l'option
    let fullPrice;
    if (opt.id === "5g") {
      fullPrice = PRICE_5G_BY_DUR[s.duration];
    } else if (opt.id === "cadreur_hf") {
      fullPrice = PRICE_CADREUR_HF_BY_DUR[s.duration];
    } else if (opt.dayMultiplied) {
      fullPrice = Math.round(opt.price * dayMult);
    } else {
      fullPrice = opt.price;
    }
    const rawPrice = isSonDiscounted ? Math.max(0, fullPrice - 250) : fullPrice;
    const price = isFree ? 0 : rawPrice;
    // Cadreur HF : sorti de opts_ht (ajouté après le plafond, comme un add-on)
    if (opt.outsidePartner) {
      cadreurHFPrice = price;
      lines.push({
        id: opt.id, label: opt.label, price, dayMultiplied: false,
        isFree: false, isForcedByPartner: false,
        freeBecause: null, oldPrice: null,
        outsidePartner: true
      });
      return;
    }
    optsHT += price;
    const oldPrice = isSonDiscounted ? fullPrice : null;
    lines.push({
      id: opt.id, label: opt.label, price, dayMultiplied: !!opt.dayMultiplied,
      isFree, isForcedByPartner,
      freeBecause: isDuplexFreeBySon ? "son" : null,
      oldPrice
    });
  });

  // Remise forfaitaire partenaire (Grille A) avec plancher de marge protégé
  const partnerDisc = getPartnerDiscountFor(s, baseHT, lines);
  const totalAvantRemise = baseHT + optsHT;
  let remiseEffective = Math.min(
    partnerDisc.amount,
    Math.max(0, totalAvantRemise - partnerDisc.plancher)
  );
  let nbPayantesEffective = 0;

  if (s.partnerCode) {
    // Comptage des options payantes (= !isForcedByPartner && !outsidePartner), y compris
    // son et duplex chacun pour 1. Utilisé pour le cap 150 € absolu sur 1ère option et
    // le cap 50 % sur paniers à 2+ options.
    nbPayantesEffective = lines.filter(l =>
      !l.isForcedByPartner && !l.outsidePartner
    ).length;

    // Charm pricing MONOTONE : on prend le seuil le plus haut atteint, et le bonus charm
    // s'applique tant qu'on est au-dessus. Plus de fenêtre [seuil, seuil+200] qui pouvait
    // se perdre quand on continuait à ajouter des options. CHARM_MAX_BONUS = 250 (pour
    // permettre la descente complète de 250 € vers 3 950 sur les seuils 4 000+).
    if (partnerDisc.charmAllowed) {
      const CHARM_THRESHOLDS = [
        { seuil: 2000, allowFloorBypass: 50 },   // Pack lumière → 1 950 toléré
        { seuil: 3000 },
        { seuil: 4000, allowFloorBypass: 250 },  // 4 200 → 3 950 sur 3 jours+ avec lumière
        { seuil: 5000 },
        { seuil: 6000 }
      ];
      const CHARM_MAX_BONUS = 250;
      const totalAfterDiscount = totalAvantRemise - remiseEffective;
      let bestThreshold = null;
      for (const t of CHARM_THRESHOLDS) {
        if (totalAfterDiscount >= t.seuil) bestThreshold = t;
      }
      if (bestThreshold) {
        const charmBonus = totalAfterDiscount - (bestThreshold.seuil - 50);
        const floorTolerance = bestThreshold.allowFloorBypass || 0;
        const maxByFloor = Math.max(0, totalAfterDiscount - (partnerDisc.plancher - floorTolerance));
        const allowedBonus = Math.min(charmBonus, CHARM_MAX_BONUS, maxByFloor);
        if (allowedBonus > 0) remiseEffective += allowedBonus;
      }
    }

  } else {
    remiseEffective = 0;
  }

  let totalHT = totalAvantRemise - remiseEffective;

  // ─── Cap final sur la remise totale ───
  // Deux règles successives selon le nombre d'options payantes :
  //
  // RÈGLE 1 (PRIORITAIRE) : Cap 150 € absolu sur la 1ère option payante.
  //   Quand une seule option payante est cochée (nbPayantesEffective === 1), la remise est
  //   FIXÉE à 150 €. Engagement commercial fixe. S'applique AVANT et OVERRIDE la règle 50 %.
  //   Le client voit toujours "150 € de remise" au moment de cocher sa première option,
  //   peu importe sa nature (y compris Pack lumière).
  //   Limite : la remise ne descend pas sous le plancher de marge.
  //
  // RÈGLE 2 : Cap 50 % du prix des options payantes (sauf palier psy).
  //   S'applique quand nbPayantesEffective ≥ 2. La remise totale ne peut excéder 50 %
  //   de la somme des prix des options payantes cochées.
  //   EXCEPTION palier psy (1 950, 2 950, 3 950, 4 950, 5 950 €) : cap relâché pour
  //   préserver l'effet plafond commercial.
  if (s.partnerCode) {
    if (nbPayantesEffective === 1) {
      // Règle 1 : cap 150 absolu (override, lumière incluse)
      const margeDispo = Math.max(0, totalAvantRemise - partnerDisc.plancher);
      remiseEffective = Math.min(150, margeDispo);
      totalHT = totalAvantRemise - remiseEffective;
    } else if (nbPayantesEffective >= 2) {
      // Règle 2 : cap 50 % (avec exception palier psy)
      const PALIERS_PSY_NAIVE = [1950, 2950, 3950, 4950, 5950];
      const isOnPsyPalierNaive = PALIERS_PSY_NAIVE.indexOf(totalHT) !== -1;
      if (!isOnPsyPalierNaive) {
        let sumPrixOptions = 0;
        lines.forEach(ln => {
          if (ln.isForcedByPartner) return;
          if (ln.outsidePartner) return;
          sumPrixOptions += ln.price;
        });
        const cap50pct = sumPrixOptions * 0.5;
        if (remiseEffective > cap50pct) {
          remiseEffective = Math.floor(cap50pct);
          totalHT = totalAvantRemise - remiseEffective;
        }
      }
    }
  }

  // ─── Mécanique d'absorption d'option ─────────────────────────────────────
  // RÈGLE 1 : sur demi-j et journée avec MORNING/SOLARIS, le total ne dépasse JAMAIS 2 950 €.
  //   La remise comptable est augmentée pour ramener le total à 2 950 €.
  //   AGENCE n'est PAS soumis au plafond (la remise reste celle de la grille A).
  //
  // RÈGLE 2 : à 2 950 € pile, les options non cochées éligibles affichent "OFFERT" en teasing.
  //   Si le client coche une option en teasing, elle entre dans le brut mais le plafond reste.
  //
  // Cadreur HF est exclu de cette mécanique : il s'ajoute APRÈS le plafond comme un add-on.
  const codeForAbs = s.partnerCode ? PARTNER_CODES[s.partnerCode] : null;
  const forcedSetForAbs = new Set(codeForAbs ? codeForAbs.forceOptions : []);
  const ABSORBABLE_IDS = ABSORBABLE_BASE_IDS.filter(id => !forcedSetForAbs.has(id));
  const absorbableSet = new Set();

  // ─── RÈGLE 1 : plafond strict 2 950 € sur demi-j et journée (MORNING et SOLARIS uniquement) ───
  if (s.partnerCode && s.partnerCode !== "AGENCE" && (s.duration === "half" || s.duration === "full") && totalHT > 2950) {
    const cappedDiscount = totalAvantRemise - 2950;
    remiseEffective = cappedDiscount;
    totalHT = 2950;
  }

  // ─── RÈGLE 1 bis : floor 2 950 € sur les gros paniers ───
  // Si le brut total dépasse 3 000 € avec partenaire MORNING/SOLARIS sur demi-j ou journée,
  // le total ne peut pas descendre sous 2 950 € par effet du charm pricing.
  // Préserve l'effet plafond commercial : sur les paniers conséquents, on est à 2 950 € pile,
  // pas en dessous. Ne s'applique pas sur les petits paniers (demi-j + lumière → 2 100 €
  // avec cap 150 absolu) car le brut est sous 3 000 €.
  if (s.partnerCode && s.partnerCode !== "AGENCE" && (s.duration === "half" || s.duration === "full") && totalAvantRemise > 3000 && totalHT < 2950) {
    const cappedByFloor = totalAvantRemise - 2950;
    remiseEffective = Math.min(remiseEffective, cappedByFloor);
    totalHT = 2950;
  }

  // ─── RÈGLE 2 : teasing prospectif sur seuil 2 950 € ───
  if (s.partnerCode && s.partnerCode !== "AGENCE" && (s.duration === "half" || s.duration === "full") && totalHT === 2950) {
    let margeRestante = Math.max(0, totalHT - partnerDisc.plancher);
    OPTIONS.forEach(opt => {
      if (!ABSORBABLE_IDS.includes(opt.id)) return;
      if (margeRestante <= 0) return;
      // Teasing uniquement sur options NON cochées
      if (s.options[opt.id]) return;
      const fullPrice = opt.dayMultiplied ? Math.round(opt.price * dayMult) : (opt.id === "5g" ? PRICE_5G_BY_DUR[s.duration] : opt.price);
      if (margeRestante >= fullPrice) {
        absorbableSet.add(opt.id);
        margeRestante -= fullPrice;
      }
    });
  }

  // ─── Step 04 : contenus post-événement (Best-of, Interviews) ───────────
  // Ajoutés au total APRÈS la mécanique partenaire. Pas de remise sur ces lignes.
  let addonsHT = 0;
  const addonLines = [];
  if (s.addons.bestof) {
    const price = ADDON_PRICES.bestof[s.duration] || ADDON_PRICES.bestof.half;
    addonsHT += price;
    addonLines.push({ id: "bestof", label: "Best-of monté · réseaux sociaux", price });
  }
  if (s.addons.interviews) {
    addonsHT += ADDON_PRICES.interviews;
    addonLines.push({ id: "interviews", label: "Interviews post-événement", price: ADDON_PRICES.interviews });
  }
  if (s.addons.photographe) {
    const price = ADDON_PRICES.photographe[s.duration] || ADDON_PRICES.photographe.half;
    addonsHT += price;
    addonLines.push({ id: "photographe", label: "Photographe événementiel", price });
  }
  totalHT += addonsHT;

  // ─── Cadreur HF : ajouté après le plafond et les addons (option premium hors mécanique) ───
  totalHT += cadreurHFPrice;

  // Bundle son↔duplex : -250 € sur le total apparent quand son first et duplex offert.
  // Voir CHANGELOG section "Bundle son↔duplex : consolidation visuelle dans la remise".
  let bundleSavings = 0;
  if (s.partnerCode && s.options.son && s.options.duplex && sonDuplex.duplexFree) {
    bundleSavings = 250;
  }

  // Économie dégressive : matérialise la générosité du tarif multi-jours dans le bandeau remise.
  // Affichée uniquement quand un code partenaire est actif (sinon, le tarif dégressif est déjà
  // visible dans les cards de durée et n'a pas besoin d'être réaffiché).
  const degressifSavings = s.partnerCode ? (DEGRESSIF_SAVINGS[s.duration] || 0) : 0;

  return {
    baseHT, optsHT, totalHT,
    totalAvantRemise,
    lines,
    addonsHT,
    addonLines,
    partnerDiscount: remiseEffective + bundleSavings + degressifSavings,
    partnerDiscountRaw: remiseEffective,
    partnerDiscountFull: partnerDisc.amount,
    bundleSavings,
    degressifSavings,
    absorbableSet,
    cadreurHFPrice,
    plancher: partnerDisc.plancher
  };
}

// Helpers utilitaires pour computeNaive avec un state arbitraire (utilisés par l'enveloppe monotone)
function getDurPriceFor(s) {
  const stdPrice = CONFIG.durations[s.duration].price;
  if (!s.partnerCode) return stdPrice;
  const code = PARTNER_CODES[s.partnerCode];
  if (code.durations && code.durations[s.duration] != null) return code.durations[s.duration];
  return stdPrice;
}

function getSonDuplexLogicFor(s) {
  const sonActive = !!s.options.son;
  const duplexActive = !!s.options.duplex;
  if (!sonActive && !duplexActive) return { sonPrice: null, duplexFree: false };
  if (sonActive && !duplexActive) return { sonPrice: null, duplexFree: true };
  if (!sonActive && duplexActive) return { sonPrice: 500, duplexFree: false };
  const order = s.activationOrder || [];
  const sonIdx = order.indexOf("son");
  const duplexIdx = order.indexOf("duplex");
  if (sonIdx !== -1 && duplexIdx !== -1 && sonIdx < duplexIdx) {
    return { sonPrice: null, duplexFree: true };
  }
  return { sonPrice: 500, duplexFree: false };
}

function getPartnerDiscountFor(s, baseHT, optsLines) {
  // Version "stateful-free" de getPartnerDiscount : on passe s explicitement
  // au lieu d'utiliser la variable globale state. Permet à l'enveloppe monotone
  // de calculer pour des sous-paniers sans toucher au state global.
  const code = s.partnerCode ? PARTNER_CODES[s.partnerCode] : null;
  if (!code || !code.discountTiers) return { amount: 0, plancher: 0, charmAllowed: false };
  let htHorsExclus = baseHT;
  let nbOptionsPayantes = 0;
  optsLines.forEach(ln => {
    if (ln.outsidePartner) return;
    if (ln.isForcedByPartner) return;
    nbOptionsPayantes++;
    if (ln.id === "son") return;
    if (ln.id === "duplex") return;
    htHorsExclus += ln.price;
  });
  // Pas de remise si aucune option payante (règle prioritaire)
  if (nbOptionsPayantes === 0) {
    const MARGE_MIN_NULL = { half: 1500, full: 1500, "2days": 2000, "3days": 3000 };
    let plancherNull = MARGE_MIN_NULL[s.duration] || 1500;
    if (s.options.lumiere) plancherNull += 400;
    if (s.options.son)     plancherNull += 550;
    return { amount: 0, plancher: plancherNull, charmAllowed: false };
  }
  const hasMarginOption = !!(s.options.son || s.options.lumiere);
  let amount = 0;
  let charmAllowed = false;
  for (let i = code.discountTiers.length - 1; i >= 0; i--) {
    const tier = code.discountTiers[i];
    if (htHorsExclus >= tier.minHT) {
      if (tier.requiresMarginOption && !hasMarginOption) continue;
      amount = tier.amount;
      charmAllowed = !!tier.charmAllowed;
      break;
    }
  }
  amount = Math.ceil(amount * (REMISE_MULT[s.duration] || 1) / 5) * 5;
  const MARGE_MIN = { half: 1500, full: 1500, "2days": 2000, "3days": 3000 };
  const COSTS = {
    lumiere: { half: 400, full: 400, "2days": 800, "3days": 1200 },
    son:     { half: 550, full: 550, "2days": 825, "3days": 1237.5 }
  };
  let plancher = MARGE_MIN[s.duration] || 1500;
  if (s.options.lumiere) plancher += COSTS.lumiere[s.duration] || 400;
  if (s.options.son)     plancher += COSTS.son[s.duration]     || 550;
  return { amount, plancher, charmAllowed };
}

// ─── ENVELOPPE MONOTONE ────────────────────────────────────────────────────
// Garantit que la remise ne baisse JAMAIS quand le client ajoute une option.
// Mathématiquement : remise(P) = max(remise_naive(P), max_{O ∈ P_payantes} remise(P\{O})).
// Récursif avec mémoïsation. Pour 11 options non forced, c'est 2^11 = 2048 sous-paniers
// en pire cas, mais beaucoup partagent des calculs grâce au cache.
// Le calcul naïf respecte déjà son plancher de marge (avec bypass charm), et ajouter une
// option ne réduit jamais la marge dispo (price option > delta plancher), donc l'enveloppe
// ne viole jamais la rentabilité.
function computeWithEnvelope(s, cache) {
  cache = cache || {};
  // Clé de cache : durée + partenaire + options actives + addons
  // (l'ordre d'activation n'influence plus le total, donc pas dans la clé)
  const optsKey = Object.keys(s.options).filter(k => s.options[k]).sort().join(",");
  const addonsKey = Object.keys(s.addons).filter(k => s.addons[k]).sort().join(",");
  const orderKey = (s.activationOrder || []).join(">");
  const key = s.duration + "|" + (s.partnerCode || "") + "|" + optsKey + "|" + addonsKey + "|" + orderKey;
  if (cache[key]) return cache[key];

  const naive = computeNaive(s);

  // Sans code partenaire, pas d'enveloppe (pas de remise)
  if (!s.partnerCode) {
    cache[key] = naive;
    return naive;
  }

  // Liste des options qu'on peut retirer pour explorer les sous-paniers
  // (on ne retire PAS les forced, qui sont des cadeaux du partenaire et ne génèrent
  // pas de remise grille A)
  const code = PARTNER_CODES[s.partnerCode];
  const forcedSet = new Set(code.forceOptions);
  const removableOpts = Object.keys(s.options).filter(opt =>
    s.options[opt] && !forcedSet.has(opt)
  );

  // Calcul des bornes via les sous-paniers :
  //   - maxSubRemise : non-décroissance large de la remise (règle priorité 6)
  //   - upperBoundDeltaTotal : RÈGLE 3 (priorité absolue) — total(P) ≥ total(P\O)
  //     pour tout sub. Borne sup remise(P) ≤ remise(P\O) + prix(O).
  //   - upperBoundCap50PerOpt : RÈGLE 5 (priorité 5) — delta_remise par option ≤ 50 %
  //     du prix de l'option ajoutée. Borne sup remise(P) ≤ remise(P\O) + 0.5 × prix(O).
  //     Sauf palier psy.
  //   - minTotalRequired : delta total ≥ 50 € minimum (règle priorité 14, secondaire)
  const TOTAL_DELTA_MIN = 50;
  const PALIERS_PSY = [1950, 2950, 3950, 4950, 5950];
  const naiveBaseTotal = naive.totalHT - naive.addonsHT - naive.cadreurHFPrice;
  const isOnPsyPalier = PALIERS_PSY.indexOf(naiveBaseTotal) !== -1;
  let maxSubRemise = 0;
  let upperBoundDeltaTotal = Infinity;
  let upperBoundCap50PerOpt = Infinity;
  let minTotalRequired = 0;
  for (const optId of removableOpts) {
    const subState = Object.assign({}, s, {
      options: Object.assign({}, s.options),
      activationOrder: (s.activationOrder || []).filter(o => o !== optId)
    });
    delete subState.options[optId];
    const subResult = computeWithEnvelope(subState, cache);
    if (subResult.partnerDiscountRaw > maxSubRemise) {
      maxSubRemise = subResult.partnerDiscountRaw;
    }
    const prixOpt = naive.totalAvantRemise - subResult.totalAvantRemise;
    // Règle 3 : remise(P) ≤ sub.remise + prix(O)
    const upperR3 = subResult.partnerDiscountRaw + prixOpt;
    if (upperR3 < upperBoundDeltaTotal) upperBoundDeltaTotal = upperR3;
    // Règle 5 : remise(P) ≤ sub.remise + 50 % × prix(O)
    // Appliqué TOUJOURS (même palier psy) pour éviter les stagnations apparentes côté client.
    if (prixOpt > 0) {
      const upperR5 = subResult.partnerDiscountRaw + Math.floor(0.5 * prixOpt);
      if (upperR5 < upperBoundCap50PerOpt) upperBoundCap50PerOpt = upperR5;
    }
    // Règle 14 (sauf palier psy) : total(P) ≥ sub.total + 50
    if (!isOnPsyPalier) {
      const reqTotal = subResult.totalHT + TOTAL_DELTA_MIN;
      if (reqTotal > minTotalRequired) minTotalRequired = reqTotal;
    }
  }

  // bestRemiseRaw = max(naïf, max sub) → la remise du panier complet ≥ max remise sub
  // ET ≥ remise naïve (cap 150 absolu, charm respectés)
  let bestRemiseRaw = Math.max(naive.partnerDiscountRaw, maxSubRemise);

  // RÈGLE 3 (priorité 3) : cap par delta_total ≥ 0.
  if (bestRemiseRaw > upperBoundDeltaTotal) {
    bestRemiseRaw = upperBoundDeltaTotal;
  }

  // RÈGLE 5 (priorité 5) : cap 50 % par option.
  if (bestRemiseRaw > upperBoundCap50PerOpt) {
    bestRemiseRaw = upperBoundCap50PerOpt;
  }

  // PROTECTION cap 150 absolu (priorité 4) : sur 1ère option payante, on ne descend
  // jamais sous la remise naïve (= 150 € absolu, sauf cas marge insuffisante).
  // Sur 2+ options, on laisse le cap 50 % par option agir librement.
  const nbPayantesNaive = naive.lines.filter(l =>
    !l.isForcedByPartner && !l.outsidePartner
  ).length;
  if (nbPayantesNaive === 1 && bestRemiseRaw < naive.partnerDiscountRaw) {
    bestRemiseRaw = naive.partnerDiscountRaw;
  }

  const initialBestRemiseRaw = bestRemiseRaw; // sauvegarde pour règle 6
  const totalAvantRemise = naive.totalAvantRemise;
  let finalRemiseRaw = bestRemiseRaw;
  let baseTotal = totalAvantRemise - finalRemiseRaw;

  // Plafond 2 950 € (MORNING/SOLARIS, demi-j et journée) :
  //   - Si le total dépasse 2 950 € : on remonte la remise pour ramener à 2 950 €.
  //   - Si le total descend sous le total naïf à cause d'une remise enveloppe trop grande,
  //     on tente de respecter le total naïf, MAIS uniquement si la remise candidate
  //     reste ≥ initialBestRemiseRaw (la non-décroissance prime, règle priorité 5).
  const isCappable = s.partnerCode !== "AGENCE" && (s.duration === "half" || s.duration === "full");
  if (isCappable) {
    if (baseTotal > 2950) {
      finalRemiseRaw = totalAvantRemise - 2950;
      baseTotal = 2950;
    } else if (baseTotal < naiveBaseTotal) {
      const candidate = totalAvantRemise - naiveBaseTotal;
      if (candidate >= initialBestRemiseRaw) {
        finalRemiseRaw = candidate;
        baseTotal = naiveBaseTotal;
      }
      // Sinon : on garde finalRemiseRaw actuel, total reste au baseTotal calculé.
      // Non-décroissance prime sur respect du total naïf.
    }
  }

  let totalHT = baseTotal + naive.addonsHT + naive.cadreurHFPrice;

  // Contrainte secondaire : delta total ≥ 50 € (cap +50, règle priorité 13)
  // PRIORITÉ : la non-décroissance de la remise (règle 5) prime. On ne réduit pas
  // la remise sous initialBestRemiseRaw (= max naïf, max sub) pour faire monter le total.
  // Le cap 150 € absolu sur 1ère option (règle 3) est inclus dans naive.partnerDiscountRaw
  // donc dans initialBestRemiseRaw, et donc préservé par cette protection.
  if (totalHT < minTotalRequired) {
    const deltaToReduce = minTotalRequired - totalHT;
    const candidateRemise = finalRemiseRaw - deltaToReduce;
    if (candidateRemise >= initialBestRemiseRaw) {
      // OK on peut remonter le total sans violer la non-décroissance ni le cap 150
      finalRemiseRaw = candidateRemise;
      baseTotal += deltaToReduce;
      totalHT = minTotalRequired;
    }
    // Sinon : on reste sur finalRemiseRaw actuel (≥ initialBestRemiseRaw garanti),
    // total stagne à baseTotal + addons. Règle 5 et règle 3 priment sur règle 13.
  }

  const result = Object.assign({}, naive, {
    totalHT,
    partnerDiscount: finalRemiseRaw + naive.bundleSavings + naive.degressifSavings,
    partnerDiscountRaw: finalRemiseRaw
  });
  cache[key] = result;
  return result;
}

// Point d'entrée principal : appelé par render(). Renvoie le résultat avec enveloppe monotone.
function compute() {
  return computeWithEnvelope(state);
}

function render() {
  const r = compute();
  const dur = CONFIG.durations[state.duration];
  const suffix = state.ttc ? "TTC" : "HT";
  const dayMult = getDayMult(state.duration);

  // Card prices : toujours afficher les prix standards, indépendamment du code partenaire
  Object.keys(CONFIG.durations).forEach(key => {
    const el = document.getElementById("price-"+key);
    if (el) el.textContent = fmt(shown(CONFIG.durations[key].price)) + " € " + suffix;
  });

  // Options : section masquée s'il n'y a aucune option cochée
  const optsSection = document.getElementById("sum-options-section");
  const optsContainer = document.getElementById("sum-options");
  optsContainer.innerHTML = "";
  if (r.lines.length) {
    optsSection.style.display = "block";
    r.lines.forEach(ln => {
      const row = document.createElement("div");
      row.className = "breakdown-line";
      const valHTML = ln.isFree
        ? '<span class="val" style="color:var(--green);font-size:11px;letter-spacing:0.06em;text-transform:uppercase;">Inclus</span>'
        : (ln.oldPrice
            ? "<span class='val'><span class='price-old'>"+fmt(shown(ln.oldPrice))+" €</span><span class='price-new'>"+fmt(shown(ln.price))+" €</span></span>"
            : "<span class='val'>"+fmt(shown(ln.price))+" €</span>");
      row.innerHTML = "<span>"+ln.label+"</span>" + valHTML;
      optsContainer.appendChild(row);
    });
  } else {
    optsSection.style.display = "none";
  }

  // Ligne "Remise tarif partenaire" : visible seulement si remise effective > 0
  const partnerDiscSection = document.getElementById("sum-partner-discount-section");
  const partnerDiscAmount = document.getElementById("sum-partner-discount-amount");
  if (partnerDiscSection && partnerDiscAmount) {
    if (r.partnerDiscount && r.partnerDiscount > 0) {
      partnerDiscSection.style.display = "block";
      partnerDiscAmount.textContent = "−" + fmt(shown(r.partnerDiscount)) + " €";
    } else {
      partnerDiscSection.style.display = "none";
    }
  }

  // ─── Section Add-ons (Step 04) dans le breakdown ───
  // Affichée seulement si au moins un add-on est coché.
  const addonsSection = document.getElementById("sum-addons-section");
  const addonsContainer = document.getElementById("sum-addons");
  if (addonsSection && addonsContainer) {
    addonsContainer.innerHTML = "";
    if (r.addonLines && r.addonLines.length) {
      addonsSection.style.display = "block";
      r.addonLines.forEach(ln => {
        const row = document.createElement("div");
        row.className = "breakdown-line";
        row.innerHTML = "<span>" + ln.label + "</span><span class='val'>" + fmt(shown(ln.price)) + " €</span>";
        addonsContainer.appendChild(row);
      });
    } else {
      addonsSection.style.display = "none";
    }
  }

  // ─── Mise à jour dynamique du prix Best-of dans la card (selon durée sélectionnée) ───
  const bestofPriceEl = document.getElementById("addon-bestof-price");
  if (bestofPriceEl) {
    const bestofPrice = ADDON_PRICES.bestof[state.duration] || ADDON_PRICES.bestof.half;
    bestofPriceEl.textContent = "+ " + fmt(shown(bestofPrice)) + " €";
  }

  // ─── Mise à jour dynamique du prix Photographe dans la card (selon durée sélectionnée) ───
  const photographePriceEl = document.getElementById("addon-photographe-price");
  if (photographePriceEl) {
    const photographePrice = ADDON_PRICES.photographe[state.duration] || ADDON_PRICES.photographe.half;
    photographePriceEl.textContent = "+ " + fmt(shown(photographePrice)) + " €";
  }

  // Mention "Setup technique sur site" : durée estimée selon la combinaison d'options.
  // getMontageH() retourne toujours ≥ 2h (base) et ≤ 4h (plafond).
  const setupTimeText = document.getElementById("setup-time-text");
  if (setupTimeText) {
    setupTimeText.textContent = "Setup technique sur site : " + getMontageH() + "h";
  }

  // Économie tarif partenaire : bandeau proéminent sous le total
  const savingsBanner = document.getElementById("savings-banner");
  const savingsAmount = document.getElementById("savings-amount");
  if (savingsBanner) {
    const savings = getPartnerSavings();
    if (state.partnerCode && savings > 0) {
      savingsAmount.textContent = fmt(shown(savings)) + " €";
      savingsBanner.classList.add("show");
    } else {
      savingsBanner.classList.remove("show");
    }
  }

  // Total
  document.getElementById("total-label").textContent = "Estimation totale " + suffix;
  document.getElementById("total-suffix").textContent = suffix;
  document.getElementById("mobile-label").textContent = "Estimation " + suffix;
  const newVal = fmt(shown(r.totalHT));
  const totalNum = document.getElementById("total-num");
  const mobileNum = document.getElementById("mobile-total");
  if (totalNum.textContent !== newVal) {
    totalNum.textContent = newVal; mobileNum.textContent = newVal;
    const tv = document.getElementById("total-value");
    tv.classList.remove("flash"); void tv.offsetWidth; tv.classList.add("flash");
  } else {
    totalNum.textContent = newVal; mobileNum.textContent = newVal;
  }

  // Update option rows : badge "OFFERT" pour options forcées par partenaire, bundle son+duplex,
  // OU options absorbées/absorbables (mécanique seuil charm).
  // Pack sonorisation : prix barré 750 → 500 € quand duplex a été coché en premier.
  const partnerCode = state.partnerCode ? PARTNER_CODES[state.partnerCode] : null;
  const forcedSet = new Set(partnerCode ? partnerCode.forceOptions : []);
  const sonDuplex = getSonDuplexLogic();
  // Sets issus du compute : options cochées effectivement absorbées + options non cochées en teasing
  const absorbableTeasingSet = r.absorbableSet || new Set();
  // Pour les absorbées : on les détecte via lines[].absorbed
  const absorbedCheckedSet = new Set((r.lines || []).filter(l => l.absorbed).map(l => l.id));
  OPTIONS.forEach(opt => {
    const row = document.querySelector('.option[data-id="'+opt.id+'"]');
    if (!row) return;
    const priceEl = row.querySelector(".option-price");
    const isForcedByPartner = forcedSet.has(opt.id);
    const isDuplexFreeBySon = (opt.id === "duplex") && sonDuplex.duplexFree;
    const isAbsorbed = absorbedCheckedSet.has(opt.id);
    const isAbsorbableTeasing = absorbableTeasingSet.has(opt.id);
    if (isForcedByPartner || isDuplexFreeBySon || isAbsorbed || isAbsorbableTeasing) {
      row.classList.add("is-free");
      priceEl.innerHTML = '<span class="free-badge">Offert</span>';
    } else {
      row.classList.remove("is-free");
      const fullPrice = opt.dayMultiplied ? Math.round(opt.price * dayMult) : opt.price;
      if (opt.id === "son" && sonDuplex.sonPrice !== null) {
        const newP = Math.max(0, fullPrice - 250);
        priceEl.innerHTML = '<span class="price-old">' + fmt(shown(fullPrice)) + ' €</span> <span class="price-new">+ ' + fmt(shown(newP)) + ' €</span>';
      } else {
        priceEl.innerHTML = "+ " + fmt(shown(fullPrice)) + " €";
      }
    }
  });

  // Refresh des matériels d'options dans la "Vue technique" (uniquement les options actives ou forcées)
  refreshTechOptions();

  // Nudge "projet d'envergure" si total > 3000 € HT
  const nudge = document.getElementById("project-nudge");
  if (nudge) {
    if (r.totalHT > 3000) nudge.style.display = "block";
    else nudge.style.display = "none";
  }

  // ─── GA4 tracking : seuils franchis et options absorbées ───
  // total_threshold : se déclenche quand le panier franchit un seuil clé (à la HAUSSE uniquement)
  const THRESHOLDS = [1000, 1500, 2000, 1950, 2500, 2950, 3500, 4000, 5000];
  const lastTotal = state._lastTrackedTotal || 0;
  THRESHOLDS.forEach(t => {
    if (lastTotal < t && r.totalHT >= t) {
      pushDataLayer("configurator_total_threshold", {
        threshold: t,
        cart_total: r.totalHT,
        partner_code: state.partnerCode || null,
        duration: state.duration
      });
    }
  });
  state._lastTrackedTotal = r.totalHT;
  // option_absorbed : nouvelles options absorbées depuis le dernier render
  const lastAbsorbed = state._lastTrackedAbsorbed || new Set();
  if (r.lines) {
    r.lines.forEach(ln => {
      if (ln.absorbed && !lastAbsorbed.has(ln.id)) {
        pushDataLayer("configurator_option_absorbed", {
          option_id: ln.id,
          option_label: ln.label,
          cart_total: r.totalHT,
          partner_code: state.partnerCode || null
        });
      }
    });
  }
  state._lastTrackedAbsorbed = new Set((r.lines || []).filter(l => l.absorbed).map(l => l.id));
}

function buildOptions() {
  const container = document.getElementById("options-list");
  OPTIONS.forEach(opt => {
    const row = document.createElement("label");
    row.className = "option"; row.dataset.id = opt.id;
    const platformsHTML = opt.platforms
      ? '<div class="platforms-list" data-platforms-for="'+opt.id+'">'+
          PLATFORMS.map(p =>
            '<span class="platform-tag" data-platform="'+p+'" role="button" tabindex="0">'+p+'</span>'
          ).join("")+
        '</div>' : "";
    row.innerHTML = `
      <span class="option-check"><svg viewBox="0 0 14 14"><polyline points="2,7 6,11 12,3"></polyline></svg></span>
      <span class="option-label">${opt.label}<span class="option-desc">${opt.desc}</span>${platformsHTML}</span>
      <span class="option-price">+ ${fmt(shown(opt.price))} €</span>
    `;
    // Click sur la ligne = toggle de l'option (mais pas si c'est un tag plateforme)
    row.addEventListener("click", e => {
      // Bloque le toggle si on clique un tag plateforme ou un de ses descendants
      if (e.target.closest(".platform-tag")) return;
      let action;
      if (state.options[opt.id]) {
        delete state.options[opt.id];
        row.classList.remove("active");
        // Retire de l'ordre d'activation (utile pour la logique son ↔ duplex)
        const idx = state.activationOrder.indexOf(opt.id);
        if (idx !== -1) state.activationOrder.splice(idx, 1);
        action = "uncheck";
      } else {
        state.options[opt.id] = true;
        row.classList.add("active");
        // Ajoute en fin d'ordre d'activation
        if (!state.activationOrder.includes(opt.id)) state.activationOrder.push(opt.id);
        action = "check";
      }
      markStart();
      render();
      // GA4 tracking : toggle d'option
      const r = compute();
      pushDataLayer("configurator_option_toggle", {
        option_id: opt.id,
        option_label: opt.label,
        action: action,
        price: opt.dayMultiplied ? Math.round(opt.price * getDayMult(state.duration)) : opt.price,
        cart_total: r.totalHT,
        nb_options_checked: Object.keys(state.options).length
      });
    });
    // Click sur un tag plateforme = ajout/retrait de la plateforme dans state.platforms
    // N'affecte JAMAIS l'état de l'option parente (le pré-requis : option déjà cochée par CSS pour rendre les tags visibles)
    if (opt.platforms) {
      row.querySelectorAll(".platform-tag").forEach(tag => {
        tag.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          const name = tag.dataset.platform;
          const idx = state.platforms.indexOf(name);
          if (idx >= 0) {
            state.platforms.splice(idx, 1);
            tag.classList.remove("selected");
          } else {
            state.platforms.push(name);
            tag.classList.add("selected");
          }
          markStart();
          // Pas de render() complet : uniquement sync form + total inchangé
          syncFormFields();
        });
      });
    }
    container.appendChild(row);
  });
}

// ─── Step 04 : Listeners pour les 2 add-ons (Best-of, Interviews) ───
// Mécanique séparée de buildOptions : pas de mécanique partenaire/charm/absorption.
// Tarif fixe ajouté au total après toute la mécanique principale.
function buildAddons() {
  ["bestof", "interviews", "photographe"].forEach(addonId => {
    const card = document.querySelector('.addon-card[data-addon="' + addonId + '"]');
    if (!card) return;
    const checkbox = card.querySelector('input[type="checkbox"]');
    // Ajoute le bloc Vue technique (matériel) — visible uniquement quand l'add-on est coché ET vue technique active
    const matBlock = document.createElement("div");
    matBlock.className = "addon-material";
    matBlock.innerHTML = '<div class="addon-material-title">Détail prestation</div>' +
      '<ul class="addon-material-list">' +
      ADDON_MATERIEL[addonId].map(m => "<li>" + m + "</li>").join("") +
      '</ul>';
    card.querySelector(".addon-body").appendChild(matBlock);

    // Listener click : toggle l'addon
    card.addEventListener("click", e => {
      // Empêche le double-click natif via input + label
      if (e.target.tagName === "INPUT") return;
      e.preventDefault();
      const wasActive = state.addons[addonId];
      state.addons[addonId] = !wasActive;
      checkbox.checked = state.addons[addonId];
      card.classList.toggle("active", state.addons[addonId]);
      markStart();
      render();
      // GA4 tracking
      const r = compute();
      const addonLabels = {
        bestof: "Best-of monté",
        interviews: "Interviews post-événement",
        photographe: "Photographe événementiel"
      };
      const addonPrice =
        addonId === "interviews"
          ? ADDON_PRICES.interviews
          : (ADDON_PRICES[addonId][state.duration] || ADDON_PRICES[addonId].half);
      pushDataLayer("configurator_addon_toggle", {
        addon_id: addonId,
        addon_label: addonLabels[addonId],
        action: state.addons[addonId] ? "check" : "uncheck",
        price: addonPrice,
        cart_total: r.totalHT
      });
    });
  });
}

// ─── Code partenaire : détecté UNIQUEMENT via URL ?code=XXX ───
// Plus de saisie manuelle ; les partenaires reçoivent un lien direct.
// Affichage passif : un badge "Code partenaire actif · XXX" sous le total quand un code est détecté.
async function applyPartnerCode(raw, kind) {
  // Détection automatique du type si non fourni : un token est en lowercase alphanum 4-12 chars,
  // un code interne est en uppercase alphanum 2-30 chars.
  if (!kind) {
    const trimmed = (raw || "").trim();
    if (/^[a-z0-9]{4,12}$/.test(trimmed)) kind = "token";
    else kind = "code";
  }

  const normalized = kind === "token"
    ? (raw || "").toLowerCase().trim()
    : (raw || "").toUpperCase().trim();

  // Cache local pour les codes internes (pas pour les tokens : on revalide toujours côté serveur)
  if (kind === "code" && PARTNER_CODES[normalized]) {
    state.partnerCode = normalized;
    state.partnerDisplayName = PARTNER_DISPLAY_NAMES[normalized] || normalized;
    updatePartnerDisplay();
    pushDataLayer("configurator_partner_code", { partner_code: normalized });
    render();
    return;
  }

  // Sinon, on demande au serveur de valider
  try {
    const apiUrl = kind === "token"
      ? "/api/validate-code?p=" + encodeURIComponent(normalized)
      : "/api/validate-code?code=" + encodeURIComponent(normalized);
    const res = await fetch(apiUrl);
    if (!res.ok) {
      state.partnerCode = null;
      state.partnerDisplayName = null;
      updatePartnerDisplay();
      return;
    }
    const payload = await res.json();
    if (!payload.valid) {
      state.partnerCode = null;
      state.partnerDisplayName = null;
      updatePartnerDisplay();
      return;
    }
    // Cache local pour le reste de la session, indexé par code interne
    PARTNER_CODES[payload.code] = payload.data;
    PARTNER_DISPLAY_NAMES[payload.code] = payload.displayName || payload.code;
    state.partnerCode = payload.code;
    state.partnerDisplayName = payload.displayName || payload.code;
    updatePartnerDisplay();
    pushDataLayer("configurator_partner_code", { partner_code: payload.code });
    render();
  } catch (e) {
    state.partnerCode = null;
    state.partnerDisplayName = null;
    updatePartnerDisplay();
  }
}

function removePartnerCode() {
  state.partnerCode = null;
  updatePartnerDisplay();
  render();
}

function updatePartnerDisplay() {
  const display = document.getElementById("partner-active-display");
  const txt = document.getElementById("partner-toggle-text");
  const agencyBtn = document.getElementById("agency-toggle");
  if (!display) return;
  if (state.partnerCode) {
    display.style.display = "block";
    if (txt) txt.textContent = "Code partenaire actif · " + (state.partnerDisplayName || state.partnerCode);
    // Quand un code partenaire est appliqué, le bouton "Je suis une agence" devient
    // redondant (le tarif partenaire prend le dessus). On le masque et on reset l'état
    // si jamais il avait été coché avant l'application du code.
    if (agencyBtn) {
      agencyBtn.style.display = "none";
      if (state.isAgence) {
        state.isAgence = false;
        agencyBtn.classList.remove("active");
        const txtMain = document.getElementById("agency-text-main");
        if (txtMain) txtMain.textContent = "Je suis une agence événementielle";
        const fAg = document.getElementById("h-is-agence");
        if (fAg) fAg.value = "";
        if (typeof setTechMode === "function") setTechMode(false);
      }
    }
  } else {
    display.style.display = "none";
    // Réaffiche le bouton agence quand le code partenaire est retiré
    if (agencyBtn) agencyBtn.style.display = "";
  }

  // ─── Remplissage automatique du champ "Société" du formulaire ───
  // Quand un code partenaire est actif, on pré-remplit f-societe avec le displayName joli (ex: "Figma" pas "FIGMA").
  // On marque la valeur via data-auto-filled-by="partner-code" pour pouvoir distinguer
  // une valeur saisie manuellement par l'utilisateur (qu'on ne doit pas écraser).
  // Si l'utilisateur tape ensuite dans le champ, le tag est retiré (listener plus bas)
  // et la valeur ne sera plus écrasée par un changement de code.
  const fSociete = document.getElementById("f-societe");
  if (fSociete) {
    if (state.partnerCode) {
      // Remplir si vide OU si déjà auto-rempli par un précédent code
      if (!fSociete.value || fSociete.dataset.autoFilledBy === "partner-code") {
        fSociete.value = state.partnerDisplayName || state.partnerCode;
        fSociete.dataset.autoFilledBy = "partner-code";
      }
    } else {
      // Code retiré : vider seulement si la valeur avait été auto-remplie
      if (fSociete.dataset.autoFilledBy === "partner-code") {
        fSociete.value = "";
        delete fSociete.dataset.autoFilledBy;
      }
    }
  }
}

// ─── GA4 tracking helper ───
window.dataLayer = window.dataLayer || [];
let _trackedStart = false;
function pushDataLayer(eventName, props) {
  try {
    const payload = Object.assign({ event: eventName }, props || {});
    window.dataLayer.push(payload);
  } catch(e) { /* silent */ }
}
function markStart() {
  if (_trackedStart) return;
  _trackedStart = true;
  pushDataLayer("configurator_started");
}

// ─── Events ───
document.querySelectorAll("#pills-event .pill").forEach(p => {
  p.addEventListener("click", () => {
    document.querySelectorAll("#pills-event .pill").forEach(x => x.classList.remove("active"));
    p.classList.add("active"); state.event = p.dataset.value;
    markStart();
  });
});

document.querySelectorAll("#dur-cards .dur-card").forEach(c => {
  c.addEventListener("click", () => {
    document.querySelectorAll("#dur-cards .dur-card").forEach(x => x.classList.remove("active"));
    c.classList.add("active"); state.duration = c.dataset.value;
    render();
    markStart();
    // GA4 tracking : sélection de durée
    const durPrice = (PARTNER_CODES[state.partnerCode] || CONFIG).durations
      ? (PARTNER_CODES[state.partnerCode] ? PARTNER_CODES[state.partnerCode].durations[state.duration] : CONFIG.durations[state.duration].price)
      : null;
    pushDataLayer("configurator_duration_select", {
      duration: state.duration,
      price: durPrice
    });
  });
});

document.getElementById("tva-chk").addEventListener("change", function() {
  state.ttc = this.checked;
  document.getElementById("tva-toggle-label").classList.toggle("ttc-mode", this.checked);
  render();
});

document.getElementById("agency-toggle").addEventListener("click", () => {
  state.isAgence = !state.isAgence;
  const btn = document.getElementById("agency-toggle");
  btn.classList.toggle("active", state.isAgence);
  const txt = document.getElementById("agency-text-main");
  if (state.isAgence) {
    txt.textContent = "Demande en marque blanche";
    pushDataLayer("configurator_agency_flag", { flag: true });
    // Active automatiquement la Vue technique : les agences sont supposées vouloir le détail technique
    setTechMode(true);
  } else {
    txt.textContent = "Je suis une agence événementielle";
    // Désactive la Vue technique en sortant du mode agence (symétrie de l'activation)
    setTechMode(false);
  }
  // Sync hidden field if form exists
  const f = document.getElementById("h-is-agence");
  if (f) f.value = state.isAgence ? "1" : "";
});

// Note : les anciens event listeners pour la saisie manuelle de code partenaire (toggle, remove, apply, keydown)
// ont été retirés. Le code partenaire est désormais détecté UNIQUEMENT via l'URL (?code=XXX).

// ─── Synchronisation des champs cachés du formulaire avec la config ───
function syncFormFields() {
  const r = compute();
  const eventLabel = document.querySelector("#pills-event .pill.active").textContent.trim();
  const durLabel = CONFIG.durations[state.duration].label;
  const mH = getMontageH();
  const optionLines = r.lines.map(o =>
    "  • " + o.label + " : " + (o.isFree ? "INCLUS" : fmt(o.price) + " € HT")
  );
  const addonLines = (r.addonLines || []).map(a =>
    "  • " + a.label + " : " + fmt(a.price) + " € HT"
  );

  // Construction du message texte récapitulatif (lu côté envoyer.php dans $message)
  const lines = [
    "── CONFIGURATION CONFIGURATEUR ──",
    "Type d'événement : " + eventLabel,
    "Durée : " + durLabel,
    "Plateau : Plateau 3 caméras 4K"
  ];
  if (state.partnerCode) lines.push("Code partenaire : " + state.partnerCode);
  if (state.platforms.length) lines.push("Plateformes diffusion : " + state.platforms.join(", "));
  if (optionLines.length) { lines.push("", "Options retenues :"); lines.push.apply(lines, optionLines); }
  if (addonLines.length) { lines.push("", "Contenus post-événement :"); lines.push.apply(lines, addonLines); }
  lines.push("", "Setup technique : " + mH + "h sur site");
  lines.push("", "ESTIMATION : " + fmt(r.totalHT) + " € HT (" + fmt(Math.round(r.totalHT * TVA)) + " € TTC)");
  if (state.isAgence) lines.push("", "→ DEMANDE EN MARQUE BLANCHE (agence)");

  // Champs visibles utilisateur déjà bindés au form via name=, on remplit uniquement les hidden
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set("h-type", eventLabel);
  set("h-message", lines.join("\n"));
  set("h-is-agence", state.isAgence ? "1" : "");
  set("h-cfg-duration", durLabel);
  set("h-cfg-options", r.lines.map(o => o.label + (o.isFree ? " (inclus)" : " (" + fmt(o.price) + "€)")).join(" | "));
  set("h-cfg-addons", (r.addonLines || []).map(a => a.label + " (" + fmt(a.price) + "€)").join(" | "));
  set("h-cfg-partner", state.partnerCode || "");
  set("h-cfg-total", fmt(r.totalHT) + " € HT");
  set("h-cfg-platforms", state.platforms.join(", "));
}

// Validation et soumission
document.getElementById("quote-form").addEventListener("submit", e => {
  // Sync final avant envoi
  syncFormFields();
  // Validation rapide côté client (email et téléphone requis)
  const email = document.getElementById("f-email");
  const tel = document.getElementById("f-tel");
  let firstErr = null, ok = true;
  const errors = [];
  [email, tel].forEach(f => {
    if (!f.value.trim()) {
      f.classList.add("error"); ok = false; if (!firstErr) firstErr = f;
      errors.push(f.id);
    }
    else f.classList.remove("error");
  });
  if (!ok) {
    e.preventDefault();
    // GA4 tracking : erreur de validation
    pushDataLayer("configurator_form_validation_error", {
      missing_fields: errors.join(","),
      first_error: firstErr ? firstErr.id : null
    });
    if (firstErr) firstErr.focus();
    return;
  }
  // GA4 tracking de la soumission
  pushDataLayer("configurator_submit", {
    partner_code: state.partnerCode || "",
    is_agency: state.isAgence,
    total_ht: compute().totalHT,
    duration: CONFIG.durations[state.duration].label
  });
  // Debug : on log pour pouvoir vérifier en dev tools que la soumission part bien
  try { console.log("[Configurateur] Submit en cours vers", e.target.action); } catch(_) {}
  // Feedback visuel pendant l'envoi — différé d'un tick pour ne pas interférer avec la soumission native
  // (sur certains navigateurs, désactiver le bouton synchroniquement dans le submit handler peut bloquer la soumission)
  setTimeout(() => {
    const btn = document.getElementById("form-submit");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "Envoi en cours…";
    }
  }, 0);
  // Le formulaire continue son submit natif vers envoyer.php
});

// ─── GA4 tracking : focus sur les champs du formulaire ───
// Mesure le drop-off : combien de visiteurs commencent à remplir mais n'envoient pas.
// On track une seule fois par session pour chaque champ (pas de spam).
const _formFieldsTracked = new Set();
["f-societe", "f-date", "f-email", "f-tel"].forEach(fieldId => {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.addEventListener("focus", () => {
    if (_formFieldsTracked.has(fieldId)) return;
    _formFieldsTracked.add(fieldId);
    pushDataLayer("configurator_form_focus", {
      field_name: fieldId.replace("f-", "")
    });
  });
});

// ─── Quand l'utilisateur tape manuellement dans f-societe, on retire le tag auto-fill ───
// Comme ça, sa saisie est respectée et ne sera plus écrasée par un changement de code partenaire.
(function() {
  const fSociete = document.getElementById("f-societe");
  if (!fSociete) return;
  fSociete.addEventListener("input", function() {
    delete this.dataset.autoFilledBy;
  });
})();

buildOptions();
buildAddons();
syncFormFields();
render();

// ═══ Switch "Vue technique" : pilote l'affichage du détail matos (plateau base + sous chaque option) ═══
// Active body.classList "tech-mode" qui révèle :
//   - le bloc <div id="tech-base-details"> (matos plateau de base)
//   - les <div class="option-material"> sous chaque option cochée (CSS rule .tech-mode .option.active .option-material)
//   - les <div class="addon-material"> sous chaque add-on coché (CSS rule .tech-mode .addon-card.active .addon-material)
// Pilote aussi la classe .active sur le bandeau Vue technique pour le feedback visuel (bordure cyan, slider cyan).
function setTechMode(on) {
  const switchInput = document.getElementById("tech-switch");
  const baseDetails = document.getElementById("tech-base-details");
  const banner = document.getElementById("tech-banner-label");
  if (switchInput) switchInput.checked = !!on;
  if (baseDetails) baseDetails.style.display = on ? "block" : "none";
  if (banner) banner.classList.toggle("active", !!on);
  document.body.classList.toggle("tech-mode", !!on);
}
(function() {
  const switchInput = document.getElementById("tech-switch");
  if (!switchInput) return;
  switchInput.addEventListener("change", e => {
    setTechMode(e.target.checked);
  });
})();

// ═══ CTA "Continuer ma demande" sur mobile ═══
// Sur mobile, on cache par défaut le code partenaire, le bouton agence et le formulaire derrière ce CTA.
// Au tap, ils sont révélés et un scroll smooth amène l'utilisateur jusqu'au champ Société.
(function() {
  const cta = document.getElementById("mobile-reveal-cta");
  const collapsible = document.getElementById("summary-collapsible");
  if (!cta || !collapsible) return;
  cta.addEventListener("click", () => {
    collapsible.classList.add("expanded");
    cta.classList.add("hidden");
    // Scroll fluide vers le premier champ du formulaire
    setTimeout(() => {
      const firstField = document.getElementById("f-societe");
      if (firstField) {
        firstField.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  });
  // Si le visiteur clique le CTA "Envoyer" de la mobile-bar fixe ET que le form n'est pas encore révélé,
  // on force la révélation pour qu'il puisse remplir avant d'envoyer
  const mobileBarCta = document.querySelector(".mobile-bar-cta");
  if (mobileBarCta) {
    mobileBarCta.addEventListener("click", () => {
      if (!collapsible.classList.contains("expanded")) {
        collapsible.classList.add("expanded");
        cta.classList.add("hidden");
      }
    }, true); // capture phase pour passer avant le handler natif du bouton
  }
})();

// ═══ Nav : burger menu + état scrolled ═══
(function() {
  const burger = document.getElementById("burger-btn");
  const links = document.getElementById("nav-links");
  if (burger && links) {
    burger.addEventListener("click", () => {
      const isOpen = links.classList.toggle("open");
      burger.classList.toggle("open", isOpen);
      burger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    // Close on link click (mobile)
    links.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => {
        if (links.classList.contains("open")) {
          links.classList.remove("open");
          burger.classList.remove("open");
          burger.setAttribute("aria-expanded", "false");
        }
      });
    });
  }
  const navbar = document.getElementById("navbar");
  if (navbar) {
    const onScroll = () => navbar.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    // Mesure la hauteur réelle de la nav et la met dans une variable CSS
    // (utilisée par le panel récap sticky pour ne pas être caché derrière)
    const setNavH = () => {
      const h = navbar.offsetHeight;
      if (h) document.documentElement.style.setProperty("--nav-h", h + "px");
    };
    setNavH();
    window.addEventListener("resize", setNavH);
    // Petit délai pour laisser les fonts se charger
    setTimeout(setNavH, 200);
  }

  // ═══ Auto-application d'un code partenaire depuis l'URL ═══
  // Permet d'avoir une URL dédiée par partenaire :
  //   https://www.nomacast.fr/tarifs.html?p=e52vnc      → token opaque (nouveau format)
  //   https://www.nomacast.fr/tarifs.html?code=MORNING  → code interne (rétro-compat des anciens liens)
  // Le visiteur arrive avec son tarif déjà chargé, sans devoir saisir quoi que ce soit.
  try {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = (params.get("p") || "").toLowerCase().trim();
    const codeParam = (params.get("code") || params.get("partner") || "").toUpperCase().trim();
    // Priorité au token opaque s'il est présent (format moderne), sinon fallback au code
    if (tokenParam) {
      setTimeout(() => {
        applyPartnerCode(tokenParam, "token");
      }, 50);
    } else if (codeParam) {
      setTimeout(() => {
        applyPartnerCode(codeParam, "code");
      }, 50);
    }
  } catch(e) { /* silent : pas de URLSearchParams = très vieux navigateur */ }
})();

// ─── FAQ tarifs : ouverture/fermeture (1 seul item ouvert à la fois) ───
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(el => el.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});
