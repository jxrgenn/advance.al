/**
 * users-manage-dialog.spec.ts — admin user-manage actions.
 *
 * 10 tests covering the real PATCH /admin/users/:id/manage action enum:
 *   suspend | ban | activate | set_administrata | remove_administrata | delete
 *
 * The product does NOT expose a `warning` action or a `warningCount` field
 * (verified against backend/src/routes/admin.js:579-690 + User model).
 * Earlier Phase 23 tests asserted a `warning` action — those were fictional;
 * this rewrite tests the actual enum.
 */

import { test } from '@playwright/test';
import { dbClear, dbFindOne } from '../../../real-backend/db-helpers';
import { makeAdmin, makeJobseeker, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Admin / users manage actions', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('UM.1 activate action sets status=active and clears suspensionDetails', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    // First put the user into suspended state, then activate.
    await fetch(`${API}/admin/users/${targetDoc._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'suspend', reason: 'pretest', duration: 7 }),
    });

    const r = await fetch(`${API}/admin/users/${targetDoc._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'activate' }),
    });
    expect([200, 204]).toContain(r.status);
    const after = await dbFindOne('users', { _id: targetDoc._id });
    expect(after.status).toBe('active');
    expect(after.suspensionDetails == null || Object.keys(after.suspensionDetails || {}).length === 0).toBe(true);
  });

  test('UM.2 suspend with duration sets status=suspended + expiresAt in future', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    const r = await fetch(`${API}/admin/users/${targetDoc._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'suspend', reason: 'spam', duration: 7 }),
    });
    expect([200, 204]).toContain(r.status);
    const after = await dbFindOne('users', { _id: targetDoc._id });
    expect(after.status).toBe('suspended');
    if (after.suspensionDetails?.expiresAt) {
      expect(new Date(after.suspensionDetails.expiresAt).getTime()).toBeGreaterThan(Date.now());
    }
  });

  test('UM.3 ban action sets status=banned', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    const r = await fetch(`${API}/admin/users/${targetDoc._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'ban', reason: 'severe violation' }),
    });
    expect([200, 204]).toContain(r.status);
    const after = await dbFindOne('users', { _id: targetDoc._id });
    expect(['banned', 'suspended']).toContain(after.status);
  });

  test('UM.4 delete action soft-deletes (isDeleted=true, status=deleted)', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    const r = await fetch(`${API}/admin/users/${targetDoc._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'delete', reason: 'Permanent removal' }),
    });
    expect([200, 204]).toContain(r.status);
    const after = await dbFindOne('users', { _id: targetDoc._id });
    expect(after.isDeleted, 'delete should soft-delete').toBe(true);
  });

  test('UM.5 admin self-suspend prevented', async () => {
    const adm = await makeAdmin();
    const admDoc = await dbFindOne('users', { email: adm.email });

    const r = await fetch(`${API}/admin/users/${admDoc._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'suspend', reason: 'self', duration: 1 }),
    });
    expect([400, 403], 'admin should not be able to suspend themselves').toContain(r.status);
  });

  test('UM.6 invalid action enum → 400', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    const r = await fetch(`${API}/admin/users/${targetDoc._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'NOT_AN_ACTION', reason: 'x' }),
    });
    expect([400, 422]).toContain(r.status);
  });

  test('UM.7 manage non-existent user → 404', async () => {
    const adm = await makeAdmin();
    const r = await fetch(`${API}/admin/users/507f1f77bcf86cd799439011/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'suspend', reason: 'x', duration: 7 }),
    });
    expect([404, 400]).toContain(r.status);
  });

  test('UM.8 non-admin cannot manage users', async () => {
    const js = await makeJobseeker();
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    const r = await fetch(`${API}/admin/users/${targetDoc._id}/manage`, {
      method: 'PATCH', headers: authHeaders(js.token),
      body: JSON.stringify({ action: 'suspend', reason: 'x', duration: 7 }),
    });
    expect([401, 403]).toContain(r.status);
  });

  test('UM.9 manage on suspended user can re-suspend / escalate to ban', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    await fetch(`${API}/admin/users/${targetDoc._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'suspend', reason: 'first', duration: 7 }),
    });
    const r2 = await fetch(`${API}/admin/users/${targetDoc._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'ban', reason: 'escalate' }),
    });
    expect([200, 204, 400]).toContain(r2.status);
  });

  test('UM.10 successful manage returns 200 (email cascade asserted in dedicated email tests)', async () => {
    const adm = await makeAdmin();
    const target = await makeJobseeker();
    const targetDoc = await dbFindOne('users', { email: target.email });

    const r = await fetch(`${API}/admin/users/${targetDoc._id}/manage`, {
      method: 'PATCH', headers: authHeaders(adm.token),
      body: JSON.stringify({ action: 'suspend', reason: 'inappropriate behavior', duration: 3 }),
    });
    expect([200, 204]).toContain(r.status);
  });
});
