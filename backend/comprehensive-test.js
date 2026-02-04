import 'dotenv/config';
import mongoose from 'mongoose';
import Job from './src/models/Job.js';
import jobEmbeddingService from './src/services/jobEmbeddingService.js';

async function comprehensiveTests() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔬 COMPREHENSIVE SIMILARITY TESTS\n');
    console.log('='.repeat(60) + '\n');

    // TEST 1: Check if same job appears in similar jobs (it shouldn't)
    console.log('TEST 1: Self-Similarity Check');
    console.log('-'.repeat(60));
    const job1 = await Job.findOne({
      'embedding.status': 'completed',
      'similarJobs.0': { $exists: true }
    }).lean();

    if (job1) {
      const hasSelf = job1.similarJobs.some(s => s.jobId.toString() === job1._id.toString());
      console.log(`Job: ${job1.title}`);
      console.log(`Contains self in similar jobs: ${hasSelf ? '❌ YES (BUG!)' : '✅ NO (correct)'}`);

      if (hasSelf) {
        const selfSimilarity = job1.similarJobs.find(s => s.jobId.toString() === job1._id.toString());
        console.log(`Self-similarity score: ${(selfSimilarity.score * 100).toFixed(1)}%`);
      }
    }
    console.log();

    // TEST 2: Check similarity score distribution
    console.log('TEST 2: Similarity Score Distribution');
    console.log('-'.repeat(60));
    const allJobs = await Job.find({
      'embedding.status': 'completed',
      'similarJobs.0': { $exists: true }
    }).select('title similarJobs').lean();

    const allScores = [];
    allJobs.forEach(job => {
      job.similarJobs.forEach(similar => {
        allScores.push(similar.score);
      });
    });

    if (allScores.length > 0) {
      const avgScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
      const minScore = Math.min(...allScores);
      const maxScore = Math.max(...allScores);

      console.log(`Total similar job pairs: ${allScores.length}`);
      console.log(`Average similarity: ${(avgScore * 100).toFixed(1)}%`);
      console.log(`Min similarity: ${(minScore * 100).toFixed(1)}%`);
      console.log(`Max similarity: ${(maxScore * 100).toFixed(1)}%`);

      // Score buckets
      const buckets = {
        '90-100%': allScores.filter(s => s >= 0.9).length,
        '80-89%': allScores.filter(s => s >= 0.8 && s < 0.9).length,
        '70-79%': allScores.filter(s => s >= 0.7 && s < 0.8).length,
        '60-69%': allScores.filter(s => s >= 0.6 && s < 0.7).length,
        '<60%': allScores.filter(s => s < 0.6).length
      };

      console.log('\nScore distribution:');
      Object.entries(buckets).forEach(([range, count]) => {
        const pct = ((count / allScores.length) * 100).toFixed(1);
        console.log(`  ${range}: ${count} pairs (${pct}%)`);
      });
    }
    console.log();

    // TEST 3: Test actual embeddings directly
    console.log('TEST 3: Direct Embedding Similarity Test');
    console.log('-'.repeat(60));
    const testJob = await Job.findOne({
      'embedding.status': 'completed',
      'embedding.vector': { $exists: true }
    }).lean();

    if (testJob && testJob.embedding.vector) {
      // Test 1: Self-similarity (should be 1.0)
      const selfSim = jobEmbeddingService.cosineSimilarity(
        testJob.embedding.vector,
        testJob.embedding.vector
      );
      console.log(`Self-similarity: ${(selfSim * 100).toFixed(4)}%`);
      console.log(`Expected: 100%`);
      console.log(`Status: ${selfSim >= 0.999 ? '✅ PASS' : '❌ FAIL'}\n`);

      // Test 2: Find another job and check similarity
      const otherJob = await Job.findOne({
        _id: { $ne: testJob._id },
        'embedding.status': 'completed',
        'embedding.vector': { $exists: true }
      }).lean();

      if (otherJob) {
        const crossSim = jobEmbeddingService.cosineSimilarity(
          testJob.embedding.vector,
          otherJob.embedding.vector
        );
        console.log(`Cross-job similarity:`);
        console.log(`  Job 1: ${testJob.title}`);
        console.log(`  Job 2: ${otherJob.title}`);
        console.log(`  Similarity: ${(crossSim * 100).toFixed(2)}%`);
        console.log(`  Status: ${crossSim < 1.0 ? '✅ PASS (different jobs)' : '❌ FAIL (too similar)'}`);
      }
    }
    console.log();

    // TEST 4: Check embedding vector quality
    console.log('TEST 4: Embedding Vector Quality Check');
    console.log('-'.repeat(60));
    const jobWithEmbed = await Job.findOne({
      'embedding.vector': { $exists: true }
    }).lean();

    if (jobWithEmbed && jobWithEmbed.embedding.vector) {
      const vector = jobWithEmbed.embedding.vector;

      console.log(`Vector dimensions: ${vector.length}`);
      console.log(`Expected: 1536`);
      console.log(`Status: ${vector.length === 1536 ? '✅ PASS' : '❌ FAIL'}\n`);

      // Check for NaN or Infinity
      const hasNaN = vector.some(v => !isFinite(v));
      console.log(`Contains NaN/Infinity: ${hasNaN ? '❌ YES (BUG!)' : '✅ NO'}`);

      // Check if all zeros
      const allZeros = vector.every(v => v === 0);
      console.log(`All zeros: ${allZeros ? '❌ YES (BUG!)' : '✅ NO'}`);

      // Calculate magnitude
      const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      console.log(`Vector magnitude: ${magnitude.toFixed(4)}`);
      console.log(`Status: ${magnitude > 0 ? '✅ PASS' : '❌ FAIL'}\n`);

      // Show sample values
      console.log(`Sample values (first 10):`);
      console.log(vector.slice(0, 10).map(v => v.toFixed(6)).join(', '));
    }
    console.log();

    // TEST 5: Compare similar categories
    console.log('TEST 5: Category-Based Similarity Test');
    console.log('-'.repeat(60));
    const techJobs = await Job.find({
      category: 'Teknologji',
      'embedding.status': 'completed',
      'embedding.vector': { $exists: true }
    }).limit(3).lean();

    if (techJobs.length >= 2) {
      console.log('Testing jobs in same category (Teknologji):');
      for (let i = 0; i < techJobs.length - 1; i++) {
        for (let j = i + 1; j < techJobs.length; j++) {
          const sim = jobEmbeddingService.cosineSimilarity(
            techJobs[i].embedding.vector,
            techJobs[j].embedding.vector
          );
          console.log(`\n${techJobs[i].title}`);
          console.log(`  vs ${techJobs[j].title}`);
          console.log(`  Similarity: ${(sim * 100).toFixed(2)}%`);
          console.log(`  Expected: >70% (same category)`);
          console.log(`  Status: ${sim > 0.7 ? '✅ PASS' : '⚠️  LOW'}`);
        }
      }
    }
    console.log();

    // TEST 6: Compare different categories
    console.log('TEST 6: Cross-Category Similarity Test');
    console.log('-'.repeat(60));
    const categories = ['Teknologji', 'Marketing', 'Shitje'];
    const jobsByCategory = {};

    for (const cat of categories) {
      const job = await Job.findOne({
        category: cat,
        'embedding.status': 'completed',
        'embedding.vector': { $exists: true }
      }).lean();
      if (job) jobsByCategory[cat] = job;
    }

    if (Object.keys(jobsByCategory).length >= 2) {
      console.log('Testing jobs in different categories:');
      const cats = Object.keys(jobsByCategory);
      for (let i = 0; i < cats.length - 1; i++) {
        for (let j = i + 1; j < cats.length; j++) {
          const sim = jobEmbeddingService.cosineSimilarity(
            jobsByCategory[cats[i]].embedding.vector,
            jobsByCategory[cats[j]].embedding.vector
          );
          console.log(`\n${jobsByCategory[cats[i]].title} (${cats[i]})`);
          console.log(`  vs ${jobsByCategory[cats[j]].title} (${cats[j]})`);
          console.log(`  Similarity: ${(sim * 100).toFixed(2)}%`);
          console.log(`  Expected: <70% (different categories)`);
          console.log(`  Status: ${sim < 0.7 ? '✅ PASS' : '⚠️  HIGH'}`);
        }
      }
    }
    console.log();

    // TEST 7: Check stored vs computed similarity
    console.log('TEST 7: Stored vs Computed Similarity Verification');
    console.log('-'.repeat(60));
    const jobToVerify = await Job.findOne({
      'embedding.status': 'completed',
      'similarJobs.0': { $exists: true }
    }).lean();

    if (jobToVerify && jobToVerify.similarJobs.length > 0) {
      console.log(`Verifying job: ${jobToVerify.title}`);

      // Check first 3 similar jobs
      for (let i = 0; i < Math.min(3, jobToVerify.similarJobs.length); i++) {
        const similar = jobToVerify.similarJobs[i];
        const similarJob = await Job.findById(similar.jobId).lean();

        if (similarJob && similarJob.embedding.vector) {
          const storedScore = similar.score;
          const computedScore = jobEmbeddingService.cosineSimilarity(
            jobToVerify.embedding.vector,
            similarJob.embedding.vector
          );

          const diff = Math.abs(storedScore - computedScore);

          console.log(`\nSimilar job ${i + 1}: ${similarJob.title}`);
          console.log(`  Stored score: ${(storedScore * 100).toFixed(4)}%`);
          console.log(`  Computed score: ${(computedScore * 100).toFixed(4)}%`);
          console.log(`  Difference: ${(diff * 100).toFixed(6)}%`);
          console.log(`  Status: ${diff < 0.0001 ? '✅ EXACT MATCH' : diff < 0.01 ? '✅ CLOSE' : '⚠️  MISMATCH'}`);
        }
      }
    }
    console.log();

    // SUMMARY
    console.log('='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('\nIssues found will be marked with ❌ or ⚠️  above.\n');

  } catch (error) {
    console.error('\n❌ Test Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
  }
}

comprehensiveTests();
