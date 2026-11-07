const API = "https://gulfjobsindia.gulfjob.workers.dev";
const WA = "918576850306";
const INITIAL_STORIES = 8;

let allJobs = [];
let allStories = [];
let showAllStories = false;

const $ = selector => document.querySelector(selector);

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

function waLink(job) {
  const message = job
    ? `Hello, I am interested in the ${job.title} job in ${job.country}. Please share verified details.`
    : "Hello, I would like information about Gulf job opportunities.";

  return `https://wa.me/${WA}?text=${encodeURIComponent(message)}`;
}

/* JOB CARDS */

function jobCard(job) {
  const description = String(job.description || "");
  const shortDescription = description.length > 180
    ? description.slice(0, 180) + "…"
    : description;

  const salary = job.salary
    ? `<span>💰 ${escapeHtml(job.salary)}</span>` : "";

  const city = job.city
    ? `<span>📍 ${escapeHtml(job.city)}</span>` : "";

  const experience = job.experience
    ? `<span>🧰 ${escapeHtml(job.experience)}</span>` : "";

  const lastDate = job.last_date
    ? `<span>📅 Last date: ${escapeHtml(job.last_date)}</span>` : "";

  const qualification = job.qualification
    ? `<p class="job-description"><strong>Qualification:</strong> ${escapeHtml(job.qualification)}</p>`
    : "";

  return `
    <article class="job-card" data-job-id="${escapeHtml(job.id)}">
      <div class="job-card-top">
        <div>
          <h3>${escapeHtml(job.title || "Gulf Job")}</h3>
          <div class="job-company">
            ${escapeHtml(job.company_name || "Employer details available on request")}
          </div>
        </div>
        <span class="job-country">${escapeHtml(job.country || "Gulf")}</span>
      </div>

      <div class="job-meta">
        ${salary}${city}${experience}${lastDate}
      </div>

      ${(new URLSearchParams(window.location.search).get("job") === String(job.id)
  ? description
  : shortDescription)
  ? `<p class="job-description">${escapeHtml(
      new URLSearchParams(window.location.search).get("job") === String(job.id)
        ? description
        : shortDescription
    )}</p>`
  : ""}

      ${qualification}

      <div class="job-actions">
  <button class="btn btn-green apply-job" type="button"
    data-id="${escapeHtml(job.id)}">Apply Now</button>

  <a class="btn btn-whatsapp" href="${waLink(job)}"
    target="_blank" rel="noopener">WhatsApp</a>

  <button class="btn btn-share" type="button"
    data-share-job="${escapeHtml(job.id)}">
    ↗ Share
  </button>
</div>
    </article>
  `;
}

/* JOB SEARCH AND FILTER */

function renderJobs() {
  const jobList = $("#jobList");
  const noJobs = $("#noJobs");
  const jobCount = $("#jobCount");
  const applySelect = $("#applyJob");

  if (!jobList || !noJobs || !jobCount || !applySelect) return;

  const query = ($("#searchInput")?.value || "").toLowerCase().trim();
  const country = $("#countryFilter")?.value || "";

  const filtered = allJobs.filter(job => {
    const countryMatches = !country || job.country === country;

    const text = [
      job.title,
      job.company_name,
      job.city,
      job.country,
      job.description,
      job.qualification
    ].map(value => String(value || "").toLowerCase()).join(" ");

    return countryMatches && (!query || text.includes(query));
  });

  jobList.innerHTML = filtered.length
    ? filtered.map(jobCard).join("")
    : "";

  noJobs.classList.toggle("hidden", filtered.length > 0);

  jobCount.textContent =
    `${filtered.length} ${filtered.length === 1 ? "job" : "jobs"}`;

  const previousSelection = applySelect.value;

  applySelect.innerHTML =
    `<option value="">Select a published job</option>` +
    allJobs.map(job => `
      <option value="${escapeHtml(job.id)}">
        ${escapeHtml(job.title || "Gulf Job")} — ${escapeHtml(job.country || "Gulf")}
      </option>
    `).join("");

  if (allJobs.some(job => String(job.id) === previousSelection)) {
    applySelect.value = previousSelection;
  }
}
function openSharedJobFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get("job");

  if (!jobId) return;

  const card = Array.from(
    document.querySelectorAll(".job-card")
  ).find(item => item.dataset.jobId === jobId);

  if (card) {
    setTimeout(() => {
      card.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 300);
  }
}
async function loadJobs() {
  const jobList = $("#jobList");
  const jobCount = $("#jobCount");

  try {
    const response = await fetch(`${API}/api/jobs`);

    if (!response.ok) throw new Error("Could not load jobs");

    const jobs = await response.json();

    if (!Array.isArray(jobs)) throw new Error("Invalid jobs response");

    allJobs = jobs;
renderJobs();
openSharedJobFromUrl();
  } catch (error) {
    console.error("Jobs loading error:", error);

    if (jobList) {
      jobList.innerHTML = `
        <div class="empty-state">
          Jobs abhi load nahi ho rahe. Deployment aur API settings check karein.
        </div>`;
    }

    if (jobCount) jobCount.textContent = "Jobs unavailable";
  }
}

/* SELECTED CANDIDATE CARDS */

function storyCard(story, index) {
  const name = String(story.candidate_name || "Candidate").trim();
  const initial = name.charAt(0).toUpperCase() || "C";

  const palettes = [
    "story-green",
    "story-gold",
    "story-blue",
    "story-purple",
    "story-orange"
  ];

  const palette = palettes[index % palettes.length];

  return `
    <article class="success-card ${palette}">
      <div class="success-card-top">
        <span class="success-confetti" aria-hidden="true">✦</span>
        <span class="success-badge">✓ SELECTED</span>
      </div>

      <div class="success-avatar" aria-hidden="true">
        ${escapeHtml(initial)}
      </div>

      <div class="success-card-body">
        <h3>${escapeHtml(name)}</h3>
        <p class="success-job">${escapeHtml(story.job_title || "Gulf Job")}</p>
        <p class="success-country">🌍 ${escapeHtml(story.country || "Gulf")}</p>
      </div>

      <div class="success-congrats">🎉 Congratulations!</div>
    </article>
  `;
}

function renderSuccessStories() {
  const list = $("#successStories");
  const count = $("#storyCount");
  const empty = $("#noStories");
  const button = $("#showMoreStories");

  if (!list) return;

  const total = allStories.length;
  const visible = showAllStories
    ? allStories
    : allStories.slice(0, INITIAL_STORIES);

  if (count) count.textContent = `${total} selected`;

  list.innerHTML = visible
    .map((story, index) => storyCard(story, index))
    .join("");

  if (empty) {
    empty.classList.toggle("hidden", total > 0);
  }

  if (button) {
    const hasMore = total > INITIAL_STORIES;

    button.classList.toggle("hidden", !hasMore);
    button.setAttribute("aria-expanded", String(showAllStories));

    button.textContent = showAllStories
      ? "Show Less ↑"
      : "Show More Candidates ↓";
  }
}

async function loadSuccessStories() {
  const list = $("#successStories");
  const count = $("#storyCount");
  const empty = $("#noStories");

  if (!list) return;

  try {
    const response = await fetch(`${API}/api/success-stories`);

    if (!response.ok) throw new Error("Stories unavailable");

    const stories = await response.json();

    if (!Array.isArray(stories)) throw new Error("Invalid candidate response");

    allStories = stories;
    showAllStories = false;

    renderSuccessStories();
  } catch (error) {
    console.error("Candidate updates loading error:", error);

    if (count) count.textContent = "Updates";

    list.innerHTML = "";

    if (empty) {
      empty.textContent = "Candidate updates abhi load nahi ho paayi.";
      empty.classList.remove("hidden");
    }

    $("#showMoreStories")?.classList.add("hidden");
  }
}

/* SHOW MORE / SHOW LESS */

$("#showMoreStories")?.addEventListener("click", () => {
  showAllStories = !showAllStories;
  renderSuccessStories();
});

/* APPLY BUTTON AND COUNTRY CARDS */

document.addEventListener("click", event => {
    const shareButton = event.target.closest("[data-share-job]");

  if (shareButton) {
    const jobId = shareButton.dataset.shareJob;

    const job = allJobs.find(
      item => String(item.id) === String(jobId)
    );

    if (!job) return;

    const shareUrl = new URL(window.location.href);
    shareUrl.search = "";
    shareUrl.searchParams.set("job", String(job.id));
    shareUrl.hash = "jobs";

    const message =
      `${job.title || "Gulf Job"}\n` +
      `Country: ${job.country || "Gulf"}\n` +
      `Company: ${job.company_name || ""}\n` +
      `Job Details: ${shareUrl.toString()}`;

    if (navigator.share) {
      navigator.share({
        title: job.title || "Gulf Job",
        text: message,
        url: shareUrl.toString()
      }).catch(error => {
        if (error.name !== "AbortError") {
          window.open(
            "https://wa.me/?text=" + encodeURIComponent(message),
            "_blank"
          );
        }
      });
    } else {
      window.open(
        "https://wa.me/?text=" + encodeURIComponent(message),
        "_blank"
      );
    }

    return;
  }
  const applyButton = event.target.closest(".apply-job");

  if (applyButton) {
    const select = $("#applyJob");

    if (select) select.value = applyButton.dataset.id || "";

    $("#apply")?.scrollIntoView({ behavior: "smooth" });
  }

  const countryButton = event.target.closest("[data-country]");

  if (countryButton) {
    const filter = $("#countryFilter");

    if (filter) filter.value = countryButton.dataset.country || "";

    $("#jobs")?.scrollIntoView({ behavior: "smooth" });
    renderJobs();
  }
});

/* MOBILE MENU */

const menuToggle = $("#menuToggle");
const mainNav = $("#mainNav");

menuToggle?.addEventListener("click", () => {
  if (!mainNav) return;

  const isOpen = mainNav.classList.toggle("open");

  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
});

mainNav?.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => {
    mainNav.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");
    menuToggle?.setAttribute("aria-label", "Open menu");
  });
});

/* SEARCH EVENTS */

$("#searchBtn")?.addEventListener("click", renderJobs);
$("#searchInput")?.addEventListener("input", renderJobs);
$("#countryFilter")?.addEventListener("change", renderJobs);

/* FOOTER YEAR */

if ($("#year")) {
  $("#year").textContent = new Date().getFullYear();
}

/* APPLICATION FORM */

$("#applicationForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const message = $("#formMessage");
  const button = $("#submitApplication");

  if (!message || !button) return;

  message.className = "form-message";
  message.textContent = "";

  const file = form.elements.namedItem("document")?.files?.[0];

  if (!file) {
    message.classList.add("error");
    message.textContent = "Apni PDF file select karein.";
    return;
  }

  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf || file.size > 10 * 1024 * 1024) {
    message.classList.add("error");
    message.textContent = "Ek valid PDF select karein (maximum 10 MB).";
    return;
  }

  button.disabled = true;
  button.textContent = "Submitting…";

  try {
    const response = await fetch(`${API}/api/applications`, {
      method: "POST",
      body: new FormData(form)
    });

    let data = {};

    try {
      data = await response.json();
    } catch (_) {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || "Application submit nahi hui.");
    }

    form.reset();

    message.classList.add("success");
    message.textContent =
      data.message || "Application successfully submit ho gayi.";

  } catch (error) {
    console.error("Application submission error:", error);

    message.classList.add("error");
    message.textContent =
      error.message || "Network error. Dobara try karein.";

  } finally {
    button.disabled = false;
    button.textContent = "Submit Application";
  }
});


/* CANDIDATE APPLICATION STATUS TRACKER */
(function initApplicationTracker() {
  const form = document.getElementById("applicationTrackerForm");
  if (!form) return;
  const phoneInput = document.getElementById("trackerPhone");
  const button = document.getElementById("checkApplicationStatus");
  const message = document.getElementById("trackerMessage");
  const results = document.getElementById("trackerResults");
  const safe = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const statusLabel = status => ({new:"New", reviewing:"Received", selected:"Selected", rejected:"Rejected"}[String(status || "").toLowerCase()] || "Received");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    message.textContent = ""; message.className = "form-message"; results.innerHTML = "";
    const phone = phoneInput.value.trim();
    if (phone.replace(/\D/g, "").length < 10) {
      message.classList.add("error"); message.textContent = "Valid registered mobile number enter karein."; return;
    }
    button.disabled = true; button.textContent = "Checking…";
    try {
      const response = await fetch(`${API}/api/application-status?phone=${encodeURIComponent(phone)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Status check nahi ho saka.");
      if (!Array.isArray(data.applications) || !data.applications.length) {
        message.classList.add("error"); message.textContent = "Is mobile number se koi application nahi mili. Wahi number check karein jo form mein diya tha."; return;
      }
      message.classList.add("success"); message.textContent = `${data.applications.length} application(s) mili.`;
      results.innerHTML = data.applications.map(item => `<article class="tracker-result"><strong>Candidate Name: ${safe(item.candidate_name || "Candidate")}</strong><strong>Job Title: ${safe(item.job_title || "General Application")}</strong><span>Application Date: ${safe(item.application_date || "—")}</span><span class="tracker-status status-${safe(item.status)}">${safe(statusLabel(item.status))}</span></article>`).join("");
    } catch (error) {
      message.classList.add("error"); message.textContent = error.message || "Network error. Dobara try karein.";
    } finally { button.disabled = false; button.textContent = "Check Status"; }
  });
})();

/* INITIAL LOAD */

loadJobs();
loadSuccessStories();
/* Show maximum 8 jobs initially; show remaining on button click */
(function () {
const jobList = document.getElementById("jobList");
const moreBtn = document.getElementById("moreJobsBtn");

if (!jobList || !moreBtn) return;

let expanded = false;

function updateJobsView() {
const cards = Array.from(jobList.children).filter(
el => el.classList.contains("job-card")
);

cards.forEach((card, index) => {
  card.style.display = (!expanded && index >= 8) ? "none" : "";
});

moreBtn.style.display = cards.length > 8 ? "block" : "none";
moreBtn.textContent = expanded ? "Show Less ↑" : "More Jobs ↓";

}

moreBtn.addEventListener("click", function () {
expanded = !expanded;
updateJobsView();

if (!expanded) {
  document.getElementById("jobs").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

});

new MutationObserver(updateJobsView).observe(jobList, {
childList: true
});

updateJobsView();
})();

