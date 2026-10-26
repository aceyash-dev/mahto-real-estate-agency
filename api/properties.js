const { Pool } = require("pg");
let pool;
function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000 });
  return pool;
}
const boundedNumber = value => value === undefined || value === null || value === "" ? null : Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : NaN;
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed." }); }
  const db = getPool();
  if (!db) return res.status(503).json({ properties: [], error: "Listing service is not configured." });
  const q = req.query || {};
  const location = typeof q.location === "string" ? q.location.trim().slice(0, 120) : "";
  const type = typeof q.propertyType === "string" ? q.propertyType.trim().slice(0, 50) : "";
  const min = boundedNumber(q.budgetMin); const max = boundedNumber(q.budgetMax);
  const areaMin = boundedNumber(q.areaMin); const areaMax = boundedNumber(q.areaMax);
  if ([min, max, areaMin, areaMax].some(Number.isNaN)) return res.status(400).json({ error: "Budget and area filters must be non-negative numbers." });
  if (min !== null && max !== null && max < min) return res.status(400).json({ error: "Maximum budget must be at least the minimum budget." });
  if (areaMin !== null && areaMax !== null && areaMax < areaMin) return res.status(400).json({ error: "Maximum area must be at least the minimum area." });
  const values = []; const where = ["is_active = TRUE", "admin_approved = TRUE"];
  const add = (sql, value) => { values.push(value); where.push(sql.replace("?", `$${values.length}`)); };
  if (location) add("(locality ILIKE ? OR district ILIKE ? OR state ILIKE ?)", `%${location}%`);
  if (location) { const i = values.length; values.push(`%${location}%`, `%${location}%`); where[where.length - 1] = `(locality ILIKE $${i} OR district ILIKE $${i+1} OR state ILIKE $${i+2})`; }
  if (type) add("property_type = ?", type);
  if (min !== null) add("asking_price >= ?", min);
  if (max !== null) add("asking_price <= ?", max);
  const unit = typeof q.areaUnit === "string" ? q.areaUnit.trim().slice(0, 20) : "";
  if (areaMin !== null || areaMax !== null) {
    if (unit) add("area_unit = ?", unit);
    if (areaMin !== null) add("area_value >= ?", areaMin);
    if (areaMax !== null) add("area_value <= ?", areaMax);
  }
  try {
    const result = await db.query(`SELECT id, slug, title, property_type, locality, district, state, asking_price, area_value, area_unit, summary, description, photo_url, photo_alt FROM properties WHERE ${where.join(" AND ")} ORDER BY featured DESC, created_at DESC LIMIT 60`, values);
    return res.status(200).json({ properties: result.rows });
  } catch (error) {
    console.error("Property query failed", { code: error.code });
    return res.status(500).json({ error: "Unable to load property listings.", properties: [] });
  }
};
