(() => {
"use strict";

const KEY = "gji_agent_token";
let token = sessionStorage.getItem(KEY) || "";

const $ = selector => document.querySelector(selector);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    logout();
    throw new Error(data.error || "Session expire ho gaya. Dobara login karein.");
  }

  if (!response.ok) {
    throw new Error(data.error || "Request fail hui.");
  }

  return data;
}

function showMessage(element, message, type = "") {
  element.className = "agent-msg" + (type ? " " + type : "");
  element.textContent = message;
}

function showPortal(agent = {}) {
  $("#authArea").classList.add("agent-hidden");
  $("#portal").classList.remove("agent-hidden");

  $("#agentName").textContent =
    "Welcome, " + (agent.full_name || "Agent");

  $("#agentProfile").textContent =
    [agent.email, agent.phone].filter(Boolean).join(" • ");

  // Buttons ko visible rakhein.
  $("#logout").style.display = "inline-flex";
  $("#refreshApps").style.display = "inline-flex";

  refreshAll();
}

function logout() {
  token = "";
  sessionStorage.removeItem(KEY);

  $("#portal").classList.add("agent-hidden");
  $("#authArea").classList.remove("agent-hidden");

  const message = $("#loginMsg");

  if (message) {
    showMessage(message, "Aap logout ho gaye hain.");
  }
}

/* AGENT LOGIN */
$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const button = $("#loginBtn");
  const message = $("#loginMsg");

  button.disabled = true;
  button.textContent = "Please wait...";
  showMessage(message, "Login ho raha hai...");

  try {
    const formData = new FormData(form);

    const data = await api("/api/agent/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        login_id: String(formData.get("login_id") || "").trim(),
        password: formData.get("password")
      })
    });

    if (!data.token) {
      throw new Error("Login token nahi mila. Dobara try karein.");
    }

    token = data.token;
    sessionStorage.setItem(KEY, token);

    form.reset();
    showPortal(data.agent || {});

  } catch (error) {
    showMessage(
      message,
      error.message || "Login nahi hua. Details check karein.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Login";
  }
});

/* AGENT REGISTRATION */
$("#registerForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const message = $("#registerMsg");

  button.disabled = true;
  showMessage(message, "Registration submit ho rahi hai...");

  try {
    const formData = new FormData(form);

    const data = await api("/api/agent/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(
        Object.fromEntries(formData.entries())
      )
    });

    showMessage(
      message,
      data.message || "Registration submit ho gayi. Admin approval ka wait karein.",
      "success"
    );

    form.reset();

  } catch (error) {
    showMessage(
      message,
      error.message || "Registration fail hui.",
      "error"
    );
  } finally {
    button.disabled = false;
  }
});

/* LOAD AVAILABLE JOBS */
async function loadJobs() {
  const select = $("#jobSelect");

  try {
    const data = await api("/api/jobs");

    // API array ya {jobs: [...]} format dono handle karein.
    const jobs = Array.isArray(data) ? data : (data.jobs || []);

    select.innerHTML =
      '<option value="">Select published job</option>' +
      jobs.map(job => {
        const title = job.title || job.job_title || "Job";
        const country = job.country ? " — " + job.country : "";

        return `<option value="${escapeHTML(job.id)}">${escapeHTML(title + country)}</option>`;
      }).join("");

    if (!jobs.length) {
      select.innerHTML =
        '<option value="">Abhi published jobs nahi hain</option>';
    }

  } catch (error) {
    select.innerHTML =
      '<option value="">Jobs load nahi hue</option>';

    showMessage(
      $("#applicationMsg"),
      error.message || "Jobs load nahi hue.",
      "error"
    );
  }
}

/* LOAD AGENT APPLICATIONS */
async function loadApps() {
  const tbody = $("#myApps");
  const refreshButton = $("#refreshApps");

  tbody.innerHTML =
    '<tr><td colspan="3">Applications load ho rahi hain...</td></tr>';

  refreshButton.disabled = true;

  try {
    const data = await api("/api/agent/applications");

    const apps = Array.isArray(data)
      ? data
      : (data.applications || data.data || []);

    if (!apps.length) {
      tbody.innerHTML =
        '<tr><td colspan="3">Abhi koi application nahi hai.</td></tr>';
      return;
    }

    tbody.innerHTML = apps.map(app => {
      const candidate =
        app.candidate_name || app.full_name || app.name || "Candidate";

      const jobTitle =
        app.jobs?.title ||
        app.job?.title ||
        app.job_title ||
        "Job";

      const date = app.created_at
        ? new Date(app.created_at).toLocaleDateString("en-IN")
        : "—";

      const status = app.status || "pending";

      return `
        <tr>
          <td>
            <strong>${escapeHTML(candidate)}</strong><br>
            ${escapeHTML(jobTitle)}
          </td>
          <td>${escapeHTML(date)}</td>
          <td>${escapeHTML(status)}</td>
        </tr>
      `;
    }).join("");

  } catch (error) {
    tbody.innerHTML =
      `<tr><td colspan="3">${escapeHTML(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

/* REFRESH BOTH JOBS AND APPLICATIONS */
async function refreshAll() {
  await Promise.allSettled([
    loadJobs(),
    loadApps()
  ]);
}

$("#refreshApps").addEventListener("click", refreshAll);
$("#logout").addEventListener("click", logout);

/* SUBMIT CANDIDATE APPLICATION */
$("#applicationForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const button = $("#submitBtn");
  const message = $("#applicationMsg");
  const file = form.elements.document.files[0];

  if (!file) {
    showMessage(message, "Candidate ka PDF document select karein.", "error");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showMessage(message, "PDF file 10 MB se chhoti honi chahiye.", "error");
    return;
  }

  if (
    !file.type.includes("pdf") &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    showMessage(message, "Sirf PDF document upload karein.", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "Submitting...";

  try {
    const formData = new FormData(form);

    const data = await api("/api/agent/applications", {
      method: "POST",
      body: formData
    });

    showMessage(
      message,
      data.message || "Candidate application submit ho gayi.",
      "success"
    );

    form.reset();
    await refreshAll();

  } catch (error) {
    showMessage(
      message,
      error.message || "Application submit nahi hui.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Submit Application";
  }
});

/* RESTORE SESSION */
if (token) {
  showPortal({ full_name: "Agent" });
}

})();
