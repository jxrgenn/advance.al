import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from parent directory
dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

// Job Schema (simplified - only what we need)
const jobSchema = new mongoose.Schema({}, { strict: false });
const Job = mongoose.model('Job', jobSchema);

async function seedPlatformCategories() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get all active jobs
    const jobs = await Job.find({ isDeleted: false, status: 'active' }).limit(25);
    console.log(`📊 Found ${jobs.length} active jobs`);

    if (jobs.length === 0) {
      console.log('⚠️ No active jobs found to update');
      return;
    }

    let updateCount = 0;

    // Distribute platformCategories across jobs
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const updates = {};

      // Assign categories based on position to ensure variety
      // Every 5th job gets diaspora
      if (i % 5 === 0) {
        updates['platformCategories.diaspora'] = true;
      }

      // Every 4th job gets ngaShtepia (remote work)
      if (i % 4 === 0) {
        updates['platformCategories.ngaShtepia'] = true;
      }

      // Every 6th job gets partTime
      if (i % 6 === 0) {
        updates['platformCategories.partTime'] = true;
      }

      // Every 8th job gets administrata
      if (i % 8 === 0) {
        updates['platformCategories.administrata'] = true;
      }

      // Every 7th job gets sezonale
      if (i % 7 === 0) {
        updates['platformCategories.sezonale'] = true;
      }

      // Only update if we have changes
      if (Object.keys(updates).length > 0) {
        await Job.updateOne({ _id: job._id }, { $set: updates });

        const categories = Object.keys(updates).map(k => k.split('.')[1]).join(', ');
        console.log(`✅ Updated job "${job.title}" with: ${categories}`);
        updateCount++;
      }
    }

    console.log(`\n🎉 Successfully updated ${updateCount} jobs with platform categories!`);
    console.log('\n📊 Category distribution:');

    // Count jobs by category
    const diasporaCount = await Job.countDocuments({ 'platformCategories.diaspora': true, isDeleted: false });
    const ngaShtepiaCount = await Job.countDocuments({ 'platformCategories.ngaShtepia': true, isDeleted: false });
    const partTimeCount = await Job.countDocuments({ 'platformCategories.partTime': true, isDeleted: false });
    const administrataCount = await Job.countDocuments({ 'platformCategories.administrata': true, isDeleted: false });
    const sezonaleCount = await Job.countDocuments({ 'platformCategories.sezonale': true, isDeleted: false });

    console.log(`   - Diaspora: ${diasporaCount} jobs`);
    console.log(`   - Nga shtëpia: ${ngaShtepiaCount} jobs`);
    console.log(`   - Part Time: ${partTimeCount} jobs`);
    console.log(`   - Administrata: ${administrataCount} jobs`);
    console.log(`   - Sezonale: ${sezonaleCount} jobs`);

  } catch (error) {
    console.error('❌ Error seeding platform categories:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the seed function
seedPlatformCategories()
  .then(() => {
    console.log('✅ Seed completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
