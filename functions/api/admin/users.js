import { neon } from "@neondatabase/serverless";
import { json, require, hashPassword, ensureSchema, ROLES } from "../../_lib/auth.js";
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const txt = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/* Admin only. GET list; POST {email,name,role,password,phone}; PATCH {id, is_active?, password?, role?, name?} */
export async function onRequest({ request, env }) {
  const s = await require(request, env, ["admin"]); if (s instanceof Response) return s;
  if (!env.DATABASE_URL) return json({ error: "Database is not configured." }, 503);
  const sql = neon(env.DATABASE_URL);
  try {
    await ensureSchema(sql);
    if (request.method === "GET") return json({ users: await sql`SELECT id, email, name, phone, role, is_active, created_at, last_login_at FROM users ORDER BY created_at DESC LIMIT 500` });
    let b; try { b = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
    if (request.method === "POST") {
      const email = txt(b.email, 254).toLowerCase(), name = txt(b.name, 100), role = txt(b.role, 10), pw = String(b.password || "");
      if (!emailRe.test(email) || name.length < 2 || !ROLES.includes(role) || pw.length < 10) return json({ error: "Valid email, name, role and a password of at least 10 characters are required." }, 400);
      try {
        const r = await sql`INSERT INTO users (email, name, phone, role, password_hash) VALUES (${email}, ${name}, ${txt(b.phone, 20) || null}, ${role}, ${await hashPassword(pw)}) RETURNING id, email, name, role, is_active`;
        return json({ user: r[0] }, 201);
      } catch (e) { return /unique|duplicate/i.test(String(e.message)) ? json({ error: "A user with that email already exists." }, 409) : Promise.reject(e); }
    }
    if (request.method === "PATCH") {
      const id = Number(b.id); if (!Number.isSafeInteger(id) || id < 1) return json({ error: "Valid user id required." }, 400);
      if (typeof b.is_active === "boolean") await sql`UPDATE users SET is_active = ${b.is_active} WHERE id = ${id}`;
      if (b.role !== undefined) { if (!ROLES.includes(b.role)) return json({ error: "Unsupported role." }, 400); await sql`UPDATE users SET role = ${b.role} WHERE id = ${id}`; }
      if (b.name !== undefined && txt(b.name, 100).length >= 2) await sql`UPDATE users SET name = ${txt(b.name, 100)} WHERE id = ${id}`;
      if (b.password !== undefined) { if (String(b.password).length < 10) return json({ error: "Password must be at least 10 characters." }, 400); await sql`UPDATE users SET password_hash = ${await hashPassword(String(b.password))} WHERE id = ${id}`; }
      const r = await sql`SELECT id, email, name, role, is_active FROM users WHERE id = ${id}`;
      return r.length ? json({ user: r[0] }) : json({ error: "User not found." }, 404);
    }
    return json({ error: "Method not allowed." }, 405);
  } catch (e) { console.error("users failed", e instanceof Error ? e.message : "unknown"); return json({ error: "Could not complete that request." }, 500); }
}
