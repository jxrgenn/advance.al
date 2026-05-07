/**
 * Phase 28 — coverage push for users.js POST /work-experience and POST
 * /education array-init branches (L1340-1342, L1408-1410). Triggered when
 * the user document has no workHistory/education array yet — the factory
 * always provides one entry, so we $unset before POST to reach the init.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

describe('users.js — POST /work-experience + /education array-init branches', () => {
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

  it('POST /work-experience initializes workHistory when missing (L1340-1342)', async () => {
    const { user } = await createJobseeker();
    // Unset workHistory entirely
    await User.updateOne(
      { _id: user._id },
      { $unset: { 'profile.jobSeekerProfile.workHistory': 1 } }
    );

    const r = await request(app)
      .post('/api/users/work-experience')
      .set(createAuthHeaders(user))
      .send({ position: 'Engineer', company: 'NewCo' });

    expect(r.status).toBe(200);
    const refreshed = await User.findById(user._id);
    expect(refreshed.profile.jobSeekerProfile.workHistory).toBeInstanceOf(Array);
    expect(refreshed.profile.jobSeekerProfile.workHistory.length).toBe(1);
    expect(refreshed.profile.jobSeekerProfile.workHistory[0].position).toBe('Engineer');
  });

  it('POST /education initializes education when missing (L1408-1410)', async () => {
    const { user } = await createJobseeker();
    await User.updateOne(
      { _id: user._id },
      { $unset: { 'profile.jobSeekerProfile.education': 1 } }
    );

    const r = await request(app)
      .post('/api/users/education')
      .set(createAuthHeaders(user))
      .send({ degree: 'PhD', institution: 'MIT' });

    expect(r.status).toBe(200);
    const refreshed = await User.findById(user._id);
    expect(refreshed.profile.jobSeekerProfile.education).toBeInstanceOf(Array);
    expect(refreshed.profile.jobSeekerProfile.education.find(e => e.degree === 'PhD')).toBeTruthy();
  });
});
