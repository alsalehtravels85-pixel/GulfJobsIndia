GulfJobsIndia — Updated API Fix Pack (31 Oct 2026)

FILES
- index.js: Cloudflare Worker API + static asset fallback. Includes /api/jobs, /api/health and backward-compatible /jobs, /health aliases.
- app.js: website homepage JavaScript; shows actual HTTP/API error instead of hiding every failure.
- agent.js: agent portal JavaScript; shows clear 404/non-JSON/network errors.
- schema.sql: existing Supabase schema reference (unchanged).

IMPORTANT: The observed 404 means the live deployment may not be running this Worker code. Replacing files locally is not enough; publish/deploy the Worker project that uses index.js as its entry point and has the static assets binding named ASSETS. Keep the website files in that same project's assets directory/configuration.

CHECK AFTER DEPLOY
1. Open https://gulfjobsindia.gulfjob.workers.dev/api/health
   Expected JSON: {"ok":true,"service":"GulfJobsIndia API","version":"2026-10-31"}
2. Open https://gulfjobsindia.gulfjob.workers.dev/api/jobs
   Expected JSON array (may be [] if there are no published jobs). It must not show a Cloudflare 404 page.
3. Then refresh homepage and Agent page with Ctrl+F5.

Cloudflare Worker environment variables needed for API:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (secret; never put in HTML/JS or share in chat)
- SESSION_SECRET (secret; use a new random value because the previous value was exposed in chat)
- ADMIN_PASSWORD (secret; needed for admin login)
- ASSETS binding for static site files
Optional email variables: RESEND_API_KEY, NOTIFY_EMAIL, EMAIL_FROM.

Do not paste any secret values into chat. Do not run schema.sql again unless needed; it changes database setup.
