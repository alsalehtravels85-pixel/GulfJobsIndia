const TOKEN_KEY = "gji_admin_token";
let token = sessionStorage.getItem(TOKEN_KEY) || "";
let jobsCache = [];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(path, { ...options, headers });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "/api/admin/login") { logout(); throw new Error("Session expire ho gaya. Dobara login karein."); }
  if (!r.ok) throw new Error(data.error || "Request fail hui.");
  return data;
}
function showDashboard() { $("#loginPanel").classList.add("hidden"); $("#dashboard").classList.remove("hidden"); loadJobs(); }
function logout() { token = ""; sessionStorage.removeItem(TOKEN_KEY); $("#dashboard").classList.add("hidden"); $("#loginPanel").classList.remove("hidden"); }
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); const form = e.currentTarget; const msg = $("#loginMessage"), btn = $("#loginBtn");
  msg.textContent = ""; btn.disabled = true; btn.textContent = "Checking…";
  try {
    const password = new FormData(form).get("password");
    const data = await api("/api/admin/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({password}) });
    token = data.token; sessionStorage.setItem(TOKEN_KEY, token); form.reset(); showDashboard();
  } catch(err) { msg.textContent = err.message; msg.className = "admin-message error"; }
  finally { btn.disabled = false; btn.textContent = "Login"; }
});
$("#logoutBtn").addEventListener("click", logout);
document.querySelectorAll(".admin-tabs button").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".admin-tabs button").forEach(b => b.classList.toggle("active", b === btn));
  document.querySelectorAll(".admin-panel").forEach(p => p.classList.toggle("hidden", p.id !== btn.dataset.tab));
  if (btn.dataset.tab === "applicationsTab") loadApplications();
  if (btn.dataset.tab === "agentsTab") loadAgents();
}));
function formObject(form) {
  const fd = new FormData(form), out = {};
  for (const [k,v] of fd.entries()) if (k !== "id") out[k] = v;
  out.vacancies = Number(out.vacancies || 1);
  if (!out.last_date) out.last_date = null;
  return out;
}
$("#jobForm").addEventListener("submit", async e => {
  e.preventDefault(); const form = e.currentTarget, id = form.elements.id.value, msg = $("#jobMessage"), btn = $("#saveJobBtn");
  msg.textContent = ""; btn.disabled = true; btn.textContent = "Saving…";
  try {
    await api(id ? `/api/admin/jobs/${id}` : "/api/admin/jobs", { method:id ? "PUT" : "POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(formObject(form)) });
    msg.className = "admin-message success"; msg.textContent = id ? "Job updated." : "Job added.";
    resetJobForm(); await loadJobs();
  } catch(err) { msg.className = "admin-message error"; msg.textContent = err.message; }
  finally { btn.disabled = false; btn.textContent = "Save Job"; }
});
function resetJobForm() {
  const f = $("#jobForm"); f.reset(); f.elements.id.value = ""; f.elements.vacancies.value = 1; f.elements.status.value = "published";
  $("#jobFormTitle").textContent = "Add a Gulf Job"; $("#saveJobBtn").textContent = "Save Job"; $("#cancelEditBtn").classList.add("hidden");
}
$("#cancelEditBtn").addEventListener("click", resetJobForm);
async function loadJobs() {
  const rows = $("#adminJobsRows"); rows.innerHTML = `<tr><td colspan="4">Loading…</td></tr>`;
  try {
    jobsCache = await api("/api/admin/jobs");
    rows.innerHTML = jobsCache.length ? jobsCache.map(j => `<tr><td><strong>${esc(j.title)}</strong><br><small>${esc(j.company_name)}</small></td><td>${esc(j.country)}</td><td>${esc(j.status)}</td><td><button class="small-btn" data-edit="${esc(j.id)}">Edit</button><button class="small-btn danger" data-delete="${esc(j.id)}">Delete</button></td></tr>`).join("") : `<tr><td colspan="4">Abhi koi job nahi. Upar form se add karein.</td></tr>`;
  } catch(err) { rows.innerHTML = `<tr><td colspan="4">${esc(err.message)}</td></tr>`; }
}
$("#adminJobsRows").addEventListener("click", async e => {
  const edit = e.target.closest("[data-edit]"), del = e.target.closest("[data-delete]");
  if (edit) {
    const j = jobsCache.find(x => x.id === edit.dataset.edit); if (!j) return;
    const f = $("#jobForm"); for (const k of ["id","title","company_name","country","city","salary","vacancies","qualification","experience","job_type","last_date","status","benefits","description","eligibility"]) if (f.elements[k]) f.elements[k].value = j[k] ?? "";
    $("#jobFormTitle").textContent = "Edit Gulf Job"; $("#saveJobBtn").textContent = "Update Job"; $("#cancelEditBtn").classList.remove("hidden"); window.scrollTo({top:0,behavior:"smooth"});
  }
  if (del && confirm("Is job ko delete karna hai?")) {
    try { await api(`/api/admin/jobs/${del.dataset.delete}`, {method:"DELETE"}); await loadJobs(); }
    catch(err) { alert(err.message); }
  }
});
async function loadApplications() {
  const rows = $("#applicationsRows"); rows.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;
  try {
    const apps = await api("/api/admin/applications");
    rows.innerHTML = apps.length ? apps.map(a => `<tr><td><strong>${esc(a.candidate_name)}</strong><br>${esc(a.phone)}<br><small>${esc(a.email || "")}</small>${a.message ? `<br><small>${esc(a.message)}</small>`:""}</td><td>${esc(a.jobs?.title || "General")}</td><td>${new Date(a.created_at).toLocaleString()}</td><td><select class="status-select" data-status="${esc(a.id)}"><option value="new" ${a.status==="new"?"selected":""}>New</option><option value="reviewing" ${a.status==="reviewing"?"selected":""}>Reviewing</option><option value="selected" ${a.status==="selected"?"selected":""}>Selected</option><option value="rejected" ${a.status==="rejected"?"selected":""}>Rejected</option></select></td><td><button class="small-btn" data-doc="${esc(a.id)}">Open PDF</button></td></tr>`).join("") : `<tr><td colspan="5">Abhi applications nahi aayi hain.</td></tr>`;
  } catch(err) { rows.innerHTML = `<tr><td colspan="5">${esc(err.message)}</td></tr>`; }
}
$("#applicationsRows").addEventListener("change", async e => {
  const sel = e.target.closest("[data-status]"); if (!sel) return;
  try { await api(`/api/admin/applications/${sel.dataset.status}`, {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({status:sel.value})}); $("#applicationMessage").textContent = "Status updated."; }
  catch(err) { $("#applicationMessage").textContent = err.message; }
});
$("#applicationsRows").addEventListener("click", async e => {
  const btn = e.target.closest("[data-doc]"); if (!btn) return;
  btn.disabled = true;
  try { const data = await api(`/api/admin/documents/${btn.dataset.doc}`); window.open(data.url, "_blank", "noopener"); }
  catch(err) { alert(err.message); }
  finally { btn.disabled = false; }
});
if (token) showDashboard();

async function loadAgents(){const rows=$("#agentsRows");rows.innerHTML='<tr><td colspan="4">Loading…</td></tr>';try{const agents=await api("/api/admin/agents");rows.innerHTML=agents.length?agents.map(a=>`<tr><td><strong>${esc(a.full_name)}</strong><br>${esc(a.phone)}<br><small>${esc(a.email)}</small></td><td>${esc(a.agency_name)}</td><td>${esc(a.status)}</td><td><select data-agent-status="${esc(a.id)}"><option value="pending" ${a.status==="pending"?"selected":""}>Pending</option><option value="approved" ${a.status==="approved"?"selected":""}>Approved</option><option value="blocked" ${a.status==="blocked"?"selected":""}>Blocked</option></select></td></tr>`).join(""):'<tr><td colspan="4">Abhi koi agent registered nahi.</td></tr>'}catch(err){rows.innerHTML=`<tr><td colspan="4">${esc(err.message)}</td></tr>`}}
$("#agentsRows")?.addEventListener("change",async e=>{const sel=e.target.closest("[data-agent-status]");if(!sel)return;try{await api(`/api/admin/agents/${sel.dataset.agentStatus}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:sel.value})});$("#agentsMessage").textContent="Agent status update ho gaya."}catch(err){$("#agentsMessage").textContent=err.message;loadAgents()}});
