import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { User } from '../models/index.js';
import logger from '../config/logger.js';

// Generate JWT Token
export const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
  });
};

// Generate Refresh Token — includes jti (unique ID) to prevent same-second duplicates
export const generateRefreshToken = (payload) => {
  return jwt.sign({ ...payload, jti: randomUUID() }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });
};

// Verify JWT Token — pinned to HS256 to prevent alg:none attacks
export const verifyToken = (token, secret = process.env.JWT_SECRET) => {
  return jwt.verify(token, secret, { algorithms: ['HS256'] });
};

// Authentication Middleware.
//
// Round O-F: reads the JWT from EITHER the httpOnly `auth_token` cookie OR
// the `Authorization: Bearer ...` header. Cookie takes precedence when both
// are present (newer auth model wins). Header support is retained
// indefinitely so:
//   - existing tests keep working without churn
//   - a mobile app can continue using bearer tokens
//   - rollback = stop setting cookies in backend → frontend automatically
//     falls back to localStorage + Authorization header. Zero data loss.
export const authenticate = async (req, res, next) => {
  try {
    const cookieToken = req.cookies?.auth_token;
    const authHeader = req.headers.authorization;
    const headerToken = (authHeader && authHeader.startsWith('Bearer '))
      ? authHeader.substring(7)
      : null;
    const token = cookieToken || headerToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Ju lutemi kyçuni për të vazhduar'
      });
    }

    // Verify token
    const decoded = verifyToken(token);
    
    // Get user from database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Përdoruesi nuk u gjet'
      });
    }

    if (user.isDeleted || user.status === 'deleted') {
      return res.status(401).json({
        success: false,
        message: 'Llogaria është çaktivizuar'
      });
    }

    // Check and update suspension status (auto-lift expired suspensions)
    await user.checkSuspensionStatus();

    if (user.status === 'suspended') {
      const expiryDate = user.suspensionDetails.expiresAt;
      const expiryText = expiryDate
        ? ` deri më ${new Date(expiryDate).toLocaleDateString('sq-AL')}`
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

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token ka skaduar, ju lutemi kyçuni përsëri'
      });
    }

    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError' || error.name === 'SyntaxError') {
      return res.status(401).json({
        success: false,
        message: 'Token i pavlefshëm'
      });
    }

    logger.error('Auth middleware error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gabim në autentifikim'
    });
  }
};

// Authorization Middleware - Check user roles
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Ju lutemi kyçuni për të vazhduar'
      });
    }

    if (!roles.includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        message: 'Nuk keni autorizim për këtë veprim'
      });
    }

    next();
  };
};

// Check if user is job seeker
export const requireJobSeeker = authorize('jobseeker');

// Check if user is employer
export const requireEmployer = authorize('employer');

// Check if user is admin
export const requireAdmin = authorize('admin');

// Check if user is employer or admin
export const requireEmployerOrAdmin = authorize('employer', 'admin');

// Optional authentication - doesn't fail if no token.
// Round O-F: also reads from `auth_token` cookie (cookie takes precedence).
export const optionalAuth = async (req, res, next) => {
  try {
    const cookieToken = req.cookies?.auth_token;
    const authHeader = req.headers.authorization;
    const headerToken = (authHeader && authHeader.startsWith('Bearer '))
      ? authHeader.substring(7)
      : null;
    const token = cookieToken || headerToken;

    if (token) {
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.id).select('-password');

      if (user && !user.isDeleted && user.status !== 'deleted' && user.status !== 'suspended' && user.status !== 'banned') {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Continue without user if token is invalid
    next();
  }
};

// Check if employer is verified
export const requireVerifiedEmployer = (req, res, next) => {
  if (req.user.userType !== 'employer') {
    return res.status(403).json({
      success: false,
      message: 'Vetëm punëdhënësit mund të kryejnë këtë veprim'
    });
  }

  if (!req.user?.profile?.employerProfile?.verified) {
    return res.status(403).json({
      success: false,
      message: 'Llogaria juaj si punëdhënës duhet të verifikohet nga administratori'
    });
  }

  next();
};