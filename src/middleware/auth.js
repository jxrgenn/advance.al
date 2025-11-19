import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

// Generate JWT Token
export const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
  });
};

// Generate Refresh Token
export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });
};

// Verify JWT Token
export const verifyToken = (token, secret = process.env.JWT_SECRET) => {
  return jwt.verify(token, secret);
};

// Authentication Middleware
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Ju lutemi kyçuni për të vazhduar'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token i pavlefshëm'
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

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token i pavlefshëm'
      });
    }

    console.error('Auth middleware error:', error);
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

// Optional authentication - doesn't fail if no token
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      if (token) {
        const decoded = verifyToken(token);
        const user = await User.findById(decoded.id).select('-password');
        
        if (user && !user.isDeleted && user.status !== 'deleted' && user.status !== 'suspended') {
          req.user = user;
        }
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

  if (!req.user.profile.employerProfile.verified) {
    return res.status(403).json({
      success: false,
      message: 'Llogaria juaj si punëdhënës duhet të verifikohet nga administratori'
    });
  }

  next();
};