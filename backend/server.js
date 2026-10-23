// FIRST import: loads backend/.env for local development before any other
// module reads its configuration (skipped under the test runner — see env.js).
import './src/config/env.js';
import * as Sentry from '@sentry/node';

// Initialize Sentry before anything else
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    // Don't send in development unless explicitly enabled
    enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLED === 'true',
  });
}

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { mkdirSync } from 'fs';
import path from 'path';
import { connectDB } from './src/config/database.js';
import mongoose from 'mongoose';
import logger from './src/config/logger.js';
import { rejectMongoOperators } from './src/middleware/rejectMongoOperators.js';

// Import routes (will create these next)
import authRoutes from './src/routes/auth.js';
import userRoutes from './src/routes/users.js';
import jobRoutes from './src/routes/jobs.js';
import applicationRoutes from './src/routes/applications.js';
import locationRoutes from './src/routes/locations.js';
import notificationRoutes from './src/routes/notifications.js';
import statsRoutes from './src/routes/stats.js';
// O-69: src/routes/verification.js is intentionally NOT imported/mounted —
// see the note at the /api route mounts below.
import quickUserRoutes from './src/routes/quickusers.js';
import companiesRoutes from './src/routes/companies.js';
// send-verification route REMOVED — legacy unauthenticated email endpoint (security risk).
// Authenticated version lives at /api/auth/send-verification in auth.js.
import adminRoutes from './src/routes/admin.js';
import reportRoutes from './src/routes/reports.js';
import bulkNotificationRoutes from './src/routes/bulk-notifications.js';
import configurationRoutes from './src/routes/configuration.js';
import businessControlRoutes from './src/routes/business-control.js';
import matchingRoutes from './src/routes/matching.js';
import cvRoutes from './src/routes/cv.js';
import adminEmbeddingsRoutes from './src/routes/admin/embeddings.js';
import healthzRoutes from './src/routes/healthz.js';
import paymentRoutes from './src/routes/payments.js';
import stripeWebhookRoutes from './src/routes/stripeWebhook.js';
import { Job, SystemConfiguration } from './src/models/index.js';
import { redis } from './src/config/redis.js';
import { createApiLimiter } from './src/middleware/apiRateLimit.js';
import { createScheduler, dailyAtUtcHour } from './src/services/scheduler.js';

// Startup validation — fail fast if critical env vars are missing
const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}
// MONGODB_URI is critical in production — localhost fallback must not be used
if (process.env.NODE_ENV === 'production' && !process.env.MONGODB_URI) {
  logger.error('MONGODB_URI is required in production');
  process.exit(1);
}
// FRONTEND_URL is critical in production — password reset links default to localhost without it
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  logger.error('FRONTEND_URL is required in production (used for password reset links, email URLs)');
  process.exit(1);
} else if (!process.env.FRONTEND_URL) {
  logger.warn('FRONTEND_URL not set — defaulting to http://localhost:5173 for email links');
}
if (!process.env.OPENAI_API_KEY) {
  logger.warn('OPENAI_API_KEY not set — CV generation and embeddings will be unavailable');
}
// Production safety: warn about debug flags and missing Cloudinary
if (process.env.NODE_ENV === 'production') {
  const debugFlags = ['DEBUG_EMBEDDINGS', 'DEBUG_WORKER', 'DEBUG_QUEUE'].filter(f => process.env[f] === 'true');
  if (debugFlags.length > 0) {
    logger.warn(`Debug logging enabled in production (${debugFlags.join(', ')}) — may leak sensitive data. Set to false.`);
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    logger.error('Cloudinary not configured in production — file uploads will be rejected (ephemeral disk storage is not safe)');
  }
}

const app = express();
// Trust X-Forwarded-For only when the immediate upstream is a private/loopback
// IP (i.e. Render's internal proxy chain). External clients cannot spoof
// req.ip because their immediate connection is from a public IP, so Express
// will ignore any XFF header they send.
//
// Earlier we used `trust proxy: true` which trusts the LEFTMOST XFF entry
// regardless of immediate upstream — that lets any client write any IP they
// want into req.ip and bypass per-IP rate limits (cvGenerateLimiter,
// authLimiter, the global /api/ limiter). The `loopback, linklocal,
// uniquelocal` allowlist hits the same Render-internal use case (which lives
// on RFC1918 IPs) without the spoofing surface. Verified with ultrareview
// bug_005.
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
const PORT = process.env.PORT || 3001;

// Connect to Database — must complete before accepting requests
// Skipped in test mode; tests manage their own DB via tests/setup/testDb.js
if (process.env.NODE_ENV !== 'test') {
  await connectDB();
}

// Security Middleware
// HTTP compression — gzip/brotli for all responses
app.use(compression());

// Security headers — comprehensive CSP + cross-origin policies.
// Backend rarely serves HTML (mostly JSON), but the CSP applies on the few
// HTML responses (error pages, file downloads with HTML preview, etc).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],   // disallow embedding in iframes (clickjacking)
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // would block Cloudinary images otherwise
  referrerPolicy: { policy: 'no-referrer' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

// CORS Configuration - Allow all origins in development
const corsOptions = {
  origin: function (origin, callback) {
    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // Allow requests with no Origin header (health checks, server-to-server, curl, monitoring)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173', // Vite dev server
      'http://localhost:3000', // Alternative dev port
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      'https://advance.al',                      // Production custom domain
      'https://www.advance.al',                   // Production www subdomain
      'https://advance-al-frontend.vercel.app',   // Production Vercel URL
      'https://advance-al.vercel.app',            // Alternative Vercel URL
    ];

    // Allow additional origin from env var (e.g. custom domain later)
    if (process.env.FRONTEND_URL) {
      allowedOrigins.push(process.env.FRONTEND_URL);
    }

    // Allow Vercel preview deployment URLs (advance-al-<hash>-<team>.vercel.app)
    // Requires at least one dash-separated segment after project name to prevent spoofing
    const isVercelPreview = /^https:\/\/advance-al(?:-frontend)?-[a-z0-9]+-[a-z0-9-]+\.vercel\.app$/.test(origin);

    if (allowedOrigins.indexOf(origin) !== -1 || isVercelPreview) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Round O-F: parse cookies on every request so auth middleware can read
// `auth_token` / `refresh_token` from req.cookies. Mounted right after CORS
// so cross-origin XHRs from advance.al → api.advance.al with
// `credentials: 'include'` get their cookies attached. Header-based auth
// continues to work in parallel (bidirectional rollback).
app.use(cookieParser());

// CORS error handler — turn the thrown "Not allowed by CORS" into a clean 403
// JSON response instead of a generic 500. Must come right after the cors()
// middleware so it catches its errors specifically.
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'Origin not allowed'
    });
  }
  next(err);
});

// Stripe webhook — mounted BEFORE the global /api limiter, the JSON body
// parser and the maintenance-mode gate: Stripe signs the raw bytes
// (express.raw inside the router), retries must never be rate-limited, and
// payment confirmations must still land during maintenance.
app.use('/api/payments/stripe/webhook', stripeWebhookRoutes);

// Site-wide API budget (#61) — keyed per USER when the request carries a
// valid session token, per IP otherwise, with budgets sized for real SPA
// traffic (see src/middleware/apiRateLimit.js). Expensive endpoints keep
// their own, much tighter per-route limiters. Skipped in development.
app.use('/api/', createApiLimiter());

// Logging Middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body Parser Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
// O-68: reject any parsed body carrying Mongo operator ($...) or dotted keys
// before a route can drop it into a query filter. Must stay right after the
// body parsers.
app.use(rejectMongoOperators);

// Ensure upload directories exist (dev-only fallback path; production uses
// Cloudinary). Wrapped in try/catch because Render's container filesystem is
// read-only outside of writable mounts, and the dir doesn't need to exist there.
try {
  mkdirSync(path.join(process.cwd(), 'uploads', 'resumes'), { recursive: true });
} catch (err) {
  if (err.code !== 'EACCES' && err.code !== 'EROFS') throw err;
  // Read-only fs (Render container) — skip silently; production uses Cloudinary.
}

// NOTE: Local uploads served through authenticated endpoint only (not static)
// Cloudinary handles file serving in production

// #60: the HTTP server destroys a socket after HTTP_SOCKET_TIMEOUT_MS (30 s)
// without activity, and waiting on OpenAI produces none — a CV generation
// that legitimately took longer was cut (the proxy answered 502) while the
// server finished, burned the user's quota and saved a CV nobody saw. The
// routes that wait on AI synchronously get a longer socket timeout; the AI
// calls themselves are bounded below it (openaiService: 100 s deadline incl.
// retries → 504/503 with a clear message).
const AI_ROUTE_TIMEOUT_MS = parseInt(process.env.AI_ROUTE_TIMEOUT_MS || '150000', 10);
const LONG_RUNNING_ROUTES = new Set([
  'POST /api/cv/generate',
  'POST /api/users/parse-resume',
  'POST /api/quickusers/parse-cv',
  'POST /api/admin/backfill-user-embeddings',
]);
app.use((req, res, next) => {
  const routeKey = `${req.method} ${req.path.replace(/\/+$/, '').toLowerCase()}`;
  if (LONG_RUNNING_ROUTES.has(routeKey)) {
    req.setTimeout(AI_ROUTE_TIMEOUT_MS);
  }
  next();
});

// Dev-only: serve the local-disk CV fallback. Without Cloudinary credentials
// (local development only — production refuses uploads instead) the upload
// routes store `/uploads/resumes/<file>`, and the frontend opens those through
// GET /api/users/resume/:filename — which returns 410 since Round O-B, so the
// CV a developer just uploaded could never be viewed. Mounted only when
// NODE_ENV=development AND Cloudinary is not configured; everywhere else the
// users router keeps answering 410. Filenames are the multer names
// `resume-<24 hex>-<ms>-<random>.<ext>`; anything else is a 404, and the
// path is resolved inside uploads/resumes (no traversal).
if (process.env.NODE_ENV === 'development'
    && !(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)) {
  const RESUME_DIR = path.join(process.cwd(), 'uploads', 'resumes');
  const LOCAL_RESUME_NAME = /^resume-[a-f0-9]{24}-\d+-\d+\.(pdf|docx|doc)$/i;
  const RESUME_TYPES = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
  };
  app.get('/api/users/resume/:filename', (req, res) => {
    const name = req.params.filename;
    const m = LOCAL_RESUME_NAME.exec(name || '');
    if (!m) return res.status(404).json({ success: false, message: 'CV nuk u gjet' });
    res.setHeader('Content-Type', RESUME_TYPES[m[1].toLowerCase()]);
    res.setHeader('Content-Disposition', `inline; filename="${name}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(name, { root: RESUME_DIR }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ success: false, message: 'CV nuk u gjet' });
    });
  });
  logger.warn('DEV: serving local CV uploads at GET /api/users/resume/:filename (Cloudinary not configured)');
}

// Health Check Route — minimal in production, detailed in dev
app.get('/health', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const isHealthy = dbState === 1;

  // Check Redis status (non-blocking, app works without it)
  let redisStatus = 'not_configured';
  if (redis) {
    try {
      await redis.ping();
      redisStatus = 'connected';
    } catch {
      redisStatus = 'error';
    }
  }

  if (process.env.NODE_ENV === 'production') {
    return res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      message: isHealthy ? 'OK' : 'Degraded',
      timestamp: new Date().toISOString(),
      redis: redisStatus
    });
  }

  const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  const mem = process.memoryUsage();
  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    message: isHealthy ? 'PunaShqip API është aktiv' : 'PunaShqip API ka probleme',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime()),
    database: { status: dbStates[dbState] || 'unknown', readyState: dbState },
    redis: redisStatus,
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100
    }
  });
});

// Maintenance Mode Middleware — checks config and returns 503 for non-admin routes
app.use('/api', async (req, res, next) => {
  // Only allow admin access and essential auth during maintenance
  const maintenanceBypass = ['/auth/login', '/auth/refresh', '/auth/logout', '/admin', '/configuration'];
  if (maintenanceBypass.some(path => req.path.startsWith(path))) {
    return next();
  }
  try {
    const maintenanceMode = await SystemConfiguration.getSettingValue('maintenance_mode');
    if (maintenanceMode === true) {
      return res.status(503).json({
        success: false,
        message: 'Platforma është në mirëmbajtje. Ju lutemi provoni përsëri më vonë.'
      });
    }
  } catch {
    // If config check fails, allow the request through
  }
  next();
});

// Health-check routes (public, no auth, no rate limiter — for monitors)
app.use('/healthz', healthzRoutes);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes); // Admin routes first to avoid conflicts
app.use('/api/admin/embeddings', adminEmbeddingsRoutes); // Admin embeddings management
app.use('/api/reports', reportRoutes); // Reports routes (includes admin endpoints)
app.use('/api/bulk-notifications', bulkNotificationRoutes); // Bulk notification routes
app.use('/api/configuration', configurationRoutes); // Configuration management routes
app.use('/api/business-control', businessControlRoutes); // Business control panel routes
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stats', statsRoutes);
// O-69: /api/verification (request/verify/validate-token/resend/status) is
// NOT mounted. No page uses it — signup verifies via
// /api/auth/initiate-registration + /api/auth/register — yet, public, it let
// anyone send codes to any email/phone (mail-bombing from our domain, SMS
// cost) and revealed whether an identifier belonged to an account. The route
// file is kept for reference and is still unit-tested in isolation.
app.use('/api/quickusers', quickUserRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api/cv', cvRoutes);
app.use('/api/payments', paymentRoutes);

// Welcome Route
app.get('/', (req, res) => {
  res.json({
    message: 'Mirë se vini në PunaShqip API',
    version: '1.0.0',
    documentation: '/api/docs',
    health: '/health'
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Rruga nuk u gjet',
    path: req.originalUrl
  });
});

// Sentry error handler (must be before other error handlers)
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: 'Gabim në validim',
      errors
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} tashmë ekziston`
    });
  }

  // JWT Error
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token i pavlefshëm'
    });
  }

  // Default error - sanitize message in production
  const statusCode = err.statusCode || 500;
  const clientMessage = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Ndodhi një gabim. Ju lutemi provoni përsëri.'
    : err.message || 'Gabim i brendshëm i serverit';
  res.status(statusCode).json({
    success: false,
    message: clientMessage,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Track intervals for graceful shutdown cleanup
const activeIntervals = [];
// Round P: track in-flight async cron work so SIGTERM can await it before exit.
// Each cron pushes its promise on tick-start, removes on settle. Shutdown's
// Promise.allSettled prevents losing the email being sent right at shutdown.
const inflightCronWork = [];
const scheduler = createScheduler();

// Start Server (skipped in test mode — tests use supertest against the imported app)
if (process.env.NODE_ENV !== 'test') {
const server = app.listen(PORT, () => {
  logger.info(`advance.al API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);

  // Hourly/daily jobs run on the restart-safe scheduler (#63): their next run
  // time is persisted in Mongo (cronstates), so a job that is due runs shortly
  // after boot and one that just ran waits for its slot — Render restarts no
  // longer reset a daily job to "24h from now" (it never fired). Runs are
  // claimed atomically (no double-run across a deploy overlap); failed runs
  // retry after 30 min.
  const DAY = 24 * 60 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;
  scheduler
    .add({
      name: 'suspension-lift',
      intervalMs: 15 * 60 * 1000,
      run: async () => {
        const { User } = await import('./src/models/index.js');
        await User.checkExpiredSuspensions();
      },
    })
    .add({
      name: 'job-expiry',
      intervalMs: HOUR,
      run: async () => {
        const result = await Job.updateMany(
          { status: 'active', expiresAt: { $lt: new Date() }, isDeleted: { $ne: true } },
          { $set: { status: 'expired' } }
        );
        if (result.modifiedCount > 0) {
          logger.info(`Job expiry cron: marked ${result.modifiedCount} jobs as expired`);
        }
        // #117: the bulk expiry bypasses the post-save Location.jobCount hook
        // (and renewals re-increment) — recount from the live jobs every run
        // so the stored counters can't drift.
        await Job.recountLocationJobs();
      },
    })
    .add({
      name: 'data-retention',
      intervalMs: DAY,
      run: async () => {
        const { runRetentionPolicies } = await import('./src/services/dataRetention.js');
        await runRetentionPolicies();
      },
    })
    .add({
      // Permanently delete soft-deleted accounts after the 30-day retention
      // promised by the privacy policy.
      name: 'account-cleanup',
      intervalMs: DAY,
      run: async () => {
        const { purgeDeletedAccounts } = await import('./src/services/accountCleanup.js');
        const count = await purgeDeletedAccounts();
        logger.info(count > 0 ? `Account cleanup: ${count} accounts permanently deleted` : 'Account cleanup: no accounts to purge');
      },
    })
    .add({
      // Emails employers whose jobs are stuck in pending_payment (3 stages,
      // idempotent per stage).
      name: 'payment-reminders',
      intervalMs: parseInt(process.env.PAYMENT_REMINDER_INTERVAL_MS || `${HOUR}`, 10),
      run: async () => {
        const { sendDuePaymentReminders } = await import('./src/services/paymentReminderWorker.js');
        await sendDuePaymentReminders();
      },
    })
    .add({
      // Alerts admins about pending_payment jobs older than
      // PAYMENT_TIMEOUT_AFTER_DAYS (each job alerted once).
      name: 'payment-timeouts',
      intervalMs: parseInt(process.env.PAYMENT_TIMEOUT_INTERVAL_MS || `${DAY}`, 10),
      run: async () => {
        const { alertDuePaymentTimeouts } = await import('./src/services/paymentTimeoutWorker.js');
        await alertDuePaymentTimeouts();
      },
    });

  // Discord daily digest — at DISCORD_DIGEST_HOUR_UTC (default 07:00 UTC =
  // 09:00 Albania) every day; a day missed while the service was down is
  // sent at the next boot. No-op without DISCORD_WEBHOOK_DIGEST.
  if (process.env.DISCORD_WEBHOOK_DIGEST) {
    const digestAt = dailyAtUtcHour(parseInt(process.env.DISCORD_DIGEST_HOUR_UTC || '7', 10));
    scheduler.add({
      name: 'discord-digest',
      intervalMs: DAY,
      nextRunAfter: digestAt,
      firstRunAt: digestAt,
      run: async () => {
        const { runDailyDigest } = await import('./src/workers/discordDigestWorker.js');
        await runDailyDigest();
      },
    });
  }
  scheduler.start({ initialDelayMs: 20_000, jitterMs: 20_000 });

  // Job-alerts digest flush — runs every 15 min by default. Sends one consolidated
  // email per jobseeker whose oldest queued match crossed the digest window.
  // Round P: track each tick's promise in inflightCronWork so shutdown can await it
  // (previously SIGTERM during a flush could lose the email being sent right then).
  import('./src/services/jobAlertsDigest.js').then(({ flushPendingJobAlerts }) => {
    const flushIntervalMs = parseInt(process.env.JOB_ALERT_DIGEST_FLUSH_INTERVAL_MS || `${15 * 60 * 1000}`, 10);
    activeIntervals.push(setInterval(() => {
      const p = flushPendingJobAlerts().catch(err => logger.error('Job-alert digest flush error:', err.message));
      inflightCronWork.push(p);
      p.finally(() => {
        const i = inflightCronWork.indexOf(p);
        if (i !== -1) inflightCronWork.splice(i, 1);
      });
    }, flushIntervalMs));
  }).catch(() => {});

  // EmailOutbox drain — Round P. Picks up rows queued by resendEmailService on
  // transient send failure (Resend 429/5xx/network). Default 30s tick, max 4 sends
  // per tick (under Resend's 5 req/sec limit). Exponential backoff to 24h, then
  // dead-letters with Discord alert. Same inflight-tracking pattern as digest so
  // shutdown awaits the in-flight tick.
  import('./src/services/emailOutboxDrain.js').then(({ drainOnce, _internal }) => {
    activeIntervals.push(setInterval(() => {
      const p = drainOnce().catch(err => logger.error('EmailOutbox drain error:', err.message));
      inflightCronWork.push(p);
      p.finally(() => {
        const i = inflightCronWork.indexOf(p);
        if (i !== -1) inflightCronWork.splice(i, 1);
      });
    }, _internal.DRAIN_INTERVAL_MS));
  }).catch(() => {});

  // Embedding-retry worker — guarantees every Job/jobseeker/QuickUser
  // eventually reaches embedding.status='completed'. Runs every 10 min by
  // default, per-entity cooldown of 1h (so a permanently-broken record
  // is retried at most ~24×/day, not every tick).
  import('./src/services/embeddingRetryWorker.js').then(({ retryAll }) => {
    const interval = parseInt(process.env.EMBEDDING_RETRY_INTERVAL_MS || `${10 * 60 * 1000}`, 10);
    activeIntervals.push(setInterval(() => {
      retryAll().catch(err => logger.error('Embedding retry worker error:', err.message));
    }, interval));
  }).catch(() => {});

  // Payments reconcile worker (lost webhooks, stale checkouts, half-applied
  // activations, needsRefund digest). Default every 15 min. Never crashes.
  import('./src/services/payments/reconcileWorker.js').then(({ reconcileOnce }) => {
    const interval = parseInt(process.env.PAYMENTS_RECONCILE_INTERVAL_MS || `${15 * 60 * 1000}`, 10);
    activeIntervals.push(setInterval(() => {
      const p = reconcileOnce().catch(err => logger.error('Payments reconcile error:', err.message));
      inflightCronWork.push(p);
      p.finally(() => {
        const i = inflightCronWork.indexOf(p);
        if (i !== -1) inflightCronWork.splice(i, 1);
      });
    }, interval));
  }).catch(() => {});

  // Payments boot check (O-39): paid posting on + no usable provider in
  // production = employers can create jobs they can never publish. Fail
  // loudly (ERROR log + Discord/email alert + /healthz/payments flag).
  import('./src/services/payments/bootCheck.js').then(({ runPaymentsBootCheck }) => {
    runPaymentsBootCheck().catch(err => logger.error('Payments boot check error:', err.message));
  }).catch(() => {});

});

// Graceful Shutdown — must be AFTER server is defined
const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);
  // Clear periodic intervals so no NEW work starts.
  activeIntervals.forEach(id => clearInterval(id));
  scheduler.stop();
  // Round P: await any in-flight cron work (digest flush, outbox drain) up to 8s
  // so we don't drop the email being sent right at shutdown. After 8s we proceed
  // anyway; the 10s force-exit below is the final backstop.
  try {
    const settled = Promise.allSettled([...inflightCronWork, ...scheduler.inflight()]);
    const timeout = new Promise(resolve => setTimeout(resolve, 8000));
    await Promise.race([settled, timeout]);
  } catch (_) { /* never block shutdown on errors here */ }
  server.close(async () => {
    await mongoose.connection.close();
    logger.info('Process terminated');
    process.exit(0);
  });
  // Force exit after 10s if connections don't close
  setTimeout(() => process.exit(1), 10000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Global safety net — prevent unhandled errors from crashing the server silently
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { reason: reason?.message || reason });
  if (process.env.SENTRY_DSN) Sentry.captureException(reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception — shutting down', { error: err.message, stack: err.stack });
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  shutdown('uncaughtException');
});

// Socket inactivity timeout (30 s default — prevents hung connections). The
// AI routes above raise it for their own requests (AI_ROUTE_TIMEOUT_MS).
server.setTimeout(parseInt(process.env.HTTP_SOCKET_TIMEOUT_MS || '30000', 10));
} // end NODE_ENV !== 'test' guard

export default app;