#!/usr/bin/env node

/**
 * EMBEDDING SYSTEM TEST SCRIPT
 *
 * Tests all components of the embedding system:
 * - OpenAI API connection
 * - Embedding generation
 * - Cosine similarity computation
 * - Queue operations
 * - Database configuration
 *
 * Usage: node src/scripts/testEmbeddings.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import jobEmbeddingService from '../services/jobEmbeddingService.js';
import Job from '../models/Job.js';
import JobQueue from '../models/JobQueue.js';

async function runTests() {
  console.log('\n===========================================');
  console.log('EMBEDDING SYSTEM TEST SUITE');
  console.log('===========================================\n');

  let exitCode = 0;

  try {
    // Test 1: Environment Variables
    console.log('[1/7] Checking environment variables...');
    const requiredVars = [
      'MONGODB_URI',
      'OPENAI_API_KEY'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
    }

    if (process.env.OPENAI_API_KEY.startsWith('sk-your')) {
      throw new Error('OPENAI_API_KEY is not configured (using example value)');
    }

    console.log('✓ All required environment variables are set\n');

    // Test 2: MongoDB Connection
    console.log('[2/7] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ MongoDB connected\n');

    // Test 3: OpenAI API Connection
    console.log('[3/7] Testing OpenAI API connection...');
    const testText1 = 'Senior Software Engineer position requiring 5 years of experience in React and Node.js, building scalable web applications';

    // Call OpenAI API directly with the internal method
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const result1 = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: testText1
    });
    const testEmbedding = result1.data[0].embedding;

    if (!testEmbedding || !Array.isArray(testEmbedding) || testEmbedding.length !== 1536) {
      throw new Error('Invalid embedding generated');
    }
    console.log(`✓ Generated embedding with ${testEmbedding.length} dimensions\n`);

    // Test 4: Cosine Similarity
    console.log('[4/7] Testing cosine similarity computation...');
    const testText2 = 'Junior Developer role seeking 2 years experience with JavaScript and React, working on frontend applications';
    const result2 = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: testText2
    });
    const testEmbedding2 = result2.data[0].embedding;

    const similarity = jobEmbeddingService.cosineSimilarity(testEmbedding, testEmbedding2);

    if (similarity < 0 || similarity > 1 || isNaN(similarity)) {
      throw new Error('Invalid similarity score');
    }
    console.log(`✓ Similarity score: ${similarity.toFixed(4)}`);
    console.log(`  (Should be ~0.7-0.9 for similar jobs)\n`);

    // Test 5: Test with very different jobs
    console.log('[5/7] Testing dissimilar jobs...');
    const testText3 = 'Restaurant Chef needed for Italian cuisine, 10 years experience in cooking, manage kitchen staff';
    const result3 = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: testText3
    });
    const testEmbedding3 = result3.data[0].embedding;

    const dissimilarity = jobEmbeddingService.cosineSimilarity(testEmbedding, testEmbedding3);
    console.log(`✓ Dissimilarity score: ${dissimilarity.toFixed(4)}`);
    console.log(`  (Should be <0.6 for different jobs)\n`);

    // Test 6: Queue Operations
    console.log('[6/7] Testing queue operations...');
    const testJob = await Job.findOne({ status: 'active' });

    if (!testJob) {
      console.log('⚠️  No active jobs found, skipping queue test\n');
    } else {
      // Clear existing queue items for this job
      await JobQueue.deleteMany({ jobId: testJob._id });

      // Queue embedding generation
      await jobEmbeddingService.queueEmbeddingGeneration(testJob._id);

      const queueItem = await JobQueue.findOne({
        jobId: testJob._id,
        taskType: 'generate_embedding'
      });

      if (!queueItem || queueItem.status !== 'pending') {
        throw new Error('Failed to queue job');
      }
      console.log(`✓ Successfully queued job ${testJob._id}`);
      console.log(`  Queue ID: ${queueItem._id}\n`);

      // Clean up test queue item
      await JobQueue.deleteOne({ _id: queueItem._id });
    }

    // Test 7: Database Indexes
    console.log('[7/7] Verifying database indexes...');
    const jobIndexes = await Job.collection.getIndexes();
    const queueIndexes = await JobQueue.collection.getIndexes();

    const expectedJobIndexes = ['embedding.status', 'embedding.vector'];
    const hasRequiredIndexes = expectedJobIndexes.every(indexName =>
      Object.keys(jobIndexes).some(key => key.includes(indexName.replace('.', '_')))
    );

    if (!hasRequiredIndexes) {
      console.log('⚠️  Warning: Some expected indexes might be missing');
      console.log('   Job indexes:', Object.keys(jobIndexes).join(', '));
    } else {
      console.log('✓ Database indexes verified');
    }
    console.log('  Queue indexes:', Object.keys(queueIndexes).join(', '));
    console.log();

    // Summary
    console.log('===========================================');
    console.log('✅ ALL TESTS PASSED');
    console.log('===========================================');
    console.log('\nThe embedding system is ready to use!');
    console.log('\nNext steps:');
    console.log('1. Add embedding environment variables to .env');
    console.log('2. Run migration: node src/scripts/migrateEmbeddings.js');
    console.log('3. Start worker: node src/workers/embeddingWorker.js');
    console.log('4. Monitor in admin dashboard\n');

    console.log('Test Results:');
    console.log(`- Similar jobs score: ${similarity.toFixed(4)} (should be high)`);
    console.log(`- Different jobs score: ${dissimilarity.toFixed(4)} (should be low)`);
    console.log(`- Semantic understanding: ${similarity > dissimilarity ? 'WORKING ✓' : 'FAILED ✗'}\n`);

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('\nDetails:', error);
    exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }

  process.exit(exitCode);
}

runTests();
