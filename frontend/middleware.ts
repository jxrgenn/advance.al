/**
 * middleware.ts — Vercel Edge Middleware
 *
 * Routes bot/crawler User-Agents through our own /api/seo function so they
 * receive fully-rendered HTML (content + JSON-LD) instead of the empty SPA
 * shell. Humans pass through unchanged.
 *
 * Why middleware (not just a vercel.json rewrite): the root path "/" is
 * served from the static filesystem (dist/index.html) BEFORE vercel.json
 * rewrites are evaluated, so a UA-gated rewrite at "source: /" never fires
 * for "/". Edge Middleware runs before filesystem and fixes this.
 *
 * Failure mode: any error fetching /api/seo falls through to the SPA so
 * the site never goes down.
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
  if (request.method !== 'GET') return;

  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  if (!ua) return;

  const isBot = BOT_AGENTS.some((bot) => ua.includes(bot));
  if (!isBot) return;

  const url = new URL(request.url);

  // Don't loop on /api/seo itself.
  if (url.pathname.startsWith('/api/')) return;

  // Route bots through our own /api/seo function. This is necessary for the
  // root path "/" because Vercel's static filesystem serves dist/index.html
  // BEFORE evaluating vercel.json rewrites — so the bot-conditional rewrite
  // never fires for "/". Middleware runs before filesystem, fixing this.
  // For non-root paths the vercel.json rewrite would also work, but routing
  // them through middleware keeps the behavior uniform and the cache path
  // single.
  const target = new URL(url.toString());
  target.pathname = '/api/seo';
  target.searchParams.set('path', url.pathname);

  try {
    const res = await fetch(target.toString(), {
      headers: {
        'User-Agent': request.headers.get('user-agent') || '',
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || '',
      },
    });

    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'text/html; charset=utf-8',
        'Cache-Control': res.headers.get('cache-control') || 's-maxage=300',
        'Vary': 'User-Agent',
        'X-Bot-Prerender': res.headers.get('x-bot-prerender') || '1',
        'X-Bot-Middleware': '1',
      },
    });
  } catch {
    // Fall through to SPA on any error so the site never goes down
    return;
  }
}
