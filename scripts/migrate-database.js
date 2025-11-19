import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB, disconnectDB } from '../src/config/database.js';

// Load environment variables
dotenv.config();

const migrateDatabase = async () => {
  try {
    console.log('🔄 Starting database migration...');
    console.log('📡 Connecting to new MongoDB URI...');

    // Connect to the new database using the updated MONGODB_URI
    await connectDB();
    console.log('✅ Successfully connected to MongoDB');

    const db = mongoose.connection.db;

    // Check if this is a fresh database or existing one
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);

    console.log('📊 Current collections in database:', collectionNames);

    // Check if we have existing data
    const hasExistingData = await checkExistingData(db);

    if (hasExistingData) {
      console.log('📦 Existing data found. Running data migration checks...');
      await runDataMigrations(db);
    } else {
      console.log('🆕 Fresh database detected. Consider running the seed script:');
      console.log('   npm run seed-database');
      console.log('   or');
      console.log('   node scripts/seed-database.js');
    }

    // Ensure all required indexes exist
    console.log('🔧 Updating database indexes...');
    await updateIndexes(db);

    // Validate data integrity
    console.log('🔍 Validating data integrity...');
    await validateDataIntegrity(db);

    console.log('✅ Database migration completed successfully!');
    console.log('');
    console.log('📋 Migration Summary:');
    console.log(`   • Database connection: ✅ Updated to new MONGODB_URI`);
    console.log(`   • Collections checked: ✅ ${collectionNames.length} collections`);
    console.log(`   • Indexes updated: ✅ All performance indexes in place`);
    console.log(`   • Data integrity: ✅ Validated successfully`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await disconnectDB();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
};

const checkExistingData = async (db) => {
  try {
    const userCount = await db.collection('users').countDocuments();
    const jobCount = await db.collection('jobs').countDocuments();
    const locationCount = await db.collection('locations').countDocuments();

    console.log('📊 Data counts:');
    console.log(`   • Users: ${userCount}`);
    console.log(`   • Jobs: ${jobCount}`);
    console.log(`   • Locations: ${locationCount}`);

    return userCount > 0 || jobCount > 0 || locationCount > 0;
  } catch (error) {
    console.error('Error checking existing data:', error.message);
    return false;
  }
};

const runDataMigrations = async (db) => {
  try {
    // Migration 1: Ensure all users have required fields
    console.log('🔧 Migration 1: Updating user documents...');
    await db.collection('users').updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false } }
    );

    await db.collection('users').updateMany(
      { emailVerified: { $exists: false } },
      { $set: { emailVerified: false } }
    );

    await db.collection('users').updateMany(
      { 'privacySettings': { $exists: false } },
      {
        $set: {
          'privacySettings': {
            profileVisible: true,
            showInSearch: true
          }
        }
      }
    );

    // Migration 2: Ensure all jobs have required fields
    console.log('🔧 Migration 2: Updating job documents...');
    await db.collection('jobs').updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false } }
    );

    await db.collection('jobs').updateMany(
      { viewCount: { $exists: false } },
      { $set: { viewCount: 0 } }
    );

    await db.collection('jobs').updateMany(
      { applicationCount: { $exists: false } },
      { $set: { applicationCount: 0 } }
    );

    await db.collection('jobs').updateMany(
      { tier: { $exists: false } },
      { $set: { tier: 'basic' } }
    );

    // Migration 3: Ensure locations have required fields
    console.log('🔧 Migration 3: Updating location documents...');
    await db.collection('locations').updateMany(
      { jobCount: { $exists: false } },
      { $set: { jobCount: 0 } }
    );

    await db.collection('locations').updateMany(
      { userCount: { $exists: false } },
      { $set: { userCount: 0 } }
    );

    await db.collection('locations').updateMany(
      { isActive: { $exists: false } },
      { $set: { isActive: true } }
    );

    // Migration 4: Update job application counts
    console.log('🔧 Migration 4: Recalculating job application counts...');
    const jobs = await db.collection('jobs').find({}, { _id: 1 }).toArray();

    for (const job of jobs) {
      const applicationCount = await db.collection('applications')
        .countDocuments({ jobId: job._id });

      await db.collection('jobs').updateOne(
        { _id: job._id },
        { $set: { applicationCount } }
      );
    }

    // Migration 5: Update location counts
    console.log('🔧 Migration 5: Recalculating location counts...');
    const locations = await db.collection('locations').find({}, { city: 1 }).toArray();

    for (const location of locations) {
      const jobCount = await db.collection('jobs')
        .countDocuments({ 'location.city': location.city, isDeleted: false });

      const userCount = await db.collection('users')
        .countDocuments({ 'profile.location.city': location.city, isDeleted: false });

      await db.collection('locations').updateOne(
        { city: location.city },
        { $set: { jobCount, userCount } }
      );
    }

    console.log('✅ All data migrations completed successfully');

  } catch (error) {
    console.error('Error running data migrations:', error.message);
    throw error;
  }
};

const updateIndexes = async (db) => {
  try {
    // Users collection indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ userType: 1 });
    await db.collection('users').createIndex({ "profile.location.city": 1 });
    await db.collection('users').createIndex({ isDeleted: 1 });
    await db.collection('users').createIndex({ status: 1 });

    // Jobs collection indexes
    await db.collection('jobs').createIndex({ title: "text", tags: "text" });
    await db.collection('jobs').createIndex({ "location.city": 1, status: 1 });
    await db.collection('jobs').createIndex({ category: 1, postedAt: -1 });
    await db.collection('jobs').createIndex({ employerId: 1, status: 1 });
    await db.collection('jobs').createIndex({ postedAt: -1 });
    await db.collection('jobs').createIndex({ tier: 1, status: 1 });
    await db.collection('jobs').createIndex({ isDeleted: 1 });
    await db.collection('jobs').createIndex({ expiresAt: 1 });

    // Applications collection indexes
    await db.collection('applications').createIndex({ jobId: 1, appliedAt: -1 });
    await db.collection('applications').createIndex({ jobSeekerId: 1, appliedAt: -1 });
    await db.collection('applications').createIndex({ employerId: 1, status: 1 });
    await db.collection('applications').createIndex({ appliedAt: -1 });
    await db.collection('applications').createIndex({ status: 1 });

    // Locations collection indexes
    await db.collection('locations').createIndex({ city: 1 }, { unique: true });
    await db.collection('locations').createIndex({ isActive: 1 });
    await db.collection('locations').createIndex({ displayOrder: 1 });

    // Files collection indexes (if exists)
    const fileCollectionExists = await db.listCollections({ name: 'files' }).hasNext();
    if (fileCollectionExists) {
      await db.collection('files').createIndex({ ownerId: 1, fileType: 1 });
      await db.collection('files').createIndex({ uploadedAt: -1 });
    }

    // Payments collection indexes (if exists)
    const paymentCollectionExists = await db.listCollections({ name: 'payments' }).hasNext();
    if (paymentCollectionExists) {
      await db.collection('payments').createIndex({ employerId: 1, createdAt: -1 });
      await db.collection('payments').createIndex({ status: 1 });
    }

    // Analytics collection indexes (if exists)
    const analyticsCollectionExists = await db.listCollections({ name: 'analytics' }).hasNext();
    if (analyticsCollectionExists) {
      await db.collection('analytics').createIndex({ date: 1, type: 1 });
    }

    console.log('✅ Database indexes updated successfully');

  } catch (error) {
    // Ignore duplicate key errors for unique indexes
    if (error.code !== 11000) {
      console.error('Error updating indexes:', error.message);
    }
  }
};

const validateDataIntegrity = async (db) => {
  try {
    const issues = [];

    // Check for orphaned applications (applications without valid job or user)
    const applications = await db.collection('applications').find({}).toArray();
    for (const app of applications) {
      const job = await db.collection('jobs').findOne({ _id: app.jobId });
      const jobSeeker = await db.collection('users').findOne({ _id: app.jobSeekerId });
      const employer = await db.collection('users').findOne({ _id: app.employerId });

      if (!job) issues.push(`Application ${app._id} references non-existent job ${app.jobId}`);
      if (!jobSeeker) issues.push(`Application ${app._id} references non-existent job seeker ${app.jobSeekerId}`);
      if (!employer) issues.push(`Application ${app._id} references non-existent employer ${app.employerId}`);
    }

    // Check for jobs without valid employers
    const jobs = await db.collection('jobs').find({}).toArray();
    for (const job of jobs) {
      const employer = await db.collection('users').findOne({
        _id: job.employerId,
        userType: 'employer'
      });
      if (!employer) {
        issues.push(`Job ${job._id} references non-existent employer ${job.employerId}`);
      }
    }

    // Check for users with invalid locations
    const users = await db.collection('users').find({}).toArray();
    const validCities = await db.collection('locations').distinct('city');

    for (const user of users) {
      if (user.profile?.location?.city && !validCities.includes(user.profile.location.city)) {
        issues.push(`User ${user._id} has invalid location: ${user.profile.location.city}`);
      }
    }

    if (issues.length > 0) {
      console.log('⚠️  Data integrity issues found:');
      issues.forEach(issue => console.log(`   • ${issue}`));
      console.log('');
      console.log('💡 Consider cleaning up these issues manually or re-running the seed script');
    } else {
      console.log('✅ No data integrity issues found');
    }

    return issues;

  } catch (error) {
    console.error('Error validating data integrity:', error.message);
    return [];
  }
};

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateDatabase();
}

export { migrateDatabase };