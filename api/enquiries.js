const { Pool } = require("pg");
let pool;
const recentSubmissions = new Map();
function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000 });
  return pool;
}
const text = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function rateLimited(key, now) {
  const windowMs = 10 * 60 * 1000;
  const current = (recentSubmissions.get(key) || []).filter(time => now - time < windowMs);
  if (current.length >= 5) { recentSubmissions.set(key, current); return true; }
  current.push(now); recentSubmissions.set(key, current);
  if (recentSubmissions.size > 2000) for (const [k, v] of recentSubmissions) if (!v.length || now - v[v.length - 1] > windowMs) recentSubmissions.delete(k);
  return false;
}
async function notifyAgency({ name, phone, email, interest, propertyType, location, budget, details, enquiryId }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ENQUIRY_FROM_EMAIL;
  const to = process.env.ENQUIRY_NOTIFICATION_TO;
  if (!key || !from || !to) return false;
  const lines = [
    `Reference: ${enquiryId}`, `Name: ${name}`, `Phone: ${phone}`, `Email: ${email || "Not provided"}`,
    `Enquiry: ${interest}`, `Property type: ${propertyType || "Not specified"}`,
    `Location: ${location || "Not specified"}`, `Budget: ${budget || "Not specified"}`, "", "Message:", details || "No additional message"
  ];
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: `Website enquiry #${enquiryId}: ${interest}`, text: lines.join("\n") })
    });
    return response.ok;
  } catch (error) { console.error("Enquiry notification failed", { message: error.message }); return false; }
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed." }); }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const now = Date.now();
  // Quietly accept honeypot submissions without storing or notifying anyone.
  if (text(body.website, 200)) return res.status(200).json({ ok: true, accepted: true });
  const ip = text(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown", 100).split(",")[0].trim();
  if (rateLimited(ip, now)) return res.status(429).json({ error: "Too many submissions. Please wait before trying again or contact the agency directly." });
  const name = text(body.name, 100); const phone = text(body.phone, 20); const interest = text(body.interest, 80);
  const email = text(body.email, 254); const propertyType = text(body.propertyType, 50);
  const location = text(body.location, 120); const budget = text(body.budget, 80); const details = text(body.details, 1000);
  const source = body.source === "about-contact" ? "about-contact" : "homepage";
  const digits = phone.replace(/\D/g, "");
  const allowed = new Set(["Buying a property", "Selling a property", "Plot / land", "House", "Flat / apartment", "Commercial property", "Broker collaboration", "Submitting a property listing", "Other enquiry", "Property Visit", "General Support"]);
  const allowedPropertyTypes = new Set(["", "Plot / land", "House", "Flat / apartment", "Commercial property", "Other"]);
  if (name.length < 2 || !/^[\p{L}\p{M} .’'-]+$/u.test(name)) return res.status(400).json({ error: "Enter a valid name." });
  if (digits.length < 7 || digits.length > 15) return res.status(400).json({ error: "Enter a valid phone number." });
  if (!allowed.has(interest)) return res.status(400).json({ error: "Choose a valid enquiry type." });
  if (email && (email.length > 254 || !emailPattern.test(email))) return res.status(400).json({ error: "Enter a valid email address or leave it blank." });
  if (!allowedPropertyTypes.has(propertyType)) return res.status(400).json({ error: "Choose a valid property type." });
  if (body.consent !== true) return res.status(400).json({ error: "Consent is required to submit an enquiry." });
  if (budget.length > 80 || location.length > 120 || details.length > 1000) return res.status(400).json({ error: "One or more fields exceed the permitted length." });
  if (source === "about-contact") {
    const startedAt = Number(body.startedAt);
    if (!Number.isFinite(startedAt) || now - startedAt < 2500 || now - startedAt > 60 * 60 * 1000) return res.status(400).json({ error: "Please review the form and try submitting again." });
  }
  const db = getPool();
  if (!db) return res.status(503).json({ error: "The enquiry service is not configured yet. Please call or WhatsApp the agency." });
  try {
    const result = await db.query(
      `INSERT INTO enquiries (name, phone, email, interest, property_type, location, budget, details, consent_at, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9) RETURNING id, created_at`,
      [name, phone, email || null, interest, propertyType || null, location || null, budget || null, details || null, source]
    );
    const record = result.rows[0];
    const notificationSent = await notifyAgency({ name, phone, email, interest, propertyType, location, budget, details, enquiryId: record.id });
    return res.status(201).json({ ok: true, enquiryId: record.id, createdAt: record.created_at, notificationSent });
  } catch (error) {
    console.error("Enquiry insert failed", { code: error.code });
    return res.status(500).json({ error: "We could not save your enquiry. Please contact the agency directly." });
  }
};
