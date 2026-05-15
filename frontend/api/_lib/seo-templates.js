// Bot-prerender HTML + JSON-LD template helpers.
// Pure functions — no side effects, no IO. Easy to unit-test if needed.
// Used by frontend/api/seo.js to render per-route HTML for SEO/GEO crawlers.

export const SITE_URL = 'https://advance.al';
export const SITE_NAME = 'Advance.al';
export const DEFAULT_DESCRIPTION =
  'Advance.al është portali kryesor i punës në Shqipëri. Gjeni punë në Tiranë, Durrës dhe të gjithë vendin. Kompani të verifikuara, pozicione ekskluzive dhe aplikim i lehtë.';
export const DEFAULT_TITLE = 'Advance.al - Portal i Punës në Shqipëri';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/logo.jpeg`;

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Inside a <script> tag, JSON output must escape `</` to prevent breaking out.
// See https://html.spec.whatwg.org/multipage/scripting.html#restrictions-for-contents-of-script-elements
export function escapeJsonScript(json) {
  return JSON.stringify(json)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/</g, '\\u003c')
    .replace(/-->/g, '--\\>');
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    alternateName: 'Advance',
    url: SITE_URL,
    logo: DEFAULT_OG_IMAGE,
    description: 'Portali kryesor i punës në Shqipëri — kompani të verifikuara dhe pozicione ekskluzive.',
    address: { '@type': 'PostalAddress', addressCountry: 'AL', addressLocality: 'Tirana' },
    sameAs: [],
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: 'sq-AL',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/jobs?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function jobPostingJsonLd(job) {
  const jobTypeMap = {
    'full-time': 'FULL_TIME',
    'part-time': 'PART_TIME',
    contract: 'CONTRACTOR',
    freelance: 'CONTRACTOR',
    internship: 'INTERN',
    temporary: 'TEMPORARY',
  };
  const rawType = String(job?.jobType || '').toLowerCase();
  const employmentType = jobTypeMap[rawType] || 'OTHER';
  const slug = job?.slug || job?._id;
  const employerProfile = job?.employerId?.profile?.employerProfile || {};
  const company = employerProfile.companyName || SITE_NAME;
  const website = employerProfile.website || SITE_URL;
  const logo = employerProfile.logo || DEFAULT_OG_IMAGE;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job?.title || '',
    description: job?.description || job?.title || '',
    identifier: {
      '@type': 'PropertyValue',
      name: SITE_NAME,
      value: String(job?._id || slug || ''),
    },
    datePosted: job?.postedAt || new Date().toISOString(),
    employmentType,
    hiringOrganization: {
      '@type': 'Organization',
      name: company,
      sameAs: website,
      logo,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job?.location?.city || 'Tirana',
        addressRegion: job?.location?.region || 'Tirana',
        addressCountry: 'AL',
      },
    },
    directApply: true,
    url: `${SITE_URL}/jobs/${slug || ''}`,
  };

  if (job?.expiresAt) ld.validThrough = job.expiresAt;
  if (job?.location?.remote) {
    ld.jobLocationType = 'TELECOMMUTE';
    ld.applicantLocationRequirements = { '@type': 'Country', name: 'Albania' };
  }
  const salary = job?.salary;
  if (salary && (salary.min || salary.max) && salary.showPublic !== false) {
    ld.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: salary.currency || 'EUR',
      value: {
        '@type': 'QuantitativeValue',
        minValue: salary.min,
        maxValue: salary.max || salary.min,
        unitText: 'MONTH',
      },
    };
  }
  return ld;
}

// Article schema for blog content. Drives Google's rich-result eligibility
// for articles and signals freshness/authorship to AI crawlers.
// Required fields per https://developers.google.com/search/docs/appearance/structured-data/article
export function articleJsonLd(article, canonicalUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    author: {
      '@type': 'Organization',
      name: article.author || 'Ekipi i advance.al',
      url: `${SITE_URL}/about`,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: DEFAULT_OG_IMAGE },
    },
    datePublished: article.datePublished,
    dateModified: article.dateModified || article.datePublished,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    image: article.image || DEFAULT_OG_IMAGE,
    inLanguage: 'sq-AL',
  };
}

// Breadcrumb trail surfaced as a horizontal nav under the page title in SERPs.
export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

// FAQ rich-result schema. Surfaces as accordion-style Q&A in Google SERPs and
// is one of the highest-citation signals for AI assistants when they answer
// "how do I X" queries.
export function faqPageJsonLd(faq) {
  if (!Array.isArray(faq) || faq.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((qa) => ({
      '@type': 'Question',
      name: qa.q,
      acceptedAnswer: { '@type': 'Answer', text: qa.a },
    })),
  };
}

export function itemListJsonLd(jobs, listName) {
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName || 'Active jobs',
    numberOfItems: safeJobs.length,
    itemListElement: safeJobs.slice(0, 50).map((j, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/jobs/${j?.slug || j?._id || ''}`,
      name: j?.title || '',
    })),
  };
}

// Returns full HTML document for bot crawlers.
// IMPORTANT: includes <div id="root"></div> so that if a human accidentally
// hits this function (due to UA-regex misconfiguration), the SPA can still
// mount on top via the React script tag in the actual built index.html.
// In practice however, humans should never reach this endpoint because the
// vercel.json `has` rewrite filters by UA before dispatch.
export function buildBotHtml({
  title,
  description,
  canonical,
  jsonLdBlocks = [],
  bodyContent = '',
  imageUrl,
  noindex = false,
}) {
  const finalTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
  const finalDesc = description || DEFAULT_DESCRIPTION;
  const ogImage = imageUrl || DEFAULT_OG_IMAGE;
  const canonicalUrl = canonical || `${SITE_URL}/`;

  const robots = noindex
    ? 'noindex, nofollow'
    : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

  const jsonLdHtml = (Array.isArray(jsonLdBlocks) ? jsonLdBlocks : [])
    .filter(Boolean)
    .map((block) => `<script type="application/ld+json">${escapeJsonScript(block)}</script>`)
    .join('\n    ');

  return `<!doctype html>
<html lang="sq">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(finalTitle)}</title>
    <meta name="description" content="${escapeHtml(finalDesc)}" />
    <meta name="author" content="${SITE_NAME}" />
    <link rel="icon" type="image/jpeg" href="/logo.jpeg" />
    <meta name="robots" content="${robots}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta name="theme-color" content="#0F172A" />
    <meta name="geo.region" content="AL" />
    <meta name="geo.placename" content="Tirana, Albania" />
    <meta name="geo.position" content="41.3275;19.8187" />
    <meta name="ICBM" content="41.3275, 19.8187" />
    <meta property="og:title" content="${escapeHtml(finalTitle)}" />
    <meta property="og:description" content="${escapeHtml(finalDesc)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:locale" content="sq_AL" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@advance_al" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
    ${jsonLdHtml}
  </head>
  <body>
${bodyContent}
    <div id="root"></div>
  </body>
</html>`;
}
