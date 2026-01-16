/**
 * Authentication Helper for Tests
 *
 * Utilities for generating JWT tokens and auth headers
 */

import jwt from 'jsonwebtoken';

/**
 * Generate JWT access token for a user
 */
export function generateToken(user) {
  const payload = {
    id: user._id,
    email: user.email,
    userType: user.userType
  };

  const secret = process.env.JWT_SECRET || 'test-secret-key-12345';

  return jwt.sign(payload, secret, {
    expiresIn: '7d'
  });
}

/**
 * Generate JWT refresh token for a user
 */
export function generateRefreshToken(user) {
  const payload = {
    id: user._id,
    email: user.email
  };

  const secret = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-12345';

  return jwt.sign(payload, secret, {
    expiresIn: '30d'
  });
}

/**
 * Create authorization headers with Bearer token
 */
export function createAuthHeaders(user) {
  const token = generateToken(user);

  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Create headers without auth (for public routes)
 */
export function createPublicHeaders() {
  return {
    'Content-Type': 'application/json'
  };
}

/**
 * Login user via API and get token
 * Useful for E2E-like tests that need real login flow
 */
export async function loginUser(request, email, password) {
  const response = await request
    .post('/api/auth/login')
    .send({ email, password });

  if (response.status !== 200) {
    throw new Error(`Login failed: ${response.body.message}`);
  }

  return {
    token: response.body.data.token,
    refreshToken: response.body.data.refreshToken,
    user: response.body.data.user
  };
}

/**
 * Verify token is valid
 */
export function verifyToken(token) {
  try {
    const secret = process.env.JWT_SECRET || 'test-secret-key-12345';
    return jwt.verify(token, secret);
  } catch (error) {
    return null;
  }
}

/**
 * Decode token without verification (for testing purposes)
 */
export function decodeToken(token) {
  return jwt.decode(token);
}

/**
 * Create expired token for testing expiration
 */
export function generateExpiredToken(user) {
  const payload = {
    id: user._id,
    email: user.email,
    userType: user.userType
  };

  const secret = process.env.JWT_SECRET || 'test-secret-key-12345';

  return jwt.sign(payload, secret, {
    expiresIn: '-1d' // Expired 1 day ago
  });
}

/**
 * Create invalid token for testing validation
 */
export function generateInvalidToken() {
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature';
}

/**
 * Create auth headers for different user types (convenience functions)
 */
export function createJobseekerHeaders(jobseeker) {
  return createAuthHeaders(jobseeker);
}

export function createEmployerHeaders(employer) {
  return createAuthHeaders(employer);
}

export function createAdminHeaders(admin) {
  return createAuthHeaders(admin);
}

/**
 * Extract user ID from token
 */
export function extractUserIdFromToken(token) {
  const decoded = decodeToken(token);
  return decoded?.id || null;
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token) {
  try {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) return true;

    const now = Math.floor(Date.now() / 1000);
    return decoded.exp < now;
  } catch (error) {
    return true;
  }
}

export default {
  generateToken,
  generateRefreshToken,
  createAuthHeaders,
  createPublicHeaders,
  loginUser,
  verifyToken,
  decodeToken,
  generateExpiredToken,
  generateInvalidToken,
  createJobseekerHeaders,
  createEmployerHeaders,
  createAdminHeaders,
  extractUserIdFromToken,
  isTokenExpired,
};
