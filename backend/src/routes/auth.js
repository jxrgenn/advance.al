import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import validator from 'validator';

// Canonical email key for per-email rate limiters. Uses validator.normalizeEmail
// (the same call the validators below use) so that v.ictim+abc@gmail.com,
// vict.im@gmail.com, victim@googlemail.com etc. all share ONE rate-limit
// bucket — without this, an attacker iterates through ~64 dot permutations
// per Gmail address to multiply the per-email cap by 64×.  See ultrareview
// bug_004.
function emailRateLimitKey(req, prefix, fallbackPrefix) {
  const raw = (req.body?.email || '').toString().trim();
  if (!raw) return `${fallbackPrefix}:${ipKeyGenerator(req.ip)}`;
  const canonical = validator.normalizeEmail(raw) || raw.toLowerCase();
  return `${prefix}:${canonical}`;
}
import { User, QuickUser, Location } from '../models/index.js';
import { generateToken, generateRefreshToken, verifyToken, authenticate, currentTokenVersion, isStaleTokenVersion } from '../middleware/auth.js';
import { setAuthCookies, clearAuthCookies } from '../lib/authCookies.js';
import { stripHtml } from '../utils/sanitize.js';
import resendEmailService from '../lib/resendEmailService.js';
import userEmbeddingService from '../services/userEmbeddingService.js';
import notificationService from '../lib/notificationService.js';
import { redis, cacheGet, cacheSet, cacheDelete } from '../config/redis.js';
import logger from '../config/logger.js';
import { notifyDiscord, deriveRequestSignals } from '../services/discordNotifier.js';
import { isValidAlbanianPhone, ALBANIAN_PHONE_MESSAGE } from '../lib/phonePolicy.js';
import { formatAlbanianDateTime } from '../lib/albanianDate.js';
import { COMPANY_DESCRIPTION_MIN, COMPANY_DESCRIPTION_MAX, COMPANY_DESCRIPTION_MESSAGE, normalizeWebsite } from '../lib/companyProfile.js';

const router = express.Router();

// Pending registrations: Redis in production (survives deploys), Map fallback for dev without Redis
const pendingRegistrationsMap = new Map();
const PENDING_REG_MAX_SIZE = 10000;
const PENDING_REG_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const PENDING_REG_TTL_SECONDS = 600; // 10 minutes — the lifetime of a verification code
const MAX_VERIFICATION_ATTEMPTS = 5;

// O-54: wrong-code attempts are counted OUTSIDE the cached registration
// blob, with an atomic increment taken BEFORE the code is compared. The old
// read-modify-write on the blob let N parallel guesses all read attempts=0,
// so the 5-attempt cap never held. Redis INCR is atomic across instances;
// the Map fallback is updated synchronously (no await between read and
// write), which is atomic within this single-threaded process.
const verificationAttemptsMap = new Map(); // email -> { count, expiresAt }

// Periodic cleanup of expired entries from in-memory map
/* istanbul ignore next — 5-minute interval, never fires during a test run */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pendingRegistrationsMap) {
    if (entry.expiresAt < now) {
      pendingRegistrationsMap.delete(key);
    }
  }
  for (const [key, entry] of verificationAttemptsMap) {
    if (entry.expiresAt < now) {
      verificationAttemptsMap.delete(key);
    }
  }
}, PENDING_REG_CLEANUP_INTERVAL).unref();

const verificationAttemptsKey = (email) => `pending_reg_attempts:${email}`;

function incrementAttemptsInMemory(email) {
  const now = Date.now();
  const entry = verificationAttemptsMap.get(email);
  if (!entry || entry.expiresAt < now) {
    verificationAttemptsMap.set(email, { count: 1, expiresAt: now + PENDING_REG_TTL_SECONDS * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

// Records one verification attempt for `email` and returns its 1-based
// ordinal. Callers must reject (without comparing the code) when the
// ordinal exceeds MAX_VERIFICATION_ATTEMPTS.
async function recordVerificationAttempt(email) {
  /* istanbul ignore if — Redis not configured in test env; in-memory counter below is exercised */
  if (redis) {
    try {
      const count = await redis.incr(verificationAttemptsKey(email));
      if (count === 1) {
        await redis.expire(verificationAttemptsKey(email), PENDING_REG_TTL_SECONDS);
      }
      return count;
    } catch (err) {
      // Redis hiccup: keep counting in this process rather than failing open.
      logger.warn('Verification attempt INCR failed; counting in memory', { error: err.message });
    }
  }
  return incrementAttemptsInMemory(email);
}

async function resetVerificationAttempts(email) {
  /* istanbul ignore if — Redis not configured in test env */
  if (redis) {
    await cacheDelete(verificationAttemptsKey(email));
  }
  verificationAttemptsMap.delete(email);
}

async function getPendingRegistration(email) {
  // Try Redis first
  /* istanbul ignore if — Redis not configured in test env; in-memory fallback below is exercised */
  if (redis) {
    const data = await cacheGet(`pending_reg:${email}`);
    if (data) {
      // cacheGet may return a raw JSON string or parsed object depending on Upstash behavior
      return typeof data === 'string' ? JSON.parse(data) : data;
    }
  }
  // Fallback to in-memory (also checked when Redis returns null)
  const entry = pendingRegistrationsMap.get(email);
  if (entry && entry.expiresAt < Date.now()) {
    pendingRegistrationsMap.delete(email);
    return null;
  }
  return entry || null;
}

function setInMemoryPending(email, data) {
  // Evict expired entries if at capacity
  /* istanbul ignore next — capacity-eviction path; tests would need 10000+ pending registrations to trigger */
  if (pendingRegistrationsMap.size >= PENDING_REG_MAX_SIZE) {
    const now = Date.now();
    for (const [key, entry] of pendingRegistrationsMap) {
      if (entry.expiresAt < now) pendingRegistrationsMap.delete(key);
      if (pendingRegistrationsMap.size < PENDING_REG_MAX_SIZE) break;
    }
  }
  /* istanbul ignore if — capacity-eviction failure path; tests would need 10000+ pending registrations */
  if (pendingRegistrationsMap.size >= PENDING_REG_MAX_SIZE) {
    throw new Error('Registration system temporarily at capacity. Please try again later.');
  }
  pendingRegistrationsMap.set(email, { ...data, expiresAt: Date.now() + 10 * 60 * 1000 });
}

async function setPendingRegistration(email, data) {
  let redisOk = false;
  /* istanbul ignore if — Redis not configured in test env; in-memory fallback is exercised */
  if (redis) {
    try {
      await cacheSet(`pending_reg:${email}`, data, 600); // 10 min TTL
      redisOk = true;
    } catch {
      // Redis write failed — fall through to in-memory
    }
  }
  if (!redisOk) {
    setInMemoryPending(email, data);
  }
}

async function deletePendingRegistration(email) {
  // Clean both stores to avoid stale data
  /* istanbul ignore if — Redis not configured in test env */
  if (redis) {
    await cacheDelete(`pending_reg:${email}`);
  }
  pendingRegistrationsMap.delete(email);
  // The attempt counter is deliberately NOT reset here: requests already in
  // flight may still hold the deleted entry, and a reset would hand them a
  // fresh attempt budget. It is reset only when a new code is issued
  // (initiate-registration) or the account is created; otherwise it
  // expires with the code.
}

// Test-only access to the pending-registration store (same convention as
// dailyQuota.__resetMemoryForTests): tests assert what initiate-registration
// caches (O-53: a bcrypt hash, never the plaintext) and plant entries in the
// shape a previous release cached. Not reachable over HTTP.
export const __pendingRegistrationsForTests = {
  get: getPendingRegistration,
  set: setPendingRegistration,
};

// Helper: send verification code email (standalone, no user object needed)
async function sendVerificationCodeEmail(email, firstName, code) {
  const safeFirstName = stripHtml(firstName) || 'Përdorues';
  await resendEmailService.sendTransactionalEmail(
    email,
    'Kodi i Verifikimit — advance.al',
    `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
      <div style="max-width:600px;margin:0 auto;background:#fff;padding:20px;">
        <div style="text-align:center;margin-bottom:30px;padding:20px 0;border-bottom:2px solid #2563eb;">
          <h1 style="color:#2563eb;margin:0;font-size:28px;">advance.al</h1>
        </div>
        <div style="padding:30px;text-align:center;">
          <h2 style="color:#1f2937;">Verifikoni Email-in Tuaj</h2>
          <p style="color:#4b5563;">Përshëndetje ${safeFirstName}, kodi juaj i verifikimit është:</p>
          <div style="background:#f0f9ff;border:2px solid #2563eb;border-radius:12px;padding:20px;margin:20px auto;display:inline-block;">
            <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#2563eb;">${code}</span>
          </div>
          <p style="color:#6b7280;font-size:14px;">Ky kod është i vlefshëm për 10 minuta.</p>
        </div>
      </div>
    </body></html>`,
    `Kodi juaj i verifikimit: ${code}\nKy kod është i vlefshëm për 10 minuta.`
  );
}

// Legacy helper for existing verified users who need a new code (e.g. resend from profile)
async function sendVerificationCode(user) {
  if (user.emailVerified) return;
  const code = crypto.randomInt(100000, 999999).toString();
  const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
  user.emailVerificationToken = hashedCode;
  user.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);
  await user.save({ validateBeforeSave: false });
  await sendVerificationCodeEmail(user.email, user.profile?.firstName, code);
}

// Stricter rate limiting for auth routes.
// SKIP_RATE_LIMIT=true is honoured only outside production (tests/dev).
// In production the limiter ALWAYS runs — even if the env var is misset —
// to defend against credential stuffing.
//
// Note: server.js trusts only loopback / link-local / private-network hops
// (`trust proxy: 'loopback, linklocal, uniquelocal'`), so `req.ip` is the
// address Render's proxy saw and a client-written X-Forwarded-For is
// ignored. The validate.trustProxy check in express-rate-limit v8 is off
// because it flags any non-false trust proxy setting.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 10000 : 15, // 15 attempts per 15 min per IP in prod
  skip: () =>
    process.env.NODE_ENV !== 'production' &&
    process.env.SKIP_RATE_LIMIT === 'true',
  message: {
    success: false,
    message: 'Shumë tentativa kyçjeje, ju lutemi provoni përsëri pas 15 minutash.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// /auth/refresh used to share authLimiter (15 per 15 min per IP) with login.
// Every signed-in browser refreshes about every 15 minutes, so more than ~15
// active users behind one office / mobile-carrier NAT got 429 on refresh and
// were logged out. Refresh has its own budget, keyed per USER when a
// presented refresh token carries a valid signature (an attacker can only
// spend their own bucket — forging another user's key needs the secret),
// and per IP otherwise. Login / brute-force limits are unchanged.
const REFRESH_LIMIT_PER_USER = 60;  // ~1 refresh / 15 min per device is normal
const REFRESH_LIMIT_PER_IP = 300;   // tokenless / invalid: a JWT verify, no DB work
function refreshRateLimitKey(req) {
  if (req.refreshRateLimitKey) return req.refreshRateLimitKey;
  let key = null;
  for (const token of presentedRefreshTokens(req)) {
    try {
      const decoded = verifyToken(token, process.env.JWT_REFRESH_SECRET);
      if (decoded?.id) { key = `refresh-user:${decoded.id}`; break; }
    } catch { /* expired / forged → try the next copy, then fall back to IP */ }
  }
  req.refreshRateLimitKey = key || `refresh-ip:${ipKeyGenerator(req.ip)}`;
  return req.refreshRateLimitKey;
}
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: (req) => {
    if (process.env.NODE_ENV === 'development') return 10000;
    return refreshRateLimitKey(req).startsWith('refresh-user:') ? REFRESH_LIMIT_PER_USER : REFRESH_LIMIT_PER_IP;
  },
  keyGenerator: refreshRateLimitKey,
  skip: () =>
    process.env.NODE_ENV !== 'production' &&
    process.env.SKIP_RATE_LIMIT === 'true',
  message: {
    success: false,
    message: 'Shumë kërkesa për rinovimin e sesionit. Provoni përsëri pas pak minutash.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// /auth/check-email (signup forms, on blur) also had to stop spending the
// login budget. It answers "is this email registered", so it stays per-IP.
const checkEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10000 : 30,
  skip: () =>
    process.env.NODE_ENV !== 'production' &&
    process.env.SKIP_RATE_LIMIT === 'true',
  message: {
    success: false,
    message: 'Shumë kërkesa, ju lutemi provoni përsëri pas 15 minutash.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// bcrypt cost used by the User model's pre-save hook (models/User.js:
// bcrypt.genSalt(12)). initiate-registration pre-hashes with the same cost so
// the stored hash is indistinguishable from one the hook would produce.
const USER_PASSWORD_BCRYPT_ROUNDS = 12;

// Constant-time decoy hash used in the login handler when the requested email
// does not exist. Without this, an attacker can enumerate registered emails by
// timing the response: real users trigger bcrypt.compare (slow), unknown users
// short-circuit (fast). Generated once at module load.
const DECOY_PASSWORD_HASH = bcrypt.hashSync(
  'decoy-' + crypto.randomBytes(16).toString('hex'),
  parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12
);

// Per-email limiter for initiate-registration. The IP-based authLimiter alone
// can't stop an attacker rotating IPs to flood ONE victim's inbox with
// "verify your account" emails. Keying on the target email caps that to
// 5 mails / hour per address regardless of source IP.
const initiateRegistrationByEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => emailRateLimitKey(req, 'email', 'ip'),
  skip: () =>
    process.env.NODE_ENV !== 'production' &&
    process.env.SKIP_RATE_LIMIT === 'true',
  message: {
    success: false,
    message: 'Shumë tentativa regjistrimi për këtë email. Provoni përsëri pas një ore.'
  },
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// Per-account login lockout, on top of the per-IP authLimiter. Only FAILED
// attempts count (skipSuccessfulRequests: a response < 400 gives the attempt
// back) — counting successes used to lock out a user who simply logged in 10
// times in 15 minutes.
//
// Two buckets, so a stranger who knows an email cannot lock its owner out:
//   1. email+IP: 10 failures / 15 min. Guessing from one network locks only
//      that network out of that account; the owner on their own connection
//      is unaffected.
//   2. email (all IPs): 30 failures / 15 min — the brute-force backstop
//      against a botnet rotating IPs. Reaching it takes ≥3 source IPs (the
//      email+IP bucket stops each one at 10, authLimiter at 15).
// Both keys use the canonical email (Gmail dot/+tag variants share a bucket).
const LOGIN_FAILURES_PER_EMAIL_AND_IP = 10;
const LOGIN_FAILURES_PER_EMAIL = 30;
const loginRateLimitSkip = () =>
  process.env.NODE_ENV !== 'production' &&
  process.env.SKIP_RATE_LIMIT === 'true';
const loginByEmailAndIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: LOGIN_FAILURES_PER_EMAIL_AND_IP,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${emailRateLimitKey(req, 'login-email', 'login-ip')}|ip:${ipKeyGenerator(req.ip)}`,
  skip: loginRateLimitSkip,
  message: {
    success: false,
    message: 'Shumë tentativa të dështuara kyçjeje për këtë email. Provoni përsëri pas 15 minutash ose rivendosni fjalëkalimin.'
  },
  validate: { trustProxy: false, xForwardedForHeader: false },
});
const loginByEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: LOGIN_FAILURES_PER_EMAIL,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => emailRateLimitKey(req, 'login-email', 'login-ip'),
  skip: loginRateLimitSkip,
  message: {
    success: false,
    message: 'Shumë tentativa të dështuara kyçjeje për këtë llogari. Provoni përsëri pas 15 minutash ose rivendosni fjalëkalimin.'
  },
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// Per-email limiter for /forgot-password. Without this, an attacker
// rotating IPs could flood any victim's inbox with reset emails.
const forgotPasswordByEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => emailRateLimitKey(req, 'forgot-email', 'forgot-ip'),
  skip: () =>
    process.env.NODE_ENV !== 'production' &&
    process.env.SKIP_RATE_LIMIT === 'true',
  message: {
    success: false,
    message: 'Shumë tentativa rivendosjeje fjalëkalimi. Provoni përsëri pas një ore.'
  },
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// Pre-deploy audit, item #4 — per-user limiter on /change-password.
// An attacker with a stolen short-lived JWT could brute-force currentPassword
// against the bcrypt-slow comparePassword. Bcrypt cost slows it but does not
// bound the attempt count. Capping at 5/hr per authenticated user (and per
// IP for safety) is enough to break brute-force while never bothering a
// real user.
const changePasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id ? `change-pw-user:${req.user._id}` : `change-pw-ip:${ipKeyGenerator(req.ip)}`,
  skip: () =>
    process.env.NODE_ENV !== 'production' &&
    process.env.SKIP_RATE_LIMIT === 'true',
  message: {
    success: false,
    message: 'Shumë tentativa për të ndryshuar fjalëkalimin. Provoni përsëri pas një ore.'
  },
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// Registration validation rules
const registerValidation = [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email i pavlefshëm'),
  body('password')
    .isString()
    .withMessage('Fjalëkalimi duhet të jetë tekst')
    .bail()
    .isLength({ min: 8 })
    .withMessage('Fjalëkalimi duhet të ketë të paktën 8 karaktere')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Fjalëkalimi duhet të përmbajë të paktën një shkronjë të madhe, një të vogël dhe një numër'),
  body('userType')
    .isIn(['jobseeker', 'employer'])
    .withMessage('Lloji i përdoruesit duhet të jetë jobseeker ose employer'),
  // Type check (and .bail()) before the sanitizers: an object would
  // otherwise be stringified to "[object Object]" and accepted.
  body('firstName')
    .isString().withMessage('Emri duhet të ketë midis 2-50 karaktere').bail()
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 2, max: 50 })
    .withMessage('Emri duhet të ketë midis 2-50 karaktere'),
  body('lastName')
    .isString().withMessage('Mbiemri duhet të ketë midis 2-50 karaktere').bail()
    .trim()
    .customSanitizer(v => stripHtml(v))
    .isLength({ min: 2, max: 50 })
    .withMessage('Mbiemri duhet të ketë midis 2-50 karaktere'),
  // Length limits below mirror models/User.js. Anything the schema would
  // reject must be rejected HERE: /register only runs the schema validators
  // after the user has typed the emailed code, where a mismatch used to
  // surface as a 500 (O-55 class).
  //
  // Short employer signup (owner decision 2026-10-22): an employer gives only
  // first/last name, company name, email, mobile and password. City, industry,
  // size, description and website come later from the dashboard settings and
  // are required before the first job post (routes/jobs.js). They are still
  // validated here when an (older) client sends them.
  body('city')
    .if((value, { req }) => req.body?.userType !== 'employer' || (value !== undefined && value !== null && value !== ''))
    .isString()
    .withMessage('Qyteti është i detyrueshëm')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Qyteti është i detyrueshëm')
    .isLength({ max: 50 })
    .withMessage('Qyteti nuk mund të ketë më shumë se 50 karaktere'),
  // Employers: the company name is required (2-100 after trimming).
  body('companyName')
    .if(body('userType').equals('employer'))
    .exists({ values: 'falsy' }).withMessage('Emri i kompanisë është i detyrueshëm').bail()
    .isString().withMessage('Emri i kompanisë nuk është i vlefshëm').bail()
    .customSanitizer(v => stripHtml(v).trim())
    .isLength({ min: 2 })
    .withMessage('Emri i kompanisë duhet të ketë të paktën 2 karaktere')
    .isLength({ max: 100 })
    .withMessage('Emri i kompanisë nuk mund të ketë më shumë se 100 karaktere'),
  body('companyName')
    .if(body('userType').not().equals('employer'))
    .optional({ checkFalsy: true })
    .isString().withMessage('Emri i kompanisë nuk mund të ketë më shumë se 100 karaktere').bail()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Emri i kompanisë nuk mund të ketë më shumë se 100 karaktere'),
  body('industry')
    .optional({ checkFalsy: true })
    .isString().withMessage('Industria nuk mund të ketë më shumë se 50 karaktere').bail()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Industria nuk mund të ketë më shumë se 50 karaktere'),
  body('website')
    .optional({ checkFalsy: true })
    .isString().withMessage('Faqja e internetit nuk mund të ketë më shumë se 190 karaktere').bail()
    .trim()
    // 190, not 200: a bare domain gets "https://" (8 chars) prepended.
    .isLength({ max: 190 })
    .withMessage('Faqja e internetit nuk mund të ketë më shumë se 190 karaktere')
    .bail()
    // 140: only http(s) — "ftp://x" used to be stored as "https://ftp://x".
    .isURL({ protocols: ['http', 'https'] })
    .withMessage('Faqja e internetit duhet të jetë një adresë e vlefshme (p.sh. kompania.al)'),
  // Employers must give a mobile number (short signup keeps it: it is how the
  // team reaches the company during verification). Optional for jobseekers.
  body('phone')
    .if(body('userType').equals('employer'))
    .exists({ values: 'falsy' })
    .withMessage('Numri i celularit është i detyrueshëm'),
  body('phone')
    .optional({ checkFalsy: true })
    .isString().withMessage(ALBANIAN_PHONE_MESSAGE).bail()
    .custom(v => isValidAlbanianPhone(v))
    .withMessage(ALBANIAN_PHONE_MESSAGE),
  // Employer company description: optional at signup (dashboard settings),
  // but when sent it must meet the same 50-1000 rule as the dashboard and
  // PUT /users/profile (lib/companyProfile.js).
  body('description')
    .if(body('userType').equals('employer'))
    .optional({ checkFalsy: true })
    .isString().withMessage(COMPANY_DESCRIPTION_MESSAGE).bail()
    .trim()
    .isLength({ min: COMPANY_DESCRIPTION_MIN, max: COMPANY_DESCRIPTION_MAX })
    .withMessage(COMPANY_DESCRIPTION_MESSAGE),
];

// Login validation rules
const loginValidation = [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email i pavlefshëm'),
  body('password')
    .isString()
    .withMessage('Fjalëkalimi duhet të jetë tekst')
    .notEmpty()
    .withMessage('Fjalëkalimi është i detyrueshëm')
];

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Gabime në validim',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// @route   GET /api/auth/check-email
// @desc    Boolean availability check for an email. Returns {available} only —
//          no info about user type, status, or anything else. Used by
//          frontend signup forms to surface "already registered" inline
//          on blur (no need to wait for full submit). Rate-limited.
// @access  Public
router.get('/check-email', checkEmailLimiter, async (req, res) => {
  const raw = req.query.email;
  if (typeof raw !== 'string' || !/^\S+@\S+\.\S+$/.test(raw)) {
    return res.json({ available: true });  // do not leak validity info on invalid input
  }
  try {
    const email = raw.trim().toLowerCase();
    const exists = await User.exists({ email });
    res.json({ available: !exists });
  } catch (err) {
    logger.error('auth/check-email error', { error: err.message });
    res.status(500).json({ available: true });  // fail-open: never block on infra hiccup
  }
});

// @route   POST /api/auth/initiate-registration
// @desc    Step 1: Validate data, cache it, send verification code
// @access  Public
router.post('/initiate-registration', authLimiter, initiateRegistrationByEmailLimiter, registerValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email: rawEmail, password, userType, firstName, lastName, city, phone, companyName, industry, companySize, description, website, verificationMethod } = req.body;

    // Normalize email for consistent duplicate checking
    const email = rawEmail?.trim().toLowerCase();

    // QA Round 2 (D3): the user picks how to receive the code — email or SMS.
    // SMS requires a phone number to have been entered.
    const method = verificationMethod === 'sms' ? 'sms' : 'email';
    if (method === 'sms' && !phone) {
      return res.status(400).json({
        success: false,
        message: 'Numri i telefonit nevojitet për të marrë kodin me SMS'
      });
    }

    // Check if user already exists (use normalized email for accurate matching)
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Një përdorues me këtë email tashmë ekziston'
      });
    }

    // Employer-specific validation. Company name + mobile are required by the
    // validators above; size is optional (dashboard settings) but must be one
    // of the schema values when an older client still sends it.
    if (userType === 'employer' && companySize) {
      const validSizes = ['1-10', '11-50', '51-200', '201-500', '501+'];
      if (!validSizes.includes(companySize)) {
        return res.status(400).json({
          success: false,
          message: 'Madhësia e kompanisë duhet të jetë: 1-10, 11-50, 51-200, 201-500, ose 501+'
        });
      }
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] Verification code for ${email}: ${code}`);
    }

    // Normalize website: auto-prepend https:// for bare domains (case-insensitive scheme, 140)
    const normalizedWebsite = website?.trim() ? normalizeWebsite(website) : undefined;

    // Sanitize free-text fields to prevent stored XSS (companyName, industry, description)
    const safeCompanyName = companyName ? stripHtml(String(companyName)).trim() : companyName;
    const safeIndustry = industry ? stripHtml(String(industry)).trim() : industry;
    const safeDescription = description ? stripHtml(String(description)).trim() : description;

    // O-53: never cache the plaintext password — the pending store may be
    // Upstash Redis (a third party) and lives for 10 minutes. Hash it now
    // with the User model's cost; /register stores this hash as-is.
    const passwordHash = await bcrypt.hash(password, USER_PASSWORD_BCRYPT_ROUNDS);

    // Cache registration data with 10-minute TTL. A fresh code starts a
    // fresh wrong-attempt budget. An employer's city is optional (short
    // signup) — cached only when given.
    const safeCity = typeof city === 'string' && city.trim() ? city.trim() : undefined;
    await setPendingRegistration(email, {
      data: { email, passwordHash, userType, firstName, lastName, city: safeCity, phone, companyName: safeCompanyName, industry: safeIndustry || undefined, companySize: companySize || undefined, description: safeDescription || undefined, website: normalizedWebsite },
      hashedCode
    });
    await resetVerificationAttempts(email);

    // Send verification code via the chosen channel (don't fail registration
    // if delivery fails — the code is cached and can be resent).
    try {
      if (method === 'sms') {
        await notificationService.sendSMS(
          phone,
          `advance.al: kodi juaj i verifikimit është ${code}. Vlen për 10 minuta.`
        );
      } else {
        await sendVerificationCodeEmail(email, firstName, code);
      }
    } catch (sendErr) {
      logger.error(`Failed to send verification ${method}:`, sendErr.message);
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV] Verification code for ${email}: ${code}`);
      }
    }

    res.json({
      success: true,
      message: method === 'sms'
        ? 'Kodi i verifikimit u dërgua me SMS në numrin tuaj'
        : 'Kodi i verifikimit u dërgua në email-in tuaj'
    });
  } catch (error) {
    logger.error('Initiate registration error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Ndodhi një gabim. Ju lutemi provoni përsëri.'
    });
  }
});

// @route   POST /api/auth/register
// @desc    Step 2: Verify code and create account from cached data
// @access  Public
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, verificationCode } = req.body;

    if (!email || !verificationCode) {
      return res.status(400).json({
        success: false,
        message: 'Email dhe kodi i verifikimit janë të detyrueshëm'
      });
    }

    // O-55: a non-string email/code (number, array, object) used to reach
    // String#trim / crypto.update and surface as a 500. Issued codes are
    // always 6 digits (crypto.randomInt(100000, 999999)).
    if (typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email i pavlefshëm'
      });
    }
    if (typeof verificationCode !== 'string' || !/^\d{6}$/.test(verificationCode)) {
      return res.status(400).json({
        success: false,
        message: 'Kodi i verifikimit duhet të jetë 6 shifra'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Look up pending registration
    const pending = await getPendingRegistration(normalizedEmail);
    if (!pending) {
      return res.status(400).json({
        success: false,
        message: 'Kodi ka skaduar. Ju lutemi filloni regjistrimin përsëri.'
      });
    }

    // O-54: claim an attempt slot BEFORE comparing, so at most
    // MAX_VERIFICATION_ATTEMPTS comparisons ever run per issued code, no
    // matter how many requests arrive in parallel.
    const attempt = await recordVerificationAttempt(normalizedEmail);
    if (attempt > MAX_VERIFICATION_ATTEMPTS) {
      await deletePendingRegistration(normalizedEmail);
      return res.status(400).json({
        success: false,
        message: 'Shumë tentativa të gabuara. Ju lutemi filloni regjistrimin përsëri.'
      });
    }

    // Verify code (constant-time comparison to prevent timing attacks)
    const hashedInput = crypto.createHash('sha256').update(verificationCode).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(hashedInput, 'hex'), Buffer.from(pending.hashedCode, 'hex'))) {
      if (attempt >= MAX_VERIFICATION_ATTEMPTS) {
        await deletePendingRegistration(normalizedEmail);
        return res.status(400).json({
          success: false,
          message: 'Shumë tentativa të gabuara. Ju lutemi filloni regjistrimin përsëri.'
        });
      }
      return res.status(400).json({
        success: false,
        message: `Kodi i gabuar. Ju kanë mbetur ${MAX_VERIFICATION_ATTEMPTS - attempt} tentativa.`
      });
    }

    // Code verified — create user from cached data
    const { data } = pending;

    // Race condition check
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      await deletePendingRegistration(normalizedEmail);
      return res.status(400).json({
        success: false,
        message: 'Një përdorues me këtë email tashmë ekziston'
      });
    }

    // Build user object. `passwordHash` is the O-53 shape; `password`
    // (plaintext) can only come from a registration cached by the previous
    // release within the last 10 minutes — the pre-save hook hashes it.
    const preHashed = typeof data.passwordHash === 'string';

    // O-55: the region comes from the Location table (Kamëz → Tiranë,
    // Krujë → Durrës, ...). A city typed freely that isn't a known Location
    // keeps the previous behaviour (region = city). Employers registered
    // through the short signup have no city yet (dashboard settings).
    const hasCity = typeof data.city === 'string' && data.city.trim() !== '';
    const knownLocation = hasCity
      ? await Location.findOne({ city: data.city }).select('region').lean()
      : null;
    const region = knownLocation?.region || data.city;

    const userData = {
      email: data.email,
      password: preHashed ? data.passwordHash : data.password,
      userType: data.userType,
      emailVerified: true, // Already verified via code
      consentTracking: {
        tosAcceptedAt: new Date(),
        privacyAcceptedAt: new Date(),
        tosVersion: '2026-03',
        privacyVersion: '2026-03',
        ipAtConsent: req.ip || req.headers['x-forwarded-for']
      },
      profile: {
        firstName: data.firstName,
        lastName: data.lastName,
        ...(hasCity && { location: { city: data.city, region } })
      }
    };

    if (data.phone) userData.profile.phone = data.phone;

    if (data.userType === 'employer') {
      userData.profile.employerProfile = {
        companyName: data.companyName,
        ...(data.industry && { industry: data.industry }),
        ...(data.companySize && { companySize: data.companySize }),
        ...(data.description && { description: data.description }),
        ...(data.website && { website: data.website }),
        // Signup collects no company phone/WhatsApp, so those channels start
        // OFF — defaulting them ON blocked the first dashboard settings save
        // ("Shto numrin e WhatsApp") until a number was added. Email works
        // from day one (the account email).
        contactPreferences: {
          enablePhoneContact: false,
          enableWhatsAppContact: false,
          enableEmailContact: true,
          preferredContactMethod: 'form'
        },
        verified: false,
        verificationStatus: 'pending'
      };
    } else {
      userData.profile.jobSeekerProfile = {
        openToRemote: false,
        availability: 'immediately'
      };
    }

    const user = new User(userData);
    if (preHashed) {
      // The User pre-save hook hashes whenever `password` is modified, and on
      // a new document every set path counts as modified. Unmarking keeps
      // the bcrypt hash from being hashed a second time; validators and the
      // insert itself still include the field.
      user.unmarkModified('password');
    }
    try {
      await user.save();
    } catch (saveError) {
      if (saveError.code === 11000) {
        await deletePendingRegistration(normalizedEmail);
        return res.status(400).json({
          success: false,
          message: 'Një përdorues me këtë email tashmë ekziston'
        });
      }
      if (saveError.name === 'ValidationError') {
        // initiate-registration mirrors the schema limits, so this should
        // only be reachable with a registration cached before those checks
        // existed or a schema rule they don't cover yet. The cached data can
        // never become valid — make the user restart instead of a 500.
        logger.warn('Registration data failed schema validation', { fields: Object.keys(saveError.errors || {}) });
        await deletePendingRegistration(normalizedEmail);
        return res.status(400).json({
          success: false,
          message: 'Disa të dhëna të regjistrimit nuk janë të vlefshme. Ju lutemi filloni regjistrimin përsëri.'
        });
      }
      throw saveError;
    }
    await deletePendingRegistration(normalizedEmail);
    await resetVerificationAttempts(normalizedEmail);

    // Generate tokens
    const payload = { id: user._id, email: user.email, userType: user.userType, tv: currentTokenVersion(user) };
    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await user.addRefreshToken(refreshToken);
    await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });

    // Convert QuickUser if one exists with this email (async, non-blocking)
    setImmediate(async () => {
      try {
        const existingQuickUser = await QuickUser.findOne({ email: normalizedEmail, convertedToFullUser: false });
        if (existingQuickUser) {
          await existingQuickUser.convertToFullUser(user._id);
          // PII hygiene (pre-deploy audit, item #2): don't include the
          // email address in this log line. quickUserId + userId is
          // enough to correlate; the email is just noise to log aggregators.
          logger.info('QuickUser converted to full user', { quickUserId: existingQuickUser._id, userId: user._id });
        }
      } catch (err) {
        logger.error('QuickUser conversion error:', err.message);
      }

      // Send welcome email
      try {
        if (data.userType === 'jobseeker') {
          await resendEmailService.sendFullAccountWelcomeEmail(user);
          await userEmbeddingService.generateJobSeekerEmbedding(user._id).catch(() => {});
          // After embedding, find and notify about matching existing jobs
          await notificationService.notifyUserAboutMatchingJobs({ type: 'jobseeker', userId: user._id }).catch(err => {
            logger.error('Jobseeker matching jobs notification error:', err.message);
          });
        } else {
          await resendEmailService.sendEmployerWelcomeEmail(user);
        }
      } catch (err) {
        logger.error('Welcome email error:', err.message);
      }
    });

    // F-10 fix: invalidate admin:dashboard cache (user count changed)
    cacheDelete('admin:dashboard').catch(() => {});

    notifyDiscord({
      channel: 'signups',
      title: data.userType === 'employer' ? '💼 New employer signup' : '👤 New jobseeker signup',
      fields: [
        { name: 'Email', value: user.email, inline: true },
        { name: 'Name', value: `${user.profile.firstName} ${user.profile.lastName}`, inline: true },
        ...(data.userType === 'employer' ? [
          { name: 'Company', value: user.profile.employerProfile?.companyName || '—', inline: true },
          { name: 'Industry', value: user.profile.employerProfile?.industry || '—', inline: true },
          { name: 'Website', value: user.profile.employerProfile?.website || '—', inline: true },
          { name: 'Verification', value: user.profile.employerProfile?.verificationStatus || 'pending', inline: true },
        ] : [
          { name: 'City', value: user.profile.location?.city || '—', inline: true },
        ]),
        ...deriveRequestSignals(req),
      ],
      dedupKey: `signup:${user._id}`,
    });

    // Round O-F: set httpOnly cookies on top of the existing JSON token
    // response. Existing clients keep working (they read from the JSON body
    // into localStorage); browsers also get the cookies and the next
    // request automatically attaches them.
    setAuthCookies(res, { token, refreshToken });

    res.status(201).json({
      success: true,
      message: data.userType === 'employer'
        ? 'Llogaria u krijua me sukses. Ju lutemi prisni verifikimin nga administratori.'
        : 'Llogaria u krijua me sukses.',
      data: {
        user: {
          id: user._id,
          email: user.email,
          userType: user.userType,
          status: user.status,
          profile: user.profile
        },
        token,
        refreshToken
      }
    });

  } catch (error) {
    logger.error('Registration error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në krijimin e llogarisë'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', authLimiter, loginByEmailAndIpLimiter, loginByEmailLimiter, loginValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password +tokenVersion');

    if (!user) {
      // Constant-time defense: run bcrypt against a decoy hash so the response
      // time matches a real password check. Prevents email enumeration by timing.
      await bcrypt.compare(password, DECOY_PASSWORD_HASH);
      return res.status(401).json({
        success: false,
        message: 'Email ose fjalëkalim i gabuar'
      });
    }

    // Validate password BEFORE revealing any account-state info.
    // This prevents account-enumeration via the suspended/banned/deleted/pending
    // response paths — anyone hitting wrong password gets the generic 401 regardless.
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Email ose fjalëkalim i gabuar'
      });
    }

    // Credentials confirmed — now safe to surface account-state details.
    if (user.isDeleted || user.status === 'deleted') {
      return res.status(401).json({
        success: false,
        message: 'Kjo llogari është çaktivizuar'
      });
    }

    // Check and update suspension status (auto-lift expired suspensions)
    await user.checkSuspensionStatus();

    if (user.status === 'suspended') {
      const expiryDate = user.suspensionDetails.expiresAt;
      const expiryText = expiryDate
        ? ` deri më ${formatAlbanianDateTime(expiryDate)}`
        : ' përgjithmonë';

      return res.status(401).json({
        success: false,
        message: `Llogaria juaj është pezulluar${expiryText}. Arsyeja: ${user.suspensionDetails.reason || 'Shkelje e rregullave të platformës'}`
      });
    }

    if (user.status === 'banned') {
      return res.status(401).json({
        success: false,
        message: `Llogaria juaj është mbyllur përgjithmonë. Arsyeja: ${user.suspensionDetails.reason || 'Shkelje e rëndë e rregullave të platformës'}`
      });
    }

    // O-52 (owner ruling): employers in status 'pending_verification' CAN log
    // in — /register already signs them in and authenticate/refresh accept
    // the status. Publishing stays gated by requireVerifiedEmployer.

    // Generate tokens (tv = session generation, O-14)
    const payload = {
      id: user._id,
      email: user.email,
      userType: user.userType,
      tv: currentTokenVersion(user)
    };

    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Store refresh token and update last login
    await user.addRefreshToken(refreshToken);
    await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });

    // Use toJSON() which strips password, tokens, and other sensitive fields
    const userResponse = user.toJSON();
    delete userResponse.tokenVersion; // selected above only to mint the tokens

    // Round O-F: set httpOnly cookies in parallel with the JSON body.
    setAuthCookies(res, { token, refreshToken });

    res.json({
      success: true,
      message: 'Kyçja u krye me sukses',
      data: {
        user: userResponse,
        token,
        refreshToken
      }
    });

  } catch (error) {
    logger.error('Login error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në kyçje'
    });
  }
});

// Distinct, string-typed refresh tokens presented on this request (cookie
// first, then body).
function presentedRefreshTokens(req) {
  const tokens = [req.cookies?.refresh_token, req.body?.refreshToken]
    .filter((t) => typeof t === 'string' && t.length > 0);
  return [...new Set(tokens)];
}

const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');

// O-14: invalidates every session of a user atomically — increments the
// session generation embedded in tokens as `tv` and clears the refresh-token
// allow-list in the same update. Returns the new generation, for minting the
// one session that should survive (change-password's own device).
async function endAllSessions(userId) {
  const updated = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { tokenVersion: 1 }, $set: { refreshTokens: [] } },
    { new: true }
  ).select('+tokenVersion').lean();
  return currentTokenVersion(updated);
}

// Exchanges one raw refresh token for a new pair. Returns { user, token,
// refreshToken } on success, { message } for a rejection, or { error } for a
// JWT failure the caller maps to its expired/invalid responses.
//
// The rotation is ONE conditional update: the presented token's hash is
// replaced in place only if it is still on the allow-list. Two requests
// presenting the same token can therefore never both succeed (no forking),
// and a refresh racing a password change/reset either finds the list already
// cleared (→ 401) or mints tokens of the old session generation (tv), which
// authenticate rejects once the change has bumped it (O-14).
async function rotateRefreshToken(rawToken) {
  let decoded;
  try {
    decoded = verifyToken(rawToken, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    return { error };
  }
  const user = await User.findById(decoded.id).select('+tokenVersion');
  if (!user || user.isDeleted || user.status === 'deleted') {
    return { message: 'Përdoruesi nuk u gjet' };
  }
  if (isStaleTokenVersion(decoded, user)) {
    return { message: 'Refresh token i revokuar' };
  }

  const payload = { id: user._id, email: user.email, userType: user.userType, tv: currentTokenVersion(user) };
  const token = generateToken(payload);
  const refreshToken = generateRefreshToken(payload);
  const rotated = await User.updateOne(
    { _id: user._id, 'refreshTokens.token': sha256Hex(rawToken) },
    { $set: { 'refreshTokens.$': { token: sha256Hex(refreshToken), createdAt: new Date() } } }
  );
  if (rotated.matchedCount !== 1) {
    return { message: 'Refresh token i revokuar' };
  }
  return { user, token, refreshToken };
}

// @route   POST /api/auth/refresh
// @desc    Refresh access token using refresh token
// @access  Public
router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    // Round O-F: accept the refresh token from the httpOnly `refresh_token`
    // cookie and/or the request body. O-40: when both arrive they can differ
    // — browsers that ran the old frontend (refresh without credentials)
    // still hold a rotated-out cookie next to the live localStorage token.
    // Try each distinct candidate, cookie first, so one stale copy cannot end
    // a live session. Each candidate must still verify and be unrevoked.
    const candidates = presentedRefreshTokens(req);

    if (candidates.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token është i detyrueshëm'
      });
    }

    let rotated = null;
    let firstFailure = null;
    for (const candidate of candidates) {
      const result = await rotateRefreshToken(candidate);
      if (result.user) {
        rotated = result;
        break;
      }
      firstFailure = firstFailure || result;
    }

    if (!rotated) {
      if (firstFailure.error) throw firstFailure.error;
      return res.status(401).json({
        success: false,
        message: firstFailure.message
      });
    }

    const { token: newToken, refreshToken: newRefreshToken } = rotated;

    // Round O-F: update cookies with the rotated pair.
    setAuthCookies(res, { token: newToken, refreshToken: newRefreshToken });

    res.json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token ka skaduar, ju lutemi kyçuni përsëri'
      });
    }

    logger.error('Token refresh error:', error.message);
    res.status(401).json({
      success: false,
      message: 'Refresh token i pavlefshëm'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get('/me', authenticate, async (req, res) => {
  try {
    // Fetch the most recent user data from database
    const user = await User.findById(req.user._id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    res.json({
      success: true,
      data: {
        user: user
      }
    });
  } catch (error) {
    logger.error('Get current user error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në marrjen e të dhënave të përdoruesit'
    });
  }
});

// @route   PUT /api/auth/change-password
// QA Round 2 (C3): security notice e-mail sent after a password is
// changed or reset, so the account owner is alerted if it wasn't them.
// TODO(prod): emails currently route to the shared test inbox via
// resendEmailService.getRecipientEmail — switch to real recipients at launch.
function sendPasswordChangedNotice(user) {
  setImmediate(async () => {
    try {
      const name = user.profile?.firstName || '';
      // Albanian month names + Tirana time without relying on the server's ICU data.
      const when = formatAlbanianDateTime(new Date());
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
          <h2 style="color:#2563eb">Fjalëkalimi juaj u ndryshua</h2>
          <p>Përshëndetje ${name},</p>
          <p>Fjalëkalimi i llogarisë suaj në advance.al u ndryshua më <strong>${when}</strong>.</p>
          <p>Nëse këtë ndryshim e bëtë ju, nuk nevojitet asnjë veprim.</p>
          <p style="color:#b91c1c"><strong>Nëse nuk ishit ju</strong>, kontaktoni menjëherë në
          <a href="mailto:info@advance.al">info@advance.al</a> — llogaria juaj mund të jetë komprometuar.</p>
        </div>`;
      const text = `Fjalëkalimi i llogarisë suaj në advance.al u ndryshua më ${when}. `
        + `Nëse nuk ishit ju, kontaktoni info@advance.al menjëherë.`;
      await resendEmailService.sendTransactionalEmail(
        user.email,
        'Fjalëkalimi juaj u ndryshua — advance.al',
        html,
        text,
        { tags: ['password-changed'] }
      );
    } catch (error) {
      logger.error('Error sending password-changed notice:', error.message);
    }
  });
}

// @desc    Change password (authenticated user)
// @access  Private
router.put('/change-password', authenticate, changePasswordLimiter, [
  body('currentPassword')
    .isString()
    .withMessage('Fjalëkalimi aktual është i detyrueshëm')
    .bail()
    .notEmpty()
    .withMessage('Fjalëkalimi aktual është i detyrueshëm'),
  body('newPassword')
    .isString()
    .withMessage('Fjalëkalimi i ri duhet të jetë tekst')
    .bail()
    .isLength({ min: 8 })
    .withMessage('Fjalëkalimi i ri duhet të ketë të paktën 8 karaktere')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Fjalëkalimi i ri duhet të përmbajë të paktën një shkronjë të madhe, një të vogël dhe një numër')
], handleValidationErrors, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Fjalëkalimi aktual nuk është i saktë'
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Fjalëkalimi i ri duhet të jetë i ndryshëm nga fjalëkalimi aktual'
      });
    }

    user.password = newPassword;
    await user.save();

    // F-21 / O-14: end every session, on every device, in ONE atomic step —
    // bump the session generation (all access and refresh tokens carrying the
    // old `tv` stop verifying, with no 1-second window) and drop every stored
    // refresh token (a refresh racing this finds its token gone → 401).
    const sessionTv = await endAllSessions(user._id);

    // O-14: the device that changed the password must keep its session.
    // Without a fresh pair it was silently logged out when its access token
    // expired (its refresh token had just been revoked above).
    const payload = { id: user._id, email: user.email, userType: user.userType, tv: sessionTv };
    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);
    await user.addRefreshToken(refreshToken);
    setAuthCookies(res, { token, refreshToken });

    sendPasswordChangedNotice(user);

    res.json({
      success: true,
      message: 'Fjalëkalimi u ndryshua me sukses',
      data: {
        token,
        refreshToken
      }
    });
  } catch (error) {
    logger.error('Change password error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në ndryshimin e fjalëkalimit'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Request password reset email
// @access  Public
router.post('/forgot-password', authLimiter, forgotPasswordByEmailLimiter, [
  body('email').trim().isEmail().normalizeEmail().withMessage('Email i pavlefshëm')
], handleValidationErrors, async (req, res) => {
  try {
    const { email } = req.body;

    // Per-email rate limit: max 3 password reset requests per email per hour
    // Prevents inbox flooding and brute-force token enumeration
    const resetKey = `pwd_reset:${email}`;
    const resetCount = await cacheGet(resetKey);
    if (resetCount && resetCount >= 3) {
      // Still return success to avoid email enumeration
      return res.json({
        success: true,
        message: 'Nëse kjo adresë emaili ekziston, do të merrni një link për rivendosjen e fjalëkalimit.'
      });
    }
    await cacheSet(resetKey, (resetCount || 0) + 1, 3600); // 1 hour TTL

    // Always return success to avoid email enumeration
    const user = await User.findOne({ email, isDeleted: { $ne: true } });

    if (user) {
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

      user.passwordResetToken = hashedToken;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save({ validateBeforeSave: false });

      // Build reset URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

      // Dev-only log so tests + local debugging can capture token (matches verification.js pattern)
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);
      }

      // Send email (non-blocking)
      setImmediate(async () => {
        try {
          await resendEmailService.sendPasswordResetEmail(user, resetUrl);
        } catch (error) {
          logger.error('Error sending password reset email:', error.message);
        }
      });
    }

    // Always return same response for security
    res.json({
      success: true,
      message: 'Nëse kjo adresë emaili ekziston, do të merrni një link për rivendosjen e fjalëkalimit.'
    });
  } catch (error) {
    logger.error('Forgot password error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në dërgimin e emailit për rivendosjen e fjalëkalimit'
    });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password using token
// @access  Public
router.post('/reset-password', authLimiter, [
  body('token').isString().withMessage('Token-i është i detyrueshëm').bail().notEmpty().withMessage('Token-i është i detyrueshëm'),
  body('password')
    .isString()
    .withMessage('Fjalëkalimi duhet të jetë tekst')
    .bail()
    .isLength({ min: 8 })
    .withMessage('Fjalëkalimi duhet të ketë të paktën 8 karaktere')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Fjalëkalimi duhet të përmbajë të paktën një shkronjë të madhe, një të vogël dhe një numër')
], handleValidationErrors, async (req, res) => {
  try {
    const { token, password } = req.body;

    // Hash the provided token and find user
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
      isDeleted: { $ne: true }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token-i i rivendosjes është i pavlefshëm ose ka skaduar'
      });
    }

    // Set new password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // End every session — refresh tokens AND live access tokens (O-14).
    await endAllSessions(user._id);

    sendPasswordChangedNotice(user);

    res.json({
      success: true,
      message: 'Fjalëkalimi u rivendos me sukses. Tani mund të kyçeni me fjalëkalimin e ri.'
    });
  } catch (error) {
    logger.error('Reset password error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në rivendosjen e fjalëkalimit'
    });
  }
});

// @route   POST /api/auth/send-verification
// @desc    Send email verification code to current user
// @access  Private
router.post('/send-verification', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Përdoruesi nuk u gjet' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ success: false, message: 'Email-i juaj është tashmë i verifikuar' });
    }

    await sendVerificationCode(user);

    res.json({ success: true, message: 'Kodi i verifikimit u dërgua në emailin tuaj' });
  } catch (error) {
    logger.error('Send verification error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në dërgimin e kodit të verifikimit' });
  }
});

// @route   POST /api/auth/verify-email
// @desc    Verify email with code
// @access  Private
router.post('/verify-email', authenticate, [
  body('code')
    .isString().withMessage('Kodi duhet të jetë 6 shifra').bail()
    .isLength({ min: 6, max: 6 }).withMessage('Kodi duhet të jetë 6 shifra')
    .isNumeric().withMessage('Kodi duhet të jetë 6 shifra')
], handleValidationErrors, async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Përdoruesi nuk u gjet' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ success: false, message: 'Email-i juaj është tashmë i verifikuar' });
    }

    if (!user.emailVerificationToken || !user.emailVerificationExpires) {
      return res.status(400).json({ success: false, message: 'Nuk ka kod verifikimi aktiv. Kërkoni një kod të ri.' });
    }

    if (new Date() > user.emailVerificationExpires) {
      return res.status(400).json({ success: false, message: 'Kodi i verifikimit ka skaduar. Kërkoni një kod të ri.' });
    }

    const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
    if (hashedCode !== user.emailVerificationToken) {
      return res.status(400).json({ success: false, message: 'Kodi i verifikimit është i gabuar' });
    }

    // Mark email as verified
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: 'Email-i juaj u verifikua me sukses!' });
  } catch (error) {
    logger.error('Verify email error:', error.message);
    res.status(500).json({ success: false, message: 'Gabim në verifikimin e emailit' });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', authenticate, async (req, res) => {
  try {
    // Round O-F: refresh tokens may arrive in the cookie and/or the body.
    // O-40: revoke EVERY copy presented. Preferring the cookie alone revoked
    // a stale rotated-out cookie while the live localStorage token survived
    // logout for its full 7-day lifetime.
    const refreshTokens = presentedRefreshTokens(req);
    const user = await User.findById(req.user._id);

    if (user && refreshTokens.length > 0) {
      for (const token of refreshTokens) {
        await user.removeRefreshToken(token);
      }
    } else if (user) {
      // If no specific token provided, revoke all
      await user.removeAllRefreshTokens();
    }

    // Round O-F: clear the auth cookies even if DB revocation failed
    // partial — the browser session is over either way.
    clearAuthCookies(res);

    res.json({
      success: true,
      message: 'Daljet u krye me sukses'
    });
  } catch (error) {
    // Even if revocation fails, acknowledge logout to avoid blocking the user
    clearAuthCookies(res);
    res.json({
      success: true,
      message: 'Daljet u krye me sukses'
    });
  }
});

export default router;