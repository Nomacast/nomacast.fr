// functions/api/admin/events/[id]/messages/[msgId].js
// PATCH  /api/admin/events/:id/messages/:msgId  →  Approve / reject un message
// DELETE /api/admin/events/:id/messages/:msgId  →  Supprime un message définitivement
//
// Auth : middleware Basic Auth admin
//
// PATCH body : { action: 'approve' } | { action: 'reject' }
// Utilisé par la page régie admin pour modérer les questions du chat Q&A.

export const onRequestPatch = async ({ params, request, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  let data;
  try { data = await request.json(); }
  catch (e) { return jsonResponse({ error: 'JSON invalide' }, 400); }

  const action = (data.action || '').toString();
  if (!['approve', 'reject'].includes(action)) {
    return jsonResponse({ error: 'action invalide (approve | reject)' }, 400);
  }

  // Vérifier que le message existe et appartient bien à l'event
  const msg = await env.DB.prepare(
    'SELECT id, event_id, status FROM chat_messages WHERE id = ? AND event_id = ?'
  ).bind(params.msgId, params.id).first();
  if (!msg) return jsonResponse({ error: 'Message introuvable' }, 404);

  const now = new Date().toISOString();
  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  try {
    if (action === 'approve') {
      await env.DB.prepare(`
        UPDATE chat_messages
           SET status = 'approved', approved_at = ?, rejected_at = NULL
         WHERE id = ?
      `).bind(now, params.msgId).run();
    } else {
      await env.DB.prepare(`
        UPDATE chat_messages
           SET status = 'rejected', rejected_at = ?, approved_at = NULL
         WHERE id = ?
      `).bind(now, params.msgId).run();
    }
  } catch (err) {
    console.error('[admin/messages PATCH]', err);
    return jsonResponse({ error: err.message }, 500);
  }

  return jsonResponse({
    success: true,
    message: { id: params.msgId, status: newStatus }
  });
};

export const onRequestDelete = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  const msg = await env.DB.prepare(
    'SELECT id FROM chat_messages WHERE id = ? AND event_id = ?'
  ).bind(params.msgId, params.id).first();
  if (!msg) return jsonResponse({ error: 'Message introuvable' }, 404);

  try {
    await env.DB.prepare('DELETE FROM chat_messages WHERE id = ?').bind(params.msgId).run();
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }

  return jsonResponse({ success: true, deleted: params.msgId });
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
