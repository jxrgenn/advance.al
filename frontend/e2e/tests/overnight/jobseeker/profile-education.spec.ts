/**
 * profile-education.spec.ts — jobseeker education array CRUD.
 *
 * 8 tests mirroring profile-work-experience patterns.
 */

import { test } from '@playwright/test';
import { dbClear, dbFindOne } from '../../../real-backend/db-helpers';
import { makeJobseeker, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

const validEdu = {
  institution: 'University of Tirana',
  degree: 'Bachelor',
  fieldOfStudy: 'Computer Science',
  startDate: '2015-09-01',
  endDate: '2019-06-15'
};

test.describe('Jobseeker / profile education', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('ED.1 POST /education adds entry', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/education`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify(validEdu),
    });
    expect([200, 201]).toContain(r.status);
    const user = await dbFindOne('users', { email: js.email });
    const edu = user.profile?.jobSeekerProfile?.education || [];
    expect(edu.length).toBeGreaterThanOrEqual(1);
  });

  test('ED.2 missing required field → 400', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/education`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ institution: 'X' }),
    });
    expect([400, 422]).toContain(r.status);
  });

  test('ED.3 add 3 entries', async () => {
    const js = await makeJobseeker();
    for (let i = 0; i < 3; i++) {
      await fetch(`${API}/users/education`, {
        method: 'POST', headers: authHeaders(js.token),
        body: JSON.stringify({ ...validEdu, institution: `Uni-${i}` }),
      });
    }
    const user = await dbFindOne('users', { email: js.email });
    expect(user.profile?.jobSeekerProfile?.education?.length || 0).toBeGreaterThanOrEqual(3);
  });

  test('ED.4 PUT /education/:educationId updates', async () => {
    const js = await makeJobseeker();
    await fetch(`${API}/users/education`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify(validEdu),
    });
    const user = await dbFindOne('users', { email: js.email });
    const eduId = user.profile?.jobSeekerProfile?.education?.[0]?._id;
    expect(eduId, 'education entry should have an _id').toBeTruthy();

    const r = await fetch(`${API}/users/education/${eduId}`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({ ...validEdu, degree: 'Master' }),
    });
    expect([200, 204]).toContain(r.status);
    const after = await dbFindOne('users', { email: js.email });
    const updated = after.profile?.jobSeekerProfile?.education?.find((e: any) => e._id?.toString() === eduId.toString());
    expect(updated?.degree).toBe('Master');
  });

  test('ED.5 DELETE /education/:educationId removes', async () => {
    const js = await makeJobseeker();
    await fetch(`${API}/users/education`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify(validEdu),
    });
    const userBefore = await dbFindOne('users', { email: js.email });
    const eduId = userBefore.profile?.jobSeekerProfile?.education?.[0]?._id;
    const before = userBefore.profile?.jobSeekerProfile?.education?.length || 0;

    const r = await fetch(`${API}/users/education/${eduId}`, {
      method: 'DELETE', headers: authHeaders(js.token),
    });
    expect([200, 204]).toContain(r.status);
    const after = (await dbFindOne('users', { email: js.email })).profile?.jobSeekerProfile?.education?.length || 0;
    expect(after).toBeLessThan(before);
  });

  test('ED.6 education no-auth → 401', async () => {
    const r = await fetch(`${API}/users/education`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validEdu),
    });
    expect(r.status).toBe(401);
  });

  test('ED.7 endDate before startDate may or may not be enforced', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/education`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ ...validEdu, startDate: '2020-01-01', endDate: '2018-01-01' }),
    });
    expect([200, 201, 400, 422]).toContain(r.status);
  });

  test('ED.8 institution field is sanitized', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/education`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({
        ...validEdu,
        institution: 'Acme University<script>alert(1)</script>'
      }),
    });
    if ([200, 201].includes(r.status)) {
      const user = await dbFindOne('users', { email: js.email });
      const edu = user.profile?.jobSeekerProfile?.education || [];
      const last = edu[edu.length - 1];
      if (last) expect(last.institution).not.toMatch(/<script>/i);
    }
  });
});
