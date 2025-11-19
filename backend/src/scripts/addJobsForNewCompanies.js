import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Job from '../models/Job.js';

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

const companyJobs = {
  "Vodafone Albania": [
    {
      title: "Network Engineer",
      description: "Kërkojmë një Network Engineer të përvojshëm për të menaxhuar infrastrukturën e rrjetit të Vodafone Albania.",
      requirements: ["Bachelor në Inxhinieri Telekomunikacioni", "3+ vite përvojë në rrjete telekom", "Certifikime Cisco/Huawei"],
      benefits: ["Paga kompetitive", "Trajnime të vazhdueshme", "Sigurim shëndetësor"],
      category: "Teknologji",
      jobType: "full-time",
      seniority: "mid",
      salary: { min: 1500, max: 2200, currency: "EUR", showPublic: true }
    },
    {
      title: "Customer Service Representative",
      description: "Pozicion për përfaqësues shërbimi ndaj klientëve në qendrën e thirrjeve të Vodafone.",
      requirements: ["Diploma e mesme", "Aftësi komunikimi", "Njohuri bazike kompjuteri"],
      benefits: ["Trajnim i plotë", "Mundësi karriere", "Bonus performance"],
      category: "Tjetër",
      jobType: "full-time",
      seniority: "junior",
      salary: { min: 600, max: 800, currency: "EUR", showPublic: true }
    }
  ],
  "DigitalB": [
    {
      title: "Content Producer",
      description: "Prodhuesi përmbajtjesh për kanalet televizive dhe platformat dixhitale të DigitalB.",
      requirements: ["Bachelor në Media/Komunikim", "Përvojë në prodhim televiziv", "Kreativitet"],
      benefits: ["Ambiente kreative", "Teknologji moderne", "Projekte interesante"],
      category: "Marketing",
      jobType: "full-time",
      seniority: "mid",
      salary: { min: 1000, max: 1400, currency: "EUR", showPublic: true }
    }
  ],
  "Raiffeisen Bank Albania": [
    {
      title: "Credit Analyst",
      description: "Analist kredish për vlerësimin e aplikimeve të kreditit dhe menaxhimin e riskut.",
      requirements: ["Master në Financë/Ekonomi", "Përvojë në analizë kredish", "Njohuri Excel"],
      benefits: ["Paga e lartë", "Trajnime ndërkombëtare", "Sigurim plotë"],
      category: "Financë",
      jobType: "full-time",
      seniority: "mid",
      salary: { min: 1200, max: 1800, currency: "EUR", showPublic: true }
    }
  ],
  "Big Market": [
    {
      title: "Store Manager",
      description: "Menaxher dyqani për njërën nga pikat tona të shitjes në Tiranë.",
      requirements: ["Përvojë në menaxhim dyqani", "Aftësi udhëheqjeje", "Disponueshmëri për orar fleksibël"],
      benefits: ["Paga + bonus", "Trajnime manaxhimi", "Mundësi karriere"],
      category: "Shitje",
      jobType: "full-time",
      seniority: "mid",
      salary: { min: 800, max: 1200, currency: "EUR", showPublic: true }
    }
  ],
  "Balfin Group": [
    {
      title: "Investment Analyst",
      description: "Analist investimesh për identifikimin dhe vlerësimin e mundësive të reja të investimit.",
      requirements: ["Master në Financë", "Përvojë në analiza financiare", "Njohuri të tregut shqiptar"],
      benefits: ["Paga e lartë", "Bonus vjetorë", "Ambiente sfiduese"],
      category: "Financë",
      jobType: "full-time",
      seniority: "senior",
      salary: { min: 1800, max: 2500, currency: "EUR", showPublic: true }
    }
  ]
};

const addJobsForCompanies = async () => {
  try {
    console.log('🚀 Adding jobs for new companies...');

    for (const [companyName, jobs] of Object.entries(companyJobs)) {
      // Find the company
      const company = await User.findOne({
        userType: 'employer',
        'profile.employerProfile.companyName': companyName
      });

      if (!company) {
        console.log(`⚠️  Company ${companyName} not found, skipping...`);
        continue;
      }

      console.log(`📝 Adding ${jobs.length} jobs for ${companyName}...`);

      for (const jobData of jobs) {
        const job = new Job({
          employerId: company._id,
          title: jobData.title,
          description: jobData.description,
          requirements: jobData.requirements,
          benefits: jobData.benefits,
          location: company.profile.location,
          jobType: jobData.jobType,
          category: jobData.category,
          seniority: jobData.seniority,
          salary: jobData.salary,
          status: 'active',
          applicationMethod: 'internal',
          postedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          slug: `${jobData.title.toLowerCase().replace(/\s+/g, '-')}-${companyName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
          tier: 'basic',
          paymentStatus: 'paid',
          paymentRequired: 0,
          viewCount: Math.floor(Math.random() * 100) + 10,
          applicationCount: Math.floor(Math.random() * 20),
          tags: [jobData.category.toLowerCase(), jobData.seniority, jobData.jobType],
          platformCategories: {
            administrata: false,
            diaspora: false,
            ngaShtepια: false,
            partTime: jobData.jobType === 'part-time',
            sezonale: false
          }
        });

        await job.save();
        console.log(`  ✅ Added: ${jobData.title}`);
      }
    }

    console.log('🎉 Successfully added all jobs!');

  } catch (error) {
    console.error('❌ Error adding jobs:', error);
  }
};

const main = async () => {
  await connectDB();
  await addJobsForCompanies();
  await mongoose.disconnect();
  console.log('📍 Disconnected from MongoDB');
  process.exit(0);
};

main();