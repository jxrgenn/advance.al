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

// O-14: session generation of a user (User.tokenVersion; missing = 0).
export const currentTokenVersion = (user) =>
  Number.isInteger(user?.tokenVersion) ? user.tokenVersion : 0;

// O-14: true when a decoded access/refresh token belongs to an older session
// generation than the user's, i.e. a password change/reset since it was
// issued. Tokens minted before `tv` existed count as generation 0, so they
// keep working until the user's first password change. Unlike the previous
// iat-vs-passwordChangedAt check this has no 1-second blind spot.
export const isStaleTokenVersion = (decoded, user) => {
  const tokenTv = decoded?.tv === undefined ? 0 : decoded.tv;
  return tokenTv !== currentTokenVersion(user);
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
    const user = await User.findById(decoded.id).select('-password +tokenVersion');

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

    if (isStaleTokenVersion(decoded, user)) {
      return res.status(401).json({
        success: false,
        message: 'Fjalëkalimi i llogarisë u ndryshua. Ju lutemi kyçuni përsëri.'
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
//
// A presented token that does not yield a user (expired, invalid, revoked by
// a password change, account gone / suspended) still continues anonymously,
// but sets `req.authTokenRejected = true`. Routes whose answer for an
// anonymous caller would hide owner-only content (GET /api/jobs/:id on a
// draft / unpaid job) use it to answer 401 instead of 404, so the frontend
// refreshes the session and retries rather than showing "not found".
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
      const user = await User.findById(decoded.id).select('-password +tokenVersion');

      if (user && !user.isDeleted && user.status !== 'deleted' && user.status !== 'suspended' && user.status !== 'banned' &&
          !isStaleTokenVersion(decoded, user)) {
        req.user = user;
      } else {
        req.authTokenRejected = true;
      }
    }

    next();
  } catch (error) {
    // Continue without user if token is invalid (see authTokenRejected above)
    req.authTokenRejected = true;
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

  // O-52: employers awaiting verification can log in and use their dashboard;
  // this gate is what keeps them from publishing until an admin approves.
  // The message must say why and what happens next.
  if (!req.user?.profile?.employerProfile?.verified) {
    const rejected = req.user?.profile?.employerProfile?.verificationStatus === 'rejected';
    return res.status(403).json({
      success: false,
      code: rejected ? 'EMPLOYER_VERIFICATION_REJECTED' : 'EMPLOYER_VERIFICATION_PENDING',
      message: rejected
        ? 'Llogaria juaj si punëdhënës nuk u aprovua, prandaj nuk mund të publikoni punë. Për më shumë informacion na shkruani në info@advance.al.'
        : 'Llogaria juaj si punëdhënës është në pritje të verifikimit nga administratori. Do të mund të publikoni punë sapo të verifikohet — do t\'ju njoftojmë me email.'
    });
  }

  next();
};