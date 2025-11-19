import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../src/config/database.js';

// Load environment variables
dotenv.config();

const debugJobStatus = async () => {
  try {
    console.log('🔍 Debugging job status...');

    // Connect to database
    await connectDB();
    const db = mongoose.connection.db;

    // Get klajdi user
    const klajdiUser = await db.collection('users').findOne({
      email: 'klajdi@techinnovations.al'
    });

    if (!klajdiUser) {
      console.log('❌ klajdi user not found');
      return;
    }

    // Get all jobs by klajdi
    const klajdiJobs = await db.collection('jobs').find({
      employerId: klajdiUser._id
    }).sort({ postedAt: -1 }).toArray();

    console.log(`\n📊 Found ${klajdiJobs.length} jobs by klajdi@techinnovations.al:`);

    klajdiJobs.forEach((job, index) => {
      console.log(`${index + 1}. "${job.title}"`);
      console.log(`   Status: ${job.status}`);
      console.log(`   Posted: ${job.postedAt}`);
      console.log(`   Expires: ${job.expiresAt}`);
      console.log(`   Is Deleted: ${job.isDeleted}`);
      console.log(`   Tier: ${job.tier}`);
      console.log(`   Payment Status: ${job.paymentStatus}`);
      console.log('   ---');
    });

    // Check what the search query in the Job model expects
    console.log('\n🔍 Current date for comparison:');
    console.log('   Current Date:', new Date());

    // Check which jobs are considered expired
    const expiredJobs = klajdiJobs.filter(job => new Date(job.expiresAt) <= new Date());
    console.log(`\n⏰ Expired jobs: ${expiredJobs.length}`);
    expiredJobs.forEach(job => {
      console.log(`   - ${job.title}: expires ${job.expiresAt}`);
    });

    // Check which jobs should be active according to criteria
    const validJobs = klajdiJobs.filter(job =>
      !job.isDeleted &&
      job.status === 'active' &&
      new Date(job.expiresAt) > new Date()
    );
    console.log(`\n✅ Jobs that should be visible: ${validJobs.length}`);
    validJobs.forEach(job => {
      console.log(`   - ${job.title}`);
    });

  } catch (error) {
    console.error('❌ Error debugging jobs:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from database');
  }
};

// Run the script
debugJobStatus();