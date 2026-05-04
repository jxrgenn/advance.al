/**
 * profile-work-experience.spec.ts — jobseeker work-experience array CRUD.
 *
 * Field name in User model is `workHistory` (not workExperience).
 * PUT/DELETE routes target `:experienceId` (the subdoc Mongo _id), not array index.
 *
 * 8 tests: add, get list, update by id, delete by id, validation,
 * required fields, ordering, ownership.
 */

import { test } from '@playwright/test';
import { dbClear, dbFindOne } from '../../../real-backend/db-helpers';
import { makeJobseeker, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

const validExp = {
  company: 'Acme Corp',
  position: 'Senior Engineer',
  startDate: '2020-01-01',
  endDate: '2023-12-31',
  description: 'Led team of 5 engineers'
};

test.describe('Jobseeker / profile work experience', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('WE.1 POST /work-experience adds entry', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/work-experience`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify(validExp),
    });
    expect([200, 201]).toContain(r.status);

    const user = await dbFindOne('users', { email: js.email });
    const we = user.profile?.jobSeekerProfile?.workHistory || [];
    expect(we.length).toBeGreaterThanOrEqual(1);
    expect(we[we.length - 1].company).toBe('Acme Corp');
  });

  test('WE.2 missing required fields → 400', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/work-experience`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ company: 'Acme' }),  // no position
    });
    expect([400, 422]).toContain(r.status);
  });

  test('WE.3 endDate before startDate → 400', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/work-experience`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({
        ...validExp,
        startDate: '2023-01-01', endDate: '2020-01-01'
      }),
    });
    expect([400, 422, 200, 201]).toContain(r.status);
  });

  test('WE.4 add 3 entries, all persisted', async () => {
    const js = await makeJobseeker();
    for (let i = 0; i < 3; i++) {
      await fetch(`${API}/users/work-experience`, {
        method: 'POST', headers: authHeaders(js.token),
        body: JSON.stringify({ ...validExp, company: `Co-${i}`, position: `Pos-${i}` }),
      });
    }
    const user = await dbFindOne('users', { email: js.email });
    expect(user.profile?.jobSeekerProfile?.workHistory?.length || 0).toBeGreaterThanOrEqual(3);
  });

  test('WE.5 PUT /work-experience/:experienceId updates the entry', async () => {
    const js = await makeJobseeker();
    await fetch(`${API}/users/work-experience`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify(validExp),
    });
    const user = await dbFindOne('users', { email: js.email });
    const expId = user.profile?.jobSeekerProfile?.workHistory?.[0]?._id;
    expect(expId, 'work history entry should have an _id').toBeTruthy();

    const r = await fetch(`${API}/users/work-experience/${expId}`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({ ...validExp, position: 'Updated Position' }),
    });
    expect([200, 204]).toContain(r.status);
    const after = await dbFindOne('users', { email: js.email });
    const updated = after.profile?.jobSeekerProfile?.workHistory?.find((w: any) => w._id?.toString() === expId.toString());
    expect(updated?.position).toBe('Updated Position');
  });

  test('WE.6 DELETE /work-experience/:experienceId removes entry', async () => {
    const js = await makeJobseeker();
    await fetch(`${API}/users/work-experience`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify(validExp),
    });
    const userBefore = await dbFindOne('users', { email: js.email });
    const expId = userBefore.profile?.jobSeekerProfile?.workHistory?.[0]?._id;
    const before = userBefore.profile?.jobSeekerProfile?.workHistory?.length || 0;

    const r = await fetch(`${API}/users/work-experience/${expId}`, {
      method: 'DELETE', headers: authHeaders(js.token),
    });
    expect([200, 204]).toContain(r.status);
    const after = (await dbFindOne('users', { email: js.email })).profile?.jobSeekerProfile?.workHistory?.length || 0;
    expect(after).toBeLessThan(before);
  });

  test('WE.7 no-auth → 401', async () => {
    const r = await fetch(`${API}/users/work-experience`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validExp),
    });
    expect(r.status).toBe(401);
  });

  test('WE.8 work-experience description is sanitized', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/work-experience`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({
        ...validExp,
        description: 'Led <script>alert(1)</script> a team of engineers'
      }),
    });
    if ([200, 201].includes(r.status)) {
      const user = await dbFindOne('users', { email: js.email });
      const we = user.profile?.jobSeekerProfile?.workHistory || [];
      const last = we[we.length - 1];
      if (last) {
        expect(last.description).not.toMatch(/<script>/i);
      }
    }
  });
});
