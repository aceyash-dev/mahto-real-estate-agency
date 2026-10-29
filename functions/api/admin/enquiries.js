import { neon } from "@neondatabase/serverless";
import { getSession, sameOrigin } from "../../_lib/auth.js";
const out = (d, s = 200) => Response.json(d, { status: s, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Authorization" } });
function auth(request, expected) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !token) return false;
  const a = new TextEncoder().encode(token), b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
const missingColumn = e => /handled_at/.test(String(e && e.message)) && /column|exist/i.test(String(e && e.message));

/* GET  /api/admin/enquiries?q=&status=all|new|handled&limit=&offset=   (Bearer ADMIN_API_TOKEN)
   PATCH /api/admin/enquiries  { id, handled: boolean } */
export async function onRequest({ request, env }) {
  if (!["GET", "PATCH"].includes(request.method)) return out({ error: "Method not allowed." }, 405);
  const session = await getSession(request, env);
  if (!(session && session.role === "admin" && sameOrigin(request))) {
    if (!env.ADMIN_API_TOKEN) return out({ error: "Admin access is not configured." }, 503);
    if (!auth(request, env.ADMIN_API_TOKEN)) { await new Promise(r => setTimeout(r, 400)); return out({ error: "Unauthorized." }, 401); }
  }
  if (!env.DATABASE_URL) return out({ error: "Database is not configured." }, 503);
  const sql = neon(env.DATABASE_URL);
  try {
    if (request.method === "PATCH") {
      let b; try { b = await request.json(); } catch { return out({ error: "Invalid JSON request." }, 400); }
      const id = Number(b.id);
      if (!Number.isSafeInteger(id) || id < 1 || typeof b.handled !== "boolean") return out({ error: "Valid id and handled flag are required." }, 400);
      const rows = await sql`UPDATE enquiries SET handled_at = ${b.handled ? new Date().toISOString() : null} WHERE id = ${id} RETURNING id, handled_at`;
      return rows.length ? out({ ok: true, id: rows[0].id, handled_at: rows[0].handled_at }) : out({ error: "Enquiry not found." }, 404);
    }
    const u = new URL(request.url);
    const q = (u.searchParams.get("q") || "").trim().slice(0, 80), like = q ? `%${q.replace(/[%_\\]/g, m => "\\" + m)}%` : null;
    const status = ["new", "handled"].includes(u.searchParams.get("status")) ? u.searchParams.get("status") : "all";
    const limit = Math.min(Math.max(parseInt(u.searchParams.get("limit"), 10) || 50, 1), 200), offset = Math.max(parseInt(u.searchParams.get("offset"), 10) || 0, 0);
    let rows, total, handledColumn = true;
    try {
      rows = await sql`SELECT id, name, phone, email, interest, property_type, location, budget, details, source, created_at, handled_at FROM enquiries
        WHERE (${like}::text IS NULL OR name ILIKE ${like} OR phone ILIKE ${like} OR email ILIKE ${like} OR location ILIKE ${like} OR details ILIKE ${like} OR interest ILIKE ${like})
          AND (${status} = 'all' OR (${status} = 'new' AND handled_at IS NULL) OR (${status} = 'handled' AND handled_at IS NOT NULL))
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      total = (await sql`SELECT COUNT(*)::int AS n FROM enquiries
        WHERE (${like}::text IS NULL OR name ILIKE ${like} OR phone ILIKE ${like} OR email ILIKE ${like} OR location ILIKE ${like} OR details ILIKE ${like} OR interest ILIKE ${like})
          AND (${status} = 'all' OR (${status} = 'new' AND handled_at IS NULL) OR (${status} = 'handled' AND handled_at IS NOT NULL))`)[0].n;
    } catch (e) {
      if (!missingColumn(e)) throw e;
      handledColumn = false;
      rows = await sql`SELECT id, name, phone, email, interest, property_type, location, budget, details, source, created_at FROM enquiries
        WHERE (${like}::text IS NULL OR name ILIKE ${like} OR phone ILIKE ${like} OR email ILIKE ${like} OR location ILIKE ${like} OR details ILIKE ${like})
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      total = (await sql`SELECT COUNT(*)::int AS n FROM enquiries`)[0].n;
    }
    return out({ enquiries: rows, total, handledColumn, emailNotifications: Boolean(env.RESEND_API_KEY && env.ENQUIRY_FROM_EMAIL && env.ENQUIRY_NOTIFICATION_TO) });
  } catch (e) {
    console.error("admin enquiries failed", e instanceof Error ? e.message : "unknown");
    return out({ error: "Could not read enquiries." }, 500);
  }
}
