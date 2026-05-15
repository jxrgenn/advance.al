/**
 * Blog article registry.
 *
 * SINGLE SOURCE OF TRUTH for which articles are published. Both the React
 * frontend and the bot-prerender function import from here. Identical
 * content is served to bots and humans (no cloaking — see Phase C docs).
 *
 * To publish an article:
 *   1. Add the article module file (e.g., ./cv-guide-shqiperi-2026.js)
 *   2. Import it below and append to PUBLISHED_ARTICLES
 *   3. Run `node scripts/generate-sitemap.mjs` to add it to sitemap.xml
 *   4. Commit + deploy. IndexNow ping fires automatically (see indexNow.js).
 *
 * Until an article is in PUBLISHED_ARTICLES:
 *   - The /blog/<slug> URL returns 404
 *   - The /blog listing page won't show it
 *   - The sitemap won't include it
 *   - No external party can discover it
 *
 * This is the safety gate. Drafts can live in the codebase without being
 * exposed.
 */

import cvGuide from './cv-guide-shqiperi-2026.js';
import interviewQuestions from './pyetjet-ne-interviste-pune-2026.js';
import salaryNegotiation from './si-te-negocosh-pagen-2026.js';
import diasporaJobSearch from './kerkim-pune-diaspora-shqiptare-2026.js';
import salaryResearch from './si-te-hulumtosh-pagen-shqiperi-2026.js';

/**
 * Each item is an article module (see ./cv-guide-shqiperi-2026.js for shape).
 * ORDER MATTERS — newest first, since the /blog listing renders this array
 * in order.
 */
export const PUBLISHED_ARTICLES = [
  cvGuide,
  interviewQuestions,
  salaryNegotiation,
  diasporaJobSearch,
  salaryResearch,
];

/**
 * Map of slug → article. Built once at module load. Use this for O(1) lookup
 * in the /blog/<slug> handler.
 */
export const ARTICLES_BY_SLUG = Object.fromEntries(
  PUBLISHED_ARTICLES.map((a) => [a.slug, a]),
);

/**
 * Returns true if a slug points to a published article. Used by the
 * prerender function and the React detail page.
 */
export function isPublishedSlug(slug) {
  return typeof slug === 'string' && Object.prototype.hasOwnProperty.call(ARTICLES_BY_SLUG, slug);
}
