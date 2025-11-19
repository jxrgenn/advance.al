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

// Available logo files to cycle through
const availableLogos = [
  "/images/companies/logos/vodafone_albania_logo.png",
  "/images/companies/logos/digitalb_logo.png",
  "/images/companies/logos/raiffeisen_bank_albania_logo.png",
  "/images/companies/logos/credins_bank_logo.png",
  "/images/companies/logos/albtelekom_logo.png",
  "/images/companies/logos/tirana_bank_logo.png",
  "/images/companies/logos/neptun_logo.png",
  "/images/companies/logos/coca_cola_albania_logo.png",
  "/images/companies/logos/albanian_eagle_logo.png",
  "/images/companies/logos/kastrati_construction_logo.png",
  "/images/companies/logos/big_market_logo.png",
  "/images/companies/logos/balfin_group_logo.png",
  "/images/companies/logos/digital_future_albania_logo.png",
  "/images/companies/logos/tech_innovations_al_logo.png"
];

const assignLogosToAllCompanies = async () => {
  try {
    console.log('🚀 Assigning logos to all companies...');
    console.log(`📋 Available logos: ${availableLogos.length}`);

    // Get all employer companies
    const companies = await User.find({
      userType: 'employer'
    }).select('_id profile.employerProfile.companyName profile.employerProfile.logo');

    console.log(`👔 Found ${companies.length} companies`);

    let updatedCount = 0;
    let alreadyHadLogos = 0;
    let errors = 0;

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      const companyName = company.profile.employerProfile.companyName;

      // Select logo in rotation (cycle through available logos)
      const logoIndex = i % availableLogos.length;
      const selectedLogo = availableLogos[logoIndex];

      try {
        // Check if company already has a logo
        const currentLogo = company.profile.employerProfile.logo;
        if (currentLogo) {
          console.log(`⚠️  ${companyName} already has logo: ${currentLogo}`);
          alreadyHadLogos++;
          continue;
        }

        // Update company with new logo
        const result = await User.updateOne(
          { _id: company._id },
          {
            $set: {
              'profile.employerProfile.logo': selectedLogo
            }
          }
        );

        if (result.modifiedCount > 0) {
          console.log(`✅ ${companyName} -> ${selectedLogo}`);
          updatedCount++;
        } else {
          console.log(`❌ Failed to update ${companyName}`);
          errors++;
        }
      } catch (error) {
        console.log(`❌ Error updating ${companyName}:`, error.message);
        errors++;
      }
    }

    console.log('\n🎉 Logo assignment completed!');
    console.log(`✅ Updated: ${updatedCount} companies`);
    console.log(`⚠️  Already had logos: ${alreadyHadLogos} companies`);
    console.log(`❌ Errors: ${errors} companies`);
    console.log(`📊 Total processed: ${companies.length} companies`);

    // Show final status
    console.log('\n📋 Final company status:');
    const finalCompanies = await User.find(
      { userType: 'employer' },
      {
        'profile.employerProfile.companyName': 1,
        'profile.employerProfile.logo': 1
      }
    );

    finalCompanies.forEach((company, index) => {
      const name = company.profile.employerProfile.companyName;
      const logo = company.profile.employerProfile.logo || 'No logo';
      const logoFile = logo.split('/').pop();
      console.log(`${index + 1}. ${name}: ${logoFile}`);
    });

  } catch (error) {
    console.error('❌ Error assigning logos:', error);
  }
};

const main = async () => {
  await connectDB();
  await assignLogosToAllCompanies();
  await mongoose.disconnect();
  console.log('📍 Disconnected from MongoDB');
  process.exit(0);
};

main();