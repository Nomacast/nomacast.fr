// functions/api/admin/events/[id]/invitees/[invitee_id].js
// DELETE /api/admin/events/:id/invitees/:invitee_id  → supprime un invité.
// Le magic_token associé disparaît avec la row, le magic link devient invalide.

export const onRequestDelete = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB manquant' }, 500);

  try {
    const result = await env.DB.prepare(
      'DELETE FROM invitees WHERE id = ? AND event_id = ?'
    ).bind(params.invitee_id, params.id).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ error: 'Invité introuvable pour cet event' }, 404);
    }
    return jsonResponse({ success: true, deleted_id: params.invitee_id });
  } catch (err) {
    console.error('[invitees/:invitee_id DELETE]', err);
    return jsonResponse({ error: err.message }, 500);
  }
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
