import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../src/config/database.js';

// Load environment variables
dotenv.config();

const fixJobFields = async () => {
  try {
    console.log('🔧 Fixing job fields...');

    // Connect to database
    await connectDB();
    const db = mongoose.connection.db;

    // Update jobs with undefined isDeleted field
    const result1 = await db.collection('jobs').updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false } }
    );
    console.log(`✅ Updated ${result1.modifiedCount} jobs with missing isDeleted field`);

    // Update jobs with undefined paymentStatus field
    const result2 = await db.collection('jobs').updateMany(
      { paymentStatus: { $exists: false } },
      { $set: { paymentStatus: 'pending' } }
    );
    console.log(`✅ Updated ${result2.modifiedCount} jobs with missing paymentStatus field`);

    // Update jobs with undefined paymentRequired field
    const result3 = await db.collection('jobs').updateMany(
      { paymentRequired: { $exists: false } },
      { $set: { paymentRequired: 0 } }
    );
    console.log(`✅ Updated ${result3.modifiedCount} jobs with missing paymentRequired field`);

    // Verify the fix by checking how many jobs should now be visible
    const visibleJobs = await db.collection('jobs').countDocuments({
      isDeleted: false,
      status: 'active',
      expiresAt: { $gt: new Date() }
    });
    console.log(`\n📊 Jobs that should now be visible: ${visibleJobs}`);

    console.log('\n✅ Job fields have been fixed!');

  } catch (error) {
    console.error('❌ Error fixing job fields:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from database');
  }
};

// Run the script
fixJobFields();