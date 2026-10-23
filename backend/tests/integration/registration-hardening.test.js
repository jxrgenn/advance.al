/**
 * Signup hardening — O-53, O-54, O-55.
 *
 * O-53: initiate-registration cached the PLAINTEXT password for 10 minutes
 *       (in-memory Map or Upstash Redis). It now caches a bcrypt hash (User
 *       model cost 12) and /register stores that hash as-is (no double hash).
 * O-54: the wrong-code counter was a read-modify-write on the cached blob, so
 *       on Redis N parallel guesses all read attempts=0 and the 5-attempt cap
 *       never held (see registration-attempts-redis.test.js). Attempts are now
 *       claimed atomically BEFORE the comparison; these tests pin the
 *       in-memory fallback to the same contract.
 * O-55: a non-string email / verificationCode reached String#trim /
 *       crypto.update and answered 500; region was always set to the city
 *       name. Registration data the User schema would reject (city > 50,
 *       industry > 50, ...) also only failed after the code was typed → 500.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import app from '../../server.js';
import { __pendingRegistrationsForTests as pendingStore } from '../../src/routes/auth.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import User from '../../src/models/User.js';

const KNOWN_CODE = '424242';
const WRONG_CODE = '111111';
const PASSWORD = 'StrongPass1';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

let emailSeq = 0;
const nextEmail = (tag) => `reg-${tag}-${Date.now()}-${++emailSeq}@example.com`;

function seekerBody(email, extra = {}) {
  return {
    email, password: PASSWORD, userType: 'jobseeker',
    firstName: 'Test', lastName: 'Signup', city: 'Tiranë',
    ...extra,
  };
}

function employerBody(email, extra = {}) {
  return {
    email, password: PASSWORD, userType: 'employer',
    // Mobile is required for employers since the short signup (2026-10-22).
    firstName: 'Punë', lastName: 'Dhënës', phone: '+355691234567', city: 'Tiranë',
    companyName: 'Test Sh.p.k', industry: 'Teknologji', companySize: '1-10',
    description: 'Përshkrim kompanie. '.repeat(25), // 500 chars — within 400-1000
    ...extra,
  };
}

describe('registration hardening (O-53 / O-54 / O-55)', () => {
  let randomIntSpy;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    randomIntSpy = null;
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  // Every code issued while pinned is KNOWN_CODE.
  function pinCode(code = KNOWN_CODE) {
    if (randomIntSpy) randomIntSpy.mockRestore();
    randomIntSpy = jest.spyOn(crypto, 'randomInt').mockReturnValue(parseInt(code, 10));
  }

  async function initiate(body) {
    const r = await request(app).post('/api/auth/initiate-registration').send(body);
    expect(r.status).toBe(200);
    return r;
  }

  const register = (email, verificationCode) =>
    request(app).post('/api/auth/register').send({ email, verificationCode });

  describe('O-53 — no plaintext password in the pending-registration cache', () => {
    it('initiate-registration caches a cost-12 bcrypt hash and no `password` field', async () => {
      pinCode();
      const email = nextEmail('hash');
      await initiate(seekerBody(email));

      const entry = await pendingStore.get(email);
      expect(Object.prototype.hasOwnProperty.call(entry.data, 'password')).toBe(false);
      expect(entry.data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(await bcrypt.compare(PASSWORD, entry.data.passwordHash)).toBe(true);
      expect(JSON.stringify(entry)).not.toContain(PASSWORD);
      expect(entry.hashedCode).toBe(sha256(KNOWN_CODE));
    });

    it('/register stores the cached hash as-is → login with the original password works', async () => {
      pinCode();
      const email = nextEmail('login');
      await initiate(seekerBody(email));
      const cachedHash = (await pendingStore.get(email)).data.passwordHash;

      const r = await register(email, KNOWN_CODE);
      expect(r.status).toBe(201);

      const stored = await User.findOne({ email }).select('+password').lean();
      expect(stored.password).toBe(cachedHash); // not re-hashed by the pre-save hook

      const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.data.user.email).toBe(email);
    });

    it('a registration cached by the previous release (plaintext `password`) still completes and can log in', async () => {
      const email = nextEmail('legacy');
      await pendingStore.set(email, {
        data: { email, password: 'LegacyPass1', userType: 'jobseeker', firstName: 'Old', lastName: 'Shape', city: 'Tiranë' },
        hashedCode: sha256(KNOWN_CODE),
        attempts: 0,
      });

      const r = await register(email, KNOWN_CODE);
      expect(r.status).toBe(201);

      const stored = await User.findOne({ email }).select('+password').lean();
      expect(stored.password).toMatch(/^\$2[aby]\$12\$/); // hashed by the pre-save hook
      const login = await request(app).post('/api/auth/login').send({ email, password: 'LegacyPass1' });
      expect(login.status).toBe(200);
    });
  });

  describe('O-54 — verification-code attempt cap holds under parallel guesses', () => {
    it('10 parallel wrong codes: exactly 5 comparisons, distinct remaining counts, then the real code is dead', async () => {
      pinCode();
      const email = nextEmail('race');
      await initiate(seekerBody(email));

      const compareSpy = jest.spyOn(crypto, 'timingSafeEqual');
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => register(email, WRONG_CODE))
      );

      // At most MAX_VERIFICATION_ATTEMPTS (5) codes were ever compared.
      expect(compareSpy).toHaveBeenCalledTimes(5);
      for (const r of responses) expect(r.status).toBe(400);

      const remaining = responses
        .map((r) => /Ju kanë mbetur (\d) tentativa/.exec(r.body.message))
        .filter(Boolean)
        .map((m) => Number(m[1]))
        .sort();
      // In-memory store (no Redis in tests). The Redis path — where the old
      // code let all 10 guesses through — is registration-attempts-redis.test.js.
      expect(remaining).toEqual([1, 2, 3, 4]);

      const others = responses
        .map((r) => r.body.message)
        .filter((m) => !/Ju kanë mbetur/.test(m));
      expect(others).toHaveLength(6);
      for (const m of others) {
        // JUSTIFIED: a request beyond attempt #5 gets "Shumë tentativa" if it
        // read the pending entry before attempt #5 deleted it, "Kodi ka skaduar"
        // otherwise — interleaving decides, both mean "no comparison ran".
        expect([
          'Shumë tentativa të gabuara. Ju lutemi filloni regjistrimin përsëri.',
          'Kodi ka skaduar. Ju lutemi filloni regjistrimin përsëri.',
        ]).toContain(m);
      }

      compareSpy.mockRestore();
      const late = await register(email, KNOWN_CODE);
      expect(late.status).toBe(400);
      expect(late.body.message).toBe('Kodi ka skaduar. Ju lutemi filloni regjistrimin përsëri.');
      expect(await User.countDocuments({ email })).toBe(0);
    });

    it('a newly issued code starts a fresh budget', async () => {
      pinCode();
      const email = nextEmail('reset');
      await initiate(seekerBody(email));
      for (let i = 0; i < 3; i++) {
        const r = await register(email, WRONG_CODE);
        expect(r.body.message).toBe(`Kodi i gabuar. Ju kanë mbetur ${4 - i} tentativa.`);
      }

      pinCode('535353'); // re-initiate issues a new code
      await initiate(seekerBody(email));
      const wrong = await register(email, WRONG_CODE);
      expect(wrong.body.message).toBe('Kodi i gabuar. Ju kanë mbetur 4 tentativa.');

      const ok = await register(email, '535353');
      expect(ok.status).toBe(201);
    });
  });

  describe('O-55 — malformed email / verificationCode → 400, never 500', () => {
    it.each([
      ['a number', 424242],
      ['an array', ['424242']],
      ['an object', { code: '424242' }],
      ['5 digits', '42424'],
      ['7 digits', '4242424'],
      ['non-digits', '42424a'],
    ])('verificationCode as %s → 400 "Kodi i verifikimit duhet të jetë 6 shifra"', async (_label, code) => {
      pinCode();
      const email = nextEmail('badcode');
      await initiate(seekerBody(email));
      const r = await register(email, code);
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Kodi i verifikimit duhet të jetë 6 shifra');
    });

    it('malformed codes do not burn attempts: the real code still works afterwards', async () => {
      pinCode();
      const email = nextEmail('noburn');
      await initiate(seekerBody(email));
      for (const code of [424242, ['424242'], '42424', '42424a', { x: 1 }, 'abcdef']) {
        const r = await register(email, code);
        expect(r.status).toBe(400);
      }
      const ok = await register(email, KNOWN_CODE);
      expect(ok.status).toBe(201);
    });

    it.each([
      ['an array', ['victim@example.com']],
      ['an object', { a: 'victim@example.com' }],
      ['a number', 12345],
    ])('email as %s → 400 "Email i pavlefshëm"', async (_label, email) => {
      const r = await register(email, KNOWN_CODE);
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Email i pavlefshëm');
    });
  });

  describe('O-55 — region comes from the Location table', () => {
    it.each([
      ['Kamëz', 'Tiranë'],
      ['Krujë', 'Durrës'],
      ['Tiranë', 'Tiranë'],
      ['Qytet Imagjinar', 'Qytet Imagjinar'], // not a known Location → previous behaviour
    ])('city %s → region %s', async (city, region) => {
      pinCode();
      const email = nextEmail('region');
      await initiate(seekerBody(email, { city }));
      const r = await register(email, KNOWN_CODE);
      expect(r.status).toBe(201);
      const user = await User.findOne({ email }).lean();
      expect(user.profile.location.city).toBe(city);
      expect(user.profile.location.region).toBe(region);
    });
  });

  describe('schema limits are enforced at initiate-registration, not after the code', () => {
    it.each([
      ['city', 'c'.repeat(51), 'Qyteti nuk mund të ketë më shumë se 50 karaktere', seekerBody],
      ['industry', 'i'.repeat(51), 'Industria nuk mund të ketë më shumë se 50 karaktere', employerBody],
      ['companyName', 'n'.repeat(101), 'Emri i kompanisë nuk mund të ketë më shumë se 100 karaktere', employerBody],
      ['website', `${'w'.repeat(188)}.al`, 'Faqja e internetit nuk mund të ketë më shumë se 190 karaktere', employerBody],
    ])('%s over the User schema limit → 400 at initiate with field error, nothing cached', async (field, value, message, makeBody) => {
      const email = nextEmail(`len-${field}`);
      const r = await request(app)
        .post('/api/auth/initiate-registration')
        .send(makeBody(email, { [field]: value }));
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Gabime në validim');
      expect(r.body.errors).toContainEqual({ field, message });
      expect(await pendingStore.get(email)).toBeNull();
    });

    it('object-valued firstName / lastName → 400 field errors (were accepted as "[object Object]")', async () => {
      const email = nextEmail('obj-names');
      const r = await request(app)
        .post('/api/auth/initiate-registration')
        .send(seekerBody(email, { firstName: { a: 'x' }, lastName: ['Signup'] }));
      expect(r.status).toBe(400);
      expect(r.body.errors).toContainEqual({ field: 'firstName', message: 'Emri duhet të ketë midis 2-50 karaktere' });
      expect(r.body.errors).toContainEqual({ field: 'lastName', message: 'Mbiemri duhet të ketë midis 2-50 karaktere' });
      expect(await pendingStore.get(email)).toBeNull();
    });

    it('limits are inclusive: a 50-char city and 50-char industry are accepted and the account is created', async () => {
      pinCode();
      const email = nextEmail('len-ok');
      await initiate(employerBody(email, { city: 'c'.repeat(50), industry: 'i'.repeat(50) }));
      const r = await register(email, KNOWN_CODE);
      expect(r.status).toBe(201);
      const user = await User.findOne({ email }).lean();
      expect(user.profile.location.city).toBe('c'.repeat(50));
      expect(user.profile.employerProfile.industry).toBe('i'.repeat(50));
    });

    it('cached data the schema rejects → 400 restart message (not 500), entry dropped', async () => {
      const email = nextEmail('invalid-cache');
      await pendingStore.set(email, {
        data: {
          email, passwordHash: await bcrypt.hash(PASSWORD, 4), userType: 'jobseeker',
          firstName: 'F'.repeat(80), lastName: 'Too Long', city: 'Tiranë',
        },
        hashedCode: sha256(KNOWN_CODE),
      });
      const r = await register(email, KNOWN_CODE);
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Disa të dhëna të regjistrimit nuk janë të vlefshme. Ju lutemi filloni regjistrimin përsëri.');
      expect(await User.countDocuments({ email })).toBe(0);
      expect(await pendingStore.get(email)).toBeNull();
    });
  });
});
