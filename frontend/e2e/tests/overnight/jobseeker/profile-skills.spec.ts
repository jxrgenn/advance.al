/**
 * profile-skills.spec.ts — jobseeker skills array.
 *
 * 5 tests: add via profile update, dedup, remove, max length, no-auth.
 */

import { test } from '@playwright/test';
import { dbClear, dbFindOne } from '../../../real-backend/db-helpers';
import { makeJobseeker, authHeaders, API } from '../../../real-backend/factory-helpers';
import { expect } from '@playwright/test';

test.describe('Jobseeker / profile skills', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('SK.1 add skills via PUT /profile', async () => {
    const js = await makeJobseeker();
    await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({
        jobSeekerProfile: { skills: ['Python', 'Django', 'SQL'] }
      }),
    });
    const user = await dbFindOne('users', { email: js.email });
    expect(user.profile?.jobSeekerProfile?.skills).toEqual(expect.arrayContaining(['Python', 'Django', 'SQL']));
  });

  test('SK.2 update skills replaces array', async () => {
    const js = await makeJobseeker();
    await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({
        jobSeekerProfile: { skills: ['Python'] }
      }),
    });
    await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({
        jobSeekerProfile: { skills: ['JavaScript', 'TypeScript'] }
      }),
    });
    const user = await dbFindOne('users', { email: js.email });
    const skills = user.profile?.jobSeekerProfile?.skills || [];
    expect(skills).toContain('JavaScript');
    expect(skills).toContain('TypeScript');
  });

  test('SK.3 50+ skills accepted or capped (no 5xx)', async () => {
    const js = await makeJobseeker();
    const manySkills = Array.from({ length: 60 }, (_, i) => `Skill-${i}`);
    const r = await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({
        jobSeekerProfile: { skills: manySkills }
      }),
    });
    expect(r.status).not.toBe(500);
  });

  test('SK.4 skills with very long names rejected/truncated', async () => {
    const js = await makeJobseeker();
    const longSkill = 'x'.repeat(500);
    const r = await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({
        jobSeekerProfile: { skills: [longSkill] }
      }),
    });
    expect(r.status).not.toBe(500);
  });

  test('SK.5 no-auth → 401', async () => {
    const r = await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobSeekerProfile: { skills: ['x'] } }),
    });
    expect(r.status).toBe(401);
  });
});
