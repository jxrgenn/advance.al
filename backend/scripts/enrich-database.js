#!/usr/bin/env node
/**
 * Database Enrichment Script
 *
 * Phase 1: Delete test/garbage data (employers, jobseekers, jobs, orphans)
 * Phase 2: Fix existing employers (assign logos, update descriptions)
 * Phase 3: Create new employers for missing industries
 * Phase 4: Create 70+ realistic jobs across all 14 categories and 13 cities
 * Phase 5: Create 16 realistic jobseeker profiles at varying completeness
 * Phase 6: Queue embeddings for all new data
 *
 * Safety: Only deletes by explicit pattern. Preserves all real data and applications.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Job from '../src/models/Job.js';
import JobQueue from '../src/models/JobQueue.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function logo(name) {
  return `/images/companies/logos/${name}`;
}

const REGIONS = {
  'Tiranë': 'Tiranë', 'Durrës': 'Durrës', 'Vlorë': 'Vlorë', 'Shkodër': 'Shkodër',
  'Fier': 'Fier', 'Korçë': 'Korçë', 'Elbasan': 'Elbasan', 'Gjirokastër': 'Gjirokastër',
  'Berat': 'Berat', 'Lushnjë': 'Fier', 'Kavajë': 'Tiranë', 'Pogradec': 'Korçë',
  'Online/Remote': 'Remote'
};

async function countAll() {
  const db = mongoose.connection.db;
  const employers = await db.collection('users').countDocuments({ userType: 'employer', isDeleted: { $ne: true } });
  const jobseekers = await db.collection('users').countDocuments({ userType: 'jobseeker', isDeleted: { $ne: true } });
  const activeJobs = await db.collection('jobs').countDocuments({ isDeleted: { $ne: true }, status: 'active' });
  const totalJobs = await db.collection('jobs').countDocuments({ isDeleted: { $ne: true } });
  const applications = await db.collection('applications').countDocuments({});
  const queue = await db.collection('jobqueues').countDocuments({});
  const notifications = await db.collection('notifications').countDocuments({});
  return { employers, jobseekers, activeJobs, totalJobs, applications, queue, notifications };
}

function log(phase, msg) {
  console.log(`[${phase}] ${msg}`);
}

// ─────────────────────────────────────────────
// PHASE 1: CLEANUP
// ─────────────────────────────────────────────

async function phase1_cleanup() {
  const db = mongoose.connection.db;
  log('CLEANUP', '=== Phase 1: Deleting test/garbage data ===');

  // 1a. Delete test employer accounts
  const testEmployerPatterns = [
    /^test/i, /^ai-employer/i, /^testempl/i, /^testemp/i, /^testco/i,
    /^testemployer/i, /^ai@aaai/i
  ];
  const garbageEmployerEmails = [
    'vasilnako30@gmail.com', 'sad@gmail.com', 'lushnja@gmail.com',
    'gango@gmail.com', 'aaa@gmail.com', 'asdas@gmail.com',
    'matiaterziu19@gmail.com', 'matiaterziu@gmail.com'
  ];

  // Find all test employers
  const testEmployers = await db.collection('users').find({
    userType: 'employer',
    isDeleted: { $ne: true },
    $or: [
      { email: { $in: garbageEmployerEmails } },
      ...testEmployerPatterns.map(p => ({ email: p }))
    ]
  }).project({ _id: 1, email: 1 }).toArray();

  log('CLEANUP', `Found ${testEmployers.length} test employers to delete`);

  // Delete their jobs first
  const testEmpIds = testEmployers.map(e => e._id);
  const deletedTestJobs = await db.collection('jobs').deleteMany({ employerId: { $in: testEmpIds } });
  log('CLEANUP', `Deleted ${deletedTestJobs.deletedCount} jobs from test employers`);

  // Delete test employers
  const deletedTestEmps = await db.collection('users').deleteMany({ _id: { $in: testEmpIds } });
  log('CLEANUP', `Deleted ${deletedTestEmps.deletedCount} test employers`);

  // 1b. Delete orphan jobs (employer doesn't exist)
  const allJobs = await db.collection('jobs').find({ isDeleted: { $ne: true } }).project({ _id: 1, employerId: 1 }).toArray();
  const orphanIds = [];
  for (const j of allJobs) {
    const emp = await db.collection('users').findOne({ _id: j.employerId });
    if (!emp) orphanIds.push(j._id);
  }
  if (orphanIds.length > 0) {
    const deletedOrphans = await db.collection('jobs').deleteMany({ _id: { $in: orphanIds } });
    log('CLEANUP', `Deleted ${deletedOrphans.deletedCount} orphan jobs`);
  }

  // 1c. Delete garbage jobs from Tech Innovations AL (klajdi@techinnovations.al)
  const techInnovations = await db.collection('users').findOne({ email: 'klajdi@techinnovations.al' });
  if (techInnovations) {
    const garbageTitles = [
      'Karderr', 'hgfhgf', 'aaaaaa', 'UnfrozenJob', 'danoc', 'Danoc',
      'kggffggfh', 'ddddddddd', 'zzzzzz', 'fffff', 'Test Update',
      'Inxhinier Softueri' // annual salary confusion
    ];
    const garbageResult = await db.collection('jobs').deleteMany({
      employerId: techInnovations._id,
      $or: [
        { title: { $in: garbageTitles } },
        { title: /^\[TEST\]/i },
        { title: 'Inxhinier Software', status: 'pending_payment' } // 24000-288000 salary
      ]
    });
    log('CLEANUP', `Deleted ${garbageResult.deletedCount} garbage jobs from Tech Innovations`);
  }

  // 1d. Delete test jobseeker accounts
  const testSeekerPatterns = [
    /^test/i, /^ai-seeker/i, /^sectest/i, /^tokensec/i, /^cvtest/i,
    /^strong_\d/i, /^pw4_\d/i, /^tld_\d/i, /^plus\+tag_\d/i
  ];
  const garbageSeekerEmails = [
    'puci@tuci.com', 'aaa@bbb.com', 'danoci@danoc.com', 'opa@opaa.com',
    'sdas@asdas.com', 'roli@doli.com', 'asd@ads.com', 'opa@lali.com',
    'testseeker@advance.al', 'testseeker@test.com'
  ];

  const testSeekers = await db.collection('users').find({
    userType: 'jobseeker',
    isDeleted: { $ne: true },
    $or: [
      { email: { $in: garbageSeekerEmails } },
      ...testSeekerPatterns.map(p => ({ email: p }))
    ]
  }).project({ _id: 1, email: 1 }).toArray();

  log('CLEANUP', `Found ${testSeekers.length} test jobseekers to delete`);

  // Delete their applications first (if any)
  const testSeekerIds = testSeekers.map(s => s._id);
  const deletedApps = await db.collection('applications').deleteMany({ userId: { $in: testSeekerIds } });
  log('CLEANUP', `Deleted ${deletedApps.deletedCount} applications from test jobseekers`);

  // Delete test jobseekers
  const deletedTestSeekers = await db.collection('users').deleteMany({ _id: { $in: testSeekerIds } });
  log('CLEANUP', `Deleted ${deletedTestSeekers.deletedCount} test jobseekers`);

  // 1e. Clean stale job queue entries (for deleted jobs)
  const existingJobIds = (await db.collection('jobs').find({}).project({ _id: 1 }).toArray()).map(j => j._id);
  const staleQueue = await db.collection('jobqueues').deleteMany({
    $or: [
      { jobId: { $nin: existingJobIds } },
      { status: { $in: ['completed', 'failed'] } }
    ]
  });
  log('CLEANUP', `Cleaned ${staleQueue.deletedCount} stale job queue entries`);

  // 1f. Clean notifications for deleted users
  const existingUserIds = (await db.collection('users').find({}).project({ _id: 1 }).toArray()).map(u => u._id);
  const staleNotifs = await db.collection('notifications').deleteMany({
    userId: { $nin: existingUserIds }
  });
  log('CLEANUP', `Cleaned ${staleNotifs.deletedCount} stale notifications`);

  log('CLEANUP', '=== Phase 1 complete ===\n');
}

// ─────────────────────────────────────────────
// PHASE 2: FIX EXISTING EMPLOYERS
// ─────────────────────────────────────────────

async function phase2_fixEmployers() {
  const db = mongoose.connection.db;
  log('FIX', '=== Phase 2: Fixing existing employers ===');

  // Give Creative Agency a logo
  await db.collection('users').updateOne(
    { email: 'ermal@creativeagency.al' },
    { $set: { 'profile.employerProfile.logo': logo('digital_future_albania_logo.png') } }
  );
  log('FIX', 'Assigned logo to Creative Agency Tirana');

  // Fix Raiffeisen - was marked as test due to missing fields, verify it's good
  await db.collection('users').updateOne(
    { email: 'raiffeisenbankalbania@company.al' },
    { $set: { status: 'active' } }
  );

  // Fix Neptun industry (it's an electronics retailer, not construction)
  await db.collection('users').updateOne(
    { email: 'neptun@company.al' },
    { $set: {
      'profile.employerProfile.industry': 'Elektronikë dhe Retail',
      'profile.employerProfile.description': 'Neptun është zinxhiri më i madh i shitjes së pajisjeve elektronike dhe elektroshtëpiake në Shqipëri. Me mbi 30 dyqane në të gjithë vendin, Neptun ofron produkte cilësore nga markat më të njohura botërore.'
    }}
  );
  log('FIX', 'Updated Neptun industry and description');

  // Fix Coca-Cola industry
  await db.collection('users').updateOne(
    { email: 'coca-colaalbania@company.al' },
    { $set: {
      'profile.employerProfile.industry': 'Prodhim dhe Shpërndarje',
      'profile.employerProfile.companySize': '201-500'
    }}
  );

  // Ensure all real employers are active
  const realEmails = [
    'klajdi@techinnovations.al', 'ermal@creativeagency.al', 'admin@digitalfuture.al',
    'vodafonealbania@company.al', 'digitalb@company.al', 'raiffeisenbankalbania@company.al',
    'credinsbank@company.al', 'albtelekom@company.al', 'tiranabank@company.al',
    'neptun@company.al', 'coca-colaalbania@company.al', 'albanianeagle@company.al',
    'kastraticonstruction@company.al', 'bigmarket@company.al', 'balfingroup@company.al'
  ];
  await db.collection('users').updateMany(
    { email: { $in: realEmails } },
    { $set: { status: 'active' } }
  );
  log('FIX', 'Ensured all real employers are active');

  // Duplicate Vodafone "Network Engineer" — delete one
  const vodafone = await db.collection('users').findOne({ email: 'vodafonealbania@company.al' });
  if (vodafone) {
    const dupeJobs = await db.collection('jobs').find({
      employerId: vodafone._id,
      title: 'Network Engineer',
      status: 'active'
    }).toArray();
    if (dupeJobs.length > 1) {
      await db.collection('jobs').deleteOne({ _id: dupeJobs[1]._id });
      log('FIX', 'Removed duplicate Vodafone "Network Engineer" job');
    }
  }

  log('FIX', '=== Phase 2 complete ===\n');
}

// ─────────────────────────────────────────────
// PHASE 3: CREATE NEW EMPLOYERS
// ─────────────────────────────────────────────

async function phase3_newEmployers() {
  log('EMPLOYERS', '=== Phase 3: Creating new employers ===');

  const newEmployers = [
    {
      email: 'info@spitalamerikan.al',
      password: 'SpitalAmerikan2026!',
      firstName: 'Admin', lastName: 'Spitali',
      city: 'Tiranë',
      companyName: 'Spitali Amerikan',
      industry: 'Shëndetësi',
      companySize: '201-500',
      description: 'Spitali Amerikan është një nga institucionet mjekësore më të avancuara në Shqipëri. Me teknologji moderne dhe staf mjekësor të kualifikuar ndërkombëtarisht, ofrojmë shërbime shëndetësore të nivelit më të lartë për pacientët tanë.',
      website: 'https://spitalamerikan.al',
      logo: logo('albanian_eagle_logo.png'),
      phone: '+355694000001',
      whatsapp: '+355694000001'
    },
    {
      email: 'hr@unitir.edu.al',
      password: 'Universiteti2026!',
      firstName: 'Admin', lastName: 'UT',
      city: 'Tiranë',
      companyName: 'Universiteti i Tiranës',
      industry: 'Arsim dhe Kërkim Shkencor',
      companySize: '501+',
      description: 'Universiteti i Tiranës është universiteti më i madh dhe më i vjetër publik në Shqipëri. Me mbi 8 fakultete dhe 40,000 studentë, UT është qendra kryesore e arsimit të lartë dhe kërkimit shkencor në vend.',
      website: 'https://unitir.edu.al',
      logo: logo('balfin_group_logo.png'),
      phone: '+355694000002',
      whatsapp: '+355694000002'
    },
    {
      email: 'info@albtransport.al',
      password: 'ALBTransport2026!',
      firstName: 'Admin', lastName: 'Transport',
      city: 'Durrës',
      companyName: 'ALBtransport',
      industry: 'Transport dhe Logjistikë',
      companySize: '51-200',
      description: 'ALBtransport është kompania lider e transportit dhe logjistikës në Shqipëri. Ofrojmë shërbime transporti mallrash dhe pasagjerësh në të gjithë vendin, si dhe shërbime logjistike për bizneset vendase dhe ndërkombëtare.',
      website: 'https://albtransport.al',
      logo: logo('kastrati_construction_logo.png'),
      phone: '+355694000003',
      whatsapp: '+355694000003'
    }
  ];

  const createdIds = {};

  for (const emp of newEmployers) {
    const user = new User({
      email: emp.email,
      password: emp.password,
      userType: 'employer',
      status: 'active',
      emailVerified: true,
      profile: {
        firstName: emp.firstName,
        lastName: emp.lastName,
        phone: emp.phone,
        location: { city: emp.city, region: REGIONS[emp.city] },
        employerProfile: {
          companyName: emp.companyName,
          industry: emp.industry,
          companySize: emp.companySize,
          description: emp.description,
          website: emp.website,
          logo: emp.logo,
          verified: true,
          verificationStatus: 'approved',
          phone: emp.phone,
          whatsapp: emp.whatsapp,
          contactPreferences: {
            enablePhoneContact: true,
            enableWhatsAppContact: true,
            enableEmailContact: true,
            preferredContactMethod: 'email'
          }
        }
      }
    });
    await user.save();
    createdIds[emp.companyName] = user._id;
    log('EMPLOYERS', `Created: ${emp.companyName} (${emp.email})`);
  }

  log('EMPLOYERS', `=== Phase 3 complete: ${newEmployers.length} employers created ===\n`);
  return createdIds;
}

// ─────────────────────────────────────────────
// PHASE 4: CREATE JOBS
// ─────────────────────────────────────────────

function makeJob(employerId, data) {
  const city = data.city || 'Tiranë';
  const isRemote = city === 'Online/Remote' || data.remote;
  return {
    employerId,
    title: data.title,
    description: data.description,
    requirements: data.requirements || [],
    benefits: data.benefits || ['Pagë konkurruese', 'Sigurim shëndetësor', 'Mundësi avancimi në karrierë', 'Ambient pune modern'],
    location: {
      city,
      region: REGIONS[city],
      remote: isRemote,
      remoteType: isRemote ? (city === 'Online/Remote' ? 'full' : 'hybrid') : 'none'
    },
    jobType: data.jobType || 'full-time',
    platformCategories: {
      diaspora: false,
      ngaShtepia: isRemote,
      partTime: data.jobType === 'part-time',
      administrata: false,
      sezonale: data.seasonal || false
    },
    category: data.category,
    seniority: data.seniority || 'mid',
    salary: {
      min: data.salaryMin,
      max: data.salaryMax,
      currency: 'EUR',
      negotiable: true,
      showPublic: true
    },
    status: 'active',
    tier: data.tier || 'basic',
    applicationMethod: 'internal',
    tags: data.tags || [],
    postedAt: new Date(Date.now() - Math.floor(Math.random() * 20) * 24 * 60 * 60 * 1000), // Random within last 20 days
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  };
}

async function phase4_createJobs(newEmployerIds) {
  log('JOBS', '=== Phase 4: Creating jobs ===');
  const db = mongoose.connection.db;

  // Fetch existing employer IDs
  const empMap = {};
  const emps = await db.collection('users').find({
    userType: 'employer', isDeleted: { $ne: true }, status: 'active'
  }).project({ _id: 1, email: 1, 'profile.employerProfile.companyName': 1 }).toArray();
  for (const e of emps) {
    empMap[e.profile?.employerProfile?.companyName] = e._id;
  }
  // Merge new employer IDs
  Object.assign(empMap, newEmployerIds);

  const allJobs = [];

  // ── CREDINS BANK (Financë) ──
  const credins = empMap['Credins Bank'];
  allJobs.push(makeJob(credins, {
    title: 'Specialist Kreditimi', category: 'Financë', city: 'Tiranë', seniority: 'mid',
    salaryMin: 800, salaryMax: 1200,
    description: 'Credins Bank kërkon Specialist Kreditimi për degën qendrore. Kandidati do të analizojë kërkesat për kredi, vlerësojë riskun financiar të klientëve dhe përgatisë dokumentacionin e nevojshëm. Kërkohet njohuri e thellë e produkteve bankare dhe aftësi analitike.',
    requirements: ['Diplomë në Ekonomi ose Financë', 'Minimumi 2 vjet përvojë në sektorin bankar', 'Njohuri të mira të analizës financiare', 'Aftësi të shkëlqyera komunikimi'],
    tags: ['Financë', 'Kreditim', 'Bankë', 'Analizë']
  }));
  allJobs.push(makeJob(credins, {
    title: 'Analist Financiar', category: 'Financë', city: 'Elbasan', seniority: 'mid',
    salaryMin: 1000, salaryMax: 1500,
    description: 'Pozicion për Analist Financiar në degën e Elbasanit. Roli përfshin analizën e performancës financiare, përgatitjen e raporteve periodike dhe mbështetjen e vendimmarrjes strategjike. Kandidati ideal ka përvojë me modelimin financiar.',
    requirements: ['Diplomë në Financë, Kontabilitet ose fushë të ngjashme', '3+ vjet përvojë si analist financiar', 'Njohuri të avancuara të Excel dhe modelimit financiar', 'Aftësi analitike dhe vëmendje ndaj detajeve'],
    tags: ['Financë', 'Analizë', 'Excel', 'Raportim']
  }));
  allJobs.push(makeJob(credins, {
    title: 'Arkëtar/e', category: 'Financë', city: 'Korçë', seniority: 'junior',
    salaryMin: 500, salaryMax: 700,
    description: 'Credins Bank kërkon Arkëtar/e për degën në Korçë. Detyrat përfshijnë kryerjen e transaksioneve bankare, shërbimin e klientëve dhe menaxhimin e arkës. Pozicion ideal për të rinjtë që duan të ndërtojnë karrierë në sektorin bankar.',
    requirements: ['Diplomë e mesme ose universitare', 'Aftësi të mira numerike', 'Shërbim i shkëlqyer ndaj klientit', 'Njohuri bazë të kompjuterit'],
    tags: ['Bankë', 'Arkë', 'Shërbim klienti']
  }));
  allJobs.push(makeJob(credins, {
    title: 'Menaxher Dege', category: 'Financë', city: 'Shkodër', seniority: 'senior',
    salaryMin: 1500, salaryMax: 2200, tier: 'premium',
    description: 'Pozicion udhëheqës për Menaxherin e Degës së Credins Bank në Shkodër. Përgjegjësi për menaxhimin e plotë të degës, arritjen e objektivave financiare, zhvillimin e ekipit dhe rritjen e portofolit të klientëve.',
    requirements: ['Diplomë Master në Financë ose MBA', '7+ vjet përvojë në sektorin bankar', 'Përvojë e dëshmuar në menaxhim ekipi', 'Njohuri të thella të produkteve bankare'],
    tags: ['Menaxhim', 'Bankë', 'Udhëheqje', 'Strategji'],
    benefits: ['Pagë shumë konkurruese', 'Bonus performance', 'Makinë kompanie', 'Sigurim shëndetësor premium']
  }));

  // ── ALBTELEKOM (Teknologji) ──
  const albtelekom = empMap['Albtelekom'];
  allJobs.push(makeJob(albtelekom, {
    title: 'Inxhinier Rrjeti', category: 'Teknologji', city: 'Tiranë', seniority: 'mid',
    salaryMin: 1000, salaryMax: 1500,
    description: 'Albtelekom kërkon Inxhinier Rrjeti për të menaxhuar dhe optimizuar infrastrukturën e rrjetit telekomunikues. Përgjegjësi për projektimin, implementimin dhe mirëmbajtjen e rrjeteve LAN/WAN.',
    requirements: ['Diplomë në Informatikë ose Telekomunikacion', '3+ vjet përvojë me rrjete', 'Certifikim CCNA ose ekuivalent', 'Njohuri të protokolleve TCP/IP, BGP, OSPF'],
    tags: ['Rrjet', 'Networking', 'CCNA', 'Telekomunikacion']
  }));
  allJobs.push(makeJob(albtelekom, {
    title: 'Teknik Telekomunikacioni', category: 'Teknologji', city: 'Shkodër', seniority: 'junior',
    salaryMin: 600, salaryMax: 900,
    description: 'Pozicion për Teknik Telekomunikacioni në rajonin e Shkodrës. Detyrat përfshijnë instalimin dhe mirëmbajtjen e pajisjeve telekomunikuese, zgjidhjen e problemeve teknike dhe mbështetjen e klientëve.',
    requirements: ['Diplomë në Elektronikë ose Telekomunikacion', 'Njohuri bazë të rrjeteve', 'Aftësi të mira teknike', 'Patent shofer kategoria B'],
    tags: ['Telekomunikacion', 'Teknik', 'Mirëmbajtje']
  }));
  allJobs.push(makeJob(albtelekom, {
    title: 'Specialist IT Infrastrukture', category: 'Teknologji', city: 'Vlorë', seniority: 'mid',
    salaryMin: 900, salaryMax: 1300,
    description: 'Kërkohet Specialist IT Infrastrukture për zyrën rajonale në Vlorë. Përgjegjësi për administrimin e serverëve, menaxhimin e sistemeve dhe sigurimin e vazhdueshmerisë së shërbimeve IT.',
    requirements: ['Diplomë në Informatikë ose Inxhinieri Kompjuterike', '2+ vjet përvojë me Linux/Windows Server', 'Njohuri të virtualizimit (VMware/Hyper-V)', 'Aftësi për zgjidhje problemesh'],
    tags: ['IT', 'Infrastrukturë', 'Linux', 'Server']
  }));

  // ── TIRANA BANK (Financë) ──
  const tiranaBank = empMap['Tirana Bank'];
  allJobs.push(makeJob(tiranaBank, {
    title: 'Specialist Operacionesh Bankare', category: 'Financë', city: 'Tiranë', seniority: 'mid',
    salaryMin: 900, salaryMax: 1300,
    description: 'Tirana Bank kërkon Specialist Operacionesh Bankare. Kandidati do të menaxhojë operacionet ditore bankare, procesojë transferta dhe sigurojë pajtueshmërinë me rregullat bankare.',
    requirements: ['Diplomë në Ekonomi ose Financë', '2+ vjet përvojë bankare', 'Njohuri të sistemeve bankare', 'Vëmendje e lartë ndaj detajeve'],
    tags: ['Bankë', 'Operacione', 'Financë']
  }));
  allJobs.push(makeJob(tiranaBank, {
    title: 'Menaxher Marrëdhëniesh me Klientët', category: 'Financë', city: 'Fier', seniority: 'mid',
    salaryMin: 1000, salaryMax: 1500,
    description: 'Pozicion për Menaxher Marrëdhëniesh me Klientët në degën e Fierit. Fokusi kryesor është zhvillimi i marrëdhënieve me klientët korporatë, identifikimi i nevojave financiare dhe ofrimi i zgjidhjeve të përshtatshme.',
    requirements: ['Diplomë universitare në Ekonomi', '3+ vjet përvojë në shitje ose marrëdhënie me klientët', 'Aftësi të shkëlqyera ndërpersonale', 'Orientim drejt rezultateve'],
    tags: ['Bankë', 'CRM', 'Shitje', 'Klient']
  }));
  allJobs.push(makeJob(tiranaBank, {
    title: 'Auditues i Brendshëm', category: 'Financë', city: 'Tiranë', seniority: 'senior',
    salaryMin: 1400, salaryMax: 2000,
    description: 'Kërkohet Auditues i Brendshëm me përvojë për të kryer auditime operative dhe financiare. Roli përfshin vlerësimin e kontrolleve të brendshme, identifikimin e rrisqeve dhe rekomandimin e përmirësimeve.',
    requirements: ['Diplomë Master në Financë ose Kontabilitet', 'Certifikim CIA ose ACCA', '5+ vjet përvojë në auditim', 'Njohuri të standardeve ISA'],
    tags: ['Auditim', 'Financë', 'Rrezik', 'Compliance']
  }));

  // ── NEPTUN (Shitje/Elektronikë) ──
  const neptun = empMap['Neptun'];
  allJobs.push(makeJob(neptun, {
    title: 'Menaxher Dyqani', category: 'Shitje', city: 'Durrës', seniority: 'mid',
    salaryMin: 800, salaryMax: 1200,
    description: 'Neptun kërkon Menaxher Dyqani për dyqanin e Durrësit. Përgjegjësi për menaxhimin e operacioneve ditore, motivimin e ekipit të shitjeve, arritjen e objektivave mujore dhe sigurimin e përvojës optimale të klientëve.',
    requirements: ['2+ vjet përvojë në menaxhim retail', 'Aftësi udhëheqëse të dëshmuara', 'Orientim drejt klientit', 'Njohuri të produkteve elektronike'],
    tags: ['Shitje', 'Retail', 'Menaxhim', 'Elektronikë']
  }));
  allJobs.push(makeJob(neptun, {
    title: 'Shitës/e Elektronike', category: 'Shitje', city: 'Tiranë', seniority: 'junior',
    salaryMin: 400, salaryMax: 600,
    description: 'Pozicion për Shitës/e në dyqanin Neptun në Tiranë. Detyrat përfshijnë këshillimin e klientëve, demonstrimin e produkteve, menaxhimin e stokut dhe mbajtjen e pastërtisë së dyqanit.',
    requirements: ['Arsim i mesëm ose universitar', 'Pasion për teknologjinë', 'Aftësi të mira komunikimi', 'Gatishmëri për pune në turne'],
    tags: ['Shitje', 'Retail', 'Elektronikë', 'Klient']
  }));
  allJobs.push(makeJob(neptun, {
    title: 'Specialist Magazinimi', category: 'Shitje', city: 'Fier', seniority: 'junior',
    salaryMin: 500, salaryMax: 700,
    description: 'Kërkohet Specialist Magazinimi për qendrën e shpërndarjes në Fier. Përgjegjësi për pranimin e mallrave, organizimin e magazinës dhe përgatitjen e porosive.',
    requirements: ['Arsim i mesëm', 'Përvojë në magazinë e preferueshme', 'Aftësi fizike', 'Njohuri bazë të kompjuterit'],
    tags: ['Magazinë', 'Logjistikë', 'Stok']
  }));
  allJobs.push(makeJob(neptun, {
    title: 'Teknik Riparimi', category: 'Teknologji', city: 'Korçë', seniority: 'mid',
    salaryMin: 700, salaryMax: 1000,
    description: 'Neptun kërkon Teknik Riparimi për qendrën e servisit në Korçë. Detyrat përfshijnë diagnostikimin dhe riparimin e pajisjeve elektronike, kompjuterëve dhe elektroshtëpiakeve.',
    requirements: ['Diplomë në Elektronikë ose Informatikë', '2+ vjet përvojë në riparim', 'Njohuri të komponentëve elektronikë', 'Aftësi diagnostikuese'],
    tags: ['Riparim', 'Elektronikë', 'Servis', 'Diagnostikim']
  }));

  // ── COCA-COLA ALBANIA (Shitje/Prodhim) ──
  const cocaCola = empMap['Coca-Cola Albania'];
  allJobs.push(makeJob(cocaCola, {
    title: 'Menaxher Shitjesh Rajonale', category: 'Shitje', city: 'Tiranë', seniority: 'mid',
    salaryMin: 1000, salaryMax: 1500,
    description: 'Coca-Cola Albania kërkon Menaxher Shitjesh Rajonale. Përgjegjësi për zhvillimin e strategjive të shitjeve, menaxhimin e klientëve kryesorë dhe arritjen e objektivave në rajonin e caktuar.',
    requirements: ['Diplomë universitare', '3+ vjet përvojë në shitje FMCG', 'Aftësi negociuese të forta', 'Patent shofer kategoria B'],
    tags: ['Shitje', 'FMCG', 'Menaxhim', 'B2B']
  }));
  allJobs.push(makeJob(cocaCola, {
    title: 'Operator Prodhimi', category: 'Tjetër', city: 'Tiranë', seniority: 'junior',
    salaryMin: 500, salaryMax: 800,
    description: 'Pozicion për Operator Prodhimi në fabrikën e Coca-Cola Albania. Detyrat përfshijnë operimin e linjave të prodhimit, kontrollin e cilësisë dhe respektimin e standardeve të sigurisë.',
    requirements: ['Arsim i mesëm teknik', 'Gatishmëri për pune në turne', 'Vëmendje ndaj detajeve', 'Aftësi për pune në ekip'],
    tags: ['Prodhim', 'Fabrikë', 'Cilësi', 'Operim']
  }));
  allJobs.push(makeJob(cocaCola, {
    title: 'Shofer Shpërndarës', category: 'Transport', city: 'Fier', seniority: 'junior',
    salaryMin: 500, salaryMax: 700,
    description: 'Kërkohet Shofer Shpërndarës për rajonin e Fierit. Detyrat përfshijnë shpërndarjen e produkteve tek pikat e shitjes, menaxhimin e dokumentacionit dhe mirëmbajtjen e automjetit.',
    requirements: ['Patent shofer kategoria C', '1+ vit përvojë si shofer', 'Njohuri të zonës së Fierit', 'Person i besueshëm dhe i përgjegjshëm'],
    tags: ['Transport', 'Shpërndarje', 'Shofer', 'Logjistikë']
  }));
  allJobs.push(makeJob(cocaCola, {
    title: 'Specialist Marketingu', category: 'Marketing', city: 'Tiranë', seniority: 'mid',
    salaryMin: 900, salaryMax: 1300,
    description: 'Coca-Cola Albania kërkon Specialist Marketingu. Roli përfshin zhvillimin e fushatave promocionale, koordinimin me agjencitë kreative dhe analizën e tregut.',
    requirements: ['Diplomë në Marketing ose Komunikim', '2+ vjet përvojë në marketing', 'Njohuri të marketingut dixhital', 'Kreativitet dhe aftësi analitike'],
    tags: ['Marketing', 'Fushata', 'Brand', 'Promocion']
  }));

  // ── ALBANIAN EAGLE (Turizëm) ──
  const eagle = empMap['Albanian Eagle'];
  allJobs.push(makeJob(eagle, {
    title: 'Guide Turistike', category: 'Turizëm', city: 'Tiranë', seniority: 'junior',
    salaryMin: 600, salaryMax: 900,
    description: 'Albanian Eagle kërkon Guide Turistike entuziaste. Detyrat përfshijnë drejtimin e tureve në Tiranë dhe rrethinat, prezantimin e historisë dhe kulturës shqiptare, dhe sigurimin e përvojës unike për turistët.',
    requirements: ['Njohuri të historisë dhe kulturës shqiptare', 'Anglisht i rrjedhshëm', 'Aftësi të shkëlqyera komunikimi', 'Energji pozitive dhe pasion për turizmin'],
    tags: ['Turizëm', 'Guide', 'Anglisht', 'Kulturë'],
    seasonal: true
  }));
  allJobs.push(makeJob(eagle, {
    title: 'Menaxher Hotelerie', category: 'Turizëm', city: 'Vlorë', seniority: 'mid',
    salaryMin: 1000, salaryMax: 1500, tier: 'premium',
    description: 'Pozicion për Menaxher Hotelerie në resortin tonë në Vlorë. Përgjegjësi për menaxhimin e plotë të hotelit, sigurimin e standardeve të larta të shërbimit dhe maksimizimin e të ardhurave.',
    requirements: ['Diplomë në Menaxhim Hotelier ose Turizëm', '4+ vjet përvojë në industrinë e hotelerisë', 'Anglisht dhe mundësisht gjermanisht', 'Aftësi udhëheqëse'],
    tags: ['Hoteleri', 'Menaxhim', 'Resort', 'Turizëm'],
    benefits: ['Pagë konkurruese', 'Akomodim falas', 'Ushqim i përfshirë', 'Bonus sezonal']
  }));
  allJobs.push(makeJob(eagle, {
    title: 'Recepsionist/e Hoteli', category: 'Turizëm', city: 'Gjirokastër', seniority: 'junior',
    salaryMin: 400, salaryMax: 600,
    description: 'Kërkohet Recepsionist/e për hotelin tonë në Gjirokastër. Detyrat përfshijnë pritjen e mysafirëve, menaxhimin e rezervimeve, ofrimin e informacionit turistik dhe zgjidhjen e kërkesave.',
    requirements: ['Arsim i mesëm ose universitar', 'Anglisht i mirë', 'Aftësi komunikimi', 'Paraqitje e pastër profesionale'],
    tags: ['Recepsion', 'Hotel', 'Turizëm', 'Shërbim'],
    seasonal: true
  }));
  allJobs.push(makeJob(eagle, {
    title: 'Organizator Eventesh', category: 'Turizëm', city: 'Tiranë', seniority: 'mid',
    salaryMin: 800, salaryMax: 1200,
    description: 'Albanian Eagle kërkon Organizator Eventesh kreativ. Roli përfshin planifikimin dhe ekzekutimin e eventeve turistike, konferencave dhe aktiviteteve kulturore.',
    requirements: ['Diplomë në Marketing, Turizëm ose Komunikim', '2+ vjet përvojë në organizim eventesh', 'Kreativitet dhe aftësi organizative', 'Rrjet kontaktesh në industri'],
    tags: ['Evente', 'Organizim', 'Turizëm', 'Marketing']
  }));
  allJobs.push(makeJob(eagle, {
    title: 'Kuzhinier/e', category: 'Turizëm', city: 'Berat', seniority: 'mid',
    salaryMin: 700, salaryMax: 1000,
    description: 'Kërkohet Kuzhinier/e me përvojë për restorantin e hotelit tonë në Berat. Specialitete kuzhinës shqiptare dhe mesdhetare.',
    requirements: ['Përvojë si kuzhinier/e', 'Njohuri e kuzhinës tradicionale shqiptare', 'Certifikim HACCP i preferueshëm', 'Kreativitet në gatim'],
    tags: ['Kuzhinë', 'Gatim', 'Hotel', 'Restorant']
  }));

  // ── KASTRATI CONSTRUCTION (Ndërtim) ──
  const kastrati = empMap['Kastrati Construction'];
  allJobs.push(makeJob(kastrati, {
    title: 'Inxhinier Ndërtimi', category: 'Ndërtim', city: 'Tiranë', seniority: 'mid',
    salaryMin: 1200, salaryMax: 1800,
    description: 'Kastrati Construction kërkon Inxhinier Ndërtimi për projektet e reja. Përgjegjësi për projektimin, mbikëqyrjen e punimeve dhe sigurimin e cilësisë në kantier.',
    requirements: ['Diplomë në Inxhinieri Ndërtimi', '3+ vjet përvojë profesionale', 'Njohuri të softwareve AutoCAD, SAP2000', 'Licencë profesionale'],
    tags: ['Ndërtim', 'Inxhinieri', 'AutoCAD', 'Projektim']
  }));
  allJobs.push(makeJob(kastrati, {
    title: 'Mbikëqyrës Kantieri', category: 'Ndërtim', city: 'Durrës', seniority: 'senior',
    salaryMin: 1500, salaryMax: 2200,
    description: 'Pozicion për Mbikëqyrës Kantieri në projektin e ri në Durrës. Përgjegjësi e plotë për ecurinë e punimeve, koordinimin e nënkontraktorëve dhe respektimin e afateve.',
    requirements: ['Diplomë në Inxhinieri', '7+ vjet përvojë në ndërtim', 'Përvojë në menaxhim kantieri', 'Njohuri të standardeve të sigurisë'],
    tags: ['Kantier', 'Mbikëqyrje', 'Ndërtim', 'Menaxhim']
  }));
  allJobs.push(makeJob(kastrati, {
    title: 'Projektues Arkitekture', category: 'Ndërtim', city: 'Tiranë', seniority: 'mid',
    salaryMin: 1100, salaryMax: 1600, tier: 'premium',
    description: 'Kërkohet Projektues Arkitekture i talentuar. Roli përfshin hartimin e projekteve arkitekturore, vizualizime 3D dhe koordinimin me ekipin e inxhinierisë.',
    requirements: ['Diplomë në Arkitekturë', '3+ vjet përvojë profesionale', 'Njohuri të avancuara të AutoCAD, Revit, SketchUp', 'Portfolio e projekteve'],
    tags: ['Arkitekturë', 'Projektim', 'AutoCAD', 'Revit', '3D']
  }));
  allJobs.push(makeJob(kastrati, {
    title: 'Punëtor Ndërtimi', category: 'Ndërtim', city: 'Fier', seniority: 'junior',
    salaryMin: 400, salaryMax: 600,
    description: 'Kastrati Construction kërkon Punëtorë Ndërtimi për projektin në Fier. Punë fizike në kantier ndërtimi.',
    requirements: ['Përvojë në punë ndërtimi', 'Aftësi fizike', 'Gatishmëri për pune jashtë qytetit', 'Person i besueshëm'],
    tags: ['Ndërtim', 'Kantier', 'Punëtor']
  }));
  allJobs.push(makeJob(kastrati, {
    title: 'Elektricist Industrial', category: 'Ndërtim', city: 'Elbasan', seniority: 'mid',
    salaryMin: 800, salaryMax: 1100,
    description: 'Kërkohet Elektricist Industrial me përvojë për instalimet elektrike në projektet tona në Elbasan.',
    requirements: ['Certifikim profesional elektricist', '3+ vjet përvojë', 'Njohuri të sistemeve elektrike industriale', 'Respektim i standardeve të sigurisë'],
    tags: ['Elektrik', 'Industrial', 'Ndërtim', 'Instalim']
  }));
  allJobs.push(makeJob(kastrati, {
    title: 'Inxhinier Elektrik', category: 'Inxhinieri', city: 'Tiranë', seniority: 'mid',
    salaryMin: 1100, salaryMax: 1600,
    description: 'Pozicion për Inxhinier Elektrik në departamentin e projektimit. Përgjegjësi për projektimin e sistemeve elektrike në ndërtesa civile dhe industriale.',
    requirements: ['Diplomë në Inxhinieri Elektrike', '3+ vjet përvojë', 'Njohuri të AutoCAD Electrical', 'Licencë profesionale'],
    tags: ['Inxhinieri', 'Elektrike', 'Projektim', 'AutoCAD']
  }));
  allJobs.push(makeJob(kastrati, {
    title: 'Inxhinier Mekanik', category: 'Inxhinieri', city: 'Durrës', seniority: 'mid',
    salaryMin: 1000, salaryMax: 1500,
    description: 'Kërkohet Inxhinier Mekanik për projektet e infrastrukturës. Roli përfshin projektimin e sistemeve HVAC, ujësjellësave dhe kanalizimeve.',
    requirements: ['Diplomë në Inxhinieri Mekanike', '2+ vjet përvojë', 'Njohuri të softwareve teknike', 'Aftësi për pune në ekip'],
    tags: ['Inxhinieri', 'Mekanike', 'HVAC', 'Projektim']
  }));

  // ── BIG MARKET (Shitje) ──
  const bigMarket = empMap['Big Market'];
  allJobs.push(makeJob(bigMarket, {
    title: 'Menaxher Sektori', category: 'Shitje', city: 'Tiranë', seniority: 'mid',
    salaryMin: 700, salaryMax: 1000,
    description: 'Big Market kërkon Menaxher Sektori për supermarketin e ri. Përgjegjësi për menaxhimin e sektorit, kontrollin e stokut dhe motivimin e ekipit.',
    requirements: ['2+ vjet përvojë në retail', 'Aftësi organizative', 'Orientim drejt klientit', 'Fleksibilitet në orar'],
    tags: ['Retail', 'Supermarket', 'Menaxhim', 'Shitje']
  }));
  allJobs.push(makeJob(bigMarket, {
    title: 'Kasier/e', category: 'Shitje', city: 'Kavajë', seniority: 'junior', jobType: 'part-time',
    salaryMin: 300, salaryMax: 450,
    description: 'Pozicion part-time për Kasier/e në dyqanin e Kavajës. Orari fleksibël, ideal për studentë.',
    requirements: ['Arsim i mesëm', 'Aftësi numerike', 'Shërbim i mirë ndaj klientit', 'Gatishmëri për pune në fundjavë'],
    tags: ['Kasier', 'Part-time', 'Retail']
  }));
  allJobs.push(makeJob(bigMarket, {
    title: 'Specialist Furnizimi', category: 'Shitje', city: 'Lushnjë', seniority: 'mid',
    salaryMin: 800, salaryMax: 1100,
    description: 'Kërkohet Specialist Furnizimi për menaxhimin e zinxhirit të furnizimit. Detyrat përfshijnë negociimin me furnitorët, menaxhimin e porosive dhe optimizimin e kostove.',
    requirements: ['Diplomë në Ekonomi ose Logjistikë', '2+ vjet përvojë në furnizim', 'Aftësi negociuese', 'Njohuri të Excel'],
    tags: ['Furnizim', 'Logjistikë', 'Prokurimi', 'Negocim']
  }));

  // ── BALFIN GROUP (Menaxhim/Investime) ──
  const balfin = empMap['Balfin Group'];
  allJobs.push(makeJob(balfin, {
    title: 'Menaxher Projektesh', category: 'Menaxhim', city: 'Tiranë', seniority: 'senior',
    salaryMin: 2000, salaryMax: 3000, tier: 'premium',
    description: 'Balfin Group kërkon Menaxher Projektesh me përvojë për të udhëhequr projekte strategjike në nivel grupi. Koordinim me departamente të ndryshme dhe raportim direkt tek bordi.',
    requirements: ['Diplomë Master në Menaxhim ose MBA', '7+ vjet përvojë në menaxhim projektesh', 'Certifikim PMP i preferueshëm', 'Aftësi udhëheqëse të jashtëzakonshme'],
    tags: ['Menaxhim', 'Projekt', 'PMP', 'Strategji'],
    benefits: ['Pagë shumë konkurruese', 'Bonus vjetor', 'Sigurim shëndetësor premium', 'Mundësi zhvillimi ndërkombëtar']
  }));
  allJobs.push(makeJob(balfin, {
    title: 'Analist Investimesh', category: 'Financë', city: 'Tiranë', seniority: 'mid',
    salaryMin: 1500, salaryMax: 2200,
    description: 'Pozicion për Analist Investimesh në departamentin financiar. Roli përfshin vlerësimin e mundësive të investimit, modelimin financiar dhe përgatitjen e rekomandimeve për bordin.',
    requirements: ['Diplomë në Financë ose Ekonomi', '3+ vjet përvojë në analiza investimesh', 'Njohuri të avancuara të Excel dhe modelimit financiar', 'CFA Level II ose ekuivalent'],
    tags: ['Investime', 'Financë', 'Analizë', 'CFA']
  }));
  allJobs.push(makeJob(balfin, {
    title: 'Specialist Burimesh Njerëzore', category: 'Burime Njerëzore', city: 'Tiranë', seniority: 'mid',
    salaryMin: 1000, salaryMax: 1500,
    description: 'Balfin Group kërkon Specialist HR për të menaxhuar procesin e rekrutimit, zhvillimin e punonjësve dhe administratën e burimeve njerëzore në nivel grupi.',
    requirements: ['Diplomë në Menaxhim ose Psikologji', '2+ vjet përvojë në HR', 'Njohuri të ligjit të punës', 'Aftësi komunikimi të shkëlqyera'],
    tags: ['HR', 'Rekrutim', 'Burime Njerëzore', 'Zhvillim']
  }));
  allJobs.push(makeJob(balfin, {
    title: 'Drejtor Operacionesh', category: 'Menaxhim', city: 'Tiranë', seniority: 'lead',
    salaryMin: 2500, salaryMax: 4000, tier: 'featured',
    description: 'Pozicion strategjik i nivelit të lartë. Drejtori i Operacioneve do të menaxhojë operacionet ditore të grupit, optimizojë proceset dhe udhëheqë transformimin dixhital.',
    requirements: ['MBA ose ekuivalent', '10+ vjet përvojë menaxheriale', 'Përvojë në menaxhim operacionesh në shkallë të gjerë', 'Aftësi të jashtëzakonshme strategjike'],
    tags: ['Drejtor', 'Operacione', 'Strategji', 'Menaxhim'],
    benefits: ['Paketë kompensimi shumë konkurruese', 'Bonus performance', 'Makinë kompanie', 'Sigurim familjar', 'Pushime 25 ditë']
  }));
  allJobs.push(makeJob(balfin, {
    title: 'Koordinator Logjistike', category: 'Transport', city: 'Durrës', seniority: 'mid',
    salaryMin: 900, salaryMax: 1300,
    description: 'Kërkohet Koordinator Logjistike për operacionet në portin e Durrësit. Përgjegjësi për koordinimin e transportit, menaxhimin e magazinave dhe optimizimin e zinxhirit të furnizimit.',
    requirements: ['Diplomë në Logjistikë ose Ekonomi', '2+ vjet përvojë në logjistikë', 'Njohuri të softwareve ERP', 'Aftësi organizative'],
    tags: ['Logjistikë', 'Transport', 'Magazinë', 'ERP']
  }));

  // ── CREATIVE AGENCY TIRANA (Dizajn) ──
  const creative = empMap['Creative Agency Tirana'];
  allJobs.push(makeJob(creative, {
    title: 'Grafik Dizajner', category: 'Dizajn', city: 'Tiranë', seniority: 'mid',
    salaryMin: 800, salaryMax: 1200,
    description: 'Creative Agency Tirana kërkon Grafik Dizajner kreativ për ekipin tonë. Detyrat përfshijnë krijimin e materialeve vizuale për klientët, brandimin dhe dizajnin e printit dhe dixhitalit.',
    requirements: ['Diplomë në Dizajn Grafik ose Art Vizual', '2+ vjet përvojë profesionale', 'Njohuri të avancuara të Adobe Creative Suite', 'Portfolio e fortë'],
    tags: ['Dizajn', 'Grafik', 'Adobe', 'Branding', 'Kreativ']
  }));
  allJobs.push(makeJob(creative, {
    title: 'Video Editor', category: 'Dizajn', city: 'Tiranë', seniority: 'junior',
    salaryMin: 600, salaryMax: 900,
    description: 'Pozicion për Video Editor kreativ. Detyrat përfshijnë editimin e videove promocionale, reklamave dhe përmbajtjes për mediat sociale.',
    requirements: ['Njohuri të Adobe Premiere Pro ose DaVinci Resolve', 'Sense e fortë vizuale', 'Aftësi për punë nën presion', 'Portfolio pune'],
    tags: ['Video', 'Editim', 'Premiere', 'After Effects']
  }));
  allJobs.push(makeJob(creative, {
    title: 'Web Developer', category: 'Teknologji', city: 'Online/Remote', seniority: 'mid',
    salaryMin: 900, salaryMax: 1400, remote: true,
    description: 'Creative Agency kërkon Web Developer për punë remote. Zhvillim i faqeve web për klientët tanë duke përdorur teknologjitë më të fundit.',
    requirements: ['3+ vjet përvojë në zhvillim web', 'Njohuri të HTML, CSS, JavaScript, React ose Vue', 'Përvojë me WordPress', 'Aftësi për punë të pavarur'],
    tags: ['Web', 'JavaScript', 'React', 'WordPress', 'Remote']
  }));
  allJobs.push(makeJob(creative, {
    title: 'Social Media Manager', category: 'Marketing', city: 'Tiranë', seniority: 'junior',
    salaryMin: 600, salaryMax: 900,
    description: 'Kërkohet Social Media Manager për menaxhimin e llogarive sociale të klientëve tanë. Krijimi i përmbajtjes, planifikimi i postimeve dhe raportimi i performancës.',
    requirements: ['Njohuri e platformave sociale (Instagram, Facebook, TikTok)', 'Aftësi të shkëlqyera në shkrim', 'Kreativitet', 'Njohuri bazë të dizajnit grafik'],
    tags: ['Social Media', 'Marketing', 'Content', 'Instagram', 'TikTok']
  }));

  // ── DIGITALB (Media) ──
  const digitalb = empMap['DigitalB'];
  allJobs.push(makeJob(digitalb, {
    title: 'Gazetar/e', category: 'Tjetër', city: 'Tiranë', seniority: 'mid',
    salaryMin: 800, salaryMax: 1200,
    description: 'DigitalB kërkon Gazetar/e me përvojë për redaksinë e lajmeve. Detyrat përfshijnë hulumtimin, shkruar-jen e lajmeve dhe prezantimin live.',
    requirements: ['Diplomë në Gazetari ose Komunikim', '2+ vjet përvojë në media', 'Aftësi të shkëlqyera në shkrim dhe prezantim', 'Njohuri e medias dixhitale'],
    tags: ['Gazetari', 'Media', 'Lajme', 'TV']
  }));
  allJobs.push(makeJob(digitalb, {
    title: 'Kameraman', category: 'Tjetër', city: 'Tiranë', seniority: 'junior',
    salaryMin: 600, salaryMax: 900,
    description: 'Pozicion për Kameraman profesionist. Xhirime në studio dhe në terren për programet e DigitalB.',
    requirements: ['Përvojë me kamera profesionale', 'Njohuri e ndriçimit dhe kompozicionit', 'Gatishmëri për udhetim', 'Patent shofer'],
    tags: ['Kamera', 'Xhirim', 'TV', 'Video']
  }));
  allJobs.push(makeJob(digitalb, {
    title: 'Montazhier Video', category: 'Dizajn', city: 'Tiranë', seniority: 'mid',
    salaryMin: 900, salaryMax: 1300,
    description: 'DigitalB kërkon Montazhier Video me përvojë. Post-produksion i programeve televizive, dokumentarëve dhe përmbajtjes dixhitale.',
    requirements: ['3+ vjet përvojë në montazh video', 'Njohuri të avancuara të Premiere Pro, After Effects', 'Sens i fortë vizual dhe ritmik', 'Aftësi për punë nën afate të ngushta'],
    tags: ['Montazh', 'Video', 'TV', 'Post-produksion']
  }));

  // ── VODAFONE ALBANIA ──
  const vodafone = empMap['Vodafone Albania'];
  allJobs.push(makeJob(vodafone, {
    title: 'Specialist Shitjesh B2B', category: 'Shitje', city: 'Shkodër', seniority: 'mid',
    salaryMin: 900, salaryMax: 1400,
    description: 'Vodafone Albania kërkon Specialist Shitjesh B2B për rajonin e Shkodrës. Fokus në shitjen e zgjidhjeve telekomunikuese për bizneset.',
    requirements: ['2+ vjet përvojë në shitje B2B', 'Njohuri të produkteve telekomunikuese', 'Aftësi negociuese', 'Patent shofer'],
    tags: ['Shitje', 'B2B', 'Telekomunikacion', 'Biznes']
  }));
  allJobs.push(makeJob(vodafone, {
    title: 'Zhvillues Software', category: 'Teknologji', city: 'Tiranë', seniority: 'mid',
    salaryMin: 1200, salaryMax: 1800,
    description: 'Pozicion për Zhvillues Software në departamentin e IT. Zhvillim i aplikacioneve të brendshme dhe integrimi i sistemeve.',
    requirements: ['Diplomë në Informatikë', '3+ vjet përvojë në zhvillim software', 'Njohuri të Java, Python ose Node.js', 'Përvojë me API-të RESTful'],
    tags: ['Software', 'Java', 'Python', 'API', 'Backend']
  }));

  // ── DIGITAL FUTURE ALBANIA ──
  const digitalFuture = empMap['Digital Future Albania'];
  allJobs.push(makeJob(digitalFuture, {
    title: 'SEO Specialist', category: 'Marketing', city: 'Online/Remote', seniority: 'mid',
    salaryMin: 800, salaryMax: 1200, remote: true,
    description: 'Digital Future Albania kërkon SEO Specialist për punë remote. Optimizimi i faqeve web të klientëve për motorët e kërkimit.',
    requirements: ['2+ vjet përvojë në SEO', 'Njohuri të Google Analytics, Search Console', 'Përvojë me mjetet SEO (Ahrefs, SEMrush)', 'Aftësi analitike'],
    tags: ['SEO', 'Marketing', 'Google', 'Analytics', 'Remote']
  }));

  // ── RAIFFEISEN BANK ──
  const raiffeisen = empMap['Raiffeisen Bank Albania'];
  allJobs.push(makeJob(raiffeisen, {
    title: 'Specialist Menaxhimit të Rrezikut', category: 'Financë', city: 'Tiranë', seniority: 'senior',
    salaryMin: 1500, salaryMax: 2200, tier: 'premium',
    description: 'Raiffeisen Bank kërkon Specialist të Menaxhimit të Rrezikut. Roli përfshin identifikimin, vlerësimin dhe monitorimin e rreziqeve financiare.',
    requirements: ['Diplomë Master në Financë', 'Certifikim FRM ose ekuivalent', '5+ vjet përvojë në menaxhimin e rrezikut bankar', 'Njohuri të regullave Basel'],
    tags: ['Rrezik', 'Financë', 'Bankë', 'FRM', 'Basel']
  }));
  allJobs.push(makeJob(raiffeisen, {
    title: 'Programues Software Bankar', category: 'Teknologji', city: 'Tiranë', seniority: 'mid',
    salaryMin: 1200, salaryMax: 1800,
    description: 'Pozicion për Programues Software në departamentin IT. Zhvillim dhe mirëmbajtje e sistemeve bankare core, integrime me sisteme pagesash.',
    requirements: ['Diplomë në Informatikë', '3+ vjet përvojë në zhvillim software', 'Njohuri të Java ose C#', 'Përvojë me database SQL'],
    tags: ['Software', 'Java', 'Bankë', 'SQL', 'Core Banking']
  }));

  // ── TECH INNOVATIONS AL ──
  const techInnovations = empMap['Tech Innovations AL'];
  allJobs.push(makeJob(techInnovations, {
    title: 'Mobile Developer (React Native)', category: 'Teknologji', city: 'Tiranë', seniority: 'mid',
    salaryMin: 1200, salaryMax: 1800,
    description: 'Tech Innovations AL kërkon Mobile Developer me njohuri të React Native. Zhvillim i aplikacioneve mobile cross-platform për klientët tanë.',
    requirements: ['2+ vjet përvojë me React Native', 'Njohuri të JavaScript/TypeScript', 'Përvojë me REST APIs', 'Publikim në App Store/Google Play'],
    tags: ['React Native', 'Mobile', 'JavaScript', 'TypeScript', 'iOS', 'Android']
  }));
  allJobs.push(makeJob(techInnovations, {
    title: 'Specialist Sigurie Kibernetike', category: 'Teknologji', city: 'Online/Remote', seniority: 'senior',
    salaryMin: 1800, salaryMax: 2500, tier: 'premium', remote: true,
    description: 'Pozicion për Specialist të Sigurisë Kibernetike. Përgjegjësi për vlerësimin e sigurisë, testimin e penetrimit dhe implementimin e masave mbrojtëse.',
    requirements: ['5+ vjet përvojë në siguri kibernetike', 'Certifikime CISSP, CEH ose ekuivalent', 'Njohuri të rrjeteve dhe sistemeve operative', 'Përvojë me mjete pentesting'],
    tags: ['Siguri', 'Cybersecurity', 'Pentesting', 'CISSP', 'Remote']
  }));

  // ── SPITALI AMERIKAN (NEW - Shëndetësi) ──
  const spitali = newEmployerIds['Spitali Amerikan'];
  allJobs.push(makeJob(spitali, {
    title: 'Mjek/e e Përgjithshme', category: 'Shëndetësi', city: 'Tiranë', seniority: 'mid',
    salaryMin: 1500, salaryMax: 2500, tier: 'premium',
    description: 'Spitali Amerikan kërkon Mjek të Përgjithshëm për departamentin e konsultave. Ofrojmë ambient pune profesional me teknologji të avancuar mjekësore.',
    requirements: ['Diplomë në Mjekësi të Përgjithshme', 'Licencë aktive mjekësore', '3+ vjet përvojë klinike', 'Njohuri e gjuhës angleze'],
    tags: ['Mjekësi', 'Shëndetësi', 'Klinikë', 'Doktor'],
    benefits: ['Pagë shumë konkurruese', 'Sigurim shëndetësor premium', 'Trajnime ndërkombëtare', 'Orar i strukturuar']
  }));
  allJobs.push(makeJob(spitali, {
    title: 'Infermier/e', category: 'Shëndetësi', city: 'Tiranë', seniority: 'junior',
    salaryMin: 600, salaryMax: 1000,
    description: 'Kërkohet Infermier/e e licensuar për departamente të ndryshme. Kujdes i vazhdueshëm ndaj pacientëve, administrim i barnave dhe bashkëpunim me ekipin mjekësor.',
    requirements: ['Diplomë në Infermieri', 'Licencë aktive', 'Aftësi për punë nën presion', 'Kujdes dhe empati ndaj pacientëve'],
    tags: ['Infermieri', 'Shëndetësi', 'Kujdes', 'Pacient']
  }));
  allJobs.push(makeJob(spitali, {
    title: 'Farmacist/e', category: 'Shëndetësi', city: 'Tiranë', seniority: 'mid',
    salaryMin: 900, salaryMax: 1400,
    description: 'Spitali Amerikan kërkon Farmacist/e për farmacinë e spitalit. Menaxhim i barnave, këshillim farmaceutik dhe kontroll cilësie.',
    requirements: ['Diplomë Master në Farmaci', 'Licencë aktive farmacisti', '2+ vjet përvojë', 'Njohuri të farmakologjisë klinike'],
    tags: ['Farmaci', 'Barnë', 'Shëndetësi', 'Klinike']
  }));
  allJobs.push(makeJob(spitali, {
    title: 'Teknik Laboratori', category: 'Shëndetësi', city: 'Tiranë', seniority: 'junior',
    salaryMin: 600, salaryMax: 900,
    description: 'Pozicion për Teknik Laboratori në laboratorin klinik. Kryerja e analizave laboratorike dhe mirëmbajtja e pajisjeve.',
    requirements: ['Diplomë në Shkenca Laboratorike ose Biologji', 'Njohuri e teknikave laboratorike', 'Vëmendje ndaj detajeve', 'Aftësi për punë me pajisje laboratorike'],
    tags: ['Laborator', 'Analizë', 'Shëndetësi', 'Diagnostikë']
  }));
  allJobs.push(makeJob(spitali, {
    title: 'Administrator Spitali', category: 'Shëndetësi', city: 'Tiranë', seniority: 'senior',
    salaryMin: 1800, salaryMax: 2500,
    description: 'Kërkohet Administrator Spitali me përvojë për menaxhimin e operacioneve administrative. Koordinim me departamentet klinike, menaxhim buxheti dhe procese akreditimi.',
    requirements: ['Diplomë Master në Menaxhim Shëndetësor ose MBA', '5+ vjet përvojë në administrim shëndetësor', 'Njohuri të regullave shëndetësore', 'Aftësi udhëheqëse'],
    tags: ['Administrim', 'Spital', 'Menaxhim', 'Shëndetësi']
  }));
  allJobs.push(makeJob(spitali, {
    title: 'Inxhinier Biomjekësor', category: 'Inxhinieri', city: 'Tiranë', seniority: 'mid',
    salaryMin: 1200, salaryMax: 1700,
    description: 'Pozicion për Inxhinier Biomjekësor. Menaxhimi dhe mirëmbajtja e pajisjeve mjekësore, kalibrimi dhe certifikimi i aparaturave.',
    requirements: ['Diplomë në Inxhinieri Biomjekësore', '2+ vjet përvojë', 'Njohuri të pajisjeve mjekësore', 'Aftësi diagnostikuese teknike'],
    tags: ['Biomjekësor', 'Inxhinieri', 'Pajisje mjekësore', 'Mirëmbajtje']
  }));

  // ── UNIVERSITETI I TIRANËS (NEW - Arsim) ──
  const unitir = newEmployerIds['Universiteti i Tiranës'];
  allJobs.push(makeJob(unitir, {
    title: 'Profesor/e Informatike', category: 'Arsim', city: 'Tiranë', seniority: 'senior',
    salaryMin: 1200, salaryMax: 1800,
    description: 'Universiteti i Tiranës kërkon Profesor Informatike për Fakultetin e Shkencave të Natyrës. Mësimdhënie, kërkim shkencor dhe mentorimi i studentëve.',
    requirements: ['Doktoraturë në Informatikë ose fushë të ngjashme', 'Publikime shkencore', 'Përvojë mësimdhënieje', 'Njohuri e gjuhës angleze'],
    tags: ['Arsim', 'Informatikë', 'Kërkim', 'Universitet']
  }));
  allJobs.push(makeJob(unitir, {
    title: 'Lektor/e Ekonomiku', category: 'Arsim', city: 'Tiranë', seniority: 'mid',
    salaryMin: 800, salaryMax: 1200,
    description: 'Pozicion për Lektor në Fakultetin e Ekonomisë. Mësimdhënie e lëndëve të makroekonomisë dhe mikroekonomisë, si dhe udhëzim i temave të diplomës.',
    requirements: ['Diplomë Master ose Doktoraturë në Ekonomi', 'Përvojë mësimdhënieje', 'Njohuri të ekonometrisë', 'Publikime akademike të preferueshme'],
    tags: ['Arsim', 'Ekonomi', 'Lektor', 'Universitet']
  }));
  allJobs.push(makeJob(unitir, {
    title: 'Administrator Akademik', category: 'Arsim', city: 'Tiranë', seniority: 'mid',
    salaryMin: 700, salaryMax: 1000,
    description: 'Kërkohet Administrator Akademik për Rektoratin. Menaxhimi i proceseve administrative, koordinimi i programeve akademike dhe mbështetja e dekanateve.',
    requirements: ['Diplomë universitare', '2+ vjet përvojë administrative', 'Njohuri të sistemeve universitare', 'Aftësi organizative të shkëlqyera'],
    tags: ['Administrim', 'Universitet', 'Akademik']
  }));
  allJobs.push(makeJob(unitir, {
    title: 'Bibliotekar/e', category: 'Arsim', city: 'Tiranë', seniority: 'junior',
    salaryMin: 500, salaryMax: 700,
    description: 'Pozicion për Bibliotekar/e në Bibliotekën Qendrore Universitare. Menaxhimi i koleksionit, shërbimi ndaj studentëve dhe digjitalizimi i materialeve.',
    requirements: ['Diplomë në Bibliotekonomi ose Shkenca Informacioni', 'Njohuri të sistemeve bibliotekonore', 'Pasion për librat dhe arsimin', 'Aftësi kompjuterike'],
    tags: ['Bibliotekë', 'Arsim', 'Informacion', 'Digjitalizim']
  }));
  allJobs.push(makeJob(unitir, {
    title: 'Kërkues Shkencor', category: 'Arsim', city: 'Tiranë', seniority: 'senior',
    salaryMin: 1000, salaryMax: 1600,
    description: 'Universiteti i Tiranës kërkon Kërkues Shkencor për projekte kërkimore kombëtare dhe ndërkombëtare. Mundësi për bashkëpunim me universitete europiane.',
    requirements: ['Doktoraturë', 'Track record publikimesh', 'Përvojë me projekte kërkimore', 'Anglisht e rrjedhshme'],
    tags: ['Kërkim', 'Shkencë', 'Arsim', 'Projekt'],
    benefits: ['Pagë konkurruese', 'Financim për konferenca', 'Akses në laboratorë', 'Fleksibilitet orarit']
  }));

  // ── ALBTRANSPORT (NEW - Transport) ──
  const albtransport = newEmployerIds['ALBtransport'];
  allJobs.push(makeJob(albtransport, {
    title: 'Shofer Autobusi', category: 'Transport', city: 'Durrës', seniority: 'junior',
    salaryMin: 500, salaryMax: 800,
    description: 'ALBtransport kërkon Shofer Autobusi për linjën Durrës-Tiranë. Orari me turne, mjet i kompanisë.',
    requirements: ['Patent shofer kategoria D', '2+ vjet përvojë si shofer', 'Rekord i pastër drejtimi', 'Shërbim i mirë ndaj pasagjerëve'],
    tags: ['Shofer', 'Autobus', 'Transport', 'Pasagjer']
  }));
  allJobs.push(makeJob(albtransport, {
    title: 'Dispeçer Transporti', category: 'Transport', city: 'Tiranë', seniority: 'mid',
    salaryMin: 700, salaryMax: 1000,
    description: 'Pozicion për Dispeçer Transporti në selinë qendrore. Koordinimi i flotës, planifikimi i rutave dhe komunikimi me shoferët.',
    requirements: ['Njohuri të logjistikës së transportit', 'Aftësi organizative', 'Njohuri të softwareve GPS/fleet management', 'Aftësi për pune nën presion'],
    tags: ['Dispeçer', 'Transport', 'Logjistikë', 'Flotë']
  }));
  allJobs.push(makeJob(albtransport, {
    title: 'Mekanik Automjetesh', category: 'Transport', city: 'Elbasan', seniority: 'mid',
    salaryMin: 700, salaryMax: 1000,
    description: 'Kërkohet Mekanik Automjetesh me përvojë për servisin e flotës. Diagnostikim, riparim dhe mirëmbajtje parandaluese.',
    requirements: ['Certifikim profesional mekanik', '3+ vjet përvojë me automjete të rënda', 'Njohuri e diagnostikimit elektronik', 'Aftësi teknike'],
    tags: ['Mekanik', 'Automjet', 'Riparim', 'Servis']
  }));
  allJobs.push(makeJob(albtransport, {
    title: 'Menaxher Logjistike', category: 'Transport', city: 'Tiranë', seniority: 'senior',
    salaryMin: 1200, salaryMax: 1800, tier: 'premium',
    description: 'ALBtransport kërkon Menaxher Logjistike me përvojë. Planifikimi strategjik i operacioneve, optimizimi i kostove dhe menaxhimi i partnerëve.',
    requirements: ['Diplomë në Logjistikë, Menaxhim ose Ekonomi', '5+ vjet përvojë në logjistikë', 'Njohuri të zinxhirit të furnizimit', 'Aftësi udhëheqëse'],
    tags: ['Logjistikë', 'Menaxhim', 'Transport', 'Strategji']
  }));
  allJobs.push(makeJob(albtransport, {
    title: 'Operator Magazinimi', category: 'Transport', city: 'Pogradec', seniority: 'junior',
    salaryMin: 400, salaryMax: 600,
    description: 'Pozicion për Operator Magazinimi në depon e Pogradecit. Pranim mallrash, organizimi i stokut dhe përgatitja e dërgesave.',
    requirements: ['Arsim i mesëm', 'Aftësi fizike', 'Vëmendje ndaj detajeve', 'Gatishmëri për pune fizike'],
    tags: ['Magazinë', 'Logjistikë', 'Stok', 'Depo']
  }));

  // ── ALBTELEKOM (Inxhinieri) ──
  allJobs.push(makeJob(albtelekom, {
    title: 'Inxhinier Telekomunikacioni', category: 'Inxhinieri', city: 'Tiranë', seniority: 'mid',
    salaryMin: 1100, salaryMax: 1600,
    description: 'Albtelekom kërkon Inxhinier Telekomunikacioni për projektimin dhe optimizimin e rrjetit telekomunikues kombëtar.',
    requirements: ['Diplomë në Inxhinieri Telekomunikacioni', '3+ vjet përvojë profesionale', 'Njohuri të teknologjive 4G/5G', 'Certifikime profesionale të preferueshme'],
    tags: ['Inxhinieri', 'Telekomunikacion', '5G', '4G', 'Rrjet']
  }));

  // ── VODAFONE (Inxhinieri) ──
  allJobs.push(makeJob(vodafone, {
    title: 'Inxhinier Sistemesh', category: 'Inxhinieri', city: 'Vlorë', seniority: 'senior',
    salaryMin: 1500, salaryMax: 2200,
    description: 'Vodafone Albania kërkon Inxhinier Sistemesh për rajonin e Vlorës. Menaxhimi dhe optimizimi i infrastrukturës teknike të rrjetit celular.',
    requirements: ['Diplomë në Inxhinieri Elektronike ose Telekomunikacion', '5+ vjet përvojë', 'Certifikime Cisco ose Huawei', 'Gatishmëri për udhetim'],
    tags: ['Inxhinieri', 'Sisteme', 'Telekomunikacion', 'Infrastrukturë']
  }));

  // ── EXTRA: Burime Njerëzore from Vodafone ──
  allJobs.push(makeJob(vodafone, {
    title: 'Specialist Rekrutimi', category: 'Burime Njerëzore', city: 'Tiranë', seniority: 'mid',
    salaryMin: 900, salaryMax: 1300,
    description: 'Vodafone Albania kërkon Specialist Rekrutimi për departamentin e HR. Menaxhimi i procesit të rekrutimit nga fillimi deri në onboarding.',
    requirements: ['Diplomë në Menaxhim ose Psikologji', '2+ vjet përvojë në rekrutim', 'Njohuri të platformave të rekrutimit', 'Aftësi komunikimi të shkëlqyera'],
    tags: ['HR', 'Rekrutim', 'Burime Njerëzore', 'Onboarding']
  }));

  // Now create all jobs using Mongoose (for slug generation)
  let createdCount = 0;
  let failedCount = 0;
  for (const jobData of allJobs) {
    try {
      const job = new Job(jobData);
      await job.save();
      createdCount++;
    } catch (err) {
      failedCount++;
      log('JOBS', `FAILED: ${jobData.title} - ${err.message}`);
    }
  }

  log('JOBS', `=== Phase 4 complete: ${createdCount} jobs created, ${failedCount} failed ===\n`);
  return createdCount;
}

// ─────────────────────────────────────────────
// PHASE 5: CREATE JOBSEEKERS
// ─────────────────────────────────────────────

async function phase5_createJobseekers() {
  log('SEEKERS', '=== Phase 5: Creating jobseeker profiles ===');

  const fullProfiles = [
    {
      email: 'arjola.muca@gmail.com', password: 'ArjolaMuca2026!',
      firstName: 'Arjola', lastName: 'Muça', phone: '+355691234501',
      city: 'Tiranë',
      title: 'Specialiste Marketingu Dixhital',
      bio: 'Specialiste e marketingut dixhital me 4 vjet përvojë në menaxhimin e fushatave online. E fokusuar në SEO, SEM dhe marketing me përmbajtje. Kam punuar me marka vendase dhe ndërkombëtare.',
      experience: '2-5 vjet',
      skills: ['Marketing Dixhital', 'SEO', 'Google Ads', 'Social Media Marketing', 'Copywriting', 'Google Analytics', 'Content Marketing'],
      openToRemote: true,
      availability: '2weeks',
      desiredSalary: { min: 900, max: 1400, currency: 'EUR' },
      jobAlerts: true,
      alertCategories: ['Marketing'],
      workHistory: [
        { company: 'Agjencia Kreative XYZ', position: 'Social Media Specialist', location: 'Tiranë', startDate: new Date('2022-06-01'), endDate: new Date('2024-12-01'), description: 'Menaxhimi i llogarive sociale për 15+ klientë, rritje e ndjekësve mesatarisht 40%.' },
        { company: 'StartUp Albania', position: 'Marketing Intern', location: 'Tiranë', startDate: new Date('2022-01-01'), endDate: new Date('2022-05-31'), description: 'Asistencë në krijimin e përmbajtjes dhe raportimin e performancës.' }
      ],
      education: [
        { degree: 'Bachelor', fieldOfStudy: 'Marketing', institution: 'Universiteti i Tiranës', year: 2022 }
      ]
    },
    {
      email: 'besnik.topi@outlook.com', password: 'BesnikTopi2026!',
      firstName: 'Besnik', lastName: 'Topi', phone: '+355691234502',
      city: 'Durrës',
      title: 'Inxhinier Ndërtimi',
      bio: 'Inxhinier ndërtimi me 8 vjet përvojë në projekte infrastrukturore dhe rezidenciale. Specializuar në menaxhimin e kantiereve dhe projektimin struktural.',
      experience: '5-10 vjet',
      skills: ['AutoCAD', 'SAP2000', 'Project Management', 'Ndërtim', 'Menaxhim Kantieri', 'Beton', 'Strukturë'],
      openToRemote: false,
      availability: '1month',
      desiredSalary: { min: 1200, max: 1800, currency: 'EUR' },
      jobAlerts: true,
      alertCategories: ['Ndërtim', 'Inxhinieri'],
      workHistory: [
        { company: 'Kastrati Construction', position: 'Inxhinier Kantieri', location: 'Tiranë', startDate: new Date('2020-01-01'), isCurrentJob: true, description: 'Mbikëqyrje e projekteve ndërtimore me buxhet deri 2M EUR.' },
        { company: 'Ndërtim Albania SH.P.K.', position: 'Inxhinier Junior', location: 'Durrës', startDate: new Date('2016-06-01'), endDate: new Date('2019-12-31'), description: 'Projektim dhe supervizion i ndërtimeve civile.' }
      ],
      education: [
        { degree: 'Master', fieldOfStudy: 'Inxhinieri Ndërtimi', institution: 'Universiteti Politeknik i Tiranës', year: 2016 }
      ]
    },
    {
      email: 'dorina.leka@yahoo.com', password: 'DorinaLeka2026!',
      firstName: 'Dorina', lastName: 'Leka', phone: '+355691234503',
      city: 'Vlorë',
      title: 'Infermiere e Licensuar',
      bio: 'Infermiere me 3 vjet përvojë në kujdesin e pacientëve në departamentin e kirurgjisë. E përkushtuar ndaj ofrimit të kujdesit cilësor dhe empatik.',
      experience: '2-5 vjet',
      skills: ['Kujdes Shëndetësor', 'Emergjencë Mjekësore', 'Administrim Barnash', 'Komunikim me Pacientë', 'Terapia Infuzive'],
      openToRemote: false,
      availability: 'immediately',
      desiredSalary: { min: 700, max: 1100, currency: 'EUR' },
      jobAlerts: true,
      alertCategories: ['Shëndetësi'],
      workHistory: [
        { company: 'Spitali Rajonal Vlorë', position: 'Infermiere', location: 'Vlorë', startDate: new Date('2021-09-01'), isCurrentJob: true, description: 'Kujdes i pacientëve në departamentin kirurgjik, administrim i barnave dhe monitorim i shenjave vitale.' }
      ],
      education: [
        { degree: 'Bachelor', fieldOfStudy: 'Infermieri', institution: 'Universiteti i Vlorës', year: 2021 }
      ]
    },
    {
      email: 'erion.basha@proton.me', password: 'ErionBasha2026!',
      firstName: 'Erion', lastName: 'Basha', phone: '+355691234504',
      city: 'Tiranë',
      title: 'Full Stack Developer',
      bio: 'Full Stack Developer me pasion për teknologjinë. Përvojë me React, Node.js, Python dhe MongoDB. Kontributor aktiv në projekte open-source. Gjithmonë duke mësuar teknologji të reja.',
      experience: '2-5 vjet',
      skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'MongoDB', 'PostgreSQL', 'Docker', 'Git', 'REST API'],
      openToRemote: true,
      availability: '2weeks',
      desiredSalary: { min: 1200, max: 2000, currency: 'EUR' },
      jobAlerts: true,
      alertCategories: ['Teknologji'],
      workHistory: [
        { company: 'Tech Innovations AL', position: 'Full Stack Developer', location: 'Tiranë', startDate: new Date('2023-01-01'), isCurrentJob: true, description: 'Zhvillim i aplikacioneve web me React dhe Node.js. Menaxhim i bazave të të dhënave MongoDB.' },
        { company: 'Freelance', position: 'Web Developer', location: 'Online', startDate: new Date('2021-06-01'), endDate: new Date('2022-12-31'), description: 'Zhvillim i faqeve web për klientë të ndryshëm duke përdorur React, Next.js dhe Python/Django.' }
      ],
      education: [
        { degree: 'Bachelor', fieldOfStudy: 'Informatikë', institution: 'Universiteti i Tiranës', year: 2021 }
      ]
    },
    {
      email: 'fjolla.krasniqi@hotmail.com', password: 'FjollaKr2026!',
      firstName: 'Fjolla', lastName: 'Krasniqi', phone: '+355691234505',
      city: 'Shkodër',
      title: 'Mësuese Gjuhe Angleze',
      bio: 'Mësuese e gjuhës angleze me përvojë në arsimin parauniversitar. E certifikuar CELTA, me pasion për metodat inovative të mësimdhënies.',
      experience: '1-2 vjet',
      skills: ['Anglisht', 'Pedagogji', 'Mësimdhënie', 'CELTA', 'Komunikim', 'Planifikim Mësimor'],
      openToRemote: true,
      availability: 'immediately',
      desiredSalary: { min: 600, max: 900, currency: 'EUR' },
      jobAlerts: true,
      alertCategories: ['Arsim'],
      workHistory: [
        { company: 'Shkolla Private Universi', position: 'Mësuese Anglisht', location: 'Shkodër', startDate: new Date('2023-09-01'), isCurrentJob: true, description: 'Mësimdhënie e gjuhës angleze për klasat 6-12.' }
      ],
      education: [
        { degree: 'Master', fieldOfStudy: 'Gjuhë Angleze dhe Letërsi', institution: 'Universiteti i Shkodrës', year: 2023 }
      ]
    },
    {
      email: 'genti.hoxha@email.al', password: 'GentiHoxha2026!',
      firstName: 'Genti', lastName: 'Hoxha', phone: '+355691234506',
      city: 'Tiranë',
      title: 'Menaxher Financiar',
      bio: 'Menaxher financiar me 12+ vjet përvojë në sektorin bankar dhe korporativ. Specializuar në planifikim financiar, auditim të brendshëm dhe menaxhimin e rrezikut.',
      experience: '10+ vjet',
      skills: ['Financë', 'Kontabilitet', 'Excel', 'Auditim', 'Buxhetim', 'Analiza Financiare', 'IFRS', 'SAP'],
      openToRemote: false,
      availability: '1month',
      desiredSalary: { min: 2000, max: 3500, currency: 'EUR' },
      jobAlerts: true,
      alertCategories: ['Financë', 'Menaxhim'],
      workHistory: [
        { company: 'Raiffeisen Bank Albania', position: 'Menaxher Departamenti Financiar', location: 'Tiranë', startDate: new Date('2019-01-01'), isCurrentJob: true, description: 'Drejtimi i departamentit financiar, raportim tek bordi, menaxhim buxheti 50M+ EUR.' },
        { company: 'Deloitte Albania', position: 'Auditues Senior', location: 'Tiranë', startDate: new Date('2014-01-01'), endDate: new Date('2018-12-31'), description: 'Auditim financiar për kompani kryesore shqiptare.' }
      ],
      education: [
        { degree: 'Master', fieldOfStudy: 'Financë dhe Kontabilitet', institution: 'Universiteti i Tiranës', year: 2013 },
        { degree: 'Bachelor', fieldOfStudy: 'Ekonomi', institution: 'Universiteti i Tiranës', year: 2011 }
      ]
    }
  ];

  const partialProfiles = [
    {
      email: 'hana.dervishi@gmail.com', password: 'HanaDerv2026!',
      firstName: 'Hana', lastName: 'Dervishi', phone: '+355691234507',
      city: 'Elbasan',
      title: 'Dizajnere Grafike',
      bio: null,
      experience: '1-2 vjet',
      skills: ['Photoshop', 'Illustrator', 'Figma', 'InDesign'],
      openToRemote: true,
      availability: 'immediately',
      desiredSalary: null,
      jobAlerts: true,
      alertCategories: ['Dizajn']
    },
    {
      email: 'ilir.mehmeti@hotmail.com', password: 'IlirMehm2026!',
      firstName: 'Ilir', lastName: 'Mehmeti', phone: '+355691234508',
      city: 'Fier',
      title: null,
      bio: null,
      experience: '0-1 vjet',
      skills: [],
      openToRemote: false,
      availability: 'immediately',
      desiredSalary: null,
      jobAlerts: false,
      alertCategories: []
    },
    {
      email: 'jonida.shkurti@gmail.com', password: 'JonidaSh2026!',
      firstName: 'Jonida', lastName: 'Shkurti', phone: null,
      city: 'Tiranë',
      title: 'Social Media Manager',
      bio: 'E apasionuar pas medias sociale dhe krijimit të përmbajtjes vizuale. Kërkoj mundësinë e parë profesionale.',
      experience: '0-1 vjet',
      skills: ['Instagram', 'TikTok', 'Canva'],
      openToRemote: true,
      availability: '2weeks',
      desiredSalary: { min: 500, max: 800, currency: 'EUR' },
      jobAlerts: true,
      alertCategories: ['Marketing', 'Dizajn']
    },
    {
      email: 'klajdi.hysa@yahoo.com', password: 'KlajdiHy2026!',
      firstName: 'Klajdi', lastName: 'Hysa', phone: '+355691234510',
      city: 'Korçë',
      title: 'Elektricist',
      bio: null,
      experience: '5-10 vjet',
      skills: ['Instalime Elektrike', 'Sisteme Sigurie', 'Panele Diellore', 'PLC'],
      openToRemote: false,
      availability: 'immediately',
      desiredSalary: { min: 700, max: 1100, currency: 'EUR' },
      jobAlerts: true,
      alertCategories: ['Ndërtim', 'Inxhinieri']
    },
    {
      email: 'lorena.cela@outlook.com', password: 'LorenaCe2026!',
      firstName: 'Lorena', lastName: 'Çela', phone: '+355691234511',
      city: 'Gjirokastër',
      title: 'Recepsioniste',
      bio: 'Recepsioniste me përvojë në industrinë e hotelerisë. Flas anglisht dhe italisht rrjedhshëm.',
      experience: '1-2 vjet',
      skills: [],
      openToRemote: false,
      availability: 'immediately',
      desiredSalary: null,
      jobAlerts: true,
      alertCategories: ['Turizëm']
    }
  ];

  const minimalProfiles = [
    { email: 'marjus.duka@gmail.com', password: 'MarjusDu2026!', firstName: 'Marjus', lastName: 'Duka', city: 'Tiranë' },
    { email: 'nora.selimi@hotmail.com', password: 'NoraSelim2026!', firstName: 'Nora', lastName: 'Selimi', city: 'Berat' },
    { email: 'olsi.tafaj@gmail.com', password: 'OlsiTafaj2026!', firstName: 'Olsi', lastName: 'Tafaj', city: 'Durrës' },
    { email: 'pjetra.vokshi@outlook.com', password: 'PjetraVo2026!', firstName: 'Pjetra', lastName: 'Vokshi', city: 'Lushnjë' },
    { email: 'qendrim.salihu@yahoo.com', password: 'QendrimSa2026!', firstName: 'Qëndrim', lastName: 'Salihu', city: 'Pogradec' }
  ];

  let created = 0;

  // Full profiles
  for (const p of fullProfiles) {
    const user = new User({
      email: p.email, password: p.password, userType: 'jobseeker', status: 'active', emailVerified: true,
      profile: {
        firstName: p.firstName, lastName: p.lastName, phone: p.phone,
        location: { city: p.city, region: REGIONS[p.city] },
        jobSeekerProfile: {
          title: p.title, bio: p.bio, experience: p.experience, skills: p.skills,
          openToRemote: p.openToRemote, availability: p.availability,
          ...(p.desiredSalary && { desiredSalary: p.desiredSalary }),
          notifications: { jobAlerts: p.jobAlerts, alertCategories: p.alertCategories || [] },
          workHistory: (p.workHistory || []).map((w, i) => ({ id: `wh-${i}`, ...w, createdAt: new Date() })),
          education: (p.education || []).map((e, i) => ({ id: `ed-${i}`, ...e, createdAt: new Date() }))
        }
      }
    });
    try {
      await user.save();
      created++;
      log('SEEKERS', `Created FULL: ${p.firstName} ${p.lastName} (${p.city})`);
    } catch (err) {
      log('SEEKERS', `FAILED: ${p.email} - ${err.message}`);
    }
  }

  // Partial profiles
  for (const p of partialProfiles) {
    const jsp = {
      openToRemote: p.openToRemote || false,
      availability: p.availability || 'immediately',
      notifications: { jobAlerts: p.jobAlerts || false, alertCategories: p.alertCategories || [] }
    };
    if (p.title) jsp.title = p.title;
    if (p.bio) jsp.bio = p.bio;
    if (p.experience) jsp.experience = p.experience;
    if (p.skills && p.skills.length) jsp.skills = p.skills;
    if (p.desiredSalary) jsp.desiredSalary = p.desiredSalary;

    const user = new User({
      email: p.email, password: p.password, userType: 'jobseeker', status: 'active', emailVerified: true,
      profile: {
        firstName: p.firstName, lastName: p.lastName,
        ...(p.phone && { phone: p.phone }),
        location: { city: p.city, region: REGIONS[p.city] },
        jobSeekerProfile: jsp
      }
    });
    try {
      await user.save();
      created++;
      log('SEEKERS', `Created PARTIAL: ${p.firstName} ${p.lastName} (${p.city})`);
    } catch (err) {
      log('SEEKERS', `FAILED: ${p.email} - ${err.message}`);
    }
  }

  // Minimal profiles
  for (const p of minimalProfiles) {
    const user = new User({
      email: p.email, password: p.password, userType: 'jobseeker', status: 'active', emailVerified: true,
      profile: {
        firstName: p.firstName, lastName: p.lastName,
        location: { city: p.city, region: REGIONS[p.city] },
        jobSeekerProfile: {
          openToRemote: false,
          availability: 'immediately',
          notifications: { jobAlerts: false, alertCategories: [] }
        }
      }
    });
    try {
      await user.save();
      created++;
      log('SEEKERS', `Created MINIMAL: ${p.firstName} ${p.lastName} (${p.city})`);
    } catch (err) {
      log('SEEKERS', `FAILED: ${p.email} - ${err.message}`);
    }
  }

  log('SEEKERS', `=== Phase 5 complete: ${created} jobseekers created ===\n`);
}

// ─────────────────────────────────────────────
// PHASE 6: QUEUE EMBEDDINGS
// ─────────────────────────────────────────────

async function phase6_queueEmbeddings() {
  log('EMBED', '=== Phase 6: Queueing embeddings for all data ===');
  const db = mongoose.connection.db;

  // Queue all active jobs that don't have completed embeddings
  const jobsToEmbed = await db.collection('jobs').find({
    isDeleted: { $ne: true },
    status: 'active',
    $or: [
      { 'embedding.status': { $ne: 'completed' } },
      { 'embedding.status': { $exists: false } }
    ]
  }).project({ _id: 1 }).toArray();

  let queued = 0;
  for (const j of jobsToEmbed) {
    try {
      await jobEmbeddingService.queueEmbeddingGeneration(j._id, 10);
      queued++;
    } catch (err) {
      // Already queued or other issue
    }
  }
  log('EMBED', `Queued ${queued} jobs for embedding generation`);

  // Also queue re-computation of similarities for ALL jobs (since we cleaned test data)
  const allActiveJobs = await db.collection('jobs').find({
    isDeleted: { $ne: true },
    status: 'active',
    'embedding.status': 'completed'
  }).project({ _id: 1 }).toArray();

  let simQueued = 0;
  for (const j of allActiveJobs) {
    try {
      await jobEmbeddingService.queueSimilarityComputation(j._id, 20); // Lower priority
      simQueued++;
    } catch (err) {
      // Already queued
    }
  }
  log('EMBED', `Queued ${simQueued} jobs for similarity re-computation`);

  log('EMBED', `=== Phase 6 complete ===\n`);
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  DATABASE ENRICHMENT SCRIPT');
  console.log('═'.repeat(60) + '\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // BEFORE counts
  const before = await countAll();
  console.log('── BEFORE ──');
  console.log(`  Employers: ${before.employers}`);
  console.log(`  Jobseekers: ${before.jobseekers}`);
  console.log(`  Active Jobs: ${before.activeJobs}`);
  console.log(`  Total Jobs: ${before.totalJobs}`);
  console.log(`  Applications: ${before.applications}`);
  console.log(`  Queue Items: ${before.queue}`);
  console.log(`  Notifications: ${before.notifications}`);
  console.log('');

  // Execute phases
  await phase1_cleanup();
  await phase2_fixEmployers();
  const newEmployerIds = await phase3_newEmployers();
  await phase4_createJobs(newEmployerIds);
  await phase5_createJobseekers();
  await phase6_queueEmbeddings();

  // Recount location job counts
  log('FINAL', 'Recounting location job counts...');
  await Job.recountLocationJobs();
  log('FINAL', 'Location counts updated');

  // AFTER counts
  const after = await countAll();
  console.log('\n── AFTER ──');
  console.log(`  Employers: ${after.employers} (was ${before.employers}, delta: ${after.employers - before.employers})`);
  console.log(`  Jobseekers: ${after.jobseekers} (was ${before.jobseekers}, delta: ${after.jobseekers - before.jobseekers})`);
  console.log(`  Active Jobs: ${after.activeJobs} (was ${before.activeJobs}, delta: ${after.activeJobs - before.activeJobs})`);
  console.log(`  Total Jobs: ${after.totalJobs} (was ${before.totalJobs}, delta: ${after.totalJobs - before.totalJobs})`);
  console.log(`  Applications: ${after.applications} (preserved: ${before.applications === after.applications ? 'YES' : 'NO!!!'})`);
  console.log(`  Queue Items: ${after.queue}`);
  console.log(`  Notifications: ${after.notifications}`);

  // Category breakdown
  const db = mongoose.connection.db;
  console.log('\n── JOBS BY CATEGORY ──');
  const cats = await db.collection('jobs').aggregate([
    { $match: { isDeleted: { $ne: true }, status: 'active' } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  for (const c of cats) console.log(`  ${c._id}: ${c.count}`);

  console.log('\n── JOBS BY CITY ──');
  const cities = await db.collection('jobs').aggregate([
    { $match: { isDeleted: { $ne: true }, status: 'active' } },
    { $group: { _id: '$location.city', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  for (const c of cities) console.log(`  ${c._id}: ${c.count}`);

  console.log('\n' + '═'.repeat(60));
  console.log('  ENRICHMENT COMPLETE');
  console.log('═'.repeat(60) + '\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
