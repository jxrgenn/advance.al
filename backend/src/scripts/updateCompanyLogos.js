import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

// Load environment variables
dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📍 Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Company logos mapping - using the format you specified
const companyLogos = {
  "Vodafone Albania": "/images/companies/logos/vodafone_albania_logo.png",
  "DigitalB": "/images/companies/logos/digitalb_logo.png",
  "Raiffeisen Bank Albania": "/images/companies/logos/raiffeisen_bank_albania_logo.png",
  "Credins Bank": "/images/companies/logos/credins_bank_logo.png",
  "Albtelekom": "/images/companies/logos/albtelekom_logo.png",
  "Tirana Bank": "/images/companies/logos/tirana_bank_logo.png",
  "Neptun": "/images/companies/logos/neptun_logo.png",
  "Coca-Cola Albania": "/images/companies/logos/coca_cola_albania_logo.png",
  "Albanian Eagle": "/images/companies/logos/albanian_eagle_logo.png",
  "Kastrati Construction": "/images/companies/logos/kastrati_construction_logo.png",
  "Big Market": "/images/companies/logos/big_market_logo.png",
  "Balfin Group": "/images/companies/logos/balfin_group_logo.png",
  // Existing companies that had jobs
  "Digital Future Albania": "/images/companies/logos/digital_future_albania_logo.png",
  "Tech Innovations AL": "/images/companies/logos/tech_innovations_al_logo.png"
};

const updateCompanyLogos = async () => {
  try {
    console.log('🚀 Updating company logos...');

    for (const [companyName, logoPath] of Object.entries(companyLogos)) {
      const result = await User.updateOne(
        {
          userType: 'employer',
          'profile.employerProfile.companyName': companyName
        },
        {
          $set: {
            'profile.employerProfile.logo': logoPath
          }
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`✅ Updated logo for: ${companyName}`);
      } else {
        console.log(`⚠️  Company not found: ${companyName}`);
      }
    }

    console.log('🎉 Successfully updated company logos!');

    // List all companies with their logos
    const companies = await User.find(
      { userType: 'employer' },
      {
        'profile.employerProfile.companyName': 1,
        'profile.employerProfile.logo': 1
      }
    );

    console.log('\n📋 All companies with logos:');
    companies.forEach(company => {
      const name = company.profile.employerProfile.companyName;
      const logo = company.profile.employerProfile.logo || 'No logo';
      console.log(`- ${name}: ${logo}`);
    });

  } catch (error) {
    console.error('❌ Error updating company logos:', error);
  }
};

const main = async () => {
  await connectDB();
  await updateCompanyLogos();
  await mongoose.disconnect();
  console.log('📍 Disconnected from MongoDB');
  process.exit(0);
};

main();