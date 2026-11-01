const TOKEN_KEY = "gji_admin_token";
let token = sessionStorage.getItem(TOKEN_KEY) || "";
let jobsCache = [];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(path, { ...options, headers });
  const data = await r.json().catch(() => ({}));

  if (r.status === 401 && path !== "/api/admin/login") {
    logout();
    throw new Error("Session expire ho gaya. Dobara login karein.");
  }

  if (!r.ok) throw new Error(data.error || "Request fail hui.");
  return data;
}

function showDashboard() {
  $("#loginPanel").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");
  loadJobs();
}

function logout() {
  token = "";
  sessionStorage.removeItem(TOKEN_KEY);
  $("#dashboard").classList.add("hidden");
  $("#loginPanel").classList.remove("hidden");
}

/* ADMIN LOGIN — fixed: form ko await se pehle save karein */
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  const form = e.currentTarget;
  const msg = $("#loginMessage");
  const btn = $("#loginBtn");

  msg.textContent = "";
  btn.disabled = true;
  btn.textContent = "Checking…";

  try {
    const password = new FormData(form).get("password");
    const data = await api("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    token = data.token;
    sessionStorage.setItem(TOKEN_KEY, token);
    form.reset();
    showDashboard();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "admin-message error";
  } finally {
    btn.disabled = false;
    btn.textContent = "Login";
  }
});

$("#logoutBtn").addEventListener("click", logout);

document.querySelectorAll(".admin-tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-tabs button").forEach(b => {
      b.classList.toggle("active", b === btn);
    });

    document.querySelectorAll(".admin-panel").forEach(p => {
      p.classList.toggle("hidden", p.id !== btn.dataset.tab);
    });

    if (btn.dataset.tab === "applicationsTab") loadApplications();
    if (btn.dataset.tab === "agentsTab") loadAgents();
  });
});

function formObject(form) {
  const fd = new FormData(form);
  const out = {};

  for (const [k, v] of fd.entries()) {
    if (k !== "id") out[k] = v;
  }

  out.vacancies = Number(out.vacancies || 1);
  if (!out.last_date) out.last_date = null;
  return out;
}

// JOB FILE IMPORT: adds a small uploader without changing admin.html layout.
(function setupJobImport(){
  const form = document.querySelector("#jobForm");
  if (!form || document.querySelector("#jobImportFile")) return;
  const box = document.createElement("div");
  box.className = "admin-card";
  box.style.cssText = "margin:12px 0 18px;padding:14px;border:1px solid var(--line,#d1d5db);border-radius:12px;background:#f8fafc";
  box.innerHTML = '<strong>Import Job File (JSON)</strong><p style="margin:6px 0 10px">JSON file select karein — job fields automatic fill honge. Check karke Draft ya Published select karein, phir Save Job dabayein.</p><input id="jobImportFile" type="file" accept=".json,application/json"><p id="jobImportMessage" class="admin-message" role="status"></p>';
  form.parentNode.insertBefore(box, form);
  const input = box.querySelector("#jobImportFile"), message = box.querySelector("#jobImportMessage");
  const aliases = {
    title:["title","job_title","post_title","position"], company_name:["company_name","company","employer","companyName"],
    country:["country","work_country"], city:["city","location"], salary:["salary","salary_package","package"],
    vacancies:["vacancies","total_vacancies","number_of_vacancies"], qualification:["qualification","education","required_qualification"],
    experience:["experience","required_experience"], job_type:["job_type","employment_type","type"], last_date:["last_date","application_deadline","last_date_to_apply"],
    status:["status","publication_status"], benefits:["benefits","duty_hours","facilities"], description:["description","short_description","job_description"],
    eligibility:["eligibility","requirements","additional_requirements"]
  };
  function normDate(v){ if(!v) return ""; const s=String(v).trim(); if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; let m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/); if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; return ""; }
  function pick(obj, keys){ for(const k of keys){ if(obj[k]!==undefined && obj[k]!==null && String(obj[k]).trim()!=='') return obj[k]; } return ""; }
  input.addEventListener("change", async ()=>{
    const file=input.files && input.files[0]; if(!file) return;
    try {
      if(file.size>1024*1024) throw new Error("JSON file 1 MB se chhoti honi chahiye.");
      const raw=JSON.parse(await file.text()); const data=raw.job && typeof raw.job==='object' ? raw.job : (Array.isArray(raw.jobs) ? raw.jobs[0] : raw);
      if(!data || typeof data!=='object' || Array.isArray(data)) throw new Error("JSON mein job details wala object nahi mila.");
      const f=document.querySelector("#jobForm"); f.reset(); if(f.elements.id) f.elements.id.value="";
      for(const [field,keys] of Object.entries(aliases)){
        const el=f.elements[field]; if(!el) continue; let val=pick(data,keys); if(field==='last_date') val=normDate(val);
        if(field==='vacancies') val=val ? Math.max(1,parseInt(val,10)||1) : 1;
        if(field==='country' && val){ const s=String(val).toLowerCase(); val=s.includes('saudi')||s==='ksa'?'Saudi Arabia':s==='uae'||s.includes('united arab')?'UAE':s.includes('kuwait')?'Kuwait':s.includes('oman')?'Oman':s.includes('bahrain')?'Bahrain':val; }
        if(field==='job_type' && val){ const s=String(val).toLowerCase(); val=s.includes('contract')?'Contract':s.includes('tempor')?'Temporary':'Full Time'; }
        if(field==='status'){ const s=String(val||'draft').toLowerCase(); val=['draft','published','closed'].includes(s)?s:'draft'; }
        if(val!=='' && val!==undefined) el.value=String(val);
      }
      if(f.elements.status && !pick(data,aliases.status)) f.elements.status.value='draft';
      if(f.elements.id) f.elements.id.value='';
      const missing=['title','company_name','description'].filter(k=>!String(f.elements[k]?.value||'').trim());
      message.className='admin-message '+(missing.length?'error':'success');
      message.textContent=missing.length ? 'File import ho gayi, lekin ye required fields check karein: '+missing.join(', ') : 'Job fields fill ho gaye. Details verify karke Draft/Published select karein aur Save Job dabayein.';
      if(f.elements.id) f.elements.id.value='';
      const title=document.querySelector('#jobFormTitle'); if(title) title.textContent='Add a Gulf Job';
      const save=document.querySelector('#saveJobBtn'); if(save) save.textContent='Save Job';
      const cancel=document.querySelector('#cancelEditBtn'); if(cancel) cancel.classList.add('hidden');
      f.scrollIntoView({behavior:'smooth',block:'start'});
    } catch(err){ message.className='admin-message error'; message.textContent='Import nahi hua: '+err.message; }
  });
})();

$("#jobForm").addEventListener("submit", async e => {
  e.preventDefault();

  const form = e.currentTarget;
  const id = form.elements.id.value;
  const msg = $("#jobMessage");
  const btn = $("#saveJobBtn");

  msg.textContent = "";
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    await api(id ? `/api/admin/jobs/${id}` : "/api/admin/jobs", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formObject(form))
    });

    msg.className = "admin-message success";
    msg.textContent = id ? "Job updated." : "Job added.";
    resetJobForm();
    await loadJobs();
  } catch (err) {
    msg.className = "admin-message error";
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Job";
  }
});

function resetJobForm() {
  const f = $("#jobForm");
  f.reset();
  f.elements.id.value = "";
  f.elements.vacancies.value = 1;
  f.elements.status.value = "published";

  $("#jobFormTitle").textContent = "Add a Gulf Job";
  $("#saveJobBtn").textContent = "Save Job";
  $("#cancelEditBtn").classList.add("hidden");
}

$("#cancelEditBtn").addEventListener("click", resetJobForm);

async function loadJobs() {
  const rows = $("#adminJobsRows");
  rows.innerHTML = `<tr><td colspan="4">Loading…</td></tr>`;

  try {
    jobsCache = await api("/api/admin/jobs");

    rows.innerHTML = jobsCache.length
      ? jobsCache.map(j => `
          <tr>
            <td><strong>${esc(j.title)}</strong><br><small>${esc(j.company_name)}</small></td>
            <td>${esc(j.country)}</td>
            <td>${esc(j.status)}</td>
            <td>
              <button class="small-btn" data-edit="${esc(j.id)}">Edit</button>
              <button class="small-btn danger" data-delete="${esc(j.id)}">Delete</button>
            </td>
          </tr>
        `).join("")
      : `<tr><td colspan="4">Abhi koi job nahi. Upar form se add karein.</td></tr>`;
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="4">${esc(err.message)}</td></tr>`;
  }
}

$("#adminJobsRows").addEventListener("click", async e => {
  const edit = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-delete]");

  if (edit) {
    const j = jobsCache.find(x => x.id === edit.dataset.edit);
    if (!j) return;

    const f = $("#jobForm");
    for (const k of [
      "id", "title", "company_name", "country", "city", "salary",
      "vacancies", "qualification", "experience", "job_type",
      "last_date", "status", "benefits", "description", "eligibility"
    ]) {
      if (f.elements[k]) f.elements[k].value = j[k] ?? "";
    }

    $("#jobFormTitle").textContent = "Edit Gulf Job";
    $("#saveJobBtn").textContent = "Update Job";
    $("#cancelEditBtn").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (del && confirm("Is job ko delete karna hai?")) {
    try {
      await api(`/api/admin/jobs/${del.dataset.delete}`, { method: "DELETE" });
      await loadJobs();
    } catch (err) {
      alert(err.message);
    }
  }
});

async function loadApplications() {
  const rows = $("#applicationsRows");
  rows.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;

  try {
    const apps = await api("/api/admin/applications");

    rows.innerHTML = apps.length
      ? apps.map(a => `
          <tr>
            <td>
              <strong>${esc(a.candidate_name)}</strong><br>
              ${esc(a.phone)}<br>
              <small>${esc(a.email || "")}</small>
              ${a.message ? `<br><small>${esc(a.message)}</small>` : ""}
            </td>
            <td>${esc(a.jobs?.title || "General")}</td>
            <td>${new Date(a.created_at).toLocaleString()}</td>
            <td>
              <select class="status-select" data-status="${esc(a.id)}">
                <option value="new" ${a.status === "new" ? "selected" : ""}>New</option>
                <option value="reviewing" ${a.status === "reviewing" ? "selected" : ""}>Reviewing</option>
                <option value="selected" ${a.status === "selected" ? "selected" : ""}>Selected</option>
                <option value="rejected" ${a.status === "rejected" ? "selected" : ""}>Rejected</option>
              </select>
            </td>
            <td><button class="small-btn" data-doc="${esc(a.id)}">Open PDF</button></td>
          </tr>
        `).join("")
      : `<tr><td colspan="5">Abhi applications nahi aayi hain.</td></tr>`;
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="5">${esc(err.message)}</td></tr>`;
  }
}

$("#applicationsRows").addEventListener("change", async e => {
  const sel = e.target.closest("[data-status]");
  if (!sel) return;

  try {
    await api(`/api/admin/applications/${sel.dataset.status}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: sel.value })
    });
    $("#applicationMessage").textContent = "Status updated.";
  } catch (err) {
    $("#applicationMessage").textContent = err.message;
  }
});

$("#applicationsRows").addEventListener("click", async e => {
  const btn = e.target.closest("[data-doc]");
  if (!btn) return;

  btn.disabled = true;
  try {
    const data = await api(`/api/admin/documents/${btn.dataset.doc}`);
    window.open(data.url, "_blank", "noopener");
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
});

if (token) showDashboard();

async function loadAgents() {
  const rows = $("#agentsRows");
  rows.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';

  try {
    const agents = await api("/api/admin/agents");

    rows.innerHTML = agents.length
      ? agents.map(a => `
          <tr>
            <td>
              <strong>${esc(a.full_name)}</strong><br>
              ${esc(a.phone)}<br>
              <small>${esc(a.email)}</small>
            </td>
            <td>${esc(a.agency_name)}</td>
            <td>${esc(a.status)}</td>
            <td>
              <select data-agent-status="${esc(a.id)}">
                <option value="pending" ${a.status === "pending" ? "selected" : ""}>Pending</option>
                <option value="approved" ${a.status === "approved" ? "selected" : ""}>Approved</option>
                <option value="blocked" ${a.status === "blocked" ? "selected" : ""}>Blocked</option>
              </select>
            </td>
          </tr>
        `).join("")
      : '<tr><td colspan="4">Abhi koi agent registered nahi.</td></tr>';
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="4">${esc(err.message)}</td></tr>`;
  }
}

$("#agentsRows")?.addEventListener("change", async e => {
  const sel = e.target.closest("[data-agent-status]");
  if (!sel) return;

  try {
    await api(`/api/admin/agents/${sel.dataset.agentStatus}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: sel.value })
    });
    $("#agentsMessage").textContent = "Agent status update ho gaya.";
  } catch (err) {
    $("#agentsMessage").textContent = err.message;
    loadAgents();
  }
});
