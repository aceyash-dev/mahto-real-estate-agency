/* Session auth shared by the admin API. Cookie is HMAC-signed (SESSION_SECRET), HttpOnly, SameSite=Strict.
   Roles: admin (everything), broker and owner (their own listings only). */
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
export const ROLES = ["admin", "broker", "owner"];
export const COOKIE = "mre_session", MAX_AGE = 60 * 60 * 12;

export const json = (d, s = 200, extra = {}) => Response.json(d, { status: s, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });

export function safeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}
const hmacKey = secret => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? unb64u(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return `pbkdf2$100000$${b64u(salt)}$${b64u(bits)}`;
}
export async function verifyPassword(password, stored) {
  const p = String(stored || "").split("$");
  if (p.length !== 4 || p[0] !== "pbkdf2") return false;
  return safeEqual(await hashPassword(password, p[2]), stored);
}

export async function makeSession(env, user) {
  const payload = b64u(enc.encode(JSON.stringify({ uid: user.uid, email: user.email, name: user.name, role: user.role, exp: Math.floor(Date.now() / 1000) + MAX_AGE })));
  const sig = b64u(await crypto.subtle.sign("HMAC", await hmacKey(env.SESSION_SECRET), enc.encode(payload)));
  return `${payload}.${sig}`;
}
export const cookieHeader = value => `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${value ? MAX_AGE : 0}`;

export async function getSession(request, env) {
  if (!env.SESSION_SECRET) return null;
  const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  const expect = b64u(await crypto.subtle.sign("HMAC", await hmacKey(env.SESSION_SECRET), enc.encode(payload)));
  if (!safeEqual(sig, expect)) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(unb64u(payload)));
    return s.exp > Date.now() / 1000 && ROLES.includes(s.role) ? s : null;
  } catch { return null; }
}

/* Same-origin check for state-changing requests (defence in depth on top of SameSite=Strict). */
export function sameOrigin(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const o = request.headers.get("Origin");
  return !o || o === new URL(request.url).origin;
}

let ready = false;
export async function ensureSchema(sql) {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(254) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(10) NOT NULL CHECK (role IN ('admin','broker','owner')),
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
  )`;
  await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_user_id BIGINT`;
  await sql`CREATE TABLE IF NOT EXISTS listing_images (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    property_id BIGINT NOT NULL,
    mime VARCHAR(30) NOT NULL,
    data_b64 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS listing_images_property_idx ON listing_images (property_id)`;
  ready = true;
}

/* Returns the session, or a Response to send back (401/403/503). Bearer ADMIN_API_TOKEN still counts as admin. */
export async function require(request, env, roles = ROLES) {
  if (!sameOrigin(request)) return json({ error: "Cross-site request blocked." }, 403);
  const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (bearer && env.ADMIN_API_TOKEN && safeEqual(bearer, env.ADMIN_API_TOKEN) && roles.includes("admin")) return { uid: 0, email: "token", name: "Admin token", role: "admin" };
  if (!env.SESSION_SECRET) return json({ error: "Admin sign-in is not configured." }, 503);
  const s = await getSession(request, env);
  if (!s) return json({ error: "Please sign in." }, 401);
  if (!roles.includes(s.role)) return json({ error: "You do not have permission for this." }, 403);
  return s;
}
