import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { connectDB } from './src/config/database.js';

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
import sendVerificationRoutes from './src/routes/send-verification.js';
import adminRoutes from './src/routes/admin.js';
import reportRoutes from './src/routes/reports.js';
import bulkNotificationRoutes from './src/routes/bulk-notifications.js';
import configurationRoutes from './src/routes/configuration.js';
import businessControlRoutes from './src/routes/business-control.js';
import matchingRoutes from './src/routes/matching.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Connect to Database
connectDB();

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
    
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173', // Vite dev server
      'http://localhost:3000', // Alternative dev port
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
    ];
    
    // In production, add your deployed frontend URL
    if (process.env.FRONTEND_URL) {
      allowedOrigins.push(process.env.FRONTEND_URL);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
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
  // Skip rate limiting in development if needed
  skip: (req) => process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true'
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files for uploads
app.use('/uploads', express.static('./uploads'));

// Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'PunaShqip API është aktiv',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes); // Admin routes first to avoid conflicts
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
app.use('/api/send-verification', sendVerificationRoutes);
app.use('/api/matching', matchingRoutes);

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

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

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

  // Default error
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Gabim i brendshëm i serverit',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`🚀 PunaShqip API running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

export default app;