// An explicit, user-submitted safety report. Authentication and CSRF are
// enforced by the parent API before this router is called.
const SURFACES = new Set(['home', 'workspace', 'dashboard', 'jalalai', 'jarvis', 'agent', 'arena', 'toolbench']);
const CATEGORIES = new Set(['offensive', 'unsafe', 'misleading', 'other']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function contentReportRoute({ request, db, me, url, readBody, reply, audit, consumeRateLimit }) {
  if (url.pathname === '/api/content-reports' && request.method === 'POST') {
    const input = await readBody(request, 32 * 1024);
    if (typeof input.surface !== 'string' || !SURFACES.has(input.surface) ||
        typeof input.category !== 'string' || !CATEGORIES.has(input.category) ||
        typeof input.excerpt !== 'string' || typeof (input.details ?? '') !== 'string') {
      return reply({ error: 'Choose a valid page and category, and enter the content to report.' }, 400);
    }
    const excerpt = input.excerpt.trim(), details = (input.details || '').trim();
    if (!excerpt) return reply({ error: 'Enter the content you want to report.' }, 400);
    if (excerpt.length > 5000 || details.length > 1000) return reply({ error: 'The report is too long.' }, 413);
    if (!await consumeRateLimit(db, 'content-reports', me.id, 10, 360)) return reply({ error: 'Too many reports. Please wait and retry.' }, 429);
    const id = crypto.randomUUID();
    try {
      await db.query('INSERT INTO content_reports (id,user_id,surface,category,excerpt,details) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, me.id, input.surface, input.category, excerpt, details]);
    } catch (error) {
      if (error?.code === '42P01') return reply({ error: 'Reporting is unavailable until an administrator updates the database schema.' }, 503);
      throw error;
    }
    // Do not copy the reported text into the general audit log.
    await audit(db, me, 'CONTENT_REPORT_SUBMITTED', `Report ${id}; category ${input.category}`, request);
    return reply({ ok: true, id }, 201);
  }

  if (url.pathname === '/api/admin/content-reports' && request.method === 'GET') {
    if (me.role !== 'Admin') return reply({ error: 'Admin role required' }, 403);
    const reports = await db.query(`SELECT r.id,r.surface,r.category,r.excerpt,r.details,r.status,r.created_at,r.reviewed_at,u.username
      FROM content_reports r JOIN app_users u ON u.id=r.user_id
      ORDER BY CASE WHEN r.status='open' THEN 0 ELSE 1 END,
        CASE WHEN r.status='open' THEN r.created_at END ASC, r.created_at DESC LIMIT 50`);
    return reply({ reports, note: 'Up to 50 reports are shown, with the oldest open reports first.' });
  }

  const match = url.pathname.match(/^\/api\/admin\/content-reports\/([^/]+)\/review$/);
  if (match && request.method === 'POST') {
    if (me.role !== 'Admin') return reply({ error: 'Admin role required' }, 403);
    if (!UUID.test(match[1])) return reply({ error: 'Invalid report ID' }, 400);
    const input = await readBody(request, 1024);
    if (input.confirm !== true) return reply({ error: 'Confirm that you reviewed this report.' }, 400);
    const rows = await db.query("UPDATE content_reports SET status='reviewed', reviewed_at=now() WHERE id=$1 AND status='open' RETURNING id", [match[1]]);
    if (!rows.length) return reply({ error: 'Report not found or already reviewed.' }, 404);
    await audit(db, me, 'CONTENT_REPORT_REVIEWED', `Report ${match[1]}`, request);
    return reply({ ok: true });
  }
  return null;
}
