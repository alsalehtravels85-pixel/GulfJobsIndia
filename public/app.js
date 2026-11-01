const API = "";
const WA = "918576850306";
let allJobs = [];
let allStories = [];
let storiesExpanded = false;

const escapeHtml = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
function waLink(job) {
  const msg = job ? `Hello, I am interested in the ${job.title} job in ${job.country}. Please share verified details.` : "Hello, I would like information about Gulf job opportunities.";
  return `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
}
function jobCard(j) {
  const desc = (j.description || "").length > 230 ? j.description.slice(0, 230) + "…" : (j.description || "");
  const salary = j.salary ? `<span>💰 ${escapeHtml(j.salary)}</span>` : "";
  const city = j.city ? `<span>📍 ${escapeHtml(j.city)}</span>` : "";
  const exp = j.experience ? `<span>🧰 ${escapeHtml(j.experience)}</span>` : "";
  const date = j.last_date ? `<span>📅 Last date: ${escapeHtml(j.last_date)}</span>` : "";
  return `<article class="job-card">
    <div class="job-card-top"><div><h3>${escapeHtml(j.title)}</h3><div class="job-company">${escapeHtml(j.company_name || "Employer details available on request")}</div></div><span class="job-country">${escapeHtml(j.country)}</span></div>
    <div class="job-meta">${salary}${city}${exp}${date}</div><p class="job-description">${escapeHtml(desc)}</p>
    ${j.qualification ? `<p class="job-description"><strong>Qualification:</strong> ${escapeHtml(j.qualification)}</p>` : ""}
    <div class="job-actions"><button class="btn btn-green apply-job" data-id="${escapeHtml(j.id)}">Apply Now</button><a class="btn btn-whatsapp" href="${waLink(j)}" target="_blank" rel="noopener">WhatsApp</a></div>
  </article>`;
}
function renderJobs() {
  const q = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
  const country = document.getElementById("countryFilter")?.value || "";
  const filtered = allJobs.filter(j => (!country || j.country === country) &&
    (!q || [j.title,j.company_name,j.city,j.country,j.description,j.qualification].some(v => String(v || "").toLowerCase().includes(q))));
  const list = document.getElementById("jobList");
  list.innerHTML = filtered.length ? filtered.map(jobCard).join("") : "";
  document.getElementById("noJobs").classList.toggle("hidden", filtered.length > 0);
  document.getElementById("jobCount").textContent = `${filtered.length} ${filtered.length === 1 ? "job" : "jobs"}`;
  const select = document.getElementById("applyJob");
  const selected = select.value;
  select.innerHTML = `<option value="">Select a published job</option>` + allJobs.map(j => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.title)} — ${escapeHtml(j.country)}</option>`).join("");
  if (allJobs.some(j => j.id === selected)) select.value = selected;
}
function storyCard(s, index) {
  const name = String(s.candidate_name || "Selected Candidate").trim();
  const title = String(s.job_title || "Gulf Job").trim();
  const country = String(s.country || "Gulf Region").trim();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "SC";
  return `<article class="success-card" style="--story-delay:${Math.min(index, 8) * 65}ms"><div class="success-card-top"><span class="success-avatar" aria-hidden="true">${escapeHtml(initials)}</span><span class="selected-badge"><span>✓</span> SELECTED</span></div><h3>${escapeHtml(name)}</h3><p class="success-job">${escapeHtml(title)}</p><div class="success-country"><span aria-hidden="true">📍</span> ${escapeHtml(country)}</div><div class="success-card-foot"><span>✦ Career milestone</span><span class="success-spark" aria-hidden="true">✧</span></div></article>`;
}
function renderStories() {
  const grid = document.getElementById("successStories");
  const empty = document.getElementById("noStories");
  const count = document.getElementById("storyCount");
  const more = document.getElementById("viewMoreStories");
  if (!grid || !empty || !count || !more) return;
  count.textContent = `${allStories.length} ${allStories.length === 1 ? "candidate" : "candidates"}`;
  if (!allStories.length) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    more.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  const visible = storiesExpanded ? allStories : allStories.slice(0, 5);
  grid.innerHTML = visible.map(storyCard).join("");
  more.classList.toggle("hidden", allStories.length <= 5);
  more.textContent = storiesExpanded ? "View Less ↑" : `View More Candidates (${allStories.length - 5} more) ↓`;
  more.setAttribute("aria-expanded", String(storiesExpanded));
}
async function loadSuccessStories() {
  const grid = document.getElementById("successStories");
  if (!grid) return;
  try {
    const r = await fetch(`${API}/api/success-stories`);
    if (!r.ok) throw new Error("Could not load candidate updates");
    const data = await r.json();
    allStories = Array.isArray(data) ? data : [];
    renderStories();
  } catch {
    grid.innerHTML = `<div class="empty-state">Candidate updates abhi load nahi ho rahe. Thodi der baad try karein.</div>`;
    document.getElementById("storyCount").textContent = "Updates unavailable";
  }
}

async function loadJobs() {
  const list = document.getElementById("jobList");
  try {
    const r = await fetch(`${API}/api/jobs`);
    if (!r.ok) throw new Error("Could not load jobs");
    allJobs = await r.json();
    renderJobs();
  } catch {
    list.innerHTML = `<div class="empty-state">Jobs abhi load nahi ho rahe. Cloudflare deployment aur Supabase settings check karein.</div>`;
    document.getElementById("jobCount").textContent = "Jobs unavailable";
  }
}
document.addEventListener("click", e => {
  const apply = e.target.closest(".apply-job");
  if (apply) {
    document.getElementById("applyJob").value = apply.dataset.id;
    document.getElementById("apply").scrollIntoView({ behavior: "smooth" });
  }
  const country = e.target.closest("[data-country]");
  if (country) {
    document.getElementById("countryFilter").value = country.dataset.country;
    document.getElementById("jobs").scrollIntoView({ behavior: "smooth" });
    renderJobs();
  }
});
document.getElementById("menuToggle")?.addEventListener("click", () => document.getElementById("mainNav").classList.toggle("open"));
document.querySelectorAll("#mainNav a").forEach(a => a.addEventListener("click", () => document.getElementById("mainNav").classList.remove("open")));
document.getElementById("searchBtn")?.addEventListener("click", renderJobs);
document.getElementById("searchInput")?.addEventListener("input", renderJobs);
document.getElementById("countryFilter")?.addEventListener("change", renderJobs);
document.getElementById("year").textContent = new Date().getFullYear();
document.getElementById("viewMoreStories")?.addEventListener("click", () => { storiesExpanded = !storiesExpanded; renderStories(); });

document.getElementById("applicationForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget, message = document.getElementById("formMessage"), btn = document.getElementById("submitApplication");
  message.className = "form-message"; message.textContent = "";
  const file = form.elements.document.files[0];
  if (!file || file.size > 10 * 1024 * 1024 || (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf"))) {
    message.classList.add("error"); message.textContent = "Ek valid PDF select karein (maximum 10 MB)."; return;
  }
  btn.disabled = true; btn.textContent = "Submitting…";
  try {
    const r = await fetch("/api/applications", { method: "POST", body: new FormData(form) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Application submit nahi hui.");
    form.reset(); message.classList.add("success"); message.textContent = data.message || "Application submit ho gayi.";
  } catch (err) {
    message.classList.add("error"); message.textContent = err.message || "Network error. Dobara try karein.";
  } finally { btn.disabled = false; btn.textContent = "Submit Application"; }
});
loadJobs();
loadSuccessStories();
