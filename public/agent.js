```javascript
const KEY = "gji_agent_token";
let token = sessionStorage.getItem(KEY) || "";
let refreshTimer = null;

const $ = s => document.querySelector(s);

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...opts,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request fail hui.");
  }

  return data;
}

/* =========================
   PORTAL LOGIN / DASHBOARD
========================= */

function showPortal(agent) {
  $("#authArea").classList.add("agent-hidden");
  $("#portal").classList.remove("agent-hidden");

  $("#agentName").textContent =
    `Welcome, ${agent?.full_name || "Agent"}`;

  loadJobs();
  loadApps();

  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  // Har 30 second mein applications aur selected list refresh hogi.
  refreshTimer = setInterval(() => {
    if (
      token &&
      !$("#portal").classList.contains("agent-hidden")
    ) {
      loadApps(true);
    }
  }, 30000);
}

function logout() {
  token = "";
  sessionStorage.removeItem(KEY);

  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  refreshTimer = null;

  $("#portal").classList.add("agent-hidden");
  $("#authArea").classList.remove("agent-hidden");
}

/* =========================
   AGENT LOGIN
========================= */

$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const msg = $("#loginMsg");
  msg.className = "agent-msg";
  msg.textContent = "Login ho raha hai…";

  try {
    const form = new FormData(event.currentTarget);
    const identifier = String(
      form.get("identifier") || form.get("email") || ""
    ).trim();

    const data = await api("/api/agent/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        identifier: identifier,
        email: identifier,
        phone: identifier,
        password: form.get("password")
      })
    });

    token = data.token;
    sessionStorage.setItem(KEY, token);

    msg.textContent = "";
    showPortal(data.agent);

  } catch (error) {
    msg.className = "agent-msg error";
    msg.textContent = error.message;
  }
});

/* =========================
   AGENT REGISTRATION
========================= */

$("#registerForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const msg = $("#registerMsg");

  msg.className = "agent-msg";
  msg.textContent = "Register ho raha hai…";

  try {
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    if (!String(payload.email || "").trim()) {
      delete payload.email;
    }

    const data = await api("/api/agent/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    msg.className = "agent-msg success";
    msg.textContent =
      data.message ||
      "Registration submit ho gaya. Admin approval ka intezar karein.";

    form.reset();

  } catch (error) {
    msg.className = "agent-msg error";
    msg.textContent = error.message;
  }
});

/* =========================
   LOAD PUBLISHED JOBS
========================= */

async function loadJobs() {
  const select = $("#jobSelect");

  try {
    const result = await api("/api/jobs");
    const jobs = Array.isArray(result)
      ? result
      : Array.isArray(result.jobs)
        ? result.jobs
        : [];

    select.innerHTML =
      '<option value="">Select published job</option>' +
      jobs.map(job => `
        <option value="${esc(job.id)}">
          ${esc(job.title)} — ${esc(job.country)}
        </option>
      `).join("");

  } catch (error) {
    select.innerHTML =
      '<option value="">Jobs load nahi hue</option>';
  }
}

/* =========================
   APPLICATION TABLE ROW
========================= */

function appRow(application) {
  const status = String(
    application.status || "new"
  ).trim().toLowerCase();

  const date = application.created_at
    ? new Date(application.created_at).toLocaleDateString("en-IN")
    : "—";

  return `
    <tr>
      <td>
        <strong>${esc(application.candidate_name)}</strong>
        <br>
        ${esc(application.jobs?.title || "Job")}
      </td>

      <td>${esc(date)}</td>

      <td>
        <span class="agent-status ${esc(status)}">
          ${esc(status)}
        </span>
      </td>
    </tr>
  `;
}

/* =========================
   LOAD ALL + SELECTED LIST
========================= */

async function loadApps(silent = false) {
  const allBody = $("#myApps");
  const selectedBody = $("#selectedApps");
  const selectedCount = $("#selectedCount");
  const message = $("#appsMsg");

  if (!allBody || !selectedBody) {
    console.error(
      "Agent applications table IDs missing. Check agent.html."
    );
    return;
  }

  if (!silent) {
    allBody.innerHTML =
      '<tr><td colspan="3">Loading applications…</td></tr>';

    selectedBody.innerHTML =
      '<tr><td colspan="3">Loading selected candidates…</td></tr>';
  }

  try {
    const result = await api("/api/agent/applications");

    const applications = Array.isArray(result)
      ? result
      : Array.isArray(result.applications)
        ? result.applications
        : [];

    // Sabhi submitted candidates
    allBody.innerHTML = applications.length
      ? applications.map(appRow).join("")
      : '<tr><td colspan="3">Abhi koi application nahi.</td></tr>';

    // Sirf selected status wale candidates
    const selected = applications.filter(application =>
      String(application.status || "")
        .trim()
        .toLowerCase() === "selected"
    );

    if (selectedCount) {
      selectedCount.textContent = String(selected.length);
    }

    selectedBody.innerHTML = selected.length
      ? selected.map(appRow).join("")
      : '<tr><td colspan="3">Abhi koi selected candidate nahi hai.</td></tr>';

    if (message) {
      message.className = "agent-msg";
      message.textContent =
        `Last updated: ${new Date().toLocaleTimeString("en-IN")}`;
    }

  } catch (error) {
    if (!silent) {
      allBody.innerHTML =
        `<tr><td colspan="3">${esc(error.message)}</td></tr>`;

      selectedBody.innerHTML =
        `<tr><td colspan="3">${esc(error.message)}</td></tr>`;

      if (selectedCount) {
        selectedCount.textContent = "0";
      }
    }

    if (message) {
      message.className = "agent-msg error";
      message.textContent = error.message;
    }

    console.error("Applications load error:", error);
  }
}

/* =========================
   SUBMIT CANDIDATE
========================= */

$("#applicationForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const message = $("#applicationMsg");
  const button = $("#submitBtn");
  const file = form.elements.document.files[0];

  message.className = "agent-msg";

  if (
    !file ||
    file.size > 10 * 1024 * 1024 ||
    (
      !file.type.includes("pdf") &&
      !file.name.toLowerCase().endsWith(".pdf")
    )
  ) {
    message.className = "agent-msg error";
    message.textContent =
      "Valid PDF select karein (maximum 10 MB).";
    return;
  }

  button.disabled = true;
  button.textContent = "Submitting…";

  try {
    const data = await api("/api/agent/applications", {
      method: "POST",
      body: new FormData(form)
    });

    message.className = "agent-msg success";
    message.textContent =
      data.message || "Application submit ho gayi.";

    form.reset();

    await loadApps();

  } catch (error) {
    message.className = "agent-msg error";
    message.textContent = error.message;

  } finally {
    button.disabled = false;
    button.textContent = "Submit Application";
  }
});

/* =========================
   REFRESH / LOGOUT
========================= */

$("#refreshApps").addEventListener("click", () => {
  loadApps();
});

$("#logout").addEventListener("click", logout);

/* =========================
   RESTORE EXISTING SESSION
========================= */

if (token) {
  showPortal({
    full_name: "Agent"
  });
}
```
