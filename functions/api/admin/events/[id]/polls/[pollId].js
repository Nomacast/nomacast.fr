// functions/api/admin/events/[id]/polls/[pollId].js
// GET    /api/admin/events/:id/polls/:pollId  → Détail du sondage avec options + résultats agrégés
// PATCH  /api/admin/events/:id/polls/:pollId  → Lance/clôture (status) ou modifie (question/options) si draft
// DELETE /api/admin/events/:id/polls/:pollId  → Suppression cascade (options + votes)
//
// Auth : middleware Basic Auth admin (hérité)

// ============================================================
// GET — détail + options + résultats agrégés (count par option)
// ============================================================
export const onRequestGet = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  const poll = await env.DB.prepare(`
    SELECT id, event_id, question, type, status, results_visibility,
           created_at, launched_at, closed_at
      FROM polls WHERE id = ? AND event_id = ?
  `).bind(params.pollId, params.id).first();
  if (!poll) return jsonResponse({ error: 'Sondage introuvable' }, 404);

  // Options avec compteurs de vote
  const optionsResult = await env.DB.prepare(`
    SELECT o.id, o.poll_id, o.label, o.position,
           (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) AS votes_count
      FROM poll_options o
     WHERE o.poll_id = ?
     ORDER BY o.position ASC
  `).bind(params.pollId).all();

  const options = optionsResult.results || [];
  const totalVotes = options.reduce((sum, o) => sum + (o.votes_count || 0), 0);

  // Calcul % pour chaque option
  const optionsWithPct = options.map(o => ({
    ...o,
    percentage: totalVotes > 0
      ? Math.round((o.votes_count / totalVotes) * 1000) / 10
      : 0
  }));

  return jsonResponse({
    poll: {
      ...poll,
      options: optionsWithPct,
      total_votes: totalVotes
    }
  });
};

// ============================================================
// PATCH — modifie status, question ou options
// Body : { status?, question?, options?, results_visibility? }
// Règles :
//   - status='live' → lance le sondage, ferme automatiquement les autres polls live
//   - status='closed' → ferme
//   - question/options modifiables uniquement si status='draft'
// ============================================================
export const onRequestPatch = async ({ params, request, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  let data;
  try { data = await request.json(); }
  catch (e) { return jsonResponse({ error: 'JSON invalide' }, 400); }

  // Vérifier poll existe
  const poll = await env.DB.prepare(
    'SELECT id, status FROM polls WHERE id = ? AND event_id = ?'
  ).bind(params.pollId, params.id).first();
  if (!poll) return jsonResponse({ error: 'Sondage introuvable' }, 404);

  const now = new Date().toISOString();

  // -------------------- Cas 1 : changement de status --------------------
  if (data.status) {
    if (!['draft', 'live', 'closed'].includes(data.status)) {
      return jsonResponse({ error: 'Status invalide' }, 400);
    }

    // Si on lance ce sondage → fermer les autres polls live de l'event
    if (data.status === 'live') {
      await env.DB.prepare(`
        UPDATE polls SET status = 'closed', closed_at = ?
         WHERE event_id = ? AND status = 'live' AND id != ?
      `).bind(now, params.id, params.pollId).run();

      await env.DB.prepare(`
        UPDATE polls SET status = 'live',
                         launched_at = COALESCE(launched_at, ?),
                         closed_at = NULL
         WHERE id = ?
      `).bind(now, params.pollId).run();
    } else if (data.status === 'closed') {
      await env.DB.prepare(`
        UPDATE polls SET status = 'closed', closed_at = ? WHERE id = ?
      `).bind(now, params.pollId).run();
    } else if (data.status === 'draft') {
      // Retour en brouillon (cas rare, supprime le launched_at pour cohérence)
      await env.DB.prepare(`
        UPDATE polls SET status = 'draft', launched_at = NULL, closed_at = NULL
         WHERE id = ?
      `).bind(params.pollId).run();
    }
  }

  // -------------------- Cas 2 : modification question / options --------------------
  if (data.question !== undefined || data.options !== undefined || data.results_visibility !== undefined) {
    // Modifications de contenu autorisées uniquement en draft
    const currentStatus = data.status || poll.status;
    if (currentStatus !== 'draft' && (data.question !== undefined || data.options !== undefined)) {
      return jsonResponse({
        error: 'Modification question/options interdite : le sondage doit être en draft'
      }, 409);
    }

    if (data.question !== undefined) {
      const q = (data.question || '').toString().trim();
      if (q.length < 3 || q.length > 300) {
        return jsonResponse({ error: 'Question : 3 à 300 caractères' }, 400);
      }
      await env.DB.prepare('UPDATE polls SET question = ? WHERE id = ?')
        .bind(q, params.pollId).run();
    }

    if (data.options !== undefined) {
      if (!Array.isArray(data.options)) {
        return jsonResponse({ error: 'options doit être un tableau' }, 400);
      }
      const opts = data.options
        .map(o => (o || '').toString().trim())
        .filter(o => o.length > 0);
      if (opts.length < 2 || opts.length > 8) {
        return jsonResponse({ error: 'options : 2 à 8 entrées' }, 400);
      }
      for (const o of opts) {
        if (o.length > 100) return jsonResponse({ error: 'Option : 100 caractères max' }, 400);
      }
      // Supprime les anciennes options + votes, puis ré-INSERT
      await env.DB.prepare('DELETE FROM poll_options WHERE poll_id = ?').bind(params.pollId).run();
      const stmts = opts.map((label, idx) =>
        env.DB.prepare(`
          INSERT INTO poll_options (id, poll_id, label, position)
          VALUES (?, ?, ?, ?)
        `).bind(crypto.randomUUID(), params.pollId, label, idx)
      );
      await env.DB.batch(stmts);
    }

    if (data.results_visibility !== undefined) {
      const validVisibilities = ['live', 'after-vote', 'after-close'];
      if (!validVisibilities.includes(data.results_visibility)) {
        return jsonResponse({ error: 'results_visibility invalide' }, 400);
      }
      await env.DB.prepare('UPDATE polls SET results_visibility = ? WHERE id = ?')
        .bind(data.results_visibility, params.pollId).run();
    }
  }

  // Réponse : poll mis à jour
  const updated = await env.DB.prepare(`
    SELECT id, event_id, question, type, status, results_visibility,
           created_at, launched_at, closed_at
      FROM polls WHERE id = ?
  `).bind(params.pollId).first();

  const opts = await env.DB.prepare(`
    SELECT id, poll_id, label, position FROM poll_options WHERE poll_id = ? ORDER BY position ASC
  `).bind(params.pollId).all();

  return jsonResponse({ poll: { ...updated, options: opts.results || [] } });
};

// ============================================================
// DELETE — suppression cascade (options + votes)
// ============================================================
export const onRequestDelete = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  const result = await env.DB.prepare(
    'DELETE FROM polls WHERE id = ? AND event_id = ?'
  ).bind(params.pollId, params.id).run();

  if (result.meta.changes === 0) {
    return jsonResponse({ error: 'Sondage introuvable' }, 404);
  }
  return jsonResponse({ success: true, deleted_id: params.pollId });
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
