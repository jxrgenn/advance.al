/**
 * middleware.ts — Vercel Edge Middleware
 *
 * Routes bot/crawler User-Agents through Prerender.io so they receive
 * fully-rendered HTML (with content + JSON-LD if present) instead of the
 * empty SPA shell. Humans pass through to the SPA unchanged.
 *
 * Behavior:
 *  - If PRERENDER_TOKEN env var is unset → middleware no-ops (safe to deploy)
 *  - Only GET requests to HTML paths are routed; static assets, /api, /assets,
 *    favicon, robots.txt, sitemap.xml, llms.txt are skipped
 *  - On Prerender failure, falls through to the SPA so the site never goes down
 *
 * To enable: set PRERENDER_TOKEN in Vercel → Settings → Environment Variables.
 * Token comes from your prerender.io dashboard.
 */

export const config = {
  // Run on everything except API, static assets, well-known files, and files with extensions.
  matcher: '/((?!api/|assets/|_next/|.*\\.).*)',
};

// Bot User-Agents to route through Prerender (lowercase substring match).
const BOT_AGENTS = [
  // OpenAI / ChatGPT
  'gptbot',
  'chatgpt-user',
  'oai-searchbot',
  // Anthropic / Claude
  'claudebot',
  'claude-user',
  'claude-searchbot',
  'claude-web',
  'anthropic-ai',
  // Perplexity
  'perplexitybot',
  'perplexity-user',
  // Google AI
  'google-extended',
  // Apple AI
  'applebot-extended',
  // Other AI training/search crawlers
  'bytespider',
  'ccbot',
  'amazonbot',
  'cohere-ai',
  'diffbot',
  'meta-externalagent',
  'meta-externalfetcher',
  'facebookbot',
  'ai2bot',
  'mistralai-user',
  'timpibot',
  'pangubot',
  'icc-crawler',
  'imagesiftbot',
  'youbot',
  // Traditional search engines
  'googlebot',
  'bingbot',
  'duckduckbot',
  'yandex',
  'baiduspider',
  'applebot',
  'slurp',
  // Social previewers (need OG/meta — Prerender returns the same)
  'twitterbot',
  'facebookexternalhit',
  'linkedinbot',
  'slackbot',
  'discordbot',
  'telegrambot',
  'whatsapp',
  'redditbot',
  'pinterestbot',
  'embedly',
  'flipboard',
  'tumblr',
  'skypeuripreview',
  'qwantify',
  'rogerbot',
  'showyoubot',
  'outbrain',
  'w3c_validator',
  'chrome-lighthouse',
];

export default async function middleware(request: Request): Promise<Response | void> {
  const token = (globalThis as any).process?.env?.PRERENDER_TOKEN;
  if (!token) return; // Not configured yet — pass through to SPA

  if (request.method !== 'GET') return;

  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  if (!ua) return;

  const isBot = BOT_AGENTS.some((bot) => ua.includes(bot));
  if (!isBot) return;

  const url = new URL(request.url);

  // Skip if Prerender token is being requested (avoid loops)
  if (url.hostname.includes('prerender.io')) return;

  const prerenderUrl = `https://service.prerender.io/${url.toString()}`;

  try {
    const res = await fetch(prerenderUrl, {
      headers: {
        'X-Prerender-Token': token,
        'User-Agent': request.headers.get('user-agent') || '',
      },
    });

    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'text/html; charset=utf-8',
        'X-Prerender': 'served',
        'Cache-Control': res.headers.get('cache-control') || 'public, max-age=300',
      },
    });
  } catch {
    // Fall through to SPA on any error so the site never goes down
    return;
  }
}
