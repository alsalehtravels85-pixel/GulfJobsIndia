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
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Cloudflare secrets missing: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== "*" ? env.ALLOWED_ORIGIN : "*";
    const cors = corsHeaders(allowed);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (path === "/api/health" && request.method === "GET") {
        return json({ ok: true, service: "GulfJobsIndia API" }, 200, cors);
      }

      if (path === "/api/config" && request.method === "GET") {
        return json({ whatsappNumber: env.WHATSAPP_NUMBER || "918576850306" }, 200, cors);
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

      if (path === "/api/agent/register" && request.method === "POST") {
        if (!env.SESSION_SECRET) return json({ error: "SESSION_SECRET Cloudflare mein set nahi hai." }, 500, cors);
        const b = await request.json();
        const name = cleanText(b.full_name, 100), phone = cleanText(b.phone, 20), email = cleanText(b.email, 160).toLowerCase(), agency = cleanText(b.agency_name, 160), password = String(b.password || "");
        if (!name || !phone || !email || !agency || password.length < 8 || password.length > 200) return json({ error: "Saari details bharein. Password kam se kam 8 characters ka ho." }, 400, cors);
        if (!/^[0-9+() -]{7,20}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email ya mobile number check karein." }, 400, cors);
        const exists = await db(env, `agents?select=id&email=eq.${encodeURIComponent(email)}&limit=1`);
        if (!exists.ok) {
          const detail = (await exists.text()).slice(0, 700);
          console.error("AGENT_REGISTER_LOOKUP_FAILED", exists.status, detail);
          return json({ error: "Supabase se agents lookup fail hua.", status: exists.status, detail }, 502, cors);
        }
        const existingRows = await exists.json();
        if (existingRows.length) return json({ error: "Is email se account pehle se hai." }, 409, cors);
        const r = await db(env, "agents", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ full_name: name, phone, email, agency_name: agency, password_hash: await passwordHash(password), status: "pending" }) });
        if (!r.ok) {
          const detail = (await r.text()).slice(0, 700);
          console.error("AGENT_REGISTER_INSERT_FAILED", r.status, detail);
          return json({ error: "Supabase mein registration save nahi hui.", status: r.status, detail }, 502, cors);
        }
        return json({ ok: true, message: "Registration ho gayi. Admin approval ke baad login kar sakenge." }, 201, cors);
      }
      if (path === "/api/agent/login" && request.method === "POST") {
        if (!env.SESSION_SECRET) return json({ error: "SESSION_SECRET Cloudflare mein set nahi hai." }, 500, cors);
        const b = await request.json(), email = cleanText(b.email, 160).toLowerCase(), password = String(b.password || "");
        const r = await db(env, `agents?select=id,full_name,email,password_hash,status&email=eq.${encodeURIComponent(email)}&limit=1`);
        if (!r.ok) return json({ error: "Agent database setup check karein." }, 502, cors);
        const rows = await r.json();
        if (!rows.length || !(await verifyPassword(password, rows[0].password_hash))) return json({ error: "Email ya password galat hai." }, 401, cors);
        if (rows[0].status !== "approved") return json({ error: rows[0].status === "blocked" ? "Account block hai. Admin se contact karein." : "Account approval pending hai." }, 403, cors);
        return json({ token: await createAgentToken(env, rows[0]), agent: { id: rows[0].id, full_name: rows[0].full_name, email: rows[0].email } }, 200, cors);
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
          const form = await request.formData(), candidateName = cleanText(form.get("candidate_name"), 100), phone = cleanText(form.get("phone"), 20), email = cleanText(form.get("email"), 160), message = cleanText(form.get("message"), 1000), jobId = cleanText(form.get("job_id"), 50), file = form.get("document");
          if (!candidateName || !phone || !file || typeof file.arrayBuffer !== "function") return json({ error: "Candidate name, mobile aur PDF zaroori hain." }, 400, cors);
          if (!/^[0-9+() -]{7,20}$/.test(phone)) return json({ error: "Mobile number check karein." }, 400, cors);
          if (file.size > 10 * 1024 * 1024) return json({ error: "PDF maximum 10 MB ki ho sakti hai." }, 400, cors);
          const bytes = new Uint8Array(await file.arrayBuffer()); if (!isPdf(bytes)) return json({ error: "Sirf valid PDF upload karein." }, 400, cors);
          if (!jobId) return json({ error: "Candidate ke liye job select karein." }, 400, cors);
          const jr = await db(env, `jobs?id=eq.${encodeURIComponent(jobId)}&status=eq.published&select=id&limit=1`);
          if (!jr.ok || !(await jr.json()).length) return json({ error: "Published job select karein." }, 400, cors);
          const objectPath = `agent-applications/${identity.agent_id}/${crypto.randomUUID()}.pdf`;
          const storageUrl = env.SUPABASE_URL.replace(/\/$/, "") + "/storage/v1/object/gulf-applications/" + objectPath;
          const upload = await fetch(storageUrl, { method: "POST", headers: supabaseHeaders(env, { "Content-Type": "application/pdf", "x-upsert": "false" }), body: bytes });
          if (!upload.ok) return json({ error: "PDF upload nahi hui. Supabase storage check karein." }, 502, cors);
          const ins = await db(env, "applications", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ job_id: jobId, candidate_name: candidateName, phone, email: email || null, message: message || null, document_path: objectPath, status: "new", agent_id: identity.agent_id }) });
          if (!ins.ok) { await fetch(storageUrl, { method: "DELETE", headers: supabaseHeaders(env) }); return json({ error: "Application save nahi hui. Database schema update karein." }, 502, cors); }
          await sendEmail(env, `Agent application: ${candidateName}`, `Agent ID: ${identity.agent_id}\nCandidate: ${candidateName}\nPhone: ${phone}\nPlease review in admin panel.`);
          return json({ ok: true, message: "Candidate application submit ho gayi." }, 201, cors);
        }
      }

      if (path === "/api/applications" && request.method === "POST") {
        const form = await request.formData();
        const candidateName = cleanText(form.get("candidate_name"), 100);
        const phone = cleanText(form.get("phone"), 20);
        const email = cleanText(form.get("email"), 160);
        const message = cleanText(form.get("message"), 1000);
        const jobId = cleanText(form.get("job_id"), 50);
        const file = form.get("document");
        if (!candidateName || !phone || !file || typeof file.arrayBuffer !== "function") {
          return json({ error: "Name, mobile number aur ek PDF file zaroori hain." }, 400, cors);
        }
        if (!/^[0-9+() -]{7,20}$/.test(phone)) return json({ error: "Mobile number check karein." }, 400, cors);
        if (file.size > 10 * 1024 * 1024) return json({ error: "PDF maximum 10 MB ki ho sakti hai." }, 400, cors);
        if (file.type && file.type !== "application/pdf") return json({ error: "Sirf PDF file upload karein." }, 400, cors);
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!isPdf(bytes)) return json({ error: "File valid PDF nahi lag rahi." }, 400, cors);

        let jobTitle = "General application";
        if (jobId) {
          const jr = await db(env, `jobs?id=eq.${encodeURIComponent(jobId)}&status=eq.published&select=id,title&limit=1`);
          if (jr.ok) {
            const rows = await jr.json();
            if (!rows.length) return json({ error: "Ye job ab available nahi hai. Page refresh karein." }, 400, cors);
            jobTitle = rows[0].title;
          } else return json({ error: "Job verify nahi ho saki." }, 502, cors);
        }

        const safeName = crypto.randomUUID() + ".pdf";
        const objectPath = `applications/${new Date().getUTCFullYear()}/${safeName}`;
        const storageUrl = env.SUPABASE_URL.replace(/\/$/, "") + "/storage/v1/object/gulf-applications/" + objectPath;
        const upload = await fetch(storageUrl, {
          method: "POST",
          headers: supabaseHeaders(env, { "Content-Type": "application/pdf", "x-upsert": "false" }),
          body: bytes
        });
        if (!upload.ok) return json({ error: "PDF upload nahi ho saki. Thodi der baad dobara try karein." }, 502, cors);

        const insert = await db(env, "applications", {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            job_id: jobId || null,
            candidate_name: candidateName,
            phone,
            email: email || null,
            message: message || null,
            document_path: objectPath,
            status: "new"
          })
        });
        if (!insert.ok) {
          await fetch(storageUrl, { method: "DELETE", headers: supabaseHeaders(env) });
          return json({ error: "Application save nahi hui. Database setup check karna hoga." }, 502, cors);
        }
        await sendEmail(env, `New GulfJobsIndia application: ${candidateName}`, 
          `New application received.\nName: ${candidateName}\nPhone: ${phone}\nEmail: ${email || "Not provided"}\nJob: ${jobTitle}\nStatus: New\nPlease login to the admin panel to review the private PDF.`);
        return json({ ok: true, message: "Application submit ho gayi! Hum aapse zaroorat padne par contact karenge." }, 201, cors);
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

      const appStatusMatch = path.match(/^\/api\/admin\/applications\/([0-9a-f-]+)$/i);
      if (appStatusMatch && request.method === "PATCH") {
        const b = await request.json();
        if (!["new", "reviewing", "selected", "rejected"].includes(b.status)) return json({ error: "Status valid nahi hai." }, 400, cors);
        const r = await db(env, `applications?id=eq.${appStatusMatch[1]}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ status: b.status }) });
        return json({ ok: r.ok }, r.ok ? 200 : 502, cors);
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
      console.error("WORKER_REQUEST_ERROR", request.method, new URL(request.url).pathname, e?.stack || String(e));
      return json({ error: "Server par error aaya. Settings aur logs check karein.", detail: String(e?.message || e).slice(0, 500) }, 500, cors);
    }
  }
};
