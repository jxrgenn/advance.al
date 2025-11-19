import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const connectDB = async () => {
  try {
    // Validate required environment variables
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Remove deprecated options as they're now default
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Create indexes for better performance
    await createIndexes();
    
    return conn;
  } catch (error) {
    console.error('Database connection error:', error.message);
    // Exit process with failure
    process.exit(1);
  }
};

const createIndexes = async () => {
  try {
    const db = mongoose.connection.db;
    
    // Users collection indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ userType: 1 });
    await db.collection('users').createIndex({ "profile.location.city": 1 });
    await db.collection('users').createIndex({ isDeleted: 1 });
    
    // Jobs collection indexes
    await db.collection('jobs').createIndex({ title: "text", tags: "text" });
    await db.collection('jobs').createIndex({ "location.city": 1, status: 1 });
    await db.collection('jobs').createIndex({ category: 1, postedAt: -1 });
    await db.collection('jobs').createIndex({ employerId: 1, status: 1 });
    await db.collection('jobs').createIndex({ postedAt: -1 });
    await db.collection('jobs').createIndex({ tier: 1, status: 1 });
    await db.collection('jobs').createIndex({ isDeleted: 1 });
    
    // Applications collection indexes
    await db.collection('applications').createIndex({ jobId: 1, appliedAt: -1 });
    await db.collection('applications').createIndex({ jobSeekerId: 1, appliedAt: -1 });
    await db.collection('applications').createIndex({ employerId: 1, status: 1 });
    await db.collection('applications').createIndex({ appliedAt: -1 });
    
    // Locations collection indexes
    await db.collection('locations').createIndex({ city: 1 }, { unique: true });
    await db.collection('locations').createIndex({ isActive: 1 });
    
    // Files collection indexes
    await db.collection('files').createIndex({ ownerId: 1, fileType: 1 });
    await db.collection('files').createIndex({ uploadedAt: -1 });
    
    // Payments collection indexes
    await db.collection('payments').createIndex({ employerId: 1, createdAt: -1 });
    await db.collection('payments').createIndex({ status: 1 });
    
    // Analytics collection indexes
    await db.collection('analytics').createIndex({ date: 1, type: 1 });
    
    console.log('Database indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error.message);
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('MongoDB Disconnected');
  } catch (error) {
    console.error('Error disconnecting from database:', error.message);
  }
};

export {
  connectDB,
  disconnectDB
};