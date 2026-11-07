const API_BASE = "https://gulfjobsindia.gulfjob.workers.dev";
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

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const r = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await r.json().catch(() => ({}));

  if (r.status === 401 && path !== "/api/admin/login") {
    logout();
    throw new Error("Session expire ho gaya. Dobara login karein.");
  }

  if (!r.ok) {
    throw new Error(data.error || "Request fail hui.");
  }

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

/* FIXED ADMIN LOGIN */
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  // Important: await se pehle form save karein.
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

    // FIX: e.currentTarget.reset() ki jagah saved form.
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
    document.querySelectorAll(".admin-tabs button")
      .forEach(b => b.classList.toggle("active", b === btn));

    document.querySelectorAll(".admin-panel").forEach(p => {
      p.classList.toggle("hidden", p.id !== btn.dataset.tab);
    });

    if (btn.dataset.tab === "applicationsTab") loadApplications();
    if (btn.dataset.tab === "agentsTab") loadAgents();
    if (btn.dataset.tab === "storiesTab") loadStories();
  });
});

/* JOB JSON IMPORT */
(function setupJobImport() {
  const form = document.querySelector("#jobForm");

  if (!form || document.querySelector("#jobJsonImport")) return;

  const box = document.createElement("section");
  box.id = "jobJsonImport";
  box.className = "admin-card";
  box.style.cssText =
    "margin:0 0 18px;padding:16px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc";

  box.innerHTML = `
    <h3 style="margin:0 0 6px">📥 Import Job from JSON</h3>
    <p class="admin-help" style="margin:0 0 12px">
      JSON file select karein. Details existing form mein fill hongi.
      Verify karke Draft ya Published select karein, phir Save Job dabayein.
      Import khud se publish nahi karta.
    </p>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <input id="jobJsonFile" type="file" accept=".json,application/json" style="max-width:100%">
      <button id="jobJsonLoad" class="btn btn-outline" type="button">Load JSON</button>
    </div>
    <p id="jobJsonMessage" class="admin-message" role="status" aria-live="polite"></p>
  `;

  form.parentNode.insertBefore(box, form);

  const msg = box.querySelector("#jobJsonMessage");

  const say = (text, ok = false) => {
    msg.textContent = text;
    msg.className = "admin-message " + (ok ? "success" : "error");
  };

  const first = (obj, keys) => {
    for (const k of keys) {
      if (
        obj[k] !== undefined &&
        obj[k] !== null &&
        String(obj[k]).trim() !== ""
      ) return obj[k];
    }
    return "";
  };

  function normalizeCountry(value) {
    const v = String(value || "").trim().toLowerCase();

    if (["saudi arabia", "saudi", "ksa", "kingdom of saudi arabia"].includes(v))
      return "Saudi Arabia";

    if (["uae", "united arab emirates", "emirates"].includes(v))
      return "UAE";

    if (v === "kuwait") return "Kuwait";
    if (v === "oman") return "Oman";
    if (v === "bahrain") return "Bahrain";

    return value || "";
  }

  function normalizeJobType(value) {
    const v = String(value || "").trim().toLowerCase();

    if (v.includes("contract")) return "Contract";
    if (v.includes("temporary") || v.includes("temp")) return "Temporary";

    return "Full Time";
  }

  function normalizeStatus(value) {
    const v = String(value || "").trim().toLowerCase();

    if (["published", "publish", "live"].includes(v)) return "published";
    if (["closed", "expired"].includes(v)) return "closed";

    return "draft";
  }

  box.querySelector("#jobJsonLoad").addEventListener("click", async () => {
    const file = box.querySelector("#jobJsonFile").files[0];

    if (!file) return say("Pehle JSON file select karein.");

    if (file.size > 1024 * 1024)
      return say("JSON file 1 MB se chhoti honi chahiye.");

    try {
      const raw = JSON.parse(await file.text());

      const source = Array.isArray(raw)
        ? raw[0]
        : (raw.job || raw.data?.job || raw.data || (Array.isArray(raw.jobs) ? raw.jobs[0] : raw));

      if (!source || typeof source !== "object" || Array.isArray(source))
        throw new Error("JSON mein job object nahi mila.");

      const aliases = {
        title: ["title", "job_title", "post_title", "position", "jobTitle"],
        company_name: ["company_name", "company_employer", "company", "employer", "companyName", "companyEmployer"],
        country: ["country", "job_country", "location_country"],
        city: ["city", "location", "job_location"],
        salary: ["salary", "package", "salary_package", "pay"],
        vacancies: ["vacancies", "vacancy", "posts", "number_of_vacancies"],
        qualification: ["qualification", "education", "eligibility_qualification"],
        experience: ["experience", "work_experience"],
        job_type: ["job_type", "employment_type", "type"],
        last_date: ["last_date", "last_date_to_apply", "application_deadline", "deadline"],
        benefits: ["benefits", "facilities", "perks"],
        description: ["description", "job_description", "details", "responsibilities"],
        eligibility: ["eligibility", "requirements", "other_eligibility"]
      };

      const f = document.querySelector("#jobForm");

      for (const [field, keys] of Object.entries(aliases)) {
        const el = f.elements[field];
        if (!el) continue;

        let value = first(source, keys);

        if (field === "country") value = normalizeCountry(value);
        if (field === "job_type") value = normalizeJobType(value);

        if (field === "vacancies") {
          const vacancyText = String(value ?? "").trim();
          const isUnknown = !vacancyText || /^(not specified|not available|n\/?a|na|unknown|-)$/i.test(vacancyText);
          if (isUnknown) {
            value = "";
          } else {
            const parsedVacancies = Number.parseInt(vacancyText.replace(/,/g, ""), 10);
            value = Number.isFinite(parsedVacancies) && parsedVacancies >= 1
              ? parsedVacancies
              : "";
          }
        }

        if (field === "last_date") {
          value = String(value || "").trim();

          if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
            const [d, m, y] = value.split("/");
            value = `${y}-${m}-${d}`;
          }

          if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            value = "";
          }
        }

        el.value = value ?? "";
      }

      if (f.elements.status) {
        f.elements.status.value =
          normalizeStatus(first(source, ["status", "publication_status"]));
      }

      if (f.elements.id) f.elements.id.value = "";

      const title = document.querySelector("#jobFormTitle");
      if (title) title.textContent = "Add a Gulf Job";

      const save = document.querySelector("#saveJobBtn");
      if (save) save.textContent = "Save Job";

      document.querySelector("#cancelEditBtn")?.classList.add("hidden");

      say(
        "JSON load ho gaya. Details verify karein, phir Draft/Published select karke Save Job dabayein.",
        true
      );

      form.scrollIntoView({ behavior: "smooth", block: "start" });

    } catch (err) {
      say("JSON read nahi hui: " + (err.message || "format check karein."));
    }
  });
})();

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

/* SAVE JOB */
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
    await api(
      id ? `/api/admin/jobs/${id}` : "/api/admin/jobs",
      {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formObject(form))
      }
    );

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

  if (!f) return;

  f.reset();

  if (f.elements.id) f.elements.id.value = "";
  if (f.elements.vacancies) f.elements.vacancies.value = 1;
  if (f.elements.status) f.elements.status.value = "published";

  const title = $("#jobFormTitle");
  if (title) title.textContent = "Add a Gulf Job";

  const save = $("#saveJobBtn");
  if (save) save.textContent = "Save Job";

  $("#cancelEditBtn")?.classList.add("hidden");
}

$("#cancelEditBtn")?.addEventListener("click", resetJobForm);

/* LOAD JOBS */
async function loadJobs() {
  const rows = $("#adminJobsRows");

  if (!rows) return;

  rows.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';

  try {
    jobsCache = await api("/api/admin/jobs");

    rows.innerHTML = jobsCache.length
      ? jobsCache.map(j => `
        <tr>
          <td>
            <strong>${esc(j.title)}</strong><br>
            <small>${esc(j.company_name)}</small>
          </td>
          <td>${esc(j.country)}</td>
          <td>${esc(j.status)}</td>
          <td>
            <button class="small-btn" data-edit="${esc(j.id)}">Edit</button>
            <button class="small-btn danger" data-delete="${esc(j.id)}">Delete</button>
          </td>
        </tr>
      `).join("")
      : '<tr><td colspan="4">Abhi koi job nahi. Upar form se add karein.</td></tr>';

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
      await api(`/api/admin/jobs/${del.dataset.delete}`, {
        method: "DELETE"
      });

      await loadJobs();

    } catch (err) {
      alert(err.message);
    }
  }
});

/* APPLICATIONS */
async function loadApplications() {
  const rows = $("#applicationsRows");

  if (!rows) return;

  rows.innerHTML = '<tr><td colspan="5">Loading…</td></tr>';

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
      : '<tr><td colspan="5">Abhi applications nahi aayi hain.</td></tr>';

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

/* AGENTS */
async function loadAgents() {
  const rows = $("#agentsRows");

  if (!rows) return;

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

/* SUCCESS STORIES */
async function loadStories() {
  const rows = $("#storiesRows");

  if (!rows) return;

  rows.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';

  try {
    const stories = await api("/api/admin/success-stories");

    rows.innerHTML = stories.length
      ? stories.map(s => `
        <tr>
          <td>
            <strong>${esc(s.candidate_name)}</strong><br>
            <small>${esc(s.job_title)} · ${esc(s.country)}</small>
          </td>
          <td>${new Date(s.created_at).toLocaleDateString()}</td>
          <td><span class="pill">${esc(s.status)}</span></td>
          <td>
            <select data-story-status="${esc(s.id)}" aria-label="Success story status">
              <option value="published" ${s.status === "published" ? "selected" : ""}>Published</option>
              <option value="draft" ${s.status === "draft" ? "selected" : ""}>Draft</option>
            </select>
          </td>
        </tr>
      `).join("")
      : '<tr><td colspan="4">Abhi koi selected candidate story nahi hai. Applications mein candidate ko Selected karein.</td></tr>';

  } catch (err) {
    rows.innerHTML = `<tr><td colspan="4">${esc(err.message)}</td></tr>`;
  }
}

$("#storiesRows")?.addEventListener("change", async e => {
  const sel = e.target.closest("[data-story-status]");
  if (!sel) return;

  sel.disabled = true;

  try {
    await api(`/api/admin/success-stories/${sel.dataset.storyStatus}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: sel.value })
    });

    const msg = $("#storiesMessage");

    msg.className = "admin-message success";
    msg.textContent =
      `Story ${sel.value === "published" ? "publish" : "draft"} ho gayi.`;

  } catch (err) {
    const msg = $("#storiesMessage");

    msg.className = "admin-message error";
    msg.textContent = err.message;

    loadStories();

  } finally {
    sel.disabled = false;
  }
});

const syncStoriesBtn = document.querySelector("#syncStoriesBtn");

syncStoriesBtn?.addEventListener("click", async () => {
  const msg = $("#storiesMessage");

  syncStoriesBtn.disabled = true;
  syncStoriesBtn.textContent = "Syncing…";

  msg.className = "admin-message";
  msg.textContent = "Selected candidates check ho rahe hain…";

  try {
    const result = await api("/api/admin/success-stories/sync", {
      method: "POST"
    });

    msg.className = "admin-message success";
    msg.textContent = result.message || "Selected candidates sync ho gaye.";

    await loadStories();

  } catch (err) {
    msg.className = "admin-message error";
    msg.textContent = err.message;

  } finally {
    syncStoriesBtn.disabled = false;
    syncStoriesBtn.textContent = "Sync Selected Candidates";
  }
});

$("#refreshStoriesBtn")?.addEventListener("click", loadStories);

if (token) {
  showDashboard();
}