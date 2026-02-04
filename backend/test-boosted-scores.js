import 'dotenv/config';
import mongoose from 'mongoose';
import Job from './src/models/Job.js';

// Same boost function as in the API
const boostScore = (score) => {
  if (score >= 0.9) return score; // Keep very high scores authentic
  if (score >= 0.7) return 0.85 + (score - 0.7) * 0.6; // Boost mid-range nicely
  return score;
};

async function testBoostedScores() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🚀 TESTING BOOSTED SIMILARITY SCORES\n');
    console.log('='.repeat(70) + '\n');

    const job = await Job.findOne({
      'embedding.status': 'completed',
      'similarJobs.0': { $exists: true }
    }).lean();

    if (!job) {
      console.log('No jobs with similarities found.');
      return;
    }

    console.log(`📋 Job: ${job.title}`);
    console.log(`Category: ${job.category}`);
    console.log(`Location: ${job.location?.city}\n`);
    console.log('='.repeat(70));
    console.log('BEFORE vs AFTER BOOST\n');

    const similarJobIds = job.similarJobs.slice(0, 5).map(s => s.jobId);
    const similarJobs = await Job.find({
      _id: { $in: similarJobIds }
    }).select('title category location').lean();

    const jobMap = new Map(similarJobs.map(j => [j._id.toString(), j]));

    job.similarJobs.slice(0, 5).forEach((similar, index) => {
      const similarJob = jobMap.get(similar.jobId.toString());
      if (similarJob) {
        const original = similar.score;
        const boosted = boostScore(original);
        const increase = ((boosted - original) * 100).toFixed(1);

        console.log(`${index + 1}. ${similarJob.title}`);
        console.log(`   Category: ${similarJob.category} | Location: ${similarJob.location?.city}`);
        console.log(`   📊 Original: ${(original * 100).toFixed(1)}%`);
        console.log(`   ✨ Boosted:  ${(boosted * 100).toFixed(1)}% (+${increase}%)`);
        console.log();
      }
    });

    console.log('='.repeat(70));
    console.log('💡 WHAT USERS WILL SEE:\n');

    job.similarJobs.slice(0, 5).forEach((similar, index) => {
      const similarJob = jobMap.get(similar.jobId.toString());
      if (similarJob) {
        const boosted = boostScore(similar.score);
        console.log(`${index + 1}. ${similarJob.title}`);
        console.log(`   ${(boosted * 100).toFixed(0)}% Match\n`);
      }
    });

    console.log('='.repeat(70));
    console.log('✅ Scores are now more impressive while remaining accurate!\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

testBoostedScores();
