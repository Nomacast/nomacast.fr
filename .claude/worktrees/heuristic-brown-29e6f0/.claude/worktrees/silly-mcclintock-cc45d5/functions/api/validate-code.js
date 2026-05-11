// /api/validate-code?p=token   (nouveau, lien partenaire opaque)
// /api/validate-code?code=CODE  (rétro-compat, ancien lien)
//
// Cette fonction tourne sur les serveurs Cloudflare (jamais dans le navigateur).
// Elle lit la base partenaires dans le KV namespace bindé sous PARTNERS, clé "data".
// Format attendu de la valeur KV (clé "data") :
//   { "tokens": { "abc123": "FIGMA", ... }, "codes": { "FIGMA": { displayName, type, active, durations, forceOptions, discountTiers, description }, ... } }
// Renvoie au site : { valid:true, code, displayName, data:{durations, forceOptions, discountTiers, description} } ou { valid:false } selon le cas.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const tokenParam = (url.searchParams.get("p") || "").toLowerCase().trim();
  const codeParam = (url.searchParams.get("code") || "").toUpperCase().trim();

  // Au moins un des deux paramètres doit être fourni
  if (!tokenParam && !codeParam) {
    return jsonResponse({ valid: false }, 400);
  }

  // Validation des entrées avant lookup (anti-injection, anti-fuzzing)
  if (tokenParam && !/^[a-z0-9]{4,12}$/.test(tokenParam)) {
    return jsonResponse({ valid: false }, 400);
  }
  if (codeParam && !/^[A-Z0-9]{2,30}$/.test(codeParam)) {
    return jsonResponse({ valid: false }, 400);
  }

  // Lecture KV
  let store;
  try {
    const raw = await context.env.PARTNERS.get("data");
    if (!raw) {
      return jsonResponse({ valid: false, error: "no_data" }, 500);
    }
    store = JSON.parse(raw);
  } catch (e) {
    return jsonResponse({ valid: false, error: "kv_error" }, 500);
  }

  // Résolution : token → code interne, ou code direct (rétro-compat)
  let internalCode;
  if (tokenParam) {
    internalCode = store.tokens && store.tokens[tokenParam];
    if (!internalCode) {
      return jsonResponse({ valid: false }, 404);
    }
  } else {
    internalCode = codeParam;
  }

  // Lookup du code dans le mapping principal
  const entry = store.codes && store.codes[internalCode];
  if (!entry) {
    return jsonResponse({ valid: false }, 404);
  }

  // Vérification du flag actif (permet de désactiver un partenaire sans le supprimer)
  if (entry.active === false) {
    return jsonResponse({ valid: false, reason: "inactive" }, 410);
  }

  // Si l'utilisateur arrive via l'ancien format ?code= mais que la rétro-compat est désactivée
  // pour ce partenaire spécifiquement, on rejette. L'absence du champ legacyEnabled = activé par défaut
  // (compat des 24 partenaires migrés). Seul legacyEnabled === false bloque.
  if (codeParam && entry.legacyEnabled === false) {
    return jsonResponse({ valid: false, reason: "legacy_disabled" }, 410);
  }

  // Construction de la réponse : on n'expose que les champs utiles au client
  const responseData = {
    durations: entry.durations,
    forceOptions: entry.forceOptions,
    discountTiers: entry.discountTiers,
    description: entry.description
  };

  return jsonResponse({
    valid: true,
    code: internalCode,
    displayName: entry.displayName || internalCode,
    data: responseData
  }, 200);
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
