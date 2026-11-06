import { writeFile } from 'node:fs/promises';

// Public website is Cloudflare Pages. API remains on the existing Cloudflare Worker.
const SITE_URL = (process.env.SITE_URL || 'https://gulfjobsindia.pages.dev').replace(/\/$/, '');
const API_URL = (process.env.API_URL || 'https://gulfjobsindia.gulfjob.workers.dev').replace(/\/$/, '');

const response = await fetch(`${API_URL}/api/jobs`, { headers: { Accept: 'application/json' } });
if (!response.ok) throw new Error(`Published jobs API failed: HTTP ${response.status}`);
const jobs = await response.json();
if (!Array.isArray(jobs)) throw new Error('Published jobs API did not return an array');

const xmlEscape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const staticPaths = ['/', '/about.html', '/contact.html', '/privacy.html', '/terms.html', '/disclaimer.html'];
const entries = staticPaths.map(path => ({ loc: `${SITE_URL}${path}` }));

for (const job of jobs) {
  if (!job?.id) continue;
  const loc = `${SITE_URL}/?job=${encodeURIComponent(job.id)}`;
  const lastmodValue = job.updated_at || job.created_at;
  const lastmod = lastmodValue && !Number.isNaN(Date.parse(lastmodValue))
    ? new Date(lastmodValue).toISOString() : undefined;
  entries.push({ loc, lastmod });
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  entries.map(({ loc, lastmod }) => `  <url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('\n') +
  `\n</urlset>\n`;

await writeFile('public/sitemap.xml', xml, 'utf8');
console.log(`Sitemap generated for ${jobs.length} published jobs and ${staticPaths.length} static pages (${entries.length} URLs).`);
