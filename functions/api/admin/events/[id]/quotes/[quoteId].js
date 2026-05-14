// functions/api/admin/events/[id]/quotes/[quoteId].js
// PATCH/DELETE individual quote

export const onRequestPatch = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    let data;
    try { data = await request.json(); } catch (e) { return json({ error: 'JSON invalide' }, 400); }
    const status = (data.status || '').toString();
    const updates = [];
    const binds = [];

    if (status) {
      if (!['approved', 'rejected', 'pinned'].includes(status)) {
        return json({ error: 'status invalide' }, 400);
      }
      const now = new Date().toISOString();
      if (status === 'pinned') {
        await env.DB.prepare(`
          UPDATE event_quotes SET status = 'approved' WHERE event_id = ? AND status = 'pinned' AND id != ?
        `).bind(params.id, params.quoteId).run();
      }
      if (status === 'approved' || status === 'pinned') {
        updates.push('status = ?', 'approved_at = COALESCE(approved_at, ?)');
        binds.push(status, now);
      } else {
        updates.push('status = ?');
        binds.push(status);
      }
    }

    // Le admin peut aussi corriger speaker_name si fourni
    if (typeof data.speaker_name === 'string') {
      updates.push('speaker_name = ?');
      binds.push(data.speaker_name.trim().slice(0, 100) || null);
    }
    if (typeof data.content === 'string') {
      const c = data.content.trim();
      if (c.length > 0 && c.length <= 280) {
        updates.push('content = ?');
        binds.push(c);
      }
    }

    if (updates.length === 0) return json({ error: 'Aucune mise à jour' }, 400);

    binds.push(params.quoteId, params.id);
    await env.DB.prepare(`
      UPDATE event_quotes SET ${updates.join(', ')} WHERE id = ? AND event_id = ?
    `).bind(...binds).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

export const onRequestDelete = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    await env.DB.prepare(`
      DELETE FROM event_quotes WHERE id = ? AND event_id = ?
    `).bind(params.quoteId, params.id).run();
    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
