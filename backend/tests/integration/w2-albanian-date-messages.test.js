/**
 * Wave 2 (W2-5 #10, backend part) — dates in server messages.
 *
 * The suspension message formatted the end date with
 * toLocaleDateString('sq-AL') and no time zone: on a UTC server a
 * suspension ending at 00:30 Tirana time printed the previous day, and a
 * runtime without Albanian ICU data printed English / "M10"-style output.
 * Both the login route and the authenticate middleware now use
 * lib/albanianDate.js (Tirana time, Albanian month names, 24-hour clock).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createSuspendedUser } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

// 23:30 UTC on 31 Dec = 00:30 on 1 Jan in Tirana (UTC+1 in winter) — the
// naive UTC formatting would have said "31 dhjetor 2099".
const EXPIRES_AT = new Date('2099-12-31T23:30:00.000Z');
const EXPECTED = 'Llogaria juaj është pezulluar deri më 1 janar 2100, ora 00:30. Arsyeja: Mesazhe spam';

describe('W2-5 — suspension end date in Albanian, Tirana time', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  async function suspended(email) {
    const { user, plainPassword } = await createSuspendedUser('jobseeker', { email });
    await User.updateOne(
      { _id: user._id },
      { $set: { 'suspensionDetails.expiresAt': EXPIRES_AT, 'suspensionDetails.reason': 'Mesazhe spam' } }
    );
    return { user, plainPassword };
  }

  it('POST /api/auth/login → exact Albanian message with the Tirana calendar day', async () => {
    const { plainPassword } = await suspended('w2-susp-login@example.com');
    const r = await request(app)
      .post('/api/auth/login')
      .send({ email: 'w2-susp-login@example.com', password: plainPassword });
    expect(r.status).toBe(401);
    expect(r.body.message).toBe(EXPECTED);
  });

  it('authenticate middleware (GET /api/auth/me with a token) → the same exact message', async () => {
    const { user } = await suspended('w2-susp-mw@example.com');
    const fresh = await User.findById(user._id);
    const r = await request(app).get('/api/auth/me').set(createAuthHeaders(fresh));
    expect(r.status).toBe(401);
    expect(r.body.message).toBe(EXPECTED);
  });
});
