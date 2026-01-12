import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Albanian phone number prefixes (mobile operators)
const albanianPrefixes = [
    '+35569',  // Vodafone
    '+35568',  // Telekom Albania  
    '+35567',  // ALBtelecom
];

function generateAlbanianPhone() {
    const prefix = albanianPrefixes[Math.floor(Math.random() * albanianPrefixes.length)];
    const suffix = Math.floor(1000000 + Math.random() * 9000000); // 7 digits
    return `${prefix}${suffix}`;
}

async function seedEmployerPhones() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/albania-jobflow');
        console.log('✅ Connected to database');

        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

        // Find employers without phone numbers
        const employersWithoutPhone = await User.find({
            userType: 'employer',
            $or: [
                { 'profile.phone': { $exists: false } },
                { 'profile.phone': null },
                { 'profile.phone': '' }
            ]
        });

        console.log(`\n📱 Found ${employersWithoutPhone.length} employers without phone numbers`);
        console.log('Adding phone numbers...\n');

        let updated = 0;
        for (const employer of employersWithoutPhone) {
            const phone = generateAlbanianPhone();

            // Initialize profile if it doesn't exist
            if (!employer.profile) {
                employer.profile = {};
            }

            employer.profile.phone = phone;
            employer.markModified('profile'); // Critical for mixed/untyped subdocuments

            const result = await employer.save();

            if (result) {
                console.log(`✅ [Saved] ${employer.profile?.employerProfile?.companyName || employer.email}: ${phone}`);
                updated++;
            } else {
                console.error(`❌ [Failed Save] ${employer.email}`);
            }
        }

        console.log(`\n✅ Successfully attempted update for ${updated} employers`);

        // Verify the update
        const totalEmployers = await User.countDocuments({ userType: 'employer' });
        const employersWithPhone = await User.countDocuments({
            userType: 'employer',
            'profile.phone': { $exists: true, $ne: null, $ne: '' }
        });

        console.log('\n📊 Updated Statistics:');
        console.log('=====================================');
        console.log(`Total employers: ${totalEmployers}`);
        console.log(`With phone numbers: ${employersWithPhone}`);
        console.log(`Percentage with phones: ${((employersWithPhone / totalEmployers) * 100).toFixed(1)}%`);

        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

seedEmployerPhones();
