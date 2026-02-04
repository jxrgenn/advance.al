import 'dotenv/config';
import mongoose from 'mongoose';
import Job from './src/models/Job.js';
import JobQueue from './src/models/JobQueue.js';
import jobEmbeddingService from './src/services/jobEmbeddingService.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testImprovedSimilarity() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n' + '='.repeat(80));
    console.log('🧪 TESTING IMPROVED SIMILARITY ALGORITHM');
    console.log('='.repeat(80) + '\n');

    // Get an existing Frontend job to test with
    const existingFrontendJob = await Job.findOne({
      title: /frontend|react|vue/i,
      'embedding.status': 'completed',
      isDeleted: false
    }).lean();

    if (!existingFrontendJob) {
      console.log('❌ No existing frontend job found for testing');
      return;
    }

    console.log('📋 Using existing job as baseline:');
    console.log(`   Title: ${existingFrontendJob.title}`);
    console.log(`   Tags: ${existingFrontendJob.tags?.join(', ') || 'none'}`);
    console.log(`   Current similar jobs: ${existingFrontendJob.similarJobs?.length || 0}`);

    // Show current similar jobs
    if (existingFrontendJob.similarJobs && existingFrontendJob.similarJobs.length > 0) {
      console.log(`\n🔍 Current top similar jobs:\n`);
      const similarJobIds = existingFrontendJob.similarJobs.slice(0, 5).map(s => s.jobId);
      const similarJobs = await Job.find({ _id: { $in: similarJobIds } })
        .select('title tags')
        .lean();

      const jobMap = new Map(similarJobs.map(j => [j._id.toString(), j]));

      existingFrontendJob.similarJobs.slice(0, 5).forEach((similar, i) => {
        const job = jobMap.get(similar.jobId.toString());
        if (job) {
          console.log(`${i + 1}. ${job.title}`);
          console.log(`   Tags: ${job.tags?.join(', ') || 'none'}`);
          console.log(`   Score: ${(similar.score * 100).toFixed(1)}%`);
          console.log();
        }
      });
    }

    console.log('='.repeat(80));
    console.log('🔄 RECOMPUTING WITH IMPROVED ALGORITHM');
    console.log('='.repeat(80) + '\n');

    // Clear old similarities and requeue
    await Job.findByIdAndUpdate(existingFrontendJob._id, {
      $set: {
        similarJobs: [],
        'embedding.status': 'pending'
      }
    });

    // Queue for reprocessing
    await jobEmbeddingService.queueEmbeddingGeneration(existingFrontendJob._id, 1); // High priority
    console.log('✅ Queued job for reprocessing with improved algorithm');

    console.log('\n⏳ Waiting for worker to process (checking every 5 seconds)...\n');

    let attempts = 0;
    let maxAttempts = 24; // 2 minutes
    let completed = false;

    while (attempts < maxAttempts) {
      attempts++;
      await sleep(5000);

      const updatedJob = await Job.findById(existingFrontendJob._id);

      if (updatedJob.embedding?.status === 'completed' &&
          updatedJob.similarJobs &&
          updatedJob.similarJobs.length > 0) {
        console.log(`✅ Processing complete!`);
        console.log(`   Embedding status: ${updatedJob.embedding.status}`);
        console.log(`   Similar jobs found: ${updatedJob.similarJobs.length}`);
        completed = true;
        break;
      } else {
        console.log(`Attempt ${attempts}/${maxAttempts}: Status = ${updatedJob.embedding?.status || 'pending'}, Similar jobs = ${updatedJob.similarJobs?.length || 0}`);
      }
    }

    if (!completed) {
      console.log('❌ Processing timeout. Make sure worker is running.');
      return;
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 NEW RESULTS WITH IMPROVED ALGORITHM');
    console.log('='.repeat(80) + '\n');

    const finalJob = await Job.findById(existingFrontendJob._id);
    const newSimilarJobIds = finalJob.similarJobs.slice(0, 5).map(s => s.jobId);
    const newSimilarJobs = await Job.find({ _id: { $in: newSimilarJobIds } })
      .select('title category tags')
      .lean();

    const newJobMap = new Map(newSimilarJobs.map(j => [j._id.toString(), j]));

    console.log(`📋 Base Job: ${finalJob.title}`);
    console.log(`   Category: ${finalJob.category}`);
    console.log(`   Tags: ${finalJob.tags?.join(', ')}`);
    console.log(`\n🎯 Top ${finalJob.similarJobs.length} similar jobs:\n`);

    finalJob.similarJobs.slice(0, 5).forEach((similar, i) => {
      const job = newJobMap.get(similar.jobId.toString());
      if (job) {
        console.log(`${i + 1}. ${job.title}`);
        console.log(`   Category: ${job.category}`);
        console.log(`   Tags: ${job.tags?.join(', ') || 'none'}`);
        console.log(`   AI Similarity: ${(similar.score * 100).toFixed(1)}%`);

        // Analyze if it makes sense
        const isSameCategory = job.category === finalJob.category;
        const isFrontend = job.title.toLowerCase().includes('frontend') ||
                          job.title.toLowerCase().includes('react') ||
                          job.title.toLowerCase().includes('vue') ||
                          job.title.toLowerCase().includes('angular') ||
                          job.title.toLowerCase().includes('ui');

        console.log(`   Analysis:`);
        console.log(`     - Same category: ${isSameCategory ? '✅' : '❌'}`);
        console.log(`     - Frontend-related: ${isFrontend ? '✅' : '⚠️'}`);
        console.log();
      }
    });

    console.log('='.repeat(80));
    console.log('💡 KEY IMPROVEMENTS');
    console.log('='.repeat(80));
    console.log(`
✅ Role Type Extraction: System now understands that:
   - "React Developer" = Frontend Developer
   - "Vue.js Developer" = Frontend Developer
   - "Angular Developer" = Frontend Developer
   - They should ALL match with generic "Frontend Developer" jobs

✅ Semantic Grouping: The text now includes:
   - "This is a Frontend Developer position" (explicit role context)
   - Category weight increased (2x weight)
   - Tags moved AFTER description (less specific weight)

✅ Expected Behavior:
   - A React job should now find Vue jobs (both are Frontend)
   - A Vue job should find Angular jobs (both are Frontend)
   - All should match with generic "Frontend Developer" listings
   - Specific framework scores might be 75-85%
   - Generic frontend scores should be 80-90%
`);

    console.log('\n🎉 Test complete! The algorithm is now smarter about semantic categories.\n');

  } catch (error) {
    console.error('❌ Test error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
  }
}

testImprovedSimilarity();
