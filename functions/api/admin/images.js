import { neon } from "@neondatabase/serverless";
import { json, require, ensureSchema } from "../../_lib/auth.js";

const MAX_IMAGES = 8, MAX_B64 = 600000; /* ~450 KB per photo after client-side resize */

/* POST {property_id, data_url, alt?}  DELETE {id}. Owner of the listing or admin. The first photo becomes the cover. */
export async function onRequest({ request, env }) {
  const s = await require(request, env); if (s instanceof Response) return s;
  if (!env.DATABASE_URL) return json({ error: "Database is not configured." }, 503);
  if (!["POST", "DELETE"].includes(request.method)) return json({ error: "Method not allowed." }, 405);
  let b; try { b = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const sql = neon(env.DATABASE_URL), origin = new URL(request.url).origin;
  try {
    await ensureSchema(sql);
    if (request.method === "DELETE") {
      const id = Number(b.id); if (!Number.isSafeInteger(id)) return json({ error: "Valid id required." }, 400);
      const img = (await sql`SELECT i.id, i.property_id, p.owner_user_id FROM listing_images i JOIN properties p ON p.id = i.property_id WHERE i.id = ${id}`)[0];
      if (!img) return json({ error: "Photo not found." }, 404);
      if (s.role !== "admin" && Number(img.owner_user_id) !== s.uid) return json({ error: "Not your listing." }, 403);
      await sql`DELETE FROM listing_images WHERE id = ${id}`; await refresh(sql, img.property_id, origin);
      return json({ ok: true });
    }
    const pid = Number(b.property_id), m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data_url || ""));
    if (!Number.isSafeInteger(pid) || !m) return json({ error: "Send a JPEG, PNG or WebP image." }, 400);
    if (m[2].length > MAX_B64) return json({ error: "That photo is too large. Try a smaller one." }, 413);
    const p = (await sql`SELECT id, owner_user_id FROM properties WHERE id = ${pid}`)[0];
    if (!p) return json({ error: "Listing not found." }, 404);
    if (s.role !== "admin" && Number(p.owner_user_id) !== s.uid) return json({ error: "Not your listing." }, 403);
    if ((await sql`SELECT COUNT(*)::int AS n FROM listing_images WHERE property_id = ${pid}`)[0].n >= MAX_IMAGES) return json({ error: `A listing can have up to ${MAX_IMAGES} photos.` }, 400);
    const r = (await sql`INSERT INTO listing_images (property_id, mime, data_b64) VALUES (${pid}, ${m[1]}, ${m[2]}) RETURNING id`)[0];
    await refresh(sql, pid, origin);
    return json({ id: r.id, url: `${origin}/api/listing-image?id=${r.id}` }, 201);
  } catch (e) { console.error("images failed", e instanceof Error ? e.message : "unknown"); return json({ error: "Could not save the photo." }, 500); }
}

/* Keep properties.photo_url / photos in step with the uploaded images (owner confirmed rights in the form). */
async function refresh(sql, pid, origin) {
  const ids = (await sql`SELECT id FROM listing_images WHERE property_id = ${pid} ORDER BY id`).map(r => r.id);
  const photos = ids.map(id => ({ url: `${origin}/api/listing-image?id=${id}`, alt: "Property photo", authorized: true }));
  await sql`UPDATE properties SET photo_url = ${photos[0] ? photos[0].url : null}, photos = ${JSON.stringify(photos)}::jsonb, updated_at = NOW() WHERE id = ${pid}`;
}
