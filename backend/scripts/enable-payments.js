// One-off migration: flip the live `payment_enabled` SystemConfiguration doc
// to true. The model-level defaultValue change in QA-D1 only applies to FRESH
// installs, so existing databases need this script to actually start gating
// jobs behind the paywall.
//
// Usage: node backend/scripts/enable-payments.js
//
// Safe to re-run — uses $set, no data destruction.

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SystemConfiguration } from '../src/models/index.js';

dotenv.config();

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const before = await SystemConfiguration.findOne({ key: 'payment_enabled' });
  console.log('Before:', before ? { key: before.key, value: before.value } : '(not present)');

  const result = await SystemConfiguration.updateOne(
    { key: 'payment_enabled' },
    { $set: { value: true } },
    { upsert: false }
  );
  console.log('Update result:', result);

  const after = await SystemConfiguration.findOne({ key: 'payment_enabled' });
  console.log('After:', after ? { key: after.key, value: after.value } : '(still not present)');

  if (!after) {
    console.warn('payment_enabled doc not found in SystemConfiguration. Initialize the defaults via the admin panel or seed script first.');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error('enable-payments script failed:', err);
  process.exit(1);
});
