import { neon } from "@neondatabase/serverless";
const text=(v,n=100)=>typeof v==="string"?v.trim().slice(0,n):"";
const emailOK=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function notify(env,r){if(!env.RESEND_API_KEY||!env.ENQUIRY_FROM_EMAIL||!env.ENQUIRY_NOTIFICATION_TO)return false;const lines=[`Reference: ${r.id}`,`Name: ${r.name}`,`Phone: ${r.phone}`,`Email: ${r.email||"Not provided"}`,`Enquiry: ${r.interest}`,`Property type: ${r.property_type||"Not specified"}`,`Location: ${r.location||"Not specified"}`,`Budget: ${r.budget||"Not specified"}`,"","Message:",r.details||"No additional message"];try{const q=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:env.ENQUIRY_FROM_EMAIL,to:[env.ENQUIRY_NOTIFICATION_TO],subject:`Website enquiry #${r.id}: ${r.interest}`,text:lines.join("\\n")})});return q.ok}catch(e){console.error("Notification failed",e instanceof Error?e.message:"unknown");return false}}
let rateLimitTableReady = false;
let lastRateLimitCleanup = 0;
async function enforceRateLimit(sql, request, env, now) {
  if (!rateLimitTableReady) {
    await sql`CREATE TABLE IF NOT EXISTS enquiry_rate_limits (
      ip_hash CHAR(64) PRIMARY KEY,
      window_started_at TIMESTAMPTZ NOT NULL,
      request_count INTEGER NOT NULL CHECK (request_count > 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS enquiry_rate_limits_updated_idx ON enquiry_rate_limits (updated_at)`;
    rateLimitTableReady = true;
  }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const secret = env.SESSION_SECRET || env.ADMIN_API_TOKEN || env.DATABASE_URL;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  const ipHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const nowIso = new Date(now).toISOString();
  const expiredBefore = new Date(now - 10 * 60 * 1000).toISOString();
  const rows = await sql`INSERT INTO enquiry_rate_limits (ip_hash, window_started_at, request_count, updated_at)
    VALUES (${ipHash}, ${nowIso}, 1, ${nowIso})
    ON CONFLICT (ip_hash) DO UPDATE SET
      window_started_at = CASE WHEN enquiry_rate_limits.window_started_at <= ${expiredBefore}::timestamptz THEN ${nowIso}::timestamptz ELSE enquiry_rate_limits.window_started_at END,
      request_count = CASE WHEN enquiry_rate_limits.window_started_at <= ${expiredBefore}::timestamptz THEN 1 ELSE enquiry_rate_limits.request_count + 1 END,
      updated_at = ${nowIso}::timestamptz
    RETURNING request_count, window_started_at`;
  if (now - lastRateLimitCleanup > 15 * 60 * 1000) {
    lastRateLimitCleanup = now;
    try { await sql`DELETE FROM enquiry_rate_limits WHERE updated_at < NOW() - INTERVAL '24 hours'`; }
    catch (error) { console.warn("Enquiry rate-limit cleanup failed", error instanceof Error ? error.message : "unknown"); }
  }
  const row = rows[0];
  const retryAfter = Math.max(1, Math.ceil((new Date(row.window_started_at).getTime() + 10 * 60 * 1000 - now) / 1000));
  return { allowed: Number(row.request_count) <= 5, retryAfter };
}
async function handle({request,env}){const out=(d,s=200,extra={})=>Response.json(d,{status:s,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...extra}});if(request.method!=="POST")return out({error:"Method not allowed."},405);if(!env.DATABASE_URL)return out({error:"Neon database is not configured."},503);let b;try{b=await request.json()}catch{return out({error:"Invalid JSON request."},400)}const now=Date.now();if(text(b.website,200))return out({ok:true,accepted:true});const name=text(b.name),phone=text(b.phone,20),interest=text(b.interest,80),email=text(b.email,254),propertyType=text(b.propertyType,50),location=text(b.location,120),budget=text(b.budget,80),details=text(b.details,1000),source=b.source==="about-contact"?"about-contact":b.source==="property-detail"?"property-detail":"homepage",digits=phone.replace(/\D/g,"");const allowed=new Set(["Buying a property","Selling a property","Plot / land","Plot / Land","House","Flat / apartment","Flat / Apartment","Commercial property","Broker collaboration","Submitting a property listing","Other enquiry","Property Visit","General Support"]),types=new Set(["","Plot / land","Plot / Land","House","Flat / apartment","Flat / Apartment","Commercial property","Other"]);if(name.length<2||!/^[\p{L}\p{M} .’'-]+$/u.test(name))return out({error:"Enter a valid name."},400);if(digits.length<7||digits.length>15)return out({error:"Enter a valid phone number."},400);if(!allowed.has(interest)&&!(source==="property-detail"&&/^Property enquiry: \d+$/.test(interest)))return out({error:"Choose a valid enquiry type."},400);if(email&&!emailOK.test(email))return out({error:"Enter a valid email address or leave it blank."},400);if(!types.has(propertyType))return out({error:"Choose a valid property type."},400);if(b.consent!==true)return out({error:"Consent is required to submit an enquiry."},400);if(source==="about-contact"){const st=Number(b.startedAt);if(!Number.isFinite(st)||now-st<2500||now-st>3600000)return out({error:"Please review the form and try submitting again."},400)}try{const sql=neon(env.DATABASE_URL);let rateLimit;try{rateLimit=await enforceRateLimit(sql,request,env,now)}catch(error){console.error("Enquiry rate limit failed",error instanceof Error?error.message:"unknown");return out({error:"The enquiry service is temporarily unavailable."},503)}if(!rateLimit.allowed)return out({error:"Too many enquiries. Please try again later.",retryAfter:rateLimit.retryAfter},429,{"Retry-After":String(rateLimit.retryAfter)});const r=await sql`INSERT INTO enquiries(name,phone,email,interest,property_type,location,budget,details,consent_at,source) VALUES(${name},${phone},${email||null},${interest},${propertyType||null},${location||null},${budget||null},${details||null},${new Date(now).toISOString()},${source}) RETURNING id,created_at`;const row=r[0];const notificationSent=await notify(env,{...row,name,phone,email,interest,property_type:propertyType,location,budget,details});return out({ok:true,enquiryId:row.id,createdAt:row.created_at,notificationSent},201)}catch(e){console.error("Enquiry insert failed",e instanceof Error?e.message:"unknown");return out({error:"We could not save your enquiry. Please contact the agency directly."},500)}}
export async function onRequest(context){return handle(context)}
