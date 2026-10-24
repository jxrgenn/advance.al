/**
 * Gate for tests that talk to the REAL Cloudinary account.
 *
 * Locally, .env.test holds the dev-cloud credentials and these tests upload,
 * sign and delete real files. CI has no Cloudinary secrets: it sets
 * placeholder CLOUDINARY_* values (so the upload routes boot in their
 * "Cloudinary configured" mode, which the SDK-mocked tests rely on) plus
 * CLOUDINARY_PLACEHOLDER=true. A real upload with those values would only get
 * "Unknown API key", so real-account tests skip there.
 */
export const hasRealCloudinary = () =>
  !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  ) && process.env.CLOUDINARY_PLACEHOLDER !== 'true';
