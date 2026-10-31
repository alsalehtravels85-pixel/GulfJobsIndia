# GulfJobsIndia — Setup Guide (Hinglish)

Is project mein public job website, admin panel, Cloudflare Worker API, Supabase database aur private PDF uploads hain.

## Included files
- `public/index.html` — main website
- `public/style.css` — Green + Gold responsive design
- `public/app.js` — job search and candidate application form
- `public/admin.html`, `public/admin.js` — admin login, job management, applications, agent approval
- `public/agent.html`, `public/agent.js` — agent registration/login and candidate application submission
- `public/about.html`, `public/contact.html`, `public/privacy.html`, `public/terms.html`, `public/disclaimer.html` — starter information/policy pages
- `src/index.js` — backend API
- `wrangler.toml` — Cloudflare Worker/static assets config
- `schema.sql` — database reference

## Before deployment
1. Cloudflare account create/login karein.
2. Node.js LTS install karein, then terminal/command prompt mein project folder kholein.
3. `npm install -g wrangler` run karein and `wrangler login`.
4. Supabase dashboard > Project Settings > API mein Project URL aur service_role key locate karein. Service-role key ko kabhi `public/` folder, GitHub README, ya browser code mein paste NA karein.
5. Terminal se project folder mein secrets set karein:
   - `npx wrangler secret put SUPABASE_URL` → Supabase Project URL paste karein.
   - `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` → service_role key paste karein.
   - `npx wrangler secret put ADMIN_PASSWORD` → strong admin password type/paste karein.
   - `npx wrangler secret put SESSION_SECRET` → long random secret (at least 32 characters) set karein.
6. Optional email alerts (Resend):
   - `npx wrangler secret put RESEND_API_KEY`
   - `npx wrangler secret put NOTIFY_EMAIL`
   - Optional `npx wrangler secret put EMAIL_FROM`
   Email sending needs a Resend account and a verified sender/domain for reliable production use. Without these secrets, applications still save but email notification is off.
7. Check that the Supabase tables `jobs`, `applications` and private bucket `gulf-applications` exist. If not, open Supabase SQL Editor and run `schema.sql`.
8. Deploy: `npx wrangler deploy`. It uploads the `public/` website and the Worker API together.
9. Open the `*.workers.dev` URL shown by Wrangler. Public jobs appear only after adding a published job in `/admin.html`.

## Admin
Open `https://YOUR-WORKER-URL/admin.html`, log in with `ADMIN_PASSWORD`, add a job, and set status to Published.

## Agent portal
- Agent portal: `/agent.html`
- Agents register with email/password and agency details. Registration starts as `pending`; admin must approve them in Admin > Agents.
- Approved agents can submit candidate applications with one PDF up to 10 MB and can only view their own submitted applications. Agents cannot post jobs.
- After adding the agent table/column, open Supabase SQL Editor and run the updated `schema.sql` again.

## Candidate form
Required: full name, mobile number, selected job, and ONE PDF (maximum 10 MB). Email and message are optional. Combine documents into a single PDF.

## Important
- Never put the Supabase service-role key in any file under `public/`.
- Keep the bucket private. Documents are opened through short-lived signed links from the authenticated admin API.
- The admin password is stored as a Cloudflare secret, not in GitHub source files.
- Before public launch, add abuse protection/rate limiting and review privacy/legal requirements for overseas recruitment.
- Email notifications are optional; set the Resend secrets to enable them.
- WhatsApp contact is configured to +91 8576850306 in `wrangler.toml`.
- This is a starter project and must be tested in your own Cloudflare/Supabase environment before accepting real candidate documents.
