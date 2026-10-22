/**
 * #113 — job slugs: transliterated, never empty, collision-free, and links
 * survive a title edit.
 *
 * Before: "Kuzhinier/e në Tiranë" → "kuzhiniere-n-tiran", a Cyrillic title →
 * "-", "*** URGJENT ***" → "-urgjent-"; a title edit regenerated the slug and
 * the old URL 404'd; concurrent same-title posts raced the check-then-insert
 * counter loop into E11000 → 500.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import { slugBase } from '../../src/lib/jobSlug.js';

const suffix = (job) => String(job._id).slice(-6);

describe('#113 job slugs', () => {
  let emp;
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  beforeEach(async () => { ({ user: emp } = await createVerifiedEmployer()); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(closeTestDB);

  it.each([
    ['Kuzhinier/e në Tiranë', 'kuzhinier-e-ne-tirane'],
    ['Shitës/e për dyqan çantash — Durrës', 'shites-e-per-dyqan-cantash-durres'],
    ['*** URGJENT ***', 'urgjent'],
    ['Повар', 'pune'],
    ['   ', 'pune'],
  ])('slugBase(%j) → %j', (title, expected) => {
    expect(slugBase(title)).toBe(expected);
  });

  it('a new job gets "<transliterated title>-<last 6 hex of its id>"', async () => {
    const job = await createJob(emp, { title: 'Kuzhinier/e në Tiranë' });
    expect(job.slug).toBe(`kuzhinier-e-ne-tirane-${suffix(job)}`);
    const r = await request(app).get(`/api/jobs/${job.slug}`);
    expect(r.status).toBe(200);
    expect(r.body.data.job._id).toBe(String(job._id));
  });

  it('a title that looks like an ObjectId still yields a reachable slug', async () => {
    const job = await createJob(emp, { title: 'deadbeefdeadbeefdeadbeef' });
    expect(job.slug).toBe(`deadbeefdeadbeefdeadbeef-${suffix(job)}`);
    expect((await request(app).get(`/api/jobs/${job.slug}`)).status).toBe(200);
  });

  it('8 concurrent same-title posts all succeed with unique slugs (was E11000 → 500)', async () => {
    const jobs = await Promise.all(Array.from({ length: 8 }, () => createJob(emp, { title: 'Shitës/e' })));
    const slugs = jobs.map((j) => j.slug);
    expect(new Set(slugs).size).toBe(8);
    for (const j of jobs) expect(j.slug).toBe(`shites-e-${suffix(j)}`);
  });

  it('a title edit gives a new slug and the OLD link keeps resolving to the same job', async () => {
    const job = await createJob(emp, { title: 'Recepsionist/e' });
    const oldSlug = job.slug;

    const put = await request(app).put(`/api/jobs/${job._id}`).set(createAuthHeaders(emp))
      .send({ title: 'Recepsionist/e me përvojë' });
    expect(put.status).toBe(200);
    const fresh = await Job.findById(job._id).lean();
    expect(fresh.slug).toBe(`recepsionist-e-me-pervoje-${suffix(job)}`);
    expect(fresh.previousSlugs).toEqual([oldSlug]);

    const viaOld = await request(app).get(`/api/jobs/${oldSlug}`);
    expect(viaOld.status).toBe(200); // was 404
    expect(viaOld.body.data.job._id).toBe(String(job._id));
    expect(viaOld.body.data.job.slug).toBe(fresh.slug); // canonical slug for the client

    const viaNew = await request(app).get(`/api/jobs/${fresh.slug}`);
    expect(viaNew.status).toBe(200);
  });

  it('a second title edit keeps BOTH earlier slugs resolvable; an edit that does not touch the title keeps the slug', async () => {
    const job = await createJob(emp, { title: 'Kamarier/e' });
    const s1 = job.slug;
    await request(app).put(`/api/jobs/${job._id}`).set(createAuthHeaders(emp)).send({ title: 'Kamarier/e sezonal' });
    const s2 = (await Job.findById(job._id).lean()).slug;
    await request(app).put(`/api/jobs/${job._id}`).set(createAuthHeaders(emp)).send({ title: 'Kamarier/e sezonal në Sarandë' });
    const after = await Job.findById(job._id).lean();
    expect(after.previousSlugs).toEqual([s1, s2]);
    for (const s of [s1, s2, after.slug]) {
      const r = await request(app).get(`/api/jobs/${s}`);
      expect([s, r.status, r.body.data?.job?._id]).toEqual([s, 200, String(job._id)]);
    }

    const descOnly = await request(app).put(`/api/jobs/${job._id}`).set(createAuthHeaders(emp))
      .send({ description: 'Përshkrim i ri i punës për sezonin e verës, me orar të plotë dhe akomodim.' });
    expect(descOnly.status).toBe(200);
    const unchanged = await Job.findById(job._id).lean();
    expect(unchanged.slug).toBe(after.slug);
    expect(unchanged.previousSlugs).toEqual([s1, s2]);
  });

  // W2-4a found that reassigning previousSlugs made Mongoose version-check
  // the save, so concurrent title edits answered 500 (VersionError); the
  // schema now skips versioning for that array (last write wins).
  it('concurrent title edits of one job → every PUT 200 (no VersionError 500), all old slugs still resolve', async () => {
    const job = await createJob(emp, { title: 'Shofer' });
    const first = job.slug;
    const titles = ['Shofer kamioni', 'Shofer autobusi', 'Shofer taksie', 'Shofer furgoni'];
    const results = await Promise.all(titles.map((title) =>
      request(app).put(`/api/jobs/${job._id}`).set(createAuthHeaders(emp)).send({ title })));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);

    const after = await Job.findById(job._id).lean();
    expect(titles.map((t) => `${slugBase(t)}-${suffix(job)}`)).toContain(after.slug);
    const viaFirst = await request(app).get(`/api/jobs/${first}`);
    expect([viaFirst.status, viaFirst.body.data?.job?._id]).toEqual([200, String(job._id)]);
  });

  it('an unknown slug is still a 404', async () => {
    const r = await request(app).get('/api/jobs/nuk-ekziston-abc123');
    expect(r.status).toBe(404);
  });
});
