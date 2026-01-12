import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkEmployerData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/albania-jobflow');
        console.log('✅ Connected to database');

        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

        // Get all employers
        const employers = await User.find({ userType: 'employer' });
        const total = employers.length;

        console.log(`\n📊 Analyzing ${total} Employers Data Completeness:`);
        console.log('================================================');

        const stats = {
            missingEmail: 0,
            missingPhone: 0,
            missingWebsite: 0,
            missingLocation: 0,
            missingDescription: 0,
            missingLogo: 0
        };

        employers.forEach(emp => {
            const p = emp.profile || {};
            const ep = p.employerProfile || {};
            const loc = p.location || {};

            if (!emp.email) stats.missingEmail++;
            if (!p.phone) stats.missingPhone++;
            if (!ep.website) stats.missingWebsite++;
            if (!loc.city) stats.missingLocation++;
            if (!ep.description) stats.missingDescription++;
            if (!ep.logo) stats.missingLogo++;
        });

        console.log('Missing Data counts:');
        console.log(`- Email: ${stats.missingEmail} (${(stats.missingEmail / total * 100).toFixed(1)}%)`);
        console.log(`- Phone: ${stats.missingPhone} (${(stats.missingPhone / total * 100).toFixed(1)}%)`);
        console.log(`- Website: ${stats.missingWebsite} (${(stats.missingWebsite / total * 100).toFixed(1)}%)`);
        console.log(`- Location: ${stats.missingLocation} (${(stats.missingLocation / total * 100).toFixed(1)}%)`);
        console.log(`- Description: ${stats.missingDescription} (${(stats.missingDescription / total * 100).toFixed(1)}%)`);
        console.log(`- Logo: ${stats.missingLogo} (${(stats.missingLogo / total * 100).toFixed(1)}%)`);

        await mongoose.connection.close();
        console.log('\n✅ Database connection closed');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkEmployerData();
