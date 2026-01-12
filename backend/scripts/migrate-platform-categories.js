import mongoose from 'mongoose';
import Job from '../src/models/Job.js';
import dotenv from 'dotenv';

dotenv.config();

// Helper functions to determine categories based on job characteristics
function determineDiaspora(job) {
  const diasporaKeywords = ['diaspora', 'abroad', 'overseas', 'international'];
  const title = (job.title || '').toLowerCase();
  const description = (job.description || '').toLowerCase();
  const city = (job.location?.city || '').toLowerCase();
  const country = (job.location?.country || '').toLowerCase();

  return (
    city === 'diaspora' ||
    (country !== 'albania' && country !== 'shqipëri' && country !== '') ||
    diasporaKeywords.some(keyword => title.includes(keyword) || description.includes(keyword))
  );
}

function determineRemote(job) {
  const remoteKeywords = ['remote', 'nga shtëpia', 'work from home', 'distancë', 'online'];
  const title = (job.title || '').toLowerCase();
  const description = (job.description || '').toLowerCase();

  return (
    job.location?.remote === true ||
    job.remoteType === 'full' ||
    job.remoteType === 'hybrid' ||
    job.workType === 'remote' ||
    remoteKeywords.some(keyword => title.includes(keyword) || description.includes(keyword))
  );
}

function determinePartTime(job) {
  const partTimeKeywords = ['part-time', 'part time', 'me orar të reduktuar', 'gjysmë kohe'];
  const title = (job.title || '').toLowerCase();
  const description = (job.description || '').toLowerCase();

  return (
    job.jobType === 'part-time' ||
    job.jobType === 'Part-time' ||
    job.schedule === 'part-time' ||
    partTimeKeywords.some(keyword => title.includes(keyword) || description.includes(keyword))
  );
}

function determineAdmin(job) {
  const adminKeywords = ['admin', 'administrator', 'administrata', 'hr', 'burime njerëzore', 'human resources', 'office manager', 'secretary', 'assistant'];
  const title = (job.title || '').toLowerCase();
  const description = (job.description || '').toLowerCase();
  const category = (job.category || '').toLowerCase();

  return (
    category === 'burime njerëzore' ||
    category === 'administrata' ||
    category === 'human resources' ||
    adminKeywords.some(keyword => title.includes(keyword) || description.includes(keyword))
  );
}

function determineSeasonal(job) {
  const seasonalKeywords = ['seasonal', 'sezonale', 'verore', 'summer', 'temporary', 'i përkohshëm', 'short-term', 'contract'];
  const title = (job.title || '').toLowerCase();
  const description = (job.description || '').toLowerCase();
  const duration = (job.duration || '').toLowerCase();

  return (
    duration === '3 months' ||
    duration === '6 months' ||
    duration.includes('month') ||
    job.type === 'seasonal' ||
    job.contractType === 'temporary' ||
    (Array.isArray(job.tags) && job.tags.some(tag =>
      ['seasonal', 'summer', 'temporary', 'sezonale'].includes((tag || '').toLowerCase())
    )) ||
    seasonalKeywords.some(keyword => title.includes(keyword) || description.includes(keyword))
  );
}

async function migrateplatformCategories() {
  try {
    console.log('🔄 Starting platform categories migration...');
    console.log(`📡 Connecting to MongoDB: ${process.env.MONGODB_URI?.substring(0, 20)}...`);

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    const jobs = await Job.find({});
    console.log(`📊 Found ${jobs.length} jobs to migrate`);

    let updated = 0;
    let stats = {
      diaspora: 0,
      ngaShtepια: 0,
      partTime: 0,
      administrata: 0,
      sezonale: 0
    };

    for (const job of jobs) {
      const platformCategories = {
        diaspora: determineDiaspora(job),
        ngaShtepια: determineRemote(job),
        partTime: determinePartTime(job),
        administrata: determineAdmin(job),
        sezonale: determineSeasonal(job)
      };

      // Count statistics
      if (platformCategories.diaspora) stats.diaspora++;
      if (platformCategories.ngaShtepια) stats.ngaShtepια++;
      if (platformCategories.partTime) stats.partTime++;
      if (platformCategories.administrata) stats.administrata++;
      if (platformCategories.sezonale) stats.sezonale++;

      await Job.updateOne(
        { _id: job._id },
        { $set: { platformCategories } }
      );
      updated++;

      if (updated % 10 === 0) {
        console.log(`⏳ Progress: ${updated}/${jobs.length} jobs updated...`);
      }
    }

    console.log('\n✅ Migration complete!');
    console.log(`📈 Statistics:`);
    console.log(`   - Total jobs updated: ${updated}`);
    console.log(`   - Diaspora: ${stats.diaspora} jobs (${((stats.diaspora/updated)*100).toFixed(1)}%)`);
    console.log(`   - Nga shtëpia (Remote): ${stats.ngaShtepια} jobs (${((stats.ngaShtepια/updated)*100).toFixed(1)}%)`);
    console.log(`   - Part Time: ${stats.partTime} jobs (${((stats.partTime/updated)*100).toFixed(1)}%)`);
    console.log(`   - Administrata: ${stats.administrata} jobs (${((stats.administrata/updated)*100).toFixed(1)}%)`);
    console.log(`   - Sezonale: ${stats.sezonale} jobs (${((stats.sezonale/updated)*100).toFixed(1)}%)`);

    await mongoose.connection.close();
    console.log('\n👋 Disconnected from database');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateplatformCategories();
