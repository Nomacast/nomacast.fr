// functions/chat/[slug]/calendar.ics.js
// GET /chat/:slug/calendar.ics
// Génère un fichier iCalendar (.ics) pour ajouter l'event à n'importe quel agenda
// (Apple Calendar, Outlook desktop, Thunderbird, etc.)

export const onRequestGet = async ({ params, env, request }) => {
  if (!env.DB) return new Response('Database error', { status: 500 });

  const event = await env.DB.prepare(`
    SELECT id, slug, title, client_name, scheduled_at, duration_minutes, access_mode
      FROM events WHERE slug = ?
  `).bind(params.slug).first();

  if (!event) return new Response('Event not found', { status: 404 });
  if (event.access_mode === 'private') {
    return new Response('Cet événement est privé. Utilisez votre lien d\'invitation personnel.', { status: 403 });
  }
  if (!event.scheduled_at) return new Response('Event date not set', { status: 400 });

  const url = new URL(request.url);
  const chatLink = `${url.origin}/chat/${event.slug}` + (url.searchParams.get('t') ? `?t=${url.searchParams.get('t')}` : '');

  const ics = buildIcs(event, chatLink);

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${event.slug}.ics"`,
      'Cache-Control': 'public, max-age=300',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
};

function buildIcs(event, chatLink) {
  const dtStart = toIcsDate(event.scheduled_at);
  const dtEnd = toIcsDate(addMinutes(event.scheduled_at, event.duration_minutes || 90));
  const dtStamp = toIcsDate(new Date().toISOString());
  const uid = `${event.id}@nomacast.fr`;

  const title = icsEscape(event.title);
  const orgLine = event.client_name ? ` (${event.client_name})` : '';
  const summary = title + (orgLine ? icsEscape(orgLine) : '');
  const description = icsEscape(
    `Chat live de l'événement « ${event.title} »${event.client_name ? `, organisé par ${event.client_name}` : ''}.\n\n` +
    `Pour rejoindre le chat le jour J :\n${chatLink}\n\n` +
    `Propulsé par Nomacast — https://nomacast.fr`
  );
  const location = icsEscape(chatLink);

  // Format iCalendar strict (CRLF \r\n, lignes max 75 chars conseillé mais souvent souple)
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nomacast//Chat Live//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `URL:${chatLink}`,
    `LOCATION:${location}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

function toIcsDate(iso) {
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function addMinutes(iso, mins) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + (mins || 0));
  return d.toISOString();
}

function icsEscape(s) {
  if (!s) return '';
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}
