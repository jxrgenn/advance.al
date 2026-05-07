/**
 * Phase 28 — coverage push for admin.js PATCH /users/:userId/manage
 * delete-action employer cascade (L666-671) and "delete admin → 403" (L654-658).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createAdmin, createVerifiedEmployer } from '../factories/user.factory.js';
import { createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import User from '../../src/models/User.js';

describe('admin.js — delete action: employer cascade + admin protection', () => {
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

  it('deleting an employer cascades isDeleted=true + status=closed on their jobs (L666-671)', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer();
    const job1 = await createJob(emp);
    const job2 = await createJob(emp);

    const r = await request(app)
      .patch(`/api/admin/users/${emp._id}/manage`)
      .set(createAuthHeaders(admin))
      .send({ action: 'delete', reason: 'Spam account' });

    expect(r.status).toBe(200);
    // Employer soft-deleted
    const refreshedEmp = await User.findById(emp._id);
    expect(refreshedEmp.isDeleted).toBe(true);
    expect(refreshedEmp.status).toBe('deleted');
    // Jobs cascaded
    const j1 = await Job.findById(job1._id);
    const j2 = await Job.findById(job2._id);
    expect(j1.isDeleted).toBe(true);
    expect(j1.status).toBe('closed');
    expect(j2.isDeleted).toBe(true);
    expect(j2.status).toBe('closed');
  });

  it('admin cannot delete another admin (L654-658)', async () => {
    const { user: admin1 } = await createAdmin({ email: 'admin1@advance.al' });
    const { user: admin2 } = await createAdmin({ email: 'admin2@advance.al' });

    const r = await request(app)
      .patch(`/api/admin/users/${admin2._id}/manage`)
      .set(createAuthHeaders(admin1))
      .send({ action: 'delete' });

    expect(r.status).toBe(403);
    // admin2 should NOT be deleted
    const refreshed = await User.findById(admin2._id);
    expect(refreshed.isDeleted).toBeFalsy();
  });
});
