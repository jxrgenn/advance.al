import mongoose from 'mongoose';
import dotenv from 'dotenv'; // Ensure .env is loaded

dotenv.config();

function generateWebsite(companyName) {
    const cleanName = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `https://www.${cleanName}.al`;
}

function generateDescription(companyName, industry) {
    return `${companyName} është një kompani lidere në industrinë e ${industry || 'shërbimeve'} në Shqipëri. Ne jemi të përkushtuar për inovacion, cilësi dhe zhvillim të qëndrueshëm, duke ofruar mundësi të shkëlqyera karriere për profesionistët e talentuar.`;
}

async function seedEmployerDetails() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/albania-jobflow');
        console.log('✅ Connected to database');

        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

        // Find employers with missing data
        const employers = await User.find({ userType: 'employer' });

        let updatedWebsites = 0;
        let updatedDescriptions = 0;

        for (const emp of employers) {
            let modified = false;
            const profile = emp.profile || {};
            const employerProfile = profile.employerProfile || {};

            // Fix missing structures
            if (!emp.profile) emp.profile = { employerProfile: {} };
            if (!emp.profile.employerProfile) emp.profile.employerProfile = {};

            // Seed Website
            if (!employerProfile.website) {
                emp.profile.employerProfile.website = generateWebsite(employerProfile.companyName || 'company');
                modified = true;
                updatedWebsites++;
                console.log(`🌐 Added website for ${employerProfile.companyName}`);
            }

            // Seed Description
            if (!employerProfile.description) {
                emp.profile.employerProfile.description = generateDescription(employerProfile.companyName || 'Kompania', employerProfile.industry);
                modified = true;
                updatedDescriptions++;
                console.log(`📝 Added description for ${employerProfile.companyName}`);
            }

            if (modified) {
                emp.markModified('profile');
                await emp.save();
            }
        }

        console.log('\n✅ Seeding Completed:');
        console.log(`- Updated Websites: ${updatedWebsites}`);
        console.log(`- Updated Descriptions: ${updatedDescriptions}`);

        await mongoose.connection.close();
        console.log('✅ Database connection closed');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

seedEmployerDetails();
