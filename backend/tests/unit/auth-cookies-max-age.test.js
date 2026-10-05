/**
 * O-41 — auth cookie lifetimes follow the JWT they carry.
 *
 * The cookies used to be hard-coded to 15m / 7d. With a shorter
 * JWT_EXPIRES_IN the auth_token cookie outlived its JWT and, because the
 * cookie wins over the Authorization header, shadowed the fresh header token.
 * setAuthCookies now derives maxAge from each token's own `exp` claim.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { setAuthCookies } from '../../src/lib/authCookies.js';
import { generateToken, generateRefreshToken } from '../../src/middleware/auth.js';

function captureCookies(tokens) {
  const calls = {};
  const res = { cookie: (name, value, opts) => { calls[name] = { value, opts }; } };
  setAuthCookies(res, tokens);
  return calls;
}

const SECRET = 'unit-test-secret';
const ORIGINAL_ENV = {
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN,
};

afterEach(() => {
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('setAuthCookies maxAge (O-41)', () => {
  it('auth_token cookie lives exactly as long as a 45s access token', () => {
    process.env.JWT_EXPIRES_IN = '45s';
    const token = generateToken({ id: 'u1', email: 'a@b.al', userType: 'jobseeker' });
    const { auth_token } = captureCookies({ token });
    // exp has 1 s resolution, so the remaining lifetime is in (44 s, 45 s].
    expect(auth_token.opts.maxAge).toBeGreaterThan(44_000);
    expect(auth_token.opts.maxAge).toBeLessThanOrEqual(45_000);
    expect(auth_token.opts.path).toBe('/');
    expect(auth_token.opts.httpOnly).toBe(true);
  });

  it('refresh_token cookie follows JWT_REFRESH_EXPIRES_IN (2h), not a fixed 7 days', () => {
    process.env.JWT_REFRESH_EXPIRES_IN = '2h';
    const refreshToken = generateRefreshToken({ id: 'u1', email: 'a@b.al', userType: 'jobseeker' });
    const { refresh_token } = captureCookies({ refreshToken });
    expect(refresh_token.opts.maxAge).toBeGreaterThan(7_199_000);
    expect(refresh_token.opts.maxAge).toBeLessThanOrEqual(7_200_000);
    expect(refresh_token.opts.path).toBe('/api/auth');
  });

  it('an already-expired token yields maxAge 0 (cookie deleted), never negative', () => {
    const expired = jwt.sign({ id: 'u1', exp: Math.floor(Date.now() / 1000) - 60 }, SECRET);
    const { auth_token } = captureCookies({ token: expired });
    expect(auth_token.opts.maxAge).toBe(0);
  });

  it('a token without an exp claim falls back to 15 min / 7 days', () => {
    const noExp = jwt.sign({ id: 'u1' }, SECRET);
    const calls = captureCookies({ token: noExp, refreshToken: noExp });
    expect(calls.auth_token.opts.maxAge).toBe(15 * 60 * 1000);
    expect(calls.refresh_token.opts.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
