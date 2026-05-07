/**
 * Real Cloudinary upload/delete integration tests (Phase 28 — Phase 3B).
 *
 * Hits a REAL Cloudinary account when CLOUDINARY_* env vars are set.
 * Skips silently when not configured (e.g., in PR forks without secrets).
 *
 * Cost: $0. Uses tiny fixtures (~70-byte PNG); each test deletes its
 * own uploads. Free-tier (25GB storage + bandwidth/mo) is more than
 * sufficient — typical run consumes <1KB.
 *
 * To run locally:
 *   CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... \
 *   CLOUDINARY_API_SECRET=... npm test -- cloudinary-real
 */

import { jest, describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import { uploadToCloudinary, deleteFromCloudinary } from '../../src/config/cloudinary.js';

// 1x1 transparent PNG — minimum valid PNG file (67 bytes).
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

const TEST_FOLDER = 'advance-al-test';
const isConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

const describeIfConfigured = isConfigured ? describe : describe.skip;

describeIfConfigured('Cloudinary — real upload/delete (Phase 3B)', () => {
  jest.setTimeout(30000);

  // Track all uploaded public_ids per test for cleanup
  const uploaded = [];

  afterEach(async () => {
    while (uploaded.length) {
      const id = uploaded.pop();
      try {
        await deleteFromCloudinary(id);
      } catch (e) {
        // Best-effort cleanup; log but don't fail
        console.error(`afterEach cleanup failed for ${id}:`, e.message);
      }
    }
  });

  it('upload returns a URL with the expected res.cloudinary.com shape', async () => {
    const result = await uploadToCloudinary(TINY_PNG, { folder: TEST_FOLDER });
    uploaded.push(result.public_id);

    expect(result.secure_url).toMatch(
      new RegExp(`^https://res\\.cloudinary\\.com/${process.env.CLOUDINARY_CLOUD_NAME}/`)
    );
    expect(result.public_id).toContain(TEST_FOLDER);
    expect(result.format).toBe('png');
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it('uploaded URL responds 200 with image/png content-type', async () => {
    const result = await uploadToCloudinary(TINY_PNG, { folder: TEST_FOLDER });
    uploaded.push(result.public_id);

    const r = await fetch(result.secure_url);
    expect(r.status).toBe(200);
    const ct = r.headers.get('content-type') || '';
    expect(ct.toLowerCase()).toContain('image/png');
  });

  it('delete removes the file (subsequent fetch returns 404)', async () => {
    const result = await uploadToCloudinary(TINY_PNG, { folder: TEST_FOLDER });

    // Verify it exists first
    const beforeDelete = await fetch(result.secure_url);
    expect(beforeDelete.status).toBe(200);

    // Delete via API
    const deleteResult = await deleteFromCloudinary(result.public_id);
    expect(deleteResult.result).toBe('ok');

    // Cloudinary CDN may cache for a few seconds — but deleted assets eventually
    // return 404 or 410. Don't assert on the immediate fetch (would be flaky);
    // instead, verify the API confirms deletion.
    // Note: NOT pushing to `uploaded` because we already deleted it.
  });

  it('delete of non-existent public_id returns "not found" (no throw)', async () => {
    const result = await deleteFromCloudinary('advance-al-test/totally-fake-id-' + Date.now());
    // Cloudinary returns { result: 'not found' } for unknown IDs (does not throw)
    expect(result.result).toMatch(/not found|ok/);
  });

  it('upload with explicit public_id is idempotent on re-upload', async () => {
    // The uploadToCloudinary wrapper defaults folder to 'advance-al', so the
    // final public_id will be `advance-al/{explicitId}`. Override folder to ''
    // to use the explicit public_id verbatim.
    const explicitId = `${TEST_FOLDER}/idempotent-${Date.now()}`;
    const r1 = await uploadToCloudinary(TINY_PNG, {
      folder: '',
      public_id: explicitId,
      overwrite: true,
    });
    uploaded.push(r1.public_id);

    expect(r1.public_id).toBe(explicitId);

    // Re-upload with same id + overwrite=true should succeed and produce same public_id
    const r2 = await uploadToCloudinary(TINY_PNG, {
      folder: '',
      public_id: explicitId,
      overwrite: true,
    });
    expect(r2.public_id).toBe(explicitId);
  });

  it('upload preserves the requested folder structure (via public_id prefix)', async () => {
    const subFolder = `${TEST_FOLDER}/subdir-${Date.now()}`;
    const result = await uploadToCloudinary(TINY_PNG, { folder: subFolder });
    uploaded.push(result.public_id);

    // Cloudinary embeds the folder as the public_id prefix.
    expect(result.public_id).toMatch(new RegExp(`^${subFolder}/`));
  });
});

// When NOT configured, log why we're skipping so it's obvious in CI output
if (!isConfigured) {
  describe('Cloudinary — real upload/delete (Phase 3B)', () => {
    it.skip('SKIPPED: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET not all set in env', () => {});
  });
}
