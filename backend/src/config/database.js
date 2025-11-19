import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/albania-jobflow';

    console.log('🔌 Attempting to connect to MongoDB...');
    console.log('📍 Using URI:', mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')); // Hide credentials in logs

    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000,
    });

    console.log(`🍃 MongoDB Connected: ${conn.connection.host}`);
    console.log(`📂 Database: ${conn.connection.name}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('🔴 MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🔴 MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🟢 MongoDB reconnected');
    });

    // Graceful close on termination
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('🍃 MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error('🔴 Error connecting to MongoDB:', error.message);
    console.error('🔴 Full error:', error);
    console.log('⚠️  Please check your MongoDB connection string and ensure:');
    console.log('   1. MongoDB Atlas cluster is running');
    console.log('   2. Your IP address is whitelisted in MongoDB Atlas');
    console.log('   3. Username and password are correct');
    console.log('   4. Database name is specified in the URI');
    process.exit(1);
  }
};