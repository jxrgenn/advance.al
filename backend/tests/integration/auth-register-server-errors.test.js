/**
 * Phase 28 — coverage push for routes/auth.js POST /initiate-registration
 * outer 500 catch (L378-379) and POST /register E11000 race-condition
 * dup-key path (L486-493) plus /register outer 500 catch (L556-557).
 *
 * These error branches are reachable in production (Mongo blip during
 * registration, or two simultaneous register-completes for the same email
 * after pending-verification) but were unhit by other auth tests because
 * they require User.findOne / User.prototype.save to fail mid-flow.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, jest } from '@jest/globals';
import crypto from 'crypto';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import User from '../../src/models/User.js';

const KNOWN_CODE = '424242';

describe('auth.js — /initiate-registration + /register outer error catches', () => {
  let randomIntSpy;

  beforeAll(async () => { await connectTestDB(); await seedLocations(); });

  beforeEach(() => {
    randomIntSpy = jest.spyOn(crypto, 'randomInt').mockReturnValue(parseInt(KNOWN_CODE, 10));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    randomIntSpy = null;
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => { await closeTestDB(); });

  it('POST /initiate-registration returns 500 when User.findOne throws (L378-379)', async () => {
    // The route calls User.findOne({ email }) very early to check duplicates.
    // If Mongo is down or query throws, the outer catch must surface a generic
    // 500 with the standard Albanian error message and not leak the original.
    const realFindOne = User.findOne.bind(User);
    jest.spyOn(User, 'findOne').mockImplementationOnce(function (...args) {
      // Match only the duplicate-check call (filters by email)
      if (args[0]?.email !== undefined) throw new Error('initiate findOne fail — atlas blip');
      return realFindOne(...args);
    });

    const r = await request(app)
      .post('/api/auth/initiate-registration')
      .send({
        email: 'init-err@example.com',
        password: 'StrongPass1',
        userType: 'jobseeker',
        firstName: 'Init',
        lastName: 'Error',
        city: 'Tiranë',
      });

    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
    expect(r.body.message).toMatch(/Ndodhi një gabim|provoni përsëri/i);
    // Must NOT leak the underlying error string
    expect(r.body.message).not.toMatch(/atlas blip|findOne|Mongo/);
  });

  it('POST /register returns 400 on E11000 dup-key race (L486-491)', async () => {
    // Race scenario: two requests both pass the User.findOne({ email }) check
    // (no existing user yet), then both submit correct verification codes.
    // The first to user.save() wins; the second hits E11000 from the unique
    // index on email and must surface the same "user already exists" 400 the
    // pre-check would have surfaced.

    const email = 'race@example.com';

    // Step 1: legitimate initiate-registration so /register has a pending entry
    const init = await request(app)
      .post('/api/auth/initiate-registration')
      .send({
        email, password: 'StrongPass1', userType: 'jobseeker',
        firstName: 'Race', lastName: 'Cond', city: 'Tiranë',
      });
    expect(init.status).toBe(200);

    // Step 2: simulate race by stubbing User.prototype.save to throw E11000
    // exactly once (the dup-key error MongoDB raises on a unique-index collision).
    const dupErr = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(dupErr);

    const r = await request(app)
      .post('/api/auth/register')
      .send({ email, verificationCode: KNOWN_CODE });

    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(r.body.message).toMatch(/tashmë ekziston/);
  });

  it('POST /register returns 500 when User.prototype.save throws non-11000 (L555-560)', async () => {
    // Non-dup-key save errors (validation glitch, replica-set hiccup) must
    // NOT pretend the user already exists — they should surface the generic
    // 500 from the outer catch.
    const email = 'save-err@example.com';

    const init = await request(app)
      .post('/api/auth/initiate-registration')
      .send({
        email, password: 'StrongPass1', userType: 'jobseeker',
        firstName: 'Save', lastName: 'Err', city: 'Tiranë',
      });
    expect(init.status).toBe(200);

    const generic = new Error('replica set election');
    // Note: code is intentionally NOT 11000
    jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(generic);

    const r = await request(app)
      .post('/api/auth/register')
      .send({ email, verificationCode: KNOWN_CODE });

    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
    expect(r.body.message).toMatch(/Gabim në krijimin e llogarisë/);
    expect(r.body.message).not.toMatch(/replica set/);
  });

  it('POST /register returns 400 when User.findOne (post-code-verify) finds existing user (L433-441)', async () => {
    // After verification code passes, the route does a final User.findOne to
    // catch the case where the email got registered via another path while
    // the verification window was open. Trigger by manually inserting the
    // user between initiate and register.
    const email = 'preempt@example.com';

    const init = await request(app)
      .post('/api/auth/initiate-registration')
      .send({
        email, password: 'StrongPass1', userType: 'jobseeker',
        firstName: 'Pre', lastName: 'Empt', city: 'Tiranë',
      });
    expect(init.status).toBe(200);

    // Manually create the user out-of-band (simulates a competing register)
    await User.create({
      email,
      password: 'OtherStrongPass1',
      userType: 'jobseeker',
      emailVerified: true,
      profile: {
        firstName: 'Other',
        lastName: 'User',
        location: { city: 'Tiranë', region: 'Tiranë' },
        jobSeekerProfile: {
          openToRemote: false,
          availability: 'immediately',
        },
      },
    });

    const r = await request(app)
      .post('/api/auth/register')
      .send({ email, verificationCode: KNOWN_CODE });

    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/tashmë ekziston/);
  });
});
