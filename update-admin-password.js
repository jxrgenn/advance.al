import { connectDB } from './src/config/database.js';
import bcrypt from 'bcryptjs';
import { User } from './src/models/index.js';

async function updateAdminPassword() {
  try {
    await connectDB();
    console.log('🔗 Connected to database');

    // Hash the new password
    const newPassword = await bcrypt.hash('password123', 12);

    // Update admin user password
    const result = await User.updateOne(
      { email: 'admin@punashqip.al', userType: 'admin' },
      { password: newPassword }
    );

    console.log('✅ Admin password updated:', result);
    console.log('🔑 New login credentials: admin@punashqip.al / password123');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating admin password:', error);
    process.exit(1);
  }
}

updateAdminPassword();