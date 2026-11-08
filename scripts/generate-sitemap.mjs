import fs from 'node:fs/promises';
import path from 'node:path';

const SITE_URL = (process.env.SITE_URL || 'https://gulfjobsindia.pages.dev').replace(/\/+$/, '');
const API_URL = (process.env.API_URL || 'https://gulfjobsindia.gulfjob.workers.dev').replace(/\/+$/, '');
const OUTPUT_DIR = path.resolve('public');

const staticPaths = [
  '/',
  '/about.html',
  '/contact.html',
  '/privacy.html',
  '/terms.html',
  '/disclaimer.html'
];

function xmlEscape(value) {
  return String(value).replace(/[<>&"']/g, (ch) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
  })[ch]);
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function main() {
  const response = await fetch(`${API_URL}/api/jobs`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`/api/jobs returned HTTP ${response.status}. Sitemap was NOT overwritten.`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('/api/jobs did not return a JSON array. Sitemap was NOT overwritten.');
  }

  // API already filters published jobs; this second check prevents accidental drafts.
  const jobs = payload.filter(job =>
    job && job.id && String(job.status || '').toLowerCase() === 'published'
  );

  const entries = new Map();
  for (const route of staticPaths) {
    entries.set(`${SITE_URL}${route}`, null);
  }

  for (const job of jobs) {
    const loc = `${SITE_URL}/?job=${encodeURIComponent(String(job.id))}`;
    const lastmod = validDate(job.updated_at) || validDate(job.created_at);
    entries.set(loc, lastmod);
  }

  const urls = [...entries.entries()].map(([loc, lastmod]) => `  <url>\n    <loc>${xmlEscape(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, 'sitemap.xml'), xml, 'utf8');
  await fs.writeFile(path.join(OUTPUT_DIR, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, 'utf8');

  console.log(`Sitemap generated: ${staticPaths.length} static URLs + ${jobs.length} published job URLs = ${entries.size} total URLs.`);
}

main().catch(error => {
  console.error(`Sitemap generation failed: ${error.message}`);
  process.exitCode = 1;
});
