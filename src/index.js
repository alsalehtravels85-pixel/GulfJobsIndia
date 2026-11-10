const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
});

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromB64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
async function createToken(env) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ role: "admin", exp: Date.now() + 8 * 60 * 60 * 1000 })));
  return payload + "." + b64url(await hmac(env.SESSION_SECRET, payload));
}
async function validToken(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !env.SESSION_SECRET) return false;
  try {
    const expected = await hmac(env.SESSION_SECRET, payload);
    const actual = fromB64url(sig);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    if (diff !== 0) return false;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return data.role === "admin" && data.exp > Date.now();
  } catch { return false; }
}
function cleanText(v, max = 2000) {
  return String(v ?? "").trim().slice(0, max);
}
function supabaseHeaders(env, extra = {}) {
  return { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...extra };
}
async function db(env, path, options = {}) {
  const url = env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path;
  return fetch(url, { ...options, headers: supabaseHeaders(env, options.headers || {}) });
}
async function sendEmail(env, subject, text) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM || "GulfJobsIndia <onboarding@resend.dev>",
        to: [env.NOTIFY_EMAIL],
        subject,
        text
      })
    });
  } catch (_) {}
}
async function adminOnly(request, env) {
  if (!await validToken(request, env)) return json({ error: "Admin login required." }, 401);
  return null;
}

async function createAgentToken(env, agent) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ role: "agent", agent_id: agent.id, exp: Date.now() + 8 * 60 * 60 * 1000 })));
  return payload + "." + b64url(await hmac(env.SESSION_SECRET, payload));
}
async function agentIdentity(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !env.SESSION_SECRET) return null;
  try {
    const expected = await hmac(env.SESSION_SECRET, payload), actual = fromB64url(sig);
    if (actual.length !== expected.length) return null;
    let diff = 0; for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    if (diff !== 0) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return data.role === "agent" && data.exp > Date.now() && data.agent_id ? data : null;
  } catch { return null; }
}
async function passwordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256));
  return b64url(salt) + "." + b64url(bits);
}
async function verifyPassword(password, stored) {
  try {
    const [saltText, hashText] = stored.split("."), salt = fromB64url(saltText), expected = fromB64url(hashText);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256));
    if (bits.length !== expected.length) return false;
    let diff = 0; for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i]; return diff === 0;
  } catch { return false; }
}

function isPdf(bytes) {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 &&
    bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

// Delete only non-draft jobs once two calendar months have elapsed after last_date.
// The applications table uses ON DELETE SET NULL; Storage files are untouched.
function addCalendarMonthsToDate(dateString, months) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  const targetMonthIndex = monthIndex + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

// Gulf aviation and visa/immigration headlines are collected by the Worker Cron.
const NEWS_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const NEWS_FEEDS = [
  { category: "flight", url: "https://news.google.com/rss/search?q=(Gulf+OR+UAE+OR+Saudi+OR+Qatar+OR+Oman+OR+Kuwait)+airline+OR+airport+OR+flight+OR+aviation&hl=en&gl=US&ceid=US:en" },
  { category: "visa", url: "https://news.google.com/rss/search?q=(Gulf+OR+UAE+OR+Saudi+Arabia+OR+Oman+OR+Kuwait+OR+Bahrain)+visa+OR+immigration+OR+work+permit&hl=en&gl=US&ceid=US:en" }
];

function xmlDecode(value) {
  return String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}
function xmlTag(block, name) {
  const match = block.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + "\\s*>", "i"));
  return match ? xmlDecode(match[1]).replace(/<[^>]+>/g, "").trim() : "";
}
function parseNewsRss(xml, category, nowMs) {
  const items = String(xml || "").match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item\s*>/gi) || [];
  return items.map(item => {
    const title = xmlTag(item, "title");
    const link = xmlTag(item, "link");
    const publishedMs = Date.parse(xmlTag(item, "pubDate") || xmlTag(item, "published") || xmlTag(item, "updated"));
    if (!title || !/^https?:\/\//i.test(link) || !Number.isFinite(publishedMs)) return null;
    if (publishedMs > nowMs + 5 * 60 * 1000 || nowMs - publishedMs > NEWS_MAX_AGE_MS) return null;
    return { title: title.slice(0, 500), url: link.slice(0, 2000), source: "Google News", category, published_at: new Date(publishedMs).toISOString() };
  }).filter(Boolean);
}
async function collectGulfNews(env, now = new Date()) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase Worker secrets are not configured.");
  const nowMs = now.getTime();
  const results = await Promise.allSettled(NEWS_FEEDS.map(async feed => {
    const response = await fetch(feed.url, { headers: { "User-Agent": "GulfJobsIndia-NewsMonitor/1.0", "Accept": "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("News feed returned " + response.status);
    return parseNewsRss(await response.text(), feed.category, nowMs);
  }));
  const news = [];
  for (const result of results) if (result.status === "fulfilled") news.push(...result.value);
  const unique = [...new Map(news.map(item => [item.url, item])).values()].sort((a,b) => Date.parse(b.published_at)-Date.parse(a.published_at)).slice(0,80);
  for (let i=0;i<unique.length;i+=40) {
    const response = await db(env, "gulf_news?on_conflict=url", { method:"POST", headers:{"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify(unique.slice(i,i+40)) });
    if (!response.ok) throw new Error("Could not save news ("+response.status+"): "+(await response.text()).slice(0,250));
  }
  const cutoff = new Date(nowMs-7*24*60*60*1000).toISOString();
  const cleanup = await db(env,"gulf_news?published_at=lt."+encodeURIComponent(cutoff),{method:"DELETE",headers:{Prefer:"return=minimal"}});
  if (!cleanup.ok) console.error("Old news cleanup failed:",(await cleanup.text()).slice(0,200));
  return { fetched:news.length, unique:unique.length, feedsSucceeded:results.filter(x=>x.status==="fulfilled").length, feedsFailed:results.filter(x=>x.status==="rejected").length };
}

async function deleteExpiredJobs(env, now = new Date()) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase Worker secrets are not configured.");
  }
  const today = now.toISOString().slice(0, 10);
  const pageSize = 500;
  let offset = 0;
  const expiredIds = [];
  let scanned = 0;

  // Paginate all published/closed jobs; drafts are deliberately excluded.
  while (true) {
    const pageResponse = await db(
      env,
      `jobs?select=id,last_date,status&status=in.(published,closed)&last_date=not.is.null&order=last_date.asc`,
      { headers: { Range: `${offset}-${offset + pageSize - 1}`, "Range-Unit": "items" } }
    );
    const pageText = await pageResponse.text();
    if (!pageResponse.ok) {
      throw new Error(`Could not list jobs (${pageResponse.status}): ${pageText.slice(0, 300)}`);
    }
    const rows = JSON.parse(pageText || "[]");
    scanned += rows.length;
    expiredIds.push(...rows.filter(row => {
      const deleteOn = addCalendarMonthsToDate(row.last_date, 2);
      return row.id && deleteOn && deleteOn <= today;
    }).map(row => row.id));
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  // Delete only after pagination finishes, so deleting page 1 cannot shift page 2.
  let deleted = 0;
  for (let i = 0; i < expiredIds.length; i += 100) {
    const ids = expiredIds.slice(i, i + 100);
    const deleteResponse = await db(env, `jobs?id=in.(${ids.join(",")})`, {
      method: "DELETE", headers: { Prefer: "return=representation" }
    });
    const deleteText = await deleteResponse.text();
    if (!deleteResponse.ok) {
      throw new Error(`Could not delete expired jobs (${deleteResponse.status}): ${deleteText.slice(0, 300)}`);
    }
    try {
      const removed = JSON.parse(deleteText || "[]");
      deleted += Array.isArray(removed) ? removed.length : ids.length;
    } catch { deleted += ids.length; }
  }
  return { today, scanned, found: expiredIds.length, deleted, draftsExcluded: true };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== "*" ? env.ALLOWED_ORIGIN : "*";
    const cors = corsHeaders(allowed);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    // SEO: Keep the Worker sitemap and robots.txt aligned with the Cloudflare Pages site.
    if (
      (path === "/sitemap.xml" || path === "/robots.txt") &&
      ["GET", "HEAD"].includes(request.method)
    ) {
      if (path === "/sitemap.xml") {
        return Response.redirect(
          "https://gulfjobsindia.pages.dev/sitemap.xml",
          301
        );
      }

      const robots = `User-agent: *
Allow: /

Sitemap: https://gulfjobsindia.pages.dev/sitemap.xml
`;

      return new Response(
        request.method === "HEAD" ? null : robots,
        {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=UTF-8",
            "Cache-Control": "public, max-age=3600"
          }
        }
      );
    }

    try {
      if (path === "/api/health" && request.method === "GET") {
        return json({ ok: true, service: "GulfJobsIndia API" }, 200, cors);
      }

      if (path === "/api/config" && request.method === "GET") {
        return json({ whatsappNumber: env.WHATSAPP_NUMBER || "918576850306" }, 200, cors);
      }

      // AI CV helper. Contact details stay in the browser and are never sent to the model.
      if (path === "/api/cv/generate" && request.method === "POST") {
        if (!env.AI || typeof env.AI.run !== "function") return json({ error: "AI CV service abhi configured nahi hai. Cloudflare Workers AI binding check karein." }, 503, cors);
        const body = await request.json();
        const fields = {
          target_role: cleanText(body.target_role, 120), country: cleanText(body.country, 60),
          experience_years: cleanText(body.experience_years, 40), experience: cleanText(body.experience, 3200),
          education: cleanText(body.education, 1000), skills: cleanText(body.skills, 1000),
          languages: cleanText(body.languages, 300), certifications: cleanText(body.certifications, 700)
        };
        const total = Object.values(fields).join(" ").length;
        if (!fields.target_role || !fields.experience || total > 7500) return json({ error: "Target job aur work experience zaroor bharein. CV details 7,500 characters se kam rakhein." }, 400, cors);
        const prompt = [
          "You are a professional Gulf-region CV writer.",
          "Create ATS-friendly, concise CV wording using ONLY the candidate facts supplied below.",
          "Never invent employers, dates, qualifications, certificates, tools, achievements, metrics, visa status, or skills.",
          "Do not add unsupported claims. If information is missing, omit it.",
          "Return ONLY valid JSON with keys: headline (string), summary (string), experience_bullets (array of 3 to 6 short strings), skills (array of strings).",
          "Use professional natural English suitable for Gulf employers. No markdown fences.",
          "Candidate facts:", JSON.stringify(fields)
        ].join("\n");
        try {
          const result = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
            messages: [
              { role: "system", content: "You write factual, ATS-friendly CV content. Follow the requested JSON schema exactly." },
              { role: "user", content: prompt }
            ],
            max_tokens: 900
          });
          let answer = result?.response || result?.choices?.[0]?.message?.content || result?.result || "";
          if (typeof answer !== "string") answer = JSON.stringify(answer);
          const start = answer.indexOf("{"), end = answer.lastIndexOf("}");
          if (start < 0 || end <= start) throw new Error("AI response was not valid JSON");
          const cv = JSON.parse(answer.slice(start, end + 1));
          const cleanList = value => Array.isArray(value) ? value.slice(0, 8).map(v => cleanText(v, 220)).filter(Boolean) : [];
          return json({ headline: cleanText(cv.headline, 120) || fields.target_role, summary: cleanText(cv.summary, 900), experience_bullets: cleanList(cv.experience_bullets), skills: cleanList(cv.skills) }, 200, { ...cors, "Cache-Control": "no-store" });
        } catch (error) {
          console.error("CV AI generation failed:", error?.message || error);
          return json({ error: "AI CV content generate nahi ho saka. Details thodi chhoti karke dobara try karein." }, 502, cors);
        }
      }

      if (path === "/api/admin/login" && request.method === "POST") {
        if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json({ error: "Admin secrets are not configured in Cloudflare." }, 500, cors);
        const body = await request.json();
        const password = String(body.password || "");
        if (password.length > 200 || password !== env.ADMIN_PASSWORD) return json({ error: "Password galat hai." }, 401, cors);
        return json({ token: await createToken(env) }, 200, cors);
      }

      if (path === "/api/jobs" && request.method === "GET") {
        const r = await db(env, "jobs?select=*&status=eq.published&order=created_at.desc");
        const t = await r.text();
        if (!r.ok) return json({ error: "Jobs load nahi ho sake.", details: t.slice(0, 300) }, 502, cors);
        return new Response(t, { status: 200, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
      }

      if (path === "/api/news" && request.method === "GET") {
        const cutoff = new Date(Date.now() - NEWS_MAX_AGE_MS).toISOString();
        const r = await db(env, "gulf_news?select=id,title,url,source,category,published_at&published_at=gte." + encodeURIComponent(cutoff) + "&order=published_at.desc&limit=40");
        const t = await r.text();
        if (!r.ok) return json({ error: "News abhi load nahi ho pa rahi." }, 502, cors);
        return new Response(t, { status: 200, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" } });
      }

      if (path === "/api/success-stories" && request.method === "GET") {
        const r = await db(env, "success_stories?select=id,candidate_name,job_title,country,created_at&status=eq.published&order=created_at.desc&limit=12");
        const t = await r.text();
        if (!r.ok) return json({ error: "Success stories service unavailable hai. Worker deployment aur Supabase migration check karein." }, 502, cors);
        return new Response(t, { status: 200, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" } });
      }

      if (path === "/api/agent/register" && request.method === "POST") {
        if (!env.SESSION_SECRET) return json({ error: "SESSION_SECRET Cloudflare mein set nahi hai." }, 500, cors);
        const b = await request.json();
        const name = cleanText(b.full_name, 100), phone = cleanText(b.phone, 20), email = cleanText(b.email, 160).toLowerCase(), agency = cleanText(b.agency_name, 160), password = String(b.password || "");
        if (!name || !phone || !email || !agency || password.length < 8 || password.length > 200) return json({ error: "Saari details bharein. Password kam se kam 8 characters ka ho." }, 400, cors);
        if (!/^[0-9+() -]{7,20}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email ya mobile number check karein." }, 400, cors);
        const [emailExists, phoneExists] = await Promise.all([
          db(env, `agents?select=id&email=eq.${encodeURIComponent(email)}&limit=1`),
          db(env, `agents?select=id&phone=eq.${encodeURIComponent(phone)}&limit=1`)
        ]);
        if (!emailExists.ok || !phoneExists.ok) return json({ error: "Agent database setup check karein. schema.sql run hua hai?" }, 502, cors);
        if ((await emailExists.json()).length) return json({ error: "Is email se account pehle se hai." }, 409, cors);
        if ((await phoneExists.json()).length) return json({ error: "Is mobile number se account pehle se hai." }, 409, cors);
        const r = await db(env, "agents", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ full_name: name, phone, email, agency_name: agency, password_hash: await passwordHash(password), status: "pending" }) });
        if (!r.ok) return json({ error: "Registration save nahi hui. Supabase schema check karein." }, 502, cors);
        return json({ ok: true, message: "Registration ho gayi. Admin approval ke baad login kar sakenge." }, 201, cors);
      }
      if (path === "/api/agent/login" && request.method === "POST") {
        if (!env.SESSION_SECRET) return json({ error: "SESSION_SECRET Cloudflare mein set nahi hai." }, 500, cors);
        const b = await request.json(), loginId = cleanText(b.login_id || b.email, 160), password = String(b.password || "");
        if (!loginId || !password) return json({ error: "Registered email ya mobile aur password enter karein." }, 400, cors);
        const isEmail = loginId.includes("@");
        const field = isEmail ? "email" : "phone";
        const identifier = isEmail ? loginId.toLowerCase() : loginId;
        const r = await db(env, `agents?select=id,full_name,email,phone,password_hash,status&${field}=eq.${encodeURIComponent(identifier)}&limit=1`);
        if (!r.ok) return json({ error: "Agent database setup check karein." }, 502, cors);
        const rows = await r.json();
        if (!rows.length || !(await verifyPassword(password, rows[0].password_hash))) return json({ error: "Email ya password galat hai." }, 401, cors);
        if (rows[0].status !== "approved") return json({ error: rows[0].status === "blocked" ? "Account block hai. Admin se contact karein." : "Account approval pending hai." }, 403, cors);
        return json({ token: await createAgentToken(env, rows[0]), agent: { id: rows[0].id, full_name: rows[0].full_name, email: rows[0].email, phone: rows[0].phone } }, 200, cors);
      }
      if (path.startsWith("/api/agent/")) {
        const identity = await agentIdentity(request, env);
        if (!identity) return json({ error: "Agent login required. Dobara login karein." }, 401, cors);
        if (path === "/api/agent/applications" && request.method === "GET") {
          const r = await db(env, `applications?select=id,job_id,candidate_name,phone,email,status,created_at,jobs(title)&agent_id=eq.${encodeURIComponent(identity.agent_id)}&order=created_at.desc&limit=300`);
          const t = await r.text();
          if (!r.ok) return json({ error: "Applications load nahi hui. schema.sql update karein." }, 502, cors);
          return new Response(t, { headers: { ...cors, "Content-Type": "application/json" } });
        }
        if (path === "/api/agent/applications" && request.method === "POST") {
          const form = await request.formData();
          const candidateName = cleanText(form.get("candidate_name"), 100), phone = cleanText(form.get("phone"), 20);
          const email = cleanText(form.get("email"), 160), message = cleanText(form.get("message"), 1000);
          const rawIds = form.getAll("job_ids").map(v => cleanText(v, 50)).filter(Boolean);
          const legacyId = cleanText(form.get("job_id"), 50);
          const jobIds = [...new Set(rawIds.length ? rawIds : (legacyId ? [legacyId] : []))];
          const file = form.get("document");
          if (!candidateName || !phone || !file || typeof file.arrayBuffer !== "function") return json({ error: "Candidate name, mobile aur PDF zaroori hain." }, 400, cors);
          if (!/^[0-9+() -]{7,20}$/.test(phone)) return json({ error: "Mobile number check karein." }, 400, cors);
          if (file.size > 10 * 1024 * 1024) return json({ error: "PDF maximum 10 MB ki ho sakti hai." }, 400, cors);
          if (!jobIds.length || jobIds.length > 10 || jobIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) return json({ error: "1 se 10 published jobs select karein." }, 400, cors);
          const bytes = new Uint8Array(await file.arrayBuffer()); if (!isPdf(bytes)) return json({ error: "Sirf valid PDF upload karein." }, 400, cors);
          const jr = await db(env, `jobs?id=in.(${jobIds.join(",")})&status=eq.published&select=id,title`);
          if (!jr.ok) return json({ error: "Published jobs verify nahi ho sakin." }, 502, cors);
          const jobs = await jr.json();
          if (jobs.length !== jobIds.length) return json({ error: "Selected jobs mein se koi job ab available nahi hai. Refresh karke dobara select karein." }, 400, cors);
          const objectPath = `agent-applications/${identity.agent_id}/${crypto.randomUUID()}.pdf`;
          const storageUrl = env.SUPABASE_URL.replace(/\/$/, "") + "/storage/v1/object/gulf-applications/" + objectPath;
          const upload = await fetch(storageUrl, { method: "POST", headers: supabaseHeaders(env, { "Content-Type": "application/pdf", "x-upsert": "false" }), body: bytes });
          if (!upload.ok) return json({ error: "PDF upload nahi hui. Supabase storage check karein." }, 502, cors);
          const rows = jobs.map(job => ({ job_id: job.id, candidate_name: candidateName, phone, email: email || null, message: message || null, document_path: objectPath, status: "new", agent_id: identity.agent_id }));
          const ins = await db(env, "applications", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(rows) });
          if (!ins.ok) { await fetch(storageUrl, { method: "DELETE", headers: supabaseHeaders(env) }); return json({ error: "Applications save nahi hui. Database schema check karein." }, 502, cors); }
          await sendEmail(env, `Agent applications: ${candidateName}`, `Agent ID: ${identity.agent_id}\nCandidate: ${candidateName}\nPhone: ${phone}\nJobs: ${jobs.map(j => j.title).join(", ")}\nPlease review in admin panel.`);
          return json({ ok: true, count: jobs.length, message: `Candidate ki ${jobs.length} job application(s) submit ho gayi.` }, 201, cors);
        }
      }

      // Public candidate tracker: returns candidate name, job title, application date and status.
      // Does not return email, phone, message or private document path.
      if (path === "/api/application-status" && request.method === "GET") {
        const suppliedPhone = cleanText(url.searchParams.get("phone"), 30);
        const digits = suppliedPhone.replace(/\D/g, "");
        if (digits.length < 10 || digits.length > 15) {
          return json({ error: "Valid registered mobile number enter karein." }, 400, cors);
        }

        const lastTen = digits.slice(-10);
        const r = await db(env, `applications?select=candidate_name,phone,created_at,status,jobs(title)&phone=ilike.*${encodeURIComponent(lastTen)}&order=created_at.desc&limit=100`);
        if (!r.ok) {
          return json({ error: "Application status load nahi ho saka. Thodi der baad try karein." }, 502, cors);
        }

        const rows = await r.json();
        const matched = rows.filter(row =>
          String(row.phone || "").replace(/\D/g, "").endsWith(lastTen)
        );

        return json({
          applications: matched.map(row => ({
            candidate_name: row.candidate_name || "Candidate",
            job_title: row.jobs?.title || "General Application",
            application_date: row.created_at,
            status: row.status || "new"
          }))
        }, 200, { ...cors, "Cache-Control": "no-store" });
      }

      if (path === "/api/applications" && request.method === "POST") {
        const form = await request.formData();
        const candidateName = cleanText(form.get("candidate_name"), 100), phone = cleanText(form.get("phone"), 20);
        const email = cleanText(form.get("email"), 160), message = cleanText(form.get("message"), 1000);
        const rawIds = form.getAll("job_ids").map(v => cleanText(v, 50)).filter(Boolean);
        const legacyId = cleanText(form.get("job_id"), 50);
        const jobIds = [...new Set(rawIds.length ? rawIds : (legacyId ? [legacyId] : []))];
        const file = form.get("document");
        if (!candidateName || !phone || !file || typeof file.arrayBuffer !== "function") return json({ error: "Name, mobile number aur ek PDF file zaroori hain." }, 400, cors);
        if (!/^[0-9+() -]{7,20}$/.test(phone)) return json({ error: "Mobile number check karein." }, 400, cors);
        if (file.size > 10 * 1024 * 1024) return json({ error: "PDF maximum 10 MB ki ho sakti hai." }, 400, cors);
        if (file.type && file.type !== "application/pdf") return json({ error: "Sirf PDF file upload karein." }, 400, cors);
        if (!jobIds.length || jobIds.length > 10 || jobIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) return json({ error: "1 se 10 published jobs select karein." }, 400, cors);
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!isPdf(bytes)) return json({ error: "File valid PDF nahi lag rahi." }, 400, cors);
        const jr = await db(env, `jobs?id=in.(${jobIds.join(",")})&status=eq.published&select=id,title`);
        if (!jr.ok) return json({ error: "Selected jobs verify nahi ho sakin." }, 502, cors);
        const jobs = await jr.json();
        if (jobs.length !== jobIds.length) return json({ error: "Selected jobs mein se koi job ab available nahi hai. Refresh karke dobara select karein." }, 400, cors);
        const objectPath = `applications/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.pdf`;
        const storageUrl = env.SUPABASE_URL.replace(/\/$/, "") + "/storage/v1/object/gulf-applications/" + objectPath;
        const upload = await fetch(storageUrl, { method: "POST", headers: supabaseHeaders(env, { "Content-Type": "application/pdf", "x-upsert": "false" }), body: bytes });
        if (!upload.ok) return json({ error: "PDF upload nahi ho saki. Thodi der baad dobara try karein." }, 502, cors);
        const rows = jobs.map(job => ({ job_id: job.id, candidate_name: candidateName, phone, email: email || null, message: message || null, document_path: objectPath, status: "new" }));
        const insert = await db(env, "applications", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(rows) });
        if (!insert.ok) {
          await fetch(storageUrl, { method: "DELETE", headers: supabaseHeaders(env) });
          return json({ error: "Application save nahi hui. Database setup check karna hoga." }, 502, cors);
        }
        await sendEmail(env, `New GulfJobsIndia applications: ${candidateName}`,
          `New application received.\nName: ${candidateName}\nPhone: ${phone}\nEmail: ${email || "Not provided"}\nJobs: ${jobs.map(j => j.title).join(", ")}\nStatus: New\nPlease login to the admin panel to review the private PDF.`);
        return json({ ok: true, count: jobs.length, message: `Aapki ${jobs.length} job application(s) submit ho gayi! Hum aapse zaroorat padne par contact karenge.` }, 201, cors);
      }

      if (path.startsWith("/api/admin/")) {
        const denied = await adminOnly(request, env);
        if (denied) return new Response(await denied.text(), { status: denied.status, headers: { ...cors, "Content-Type": "application/json" } });
      }

      if (path === "/api/admin/agents" && request.method === "GET") {
        const r = await db(env, "agents?select=id,full_name,phone,email,agency_name,status,created_at&order=created_at.desc&limit=300");
        const t = await r.text(); if (!r.ok) return json({ error: "Agents load nahi hue." }, 502, cors);
        return new Response(t, { headers: { ...cors, "Content-Type": "application/json" } });
      }
      // Admin-only password reset for an agent whose old hash/password no longer matches.
      const agentPasswordMatch = path.match(/^\/api\/admin\/agents\/([0-9a-f-]+)\/password$/i);
      if (agentPasswordMatch && request.method === "POST") {
        const b = await request.json();
        const newPassword = String(b.password || "");
        if (newPassword.length < 8 || newPassword.length > 200) {
          return json({ error: "Naya password 8 se 200 characters ka hona chahiye." }, 400, cors);
        }
        const r = await db(env, `agents?id=eq.${agentPasswordMatch[1]}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ password_hash: await passwordHash(newPassword) })
        });
        if (!r.ok) return json({ error: "Agent password reset nahi hua. Database check karein." }, 502, cors);
        return json({ ok: true, message: "Agent password reset ho gaya. Ab naye password se login karein." }, 200, cors);
      }

      const agentStatusMatch = path.match(/^\/api\/admin\/agents\/([0-9a-f-]+)$/i);
      if (agentStatusMatch && request.method === "PATCH") {
        const b = await request.json(); if (!["pending", "approved", "blocked"].includes(b.status)) return json({ error: "Status invalid hai." }, 400, cors);
        const r = await db(env, `agents?id=eq.${agentStatusMatch[1]}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ status: b.status }) });
        return json({ ok: r.ok }, r.ok ? 200 : 502, cors);
      }

      if (path === "/api/admin/jobs" && request.method === "GET") {
        const r = await db(env, "jobs?select=*&order=created_at.desc");
        const t = await r.text();
        if (!r.ok) return json({ error: "Jobs load nahi hue." }, 502, cors);
        return new Response(t, { headers: { ...cors, "Content-Type": "application/json" } });
      }

      if (path === "/api/admin/jobs" && request.method === "POST") {
        const b = await request.json();
        const title = cleanText(b.title, 160), company = cleanText(b.company_name, 160);
        const country = cleanText(b.country, 40), description = cleanText(b.description, 8000);
        if (!title || !company || !country || !description) return json({ error: "Job title, company, country aur description zaroori hain." }, 400, cors);
        if (!["Saudi Arabia", "UAE", "Kuwait", "Oman", "Bahrain"].includes(country)) return json({ error: "Country valid nahi hai." }, 400, cors);
        const record = {
          title, company_name: company, country, city: cleanText(b.city, 100) || null,
          salary: cleanText(b.salary, 100) || null, vacancies: Math.max(1, Math.min(100000, Number(b.vacancies) || 1)),
          qualification: cleanText(b.qualification, 500) || null, experience: cleanText(b.experience, 200) || null,
          job_type: cleanText(b.job_type, 60) || "Full Time", description,
          eligibility: cleanText(b.eligibility, 2000) || null, benefits: cleanText(b.benefits, 2000) || null,
          last_date: b.last_date || null, status: ["draft", "published", "closed"].includes(b.status) ? b.status : "published"
        };
        const r = await db(env, "jobs", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(record) });
        const t = await r.text();
        return new Response(t || JSON.stringify({ ok: r.ok }), { status: r.status, headers: { ...cors, "Content-Type": "application/json" } });
      }

      const jobMatch = path.match(/^\/api\/admin\/jobs\/([0-9a-f-]+)$/i);
      if (jobMatch && ["PUT", "DELETE"].includes(request.method)) {
        if (request.method === "DELETE") {
          const r = await db(env, `jobs?id=eq.${jobMatch[1]}`, { method: "DELETE" });
          return json({ ok: r.ok }, r.ok ? 200 : 502, cors);
        }
        const b = await request.json();
        const allowedFields = ["title","company_name","country","city","salary","vacancies","qualification","experience","job_type","description","eligibility","benefits","last_date","status"];
        const record = {};
        for (const k of allowedFields) if (b[k] !== undefined) record[k] = typeof b[k] === "string" ? cleanText(b[k], k === "description" ? 8000 : 2000) : b[k];
        const r = await db(env, `jobs?id=eq.${jobMatch[1]}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(record) });
        const t = await r.text();
        return new Response(t || JSON.stringify({ ok: r.ok }), { status: r.status, headers: { ...cors, "Content-Type": "application/json" } });
      }

      if (path === "/api/admin/applications" && request.method === "GET") {
        const r = await db(env, "applications?select=id,job_id,candidate_name,phone,email,message,document_path,status,created_at,jobs(title)&order=created_at.desc&limit=300");
        const t = await r.text();
        if (!r.ok) return json({ error: "Applications load nahi hui. Supabase relationship check karein." }, 502, cors);
        return new Response(t, { headers: { ...cors, "Content-Type": "application/json" } });
      }

      if (path === "/api/admin/success-stories" && request.method === "GET") {
        const r = await db(env, "success_stories?select=id,application_id,candidate_name,job_title,country,status,created_at&order=created_at.desc&limit=300");
        const t = await r.text();
        if (!r.ok) return json({ error: "Success stories load nahi hui. Pehle migration SQL run karein." }, 502, cors);
        return new Response(t, { headers: { ...cors, "Content-Type": "application/json" } });
      }

      // Backfill stories for candidates selected before this feature was deployed.
      // Existing story status is preserved, so an admin Draft stays Draft.
      if (path === "/api/admin/success-stories/sync" && request.method === "POST") {
        const ar = await db(env, "applications?select=id,candidate_name,jobs(title,country)&status=eq.selected&order=created_at.desc&limit=300");
        const at = await ar.text();
        if (!ar.ok) return json({ error: "Selected candidates load nahi hue. Database schema check karein." }, 502, cors);
        let apps;
        try { apps = JSON.parse(at); } catch { return json({ error: "Applications response samajh nahi aaya." }, 502, cors); }
        let created = 0, existing = 0;
        for (const a of apps) {
          const er = await db(env, `success_stories?select=id&application_id=eq.${encodeURIComponent(a.id)}&limit=1`);
          if (!er.ok) return json({ error: "Success stories table read nahi hui. Migration SQL check karein." }, 502, cors);
          const found = await er.json();
          if (found.length) { existing++; continue; }
          const job = a.jobs || {};
          const ir = await db(env, "success_stories", {
            method: "POST",
            headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ application_id: a.id, candidate_name: a.candidate_name, job_title: job.title || "Gulf Job", country: job.country || "Gulf", status: "published" })
          });
          if (!ir.ok) return json({ error: "Ek selected candidate ki story create nahi hui. Migration aur table columns check karein.", created, existing }, 502, cors);
          created++;
        }
        return json({ ok: true, selected: apps.length, created, existing, message: `${created} nayi stories publish hui; ${existing} existing stories ka status jaisa tha waisa rakha gaya.` }, 200, cors);
      }

      const storyMatch = path.match(/^\/api\/admin\/success-stories\/([0-9a-f-]+)$/i);
      if (storyMatch && request.method === "PATCH") {
        const b = await request.json();
        if (!["draft", "published"].includes(b.status)) return json({ error: "Story status valid nahi hai." }, 400, cors);
        const r = await db(env, `success_stories?id=eq.${storyMatch[1]}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ status: b.status, updated_at: new Date().toISOString() })
        });
        if (!r.ok) return json({ error: "Story status update nahi hua." }, 502, cors);
        return json({ ok: true }, 200, cors);
      }

      const appStatusMatch = path.match(/^\/api\/admin\/applications\/([0-9a-f-]+)$/i);
      if (appStatusMatch && request.method === "PATCH") {
        const b = await request.json();
        if (!["new", "reviewing", "selected", "rejected"].includes(b.status)) return json({ error: "Status valid nahi hai." }, 400, cors);
        const r = await db(env, `applications?id=eq.${appStatusMatch[1]}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ status: b.status }) });
        if (!r.ok) return json({ error: "Application status update nahi hua." }, 502, cors);

        // Only public, non-sensitive fields are copied to the story table.
        const existingResponse = await db(env, `success_stories?select=id,status&application_id=eq.${appStatusMatch[1]}&limit=1`);
        if (!existingResponse.ok) return json({ error: "Application status update ho gaya, lekin story table setup check karein." }, 502, cors);
        const existingStories = await existingResponse.json();
        if (b.status === "selected") {
          const ar = await db(env, `applications?select=id,candidate_name,jobs(title,country)&id=eq.${appStatusMatch[1]}&limit=1`);
          if (!ar.ok) return json({ error: "Selected candidate details load nahi hui." }, 502, cors);
          const apps = await ar.json();
          if (!apps.length) return json({ error: "Application nahi mili." }, 404, cors);
          const a = apps[0], job = a.jobs || {};
          const storyData = { application_id: a.id, candidate_name: a.candidate_name, job_title: job.title || "Gulf Job", country: job.country || "Gulf" };
          if (existingStories.length) {
            // Marking an application Selected republishes its story; admin can later Draft it.
            const upd = await db(env, `success_stories?id=eq.${existingStories[0].id}`, {
              method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
              body: JSON.stringify({ ...storyData, status: "published", updated_at: new Date().toISOString() })
            });
            if (!upd.ok) return json({ error: "Selected status save hua, story update nahi hui." }, 502, cors);
          } else {
            const ins = await db(env, "success_stories", {
              method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
              body: JSON.stringify({ ...storyData, status: "published" })
            });
            if (!ins.ok) return json({ error: "Selected status save hua, story create nahi hui. Migration SQL check karein." }, 502, cors);
          }
        } else if (existingStories.length) {
          const upd = await db(env, `success_stories?id=eq.${existingStories[0].id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ status: "draft", updated_at: new Date().toISOString() })
          });
          if (!upd.ok) return json({ error: "Application status save hua, story ko Draft nahi kar paye." }, 502, cors);
        }
        return json({ ok: true }, 200, cors);
      }

      const docMatch = path.match(/^\/api\/admin\/documents\/([0-9a-f-]+)$/i);
      if (docMatch && request.method === "GET") {
        const ar = await db(env, `applications?id=eq.${docMatch[1]}&select=document_path&limit=1`);
        if (!ar.ok) return json({ error: "Document record nahi mila." }, 502, cors);
        const rows = await ar.json();
        if (!rows.length || !rows[0].document_path) return json({ error: "Document nahi mila." }, 404, cors);
        const signUrl = env.SUPABASE_URL.replace(/\/$/, "") + "/storage/v1/object/sign/gulf-applications/" + rows[0].document_path;
        const sr = await fetch(signUrl, { method: "POST", headers: supabaseHeaders(env, { "Content-Type": "application/json" }), body: JSON.stringify({ expiresIn: 60 }) });
        const data = await sr.json();
        if (!sr.ok) return json({ error: "Private PDF link create nahi hui." }, 502, cors);
        const signed = data.signedURL || data.signedUrl;
        return json({ url: signed?.startsWith("http") ? signed : env.SUPABASE_URL.replace(/\/$/, "") + "/storage/v1" + signed }, 200, cors);
      }

      if (path.startsWith("/api/")) return json({ error: "API route nahi mila." }, 404, cors);
      return env.ASSETS.fetch(request);
    } catch (e) {
      return json({ error: "Server par error aaya. Settings aur logs check karein.", detail: (env.ENVIRONMENT === "development" ? String(e) : undefined) }, 500, cors);
    }
  },

  // Five-minute Gulf news monitor; retain the existing daily job cleanup.
  async scheduled(controller, env, ctx) {
    if (controller.cron === "*/5 * * * *") {
      ctx.waitUntil(collectGulfNews(env).then(result => {
        console.log("GulfJobsIndia news monitor:", JSON.stringify(result));
      }).catch(error => {
        console.error("GulfJobsIndia news monitor failed:", error?.message || error);
      }));
      return;
    }
    if (controller.cron === "0 3 * * *") {
      ctx.waitUntil(deleteExpiredJobs(env).then(result => {
        console.log("GulfJobsIndia auto-delete:", JSON.stringify(result));
      }).catch(error => {
        console.error("GulfJobsIndia auto-delete failed:", error?.message || error);
      }));
    }
  }
};
