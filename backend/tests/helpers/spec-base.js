/**
 * Spec Base Helpers
 *
 * Shared lifecycle + utilities used by every Phase 1 integration spec.
 * Keeps the spec files focused on assertions, not boilerplate.
 */

import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { appendRow as ledgerAppend } from './ledger.js';

export { ledgerAppend };

/**
 * Standard lifecycle for an integration spec.
 * Connects DB once, seeds reference data, clears collections after each test.
 *
 *   import { useIntegrationLifecycle } from '../helpers/spec-base.js';
 *   describe('My route', () => { useIntegrationLifecycle(); ... });
 */
export function useIntegrationLifecycle() {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations(); // re-seed reference data after wipe
  });

  afterAll(async () => {
    await closeTestDB();
  });
}

/**
 * Compact assertion helper that records the result to the ledger.
 * Use inside an it() — pass id, phase, name, response, expected.
 */
export function recordResult(opts) {
  const { id, phase, name, endpoint, request, response, dbBefore, dbAfter, sideEffects, verdict, details } = opts;
  ledgerAppend({
    id,
    phase,
    kind: 'backend-api',
    name,
    endpoint,
    request,
    response: response ? { status: response.status, body: response.body } : undefined,
    dbBefore,
    dbAfter,
    sideEffects,
    verdict,
    details
  });
}
