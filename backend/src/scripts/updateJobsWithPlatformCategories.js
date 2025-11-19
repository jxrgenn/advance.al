import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Job } from '../models/index.js';

// Load environment variables
dotenv.config();

const updateJobsWithPlatformCategories = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all jobs that don't have platformCategories set
    const jobsToUpdate = await Job.find({
      $or: [
        { platformCategories: { $exists: false } },
        { 'platformCategories.diaspora': { $exists: false } },
        { 'platformCategories.ngaShtepια': { $exists: false } },
        { 'platformCategories.partTime': { $exists: false } },
        { 'platformCategories.administrata': { $exists: false } },
        { 'platformCategories.sezonale': { $exists: false } }
      ]
    });

    console.log(`📊 Found ${jobsToUpdate.length} jobs to update`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const job of jobsToUpdate) {
      try {
        // Initialize platformCategories if it doesn't exist
        if (!job.platformCategories) {
          job.platformCategories = {};
        }

        // Set default values based on existing job data

        // Diaspora: Check if location is outside Albania
        if (job.platformCategories.diaspora === undefined) {
          const isOutsideAlbania = job.location?.city &&
            !['Tiranë', 'Durrës', 'Vlorë', 'Elbasan', 'Shkodër', 'Korçë', 'Fier', 'Berat', 'Lushnjë', 'Kavajë', 'Gjirokastër', 'Sarandë', 'Laç', 'Kukës', 'Lezhë', 'Pogradec', 'Peshkopi', 'Kuçovë', 'Krujë', 'Burrel'].includes(job.location.city);
          job.platformCategories.diaspora = Boolean(isOutsideAlbania);
        }

        // Nga shtëpia: Check if remote work is enabled
        if (job.platformCategories.ngaShtepια === undefined) {
          job.platformCategories.ngaShtepια = Boolean(job.location?.remote || job.location?.remoteType === 'full');
        }

        // Part Time: Check job type
        if (job.platformCategories.partTime === undefined) {
          job.platformCategories.partTime = Boolean(job.jobType === 'part-time');
        }

        // Administrata: Check if it's a government position (we'll set to false for now)
        if (job.platformCategories.administrata === undefined) {
          job.platformCategories.administrata = false; // Will be set manually later
        }

        // Sezonale: Check if it's a seasonal job (contract type or specific categories)
        if (job.platformCategories.sezonale === undefined) {
          const isSeasonalCategory = ['Turizëm', 'Ndërtim'].includes(job.category);
          const isContractJob = job.jobType === 'contract';
          job.platformCategories.sezonale = Boolean(isSeasonalCategory || isContractJob);
        }

        // Save the updated job
        await job.save();
        updatedCount++;

        if (updatedCount % 100 === 0) {
          console.log(`📝 Updated ${updatedCount} jobs so far...`);
        }

      } catch (error) {
        console.error(`❌ Error updating job ${job._id}:`, error.message);
        skippedCount++;
      }
    }

    console.log(`✅ Migration completed successfully!`);
    console.log(`📊 Results:`);
    console.log(`   - Updated: ${updatedCount} jobs`);
    console.log(`   - Skipped: ${skippedCount} jobs`);
    console.log(`   - Total processed: ${jobsToUpdate.length} jobs`);

    // Show some statistics
    const platformStats = await Job.aggregate([
      {
        $group: {
          _id: null,
          totalJobs: { $sum: 1 },
          diasporaJobs: { $sum: { $cond: ['$platformCategories.diaspora', 1, 0] } },
          remoteJobs: { $sum: { $cond: ['$platformCategories.ngaShtepια', 1, 0] } },
          partTimeJobs: { $sum: { $cond: ['$platformCategories.partTime', 1, 0] } },
          administrataJobs: { $sum: { $cond: ['$platformCategories.administrata', 1, 0] } },
          sezonaleJobs: { $sum: { $cond: ['$platformCategories.sezonale', 1, 0] } }
        }
      }
    ]);

    if (platformStats.length > 0) {
      const stats = platformStats[0];
      console.log(`\n📈 Platform Categories Statistics:`);
      console.log(`   - Total Jobs: ${stats.totalJobs}`);
      console.log(`   - Diaspora Jobs: ${stats.diasporaJobs} (${(stats.diasporaJobs / stats.totalJobs * 100).toFixed(1)}%)`);
      console.log(`   - Remote Jobs: ${stats.remoteJobs} (${(stats.remoteJobs / stats.totalJobs * 100).toFixed(1)}%)`);
      console.log(`   - Part-time Jobs: ${stats.partTimeJobs} (${(stats.partTimeJobs / stats.totalJobs * 100).toFixed(1)}%)`);
      console.log(`   - Government Jobs: ${stats.administrataJobs} (${(stats.administrataJobs / stats.totalJobs * 100).toFixed(1)}%)`);
      console.log(`   - Seasonal Jobs: ${stats.sezonaleJobs} (${(stats.sezonaleJobs / stats.totalJobs * 100).toFixed(1)}%)`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    console.log('🔌 Closing database connection...');
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  }
};

// Run the migration
console.log('🚀 Starting job platform categories migration...');
updateJobsWithPlatformCategories();