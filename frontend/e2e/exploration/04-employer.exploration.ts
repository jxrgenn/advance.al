/**
 * 04-employer.exploration.ts — Phase 24 / P4
 *
 * Walk every employer capability with intent to find:
 *   - data persistence + cascade gaps in posting/editing/closing/renewing
 *   - applicant list ownership gaps (employer A sees employer B's data)
 *   - status transition validation (jobseeker → status forward-only)
 *   - messaging integrity (XSS, oversize, blank)
 *   - company profile sanitization
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

async function makeApply(jsToken: string, jobId: string, coverLetter = 'cover ' + 'x'.repeat(40)) {
  const r = await fetch(`${API}/applications/apply`, {
    method: 'POST', headers: authHeaders(jsToken),
    body: JSON.stringify({ jobId, coverLetter, applicationMethod: 'one_click' })
  });
  const body = await r.json();
  if (!body.data?.application) {
    throw new Error(`Apply failed: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.data.application;
}

test.describe('Phase 24 / P4 / Employer domain', () => {
  test.beforeEach(async () => { await dbClear(); });

  test('P4.POST.full-job-shape', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'Senior Developer Role',
        description: 'We need a great developer ' + 'x'.repeat(60),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë', region: 'Tiranë' },
        salary: { min: 1500, max: 3000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: true, partTime: false, administrata: false, sezonale: false },
        experienceLevel: '2-5'
      })
    });
    const body = await r.json();
    console.log('OBS POST /jobs status=', r.status, 'body=', JSON.stringify(body).slice(0, 800));
    expect(r.status).toBe(201);
    expect(body.data?.job?._id).toBeTruthy();
    const job = body.data.job;
    console.log('OBS new job: status=', job.status, ' applicationCount=', job.applicationCount);
    // Inspect Location collection
    const locs = await dbFind('locations', { city: 'Tiranë' });
    console.log('OBS locations[Tiranë]:', JSON.stringify(locs.map((l: any) => ({ city: l.city, jobCount: l.jobCount }))));
  });

  test('P4.POST.invalid-category-rejected', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'Bad Category Job', description: 'x'.repeat(80),
        category: 'NotARealCategory', jobType: 'full-time',
        location: { city: 'Tiranë' }, salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const body = await r.json();
    console.log('OBS bad-category status=', r.status, 'body=', JSON.stringify(body).slice(0, 400));
    expect(r.status).toBe(400);
  });

  test('P4.POST.salary-min-greater-than-max', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'Bad Salary Job', description: 'x'.repeat(80),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, salary: { min: 5000, max: 1000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const body = await r.json();
    console.log('OBS bad-salary status=', r.status, 'body=', JSON.stringify(body).slice(0, 400));
    expect(r.status).toBe(400);
  });

  test('P4.POST.5-platform-categories-all-true', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const r = await fetch(`${API}/jobs`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'All-Categories Job', description: 'x'.repeat(80),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: true, ngaShtepia: true, partTime: true, administrata: true, sezonale: true }
      })
    });
    console.log('OBS all-categories status=', r.status);
    expect(r.status).toBe(201);
  });

  test('P4.EDIT.title-change-persists', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token, { title: 'Original Title' });

    const r = await fetch(`${API}/jobs/${job._id}`, {
      method: 'PUT', headers: authHeaders(emp.token),
      body: JSON.stringify({
        title: 'Updated Title',
        description: 'Updated description ' + 'x'.repeat(60),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const body = await r.json();
    console.log('OBS PUT /jobs status=', r.status, 'body=', JSON.stringify(body).slice(0, 400));
    if (r.status !== 200) {
      console.log('OBS edit failure full body=', JSON.stringify(body));
    }
    const after = await dbFindOne('jobs', { _id: job._id });
    console.log('OBS job title after:', after?.title);
  });

  test('P4.EDIT.peer-employer-cannot-edit-anothers-job', async () => {
    const empA = await makeEmployer({ preApprove: true, companyName: 'A Inc' });
    const empB = await makeEmployer({ preApprove: true, companyName: 'B Inc' });
    const job = await makeJob(empA.token);

    const r = await fetch(`${API}/jobs/${job._id}`, {
      method: 'PUT', headers: authHeaders(empB.token),
      body: JSON.stringify({
        title: 'Hijacked Title',
        description: 'Hijacked ' + 'x'.repeat(60),
        category: 'Teknologji', jobType: 'full-time',
        location: { city: 'Tiranë' }, salary: { min: 1000, max: 2000, currency: 'EUR' },
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: false, administrata: false, sezonale: false }
      })
    });
    const body = await r.json();
    console.log('OBS peer-edit status=', r.status, 'body=', JSON.stringify(body).slice(0, 300));
    expect(r.status, 'peer should be rejected').not.toBe(200);
    expect(r.status, 'peer should be 403/404').not.toBe(201);
    const after = await dbFindOne('jobs', { _id: job._id });
    expect(after.title, 'title NOT hijacked').not.toBe('Hijacked Title');
  });

  test('P4.DELETE.soft-delete-keeps-applications', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const js = await makeJobseeker();
    await makeApply(js.token, job._id);

    const r = await fetch(`${API}/jobs/${job._id}`, {
      method: 'DELETE', headers: authHeaders(emp.token)
    });
    const body = await r.json();
    console.log('OBS DELETE /jobs status=', r.status, 'body=', JSON.stringify(body).slice(0, 300));

    const jobAfter = await dbFindOne('jobs', { _id: job._id });
    console.log('OBS job after delete:', JSON.stringify({
      isDeleted: jobAfter?.isDeleted,
      status: jobAfter?.status,
    }));

    const apps = await dbFind('applications', { jobId: job._id });
    console.log('OBS applications after job delete count=', apps.length);
    expect(apps.length, 'applications preserved').toBe(1);
  });

  test('P4.STATUS.close-then-renew', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);

    const close = await fetch(`${API}/jobs/${job._id}/status`, {
      method: 'PATCH', headers: authHeaders(emp.token),
      body: JSON.stringify({ status: 'closed' })
    });
    const closeBody = await close.json();
    console.log('OBS PATCH status=closed result=', close.status, 'body=', JSON.stringify(closeBody).slice(0, 300));

    const renew = await fetch(`${API}/jobs/${job._id}/renew`, {
      method: 'POST', headers: authHeaders(emp.token)
    });
    const renewBody = await renew.json();
    console.log('OBS POST /renew result=', renew.status, 'body=', JSON.stringify(renewBody).slice(0, 300));

    const after = await dbFindOne('jobs', { _id: job._id });
    console.log('OBS job after renew:', JSON.stringify({ status: after?.status, expiresAt: after?.expiresAt }));
  });

  test('P4.APPS.list-by-job-only-owner', async () => {
    const empA = await makeEmployer({ preApprove: true, companyName: 'A Inc' });
    const empB = await makeEmployer({ preApprove: true, companyName: 'B Inc' });
    const jobA = await makeJob(empA.token, { title: 'A Senior Role' });
    const js = await makeJobseeker();
    await makeApply(js.token, jobA._id);

    // Owner can list
    const r1 = await fetch(`${API}/applications/job/${jobA._id}`, { headers: authHeaders(empA.token) });
    const r1body = await r1.json();
    console.log('OBS owner-list status=', r1.status, 'count=', r1body.data?.applications?.length ?? r1body.data?.length);

    // Peer cannot list
    const r2 = await fetch(`${API}/applications/job/${jobA._id}`, { headers: authHeaders(empB.token) });
    const r2body = await r2.json();
    console.log('OBS peer-list status=', r2.status, 'body=', JSON.stringify(r2body).slice(0, 300));
    expect(r2.status, 'peer cannot list other employers applicants').not.toBe(200);
  });

  test('P4.APPS.status-cascade-viewed-shortlisted-rejected-hired', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const js = await makeJobseeker();
    const app = await makeApply(js.token, job._id);

    const jsUser = await dbFindOne('users', { email: js.email });

    for (const status of ['viewed', 'shortlisted', 'hired']) {
      const r = await fetch(`${API}/applications/${app._id}/status`, {
        method: 'PATCH', headers: authHeaders(emp.token),
        body: JSON.stringify({ status })
      });
      const body = await r.json();
      console.log(`OBS status→${status}: status=${r.status}, success=${body.success}`);
      const after = await dbFindOne('applications', { _id: app._id });
      console.log(`OBS app.status after change: ${after?.status}`);
    }

    const notifs = await dbFind('notifications', { userId: jsUser._id });
    console.log('OBS jobseeker notifications:', notifs.length, notifs.map((n: any) => ({ type: n.type, title: n.title })));
  });

  test('P4.APPS.invalid-status-rejected', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const js = await makeJobseeker();
    const app = await makeApply(js.token, job._id);

    const r = await fetch(`${API}/applications/${app._id}/status`, {
      method: 'PATCH', headers: authHeaders(emp.token),
      body: JSON.stringify({ status: 'invalid_status_zzz' })
    });
    const body = await r.json();
    console.log('OBS invalid-status status=', r.status, 'body=', JSON.stringify(body).slice(0, 300));
    expect(r.status, 'invalid status should reject').toBe(400);
  });

  test('P4.MSG.text-message-from-employer', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const js = await makeJobseeker();
    const app = await makeApply(js.token, job._id);

    const r = await fetch(`${API}/applications/${app._id}/message`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({ message: 'Hello, are you available for a chat?', messageType: 'text' })
    });
    const body = await r.json();
    console.log('OBS message status=', r.status, 'body=', JSON.stringify(body).slice(0, 400));

    const after = await dbFindOne('applications', { _id: app._id });
    console.log('OBS application messages count:', after?.messages?.length);
    console.log('OBS first message:', JSON.stringify(after?.messages?.[0]).slice(0, 300));
  });

  test('P4.MSG.empty-message-rejected', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const js = await makeJobseeker();
    const app = await makeApply(js.token, job._id);

    const r = await fetch(`${API}/applications/${app._id}/message`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({ message: '', messageType: 'text' })
    });
    console.log('OBS empty-message status=', r.status);
    expect(r.status, 'empty message rejected').toBe(400);
  });

  test('P4.MSG.xss-in-message-stored', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const js = await makeJobseeker();
    const app = await makeApply(js.token, job._id);

    const xss = '<script>alert("xss")</script>Real message text';
    const r = await fetch(`${API}/applications/${app._id}/message`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({ message: xss, messageType: 'text' })
    });
    console.log('OBS xss-message status=', r.status);
    const after = await dbFindOne('applications', { _id: app._id });
    const stored = after?.messages?.[0]?.message ?? after?.messages?.[0]?.body;
    console.log('OBS xss message stored:', JSON.stringify(stored).slice(0, 300));
    if (stored && (stored.includes('<script>') || stored.includes('alert('))) {
      console.log('FINDING: messages allow raw <script> tags — XSS risk if rendered as HTML');
    }
  });

  test('P4.MSG.oversize-rejected', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const job = await makeJob(emp.token);
    const js = await makeJobseeker();
    const app = await makeApply(js.token, job._id);

    const huge = 'x'.repeat(10000);
    const r = await fetch(`${API}/applications/${app._id}/message`, {
      method: 'POST', headers: authHeaders(emp.token),
      body: JSON.stringify({ message: huge, messageType: 'text' })
    });
    console.log('OBS oversize-message status=', r.status, 'body=', JSON.stringify(await r.json()).slice(0, 300));
  });

  test('P4.COMPANY.profile-update-persists', async () => {
    const emp = await makeEmployer({ preApprove: true, companyName: 'OldName Inc' });
    const r = await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(emp.token),
      body: JSON.stringify({
        employerProfile: { description: 'New great description', website: 'https://example.com' }
      })
    });
    const body = await r.json();
    console.log('OBS company-update status=', r.status, 'body=', JSON.stringify(body).slice(0, 300));
    const after = await dbFindOne('users', { email: emp.email });
    console.log('OBS company after:', JSON.stringify({
      companyName: after?.profile?.employerProfile?.companyName,
      description: after?.profile?.employerProfile?.description,
      website: after?.profile?.employerProfile?.website,
    }));
  });

  test('P4.COMPANY.description-xss-stored-or-stripped', async () => {
    const emp = await makeEmployer({ preApprove: true });
    const xss = '<script>alert(1)</script>Legit company description that follows.';
    const r = await fetch(`${API}/users/profile`, {
      method: 'PUT', headers: authHeaders(emp.token),
      body: JSON.stringify({ employerProfile: { description: xss } })
    });
    console.log('OBS company-xss status=', r.status);
    const after = await dbFindOne('users', { email: emp.email });
    const stored = after?.profile?.employerProfile?.description;
    console.log('OBS company description stored:', JSON.stringify(stored).slice(0, 300));
    if (stored && stored.includes('<script>')) {
      console.log('FINDING: employer description allows <script> — XSS risk');
    }
  });
});
