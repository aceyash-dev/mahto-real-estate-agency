import { neon } from "@neondatabase/serverless";
import { json, safeEqual, hashPassword, verifyPassword, makeSession, cookieHeader, getSession, sameOrigin, ensureSchema } from "../../_lib/auth.js";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fails = new Map(); /* per-isolate throttle; the constant delay below is the real brake */

export async function onRequest({ request, env, params }) {
  const action = params.action;
  if (action === "me") {
    const s = await getSession(request, env);
    return s ? json({ user: { email: s.email, name: s.name, role: s.role } }) : json({ error: "Not signed in." }, 401);
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!sameOrigin(request)) return json({ error: "Cross-site request blocked." }, 403);
  if (action === "logout") return json({ ok: true }, 200, { "Set-Cookie": cookieHeader("") });
  if (action !== "login") return json({ error: "Not found." }, 404);
  if (!env.SESSION_SECRET) return json({ error: "Admin sign-in is not configured on the server yet." }, 503);

  let b; try { b = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const email = String(b.email || "").trim().toLowerCase().slice(0, 254), password = String(b.password || "").slice(0, 200);
  if (!emailRe.test(email) || !password) return json({ error: "Enter your email and password." }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "x", now = Date.now(), f = fails.get(ip) || { n: 0, t: now };
  if (now - f.t > 600000) { f.n = 0; f.t = now; }
  if (f.n >= 8) return json({ error: "Too many attempts. Try again in a few minutes." }, 429);

  let user = null;
  /* Primary admin comes from Cloudflare secrets, never from source code. */
  const emailOk = env.ADMIN_EMAIL ? safeEqual(email, String(env.ADMIN_EMAIL).trim().toLowerCase()) : false, passOk = env.ADMIN_PASSWORD ? safeEqual(password, env.ADMIN_PASSWORD) : false;
  if (emailOk && passOk) {
    user = { uid: 0, email, name: "Administrator", role: "admin" };
  } else if (env.DATABASE_URL) {
    try {
      const sql = neon(env.DATABASE_URL); await ensureSchema(sql);
      const r = (await sql`SELECT id, email, name, role, password_hash, is_active FROM users WHERE email = ${email}`)[0];
      const ok = r ? await verifyPassword(password, r.password_hash) : (await hashPassword(password), false);
      if (r && ok && r.is_active) { user = { uid: Number(r.id), email: r.email, name: r.name, role: r.role }; await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${r.id}`; }
    } catch (e) { console.error("login failed", e instanceof Error ? e.message : "unknown"); return json({ error: "Sign-in is temporarily unavailable." }, 500); }
  }
  if (!user) { f.n++; fails.set(ip, f); await new Promise(r => setTimeout(r, 500)); return json({ error: "Email or password is incorrect." }, 401); }
  fails.delete(ip);
  return json({ user: { email: user.email, name: user.name, role: user.role } }, 200, { "Set-Cookie": cookieHeader(await makeSession(env, user)) });
}
