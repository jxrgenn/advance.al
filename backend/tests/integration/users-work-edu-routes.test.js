/**
 * Phase 28 — coverage push for routes/users.js work-experience and
 * education CRUD routes (single biggest absolute gap).
 *
 * Covers POST/PUT/DELETE on /work-experience and /education subdocs.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createEmployer } from '../factories/user.factory.js';
import { createAuthHeaders } from '../helpers/auth.helper.js';
import User from '../../src/models/User.js';

describe('users.js — /work-experience routes', () => {
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

  it('POST adds a work experience entry', async () => {
    const { user } = await createJobseeker({ email: 'we1@example.com' });

    const r = await request(app)
      .post('/api/users/work-experience')
      .set(createAuthHeaders(user))
      .send({
        position: 'Software Engineer',
        company: 'TechCo',
        location: 'Tiranë',
        startDate: '2020-01-01',
        endDate: '2023-12-01',
        isCurrentJob: false,
        description: 'Built stuff',
        achievements: 'Got promoted',
      });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.experience.position).toBe('Software Engineer');

    const refreshed = await User.findById(user._id);
    const positions = refreshed.profile.jobSeekerProfile.workHistory.map(e => e.position);
    expect(positions).toContain('Software Engineer');
  });

  it('POST 400s when position missing', async () => {
    const { user } = await createJobseeker({ email: 'we-bad@example.com' });
    const r = await request(app)
      .post('/api/users/work-experience')
      .set(createAuthHeaders(user))
      .send({ company: 'TechCo' });
    expect(r.status).toBe(400);
  });

  it('POST 403 for employer (jobseeker-only)', async () => {
    const { user: emp } = await createEmployer();
    const r = await request(app)
      .post('/api/users/work-experience')
      .set(createAuthHeaders(emp))
      .send({ position: 'CEO', company: 'X' });
    expect(r.status).toBe(403);
  });

  it('PUT updates a work experience entry', async () => {
    const { user } = await createJobseeker({ email: 'we-put@example.com' });
    // Seed a work entry first
    await request(app)
      .post('/api/users/work-experience')
      .set(createAuthHeaders(user))
      .send({ position: 'Old Title', company: 'OldCo' });

    const refreshed = await User.findById(user._id);
    const seeded = refreshed.profile.jobSeekerProfile.workHistory.find(e => e.position === 'Old Title');
    const id = seeded._id;

    const r = await request(app)
      .put(`/api/users/work-experience/${id}`)
      .set(createAuthHeaders(user))
      .send({
        position: 'New Title',
        company: 'NewCo',
        location: 'Vlorë',
        isCurrentJob: true,
        description: 'Updated',
        achievements: 'New ach',
      });

    expect(r.status).toBe(200);
    const after = await User.findById(user._id);
    const entry = after.profile.jobSeekerProfile.workHistory.find(e => e._id.toString() === id.toString());
    expect(entry.position).toBe('New Title');
    expect(entry.company).toBe('NewCo');
    expect(entry.endDate).toBeFalsy();
  });

  it('PUT 404 when entry id does not exist (empty work history)', async () => {
    const { user } = await createJobseeker({ email: 'we-empty@example.com' });
    // Clear any default work history
    await User.updateOne({ _id: user._id }, { $set: { 'profile.jobSeekerProfile.workHistory': [] } });
    const r = await request(app)
      .put(`/api/users/work-experience/507f1f77bcf86cd799439099`)
      .set(createAuthHeaders(user))
      .send({ position: 'X' });
    expect(r.status).toBe(404);
  });

  it('PUT 404 when entry id does not exist in user history', async () => {
    const { user } = await createJobseeker({ email: 'we-missing@example.com' });
    await request(app)
      .post('/api/users/work-experience')
      .set(createAuthHeaders(user))
      .send({ position: 'P', company: 'C' });

    const r = await request(app)
      .put('/api/users/work-experience/507f1f77bcf86cd799439099')
      .set(createAuthHeaders(user))
      .send({ position: 'X' });
    expect(r.status).toBe(404);
  });

  it('DELETE removes a work experience entry', async () => {
    const { user } = await createJobseeker({ email: 'we-del@example.com' });
    await request(app)
      .post('/api/users/work-experience')
      .set(createAuthHeaders(user))
      .send({ position: 'DeleteMe', company: 'C' });

    const refreshed = await User.findById(user._id);
    const seeded = refreshed.profile.jobSeekerProfile.workHistory.find(e => e.position === 'DeleteMe');
    const id = seeded._id;
    const beforeCount = refreshed.profile.jobSeekerProfile.workHistory.length;

    const r = await request(app)
      .delete(`/api/users/work-experience/${id}`)
      .set(createAuthHeaders(user));
    expect(r.status).toBe(200);

    const after = await User.findById(user._id);
    expect(after.profile.jobSeekerProfile.workHistory.length).toBe(beforeCount - 1);
    expect(after.profile.jobSeekerProfile.workHistory.find(e => e._id.toString() === id.toString())).toBeUndefined();
  });
});

describe('users.js — /education routes', () => {
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

  it('POST adds an education entry', async () => {
    const { user } = await createJobseeker({ email: 'edu1@example.com' });
    const r = await request(app)
      .post('/api/users/education')
      .set(createAuthHeaders(user))
      .send({
        degree: 'Bachelor',
        institution: 'University of Tirana',
        fieldOfStudy: 'Computer Science',
        location: 'Tiranë',
        startDate: '2018-09-01',
        endDate: '2022-06-01',
        gpa: '3.8',
        description: 'Top student',
      });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);

    const refreshed = await User.findById(user._id);
    const degrees = refreshed.profile.jobSeekerProfile.education.map(e => e.degree);
    expect(degrees).toContain('Bachelor');
  });

  it('POST 400 when degree missing', async () => {
    const { user } = await createJobseeker({ email: 'edu-bad@example.com' });
    const r = await request(app)
      .post('/api/users/education')
      .set(createAuthHeaders(user))
      .send({ institution: 'X' });
    expect(r.status).toBe(400);
  });

  it('PUT updates an education entry', async () => {
    const { user } = await createJobseeker({ email: 'edu-put@example.com' });
    await request(app)
      .post('/api/users/education')
      .set(createAuthHeaders(user))
      .send({ degree: 'OldDegree', institution: 'OldU' });

    const refreshed = await User.findById(user._id);
    const seeded = refreshed.profile.jobSeekerProfile.education.find(e => e.degree === 'OldDegree');
    const id = seeded._id;

    const r = await request(app)
      .put(`/api/users/education/${id}`)
      .set(createAuthHeaders(user))
      .send({
        degree: 'New',
        fieldOfStudy: 'CS',
        institution: 'New U',
        location: 'Tiranë',
        startDate: '2020-09-01',
        endDate: '2024-06-01',
        gpa: '4.0',
        description: 'updated',
      });

    expect(r.status).toBe(200);
    const after = await User.findById(user._id);
    const entry = after.profile.jobSeekerProfile.education.find(e => e._id.toString() === id.toString());
    expect(entry.degree).toBe('New');
    expect(entry.school).toBe('New U');
  });

  it('PUT 404 when entry id does not exist (empty education)', async () => {
    const { user } = await createJobseeker({ email: 'edu-empty@example.com' });
    await User.updateOne({ _id: user._id }, { $set: { 'profile.jobSeekerProfile.education': [] } });
    const r = await request(app)
      .put('/api/users/education/507f1f77bcf86cd799439099')
      .set(createAuthHeaders(user))
      .send({ degree: 'X' });
    expect(r.status).toBe(404);
  });

  it('DELETE removes an education entry', async () => {
    const { user } = await createJobseeker({ email: 'edu-del@example.com' });
    await request(app)
      .post('/api/users/education')
      .set(createAuthHeaders(user))
      .send({ degree: 'DeleteMe', institution: 'I' });

    const refreshed = await User.findById(user._id);
    const seeded = refreshed.profile.jobSeekerProfile.education.find(e => e.degree === 'DeleteMe');
    const id = seeded._id;
    const beforeCount = refreshed.profile.jobSeekerProfile.education.length;

    const r = await request(app)
      .delete(`/api/users/education/${id}`)
      .set(createAuthHeaders(user));
    expect(r.status).toBe(200);

    const after = await User.findById(user._id);
    expect(after.profile.jobSeekerProfile.education.length).toBe(beforeCount - 1);
  });
});
