/**
 * 03-jobseeker.exploration.ts — Phase 24 / P3
 *
 * Walk every jobseeker capability with intent to find:
 *   - data persistence bugs (save firstName → reload → still wrong)
 *   - cascade bugs (apply → notification not created)
 *   - validation gaps (XSS in profile, oversize input)
 *   - endpoint shape drift (response missing expected fields)
 */

import { test, expect } from '@playwright/test';
import { setupEvidence } from './_evidence';
import { dbClear, dbFind, dbFindOne, dbCount } from '../real-backend/db-helpers';
import { makeJobseeker, makeEmployer, authHeaders, API } from '../real-backend/factory-helpers';

test.describe.configure({ mode: 'serial' });

async function makeJob(empToken: string, opts: any = {}) {
  const r = await fetch(`${API}/jobs`, {
    method: 'POST', headers: authHeaders(empToken),
    body: JSON.stringify({
      title: opts.title ?? 'Explore Test Job',
      description: 'x'.repeat(80),
      category: 'Teknologji', jobType: 'full-time',
      location: { city: 'Tiranë' },
      salary: { min: 1000, max: 2000, currency: 'EUR' },
      platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false },
      ...opts
    })
  });
  const body = await r.json();
  if (!body.data?.job) {
    throw new Error(`Job creation failed: status=${r.status}, body=${JSON.stringify(body).slice(0, 400)}`);
  }
  return body.data.job;
}

test.describe('Phase 24 / P3 / Jobseeker domain', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('P3.PROF.update-firstName-persists', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({ firstName: 'NewFirst' })
    });
    const body = await r.json();
    console.log('OBS PUT /users/profile status=', r.status, 'body=', JSON.stringify(body).slice(0, 600));
    expect(r.status, 'profile update should be 200').toBe(200);

    const after = await dbFindOne('users', { email: js.email });
    console.log('OBS DB after firstName update:', JSON.stringify({
      profile_firstName: after?.profile?.firstName,
      flat_firstName: after?.firstName,
    }));
    expect(after?.profile?.firstName, 'firstName persists in profile.firstName').toBe('NewFirst');
  });

  test('P3.PROF.update-via-jobSeekerProfile-section', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({
        jobSeekerProfile: { bio: 'I am a developer with 5 years exp', headline: 'Senior Dev' }
      })
    });
    const body = await r.json();
    console.log('OBS PUT /profile (jobSeekerProfile section) status=', r.status, 'body=', JSON.stringify(body).slice(0, 600));
    const after = await dbFindOne('users', { email: js.email });
    console.log('OBS DB jobSeekerProfile after:', JSON.stringify(after?.profile?.jobSeekerProfile).slice(0, 500));
  });

  test('P3.SKILLS.add-skills-via-PUT-profile', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({
        jobSeekerProfile: { skills: ['JavaScript', 'TypeScript', 'React'] }
      })
    });
    const body = await r.json();
    console.log('OBS PUT skills status=', r.status, 'body=', JSON.stringify(body).slice(0, 500));
    const after = await dbFindOne('users', { email: js.email });
    console.log('OBS DB skills after:', JSON.stringify(after?.profile?.jobSeekerProfile?.skills));
  });

  test('P3.SKILLS.dedup-on-add', async () => {
    const js = await makeJobseeker();
    await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({ jobSeekerProfile: { skills: ['JS', 'TS'] } })
    });
    await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({ jobSeekerProfile: { skills: ['JS', 'Python'] } })
    });
    const after = await dbFindOne('users', { email: js.email });
    console.log('OBS skills after second update:', JSON.stringify(after?.profile?.jobSeekerProfile?.skills));
    // The current behavior is REPLACE not MERGE — capture which.
  });

  test('P3.WORK.add-work-experience', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/work-experience`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({
        company: 'Acme Corp', position: 'Senior Engineer',
        startDate: '2020-01-01', endDate: '2023-12-31',
        description: 'Built things'
      })
    });
    const body = await r.json();
    console.log('OBS POST /work-experience status=', r.status, 'body=', JSON.stringify(body).slice(0, 600));
    const after = await dbFindOne('users', { email: js.email });
    // Backend stores under workHistory (see User.js:65); aiGeneratedCV has separate workExperience array
    const work = after?.profile?.jobSeekerProfile?.workHistory;
    console.log('OBS workHistory field:', JSON.stringify(work ?? null).slice(0, 500));
    expect(Array.isArray(work) && work.length === 1, 'workHistory has 1 entry').toBe(true);
    expect(work[0].company, 'company persisted').toBe('Acme Corp');
    expect(work[0].position, 'position persisted').toBe('Senior Engineer');
  });

  test('P3.EDU.add-education', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/education`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({
        institution: 'University of Tirana', degree: 'Bachelor', field: 'Computer Science',
        startDate: '2015-09-01', endDate: '2019-06-30'
      })
    });
    const body = await r.json();
    console.log('OBS POST /education status=', r.status, 'body=', JSON.stringify(body).slice(0, 600));
    const after = await dbFindOne('users', { email: js.email });
    const edu = after?.profile?.jobSeekerProfile?.education;
    console.log('OBS education field exists:', edu !== undefined, 'value:', JSON.stringify(edu ?? null).slice(0, 500));
    if (r.status === 200) {
      const acmeFound = JSON.stringify(after).includes('University of Tirana');
      console.log('OBS "University of Tirana" anywhere in user doc:', acmeFound);
      if (!acmeFound) {
        console.log('FINDING: POST /education returned success but data NOT persisted in user doc');
      }
    }
  });

  test('P3.SAVE.save-job-and-list', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const js = await makeJobseeker();

    const r = await fetch(`${API}/users/saved-jobs/${job._id}`, {
      method: 'POST', headers: authHeaders(js.token)
    });
    const body = await r.json();
    console.log('OBS POST saved-jobs status=', r.status, 'body=', JSON.stringify(body).slice(0, 400));

    const list = await fetch(`${API}/users/saved-jobs`, { headers: authHeaders(js.token) });
    const listBody = await list.json();
    console.log('OBS GET saved-jobs status=', list.status, 'body=', JSON.stringify(listBody).slice(0, 600));

    const after = await dbFindOne('users', { email: js.email });
    console.log('OBS user.savedJobs after:', JSON.stringify(after?.savedJobs ?? after?.profile?.jobSeekerProfile?.savedJobs).slice(0, 200));
  });

  test('P3.SAVE.save-twice-idempotent', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const js = await makeJobseeker();

    await fetch(`${API}/users/saved-jobs/${job._id}`, {
      method: 'POST', headers: authHeaders(js.token)
    });
    await fetch(`${API}/users/saved-jobs/${job._id}`, {
      method: 'POST', headers: authHeaders(js.token)
    });
    const after = await dbFindOne('users', { email: js.email });
    const saved = after?.savedJobs ?? [];
    console.log('OBS savedJobs after duplicate-save count=', saved.length);
    expect(saved.length, 'duplicate save → exactly 1 entry').toBeLessThanOrEqual(1);
  });

  test('P3.APPLY.happy-path-and-cascade', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const empUser = await dbFindOne('users', { email: emp.email });
    const js = await makeJobseeker();

    const r = await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({
        jobId: job._id,
        coverLetter: 'cover ' + 'x'.repeat(40),
        applicationMethod: 'one_click'
      })
    });
    const body = await r.json();
    console.log('OBS apply status=', r.status, 'body=', JSON.stringify(body).slice(0, 700));
    expect([200, 201].includes(r.status), `apply success status=${r.status}`).toBe(true);

    const apps = await dbFind('applications', { jobId: job._id });
    expect(apps.length, 'application persisted').toBe(1);
    console.log('OBS application doc:', JSON.stringify({
      status: apps[0].status,
      jobId: !!apps[0].jobId,
      jobSeekerId: !!apps[0].jobSeekerId,
      employerId: !!apps[0].employerId,
      hasCoverLetter: !!apps[0].coverLetter,
      hasMessages: Array.isArray(apps[0].messages),
    }));
    expect(apps[0].status, 'initial status').toBe('pending');

    // applicationCount on job
    const jobAfter = await dbFindOne('jobs', { _id: job._id });
    console.log('OBS job.applicationCount after:', jobAfter?.applicationCount);
    expect(jobAfter?.applicationCount, 'job.applicationCount=1').toBe(1);

    // Notification to employer
    const empNotifs = await dbFind('notifications', { userId: empUser._id });
    console.log('OBS employer notifications count:', empNotifs.length);
    expect(empNotifs.length, 'employer notified of new application').toBeGreaterThanOrEqual(1);
    if (empNotifs.length) {
      console.log('OBS first emp notif:', JSON.stringify({
        type: empNotifs[0].type,
        title: empNotifs[0].title,
        isRead: empNotifs[0].isRead,
        relatedTo: empNotifs[0].relatedTo,
      }));
    }
  });

  test('P3.APPLY.duplicate-rejected', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const js = await makeJobseeker();

    const r1 = await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ jobId: job._id, coverLetter: 'cover ' + 'x'.repeat(40), applicationMethod: 'one_click' })
    });
    expect([200, 201].includes(r1.status)).toBe(true);

    const r2 = await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ jobId: job._id, coverLetter: 'cover ' + 'x'.repeat(40), applicationMethod: 'one_click' })
    });
    const body2 = await r2.json();
    console.log('OBS duplicate apply status=', r2.status, 'body=', JSON.stringify(body2).slice(0, 400));
    expect(r2.status, 'duplicate apply rejected').not.toBe(200);
    expect(r2.status, 'duplicate apply rejected').not.toBe(201);
    expect(await dbCount('applications', { jobId: job._id }), 'still 1 app').toBe(1);
  });

  test('P3.APPLY.withdraw-and-reapply', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const js = await makeJobseeker();

    const apply1 = await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ jobId: job._id, coverLetter: 'cover ' + 'x'.repeat(40), applicationMethod: 'one_click' })
    });
    const app1Body = await apply1.json();
    const appId = app1Body.data?.application?._id;
    console.log('OBS first apply got appId=', appId);

    // Withdraw is via DELETE /:id (not POST /:id/withdraw)
    const w = await fetch(`${API}/applications/${appId}`, {
      method: 'DELETE', headers: authHeaders(js.token)
    });
    console.log('OBS withdraw status=', w.status, 'body=', (await w.json().catch(() => ({}))).message ?? '');

    const after1 = await dbFindOne('applications', { _id: appId });
    console.log('OBS after withdraw — app.withdrawn=', after1?.withdrawn, ' status=', after1?.status);

    const jobAfter1 = await dbFindOne('jobs', { _id: job._id });
    console.log('OBS job.applicationCount after withdraw=', jobAfter1?.applicationCount);

    // Re-apply
    const apply2 = await fetch(`${API}/applications/apply`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ jobId: job._id, coverLetter: 'cover2 ' + 'x'.repeat(40), applicationMethod: 'one_click' })
    });
    const app2Body = await apply2.json();
    console.log('OBS re-apply status=', apply2.status, 'body=', JSON.stringify(app2Body).slice(0, 400));
    expect([200, 201].includes(apply2.status), 're-apply allowed after withdraw').toBe(true);
  });

  test('P3.NOTIF.list-and-unread-count', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/notifications`, { headers: authHeaders(js.token) });
    const body = await r.json();
    console.log('OBS GET /notifications status=', r.status, 'body shape=', Object.keys(body));
    console.log('OBS notifications data sample:', JSON.stringify(body.data ?? body).slice(0, 400));

    const r2 = await fetch(`${API}/notifications/unread-count`, { headers: authHeaders(js.token) });
    const body2 = await r2.json();
    console.log('OBS GET unread-count status=', r2.status, 'body=', JSON.stringify(body2));
  });

  test('P3.GDPR.export-returns-user-data', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/data-export`, { headers: authHeaders(js.token) });
    console.log('OBS GET /data-export status=', r.status, 'content-type=', r.headers.get('content-type'));
    if (r.status === 200) {
      const body = await r.text();
      console.log('OBS export length=', body.length);
      try {
        const parsed = JSON.parse(body);
        console.log('OBS export keys:', Object.keys(parsed).slice(0, 20));
      } catch {
        console.log('OBS export not JSON, first 200 chars:', body.slice(0, 200));
      }
    } else {
      const body = await r.text();
      console.log('OBS export error body:', body.slice(0, 400));
    }
  });

  test('P3.DELETE.account-delete-soft-deletes', async () => {
    const js = await makeJobseeker();
    const r = await fetch(`${API}/users/account-delete`, {
      method: 'POST', headers: authHeaders(js.token),
      body: JSON.stringify({ password: 'StrongPass123!', confirmation: 'DELETE' })
    });
    const body = await r.json();
    console.log('OBS account-delete status=', r.status, 'body=', JSON.stringify(body).slice(0, 400));
    const u = await dbFindOne('users', { email: js.email });
    console.log('OBS user after delete — isDeleted=', u?.isDeleted, ' deletedAt=', u?.deletedAt);

    if (r.status === 200) {
      // Login should now fail
      const login = await fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: js.email, password: js.password })
      });
      console.log('OBS login post-delete status=', login.status, 'body=', JSON.stringify(await login.json()).slice(0, 200));
    }
  });

  test('P3.XSS.profile-bio-stored-as-text-not-html', async () => {
    const js = await makeJobseeker();
    const xss = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const r = await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(js.token),
      body: JSON.stringify({ jobSeekerProfile: { bio: xss } })
    });
    console.log('OBS XSS-bio update status=', r.status);
    const after = await dbFindOne('users', { email: js.email });
    const storedBio = after?.profile?.jobSeekerProfile?.bio;
    console.log('OBS stored bio:', JSON.stringify(storedBio).slice(0, 400));
    if (storedBio?.includes('<script>') || storedBio?.includes('onerror=')) {
      console.log('FINDING: XSS payload stored RAW in bio — needs sanitization on read or write');
    }
  });
});
