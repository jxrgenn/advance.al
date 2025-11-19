import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';

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

const realCompanies = [
  {
    name: "Vodafone Albania",
    industry: "Teknologji",
    location: { city: "Tiranë", region: "Tiranë" },
    description: "Kompania kryesore e telekomunikacionit në Shqipëri, e cila ofron shërbime të avancuara mobile, internet dhe dixhitale.",
    website: "https://vodafone.al",
    employeeCount: "200+",
    logo: null,
    foundedYear: 2001
  },
  {
    name: "DigitalB",
    industry: "Media",
    location: { city: "Tiranë", region: "Tiranë" },
    description: "Kompania më e madhe e mediave dixhitale në Shqipëri, që ofron shërbime televizive, internet dhe entretenimenti.",
    website: "https://digitalb.al",
    employeeCount: "200+",
    logo: null,
    foundedYear: 2004
  },
  {
    name: "Raiffeisen Bank Albania",
    industry: "Financë",
    location: { city: "Tiranë", region: "Tiranë" },
    description: "Një nga bankat kryesore në Shqipëri, që ofron shërbime bankare të plota për individë dhe biznese.",
    website: "https://raiffeisen.al",
    employeeCount: "200+",
    logo: null,
    foundedYear: 2004
  },
  {
    name: "Credins Bank",
    industry: "Financë",
    location: { city: "Tiranë", region: "Tiranë" },
    description: "Bankë moderne shqiptare që ofron shërbime financiare innovative për klientë individualë dhe korporatë.",
    website: "https://credins.al",
    employeeCount: "200+",
    logo: null,
    foundedYear: 2003
  },
  {
    name: "Albtelekom",
    industry: "Teknologji",
    location: { city: "Tiranë", region: "Tiranë" },
    description: "Operatori kombëtar i telekomunikacionit që ofron shërbime të internetit, telefonisë dhe televizionit.",
    website: "https://albtelekom.al",
    employeeCount: "200+",
    logo: null,
    foundedYear: 1912
  },
  {
    name: "Tirana Bank",
    industry: "Financë",
    location: { city: "Tiranë", region: "Tiranë" },
    description: "Bankë e specializuar në financim të bizneseve të vogla dhe të mesme në Shqipëri.",
    website: "https://tiranabank.al",
    employeeCount: "51-200",
    logo: null,
    foundedYear: 1996
  },
  {
    name: "Neptun",
    industry: "Ndërtim",
    location: { city: "Durrës", region: "Durrës" },
    description: "Kompani konstruksioni dhe zhvillimi të pasurive të paluajtshme, aktive në projekte të mëdha infrastrukturore.",
    website: "https://neptun.al",
    employeeCount: "200+",
    logo: null,
    foundedYear: 1993
  },
  {
    name: "Coca-Cola Albania",
    industry: "Prodhim",
    location: { city: "Tiranë", region: "Tiranë" },
    description: "Përfaqësuesi zyrtar i Coca-Cola në Shqipëri, që merret me prodhimin dhe shpërndarjen e pijeve.",
    website: "https://coca-cola.al",
    employeeCount: "51-200",
    logo: null,
    foundedYear: 1994
  },
  {
    name: "Albanian Eagle",
    industry: "Turizëm",
    location: { city: "Tiranë", region: "Tiranë" },
    description: "Agjenci udhëtimesh dhe turizmi që ofron shërbime të plota për turizmin vendor dhe ndërkombëtar.",
    website: "https://albanianeagle.al",
    employeeCount: "11-50",
    logo: null,
    foundedYear: 2005
  },
  {
    name: "Kastrati Construction",
    industry: "Ndërtim",
    location: { city: "Tiranë", region: "Tiranë" },
    description: "Kompani ndërtimi që specializohet në projekte rezidenciale dhe komerciale të cilësisë së lartë.",
    website: null,
    employeeCount: "51-200",
    logo: null,
    foundedYear: 1998
  },
  {
    name: "Big Market",
    industry: "Shitje",
    location: { city: "Tiranë", region: "Tiranë" },
    description: "Rrjeti më i madh i supermarketeve në Shqipëri me disa dhjetëra pika shitjeje në të gjithë vendin.",
    website: "https://bigmarket.al",
    employeeCount: "200+",
    logo: null,
    foundedYear: 2006
  },
  {
    name: "Balfin Group",
    industry: "Investime",
    location: { city: "Tiranë", region: "Tiranë" },
    description: "Grup i diversifikuar investimesh që operon në sektorë të ndryshëm duke përfshirë tregtinë, turizmin dhe pasuritë e paluajtshme.",
    website: "https://balfin.al",
    employeeCount: "200+",
    logo: null,
    foundedYear: 2001
  }
];

const addRealCompanies = async () => {
  try {
    console.log('🚀 Starting to add real companies...');

    for (const companyData of realCompanies) {
      // Check if company already exists
      const existingUser = await User.findOne({
        'profile.employerProfile.companyName': companyData.name
      });

      if (existingUser) {
        console.log(`⚠️  Company ${companyData.name} already exists, skipping...`);
        continue;
      }

      // Create a company user account
      const hashedPassword = await bcrypt.hash('company123', 10);

      const companyUser = new User({
        email: `${companyData.name.toLowerCase().replace(/\s+/g, '')}@company.al`,
        password: hashedPassword,
        userType: 'employer',
        profile: {
          firstName: companyData.name.split(' ')[0] || companyData.name,
          lastName: companyData.name.split(' ').slice(1).join(' ') || 'Company',
          location: companyData.location,
          employerProfile: {
            companyName: companyData.name,
            industry: companyData.industry,
            companySize: companyData.employeeCount,
            companyDescription: companyData.description,
            website: companyData.website,
            foundedYear: companyData.foundedYear,
            logo: companyData.logo
          }
        },
        emailVerified: true
      });

      await companyUser.save();
      console.log(`✅ Added company: ${companyData.name}`);
    }

    console.log('🎉 Successfully added all real companies!');

  } catch (error) {
    console.error('❌ Error adding companies:', error);
  }
};

const main = async () => {
  await connectDB();
  await addRealCompanies();
  await mongoose.disconnect();
  console.log('📍 Disconnected from MongoDB');
  process.exit(0);
};

main();