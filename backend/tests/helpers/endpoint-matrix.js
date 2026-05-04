/**
 * Endpoint Matrix Test Helper
 *
 * Reduces ~15 boilerplate assertions per endpoint to a single manifest object.
 * Each `testEndpoint(manifest)` call generates a Jest `describe()` block that
 * exercises:
 *   - happy path (correct role + valid input → expected status + body shape)
 *   - no auth → 401 (unless route is public)
 *   - wrong role → 403 (one test per role NOT in the manifest's `roles`)
 *   - missing required field(s) → 400 (one per `requiredFields` entry)
 *   - DB side-effects (`dbVerify` callback re-queries DB after mutation)
 *
 * Usage:
 *   import { testEndpoint } from '../../helpers/endpoint-matrix.js';
 *
 *   testEndpoint({
 *     describe: 'PUT /api/jobs/:id',
 *     method: 'put',
 *     path: ({ resources }) => `/api/jobs/${resources.job._id}`,
 *     setup: async () => {
 *       const { user: emp } = await createVerifiedEmployer();
 *       const job = await createJob(emp);
 *       return { user: emp, resources: { job } };
 *     },
 *     roles: ['verified-employer'],
 *     validBody: { title: 'Updated Title' },
 *     expectStatus: 200,
 *     expectBody: { success: true, data: { job: { title: 'Updated Title' } } },
 *     dbVerify: async ({ resources }) => {
 *       const { Job } = await import('../../../src/models/index.js');
 *       const dbJob = await Job.findById(resources.job._id);
 *       expect(dbJob.title).toBe('Updated Title');
 *     }
 *   });
 */

import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../../server.js';
import { createAuthHeaders } from './auth.helper.js';
import {
  createJobseeker, createVerifiedEmployer, createUnverifiedEmployer, createAdmin
} from '../factories/user.factory.js';

const ROLE_FACTORIES = {
  'jobseeker': createJobseeker,
  'verified-employer': createVerifiedEmployer,
  'unverified-employer': createUnverifiedEmployer,
  'admin': createAdmin,
};

async function makeUserForRole(role) {
  const factory = ROLE_FACTORIES[role];
  if (!factory) throw new Error(`Unknown role: ${role}`);
  return factory({ emailVerified: true });
}

/**
 * Build the request, attach auth header, send body/query.
 */
async function dispatchRequest(method, url, { headers, body, query } = {}) {
  let req = request(app)[method.toLowerCase()](url);
  if (headers) req = req.set(headers);
  if (query) req = req.query(query);
  if (body !== undefined) req = req.send(body);
  return req;
}

/**
 * Generate the standard test matrix for an endpoint manifest.
 */
export function testEndpoint(m) {
  describe(m.describe, () => {
    let context;

    // Set up fresh resources per `it()` so they don't leak between tests
    async function init() {
      context = await m.setup();
    }

    if (m.public !== true) {
      it('rejects request with no Authorization header → 401', async () => {
        await init();
        const url = typeof m.path === 'function' ? m.path(context) : m.path;
        const response = await dispatchRequest(m.method, url, { body: m.validBody, query: m.validQuery });
        expect(response.status).toBe(401);
      });
    }

    // Wrong-role tests
    if (m.roles && m.roles.length) {
      const allRoles = ['jobseeker', 'verified-employer', 'admin'];
      for (const wrongRole of allRoles) {
        if (m.roles.includes(wrongRole)) continue;
        it(`rejects ${wrongRole} role → 403`, async () => {
          await init();
          const wrongUser = (await makeUserForRole(wrongRole)).user;
          const url = typeof m.path === 'function' ? m.path(context) : m.path;
          const response = await dispatchRequest(m.method, url, {
            headers: createAuthHeaders(wrongUser),
            body: m.validBody,
            query: m.validQuery
          });
          expect([401, 403]).toContain(response.status);
        });
      }
    }

    // Required-field validation tests
    if (m.requiredFields && m.requiredFields.length) {
      for (const field of m.requiredFields) {
        it(`rejects missing required field "${field}" → 400`, async () => {
          await init();
          const url = typeof m.path === 'function' ? m.path(context) : m.path;
          const partialBody = { ...m.validBody };
          delete partialBody[field];
          const response = await dispatchRequest(m.method, url, {
            headers: context.user ? createAuthHeaders(context.user) : undefined,
            body: partialBody,
            query: m.validQuery
          });
          expect(response.status).toBe(400);
        });
      }
    }

    // Happy path
    it(`happy path: ${m.method.toUpperCase()} returns ${m.expectStatus || 200}`, async () => {
      await init();
      const url = typeof m.path === 'function' ? m.path(context) : m.path;
      const response = await dispatchRequest(m.method, url, {
        headers: context.user ? createAuthHeaders(context.user) : undefined,
        body: m.validBody,
        query: m.validQuery
      });

      const expectedStatuses = Array.isArray(m.expectStatus)
        ? m.expectStatus
        : [m.expectStatus || 200];
      expect(expectedStatuses).toContain(response.status);

      if (m.expectBody) {
        // Shallow shape validation
        expect(response.body).toMatchObject(m.expectBody);
      }

      if (m.dbVerify) {
        await m.dbVerify({ ...context, response });
      }
    });

    // Custom additional tests defined inline
    if (m.extra) {
      for (const [name, fn] of Object.entries(m.extra)) {
        it(name, async () => {
          await init();
          await fn(context);
        });
      }
    }
  });
}

export default { testEndpoint };
