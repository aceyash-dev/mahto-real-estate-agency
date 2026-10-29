import { neon } from "@neondatabase/serverless";
import { getSession, ensureSchema } from "../_lib/auth.js";

/* Serves an uploaded listing photo. Public only once the listing is approved and live; owners and admins can preview earlier. */
export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1 || !env.DATABASE_URL) return new Response("Not found", { status: 404 });
  try {
    const sql = neon(env.DATABASE_URL); await ensureSchema(sql);
    const r = (await sql`SELECT i.mime, i.data_b64, p.is_active, p.admin_approved, p.owner_user_id FROM listing_images i JOIN properties p ON p.id = i.property_id WHERE i.id = ${id}`)[0];
    if (!r) return new Response("Not found", { status: 404 });
    const live = r.is_active && r.admin_approved;
    if (!live) { const s = await getSession(request, env); if (!s || (s.role !== "admin" && Number(r.owner_user_id) !== s.uid)) return new Response("Not found", { status: 404 }); }
    const bin = Uint8Array.from(atob(r.data_b64), c => c.charCodeAt(0));
    return new Response(bin, { headers: { "Content-Type": r.mime, "Cache-Control": live ? "public, max-age=86400" : "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } });
  } catch (e) { return new Response("Unavailable", { status: 500 }); }
}
