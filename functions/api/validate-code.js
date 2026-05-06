// /api/validate-code?code=FIGMA
// Cette fonction tourne sur les serveurs Cloudflare (jamais dans le navigateur).
// Elle reçoit un code partenaire, vérifie s'il est valide dans la liste stockée
// dans la variable d'environnement PARTNER_CODES_JSON, et renvoie au site
// les infos du code (remises, options forcées, etc) ou une erreur si invalide.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const rawCode = (url.searchParams.get("code") || "").toUpperCase().trim();

  // Validation basique : alphanumérique uniquement, 2 à 30 caractères
  if (!/^[A-Z0-9]{2,30}$/.test(rawCode)) {
    return jsonResponse({ valid: false }, 400);
  }

  let codes;
  try {
    codes = JSON.parse(context.env.PARTNER_CODES_JSON || "{}");
  } catch (e) {
    return jsonResponse({ valid: false, error: "config" }, 500);
  }

  const match = codes[rawCode];
  if (!match) {
    return jsonResponse({ valid: false }, 404);
  }

  return jsonResponse({ valid: true, code: rawCode, data: match }, 200);
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
