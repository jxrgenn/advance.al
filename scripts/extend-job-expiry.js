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

// Job Model (simplified for this script)
const Job = mongoose.model('Job', new mongoose.Schema({}, { strict: false }));

async function extendJobExpiry() {
  try {
    await connectDB();

    console.log('🔄 Extending expiry dates for all jobs...\n');

    // Calculate new expiry date: 30 days from now
    const newExpiryDate = new Date();
    newExpiryDate.setDate(newExpiryDate.getDate() + 30);

    console.log(`📅 New expiry date: ${newExpiryDate.toISOString()}\n`);

    // Update all jobs to extend their expiry date
    const result = await Job.updateMany(
      {},
      {
        $set: {
          expiresAt: newExpiryDate,
          isActive: true // Also set jobs as active
        }
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} job listings`);
    console.log(`📊 Matched ${result.matchedCount} job listings\n`);

    // Verify the changes - show a sample of updated jobs
    const jobs = await Job.find({})
      .select('title expiresAt isActive postedAt')
      .sort({ postedAt: -1 })
      .limit(10);

    console.log('📋 Verification - Sample of Updated Jobs (10 most recent):');
    jobs.forEach((job, index) => {
      const expiryDate = new Date(job.expiresAt);
      const daysUntilExpiry = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
      console.log(`\n${index + 1}. ${job.title}`);
      console.log(`   - Expires: ${expiryDate.toLocaleDateString('sq-AL', { day: 'numeric', month: 'long', year: 'numeric' })}`);
      console.log(`   - Days until expiry: ${daysUntilExpiry}`);
      console.log(`   - Active: ${job.isActive}`);
    });

    console.log('\n✅ Job expiry extension completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Extension error:', error);
    process.exit(1);
  }
}

extendJobExpiry();
