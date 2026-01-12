import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkEmployerPhones() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/albania-jobflow');
        console.log('✅ Connected to database');

        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

        // Get all employers
        const totalEmployers = await User.countDocuments({ userType: 'employer' });
        const employersWithPhone = await User.countDocuments({
            userType: 'employer',
            'profile.phone': { $exists: true, $ne: null, $ne: '' }
        });
        const employersWithoutPhone = totalEmployers - employersWithPhone;

        console.log('\n📊 Employer Phone Number Statistics:');
        console.log('=====================================');
        console.log(`Total employers: ${totalEmployers}`);
        console.log(`With phone numbers: ${employersWithPhone}`);
        console.log(`Without phone numbers: ${employersWithoutPhone}`);
        console.log(`Percentage with phones: ${((employersWithPhone / totalEmployers) * 100).toFixed(1)}%`);

        // Get sample of employers
        const sampleEmployers = await User.find({ userType: 'employer' })
            .select('email profile.phone profile.employerProfile.companyName')
            .limit(10);

        console.log('\n📋 Sample of 10 employers:');
        console.log('=====================================');
        sampleEmployers.forEach((emp, i) => {
            console.log(`${i + 1}. ${emp.profile?.employerProfile?.companyName || 'No company name'}`);
            console.log(`   Email: ${emp.email}`);
            console.log(`   Phone: ${emp.profile?.phone || '❌ NO PHONE'}`);
            console.log('');
        });

        await mongoose.connection.close();
        console.log('✅ Database connection closed');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkEmployerPhones();
