import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

// Load environment variables
dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📍 Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

const updateCompanies = async () => {
  try {
    console.log('🚀 Updating companies to verified status...');

    // Update all employer companies to be verified
    const result = await User.updateMany(
      {
        userType: 'employer',
        'profile.employerProfile.companyName': { $exists: true }
      },
      {
        $set: {
          'profile.employerProfile.verified': true,
          'status': 'active'
        }
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} companies to verified status`);

    // List all companies
    const companies = await User.find(
      { userType: 'employer' },
      { 'profile.employerProfile.companyName': 1, 'profile.employerProfile.verified': 1, status: 1 }
    );

    console.log('\n📋 All companies:');
    companies.forEach(company => {
      console.log(`- ${company.profile.employerProfile.companyName} (verified: ${company.profile.employerProfile.verified}, status: ${company.status})`);
    });

  } catch (error) {
    console.error('❌ Error updating companies:', error);
  }
};

const main = async () => {
  await connectDB();
  await updateCompanies();
  await mongoose.disconnect();
  console.log('📍 Disconnected from MongoDB');
  process.exit(0);
};

main();