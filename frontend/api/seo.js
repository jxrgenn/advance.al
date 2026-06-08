// Vercel Node serverless function: bot-prerender for SEO/GEO crawlers.
//
// WHY THIS FILE EXISTS
// --------------------
// advance.al is a Vite/React SPA. To a crawler that doesn't execute JavaScript
// (Googlebot first-pass, every Bing crawl, EVERY AI crawler — GPTBot, ClaudeBot,
// PerplexityBot, Google-Extended, etc.) the site is invisible: they fetch
// /index.html and see ~3.5KB of head tags + `<div id="root"></div>`.
//
// This function intercepts ONLY bot User-Agents (via the `has` rewrite in
// vercel.json — humans NEVER reach this function) and returns SPA-shell HTML
// PLUS per-page <title>, <meta>, JSON-LD structured data, AND rendered body
// content fetched from the Render API. AI crawlers ingest the body text;
// Google reads the JSON-LD JobPosting and renders Rich Results / Jobs cards.
//
// SAFETY GUARANTEES
// -----------------
// 1. Bot-only invocation: vercel.json `has.value` regex matches only UAs that
//    contain bot keywords (googlebot, gptbot, claudebot, …). Browser UAs
//    (Mozilla/Chrome/Safari/Firefox/Edge) do NOT contain any of these tokens,
//    so this function is unreachable from a human browser in normal use.
// 2. Hydration-safe shape: the returned HTML contains `<div id="root"></div>`
//    so even if a human accidentally reached this endpoint, the SPA could
//    still mount over the static content (defense in depth).
// 3. Read-only: no DB writes, no auth, no session. Cannot corrupt state.
// 4. API-failure tolerant: every fetch is wrapped in try/catch and times out
//    at 8s; on any error we fall back to a minimal valid shell. Crawler sees
//    the same content it would see today (no regression).
// 5. Content is a strict SUPERSET of human content (same head + extra
//    structured data + same-or-richer body). This is Google's officially
//    sanctioned "Dynamic Rendering" pattern; not cloaking.
// 6. Cached aggressively at the Vercel edge (s-maxage=300, SWR=600) so each
//    URL hits the Render backend at most once per 5 min per region.

import {
  SITE_URL,
  SITE_NAME,
  DEFAULT_DESCRIPTION,
  escapeHtml,
  organizationJsonLd,
  websiteJsonLd,
  jobPostingJsonLd,
  itemListJsonLd,
  buildBotHtml,
  articleJsonLd,
  breadcrumbJsonLd,
  faqPageJsonLd,
} from './_lib/seo-templates.js';
import { PUBLISHED_ARTICLES, ARTICLES_BY_SLUG } from './_lib/articles/index.js';

// Render API base. Configurable via env so this same function can run against
// staging in the future. Default points at production Render service.
const API_BASE = process.env.API_BASE_URL || 'https://api.advance.al/api';
const FETCH_TIMEOUT_MS = 8000;

async function safeFetch(url) {
  // AbortController for fetch timeout — Render free tier can be slow to wake.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJob(idOrSlug) {
  // Backend GET /api/jobs/:id dual-lookups (Phase B): ObjectId OR slug both work.
  const body = await safeFetch(`${API_BASE}/jobs/${encodeURIComponent(idOrSlug)}`);
  return body?.data?.job || null;
}

async function fetchActiveJobs(limit = 20) {
  const body = await safeFetch(`${API_BASE}/jobs?page=1&limit=${limit}`);
  return body?.data?.jobs || [];
}

function renderJobBody(job) {
  const slug = job.slug || job._id;
  const employerProfile = job.employerId?.profile?.employerProfile || {};
  const company = employerProfile.companyName || 'Punëdhënës i verifikuar';
  // Strip HTML from description; cap at 2000 chars to keep body bounded.
  const description = String(job.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
  const requirements = Array.isArray(job.requirements) ? job.requirements.filter(Boolean).slice(0, 20) : [];
  const benefits = Array.isArray(job.benefits) ? job.benefits.filter(Boolean).slice(0, 20) : [];
  const dateOnly = (s) => (typeof s === 'string' ? s.slice(0, 10) : '');

  return `    <article>
      <header>
        <h1>${escapeHtml(job.title)}</h1>
        <p><strong>${escapeHtml(company)}</strong>${job.location?.city ? ` · ${escapeHtml(job.location.city)}` : ''}${job.location?.remote ? ' · Remote' : ''}</p>
        <p>Lloji: ${escapeHtml(job.jobType || '')}${job.category ? ` · Kategoria: ${escapeHtml(job.category)}` : ''}${job.seniority ? ` · Niveli: ${escapeHtml(job.seniority)}` : ''}</p>
        <p>Postuar më: ${escapeHtml(dateOnly(job.postedAt))}${job.expiresAt ? ` · Skadon më: ${escapeHtml(dateOnly(job.expiresAt))}` : ''}</p>
      </header>
      <section>
        <h2>Përshkrimi i pozicionit</h2>
        <p>${escapeHtml(description)}</p>
      </section>
      ${requirements.length ? `<section><h2>Kërkesa</h2><ul>${requirements.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul></section>` : ''}
      ${benefits.length ? `<section><h2>Përfitime</h2><ul>${benefits.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul></section>` : ''}
      <p><a href="${SITE_URL}/jobs/${escapeHtml(slug)}">Apliko për këtë pozicion në Advance.al</a></p>
    </article>`;
}

function renderJobsListBody(jobs) {
  if (!jobs.length) {
    return `    <section>
      <h1>Punët në Shqipëri</h1>
      <p>Nuk ka pozicione aktive për momentin. <a href="${SITE_URL}/jobseekers">Krijoni profilin</a> që të merrni njoftime kur publikohen punë të reja.</p>
    </section>`;
  }
  return `    <section>
      <h1>Punët aktive në Shqipëri — ${jobs.length} pozicione</h1>
      <p>Pozicione të hapura nga kompani të verifikuara në Tiranë, Durrës, Vlorë, Shkodër, Elbasan dhe e gjithë Shqipëria.</p>
      <ul>
${jobs
  .map((j) => {
    const slug = j.slug || j._id;
    const company = j.employerId?.profile?.employerProfile?.companyName || '';
    const city = j.location?.city || '';
    return `        <li><a href="${SITE_URL}/jobs/${escapeHtml(slug)}">${escapeHtml(j.title)}</a>${company ? ` — ${escapeHtml(company)}` : ''}${city ? ` (${escapeHtml(city)})` : ''}</li>`;
  })
  .join('\n')}
      </ul>
    </section>`;
}

function staticPageMeta(pathname) {
  // Maps SPA paths to bot-renderable metadata. Anything not in this map
  // gets a generic Organization-only shell.
  const STATIC = {
    '/': {
      title: null,
      description: DEFAULT_DESCRIPTION,
      canonical: `${SITE_URL}/`,
      bodyContent: `    <section>
      <h1>${escapeHtml(SITE_NAME)} — Portal i Punës në Shqipëri</h1>
      <p>Mijëra pozicione nga kompani të verifikuara në Tiranë, Durrës, Vlorë, Shkodër, Elbasan dhe e gjithë Shqipëria. Përputhje inteligjente me AI, aplikim me 1-klik.</p>
      <p><a href="${SITE_URL}/jobs">Shiko të gjitha punët aktive</a> · <a href="${SITE_URL}/about">Rreth nesh</a> · <a href="${SITE_URL}/employers">Për punëdhënësit</a> · <a href="${SITE_URL}/jobseekers">Për kandidatët</a></p>
    </section>`,
      jsonLdBlocks: [organizationJsonLd(), websiteJsonLd()],
    },
    '/about': {
      title: 'Rreth nesh',
      description: 'Mësoni më shumë rreth Advance.al — portali kombëtar i punës në Shqipëri.',
      canonical: `${SITE_URL}/about`,
      bodyContent: `    <section>
      <h1>Rreth Advance.al</h1>
      <p>Advance.al është platforma kombëtare e punës në Shqipëri, e ndërtuar për të lidhur punëkërkuesit shqiptarë me kompani të verifikuara në Tiranë, Durrës, Vlorë dhe të gjithë vendin. Përmes përputhjes semantike të bazuar në AI, ne sigurojmë që kandidatët të marrin njoftime vetëm për pozicione që vërtet u përshtaten.</p>
    </section>`,
      jsonLdBlocks: [{ '@context': 'https://schema.org', '@type': 'AboutPage', name: 'Rreth Advance.al', url: `${SITE_URL}/about`, inLanguage: 'sq-AL' }],
    },
    '/employers': {
      title: 'Për Punëdhënësit',
      description: 'Punësoni talente në Shqipëri me Advance.al. Postoni vende pune, gjeni kandidatë të verifikuar dhe menaxhoni aplikimet.',
      canonical: `${SITE_URL}/employers`,
      bodyContent: `    <section>
      <h1>Për Punëdhënësit</h1>
      <p>Publikoni pozicione në 5 minuta. Sistemi ynë me AI gjen kandidatët idealë dhe u dërgon njoftime vetëm atyre që përputhen me kërkesat tuaja. Kandidatë të cilësisë së lartë, pa agjenci, pa pritje të gjatë.</p>
    </section>`,
      jsonLdBlocks: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Për Punëdhënësit — Advance.al', url: `${SITE_URL}/employers`, inLanguage: 'sq-AL', audience: { '@type': 'BusinessAudience', audienceType: 'Employers in Albania' } }],
    },
    '/jobseekers': {
      title: 'Për Kandidatët',
      description: 'Gjeni punën e duhur në Shqipëri me Advance.al. Krijoni profilin, ngarkoni CV-në, merrni rekomandime AI të personalizuara.',
      canonical: `${SITE_URL}/jobseekers`,
      bodyContent: `    <section>
      <h1>Për Kandidatët</h1>
      <p>Krijoni profilin tuaj në Advance.al, ngarkoni CV-në ose lëreni AI ta gjenerojë për ju, dhe merrni rekomandime të personalizuara për pozicione që vërtet ju përshtaten. Aplikim me 1 klik, njoftime për punë të reja, kontroll i plotë mbi profilin tuaj.</p>
    </section>`,
      jsonLdBlocks: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Për Kandidatët — Advance.al', url: `${SITE_URL}/jobseekers`, inLanguage: 'sq-AL', audience: { '@type': 'Audience', audienceType: 'Job seekers in Albania' } }],
    },
    '/privacy': {
      title: 'Politika e Privatësisë',
      description: 'Politika e privatësisë së Advance.al — GDPR-kompatibil.',
      canonical: `${SITE_URL}/privacy`,
      bodyContent: `    <section><h1>Politika e Privatësisë</h1><p>Si i mblidhen, përdoren dhe mbrohen të dhënat personale të përdoruesve të Advance.al. Detajet e plota gjenden në faqen e plotë.</p></section>`,
      jsonLdBlocks: [],
    },
    '/terms': {
      title: 'Kushtet e Shërbimit',
      description: 'Kushtet e shërbimit të Advance.al.',
      canonical: `${SITE_URL}/terms`,
      bodyContent: `    <section><h1>Kushtet e Shërbimit</h1><p>Të drejtat dhe detyrimet e përdoruesve, kompanive dhe platformës Advance.al. Detajet e plota gjenden në faqen e plotë.</p></section>`,
      jsonLdBlocks: [],
    },
  };
  return STATIC[pathname] || null;
}

async function handleRoute(req) {
  const reqUrl = new URL(req.url || '/', SITE_URL);
  // Edge Middleware fetches us with the original path as ?path=<path>.
  // Prefer that when present; otherwise fall back to the request's own
  // pathname (used when vercel.json rewrites send us the request directly).
  const forwardedPath = reqUrl.searchParams.get('path');
  // Pre-deploy audit (O-E): tighten the accepted forwardedPath shape.
  // Reject anything containing query strings, fragments, or non-URL-path
  // characters. The route matchers below would silently ignore them, but
  // an attacker-supplied weird path could end up in cache keys / logs.
  const SAFE_PATH = /^\/[a-z0-9/\-_.]{0,200}$/i;
  const rawPath = forwardedPath && SAFE_PATH.test(forwardedPath) ? forwardedPath : reqUrl.pathname;
  const pathname = rawPath.replace(/\/$/, '') || '/';

  // /jobs/<slug-or-id>
  const jobMatch = pathname.match(/^\/jobs\/([^/]+)$/);
  if (jobMatch) {
    const idOrSlug = decodeURIComponent(jobMatch[1]);
    const job = await fetchJob(idOrSlug);
    if (!job) {
      return {
        status: 404,
        cacheControl: 's-maxage=60',
        html: buildBotHtml({
          title: 'Pozicioni nuk u gjet',
          description: 'Ky pozicion nuk është më aktiv ose nuk ekziston në Advance.al.',
          canonical: `${SITE_URL}${pathname}`,
          noindex: true,
          bodyContent: `    <section><h1>Pozicioni nuk u gjet</h1><p>Ky pozicion nuk është më i disponueshëm. <a href="${SITE_URL}/jobs">Shiko punët aktive</a>.</p></section>`,
        }),
      };
    }
    const slug = job.slug || job._id;
    const employerProfile = job.employerId?.profile?.employerProfile || {};
    const company = employerProfile.companyName || '';
    const title = `${job.title}${company ? ` — ${company}` : ''}`;
    const description =
      String(job.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) ||
      `${job.title}${company ? ` në ${company}` : ''}${job.location?.city ? `, ${job.location.city}` : ''}`;
    return {
      status: 200,
      cacheControl: 's-maxage=300, stale-while-revalidate=600',
      html: buildBotHtml({
        title,
        description,
        canonical: `${SITE_URL}/jobs/${slug}`,
        imageUrl: employerProfile.logo || undefined,
        bodyContent: renderJobBody(job),
        jsonLdBlocks: [jobPostingJsonLd(job)],
      }),
    };
  }

  // /jobs (listing)
  if (pathname === '/jobs') {
    const jobs = await fetchActiveJobs(20);
    return {
      status: 200,
      cacheControl: 's-maxage=300, stale-while-revalidate=600',
      html: buildBotHtml({
        title: 'Të gjitha punët aktive',
        description: `${jobs.length || 'Mijëra'} pozicione aktive në Tiranë, Durrës, Vlorë, Shkodër, Elbasan dhe e gjithë Shqipëria. Filtrim sipas qytetit, kategorisë dhe llojit të punës.`,
        canonical: `${SITE_URL}/jobs`,
        bodyContent: renderJobsListBody(jobs),
        jsonLdBlocks: [itemListJsonLd(jobs, 'Punët aktive në Advance.al')],
      }),
    };
  }

  // /blog/<slug> — individual article
  const blogMatch = pathname.match(/^\/blog\/([a-z0-9-]+)$/);
  if (blogMatch) {
    const slug = blogMatch[1];
    const article = ARTICLES_BY_SLUG[slug];
    if (!article) {
      return {
        status: 404,
        cacheControl: 's-maxage=60',
        html: buildBotHtml({
          title: 'Artikulli nuk u gjet',
          description: 'Ky artikull nuk ekziston ose është hequr nga Advance.al.',
          canonical: `${SITE_URL}${pathname}`,
          noindex: true,
          bodyContent: `    <section><h1>Artikulli nuk u gjet</h1><p><a href="${SITE_URL}/blog">Shiko të gjitha artikujt</a></p></section>`,
        }),
      };
    }
    const canonical = `${SITE_URL}/blog/${slug}`;
    const jsonLd = [
      articleJsonLd(article, canonical),
      breadcrumbJsonLd([
        { name: 'Faqja kryesore', url: `${SITE_URL}/` },
        { name: 'Blog', url: `${SITE_URL}/blog` },
        { name: article.title, url: canonical },
      ]),
    ];
    const faqLd = faqPageJsonLd(article.faq);
    if (faqLd) jsonLd.push(faqLd);
    return {
      status: 200,
      cacheControl: 's-maxage=3600, stale-while-revalidate=86400',
      html: buildBotHtml({
        title: article.title,
        description: article.description,
        canonical,
        bodyContent: `    <article>\n${article.bodyHtml}\n    </article>`,
        jsonLdBlocks: jsonLd,
      }),
    };
  }

  // /blog — listing page
  if (pathname === '/blog') {
    const articles = PUBLISHED_ARTICLES;
    const description = articles.length > 0
      ? `${articles.length} artikuj për karrierën, tregun e punës dhe këshilla praktike për kërkuesit e punës në Shqipëri.`
      : 'Artikuj për karrierën, tregun e punës dhe këshilla praktike për kërkuesit e punës në Shqipëri.';
    const list = articles
      .map((a) => `        <li><a href="${SITE_URL}/blog/${escapeHtml(a.slug)}"><strong>${escapeHtml(a.title)}</strong></a> — <time datetime="${escapeHtml(a.datePublished)}">${escapeHtml(a.datePublished)}</time><br/>${escapeHtml(a.description)}</li>`)
      .join('\n');
    return {
      status: 200,
      cacheControl: 's-maxage=600, stale-while-revalidate=3600',
      html: buildBotHtml({
        title: 'Blog — këshilla karriere dhe tregu i punës',
        description,
        canonical: `${SITE_URL}/blog`,
        bodyContent: `    <section>\n      <h1>Blog</h1>\n      <p>${escapeHtml(description)}</p>\n${articles.length > 0 ? `      <ul>\n${list}\n      </ul>` : '      <p>Së shpejti.</p>'}\n    </section>`,
      }),
    };
  }

  // Utility / auth routes — intentionally NOINDEX. Previously these fell
  // through to the catch-all below and were served an indexable Organization
  // shell with the DEFAULT homepage title, so Google clustered them as
  // duplicates of "/" ("Duplicate, Google chose different canonical than
  // user"). They are thin, non-content pages: keep them out of the index and
  // out of sitemap.xml so crawl budget concentrates on real content.
  const NOINDEX_PATHS = new Set([
    '/login',
    '/register',
    '/employer-register',
    '/forgot-password',
    '/reset-password',
    '/unsubscribe',
    '/preferences',
    '/report-user',
  ]);
  if (NOINDEX_PATHS.has(pathname)) {
    return {
      status: 200,
      cacheControl: 's-maxage=3600, stale-while-revalidate=86400',
      html: buildBotHtml({
        title: null,
        description: DEFAULT_DESCRIPTION,
        canonical: `${SITE_URL}${pathname}`,
        noindex: true,
        bodyContent: `    <section><h1>${escapeHtml(SITE_NAME)}</h1><p>Portal i punës në Shqipëri. <a href="${SITE_URL}/jobs">Shiko punët aktive</a>.</p></section>`,
        jsonLdBlocks: [],
      }),
    };
  }

  // Static routes (home, about, employers, jobseekers, privacy, terms)
  const meta = staticPageMeta(pathname);
  if (meta) {
    return {
      status: 200,
      cacheControl: 's-maxage=3600, stale-while-revalidate=86400',
      html: buildBotHtml(meta),
    };
  }

  // Catch-all: a path we don't have explicit content for. Serve an indexable
  // Organization shell so bots can still pick up the brand entity. They'll
  // discover content via internal links + sitemap.
  return {
    status: 200,
    cacheControl: 's-maxage=600',
    html: buildBotHtml({
      title: null,
      description: undefined,
      canonical: `${SITE_URL}${pathname}`,
      bodyContent: `    <section><h1>${escapeHtml(SITE_NAME)}</h1><p>Portal i punës në Shqipëri. <a href="${SITE_URL}/jobs">Shiko punët aktive</a>.</p></section>`,
      jsonLdBlocks: [organizationJsonLd()],
    }),
  };
}

// Vercel Node function entry point.
// Signature: (req, res) — Vercel injects status/send/setHeader helpers.
export default async function handler(req, res) {
  try {
    const out = await handleRoute(req);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', out.cacheControl || 's-maxage=300');
    // CDN must partition cache by UA — the rewrite that lands here is UA-gated,
    // so the same path serves different bodies to bots vs humans. Without Vary
    // a primed edge node can serve the wrong cached body to the wrong audience.
    res.setHeader('Vary', 'User-Agent');
    // Mark as bot-served so logs/dashboards can distinguish from SPA traffic.
    res.setHeader('X-Bot-Prerender', '1');
    return res.status(out.status || 200).send(out.html);
  } catch (err) {
    // LAST-RESORT fallback: emit a valid minimal HTML so the crawler doesn't
    // see a 500. Bots will retry later; in the meantime they see roughly the
    // same content the SPA would serve (the empty shell). This is the floor —
    // we can't get worse than today's status quo.
    const minimal = `<!doctype html>
<html lang="sq">
<head>
<meta charset="UTF-8">
<title>${SITE_NAME}</title>
<meta name="description" content="${DEFAULT_DESCRIPTION}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${SITE_URL}/">
</head>
<body><div id="root"></div></body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.setHeader('Vary', 'User-Agent');
    res.setHeader('X-Bot-Prerender-Error', '1');
    return res.status(200).send(minimal);
  }
}
