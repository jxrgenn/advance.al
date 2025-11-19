import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../src/config/database.js';

// Load environment variables
dotenv.config();

const addDigitalFutureJobs = async () => {
  try {
    console.log('🌱 Adding jobs for Digital Future Albania...');

    // Connect to database
    await connectDB();
    const db = mongoose.connection.db;

    // Find the Digital Future Albania employer
    const digitalFutureUser = await db.collection('users').findOne({
      email: 'admin@digitalfuture.al'
    });

    if (!digitalFutureUser) {
      console.error('❌ admin@digitalfuture.al user not found! Please run add-new-jobs-and-users.js first.');
      process.exit(1);
    }

    console.log('✅ Found admin@digitalfuture.al user:', digitalFutureUser._id);

    // Generate unique slugs for jobs
    const generateSlug = (title, index) => {
      return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .trim() + `-df-${Date.now()}-${index}`;
    };

    // 6 new jobs for Digital Future Albania - 3 sponsored, 3 regular
    const digitalFutureJobs = [
      // SPONSORED JOBS (3)
      {
        employerId: digitalFutureUser._id,
        title: "Digital Marketing Manager",
        description: "Digital Future Albania është në kërkim të një Digital Marketing Manager të talentuar për të udhëhequr strategjitë tona të marketingut digjital. Do të jeni përgjegjës për planifikimin, zbatimin dhe optimizimin e fushatave të marketingut digjital për klientët tanë të ndryshëm. Kjo pozicion ofron mundësi të shkëlqyera për rritje profesionale në një nga kompanitë më inovative të marketingut digjital në Shqipëri.",
        requirements: [
          "3+ vite përvojë në Digital Marketing",
          "Njohuri të thella në Google Ads, Facebook Ads, LinkedIn Ads",
          "Përvojë me Google Analytics, SEMrush, Ahrefs",
          "Njohuri të forta në SEO dhe SEM",
          "Aftësi në content marketing dhe social media strategy",
          "Njohuri të gjuhës angleze në nivel C1"
        ],
        benefits: [
          "Paga kompetitive 1200-1800 EUR",
          "Bonus performance dhe komisione",
          "Training të vazhdueshëm në teknologjitë më të reja",
          "Certifikime të paguara (Google, Facebook, HubSpot)",
          "Laptop dhe telefon kompanie",
          "Sigurim shëndetësor privat",
          "Ambiente pune moderne në Durrës"
        ],
        location: {
          city: "Durrës",
          region: "Durrës",
          remote: true,
          remoteType: "hybrid"
        },
        jobType: "full-time",
        category: "Marketing",
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
        isDeleted: false,
        paymentStatus: "pending",
        paymentRequired: 0,
        applicationMethod: "internal",
        tags: ["digital-marketing", "google-ads", "facebook-ads", "seo", "analytics"],
        slug: generateSlug("Digital Marketing Manager", 1),
        postedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 120) + 60,
        applicationCount: Math.floor(Math.random() * 15) + 3
      },
      {
        employerId: digitalFutureUser._id,
        title: "E-commerce Specialist",
        description: "Pozicion i rëndësishëm për një E-commerce Specialist që do të menaxhojë dhe optimizojë platformat e e-commerce për klientët tanë. Do të punoni me teknologjitë më moderne të e-commerce për të rritur shitjet online dhe përmirësuar përvojën e përdoruesve. Mundësi e shkëlqyer për të punuar me brande të njohura shqiptare dhe ndërkombëtare.",
        requirements: [
          "2+ vite përvojë në E-commerce Management",
          "Njohuri të Shopify, WooCommerce, Magento",
          "Përvojë me payment gateways dhe logistics",
          "Aftësi në data analysis dhe reporting",
          "Njohuri të conversion rate optimization (CRO)",
          "Përvojë me email marketing dhe automation"
        ],
        benefits: [
          "Paga 1000-1500 EUR",
          "Bonus bazuar në performance të projekteve",
          "Training në platformët më të reja e-commerce",
          "Pune me brande të njohura",
          "Fleksibilitet në orar",
          "Mundësi për remote work"
        ],
        location: {
          city: "Durrës",
          region: "Durrës",
          remote: true,
          remoteType: "hybrid"
        },
        jobType: "full-time",
        category: "Marketing",
        seniority: "mid",
        salary: {
          min: 1000,
          max: 1500,
          currency: "EUR",
          negotiable: true,
          showPublic: true
        },
        status: "active",
        tier: "premium",
        isDeleted: false,
        paymentStatus: "pending",
        paymentRequired: 0,
        applicationMethod: "internal",
        tags: ["e-commerce", "shopify", "online-sales", "digital", "cro"],
        slug: generateSlug("E-commerce Specialist", 2),
        postedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 100) + 50,
        applicationCount: Math.floor(Math.random() * 12) + 2
      },
      {
        employerId: digitalFutureUser._id,
        title: "Content Marketing Lead",
        description: "Jemi në kërkim të një Content Marketing Lead kreativ dhe me vizion strategjik për të drejtuar ekipin tonë të content marketing. Do të jeni përgjegjës për krijimin e strategjive të content marketing, menaxhimin e ekipit kreativ dhe sigurimin që të gjithë content-i i krijuar të jetë i cilësisë së lartë dhe të arrijë objektivat e biznesit.",
        requirements: [
          "4+ vite përvojë në Content Marketing",
          "Përvojë në udhëheqjen e ekipeve kreative",
          "Njohuri të forta në storytelling dhe brand narrative",
          "Përvojë me video content dhe social media",
          "Aftësi në Adobe Creative Suite dhe Canva",
          "Portfolio të forte me projekte të suksesshme"
        ],
        benefits: [
          "Paga 1300-1900 EUR",
          "Lead team role me përgjegësi strategjike",
          "Budget për tools dhe software kreative",
          "Training në content marketing trends",
          "Punë me klientë ndërkombëtarë",
          "Creative freedom dhe autonomi"
        ],
        location: {
          city: "Durrës",
          region: "Durrës",
          remote: false,
          remoteType: "none"
        },
        jobType: "full-time",
        category: "Marketing",
        seniority: "senior",
        salary: {
          min: 1300,
          max: 1900,
          currency: "EUR",
          negotiable: true,
          showPublic: true
        },
        status: "active",
        tier: "premium",
        isDeleted: false,
        paymentStatus: "pending",
        paymentRequired: 0,
        applicationMethod: "internal",
        tags: ["content-marketing", "leadership", "strategy", "creative", "branding"],
        slug: generateSlug("Content Marketing Lead", 3),
        postedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 90) + 40,
        applicationCount: Math.floor(Math.random() * 10) + 1
      },

      // REGULAR JOBS (3)
      {
        employerId: digitalFutureUser._id,
        title: "Social Media Specialist",
        description: "Kërkohet Social Media Specialist për të menaxhuar dhe rritur prezencën online të klientëve tanë. Do të krijoni content engaging, menaxhoni komunitetet online dhe implementoni strategji për rritjen e followersave dhe engagement-it.",
        requirements: [
          "1+ vite përvojë në Social Media Management",
          "Njohuri të platforma sociale (Instagram, Facebook, TikTok, LinkedIn)",
          "Aftësi në content creation dhe design bazik",
          "Njohuri të social media analytics",
          "Kreativitet dhe pasion për social media"
        ],
        benefits: [
          "Paga 600-1000 EUR",
          "Training në social media tools",
          "Punë me brande të ndryshme",
          "Atmosphere të reja dhe kreative",
          "Growth opportunities"
        ],
        location: {
          city: "Durrës",
          region: "Durrës",
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
        isDeleted: false,
        paymentStatus: "pending",
        paymentRequired: 0,
        applicationMethod: "internal",
        tags: ["social-media", "content-creation", "community-management", "instagram"],
        slug: generateSlug("Social Media Specialist", 4),
        postedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 27 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 80) + 35,
        applicationCount: Math.floor(Math.random() * 18) + 5
      },
      {
        employerId: digitalFutureUser._id,
        title: "PPC Campaign Manager",
        description: "Pozicion për PPC Campaign Manager që do të menaxhojë fushatat e reklamave të paguara për klientët tanë. Do të optimizoni buxhetet reklamuese, përmirësoni performance dhe sigurani ROI të lartë për klientët.",
        requirements: [
          "2+ vite përvojë në PPC Management",
          "Certifikime Google Ads dhe Facebook Blueprint",
          "Njohuri të Google Analytics dhe tracking",
          "Aftësi analitike të forta",
          "Përvojë me A/B testing"
        ],
        benefits: [
          "Paga 800-1300 EUR",
          "Bonus performance bazuar në rezultate",
          "Training të vazhdueshëm",
          "Certifikime të paguara",
          "Punë me buxhete të mëdha reklamuese"
        ],
        location: {
          city: "Durrës",
          region: "Durrës",
          remote: true,
          remoteType: "hybrid"
        },
        jobType: "full-time",
        category: "Marketing",
        seniority: "mid",
        salary: {
          min: 800,
          max: 1300,
          currency: "EUR",
          negotiable: true,
          showPublic: true
        },
        status: "active",
        tier: "basic",
        isDeleted: false,
        paymentStatus: "pending",
        paymentRequired: 0,
        applicationMethod: "internal",
        tags: ["ppc", "google-ads", "paid-advertising", "analytics", "roi"],
        slug: generateSlug("PPC Campaign Manager", 5),
        postedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 26 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 70) + 30,
        applicationCount: Math.floor(Math.random() * 14) + 3
      },
      {
        employerId: digitalFutureUser._id,
        title: "Marketing Intern",
        description: "Pozicion internship për studenta ose të diplomuar të rinj që dëshirojnë të fitojnë përvojë në marketing digjital. Do të punoni ngushtë me ekipin tonë dhe do të mësoni aspekte të ndryshme të marketing digjital.",
        requirements: [
          "Student ose i diplomuar në Marketing, Business ose fushë të ngjashme",
          "Pasion për marketing digjital",
          "Aftësi bazike kompjuterike",
          "Dëshirë për të mësuar dhe zhvilluar",
          "Komunikim i mirë në shqip dhe anglisht"
        ],
        benefits: [
          "Kompensim 300-500 EUR",
          "Mentorship i plotë",
          "Training në marketing tools",
          "Certificate of completion",
          "Networking opportunities",
          "Mundësi për punësim të plotë pas internship"
        ],
        location: {
          city: "Durrës",
          region: "Durrës",
          remote: false,
          remoteType: "none"
        },
        jobType: "internship",
        category: "Marketing",
        seniority: "junior",
        salary: {
          min: 300,
          max: 500,
          currency: "EUR",
          negotiable: true,
          showPublic: true
        },
        status: "active",
        tier: "basic",
        isDeleted: false,
        paymentStatus: "pending",
        paymentRequired: 0,
        applicationMethod: "internal",
        tags: ["internship", "entry-level", "marketing", "learning", "mentorship"],
        slug: generateSlug("Marketing Intern", 6),
        postedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        viewCount: Math.floor(Math.random() * 120) + 60,
        applicationCount: Math.floor(Math.random() * 25) + 8
      }
    ];

    // Insert all jobs
    console.log('💼 Adding 6 new jobs for Digital Future Albania...');
    await db.collection('jobs').insertMany(digitalFutureJobs);
    console.log('✅ Successfully added 6 new jobs (3 sponsored, 3 regular)');

    console.log('\n🎉 Summary:');
    console.log('📊 Jobs added: 6 total (3 sponsored, 3 regular)');
    console.log('🏢 Company: Digital Future Albania');
    console.log('📍 Location: Durrës, Albania');
    console.log('📋 All jobs posted by: admin@digitalfuture.al');
    console.log('\n💼 Job Titles:');
    console.log('⭐ Digital Marketing Manager (Sponsored)');
    console.log('⭐ E-commerce Specialist (Sponsored)');
    console.log('⭐ Content Marketing Lead (Sponsored)');
    console.log('📄 Social Media Specialist');
    console.log('📄 PPC Campaign Manager');
    console.log('📄 Marketing Intern');

  } catch (error) {
    console.error('❌ Error adding jobs:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from database');
  }
};

// Run the script
addDigitalFutureJobs();