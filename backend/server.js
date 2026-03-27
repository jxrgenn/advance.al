import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';

// Load environment variables early so SENTRY_DSN is available
dotenv.config();

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
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { mkdirSync } from 'fs';
import path from 'path';
import { connectDB } from './src/config/database.js';
import mongoose from 'mongoose';
import logger from './src/config/logger.js';

// Import routes (will create these next)
import authRoutes from './src/routes/auth.js';
import userRoutes from './src/routes/users.js';
import jobRoutes from './src/routes/jobs.js';
import applicationRoutes from './src/routes/applications.js';
import locationRoutes from './src/routes/locations.js';
import notificationRoutes from './src/routes/notifications.js';
import statsRoutes from './src/routes/stats.js';
import verificationRoutes from './src/routes/verification.js';
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
import { Job, SystemConfiguration } from './src/models/index.js';
import { redis } from './src/config/redis.js';

// Startup validation — fail fast if critical env vars are missing
const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
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
app.set('trust proxy', 1); // Trust first proxy hop (required for Render/PaaS — fixes rate limiting per real IP)
const PORT = process.env.PORT || 3001;

// Connect to Database — must complete before accepting requests
await connectDB();

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
    },
  },
}));

// CORS Configuration - Allow all origins in development
const corsOptions = {
  origin: function (origin, callback) {
    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // In production, block API requests without Origin header
    // (health check is not behind CORS, server-to-server tools don't need CORS)
    if (!origin) return callback(new Error('Not allowed by CORS'));
    
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

// Rate Limiting - Environment-aware configuration
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes default
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per window default
  message: {
    error: 'Shumë kërkesa nga kjo IP, ju lutemi provoni përsëri më vonë.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Skip rate limiting in development
  skip: (req) => process.env.NODE_ENV === 'development'
});

// Apply rate limiting to all API routes
app.use('/api/', limiter);

// Logging Middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body Parser Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Ensure upload directories exist
mkdirSync(path.join(process.cwd(), 'uploads', 'resumes'), { recursive: true });

// NOTE: Local uploads served through authenticated endpoint only (not static)
// Cloudinary handles file serving in production

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
app.use('/api/verification', verificationRoutes);
app.use('/api/quickusers', quickUserRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api/cv', cvRoutes);

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

// Start Server
const server = app.listen(PORT, () => {
  logger.info(`advance.al API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);

  // Periodic task: auto-lift expired user suspensions (every 15 minutes)
  import('./src/models/index.js').then(({ User }) => {
    activeIntervals.push(setInterval(async () => {
      try {
        await User.checkExpiredSuspensions();
      } catch (err) {
        logger.error('Error checking expired suspensions:', err.message);
      }
    }, 15 * 60 * 1000));
  }).catch(() => {});

  // Periodic task: expire active jobs past their expiresAt (every hour)
  activeIntervals.push(setInterval(async () => {
    try {
      const result = await Job.updateMany(
        { status: 'active', expiresAt: { $lt: new Date() }, isDeleted: { $ne: true } },
        { $set: { status: 'expired' } }
      );
      if (result.modifiedCount > 0) {
        logger.info(`Job expiry cron: marked ${result.modifiedCount} jobs as expired`);
      }
    } catch (err) {
      logger.error('Job expiry cron error:', err.message);
    }
  }, 60 * 60 * 1000)); // Every hour

  // Data retention: run daily
  import('./src/services/dataRetention.js').then(({ runRetentionPolicies }) => {
    activeIntervals.push(setInterval(() => {
      runRetentionPolicies().catch(err => logger.error('Retention error:', err.message));
    }, 24 * 60 * 60 * 1000));
    // Run once on startup after a delay
    setTimeout(() => {
      runRetentionPolicies().catch(err => logger.error('Retention error:', err.message));
    }, 60000);
  }).catch(() => {});

  // Account cleanup: permanently delete soft-deleted accounts after 30-day retention (privacy policy)
  import('./src/services/accountCleanup.js').then(({ purgeDeletedAccounts }) => {
    // Run daily
    activeIntervals.push(setInterval(async () => {
      try {
        const count = await purgeDeletedAccounts();
        if (count > 0) {
          logger.info(`Account cleanup: ${count} accounts permanently deleted`);
        } else {
          logger.info('Account cleanup: no accounts to purge');
        }
      } catch (err) {
        logger.error('Account cleanup error:', err.message);
      }
    }, 24 * 60 * 60 * 1000));
    // Run once on startup after a 30-second delay (don't block startup)
    setTimeout(async () => {
      try {
        const count = await purgeDeletedAccounts();
        if (count > 0) {
          logger.info(`Account cleanup: ${count} accounts permanently deleted`);
        } else {
          logger.info('Account cleanup: no accounts to purge');
        }
      } catch (err) {
        logger.error('Account cleanup error:', err.message);
      }
    }, 30000);
  }).catch(() => {});
});

// Graceful Shutdown — must be AFTER server is defined
const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);
  // Clear all periodic intervals
  activeIntervals.forEach(id => clearInterval(id));
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

// Request-level timeout (30s default — prevents hung connections)
server.setTimeout(30000);

export default app;