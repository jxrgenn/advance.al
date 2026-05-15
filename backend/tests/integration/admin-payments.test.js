/**
 * Integration tests for /api/admin/payments — admin payment dashboard
 * + manual-accept override (QA-G5).
 *
 * Coverage:
 *   - GET /api/admin/payments
 *       - 401 without auth
 *       - 403 when caller is not admin
 *       - 200 + paginated list with employer info populated
 *       - status=pending_payment filter narrows correctly
 *       - status=paid filter narrows correctly
 *       - employerEmail substring filter narrows correctly
 *   - POST /api/admin/payments/:jobId/manual-accept
 *       - 401 without auth
 *       - 403 when caller is not admin
 *       - 400 when reason missing/too-short
 *       - 400 when jobId malformed
 *       - 404 when job missing
 *       - 409 when job is already paid
 *       - 200 + flips job to active/paid + paymentMethod=admin-manual
 *         + paidAt set + PaymentEvent('admin_manual_accept') logged
 *         with admin email + reason in notes
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createVerifiedEmployer, createJobseeker, createAdmin } from '../factories/user.factory.js';
import { createJobPendingPayment, createJob } from '../factories/job.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import Job from '../../src/models/Job.js';
import PaymentEvent from '../../src/models/PaymentEvent.js';

describe('Admin payments — integration', () => {
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

  // ============================================================
  // GET /api/admin/payments
  // ============================================================
  describe('GET /api/admin/payments', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/admin/payments');
      expect(res.status).toBe(401);
    });

    it('returns 403 when caller is not admin', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const res = await request(app).get('/api/admin/payments').set(createAuthHeaders(emp));
      expect(res.status).toBe(403);
    });

    it('returns paginated list with employer info populated', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);

      const res = await request(app)
        .get('/api/admin/payments?status=pending_payment')
        .set(createAuthHeaders(admin));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.payments)).toBe(true);
      expect(res.body.data.payments.length).toBe(1);
      expect(res.body.data.payments[0]._id).toBe(String(job._id));
      expect(res.body.data.payments[0].employer.email).toBe(emp.email);
      expect(res.body.data.pagination.total).toBe(1);
    });

    it('status=paid filter excludes pending_payment jobs', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      await createJobPendingPayment(emp);
      const paidJob = await createJob(emp, {
        status: 'active',
        paymentStatus: 'paid',
        paymentMethod: 'paysera',
        paidAt: new Date(),
      });

      const res = await request(app)
        .get('/api/admin/payments?status=paid')
        .set(createAuthHeaders(admin));

      expect(res.status).toBe(200);
      expect(res.body.data.payments.length).toBe(1);
      expect(res.body.data.payments[0]._id).toBe(String(paidJob._id));
    });

    it('employerEmail substring filter narrows by email', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp1 } = await createVerifiedEmployer({ email: 'targetfilter@example.com' });
      const { user: emp2 } = await createVerifiedEmployer({ email: 'other@example.com' });
      await createJobPendingPayment(emp1);
      await createJobPendingPayment(emp2);

      const res = await request(app)
        .get('/api/admin/payments?status=pending_payment&employerEmail=targetfilter')
        .set(createAuthHeaders(admin));

      expect(res.status).toBe(200);
      expect(res.body.data.payments.length).toBe(1);
      expect(res.body.data.payments[0].employer.email).toBe('targetfilter@example.com');
    });
  });

  // ============================================================
  // POST /api/admin/payments/:jobId/manual-accept
  // ============================================================
  describe('POST /api/admin/payments/:jobId/manual-accept', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/admin/payments/507f1f77bcf86cd799439011/manual-accept')
        .send({ reason: 'lost callback per Paysera ticket #12345' });
      expect(res.status).toBe(401);
    });

    it('returns 403 when caller is not admin', async () => {
      const { user: emp } = await createVerifiedEmployer();
      const res = await request(app)
        .post('/api/admin/payments/507f1f77bcf86cd799439011/manual-accept')
        .set(createAuthHeaders(emp))
        .send({ reason: 'lost callback per Paysera ticket #12345' });
      expect(res.status).toBe(403);
    });

    it('returns 400 when reason is missing', async () => {
      const { user: admin } = await createAdmin();
      const res = await request(app)
        .post('/api/admin/payments/507f1f77bcf86cd799439011/manual-accept')
        .set(createAuthHeaders(admin))
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 when reason is too short', async () => {
      const { user: admin } = await createAdmin();
      const res = await request(app)
        .post('/api/admin/payments/507f1f77bcf86cd799439011/manual-accept')
        .set(createAuthHeaders(admin))
        .send({ reason: 'ok' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when jobId is malformed', async () => {
      const { user: admin } = await createAdmin();
      const res = await request(app)
        .post('/api/admin/payments/not-an-id/manual-accept')
        .set(createAuthHeaders(admin))
        .send({ reason: 'lost callback per Paysera ticket #12345' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when job not found', async () => {
      const { user: admin } = await createAdmin();
      const res = await request(app)
        .post('/api/admin/payments/507f1f77bcf86cd799439011/manual-accept')
        .set(createAuthHeaders(admin))
        .send({ reason: 'lost callback per Paysera ticket #12345' });
      expect(res.status).toBe(404);
    });

    it('returns 409 when job is already paid', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJob(emp, {
        status: 'active',
        paymentStatus: 'paid',
        paymentMethod: 'paysera',
        paidAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/admin/payments/${job._id}/manual-accept`)
        .set(createAuthHeaders(admin))
        .send({ reason: 'redundant manual accept' });
      expect(res.status).toBe(409);
    });

    it('flips job to active+paid, sets paymentMethod=admin-manual, logs PaymentEvent', async () => {
      const { user: admin } = await createAdmin();
      const { user: emp } = await createVerifiedEmployer();
      const job = await createJobPendingPayment(emp);

      const reason = 'Paysera ticket #98765 confirms payment received offline';
      const res = await request(app)
        .post(`/api/admin/payments/${job._id}/manual-accept`)
        .set(createAuthHeaders(admin))
        .send({ reason });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.paymentStatus).toBe('paid');
      expect(res.body.data.paymentMethod).toBe('admin-manual');

      const updated = await Job.findById(job._id);
      expect(updated.status).toBe('active');
      expect(updated.paymentStatus).toBe('paid');
      expect(updated.paymentMethod).toBe('admin-manual');
      expect(updated.paidAt).toBeInstanceOf(Date);
      expect(updated.paymentId).toMatch(/^admin-/);

      const events = await PaymentEvent.find({ jobId: job._id, event: 'admin_manual_accept' }).lean();
      expect(events.length).toBe(1);
      expect(events[0].notes).toContain(reason);
      expect(events[0].notes).toContain(String(admin.email || admin._id));
    });
  });
});
