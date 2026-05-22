/**
 * Seed / refresh the Location collection — SAFE for production.
 *
 * Unlike seed-database.js (which wipes everything), this script ONLY touches
 * the Location collection and only via idempotent upserts: it inserts missing
 * cities and updates region/order for existing ones. It never deletes jobs,
 * users, applications, or even locations. Safe to run on a live prod DB —
 * this is how a fresh production database gets its Albanian cities.
 *
 *   node scripts/seed-locations.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Location from '../src/models/Location.js';
import { locationSeedDocs } from '../src/constants/albanianLocations.js';

dotenv.config();

async function seedLocations() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/albania-jobflow';
  await mongoose.connect(mongoUri);
  console.log('Connected — upserting locations...');

  const docs = locationSeedDocs();
  let inserted = 0;
  let updated = 0;
  for (const doc of docs) {
    const res = await Location.updateOne(
      { city: doc.city },
      { $set: { region: doc.region, country: doc.country, isActive: doc.isActive, displayOrder: doc.displayOrder } },
      { upsert: true }
    );
    if (res.upsertedCount) inserted++;
    else if (res.modifiedCount) updated++;
  }

  const total = await Location.countDocuments();
  console.log(`✅ Locations seeded — ${inserted} inserted, ${updated} updated, ${total} total in collection.`);
  await mongoose.connection.close();
}

seedLocations().catch((err) => {
  console.error('❌ seed-locations failed:', err.message);
  process.exit(1);
});
