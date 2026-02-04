import 'dotenv/config';
import mongoose from 'mongoose';
import Job from './src/models/Job.js';

async function testSimilarity() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Get a random job with embeddings
    const job = await Job.findOne({
      'embedding.status': 'completed',
      'similarJobs.0': { $exists: true }
    }).lean();

    if (!job) {
      console.log('No jobs with embeddings found yet. Worker might still be processing.');
      return;
    }

    console.log('📋 TEST JOB:');
    console.log(`Title: ${job.title}`);
    console.log(`Category: ${job.category}`);
    console.log(`Location: ${job.location?.city}`);
    console.log(`\n✨ SIMILAR JOBS (AI-Powered):\n`);

    // Fetch the similar jobs
    const similarJobIds = job.similarJobs.slice(0, 5).map(s => s.jobId);
    const similarJobs = await Job.find({
      _id: { $in: similarJobIds }
    }).select('title category location').lean();

    const jobMap = new Map(similarJobs.map(j => [j._id.toString(), j]));

    job.similarJobs.slice(0, 5).forEach((similar, index) => {
      const similarJob = jobMap.get(similar.jobId.toString());
      if (similarJob) {
        console.log(`${index + 1}. ${similarJob.title}`);
        console.log(`   Category: ${similarJob.category}`);
        console.log(`   Location: ${similarJob.location?.city}`);
        console.log(`   Similarity Score: ${(similar.score * 100).toFixed(1)}%`);
        console.log();
      }
    });

    console.log('✅ Similarity system is working!');
    console.log(`\nTest it yourself: http://localhost:3001/api/jobs/${job._id}/similar\n`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

testSimilarity();
