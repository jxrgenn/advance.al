/**
 * Update admin EMAIL + PASSWORD directly in MongoDB.
 *
 * Why this exists: ADMIN_EMAIL / ADMIN_PASSWORD on Render only seed the admin
 * on a fresh deployment via seed-database.js. Changing them on a running
 * deployment has zero effect — the existing admin row in MongoDB is locked
 * to whatever it was seeded with at first startup.
 *
 * Unlike rotate-admin-password.js, this script:
 *   - Looks up the admin by `userType: 'admin'` (not by email), so it works
 *     regardless of what the current email is.
 *   - Updates BOTH email and password.
 *   - Verifies the new password with bcrypt.compare before exiting, so we
 *     fail loud if anything went wrong.
 *
 * USAGE:
 *   cd backend
 *   node scripts/update-admin-credentials.js <new-email> '<new-password>'
 *
 * Example:
 *   node scripts/update-admin-credentials.js admin@advance.al 'StrongP@ssword!'
 *
 * Side effects:
 *   - Email + password fields on the single admin User document.
 *   - refreshTokens[] cleared — kicks any lingering admin sessions.
 *   - passwordChangedAt set to now.
 *
 * Does NOT touch:
 *   - .env files (you should update local backend/.env manually so dev login works).
 *   - Render env vars (those are seed-only — no need to keep them aligned).
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const [newEmail, newPassword] = process.argv.slice(2);

if (!newEmail || !newPassword) {
  console.error('Usage: node scripts/update-admin-credentials.js <new-email> \'<new-password>\'');
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
  console.error(`Refusing: "${newEmail}" doesn't look like a valid email.`);
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

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('MONGODB_URI is not set in env. Aborting.');
  process.exit(1);
}

console.log('Connecting to MongoDB...');
await mongoose.connect(mongoUri);

// Loose schema — bypasses User model middleware. We hash manually so behavior
// is identical to seed-database.js's bcrypt.hash(password, 12).
const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.model('UserAdminUpdate', userSchema);

const admin = await User.findOne({ userType: 'admin' });
if (!admin) {
  console.error('No admin user found in the users collection. Aborting.');
  process.exit(1);
}

const oldEmail = admin.email;
console.log(`Found existing admin: ${oldEmail}`);

// Check for collision: another non-admin user with the new email?
const collision = await User.findOne({ email: newEmail, _id: { $ne: admin._id } });
if (collision) {
  console.error(`Refusing: another user already has email=${newEmail} (userType=${collision.userType}). Pick a different admin email.`);
  process.exit(1);
}

const hashed = await bcrypt.hash(newPassword, 12);

// Use updateOne with $set so we bypass Mongoose's document-save lifecycle
// entirely — no risk of stray middleware double-hashing the already-hashed
// password. (The real User model has a pre('save') bcrypt hook that runs on
// `.save()`; even though our loose schema doesn't register that hook, it's
// safer to skip the save path altogether.)
const updateResult = await User.collection.updateOne(
  { _id: admin._id },
  {
    $set: {
      email: newEmail,
      password: hashed,
      refreshTokens: [],
      passwordChangedAt: new Date(),
    }
  }
);

if (updateResult.modifiedCount !== 1) {
  console.error(`❌ updateOne reported modifiedCount=${updateResult.modifiedCount} (expected 1). Aborting.`);
  process.exit(1);
}

// Re-fetch + verify the saved hash actually matches the password we passed in.
const refetched = await User.collection.findOne({ _id: admin._id });
const ok = await bcrypt.compare(newPassword, refetched.password);
if (!ok) {
  console.error('❌ bcrypt.compare failed after save — password did NOT update correctly. Aborting (manual cleanup required).');
  console.error(`   Stored hash prefix: ${refetched.password?.substring(0, 7)}, length: ${refetched.password?.length}`);
  process.exit(1);
}

console.log(`✅ Email updated:    ${oldEmail}  →  ${newEmail}`);
console.log('✅ Password updated and verified via bcrypt.compare');
console.log('✅ Refresh tokens cleared (any lingering admin sessions are dead)');
console.log('');
console.log(`Now log in at https://advance.al/login with: ${newEmail}`);

await mongoose.disconnect();
process.exit(0);
