const { Pool } = require("pg");
let pool;
function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000 });
  return pool;
}
const text = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed." }); }
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Enquiry service is not configured yet. Please contact the agency by phone or WhatsApp." });
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const name = text(body.name, 100); const phone = text(body.phone, 20); const interest = text(body.interest, 80);
  const location = text(body.location, 120); const budget = text(body.budget, 80); const details = text(body.details, 1000);
  const digits = phone.replace(/\D/g, "");
  const allowed = new Set(["Buying a property", "Selling a property", "Plot / land", "House", "Flat / apartment", "Commercial property", "Broker collaboration", "Submitting a property listing", "Other enquiry"]);
  if (name.length < 2 || !/^[\p{L}\p{M} .’'-]+$/u.test(name)) return res.status(400).json({ error: "Enter a valid name." });
  if (digits.length < 7 || digits.length > 15) return res.status(400).json({ error: "Enter a valid phone number." });
  if (!allowed.has(interest)) return res.status(400).json({ error: "Choose a valid enquiry type." });
  if (body.consent !== true) return res.status(400).json({ error: "Consent is required to submit an enquiry." });
  if (budget && budget.length > 80) return res.status(400).json({ error: "Budget is too long." });
  try {
    const result = await db.query(
      `INSERT INTO enquiries (name, phone, interest, location, budget, details, consent_at, source)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'homepage') RETURNING id, created_at`,
      [name, phone, interest, location || null, budget || null, details || null]
    );
    return res.status(201).json({ ok: true, enquiryId: result.rows[0].id, createdAt: result.rows[0].created_at });
  } catch (error) {
    console.error("Enquiry insert failed", { code: error.code });
    return res.status(500).json({ error: "We could not save your enquiry. Please contact the agency directly." });
  }
};
