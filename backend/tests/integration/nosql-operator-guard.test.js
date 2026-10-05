/**
 * O-68 — NoSQL operator injection is refused end-to-end.
 *
 * Before: POST /api/quickusers/unsubscribe ran
 *   QuickUser.findOne({ unsubscribeToken: req.body.token })
 * with no type check, so {"token":{"$ne":null}} unsubscribed an arbitrary
 * subscriber and repeating it ({$gt:""}, {$nin:[]}) could empty the whole
 * mailing list. Now:
 *   1. a global guard (mounted right after the body parsers) answers 400 for
 *      any JSON/urlencoded body with a `$`-prefixed or dotted key;
 *   2. quickusers re-checks multipart bodies (parsed after the guard);
 *   3. unsubscribe/track-click accept only a string token.
 * Every attack below is followed by a DB read proving nothing changed.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import QuickUser from '../../src/models/QuickUser.js';
import User from '../../src/models/User.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';

const GUARD_BODY = { success: false, message: 'Kërkesa përmban fusha të palejuara.' };

async function seedSubscribers(n = 3) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(await QuickUser.create({
      firstName: `Sub${i}`, lastName: 'Scriber',
      email: `sub${i}@example.com`,
      location: 'Tiranë',
      interests: ['Marketing'],
      isActive: true,
    }));
  }
  return out;
}

const activeCount = () => QuickUser.countDocuments({ isActive: true });

describe('O-68 — NoSQL operator guard', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('POST /api/quickusers/unsubscribe', () => {
    it('{"token":{"$ne":null}} → 400, no subscriber is unsubscribed', async () => {
      await seedSubscribers(3);
      const r = await request(app).post('/api/quickusers/unsubscribe').send({ token: { $ne: null } });
      expect(r.status).toBe(400);
      expect(r.body).toEqual(GUARD_BODY);
      expect(await activeCount()).toBe(3);
    });

    it('mass-unsubscribe iteration ($gt / $nin / $regex, repeated) → every call 400, list intact', async () => {
      await seedSubscribers(3);
      const payloads = [
        { token: { $gt: '' } },
        { token: { $nin: [] } },
        { token: { $regex: '.*' } },
        { token: { $exists: true } },
      ];
      for (let round = 0; round < 3; round++) {
        for (const body of payloads) {
          const r = await request(app).post('/api/quickusers/unsubscribe').send(body);
          expect(r.status).toBe(400);
          expect(r.body).toEqual(GUARD_BODY);
        }
      }
      expect(await activeCount()).toBe(3);
    });

    it('urlencoded token[$ne]=x (qs extended parsing → nested object) → 400, list intact', async () => {
      await seedSubscribers(2);
      const r = await request(app)
        .post('/api/quickusers/unsubscribe')
        .type('form')
        .send('token[$ne]=x');
      expect(r.status).toBe(400);
      expect(r.body).toEqual(GUARD_BODY);
      expect(await activeCount()).toBe(2);
    });

    it('query ?token[$ne]=x is NOT parsed into an operator (Express 5 simple parser) → 400 token required', async () => {
      await seedSubscribers(2);
      const r = await request(app).post('/api/quickusers/unsubscribe?token[$ne]=x');
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Token i çregjistrimit është i detyrueshëm');
      expect(await activeCount()).toBe(2);
    });

    it('repeated query token (?token=a&token=b → array) → 400 token required', async () => {
      const [sub] = await seedSubscribers(2);
      const r = await request(app)
        .post(`/api/quickusers/unsubscribe?token=${sub.unsubscribeToken}&token=other`);
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Token i çregjistrimit është i detyrueshëm');
      expect(await activeCount()).toBe(2);
    });

    it('a JSON array token → 400 token required', async () => {
      const [sub] = await seedSubscribers(2);
      const r = await request(app).post('/api/quickusers/unsubscribe').send({ token: [sub.unsubscribeToken] });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('Token i çregjistrimit është i detyrueshëm');
      expect(await activeCount()).toBe(2);
    });

    it('the real string token still works → 200, only that subscriber is deactivated', async () => {
      const [a, b, c] = await seedSubscribers(3);
      const r = await request(app).post('/api/quickusers/unsubscribe').send({ token: b.unsubscribeToken });
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      expect((await QuickUser.findById(a._id)).isActive).toBe(true);
      expect((await QuickUser.findById(b._id)).isActive).toBe(false);
      expect((await QuickUser.findById(c._id)).isActive).toBe(true);
    });
  });

  describe('POST /api/quickusers/track-click', () => {
    it('{"token":{"$ne":null}} → 400, no click recorded', async () => {
      await seedSubscribers(2);
      const r = await request(app).post('/api/quickusers/track-click').send({ token: { $ne: null } });
      expect(r.status).toBe(400);
      expect(r.body).toEqual(GUARD_BODY);
      const clicks = await QuickUser.find({}).select('emailClickCount').lean();
      expect(clicks.map((q) => q.emailClickCount)).toEqual([0, 0]);
    });

    it('non-string token (array / number) → 400 "Token është i detyrueshëm"', async () => {
      const [sub] = await seedSubscribers(1);
      for (const token of [[sub.unsubscribeToken], 12345]) {
        const r = await request(app).post('/api/quickusers/track-click').send({ token });
        expect(r.status).toBe(400);
        expect(r.body.message).toBe('Token është i detyrueshëm');
      }
      expect((await QuickUser.findById(sub._id)).emailClickCount).toBe(0);
    });

    it('the real string token still records one click → 200', async () => {
      const [sub] = await seedSubscribers(1);
      const r = await request(app).post('/api/quickusers/track-click').send({ token: sub.unsubscribeToken });
      expect(r.status).toBe(200);
      expect((await QuickUser.findById(sub._id)).emailClickCount).toBe(1);
    });
  });

  describe('multipart bodies (parsed after the global guard) — POST /api/quickusers', () => {
    it('JSON-encoded preferences carrying an operator → 400, no QuickUser created', async () => {
      const r = await request(app)
        .post('/api/quickusers')
        .field('firstName', 'Multi')
        .field('lastName', 'Part')
        .field('email', 'multipart@example.com')
        .field('location', 'Tiranë')
        .field('interests', JSON.stringify(['Marketing']))
        .field('preferences', JSON.stringify({ emailFrequency: { $ne: null } }));
      expect(r.status).toBe(400);
      expect(r.body).toEqual(GUARD_BODY);
      expect(await QuickUser.countDocuments({})).toBe(0);
    });

    it('bracket field name email[$ne] (multer append-field nesting) → 400, no QuickUser created', async () => {
      const r = await request(app)
        .post('/api/quickusers')
        .field('firstName', 'Multi')
        .field('lastName', 'Part')
        .field('email[$ne]', 'x')
        .field('location', 'Tiranë');
      expect(r.status).toBe(400);
      expect(r.body).toEqual(GUARD_BODY);
      expect(await QuickUser.countDocuments({})).toBe(0);
    });
  });

  describe('other routes', () => {
    it('dotted update key on PUT /api/users/profile → 400, profile unchanged', async () => {
      const { user } = await createJobseeker({ email: 'dotted@example.com', firstName: 'Original' });
      const r = await request(app)
        .put('/api/users/profile')
        .set(createAuthHeaders(user))
        .send({ 'profile.firstName': 'Hacked' });
      expect(r.status).toBe(400);
      expect(r.body).toEqual(GUARD_BODY);
      const after = await User.findById(user._id).lean();
      expect(after.profile.firstName).toBe('Original');
    });

    it('`$` and `.` inside string VALUES are ordinary data: wrong-password login → 401, not 400', async () => {
      await createJobseeker({ email: 'values@example.com', password: 'RealPassword1' });
      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: 'values@example.com', password: 'Pa$$w0rd.$ne' });
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('Email ose fjalëkalim i gabuar');
    });
  });
});
