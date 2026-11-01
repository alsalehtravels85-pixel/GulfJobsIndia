GulfJobsIndia — Islamic Design + Candidate Updates

GitHub project layout expected by wrangler.toml:
- wrangler.toml at repository root
- src/index.js (Cloudflare Worker backend)
- public/ (homepage, CSS, app.js, admin and agent pages)

What is included:
- Islamic green/gold animated homepage design merged with Selected Candidates section.
- Existing app.js, admin.js, agent pages, backend routes and deployment config retained from CandidateUpdates project.
- Candidate status Selected creates/updates a public success story; Draft remains controllable from Admin Success Stories.
- Public stories only include candidate name, job title and country; no phone, email, message or PDF.

Deploy carefully:
1. Backup your GitHub repository first.
2. Upload/replace files while preserving these folders: src/ and public/. Keep wrangler.toml at root.
3. Preserve Cloudflare Worker secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD, SESSION_SECRET (and any optional email secrets).
4. Run SUCCESS-STORIES-MIGRATION.sql in Supabase only if the success_stories table is not already set up. Do not reset database.
5. Deploy and test /api/health, jobs list, Admin login, Jobs Publish/Draft, candidate status, and public stories.

Important: live Cloudflare/Supabase deployment has not been tested from this package.
