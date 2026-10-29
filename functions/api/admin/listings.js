import { neon } from "@neondatabase/serverless";
import { json, require, ensureSchema } from "../../_lib/auth.js";

const TYPES = ["Plot / Land", "House", "Flat / Apartment", "Commercial property", "Other"];
const STATUSES = ["Available", "Under Discussion", "Reserved", "Sold"];
const TEXT = { title: 180, locality: 120, district: 120, city: 120, state: 120, pin_code: 12, general_location: 220, area_unit: 20, summary: 300, description: 3000, photo_url: 500, photo_alt: 250 };
const slugify = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 150);
const num = v => (v === null || v === undefined || v === "" ? null : Number(v));
const COLS = "id, slug, title, property_type, locality, district, city, state, pin_code, general_location, asking_price, area_value, area_unit, summary, description, photo_url, photo_alt, availability_status, is_active, admin_approved, featured, owner_user_id, created_at, updated_at";

/* admin: all listings + approve/publish/feature.  broker/owner: only their own; new and edited listings stay unpublished until an admin approves.
   GET  /api/admin/listings        POST {title, property_type, ...}        PATCH {id, ...fields | action}        DELETE {id} */
export async function onRequest({ request, env }) {
  const s = await require(request, env); if (s instanceof Response) return s;
  if (!env.DATABASE_URL) return json({ error: "Database is not configured." }, 503);
  const sql = neon(env.DATABASE_URL), admin = s.role === "admin";
  try {
    await ensureSchema(sql);
    if (request.method === "GET") {
      const rows = admin ? await sql.query(`SELECT ${COLS} FROM properties WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 500`)
                         : await sql.query(`SELECT ${COLS} FROM properties WHERE owner_user_id = $1 AND archived_at IS NULL ORDER BY created_at DESC LIMIT 200`, [s.uid]);
      return json({ listings: rows, role: s.role });
    }
    let b; try { b = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }

    const fields = {}; 
    for (const [k, n] of Object.entries(TEXT)) if (k in b) { const v = typeof b[k] === "string" ? b[k].trim().slice(0, n) : ""; fields[k] = v || null; }
    if ("property_type" in b) { if (!TYPES.includes(b.property_type)) return json({ error: "Unsupported property type." }, 400); fields.property_type = b.property_type; }
    if ("availability_status" in b) { if (!STATUSES.includes(b.availability_status)) return json({ error: "Unsupported availability." }, 400); fields.availability_status = b.availability_status; }
    for (const k of ["asking_price", "area_value"]) if (k in b) { const v = num(b[k]); if (v !== null && (!Number.isFinite(v) || v < 0)) return json({ error: k + " must be a non-negative number." }, 400); fields[k] = v; }
    if (fields.photo_url && !/^https:\/\//.test(fields.photo_url)) return json({ error: "Photo URL must start with https://" }, 400);

    if (request.method === "POST") {
      if (!fields.title || fields.title.length < 3 || !fields.property_type) return json({ error: "Title and property type are required." }, 400);
      const slug = slugify(fields.title) + "-" + Math.random().toString(36).slice(2, 6);
      const source = `Submitted by ${s.role}: ${s.name}`.slice(0, 300);
      const keys = ["slug", "listing_source", "owner_user_id", ...Object.keys(fields)], vals = [slug, source, s.uid || null, ...Object.values(fields)];
      const r = await sql.query(`INSERT INTO properties (${keys.join(",")}, is_active, admin_approved) VALUES (${keys.map((_, i) => "$" + (i + 1)).join(",")}, FALSE, FALSE) RETURNING ${COLS}`, vals);
      return json({ listing: r[0], message: "Saved as unpublished. An admin must approve it before it appears on the site." }, 201);
    }

    const id = Number(b.id); if (!Number.isSafeInteger(id) || id < 1) return json({ error: "Valid listing id required." }, 400);
    const own = (await sql`SELECT id, owner_user_id, admin_approved FROM properties WHERE id = ${id}`)[0];
    if (!own) return json({ error: "Listing not found." }, 404);
    if (!admin && Number(own.owner_user_id) !== s.uid) return json({ error: "You can only manage your own listings." }, 403);

    if (request.method === "DELETE") {
      if (!admin && own.admin_approved) return json({ error: "Approved listings can only be removed by an admin." }, 403);
      await sql`UPDATE properties SET is_active = FALSE, admin_approved = FALSE, archived_at = NOW(), updated_at = NOW() WHERE id = ${id}`;
      return json({ ok: true });
    }
    if (request.method === "PATCH") {
      const sets = [], vals = [];
      for (const [k, v] of Object.entries(fields)) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
      if (admin) {
        if (b.action === "approve") { sets.push("is_active = TRUE", "admin_approved = TRUE", "reviewed_at = NOW()"); }
        else if (b.action === "pause") sets.push("is_active = FALSE");
        if (typeof b.featured === "boolean") { vals.push(b.featured); sets.push(`featured = $${vals.length}`); }
      } else if (Object.keys(fields).some(k => k !== "availability_status") && own.admin_approved) {
        sets.push("is_active = FALSE", "admin_approved = FALSE"); /* edits to a live listing go back to review */
      }
      if (!sets.length) return json({ error: "Nothing to update." }, 400);
      vals.push(id);
      const r = await sql.query(`UPDATE properties SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${vals.length} RETURNING ${COLS}`, vals);
      return json({ listing: r[0] });
    }
    return json({ error: "Method not allowed." }, 405);
  } catch (e) { console.error("listings failed", e instanceof Error ? e.message : "unknown"); return json({ error: "Could not complete that request." }, 500); }
}
