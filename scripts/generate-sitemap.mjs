#!/usr/bin/env node
/**
 * generate-sitemap.mjs
 *
 * Regenerates frontend/public/sitemap.xml with current active job listings.
 *
 * USAGE
 *   node scripts/generate-sitemap.mjs
 *   API_URL=https://api.advance.al node scripts/generate-sitemap.mjs
 *
 * Run periodically (e.g. weekly, or before a deploy) to keep the sitemap fresh.
 * NOT part of the build pipeline — keeps the build hermetic and avoids hitting
 * the API at deploy time.
 *
 * What it does:
 *  - Fetches active jobs from /api/jobs (paginated)
 *  - Rewrites the dynamic section of frontend/public/sitemap.xml with one
 *    <url> entry per job (https://advance.al/jobs/{slug})
 *  - Preserves the static URLs (homepage, /about, /jobs, etc.) at the top
 *
 * After running, commit the regenerated sitemap.xml or just deploy — Vercel
 * picks up the static file.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITEMAP_PATH = join(__dirname, '..', 'frontend', 'public', 'sitemap.xml');
const SITE_URL = process.env.SITE_URL || 'https://advance.al';
const API_URL = process.env.API_URL || `${SITE_URL}/api`;
const PAGE_SIZE = 100;
const HARD_CAP = 5000; // safety: don't write more than this many <url> entries

const today = new Date().toISOString().slice(0, 10);

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[c]);
}

async function fetchAllActiveJobs() {
  const all = [];
  let page = 1;

  while (all.length < HARD_CAP) {
    const url = `${API_URL}/jobs?page=${page}&limit=${PAGE_SIZE}`;
    process.stdout.write(`  fetching ${url} ... `);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`API ${url} returned ${res.status} ${res.statusText}`);
    }
    const body = await res.json();
    const jobs = body.jobs || body.data || body.results || [];
    console.log(`got ${jobs.length}`);
    if (jobs.length === 0) break;
    all.push(...jobs);
    if (jobs.length < PAGE_SIZE) break;
    page += 1;
  }

  return all;
}

function buildJobUrlEntries(jobs) {
  return jobs
    .map((j) => ({
      slug: j.slug || j._id || j.id,
      lastmod:
        (j.updatedAt && j.updatedAt.slice(0, 10)) ||
        (j.postedAt && j.postedAt.slice(0, 10)) ||
        (j.createdAt && j.createdAt.slice(0, 10)) ||
        today,
    }))
    .filter((j) => j.slug)
    .map(
      (j) => `  <url>
    <loc>${SITE_URL}/jobs/${escapeXml(j.slug)}</loc>
    <lastmod>${escapeXml(j.lastmod)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
    )
    .join('\n');
}

async function main() {
  console.log(`generate-sitemap.mjs`);
  console.log(`  API:  ${API_URL}`);
  console.log(`  SITE: ${SITE_URL}`);
  console.log(`  OUT:  ${SITEMAP_PATH}`);
  console.log('');

  const jobs = await fetchAllActiveJobs();
  console.log(`\nfetched ${jobs.length} jobs total`);

  const dynamicEntries = buildJobUrlEntries(jobs);

  const existing = await readFile(SITEMAP_PATH, 'utf8');

  // Replace everything between the marker comment and </urlset>
  const marker = '<!--';
  const markerIdx = existing.indexOf(marker);
  const closeIdx = existing.lastIndexOf('</urlset>');

  if (markerIdx === -1 || closeIdx === -1) {
    throw new Error(
      `Could not find marker comment or </urlset> in ${SITEMAP_PATH}. ` +
        `The static section may have been edited — restore the original ` +
        `template before re-running.`,
    );
  }

  const before = existing.slice(0, markerIdx).trimEnd();
  const after = `\n\n${dynamicEntries}\n\n</urlset>\n`;

  const next = `${before}\n\n${after}`;

  await writeFile(SITEMAP_PATH, next);
  console.log(`\nwrote ${jobs.length} job URLs to sitemap.xml`);
  console.log(`don't forget to redeploy (or commit if you track the file in git)`);
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
