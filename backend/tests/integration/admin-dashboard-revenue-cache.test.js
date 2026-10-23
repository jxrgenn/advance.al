/**
 * Admin dashboard revenue card must not serve a stale cached total after money
 * changes. GET /api/admin/dashboard-stats is cached for 5 minutes under
 * 'admin:dashboard'; only full refunds that closed the job cleared it, so a
 * partial refund (admin Pagesat or the client's Stripe Dashboard) left the old
 * revenue on screen even though the frontend re-requested it.
 *
 * Upstash is an external service and is disabled in tests, so its wrapper
 * (src/config/redis.js) is replaced by an in-memory store with the same
 * contract (values JSON-stringified on set, returned as stored on get).
 * Stripe is replaced at the SDK network boundary only (payments.helper).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, jest } from '@jest/globals';

const store = new Map();
jest.unstable_mockModule('../../src/config/redis.js', () => ({
  redis: null,
  cacheGet: async (key) => (store.has(key) ? store.get(key) : null),
  cacheSet: async (key, value) => { store.set(key, JSON.stringify(value)); },
  cacheDelete: async (key) => { store.delete(key); },
  cacheDeletePattern: async () => {},
  cacheGetOrSet: async (key, fetchFn) => fetchFn(),
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../../server.js');
const { connectTestDB, closeTestDB, clearTestDB } = await import('../setup/testDb.js');
const { seedLocations } = await import('../fixtures/locations.fixture.js');
const { createVerifiedEmployer, createAdmin } = await import('../factories/user.factory.js');
const { createJobPendingPayment } = await import('../factories/job.factory.js');
const { createAuthHeaders } = await import('../helpers/auth.helper.js');
const { default: PaymentOrder } = await import('../../src/models/PaymentOrder.js');
const {
  savePaymentEnv, restorePaymentEnv, useFakeStripe, makeFakeStripe, enablePaidPosting, ensurePaymentIndexes,
  stubPaymentSideEffects, drainSideEffects, stripeEvent, postStripeEvent,
} = await import('../helpers/payments.helper.js');

describe('GET /api/admin/dashboard-stats — revenue cache is cleared when money changes', () => {
  let fake;
  let admin;

  beforeAll(async () => {
    savePaymentEnv();
    await connectTestDB();
    await seedLocations();
    await ensurePaymentIndexes();
  });

  beforeEach(async () => {
    fake = useFakeStripe(makeFakeStripe());
    stubPaymentSideEffects();
    await enablePaidPosting();
    ({ user: admin } = await createAdmin());
  });

  afterEach(async () => {
    await drainSideEffects();
    store.clear();
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    restorePaymentEnv();
    await closeTestDB();
  });

  const adminPost = (path, body) => request(app).post(path).set(createAuthHeaders(admin)).send(body);
  const revenue = async () => {
    const r = await request(app).get('/api/admin/dashboard-stats').set(createAuthHeaders(admin));
    expect(r.status).toBe(200);
    return r.body.data.totalRevenue;
  };

  it('admin partial refund in Pagesat: the next dashboard read shows the reduced revenue, not the cached one', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    const accept = await adminPost(`/api/admin/payments/${job._id}/manual-accept`, { reason: 'bank transfer seen' });
    expect(accept.status).toBe(200);
    const { orderId } = accept.body.data;

    expect(await revenue()).toBe(35);
    expect(store.has('admin:dashboard')).toBe(true);

    const partial = await adminPost(`/api/admin/payments/orders/${orderId}/refund`, { reason: 'goodwill partial', amountCents: 1000 });
    expect(partial.status).toBe(200);
    expect(partial.body.data).toMatchObject({ status: 'partially_refunded', refundedEur: 10, jobClosed: false });
    expect(store.has('admin:dashboard')).toBe(false);
    expect(await revenue()).toBe(25);

    const rest = await adminPost(`/api/admin/payments/orders/${orderId}/refund`, { reason: 'rest of it', amountCents: 2500 });
    expect(rest.status).toBe(200);
    expect(rest.body.data.status).toBe('refunded');
    expect(await revenue()).toBe(0);
  });

  it('partial refund made in the Stripe Dashboard (charge.refunded webhook): the next dashboard read is fresh', async () => {
    const { user: emp } = await createVerifiedEmployer();
    const job = await createJobPendingPayment(emp);
    const c = await request(app).post('/api/payments/checkout').set(createAuthHeaders(emp)).send({ jobId: String(job._id), tier: 'promoted' });
    expect(c.status).toBe(200);
    const paid = fake.markPaid(fake.lastSession().id);
    const done = await postStripeEvent(request, app, stripeEvent('checkout.session.completed', paid));
    expect(done.status).toBe(200);

    expect(await revenue()).toBe(49);
    expect(store.has('admin:dashboard')).toBe(true);

    const hook = await postStripeEvent(request, app, stripeEvent('charge.refunded', {
      id: 'ch_test_partial', payment_intent: paid.payment_intent, amount: 4900, amount_refunded: 1900, refunded: false, currency: 'eur', metadata: {},
    }));
    expect(hook.status).toBe(200);
    const order = await PaymentOrder.findOne({ orderId: c.body.data.orderId }).lean();
    expect(order.status).toBe('partially_refunded');
    expect(order.refundedCents).toBe(1900);
    expect(await revenue()).toBe(30);
  });
});
