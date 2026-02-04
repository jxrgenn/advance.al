import 'dotenv/config';
import mongoose from 'mongoose';
import Job from './src/models/Job.js';

// Different boost strategies to test
const boostStrategies = {
  // Strategy 1: Square root (gentle boost)
  sqrt: (score) => Math.sqrt(score),

  // Strategy 2: Exponential (0.5 power - moderate boost)
  exp05: (score) => Math.pow(score, 0.5),

  // Strategy 3: Exponential (0.4 power - stronger boost)
  exp04: (score) => Math.pow(score, 0.4),

  // Strategy 4: Linear scale (70-100 range becomes 85-100)
  linear: (score) => 0.85 + (score - 0.7) * 0.5,

  // Strategy 5: Sigmoid-like (smooth boost)
  sigmoid: (score) => 0.8 + (score * 0.2),

  // Strategy 6: Custom sweet spot (boosts 70-90 range most)
  custom: (score) => {
    if (score >= 0.9) return score; // Keep very high scores
    if (score >= 0.7) return 0.85 + (score - 0.7) * 0.6; // Boost mid-range
    return score; // Below threshold stays same
  }
};

async function testBoostStrategies() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🎨 SIMILARITY BOOST STRATEGY COMPARISON\n');
    console.log('='.repeat(70) + '\n');

    // Get a job with similar jobs
    const job = await Job.findOne({
      'embedding.status': 'completed',
      'similarJobs.0': { $exists: true }
    }).lean();

    if (!job) {
      console.log('No jobs with similarities found.');
      return;
    }

    console.log(`Test Job: ${job.title}\n`);
    console.log('-'.repeat(70));

    // Get similar jobs details
    const similarJobIds = job.similarJobs.slice(0, 5).map(s => s.jobId);
    const similarJobs = await Job.find({
      _id: { $in: similarJobIds }
    }).select('title').lean();

    const jobMap = new Map(similarJobs.map(j => [j._id.toString(), j]));

    // Show original scores
    console.log('\nORIGINAL SCORES (Current System):');
    console.log('-'.repeat(70));
    job.similarJobs.slice(0, 5).forEach((similar, i) => {
      const similarJob = jobMap.get(similar.jobId.toString());
      if (similarJob) {
        console.log(`${i + 1}. ${similarJob.title}`);
        console.log(`   Score: ${(similar.score * 100).toFixed(1)}%\n`);
      }
    });

    // Test each strategy
    Object.entries(boostStrategies).forEach(([name, boostFn]) => {
      console.log(`\nSTRATEGY: ${name.toUpperCase()}`);
      console.log('-'.repeat(70));

      job.similarJobs.slice(0, 5).forEach((similar, i) => {
        const similarJob = jobMap.get(similar.jobId.toString());
        if (similarJob) {
          const original = similar.score;
          const boosted = boostFn(original);
          const increase = ((boosted - original) * 100).toFixed(1);

          console.log(`${i + 1}. ${similarJob.title}`);
          console.log(`   Original: ${(original * 100).toFixed(1)}% → Boosted: ${(boosted * 100).toFixed(1)}% (+${increase}%)\n`);
        }
      });
    });

    // Recommendations
    console.log('='.repeat(70));
    console.log('RECOMMENDATIONS');
    console.log('='.repeat(70));
    console.log('\n📊 Score Ranges After Boosting:\n');

    const sampleScores = [0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00];

    Object.entries(boostStrategies).forEach(([name, boostFn]) => {
      console.log(`${name.toUpperCase()}:`);
      sampleScores.forEach(score => {
        const boosted = boostFn(score);
        console.log(`  ${(score * 100).toFixed(0)}% → ${(boosted * 100).toFixed(1)}%`);
      });
      console.log();
    });

    console.log('✨ RECOMMENDED: "custom" strategy');
    console.log('   - Keeps 90%+ scores authentic');
    console.log('   - Boosts 70-89% to look more impressive');
    console.log('   - 70% → 85%, 80% → 91%, 85% → 94%, 90% → 90%\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

testBoostStrategies();
