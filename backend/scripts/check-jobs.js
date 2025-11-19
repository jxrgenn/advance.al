import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../src/config/database.js';

// Load environment variables
dotenv.config();

const checkJobs = async () => {
  try {
    console.log('🔍 Checking jobs in database...');

    // Connect to database
    await connectDB();
    const db = mongoose.connection.db;

    // Count total jobs
    const totalJobs = await db.collection('jobs').countDocuments();
    console.log(`📊 Total jobs in database: ${totalJobs}`);

    // Count active jobs
    const activeJobs = await db.collection('jobs').countDocuments({
      status: 'active',
      isDeleted: false
    });
    console.log(`✅ Active jobs: ${activeJobs}`);

    // Count jobs by employerId
    const klajdiUser = await db.collection('users').findOne({
      email: 'klajdi@techinnovations.al'
    });

    if (klajdiUser) {
      const klajdiJobs = await db.collection('jobs').countDocuments({
        employerId: klajdiUser._id
      });
      console.log(`👤 Jobs by klajdi@techinnovations.al: ${klajdiJobs}`);
    }

    // Get recent jobs (last 7 days)
    const recentJobs = await db.collection('jobs').find({
      postedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).toArray();
    console.log(`📅 Jobs posted in last 7 days: ${recentJobs.length}`);

    // Show sample jobs
    const sampleJobs = await db.collection('jobs').find({})
      .sort({ postedAt: -1 })
      .limit(5)
      .toArray();

    console.log('\n📋 Sample jobs (latest 5):');
    sampleJobs.forEach((job, index) => {
      console.log(`${index + 1}. ${job.title} - ${job.status} - Posted: ${job.postedAt}`);
    });

    // Check if jobs meet the search criteria
    const searchCriteria = {
      isDeleted: false,
      status: 'active',
      expiresAt: { $gt: new Date() }
    };

    const jobsMatchingCriteria = await db.collection('jobs').countDocuments(searchCriteria);
    console.log(`\n🔍 Jobs matching search criteria: ${jobsMatchingCriteria}`);

    // Show detailed info about jobs that don't match criteria
    const expiredJobs = await db.collection('jobs').countDocuments({
      expiresAt: { $lte: new Date() }
    });
    console.log(`⏰ Expired jobs: ${expiredJobs}`);

    const deletedJobs = await db.collection('jobs').countDocuments({
      isDeleted: true
    });
    console.log(`🗑️ Deleted jobs: ${deletedJobs}`);

    const inactiveJobs = await db.collection('jobs').countDocuments({
      status: { $ne: 'active' }
    });
    console.log(`💤 Inactive jobs: ${inactiveJobs}`);

  } catch (error) {
    console.error('❌ Error checking jobs:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from database');
  }
};

// Run the script
checkJobs();