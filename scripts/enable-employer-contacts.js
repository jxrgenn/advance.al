import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../backend/.env') });

// MongoDB Connection
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/albania-jobflow';
    await mongoose.connect(mongoUri);
    console.log('🍃 MongoDB Connected');
  } catch (error) {
    console.error('🔴 Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

// User Model (simplified for this script)
const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

async function enableEmployerContacts() {
  try {
    await connectDB();

    console.log('🔄 Enabling contact preferences for all employers...\n');

    // Update all employer users to enable contact methods
    const result = await User.updateMany(
      { userType: 'employer' },
      {
        $set: {
          'profile.employerProfile.contactPreferences.enablePhoneContact': true,
          'profile.employerProfile.contactPreferences.enableWhatsAppContact': true,
          'profile.employerProfile.contactPreferences.enableEmailContact': true,
        }
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} employer accounts`);
    console.log(`📊 Matched ${result.matchedCount} employer accounts\n`);

    // Verify the changes
    const employers = await User.find({ userType: 'employer' }).select('email profile.employerProfile.contactPreferences');

    console.log('📋 Verification - Employer Contact Preferences:');
    employers.forEach((employer, index) => {
      console.log(`\n${index + 1}. ${employer.email}`);
      console.log(`   - Phone: ${employer.profile?.employerProfile?.contactPreferences?.enablePhoneContact || false}`);
      console.log(`   - WhatsApp: ${employer.profile?.employerProfile?.contactPreferences?.enableWhatsAppContact || false}`);
      console.log(`   - Email: ${employer.profile?.employerProfile?.contactPreferences?.enableEmailContact || false}`);
    });

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

enableEmployerContacts();
