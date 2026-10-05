/**
 * Fix batch C review #2 — deleteFromCloudinary must purge CDN copies.
 *
 * destroy() without invalidate:true removes the asset but its delivery URL
 * keeps answering 200 from the CDN cache (max-age 30 days), so a "deleted"
 * CV/logo/photo stays downloadable by anyone holding the link.
 *
 * Real Cloudinary (dev cloud from .env.test); skipped when not configured.
 * Cleans up after itself (the asset is the thing being deleted).
 */
import { describe, it, expect } from '@jest/globals';
import { uploadToCloudinary, deleteFromCloudinary } from '../../src/config/cloudinary.js';

const isConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);
const describeIfConfigured = isConfigured ? describe : describe.skip;

describeIfConfigured('deleteFromCloudinary — CDN invalidation (review #2)', () => {
  it('a deleted authenticated CV stops being served from its cached delivery URL', async () => {
    const pdf = Buffer.from(`%PDF-1.4\n%invalidate-test-${Date.now()}\n%%EOF\n`);
    const up = await uploadToCloudinary(pdf, {
      folder: 'advance-al-test',
      resource_type: 'raw',
      type: 'authenticated',
      public_id: `resume-dddddddddddddddddddddddd-${Date.now()}`,
    });
    // secure_url of an authenticated upload carries a permanent s--sig--
    // delivery signature; fetch it twice so the CDN holds a cached copy.
    expect((await fetch(up.secure_url)).status).toBe(200);
    expect((await fetch(up.secure_url)).status).toBe(200);

    const result = await deleteFromCloudinary(up.public_id, 'raw', 'authenticated');
    expect(result.result).toBe('ok');

    // Invalidation is asynchronous on the CDN side: poll up to 30s.
    let status = 200;
    for (let i = 0; i < 15 && status === 200; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      status = (await fetch(up.secure_url)).status;
    }
    expect(status).toBe(404);
  }, 60000);
});
