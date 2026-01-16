# Winston Logging & Production Monitoring Implementation Plan

**Project:** Albania JobFlow (Advance.al)
**Date:** January 16, 2026
**Implementation Time:** ~6-8 hours
**Priority:** 🔴 HIGH (Required for production)

---

## 🎯 Goals

1. **Centralized Logging** - Replace console.log with structured Winston logging
2. **Log Levels** - Implement info, warn, error, debug levels
3. **Log Persistence** - Store logs in files with rotation
4. **Production Monitoring** - Add Sentry error tracking + UptimeRobot
5. **Real-time Alerts** - Get notified of critical errors

---

## 📦 Phase 1: Winston Setup (2 hours)

### 1.1 Install Dependencies

```bash
cd backend
npm install winston winston-daily-rotate-file
npm install --save-dev @types/winston
```

### 1.2 Create Logger Configuration

**File:** `backend/src/config/logger.js`

```javascript
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development (pretty and colorized)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    // Add metadata if exists
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }

    return msg;
  })
);

// Create transports
const transports = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
    level: process.env.LOG_LEVEL || 'info'
  })
);

// File transports (only in production or if enabled)
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_FILE_LOGS === 'true') {
  // Error logs - separate file
  transports.push(
    new DailyRotateFile({
      filename: path.join('logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m', // Rotate when file reaches 20MB
      maxFiles: '14d', // Keep logs for 14 days
      format: logFormat
    })
  );

  // Combined logs - all levels
  transports.push(
    new DailyRotateFile({
      filename: path.join('logs', 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '7d', // Keep for 7 days
      format: logFormat
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join('logs', 'exceptions.log') })
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join('logs', 'rejections.log') })
  ]
});

// Create stream for Morgan (HTTP request logging)
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

export default logger;
```

### 1.3 Create Logs Directory

```bash
mkdir backend/logs
echo "logs/" >> backend/.gitignore
```

### 1.4 Update Environment Variables

**File:** `backend/.env`

```bash
# Logging Configuration
LOG_LEVEL=info                    # debug, info, warn, error
ENABLE_FILE_LOGS=true             # Enable file logging in development
```

---

## 🔄 Phase 2: Replace console.log (3 hours)

### 2.1 Import Logger in All Files

Replace:
```javascript
console.log('✅ Success');
console.error('❌ Error:', error);
console.warn('⚠️  Warning');
```

With:
```javascript
import logger from '../config/logger.js';

logger.info('✅ Success');
logger.error('❌ Error:', { error });
logger.warn('⚠️ Warning');
```

### 2.2 Update Key Files

#### **server.js** - HTTP Logging
```javascript
import logger from './src/config/logger.js';
import morgan from 'morgan';

// Replace morgan('dev') with structured logging
app.use(morgan('combined', { stream: logger.stream }));

// Log server startup
const server = app.listen(PORT, () => {
  logger.info(`🚀 PunaShqip API running on port ${PORT}`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version
  });
});
```

#### **database.js** - Connection Logging
```javascript
import logger from '../config/logger.js';

export const connectDB = async () => {
  try {
    logger.info('🔌 Attempting to connect to MongoDB...');

    const conn = await mongoose.connect(mongoUri, {...});

    logger.info(`🍃 MongoDB Connected`, {
      host: conn.connection.host,
      database: conn.connection.name
    });

    mongoose.connection.on('error', (err) => {
      logger.error('🔴 MongoDB connection error', { error: err });
    });

  } catch (error) {
    logger.error('🔴 Failed to connect to MongoDB', { error });
    process.exit(1);
  }
};
```

#### **auth middleware** - Authentication Logging
```javascript
import logger from '../config/logger.js';

export const authenticate = async (req, res, next) => {
  try {
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      logger.warn('Authentication failed: User not found', {
        userId: decoded.id,
        ip: req.ip
      });
      return res.status(401).json({...});
    }

    logger.debug('User authenticated successfully', {
      userId: user._id,
      userType: user.userType,
      email: user.email
    });

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error', { error, ip: req.ip });
    res.status(500).json({...});
  }
};
```

#### **Routes** - API Endpoint Logging
```javascript
import logger from '../config/logger.js';

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    logger.info('Login attempt', { email, ip: req.ip });

    const user = await User.findOne({ email });

    if (!user || !(await user.comparePassword(password))) {
      logger.warn('Login failed: Invalid credentials', { email, ip: req.ip });
      return res.status(401).json({...});
    }

    logger.info('Login successful', {
      userId: user._id,
      email: user.email,
      userType: user.userType,
      ip: req.ip
    });

    res.json({ success: true, user, token });
  } catch (error) {
    logger.error('Login error', { error, email: req.body.email });
    res.status(500).json({...});
  }
});
```

### 2.3 Files to Update (Complete List)

**Backend:**
- ✅ `server.js` - Server startup, HTTP logging
- ✅ `src/config/database.js` - Database connections
- ✅ `src/middleware/auth.js` - Authentication
- ✅ `src/routes/auth.js` - Auth endpoints
- ✅ `src/routes/jobs.js` - Job endpoints
- ✅ `src/routes/applications.js` - Application endpoints
- ✅ `src/routes/users.js` - User endpoints
- ✅ `src/routes/admin.js` - Admin endpoints
- ✅ `src/lib/resendEmailService.js` - Email service
- ✅ `src/lib/notificationService.js` - Notifications

**Priority Order:**
1. High traffic routes (jobs, auth, applications)
2. Critical services (database, email)
3. Admin/utility routes

---

## 🚨 Phase 3: Sentry Error Tracking (1 hour)

### 3.1 Create Sentry Account

1. Go to https://sentry.io/signup/
2. Choose "Free" plan (5k errors/month)
3. Create new project: "Albania JobFlow Backend"
4. Copy DSN key

### 3.2 Install Sentry

```bash
cd backend
npm install @sentry/node @sentry/profiling-node
```

### 3.3 Configure Sentry

**File:** `backend/src/config/sentry.js`

```javascript
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

export const initSentry = (app) => {
  if (!process.env.SENTRY_DSN) {
    console.warn('⚠️  SENTRY_DSN not set - error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: 0.1, // Profile 10% of transactions
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app }),
      new ProfilingIntegration(),
    ],
    // Don't capture errors in development
    enabled: process.env.NODE_ENV === 'production',
  });

  // Request handler must be first middleware
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
};

export const sentryErrorHandler = Sentry.Handlers.errorHandler();
```

### 3.4 Integrate with Express

**File:** `backend/server.js`

```javascript
import { initSentry, sentryErrorHandler } from './src/config/sentry.js';

const app = express();

// Initialize Sentry FIRST
initSentry(app);

// ... other middleware ...

// Sentry error handler (BEFORE your error handler)
app.use(sentryErrorHandler);

// Your error handler (AFTER Sentry)
app.use((err, req, res, next) => {
  logger.error('Global error handler', { error: err, url: req.url });

  // Sentry already captured the error
  res.status(err.statusCode || 500).json({...});
});
```

### 3.5 Update Environment Variables

```bash
# Error Tracking (Sentry)
SENTRY_DSN=https://your-dsn@o123456.ingest.sentry.io/123456
```

---

## 📊 Phase 4: Uptime Monitoring (30 minutes)

### 4.1 UptimeRobot Setup (FREE)

1. Go to https://uptimerobot.com/
2. Sign up for free account
3. Add New Monitor:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** Albania JobFlow API
   - **URL:** https://your-api-domain.com/health
   - **Monitoring Interval:** 5 minutes
4. Add Alert Contacts (email/SMS)

### 4.2 Create Health Check Endpoint

Already exists in `backend/server.js:118-126`:

```javascript
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'PunaShqip API është aktiv',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});
```

### 4.3 Enhanced Health Check (Optional)

```javascript
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

    // Check Redis (if using)
    // const redisStatus = await redis.ping();

    const health = {
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      uptime: Math.floor(process.uptime()),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
      },
      services: {
        database: dbStatus,
        email: process.env.RESEND_API_KEY ? 'configured' : 'not configured'
      }
    };

    logger.debug('Health check', health);
    res.status(200).json(health);
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Service unavailable'
    });
  }
});
```

---

## 📋 Phase 5: Testing & Validation (1 hour)

### 5.1 Test Logger

**Create:** `backend/tests/logger.test.js`

```javascript
import logger from '../src/config/logger.js';

// Test different log levels
logger.debug('🔍 Debug message - only visible with LOG_LEVEL=debug');
logger.info('ℹ️ Info message - general information');
logger.warn('⚠️ Warning message - something to watch');
logger.error('❌ Error message', {
  error: new Error('Test error'),
  userId: '123',
  action: 'test-action'
});

console.log('✅ Logger test complete - check logs/ directory');
```

Run test:
```bash
node backend/tests/logger.test.js
```

### 5.2 Test Sentry

Trigger error manually:
```javascript
// In any route
router.get('/test-sentry', (req, res) => {
  throw new Error('Test Sentry error tracking');
});
```

Visit `/api/test-sentry` and check Sentry dashboard.

### 5.3 Test UptimeRobot

1. Visit your `/health` endpoint
2. Check UptimeRobot dashboard shows "Up"
3. Stop server temporarily - should get alert

---

## 🚀 Phase 6: Production Deployment Checklist

### Environment Variables (Production)

```bash
# Logging
LOG_LEVEL=info
ENABLE_FILE_LOGS=true

# Error Tracking
SENTRY_DSN=https://your-production-dsn@sentry.io/project-id
NODE_ENV=production

# Monitoring
# (UptimeRobot doesn't need env vars - configured on their dashboard)
```

### Pre-Deployment Steps

- [ ] Test logger in development
- [ ] Test Sentry error capture
- [ ] Configure UptimeRobot monitor
- [ ] Set LOG_LEVEL=info for production
- [ ] Enable file logs in production
- [ ] Add logs/ to .gitignore
- [ ] Set up log rotation (handled by winston-daily-rotate-file)
- [ ] Configure alert emails in UptimeRobot
- [ ] Test health endpoint

---

## 📊 Monitoring Dashboard Setup

### Sentry Dashboard

**Alerts to Configure:**
1. Error rate > 10 errors/minute
2. New error types
3. Performance degradation (response time > 2s)

**Slack Integration (Optional):**
- Settings → Integrations → Slack
- Send alerts to #alerts channel

### UptimeRobot Alerts

**Recommended Settings:**
- Alert when down for 5 minutes
- Alert when response time > 5 seconds
- Send to: Primary email + SMS (optional)

---

## 💰 Cost Summary

| Service | Tier | Cost | Features |
|---------|------|------|----------|
| **Winston** | N/A | FREE | Local file logging, rotation |
| **Sentry** | Free | $0/month | 5k errors/month, 14 days retention |
| **UptimeRobot** | Free | $0/month | 50 monitors, 5 min intervals |
| **Total** | | **$0/month** | Perfect for 10k users |

### When to Upgrade

**Sentry Pro ($26/month):**
- At 5k+ errors/month
- Need 90 days retention
- Want advanced performance monitoring

**UptimeRobot Pro ($7/month):**
- Need 1-minute monitoring intervals
- Want SMS alerts
- Need advanced analytics

---

## 📝 Migration Script

**File:** `backend/scripts/migrate-to-winston.sh`

```bash
#!/bin/bash

# Find and replace console.log with logger
find backend/src -type f -name "*.js" -exec sed -i '' 's/console\.log/logger.info/g' {} +
find backend/src -type f -name "*.js" -exec sed -i '' 's/console\.error/logger.error/g' {} +
find backend/src -type f -name "*.js" -exec sed -i '' 's/console\.warn/logger.warn/g' {} +
find backend/src -type f -name "*.js" -exec sed -i '' 's/console\.debug/logger.debug/g' {} +

echo "✅ Migration complete - manually verify each file"
```

---

## 🎯 Success Metrics

After implementation, you should have:

✅ **Structured Logging**
- All logs in JSON format
- Log levels: debug, info, warn, error
- Metadata attached to every log

✅ **Log Persistence**
- Error logs kept for 14 days
- Combined logs kept for 7 days
- Automatic rotation at 20MB

✅ **Error Tracking**
- Real-time error notifications
- Stack traces with context
- Performance profiling

✅ **Uptime Monitoring**
- 5-minute checks
- Email alerts on downtime
- Response time tracking

---

## 🔧 Maintenance

### Daily
- Check Sentry for new errors

### Weekly
- Review error trends in Sentry
- Check UptimeRobot uptime percentage
- Review log files for anomalies

### Monthly
- Clean up old log files (automatic with rotation)
- Review and optimize slow endpoints
- Update monitoring thresholds if needed

---

**Implementation Priority:** 🔴 **HIGH**
**Estimated Time:** 6-8 hours
**Dependencies:** None (can implement independently)
**Testing Required:** Yes (1 hour)

**Next Steps:**
1. Implement Winston logger (2 hours)
2. Replace console.log in high-traffic routes (2 hours)
3. Set up Sentry (1 hour)
4. Configure UptimeRobot (30 min)
5. Test everything (1 hour)
