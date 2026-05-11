// /nmc-7k9q3p2x/api/partners
// CRUD admin pour gérer les partenaires via le KV namespace bindé sous PARTNERS.
//
// GET    : retourne {tokens, codes} (liste complète)
// POST   : crée un partenaire { code, displayName, type, active? }
// PUT    : modifie un partenaire { code, displayName?, type?, active? }
// DELETE : supprime un partenaire { code }
//
// Note : protégée uniquement par l'obscurité de l'URL slug. Pas d'auth forte.
// Si le slug fuit, n'importe qui peut éditer la base. À durcir avec un mot de passe
// si nécessaire dans une future itération.

const TYPE_DEFINITIONS = {
  "standard": {
    forceOptions: [],
    description: "Tarif partenaire + remise par palier"
  },
  "premium-reperage": {
    forceOptions: ["reperage", "veille", "5g"],
    description: "Repérage, mise en place J-1, 5G de secours + remise par palier"
  },
  "premium-reperage-montage": {
    forceOptions: ["reperage", "veille", "5g", "montage_tc"],
    description: "Repérage, mise en place J-1, 5G de secours, montage par chapitres + remise par palier"
  }
};

const STANDARD_TIERS = [
  { minHT: 1500, amount: 150, charmAllowed: true },
  { minHT: 2000, amount: 200, charmAllowed: true },
  { minHT: 2250, amount: 250, charmAllowed: true },
  { minHT: 2500, amount: 350, charmAllowed: true },
  { minHT: 2750, amount: 450, charmAllowed: true },
  { minHT: 3000, amount: 550, charmAllowed: true },
  { minHT: 3250, amount: 700, charmAllowed: true },
  { minHT: 3500, amount: 800, charmAllowed: true },
  { minHT: 4000, amount: 1000, charmAllowed: true },
  { minHT: 5000, amount: 1200, charmAllowed: true },
  { minHT: 6000, amount: 1400, charmAllowed: true }
];
const STANDARD_DURATIONS = { half: 1500, full: 1750, "2days": 2250, "3days": 3000 };

// ─── Helpers ───

const TOKEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function genUniqueToken(existingTokens, length = 6) {
  for (let attempts = 0; attempts < 100; attempts++) {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    let t = "";
    for (let i = 0; i < length; i++) {
      t += TOKEN_ALPHABET[buf[i] % TOKEN_ALPHABET.length];
    }
    if (!existingTokens[t]) return t;
  }
  throw new Error("Could not generate unique token after 100 attempts");
}

async function readStore(env) {
  const raw = await env.PARTNERS.get("data");
  if (!raw) return { tokens: {}, codes: {} };
  return JSON.parse(raw);
}

async function writeStore(env, store) {
  await env.PARTNERS.put("data", JSON.stringify(store));
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function err(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

function validateCode(code) {
  return typeof code === "string" && /^[A-Z0-9]{2,30}$/.test(code);
}

function validateDisplayName(name) {
  return typeof name === "string" && name.trim().length >= 1 && name.length <= 60;
}

function validateType(type) {
  return Object.prototype.hasOwnProperty.call(TYPE_DEFINITIONS, type);
}

// ─── Endpoints ───

export async function onRequestGet(context) {
  try {
    const store = await readStore(context.env);
    return json(store);
  } catch (e) {
    return err("kv_read_error", 500);
  }
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return err("invalid_json");
  }

  const code = (body.code || "").toUpperCase().trim();
  const displayName = (body.displayName || "").trim();
  const type = (body.type || "standard").trim();
  const active = body.active !== false;
  // Sécurité par défaut : un nouveau partenaire n'a JAMAIS reçu d'ancien lien donc legacyEnabled false par défaut.
  // L'utilisateur doit explicitement cocher la case dans l'admin pour autoriser ?code=NOMCODE.
  const legacyEnabled = body.legacyEnabled === true;

  if (!validateCode(code)) return err("invalid_code");
  if (!validateDisplayName(displayName)) return err("invalid_display_name");
  if (!validateType(type)) return err("invalid_type");

  let store;
  try {
    store = await readStore(context.env);
  } catch {
    return err("kv_read_error", 500);
  }

  if (store.codes[code]) {
    return err("code_already_exists", 409);
  }

  // Génération token unique
  let token;
  try {
    token = genUniqueToken(store.tokens);
  } catch {
    return err("token_generation_failed", 500);
  }

  const typeDef = TYPE_DEFINITIONS[type];
  store.tokens[token] = code;
  store.codes[code] = {
    displayName,
    type,
    active,
    legacyEnabled,
    durations: { ...STANDARD_DURATIONS },
    forceOptions: typeDef.forceOptions,
    discountTiers: STANDARD_TIERS.map(t => ({ ...t })),
    description: typeDef.description,
    createdAt: new Date().toISOString().slice(0, 10)
  };

  try {
    await writeStore(context.env, store);
  } catch {
    return err("kv_write_error", 500);
  }

  return json({ ok: true, code, token, displayName, type, active, legacyEnabled });
}

export async function onRequestPut(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return err("invalid_json");
  }

  const code = (body.code || "").toUpperCase().trim();
  if (!validateCode(code)) return err("invalid_code");

  let store;
  try {
    store = await readStore(context.env);
  } catch {
    return err("kv_read_error", 500);
  }

  const entry = store.codes[code];
  if (!entry) return err("code_not_found", 404);

  // Mise à jour des champs fournis (les autres restent inchangés)
  if (body.displayName !== undefined) {
    if (!validateDisplayName(body.displayName)) return err("invalid_display_name");
    entry.displayName = body.displayName.trim();
  }
  if (body.type !== undefined) {
    if (!validateType(body.type)) return err("invalid_type");
    entry.type = body.type;
    const typeDef = TYPE_DEFINITIONS[body.type];
    entry.forceOptions = typeDef.forceOptions;
    entry.description = typeDef.description;
  }
  if (body.active !== undefined) {
    entry.active = !!body.active;
  }
  if (body.legacyEnabled !== undefined) {
    if (typeof body.legacyEnabled !== "boolean") return err("invalid_legacyEnabled");
    entry.legacyEnabled = body.legacyEnabled;
  }

  try {
    await writeStore(context.env, store);
  } catch {
    return err("kv_write_error", 500);
  }

  return json({ ok: true, code, ...entry });
}

export async function onRequestDelete(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return err("invalid_json");
  }

  const code = (body.code || "").toUpperCase().trim();
  if (!validateCode(code)) return err("invalid_code");

  let store;
  try {
    store = await readStore(context.env);
  } catch {
    return err("kv_read_error", 500);
  }

  if (!store.codes[code]) return err("code_not_found", 404);

  // Retirer le code et son token associé
  delete store.codes[code];
  for (const [token, c] of Object.entries(store.tokens)) {
    if (c === code) delete store.tokens[token];
  }

  try {
    await writeStore(context.env, store);
  } catch {
    return err("kv_write_error", 500);
  }

  return json({ ok: true, deleted: code });
}
