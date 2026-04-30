/**
 * Rotate the admin password directly in MongoDB.
 *
 * USAGE:
 *   1. Make sure your local backend/.env has the CURRENT MONGODB_URI
 *      (or temporarily paste the new prod URI you just rotated)
 *   2. Generate a strong password and put it in NEW_ADMIN_PASSWORD below
 *      (or pass it as the first arg)
 *   3. Run from the backend directory:
 *        cd backend
 *        node scripts/rotate-admin-password.js 'YourNewStrongP@ssword!'
 *
 * What it does:
 *   - Connects to MongoDB using MONGODB_URI from env
 *   - Finds the admin user by ADMIN_EMAIL (or admin@advance.al)
 *   - Hashes the new password with bcrypt cost 12
 *   - Updates the user document
 *   - Invalidates ALL refresh tokens (force re-login from any active session)
 *
 * After running:
 *   - Update ADMIN_PASSWORD in backend/.env (local only, NOT Render)
 *   - DO NOT add ADMIN_PASSWORD to Render env vars
 *   - Log in to advance.al with the new password
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const newPassword = process.argv[2];
if (!newPassword) {
  console.error('Usage: node scripts/rotate-admin-password.js \'NewPassword!\'');
  process.exit(1);
}

if (newPassword.length < 12) {
  console.error('Refusing: new password must be at least 12 characters.');
  process.exit(1);
}
if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
  console.error('Refusing: new password must contain upper, lower, and digit.');
  process.exit(1);
}

const adminEmail = process.env.ADMIN_EMAIL || 'admin@advance.al';
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('MONGODB_URI is not set in env. Aborting.');
  process.exit(1);
}

console.log(`Connecting to MongoDB...`);
await mongoose.connect(mongoUri);

const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.model('UserRotate', userSchema);

const admin = await User.findOne({ email: adminEmail, userType: 'admin' });
if (!admin) {
  console.error(`No admin user found with email=${adminEmail}. Aborting.`);
  process.exit(1);
}

const hashed = await bcrypt.hash(newPassword, 12);
admin.password = hashed;
admin.refreshTokens = [];
admin.passwordChangedAt = new Date();
await admin.save();

console.log(`✅ Admin password rotated for ${adminEmail}`);
console.log(`✅ All refresh tokens revoked (any active sessions are now logged out)`);
console.log(`Now log in to advance.al with the new password.`);

await mongoose.disconnect();
process.exit(0);
