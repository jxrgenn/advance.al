#!/usr/bin/env node

/**
 * MIGRATION SCRIPT: Generate Embeddings for Existing Jobs
 *
 * This script processes all existing jobs and queues them for embedding generation.
 * Run this ONCE after deploying the new embedding system.
 *
 * Usage:
 *   DRY_RUN=true node src/scripts/migrateEmbeddings.js   (test without changes)
 *   node src/scripts/migrateEmbeddings.js                  (run for real)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import Job from '../models/Job.js';
import JobQueue from '../models/JobQueue.js';
import debugLogger from '../services/debugLogger.js';

// Migration configuration
const BATCH_SIZE = 100; // Process 100 jobs at a time
const DRY_RUN = process.env.DRY_RUN === 'true';

async function migrateEmbeddings() {
  const migrationId = debugLogger.generateDebugId();

  try {
    console.log('\n===========================================');
    console.log('EMBEDDING MIGRATION SCRIPT');
    console.log('===========================================\n');
    console.log(`Migration ID: ${migrationId}`);
    console.log(`Dry Run: ${DRY_RUN ? 'YES (no changes will be made)' : 'NO (will queue jobs)'}`);
    console.log(`Batch Size: ${BATCH_SIZE}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    // Connect to MongoDB
    console.log('[1/7] Connecting to MongoDB...');
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is required');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    // Count total jobs
    console.log('[2/7] Counting jobs...');
    const totalJobs = await Job.countDocuments({});
    console.log(`Total jobs in database: ${totalJobs}`);

    if (totalJobs === 0) {
      console.log('No jobs found. Nothing to migrate.');
      return;
    }

    // Count jobs that need embeddings
    console.log('[3/7] Analyzing job status...');
    const jobsNeedingEmbeddings = await Job.countDocuments({
      $or: [
        { 'embedding.status': { $exists: false } },
        { 'embedding.status': 'failed' },
        { 'embedding.vector': { $exists: false } }
      ]
    });

    console.log(`Jobs needing embeddings: ${jobsNeedingEmbeddings}`);
    console.log(`Jobs already processed: ${totalJobs - jobsNeedingEmbeddings}\n`);

    if (jobsNeedingEmbeddings === 0) {
      console.log('All jobs already have embeddings. Nothing to migrate.');
      return;
    }

    if (DRY_RUN) {
      console.log('DRY RUN: Would queue', jobsNeedingEmbeddings, 'jobs for embedding generation');
      console.log('Run again with DRY_RUN=false to actually queue jobs\n');
      return;
    }

    // Confirm migration
    console.log('[4/7] Ready to migrate...');
    console.log('⚠️  This will queue', jobsNeedingEmbeddings, 'jobs for embedding generation.');
    console.log('⚠️  Make sure the embedding worker is running to process these jobs.');
    console.log('\nStarting migration in 5 seconds... (Ctrl+C to cancel)\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Process jobs in batches
    console.log('[5/7] Processing jobs...\n');
    let processedCount = 0;
    let queuedCount = 0;
    let errorCount = 0;
    let skip = 0;

    const totalToProcess = jobsNeedingEmbeddings;

    while (processedCount < totalToProcess) {
      const jobs = await Job.find({
        $or: [
          { 'embedding.status': { $exists: false } },
          { 'embedding.status': 'failed' },
          { 'embedding.vector': { $exists: false } }
        ]
      })
        .select('_id title')
        .limit(BATCH_SIZE)
        .lean();

      if (jobs.length === 0) break;

      for (const job of jobs) {
        try {
          // Initialize embedding status if not exists
          await Job.updateOne(
            { _id: job._id },
            {
              $set: {
                'embedding.status': 'pending',
                'embedding.retries': 0,
                'embedding.error': null
              }
            }
          );

          // Queue for embedding generation
          await JobQueue.create({
            jobId: job._id,
            taskType: 'generate_embedding',
            status: 'pending',
            priority: 5, // Lower priority than new jobs
            metadata: {
              migrationId,
              source: 'migration_script',
              queuedAt: new Date()
            }
          });

          queuedCount++;
          processedCount++;

          if (processedCount % 10 === 0) {
            const percent = ((processedCount / totalToProcess) * 100).toFixed(1);
            console.log(`Progress: ${processedCount}/${totalToProcess} (${percent}%) jobs queued`);
          }

        } catch (error) {
          if (error.code === 11000) {
            // Duplicate key error (already queued) - not a real error
            processedCount++;
          } else {
            console.error(`Error queuing job ${job._id}:`, error.message);
            errorCount++;
            processedCount++;
          }
        }
      }

      // Small delay between batches to avoid overwhelming MongoDB
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n[6/7] Verifying queue...');
    const pendingQueueCount = await JobQueue.countDocuments({ status: 'pending' });
    console.log(`Pending queue items: ${pendingQueueCount}`);

    console.log('\n[7/7] Migration complete!\n');
    console.log('===========================================');
    console.log('MIGRATION SUMMARY');
    console.log('===========================================');
    console.log(`Total jobs processed: ${processedCount}`);
    console.log(`Successfully queued: ${queuedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Queue size: ${pendingQueueCount}`);
    console.log(`\nNext steps:`);
    console.log(`1. Ensure embedding worker is running`);
    console.log(`   • Development: npm run worker:dev`);
    console.log(`   • Production: pm2 start ecosystem.config.js`);
    console.log(`2. Monitor worker progress in admin dashboard`);
    console.log(`3. Check logs for any errors:`);
    console.log(`   • pm2 logs albania-jobflow-worker`);
    console.log(`\nEstimated processing time: ${Math.ceil(queuedCount / 10)} minutes`);
    console.log(`(at ~10 jobs/minute)\n`);

  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

// Run migration
migrateEmbeddings()
  .then(() => {
    console.log('Migration script finished successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
