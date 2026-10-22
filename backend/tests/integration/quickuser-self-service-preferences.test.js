/**
 * Self-service QuickUser preferences — the "Ndrysho preferencat" link in every
 * job-alert / welcome email (W2-3).
 *
 *   #172 the Preferences page called GET/PUT /api/quickusers/preferences,
 *        which did not exist (GET fell into the admin-only /:id → 401, PUT →
 *        404) and the body shared no field with the old /:id/preferences.
 *   #181 an invalid enum on PUT /:id/preferences reached save() → 500.
 *   #176 unsubscribe / click tracking for a subscriber holding a removed
 *        interest category → 500.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import QuickUser from '../../src/models/QuickUser.js';

const seed = (overrides = {}) => QuickUser.create({
  firstName: 'Ana', lastName: 'Kodra',
  email: `ana-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
  location: 'Tiranë', interests: ['Teknologji', 'Marketing'],
  preferences: { emailFrequency: 'immediate' },
  ...overrides,
});

async function seedLegacy(token = 'd'.repeat(64)) {
  const _id = new mongoose.Types.ObjectId();
  await QuickUser.collection.insertOne({
    _id, firstName: 'Vjetër', lastName: 'Interes', email: `legacy-${Date.now()}@example.com`,
    location: 'Tiranë', interests: ['Administratë & Zyrë', 'Teknologji'], customInterests: [], isActive: true,
    unsubscribeToken: token, lastNotifiedAt: null, notificationCount: 0, totalEmailsSent: 0,
    emailClickCount: 0, preferences: { emailFrequency: 'immediate' }, convertedToFullUser: false,
  });
  return { _id, token };
}

describe('GET/PUT /api/quickusers/preferences (token)', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  const view = (token) => request(app).post('/api/quickusers/preferences/view').send(token === undefined ? {} : { token });

  it('POST /preferences/view returns the subscriber view for a valid token (token in the body, never the url)', async () => {
    const qu = await seed();
    const r = await view(qu.unsubscribeToken);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true,
      data: {
        firstName: 'Ana',
        email: `a***@example.com`,
        emailNotifications: true,
        convertedToFullUser: false,
        interests: ['Teknologji', 'Marketing'],
        legacyInterests: [],
        customInterests: [],
        emailFrequency: 'immediate',
        pendingDigestCount: 0,
      },
    });
  });

  it('view with an unknown, malformed or missing token → 404 (never 401, which would log a signed-in visitor out)', async () => {
    const unknown = await view('e'.repeat(64));
    const malformed = await view('abc');
    const missing = await view(undefined);
    for (const r of [unknown, malformed, missing]) {
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ success: false, message: 'Lidhja e preferencave nuk është e vlefshme ose ka skaduar.' });
    }
  });

  it('a token passed in the url is not accepted (it would land in access logs)', async () => {
    const qu = await seed();
    const put = await request(app).put(`/api/quickusers/preferences?token=${qu.unsubscribeToken}`).send({ emailNotifications: false });
    expect(put.status).toBe(404);
    expect((await QuickUser.findById(qu._id).lean()).isActive).toBe(true);
  });

  it('view with an operator object instead of a token does not match anyone', async () => {
    await seed();
    const r = await request(app).post('/api/quickusers/preferences/view').send({ token: { $ne: 'x' } });
    // JUSTIFIED: the global rejectMongoOperators guard answers 400 for `$`
    // keys; if a future change lets it through, the route's string check
    // must still answer 404 — either way no subscriber data is returned.
    expect([400, 404]).toContain(r.status);
    expect(r.body.data).toBeUndefined();
  });

  it('PUT saves interests + frequency + on/off and returns the fresh view', async () => {
    const qu = await seed();
    const r = await request(app).put('/api/quickusers/preferences').send({
      token: qu.unsubscribeToken, emailNotifications: true, interests: ['Shitje', 'Transport', 'Shitje'], emailFrequency: 'weekly',
    });
    expect(r.status).toBe(200);
    expect(r.body.message).toBe('Preferencat u ruajtën me sukses.');
    expect(r.body.data.interests).toEqual(['Shitje', 'Transport']);
    expect(r.body.data.emailFrequency).toBe('weekly');
    const after = await QuickUser.findById(qu._id).lean();
    expect(after.interests).toEqual(['Shitje', 'Transport']);
    expect(after.preferences.emailFrequency).toBe('weekly');
    expect(after.isActive).toBe(true);
  });

  it('PUT emailNotifications:false unsubscribes and clears queued alerts; true re-subscribes', async () => {
    const qu = await seed({ pendingJobAlerts: [{ jobId: new mongoose.Types.ObjectId(), matchScore: 0.5, queuedAt: new Date() }] });
    const off = await request(app).put('/api/quickusers/preferences').send({ token: qu.unsubscribeToken, emailNotifications: false });
    expect(off.status).toBe(200);
    expect(off.body.message).toBe('Njoftimet me email u çaktivizuan. Nuk do të merrni më email për punë të reja.');
    let after = await QuickUser.findById(qu._id).lean();
    expect([after.isActive, after.pendingJobAlerts.length]).toEqual([false, 0]);

    const on = await request(app).put('/api/quickusers/preferences').send({ token: qu.unsubscribeToken, emailNotifications: true });
    expect(on.status).toBe(200);
    after = await QuickUser.findById(qu._id).lean();
    expect(after.isActive).toBe(true);
  });

  it('rate limit is per subscriber token, not per IP (one NAT, many subscribers)', async () => {
    const prev = process.env.SKIP_RATE_LIMIT;
    process.env.SKIP_RATE_LIMIT = 'false';
    try {
      const a = await seed();
      const b = await seed();
      for (let i = 0; i < 60; i++) expect((await view(a.unsubscribeToken)).status).toBe(200);
      const limited = await view(a.unsubscribeToken);
      expect(limited.status).toBe(429);
      expect(limited.body).toEqual({ success: false, message: 'Shumë kërkesa. Ju lutemi provoni përsëri pas 15 minutash.' });
      // another subscriber from the same IP is unaffected
      expect((await view(b.unsubscribeToken)).status).toBe(200);
    } finally {
      process.env.SKIP_RATE_LIMIT = prev;
    }
  }, 60000);

  it.each([
    [{ interests: [] }, 'interests', 'Duhet të zgjidhni të paktën një kategori'],
    [{ interests: ['Hakerim'] }, 'interests', 'Një nga kategoritë e zgjedhura nuk është e vlefshme'],
    [{ interests: 'Teknologji' }, 'interests', 'Duhet të zgjidhni të paktën një kategori'],
    [{ emailFrequency: 'hourly' }, 'emailFrequency', 'Frekuenca duhet të jetë immediate, daily ose weekly'],
    [{ emailNotifications: 'yes' }, 'emailNotifications', 'Vlera duhet të jetë true ose false'],
    [{}, 'preferences', 'Asnjë preferencë për të ndryshuar'],
  ])('PUT %j → 400 on %s', async (body, field, message) => {
    const qu = await seed();
    const r = await request(app).put('/api/quickusers/preferences').send({ token: qu.unsubscribeToken, ...body });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ success: false, message, errors: [{ field, message }] });
    const after = await QuickUser.findById(qu._id).lean();
    expect(after.interests).toEqual(['Teknologji', 'Marketing']);
  });

  it('PUT with an unknown token → 404 and changes nothing', async () => {
    const qu = await seed();
    const r = await request(app).put('/api/quickusers/preferences').send({ token: 'f'.repeat(64), emailNotifications: false });
    expect(r.status).toBe(404);
    expect((await QuickUser.findById(qu._id).lean()).isActive).toBe(true);
  });

  it('a subscription converted into a full account cannot be re-enabled here → 409', async () => {
    const qu = await seed({ isActive: false, convertedToFullUser: true });
    const r = await request(app).put('/api/quickusers/preferences').send({ token: qu.unsubscribeToken, emailNotifications: true });
    expect(r.status).toBe(409);
    expect(r.body.message).toBe('Ky abonim u kalua në llogarinë tuaj në advance.al. Njoftimet i menaxhoni nga profili juaj.');
    expect((await QuickUser.findById(qu._id).lean()).isActive).toBe(false);
  });

  it('a subscriber with a removed category: GET reports it separately, PUT replaces it (#176)', async () => {
    const { _id, token } = await seedLegacy();
    const g = await request(app).post('/api/quickusers/preferences/view').send({ token });
    expect(g.status).toBe(200);
    expect([g.body.data.interests, g.body.data.legacyInterests]).toEqual([['Teknologji'], ['Administratë & Zyrë']]);
    const p = await request(app).put('/api/quickusers/preferences').send({ token, emailNotifications: true, interests: ['Teknologji', 'Financë'] });
    expect(p.status).toBe(200);
    expect((await QuickUser.findById(_id).lean()).interests).toEqual(['Teknologji', 'Financë']);
  });
});

describe('legacy QuickUser routes', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  it.each([
    [{ emailFrequency: 'hourly' }, 'preferences.emailFrequency'],
    [{ jobTypes: ['bogus'] }, 'preferences.jobTypes'],
    [{ jobTypes: 'full-time' }, 'preferences.jobTypes'],
    [{ remoteWork: 'maybe' }, 'preferences.remoteWork'],
    [{ salaryRange: { min: -5 } }, 'preferences.salaryRange.min'],
    [{ salaryRange: { currency: 'USD' } }, 'preferences.salaryRange.currency'],
  ])('PUT /:id/preferences %j → 400 on %s, not 500 (#181)', async (preferences, field) => {
    const qu = await seed();
    const r = await request(app).put(`/api/quickusers/${qu._id}/preferences`).send({ token: qu.unsubscribeToken, preferences });
    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(r.body.errors.map(e => e.field)).toEqual([field]);
  });

  it('PUT /:id/preferences valid update still works for a subscriber with a removed category', async () => {
    const { _id, token } = await seedLegacy();
    const r = await request(app).put(`/api/quickusers/${_id}/preferences`).send({ token, preferences: { emailFrequency: 'daily', remoteWork: true } });
    expect(r.status).toBe(200);
    expect([r.body.data.preferences.emailFrequency, r.body.data.preferences.remoteWork]).toEqual(['daily', true]);
  });

  it('unsubscribe and track-click succeed for a subscriber with a removed category (#176)', async () => {
    const { _id, token } = await seedLegacy();
    const u = await request(app).post('/api/quickusers/unsubscribe').send({ token });
    expect(u.status).toBe(200);
    expect(u.body.message).toBe('Ju u çregjistruat me sukses nga njoftimet e punës. Nuk do të merrni më email nga ne.');
    const c = await request(app).post('/api/quickusers/track-click').send({ token });
    expect(c.status).toBe(200);
    const after = await QuickUser.findById(_id).lean();
    expect([after.isActive, after.emailClickCount]).toEqual([false, 1]);
  });
});
