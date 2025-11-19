import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { connectDB } from '../src/config/database.js';

// Load environment variables
dotenv.config();

const addNewJobsAndUsers = async () => {
  try {
    console.log('🌱 Adding new jobs and user accounts...');

    // Connect to database
    await connectDB();
    const db = mongoose.connection.db;

    // First, find the klajdi@techinnovations.al user ID
    const klajdiUser = await db.collection('users').findOne({
      email: 'klajdi@techinnovations.al'
    });

    if (!klajdiUser) {
      console.error('❌ klajdi@techinnovations.al user not found! Please run seed-database.js first.');
      process.exit(1);
    }

    console.log('✅ Found klajdi@techinnovations.al user:', klajdiUser._id);

    // Generate unique slugs for jobs
    const generateSlug = (title, index) => {
      return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .trim() + `-${Date.now()}-${index}`;
    };

    // 10 new jobs - 5 sponsored, 5 regular
    const newJobs = [
      // SPONSORED JOBS (5)
      {
        employerId: klajdiUser._id,
        title: "Senior Full Stack Developer",
        description: "Jemi në kërkim të një Senior Full Stack Developer për të bashkuar ekipin tonë të talentuar. Do të punoni me teknologjitë më të fundit për të krijuar aplikacione web inovative që ndryshojnë mënyrën se si njerëzit punojnë. Kjo pozicion ofron mundësi të shkëlqyera për rritje profesionale dhe pjesëmarrje në projekte shumë interesante teknologjike.",
        requirements: [
          "5+ vite përvojë në zhvillimin e aplikacioneve web",
          "Njohuri të thella në React, Node.js, dhe TypeScript",
          "Përvojë me databaza (MongoDB, PostgreSQL)",
          "Njohuri të Git dhe metodave Agile",
          "Aftësi të mira komunikimi dhe punës në ekip"
        ],
        benefits: [
          "Paga kompetitive 1800-2500 EUR",
          "Sigurim shëndetësor privat",
          "30 ditë pushime të paguara",
          "Budget për trajnime dhe konferenca",
          "Laptop dhe pajisje moderne",
          "Atmosferë pune fleksibile dhe pozitive"
        ],
        location: {
          city: "Tiranë",
          region: "Tiranë",
          remote: true,
          remoteType: "hybrid"
        },
        jobType: "full-time",
        category: "Teknologji",
        seniority: "senior",
        salary: {
          min: 1800,
          max: 2500,
          currency: "EUR",
          negotiable: true,
          showPublic: true
        },
        status: "active",
        tier: "premium",
        applicationMethod: "internal",
        tags: ["react", "nodejs", "typescript", "full-stack", "senior"],
        slug: generateSlug("Senior Full Stack Developer", 1),
        postedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 200) + 100,
        applicationCount: Math.floor(Math.random() * 25) + 5
      },
      {
        employerId: klajdiUser._id,
        title: "DevOps Engineer",
        description: "Pozicion i rëndësishëm për një DevOps Engineer që do të jetë përgjegjës për infrastrukturën e aplikacioneve tona cloud-native. Do të punoni me teknologjitë më moderne të DevOps për të automatizuar proceset, përmirësuar performancën dhe siguruar shkallëzueshmërinë e sistemeve tona.",
        requirements: [
          "3+ vite përvojë në DevOps ose System Administration",
          "Njohuri të forta në AWS, Docker, dhe Kubernetes",
          "Përvojë me CI/CD pipelines (Jenkins, GitLab CI)",
          "Njohuri në monitoring dhe logging tools",
          "Skripting në Bash, Python ose PowerShell"
        ],
        benefits: [
          "Paga 1400-2000 EUR",
          "Certifikime të paguara (AWS, Kubernetes)",
          "Equipment modern dhe budget teknologjie",
          "Training të vazhdueshëm",
          "Punë hibride (3 ditë nga shtëpia)",
          "Bonus performance"
        ],
        location: {
          city: "Tiranë",
          region: "Tiranë",
          remote: true,
          remoteType: "hybrid"
        },
        jobType: "full-time",
        category: "Teknologji",
        seniority: "mid",
        salary: {
          min: 1400,
          max: 2000,
          currency: "EUR",
          negotiable: true,
          showPublic: true
        },
        status: "active",
        tier: "premium",
        applicationMethod: "internal",
        tags: ["devops", "aws", "docker", "kubernetes", "ci-cd"],
        slug: generateSlug("DevOps Engineer", 2),
        postedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 180) + 80,
        applicationCount: Math.floor(Math.random() * 20) + 8
      },
      {
        employerId: klajdiUser._id,
        title: "Product Manager",
        description: "Kërkohet një Product Manager i përvoje për të drejtuar zhvillimin e produkteve tona teknologjike. Do të jeni përgjegjës për strategjinë e produktit, koordinimin e ekipeve dhe sigurimin që produktet tona i plotësojnë nevojat e përdoruesve dhe qëllimet e biznesit.",
        requirements: [
          "4+ vite përvojë në Product Management",
          "Përvojë me metodat Agile dhe Scrum",
          "Aftësi analitike dhe strategjike të forta",
          "Përvojë me tools si Jira, Confluence, Figma",
          "Background në teknologji ose business"
        ],
        benefits: [
          "Paga kompetitive 1600-2200 EUR",
          "Equity në kompani",
          "Training në Product Management",
          "Makinë kompanie",
          "Sigurim familjar",
          "Career advancement opportunities"
        ],
        location: {
          city: "Tiranë",
          region: "Tiranë",
          remote: false,
          remoteType: "none"
        },
        jobType: "full-time",
        category: "Menaxhim",
        seniority: "senior",
        salary: {
          min: 1600,
          max: 2200,
          currency: "EUR",
          negotiable: true,
          showPublic: true
        },
        status: "active",
        tier: "premium",
        applicationMethod: "internal",
        tags: ["product-manager", "agile", "strategy", "leadership"],
        slug: generateSlug("Product Manager", 3),
        postedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 27 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 220) + 120,
        applicationCount: Math.floor(Math.random() * 30) + 12
      },
      {
        employerId: klajdiUser._id,
        title: "UI/UX Designer",
        description: "Po kërkojmë një UI/UX Designer kreativ dhe të talentuar për të krijuar përvojat e përdoruesit që do të përdoren nga mijëra njerëz çdo ditë. Do të punoni ngushtë me ekipin e zhvillimit dhe product management për të krijuar interface të bukura, funksionale dhe intuitive.",
        requirements: [
          "3+ vite përvojë në UI/UX Design",
          "Portfolio të forte me projekte reale",
          "Njohuri të avancuara në Figma dhe Adobe Creative Suite",
          "Përvojë me User Research dhe Testing",
          "Kuptim i fortë i Web dhe Mobile Design principles"
        ],
        benefits: [
          "Paga 1200-1800 EUR",
          "Budget për software dhe tools",
          "Training në design dhe teknologji",
          "Fleksibilitet në orar",
          "Ambiente kreative",
          "Projekte interesante dhe sfidues"
        ],
        location: {
          city: "Tiranë",
          region: "Tiranë",
          remote: true,
          remoteType: "full"
        },
        jobType: "full-time",
        category: "Dizajn",
        seniority: "mid",
        salary: {
          min: 1200,
          max: 1800,
          currency: "EUR",
          negotiable: true,
          showPublic: true
        },
        status: "active",
        tier: "premium",
        applicationMethod: "internal",
        tags: ["ui-ux", "figma", "design", "user-experience"],
        slug: generateSlug("UI/UX Designer", 4),
        postedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 160) + 90,
        applicationCount: Math.floor(Math.random() * 18) + 7
      },
      {
        employerId: klajdiUser._id,
        title: "Data Scientist",
        description: "Bashkohuni me ekipin tonë si Data Scientist për të nxjerrë insights të vlefshme nga të dhënat tona. Do të punoni me dataset të mëdha për të ndihmuar në marrjen e vendimeve strategjike dhe përmirësimin e produkteve tona përmes machine learning dhe analytics të avancuara.",
        requirements: [
          "Master në Data Science, Statistikë ose fushë të ngjashme",
          "3+ vite përvojë në Data Science ose Analytics",
          "Njohuri të forta në Python, R, SQL",
          "Përvojë me Machine Learning algorithms",
          "Njohuri në Tableau, Power BI ose tools të ngjashme"
        ],
        benefits: [
          "Paga 1500-2300 EUR",
          "Access në datasets interesante",
          "Training në AI dhe Machine Learning",
          "Conference dhe certification opportunities",
          "Research time (20% të kohës)",
          "Equipment dhe software me vlerë të lartë"
        ],
        location: {
          city: "Tiranë",
          region: "Tiranë",
          remote: true,
          remoteType: "hybrid"
        },
        jobType: "full-time",
        category: "Teknologji",
        seniority: "mid",
        salary: {
          min: 1500,
          max: 2300,
          currency: "EUR",
          negotiable: true,
          showPublic: true
        },
        status: "active",
        tier: "premium",
        applicationMethod: "internal",
        tags: ["data-science", "python", "machine-learning", "analytics"],
        slug: generateSlug("Data Scientist", 5),
        postedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 26 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 140) + 70,
        applicationCount: Math.floor(Math.random() * 15) + 5
      },

      // REGULAR JOBS (5)
      {
        employerId: klajdiUser._id,
        title: "Frontend Developer",
        description: "Kërkohet Frontend Developer për të zhvilluar interface të reja dhe përmirësuar ato ekzistuese. Do të punoni me React, TypeScript dhe tools moderne për të krijuar aplikacione që përdoruesit do t'i duan.",
        requirements: [
          "2+ vite përvojë në Frontend Development",
          "Njohuri të mira në React dhe JavaScript",
          "Përvojë me HTML, CSS dhe responsive design",
          "Kuptim i Git dhe development workflows"
        ],
        benefits: [
          "Paga 800-1400 EUR",
          "Training në teknologji të reja",
          "Punë në ekip të ri",
          "Growth opportunities"
        ],
        location: {
          city: "Tiranë",
          region: "Tiranë",
          remote: false,
          remoteType: "none"
        },
        jobType: "full-time",
        category: "Teknologji",
        seniority: "junior",
        salary: {
          min: 800,
          max: 1400,
          currency: "EUR",
          negotiable: true,
          showPublic: true
        },
        status: "active",
        tier: "basic",
        applicationMethod: "internal",
        tags: ["frontend", "react", "javascript", "junior"],
        slug: generateSlug("Frontend Developer", 6),
        postedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 120) + 50,
        applicationCount: Math.floor(Math.random() * 25) + 10
      },
      {
        employerId: klajdiUser._id,
        title: "Backend Developer",
        description: "Pozicion për Backend Developer që do të punojë me API, databases dhe server-side logic. Mundësi e mirë për të mësuar teknologji të reja dhe rritur në karrierë.",
        requirements: [
          "2+ vite përvojë në Backend Development",
          "Njohuri në Node.js ose Python",
          "Përvojë me databases (MongoDB, PostgreSQL)",
          "Kuptim i REST APIs"
        ],
        benefits: [
          "Paga 900-1500 EUR",
          "Mentorship program",
          "Teknologji moderne",
          "Career path i qartë"
        ],
        location: {
          city: "Tiranë",
          region: "Tiranë",
          remote: true,
          remoteType: "hybrid"
        },
        jobType: "full-time",
        category: "Teknologji",
        seniority: "junior",
        salary: {
          min: 900,
          max: 1500,
          currency: "EUR",
          negotiable: true,
          showPublic: true
        },
        status: "active",
        tier: "basic",
        applicationMethod: "internal",
        tags: ["backend", "nodejs", "python", "api"],
        slug: generateSlug("Backend Developer", 7),
        postedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 24 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 100) + 40,
        applicationCount: Math.floor(Math.random() * 20) + 8
      },
      {
        employerId: klajdiUser._id,
        title: "Quality Assurance Engineer",
        description: "QA Engineer për të siguruar cilësinë e aplikacioneve tona. Do të testoni software, identifikoni bugs dhe punoni me ekipin për të përmirësuar proceset.",
        requirements: [
          "1+ vite përvojë në Software Testing",
          "Njohuri të test methodologies",
          "Përvojë me manual dhe automated testing",
          "Kujdes për detajet"
        ],
        benefits: [
          "Paga 700-1200 EUR",
          "Training në automation tools",
          "Punë me projekte të ndryshme",
          "Team i mbështetës"
        ],
        location: {
          city: "Tiranë",
          region: "Tiranë",
          remote: false,
          remoteType: "none"
        },
        jobType: "full-time",
        category: "Teknologji",
        seniority: "junior",
        salary: {
          min: 700,
          max: 1200,
          currency: "EUR",
          negotiable: true,
          showPublic: true
        },
        status: "active",
        tier: "basic",
        applicationMethod: "internal",
        tags: ["qa", "testing", "quality-assurance", "junior"],
        slug: generateSlug("Quality Assurance Engineer", 8),
        postedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 80) + 30,
        applicationCount: Math.floor(Math.random() * 15) + 5
      },
      {
        employerId: klajdiUser._id,
        title: "Marketing Specialist",
        description: "Marketing Specialist për të ndihmuar në rritjen e brandeve të klientëve tanë. Do të punoni me social media, content creation dhe digital marketing campaigns.",
        requirements: [
          "1+ vite përvojë në Digital Marketing",
          "Njohuri të Google Ads dhe Facebook Ads",
          "Aftësi në content creation",
          "Analitik dhe kreativ"
        ],
        benefits: [
          "Paga 600-1000 EUR",
          "Training në marketing tools",
          "Projekte të shumëllojshme",
          "Creative freedom"
        ],
        location: {
          city: "Tiranë",
          region: "Tiranë",
          remote: true,
          remoteType: "full"
        },
        jobType: "full-time",
        category: "Marketing",
        seniority: "junior",
        salary: {
          min: 600,
          max: 1000,
          currency: "EUR",
          negotiable: true,
          showPublic: true
        },
        status: "active",
        tier: "basic",
        applicationMethod: "internal",
        tags: ["marketing", "social-media", "digital", "creative"],
        slug: generateSlug("Marketing Specialist", 9),
        postedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 22 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 90) + 35,
        applicationCount: Math.floor(Math.random() * 18) + 7
      },
      {
        employerId: klajdiUser._id,
        title: "Junior Software Developer",
        description: "Pozicion entry-level për Junior Software Developer. Mundësi e shkëlqyer për të filluar karrierën në teknologji me mentorship dhe training të plotë.",
        requirements: [
          "Diplomë në Computer Science ose fushë të ngjashme",
          "Njohuri bazike në programming (JavaScript, Python, Java)",
          "Dëshirë për të mësuar dhe rritur",
          "Aftësi të mira komunikimi"
        ],
        benefits: [
          "Paga 500-800 EUR",
          "Mentorship program i plotë",
          "Training të vazhdueshëm",
          "Career development plan",
          "Ambient mësimi"
        ],
        location: {
          city: "Tiranë",
          region: "Tiranë",
          remote: false,
          remoteType: "none"
        },
        jobType: "full-time",
        category: "Teknologji",
        seniority: "junior",
        salary: {
          min: 500,
          max: 800,
          currency: "EUR",
          negotiable: true,
          showPublic: true
        },
        status: "active",
        tier: "basic",
        applicationMethod: "internal",
        tags: ["junior", "entry-level", "software", "training"],
        slug: generateSlug("Junior Software Developer", 10),
        postedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 150) + 80,
        applicationCount: Math.floor(Math.random() * 35) + 15
      }
    ];

    // Insert all jobs
    console.log('💼 Adding 10 new jobs...');
    await db.collection('jobs').insertMany(newJobs);
    console.log('✅ Successfully added 10 new jobs (5 sponsored, 5 regular)');

    // 2 new test user accounts
    console.log('👥 Creating 2 new test user accounts...');

    const newUsers = [
      // Test User 1 - Job Seeker
      {
        email: 'sara.marku@email.com',
        password: await bcrypt.hash('password123', 12),
        userType: 'jobseeker',
        status: 'active',
        isDeleted: false,
        profile: {
          firstName: 'Sara',
          lastName: 'Marku',
          phone: '+355694567890',
          location: {
            city: 'Tiranë',
            region: 'Tiranë'
          },
          jobSeekerProfile: {
            title: 'Data Analyst',
            bio: 'Analiste të dhënash me përvojë në SQL, Python dhe dashboard creation. Specializohem në business intelligence dhe data visualization.',
            experience: '2-5 vjet',
            skills: ['SQL', 'Python', 'Tableau', 'Excel', 'Data Visualization', 'Statistics'],
            education: [{
              degree: 'Master në Business Analytics',
              school: 'Universiteti Politeknik i Tiranës',
              year: 2021
            }],
            workHistory: [{
              company: 'DataTech Solutions',
              position: 'Junior Data Analyst',
              startDate: new Date('2021-06-01'),
              endDate: new Date('2023-10-31'),
              description: 'Krijimi i raporteve dhe dashboard-eve për klientë të ndryshëm, analiza të trendit të shitjeve.'
            }],
            desiredSalary: {
              min: 800,
              max: 1400,
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
      },
      // Test User 2 - Employer
      {
        email: 'admin@digitalfuture.al',
        password: await bcrypt.hash('password123', 12),
        userType: 'employer',
        status: 'active',
        isDeleted: false,
        profile: {
          firstName: 'Alma',
          lastName: 'Shehu',
          phone: '+355694123789',
          location: {
            city: 'Durrës',
            region: 'Durrës'
          },
          employerProfile: {
            companyName: 'Digital Future Albania',
            companySize: '51-200',
            industry: 'Marketing',
            description: 'Kompani e specializuar në marketing digjital dhe e-commerce solutions. Ndihmojmë bizneset shqiptare të rriten online përmes strategjive të avancuara të marketingut digjital.',
            website: 'https://digitalfuture.al',
            verified: true,
            verificationDate: new Date(),
            verificationStatus: 'approved',
            subscriptionTier: 'premium'
          }
        },
        createdAt: new Date(),
        lastLoginAt: new Date(),
        emailVerified: true,
        privacySettings: {
          profileVisible: false,
          showInSearch: false
        }
      }
    ];

    await db.collection('users').insertMany(newUsers);
    console.log('✅ Successfully added 2 new test user accounts');

    console.log('\n🎉 Summary:');
    console.log('📊 Jobs added: 10 total (5 sponsored, 5 regular)');
    console.log('👤 Users added: 2 total (1 job seeker, 1 employer)');
    console.log('📋 All jobs posted by: klajdi@techinnovations.al');
    console.log('\n🔐 New test accounts:');
    console.log('👨‍💼 Job Seeker: sara.marku@email.com / password123');
    console.log('🏢 Employer: admin@digitalfuture.al / password123');

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from database');
  }
};

// Run the script
addNewJobsAndUsers();