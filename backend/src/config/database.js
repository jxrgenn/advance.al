import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from './logger.js';

dotenv.config();

export const connectDB = async (retries = 5, delay = 3000) => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/albania-jobflow';

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      logger.info(`MongoDB Connected: ${conn.connection.host}`);

      // Handle connection events
      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.error('MongoDB disconnected');
      });

      return; // Success
    } catch (error) {
      console.error(`MongoDB connection attempt ${attempt}/${retries} failed:`, error.message);
      if (attempt === retries) {
        console.error('All MongoDB connection attempts failed. Exiting.');
        process.exit(1);
      }
      logger.warn(`Retrying in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2; // Exponential backoff
    }
  }
};
