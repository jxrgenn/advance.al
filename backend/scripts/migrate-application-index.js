/**
 * Migration: Drop old Application unique index.
 *
 * The old unique index (jobId_1_jobSeekerId_1) blocks re-application after withdrawal.
 * Uniqueness is now enforced at the application layer (routes/applications.js checks
 * for existing non-withdrawn applications before creating).
 * Mongoose will recreate a non-unique compound index on next server start.
 *
 * Run once: node backend/scripts/migrate-application-index.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI not set');
  process.exit(1);
}

async function migrate() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('applications');

    // List current indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(i => `${i.name}${i.unique ? ' (unique)' : ''}`).join(', '));

    // Check if old unique index exists
    const oldIndex = indexes.find(i =>
      i.name === 'jobId_1_jobSeekerId_1' && i.unique
    );

    if (oldIndex) {
      console.log('Dropping old unique index: jobId_1_jobSeekerId_1');
      await collection.dropIndex('jobId_1_jobSeekerId_1');
      console.log('Old unique index dropped — re-application after withdrawal now works');
    } else {
      console.log('Old unique index not found — already migrated or never existed');
    }

    // Create new non-unique compound index for query performance
    console.log('Creating non-unique compound index for query performance...');
    await collection.createIndex(
      { jobId: 1, jobSeekerId: 1 },
      { unique: false }
    );
    console.log('Non-unique compound index created');

    // Verify
    const finalIndexes = await collection.indexes();
    console.log('\nFinal indexes:', finalIndexes.map(i => `${i.name}${i.unique ? ' (unique)' : ''}`).join(', '));

    console.log('\nMigration complete!');
  } catch (error) {
    console.error('Migration failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
