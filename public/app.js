const API = "";
const WA = "918576850306";
let allJobs = [];

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


async function loadSuccessStories() {
  const list = document.querySelector("#successStories");
  const count = document.querySelector("#storyCount");
  const empty = document.querySelector("#noStories");
  if (!list) return;
  try {
    const response = await fetch("/api/success-stories");
    if (!response.ok) throw new Error("Stories unavailable");
    const stories = await response.json();
    count.textContent = `${stories.length} selected`;
    list.innerHTML = stories.length ? stories.map(story => `
      <article class="success-card">
        <div class="success-avatar" aria-hidden="true">${escapeHtml((story.candidate_name || "C").trim().charAt(0).toUpperCase())}</div>
        <div class="success-card-body">
          <span class="success-badge">✓ Selected</span>
          <h3>${escapeHtml(story.candidate_name || "Candidate")}</h3>
          <p class="success-job">${escapeHtml(story.job_title || "Gulf Job")}</p>
          <p class="success-country">${escapeHtml(story.country || "Gulf")}</p>
        </div>
      </article>`).join("") : "";
    empty?.classList.toggle("hidden", stories.length > 0);
    if (!stories.length) list.innerHTML = "";
  } catch (_) {
    count.textContent = "Updates";
    list.innerHTML = "";
    if (empty) {
      empty.textContent = "Candidate updates abhi load nahi ho paayi.";
      empty.classList.remove("hidden");
    }
  }
}
loadSuccessStories();
