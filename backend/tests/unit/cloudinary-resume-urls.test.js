/**
 * Fix batch C — Cloudinary URL helpers behind resume sign/delete.
 *
 * Cloudinary's upload `secure_url` for type 'authenticated' embeds a
 * permanent delivery signature: /raw/authenticated/s--<sig>--/v<ver>/<id>.
 * extractCloudinaryPublicId used to return 's--<sig>--/v<ver>/<id>' for those
 * (signed downloads 404'd, destroy() missed the asset), and the upload paths
 * persisted that never-expiring URL.
 */
import { describe, it, expect } from '@jest/globals';
import { extractCloudinaryPublicId } from '../../src/config/cloudinary.js';
import { toStoredCloudinaryUrl } from '../../src/lib/resumeStorage.js';

const OWNER = '6ac3d05e08f4bf8378d9dbeb';

describe('extractCloudinaryPublicId', () => {
  it('skips the s--<sig>-- segment of an authenticated secure_url', () => {
    const url = `https://res.cloudinary.com/demo/raw/authenticated/s--njkNrDlS--/v1791217760/advance-al/cvs/resume-${OWNER}-1791217759788`;
    expect(extractCloudinaryPublicId(url)).toBe(`advance-al/cvs/resume-${OWNER}-1791217759788`);
  });

  it('still handles unsigned authenticated, upload and image URLs', () => {
    expect(extractCloudinaryPublicId(`https://res.cloudinary.com/demo/raw/authenticated/v123/advance-al/cvs/resume-${OWNER}-456.pdf`))
      .toBe(`advance-al/cvs/resume-${OWNER}-456`);
    expect(extractCloudinaryPublicId(`https://res.cloudinary.com/demo/raw/upload/v123/advance-al/cvs/resume-${OWNER}-456.pdf`))
      .toBe(`advance-al/cvs/resume-${OWNER}-456`);
    expect(extractCloudinaryPublicId('https://res.cloudinary.com/demo/image/upload/v9/advance-al/logos/logo-xxx.jpg'))
      .toBe('advance-al/logos/logo-xxx');
  });

  it('returns null for non-Cloudinary input', () => {
    expect(extractCloudinaryPublicId('https://evil.example.com/raw/authenticated/v1/x')).toBeNull();
    expect(extractCloudinaryPublicId(undefined)).toBeNull();
  });
});

describe('toStoredCloudinaryUrl', () => {
  it('drops the permanent delivery signature from an authenticated secure_url', () => {
    expect(toStoredCloudinaryUrl(`https://res.cloudinary.com/demo/raw/authenticated/s--hdhVwJ29--/v1791217881/advance-al/cvs/resume-${OWNER}-1`))
      .toBe(`https://res.cloudinary.com/demo/raw/authenticated/v1791217881/advance-al/cvs/resume-${OWNER}-1`);
  });

  it('leaves URLs without a signature segment unchanged', () => {
    const url = `https://res.cloudinary.com/demo/raw/authenticated/v1/advance-al/cvs/resume-${OWNER}-1`;
    expect(toStoredCloudinaryUrl(url)).toBe(url);
    expect(toStoredCloudinaryUrl('/uploads/resumes/resume-x-1.pdf')).toBe('/uploads/resumes/resume-x-1.pdf');
  });
});
