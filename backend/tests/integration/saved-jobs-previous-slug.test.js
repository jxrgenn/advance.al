/**
 * Saved-jobs routes accept an ObjectId or a slug. A title edit gives the job a
 * new slug and keeps the old one in previousSlugs (#113); a job page opened
 * through an old, shared link calls these routes with that old slug, so they
 * must resolve it like GET /api/jobs/:idOrSlug does.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createJobseeker } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import User from '../../src/models/User.js';

describe('saved jobs through a previous slug', () => {
  let seeker;
  let job;
  let oldSlug;

  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    const { user: employer } = await createVerifiedEmployer();
    ({ user: seeker } = await createJobseeker());
    job = await createJob(employer, { title: 'Kamarier me përvojë' });
    oldSlug = (await Job.findById(job._id).lean()).slug;

    const edit = await request(app)
      .put(`/api/jobs/${job._id}`)
      .set(createAuthHeaders(employer))
      .send({ title: 'Kamarier për sezonin veror' });
    expect(edit.status).toBe(200);
    const after = await Job.findById(job._id).lean();
    expect(after.slug).not.toBe(oldSlug);
    expect(after.previousSlugs).toContain(oldSlug);
  });

  afterAll(async () => {
    await closeTestDB();
  });

  const savedIds = async () =>
    ((await User.findById(seeker._id).lean()).savedJobs || []).map(String);

  it('check, save and unsave all resolve the old slug to the same job', async () => {
    const check0 = await request(app).get(`/api/users/saved-jobs/check/${oldSlug}`).set(createAuthHeaders(seeker));
    expect(check0.status).toBe(200);
    expect(check0.body.data.isSaved).toBe(false);

    const save = await request(app).post(`/api/users/saved-jobs/${oldSlug}`).set(createAuthHeaders(seeker));
    expect(save.status).toBe(200);
    expect(await savedIds()).toEqual([String(job._id)]);

    const check1 = await request(app).get(`/api/users/saved-jobs/check/${oldSlug}`).set(createAuthHeaders(seeker));
    expect(check1.body.data.isSaved).toBe(true);

    const unsave = await request(app).delete(`/api/users/saved-jobs/${oldSlug}`).set(createAuthHeaders(seeker));
    expect(unsave.status).toBe(200);
    expect(await savedIds()).toEqual([]);
  });

  it('an unknown slug is still "not saved" / 404', async () => {
    const check = await request(app).get('/api/users/saved-jobs/check/no-such-slug-123').set(createAuthHeaders(seeker));
    expect(check.body.data.isSaved).toBe(false);
    const save = await request(app).post('/api/users/saved-jobs/no-such-slug-123').set(createAuthHeaders(seeker));
    expect(save.status).toBe(404);
  });
});
