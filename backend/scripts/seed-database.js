import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { connectDB } from '../src/config/database.js';

// Load environment variables
dotenv.config();

// Albanian cities and regions data
const albanianLocations = [
  { city: 'Tiranë', region: 'Tiranë', country: 'Albania', isActive: true, displayOrder: 1 },
  { city: 'Durrës', region: 'Durrës', country: 'Albania', isActive: true, displayOrder: 2 },
  { city: 'Vlorë', region: 'Vlorë', country: 'Albania', isActive: true, displayOrder: 3 },
  { city: 'Shkodër', region: 'Shkodër', country: 'Albania', isActive: true, displayOrder: 4 },
  { city: 'Fier', region: 'Fier', country: 'Albania', isActive: true, displayOrder: 5 },
  { city: 'Korçë', region: 'Korçë', country: 'Albania', isActive: true, displayOrder: 6 },
  { city: 'Elbasan', region: 'Elbasan', country: 'Albania', isActive: true, displayOrder: 7 },
  { city: 'Gjirokastër', region: 'Gjirokastër', country: 'Albania', isActive: true, displayOrder: 8 },
  { city: 'Berat', region: 'Berat', country: 'Albania', isActive: true, displayOrder: 9 },
  { city: 'Lushnjë', region: 'Fier', country: 'Albania', isActive: true, displayOrder: 10 },
  { city: 'Kavajë', region: 'Tiranë', country: 'Albania', isActive: true, displayOrder: 11 },
  { city: 'Pogradec', region: 'Korçë', country: 'Albania', isActive: true, displayOrder: 12 },
  { city: 'Online/Remote', region: 'Remote', country: 'Albania', isActive: true, displayOrder: 0 }
];

// Job categories
const jobCategories = [
  'Teknologji',
  'Marketing',
  'Shitje', 
  'Financë',
  'Burime Njerëzore',
  'Inxhinieri',
  'Dizajn',
  'Menaxhim',
  'Shëndetësi',
  'Arsim',
  'Turizëm',
  'Ndërtim',
  'Transport',
  'Tjetër'
];

const seedDatabase = async () => {
  try {
    console.log('🌱 Starting database seeding...');
    
    // Connect to database
    await connectDB();
    const db = mongoose.connection.db;

    // Clear existing data (for fresh start)
    console.log('🗑️ Clearing existing data...');
    await db.collection('users').deleteMany({});
    await db.collection('jobs').deleteMany({});
    await db.collection('applications').deleteMany({});
    await db.collection('locations').deleteMany({});
    await db.collection('files').deleteMany({});
    await db.collection('payments').deleteMany({});
    await db.collection('analytics').deleteMany({});

    // 1. Seed Locations
    console.log('📍 Seeding Albanian locations...');
    await db.collection('locations').insertMany(
      albanianLocations.map(location => ({
        ...location,
        jobCount: 0,
        userCount: 0,
        coordinates: { lat: 0, lng: 0 } // Will be updated with real coordinates later
      }))
    );

    // 2. Seed Admin User (for manual employer verification)
    console.log('👤 Creating admin user...');
    const adminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'password123', 12);

    // Delete existing admin first
    await db.collection('users').deleteMany({ userType: 'admin' });

    await db.collection('users').insertOne({
      email: process.env.ADMIN_EMAIL || 'admin@punashqip.al',
      password: adminPassword,
      userType: 'admin',
      status: 'active',
      isDeleted: false,
      profile: {
        firstName: 'Admin',
        lastName: 'PunaShqip',
        phone: '+355694000000',
        location: {
          city: 'Tiranë',
          region: 'Tiranë'
        }
      },
      createdAt: new Date(),
      lastLoginAt: new Date(),
      emailVerified: true,
      privacySettings: {
        profileVisible: false,
        showInSearch: false
      }
    });

    // 3. Seed Sample Job Seekers
    console.log('👨‍💼 Creating sample job seekers...');
    const jobSeekers = [];
    const sampleJobSeekers = [
      {
        firstName: 'Andi',
        lastName: 'Krasniqi',
        email: 'andi.krasniqi@email.com',
        city: 'Tiranë',
        title: 'Frontend Developer',
        skills: ['React', 'TypeScript', 'JavaScript', 'HTML', 'CSS']
      },
      {
        firstName: 'Elira',
        lastName: 'Berisha',
        email: 'elira.berisha@email.com', 
        city: 'Durrës',
        title: 'Marketing Manager',
        skills: ['Digital Marketing', 'Social Media', 'Google Analytics', 'SEO']
      },
      {
        firstName: 'Arben',
        lastName: 'Hoxha',
        email: 'arben.hoxha@email.com',
        city: 'Vlorë',
        title: 'UX/UI Designer',
        skills: ['Figma', 'Adobe Creative Suite', 'Prototyping', 'User Research']
      },
      {
        firstName: 'Manjola',
        lastName: 'Gjoka',
        email: 'manjola.gjoka@email.com',
        city: 'Shkodër', 
        title: 'Backend Developer',
        skills: ['Node.js', 'Python', 'MongoDB', 'PostgreSQL']
      }
    ];

    for (const seeker of sampleJobSeekers) {
      const hashedPassword = await bcrypt.hash('password123', 12);
      const jobSeeker = {
        _id: new mongoose.Types.ObjectId(),
        email: seeker.email,
        password: hashedPassword,
        userType: 'jobseeker',
        status: 'active',
        isDeleted: false,
        profile: {
          firstName: seeker.firstName,
          lastName: seeker.lastName,
          phone: `+35569${Math.floor(Math.random() * 9000000) + 1000000}`,
          location: {
            city: seeker.city,
            region: seeker.city
          },
          jobSeekerProfile: {
            title: seeker.title,
            bio: `Përvojë profesionale në fushën e ${seeker.title.toLowerCase()}. Në kërkim të sfidave të reja dhe mundësive për rritje profesionale.`,
            experience: '2-5 vjet',
            skills: seeker.skills,
            education: [{
              degree: 'Baçelor',
              school: 'Universiteti i Tiranës',
              year: 2020
            }],
            workHistory: [{
              company: 'Kompania ABC',
              position: seeker.title,
              startDate: new Date('2021-01-01'),
              endDate: new Date('2023-12-31'),
              description: 'Përvojë në zhvillimin e projekteve të ndryshme.'
            }],
            desiredSalary: {
              min: 600,
              max: 1200,
              currency: 'EUR'
            },
            openToRemote: true,
            availability: 'immediately'
          }
        },
        createdAt: new Date(),
        lastLoginAt: new Date(),
        emailVerified: true,
        privacySettings: {
          profileVisible: true,
          showInSearch: true
        }
      };
      
      jobSeekers.push(jobSeeker);
    }

    await db.collection('users').insertMany(jobSeekers);

    // 4. Seed Sample Employers  
    console.log('🏢 Creating sample employers...');
    const employers = [];
    const sampleEmployers = [
      {
        firstName: 'Klajdi',
        lastName: 'Prifti', 
        email: 'klajdi@techinnovations.al',
        companyName: 'Tech Innovations AL',
        city: 'Tiranë',
        industry: 'Teknologji'
      },
      {
        firstName: 'Iris',
        lastName: 'Petrela',
        email: 'iris@startuphub.al', 
        companyName: 'Albanian Startup Hub',
        city: 'Durrës',
        industry: 'Marketing'
      },
      {
        firstName: 'Ermal',
        lastName: 'Dani',
        email: 'ermal@creativeagency.al',
        companyName: 'Creative Agency Tirana', 
        city: 'Tiranë',
        industry: 'Dizajn'
      }
    ];

    for (const employer of sampleEmployers) {
      const hashedPassword = await bcrypt.hash('password123', 12);
      const employerUser = {
        _id: new mongoose.Types.ObjectId(),
        email: employer.email,
        password: hashedPassword,
        userType: 'employer',
        status: 'active', // Pre-verified for demo
        isDeleted: false,
        profile: {
          firstName: employer.firstName,
          lastName: employer.lastName,
          phone: `+35569${Math.floor(Math.random() * 9000000) + 1000000}`,
          location: {
            city: employer.city,
            region: employer.city
          },
          employerProfile: {
            companyName: employer.companyName,
            companySize: '11-50',
            industry: employer.industry,
            description: `${employer.companyName} është një kompani inovative që ofron shërbime të cilësisë së lartë në fushën e ${employer.industry.toLowerCase()}.`,
            website: `https://www.${employer.companyName.toLowerCase().replace(/\s+/g, '')}.al`,
            verified: true,
            verificationDate: new Date(),
            verificationStatus: 'approved',
            subscriptionTier: 'basic'
          }
        },
        createdAt: new Date(),
        lastLoginAt: new Date(),
        emailVerified: true,
        privacySettings: {
          profileVisible: true,
          showInSearch: true
        }
      };
      
      employers.push(employerUser);
    }

    await db.collection('users').insertMany(employers);

    // 5. Seed Sample Jobs
    console.log('💼 Creating sample job postings...');
    const jobs = [];
    const sampleJobs = [
      {
        employerEmail: 'klajdi@techinnovations.al',
        title: 'Frontend Developer',
        category: 'Teknologji',
        city: 'Tiranë',
        jobType: 'full-time',
        tier: 'basic',
        salary: { min: 800, max: 1200 },
        tags: ['React', 'TypeScript', 'JavaScript'],
        description: 'Kërkojmë një Frontend Developer me përvojë në React dhe TypeScript për të bashkuar ekipin tonë të talentuar.'
      },
      {
        employerEmail: 'iris@startuphub.al',
        title: 'Marketing Manager',
        category: 'Marketing', 
        city: 'Durrës',
        jobType: 'full-time',
        tier: 'premium',
        salary: { min: 600, max: 900 },
        tags: ['Marketing', 'Social Media', 'Analytics'],
        description: 'Mundësi karriere për një Marketing Manager kreativ që do të udhëheqë strategjitë tona të marketingut dixhital.'
      },
      {
        employerEmail: 'ermal@creativeagency.al',
        title: 'UX/UI Designer',
        category: 'Dizajn',
        city: 'Tiranë', 
        jobType: 'part-time',
        tier: 'basic',
        salary: { min: 400, max: 600 },
        tags: ['Figma', 'Adobe Creative', 'UX Research'],
        description: 'Kërkojmë një UX/UI Designer të talentuar për të krijuar përvoja dixhitale të mahnitshme për klientët tanë.'
      }
    ];

    const employerMap = new Map();
    employers.forEach(emp => employerMap.set(emp.email, emp));

    for (const job of sampleJobs) {
      const employer = employerMap.get(job.employerEmail);
      if (!employer) continue;

      const postedAt = new Date();
      const expiresAt = new Date(postedAt.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days

      const jobDoc = {
        _id: new mongoose.Types.ObjectId(),
        employerId: employer._id,
        title: job.title,
        description: job.description,
        requirements: [
          'Përvojë minimale 2 vjet në pozicionin përkatës',
          'Njohuri të mira të gjuhës angleze',
          'Aftësi komunikimi dhe pune në ekip'
        ],
        benefits: [
          'Pagë konkurruese',
          'Mundësi për rritje profesionale',
          'Ambiente pune moderne',
          'Fleksibilitet në oraret e punës'
        ],
        location: {
          city: job.city,
          region: job.city,
          remote: job.city === 'Online/Remote',
          remoteType: job.city === 'Online/Remote' ? 'full' : 'none'
        },
        jobType: job.jobType,
        category: job.category,
        seniority: 'mid',
        salary: {
          min: job.salary.min,
          max: job.salary.max,
          currency: 'EUR',
          negotiable: true,
          showPublic: true
        },
        // Platform Categories - intelligently set based on job characteristics
        platformCategories: {
          diaspora: job.city === 'Diaspora' || job.title.toLowerCase().includes('diaspora'),
          ngaShtepia: job.city === 'Online/Remote' || job.title.toLowerCase().includes('remote'),
          partTime: job.jobType === 'part-time',
          administrata: job.category === 'Burime Njerëzore' || job.title.toLowerCase().includes('admin') || job.title.toLowerCase().includes('hr'),
          sezonale: job.title.toLowerCase().includes('seasonal') || job.title.toLowerCase().includes('summer')
        },
        status: 'active',
        tier: job.tier,
        postedAt: postedAt,
        expiresAt: expiresAt,
        isDeleted: false,
        applicationMethod: 'internal',
        customQuestions: [],
        viewCount: Math.floor(Math.random() * 100) + 10,
        applicationCount: Math.floor(Math.random() * 20) + 1,
        tags: job.tags,
        slug: job.title.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now()
      };

      jobs.push(jobDoc);
    }

    await db.collection('jobs').insertMany(jobs);

    // 6. Seed Sample Applications
    console.log('📄 Creating sample applications...');
    const applications = [];
    
    // Create some applications between job seekers and jobs
    for (let i = 0; i < jobSeekers.length && i < jobs.length; i++) {
      const jobSeeker = jobSeekers[i];
      const job = jobs[i];
      const employer = employers[i % employers.length];

      const application = {
        _id: new mongoose.Types.ObjectId(),
        jobId: job._id,
        jobSeekerId: jobSeeker._id,
        employerId: employer._id,
        appliedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random date within last 7 days
        status: ['pending', 'viewed', 'shortlisted'][Math.floor(Math.random() * 3)],
        applicationMethod: 'one_click',
        customAnswers: [],
        additionalFiles: [],
        coverLetter: '',
        employerNotes: '',
        messages: []
      };

      applications.push(application);
    }

    await db.collection('applications').insertMany(applications);

    // 7. Create initial analytics entry
    console.log('📊 Creating initial analytics...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await db.collection('analytics').insertOne({
      _id: new mongoose.Types.ObjectId(),
      date: today,
      type: 'daily',
      metrics: {
        totalUsers: jobSeekers.length + employers.length + 1, // +1 for admin
        newJobSeekers: jobSeekers.length,
        newEmployers: employers.length,
        activeJobs: jobs.length,
        newApplications: applications.length,
        totalRevenue: 0,
        searchQueries: 0,
        profileViews: 0,
        jobViews: jobs.reduce((sum, job) => sum + job.viewCount, 0),
        applicationRate: 0,
        hiringsCompleted: 0,
        topCities: albanianLocations.slice(0, 5).map(loc => ({
          city: loc.city,
          jobCount: jobs.filter(job => job.location.city === loc.city).length,
          userCount: [...jobSeekers, ...employers].filter(user => user.profile.location.city === loc.city).length
        })),
        topCategories: jobCategories.slice(0, 5).map(cat => ({
          category: cat,
          jobCount: jobs.filter(job => job.category === cat).length,
          applicationCount: applications.length
        }))
      }
    });

    console.log('✅ Database seeding completed successfully!');
    console.log('');
    console.log('📊 Seeded data summary:');
    console.log(`   • ${albanianLocations.length} Albanian locations`);
    console.log(`   • 1 admin user`);
    console.log(`   • ${jobSeekers.length} job seekers`);
    console.log(`   • ${employers.length} employers`);
    console.log(`   • ${jobs.length} job postings`);
    console.log(`   • ${applications.length} job applications`);
    console.log('');
    console.log('🔑 Test Accounts:');
    console.log(`   Admin: ${process.env.ADMIN_EMAIL || 'admin@punashqip.al'} / ${process.env.ADMIN_PASSWORD || 'password123'}`);
    console.log('   Job Seeker: andi.krasniqi@email.com / password123');
    console.log('   Employer: klajdi@techinnovations.al / password123');

  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

// Run the seeding if this file is executed directly
seedDatabase();
