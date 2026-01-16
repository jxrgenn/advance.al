import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
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

async function createAdmin() {
  try {
    await connectDB();

    const adminEmail = 'admin@advance.al';
    const adminPassword = 'admin123'; // Change this to a secure password

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      console.log('⚠️  Admin user already exists');
      console.log(`📧 Email: ${adminEmail}`);

      // Update password anyway
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      existingAdmin.password = hashedPassword;
      existingAdmin.userType = 'admin';
      await existingAdmin.save();

      console.log('✅ Admin password updated');
      console.log(`🔑 Login credentials:\n   Email: ${adminEmail}\n   Password: ${adminPassword}`);
    } else {
      // Create new admin user
      const hashedPassword = await bcrypt.hash(adminPassword, 12);

      const admin = new User({
        email: adminEmail,
        password: hashedPassword,
        userType: 'admin',
        status: 'active',
        isEmailVerified: true,
        profile: {
          firstName: 'Admin',
          lastName: 'User',
          location: {
            city: 'Tiranë',
            region: 'Tiranë'
          }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await admin.save();
      console.log('✅ Admin user created successfully!');
      console.log(`🔑 Login credentials:\n   Email: ${adminEmail}\n   Password: ${adminPassword}`);
    }

    console.log('\n🎯 You can now access the admin panel at: http://localhost:5173/admin');
    console.log('⚠️  IMPORTANT: Change the admin password after first login!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  }
}

createAdmin();
