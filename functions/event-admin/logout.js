// functions/event-admin/logout.js
// POST /event-admin/logout    → efface le cookie session, redirige vers /event-admin/login
// GET  /event-admin/logout    → idem (pratique pour faire un lien direct)
//
// nomacast-client-credentials-v1

import { buildClearCookieHeader } from '../_lib/session.js';

export const onRequestGet = handler;
export const onRequestPost = handler;

async function handler({ request }) {
  const loginUrl = new URL('/event-admin/login', request.url).toString();
  return new Response(null, {
    status: 302,
    headers: {
      'Location': loginUrl,
      'Set-Cookie': buildClearCookieHeader(),
      'Cache-Control': 'no-store'
    }
  });
}
