/**
 * Seed a realistic Albanian-language test dataset for the embedding harness.
 *
 * Writes to a SEPARATE database in the same Atlas cluster (advance-al-harness).
 * Production data (advance-al) is never touched.
 *
 * Stages (run in order; each can be skipped via flag):
 *   1. employers   — seed ~30 verified employer accounts
 *   2. jobs        — generate ~500 jobs across 14 categories via gpt-4o-mini
 *   3. users       — generate ~100 jobseeker profiles via gpt-4o-mini
 *   4. apps        — for each user, an LLM picks 3-8 jobs to apply to
 *   5. embeddings  — generate via existing jobEmbeddingService / userEmbeddingService
 *
 * Usage:
 *   node scripts/seed-harness-dataset.js                   # full run
 *   node scripts/seed-harness-dataset.js --wipe            # drop collections first
 *   node scripts/seed-harness-dataset.js --skip-jobs       # skip a stage
 *   node scripts/seed-harness-dataset.js --jobs-target 200 # smaller dataset
 *   node scripts/seed-harness-dataset.js --users-target 50
 *
 * Cost: ~$1 (gpt-4o-mini) + ~$0.02 (embeddings) for the recommended scope.
 * Time: 30-60 min depending on OpenAI rate limits.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import OpenAI from 'openai';
import bcrypt from 'bcryptjs';
import pLimit from 'p-limit';
import User from '../src/models/User.js';
import Job from '../src/models/Job.js';
import Application from '../src/models/Application.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';
import userEmbeddingService from '../src/services/userEmbeddingService.js';

const HARNESS_DB = 'advance-al-harness';
const OPENAI_MODEL = 'gpt-4o-mini';
const SHARED_PASSWORD = 'HarnessUser123!'; // for all seed users; harness DB only

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const limit = pLimit(6);

// ──────────────────────────────────────────────────────────────────────────
// Reference data (real Albanian cities, names, companies)
// ──────────────────────────────────────────────────────────────────────────

const CITIES = [
  ['Tiranë', 50], ['Durrës', 10], ['Vlorë', 5], ['Elbasan', 5], ['Shkodër', 5],
  ['Fier', 4], ['Korçë', 3], ['Berat', 3], ['Lushnjë', 2], ['Sarandë', 2],
  ['Pogradec', 2], ['Kavajë', 2], ['Lezhë', 2], ['Gjirokastër', 2], ['Kukës', 1],
  ['Krujë', 1], ['Burrel', 1],
];

const FIRST_NAMES_M = ['Arber','Besnik','Dritan','Edmond','Fitim','Gent','Hektor','Ilir','Jetmir','Kreshnik','Luan','Mendurim','Nikolin','Olsi','Petrit','Ramiz','Saimir','Taulant','Ulvi','Valon','Zef','Adrian','Alban','Andi','Arian','Artan','Bashkim','Donat','Endrit','Erald','Fatos','Florent','Gentian','Granit','Klodian','Leart','Marigon','Mirgen','Patrik','Renato','Sokol','Valdrin','Xhuljano','Ylli','Eldion','Marin','Erion','Klevis','Bledar','Driton'];
const FIRST_NAMES_F = ['Albana','Anila','Blerta','Drita','Ela','Elona','Erjola','Etleva','Flutura','Genta','Holta','Ina','Jora','Kristina','Lira','Lulieta','Mariana','Mirela','Nora','Orela','Pranvera','Rita','Saranda','Suela','Teuta','Valbona','Yllka','Zana','Adelina','Aida','Alma','Anjeza','Ardita','Arta','Besa','Brunilda','Dafina','Edona','Elsa','Era','Gentiana','Hana','Iliana','Jonida','Megi','Olta','Romina','Vjosa','Zhaneta','Eriona'];
const LAST_NAMES = ['Ahmeti','Bardhi','Berisha','Bojaxhiu','Çela','Çekrezi','Demaj','Dervishi','Dushaj','Elezi','Gjoka','Gjoni','Halili','Hoxha','Hysaj','Ibrahimi','Jashari','Kadiu','Kastrati','Kelmendi','Krasniqi','Kruja','Lekaj','Leka','Lleshi','Malaj','Marku','Memaj','Murati','Musaj','Nika','Nuredini','Osmani','Paloka','Pllumbi','Prifti','Qose','Rama','Rexhepi','Sefa','Selimi','Shehu','Spahiu','Tafaj','Vata','Xhepa','Ymeri','Zeneli','Zogu','Llakaj'];

// Real Albanian / Albania-operating companies grouped by category, used to
// ground the LLM in actual market context.
const COMPANIES_BY_CATEGORY = {
  'Teknologji':       ['Cacttus Albania','InfoSoft Group','Intech+','Aktiv Tech','BetMomentum','Albanian Software','iSON','Ulysses Tech','Cardo AI','Digit Studio','Aria Group'],
  'Marketing':        ['Lindeza Group','BB Sales','MullenLowe Albania','Karrota','Boom Marketing','Bonus.com.al','Albtelecom Marketing'],
  'Shitje':           ['Neptun','Spar Albania','Conad Albania','Big Market','Mega Markets','Vodafone Albania','One Albania','MRP Albania','Decathlon Albania'],
  'Financë':          ['Raiffeisen Bank Albania','BKT (Banka Kombëtare Tregtare)','OTP Bank Albania','ProCredit Bank','Credins Bank','Intesa Sanpaolo Bank Albania','Tirana Bank','American Bank of Investments','Union Bank','Alpha Bank Albania'],
  'Burime Njerëzore': ['Manpower Albania','Adecco','BB Solutions','Talents Tirana','HR Pulse'],
  'Inxhinieri':       ['Bechtel-Enka','Salillari','Kastrati Group','Albcontrol','OST (Operatori i Sistemit të Transmetimit)','Albanian Energy Corporation','Trans Adriatic Pipeline'],
  'Dizajn':           ['Karrota','Lindeza Group','Studio Visualife','Design Hub Tirana','Kreativ Studio'],
  'Menaxhim':         ['BALFIN Group','Kastrati Group','Albchrome','Albpetrol','MAPO Group'],
  'Shëndetësi':       ['Spitali Amerikan','Spitali Hygeia Tirana','Salus Hospital','Spitali Memorial','Klinika Mjekësore Continental','QSUT Nënë Tereza','Mjekësia Familjare'],
  'Arsim':            ['Universiteti i Tiranës','Universiteti Politeknik i Tiranës','Universiteti Epoka','Universiteti New York Tirana','Western Balkans University','Mbikëqyrësi Arsimor','Kolegji Mesdhetar','Polis University'],
  'Turizëm':          ['Plaza Hotel Tirana','Maritim Hotel Plaza','Sheraton Tirana','Hotel Mondial','Vlora Center','Adriatik Hotel','Brilant Antik Hotel','Rogner Hotel'],
  'Ndërtim':          ['Salillari','Kastrati Construction','Trema Engineering','Albanian Construction','Edil-Al','Gener 2','Concord Investment'],
  'Transport':        ['Albcontrol','Tirana International Airport','Hekurudha Shqiptare','Albcontainer','DHL Albania','GLS Albania','Posta Shqiptare'],
  'Tjetër':           ['Albcontrol','Albpetrol','Albchrome','Posta Shqiptare','RTSh'],
};

// Category context to ground the LLM
const CATEGORY_CONTEXT = {
  'Teknologji':       'Software development, IT consulting, fintech, banking-IT, e-commerce. Common roles: Software Engineer (Zhvillues Software), Web Developer, Mobile Developer, DevOps, QA, Data Engineer. Tech stack: JavaScript, Python, Java, .NET, AWS/Azure, Docker. Many jobs are at IT outsourcing firms serving EU clients.',
  'Marketing':        'Digital marketing, SEO, content, social media. Roles: Specialist Marketingu Dixhital, Social Media Manager, SEO Specialist, Brand Manager. Tools: Google Ads, Meta Ads, Canva, HubSpot, Mailchimp.',
  'Shitje':           'Retail, B2B sales, account management. Roles: Shitës/e, Menaxher Dyqani, Përfaqësues Shitjesh, Account Manager. Sectors: telecom, FMCG, electronics, automotive.',
  'Financë':          'Banking is the largest employer in this category in Albania. Roles: Specialist Bankar, Specialist Operacionesh, Analist Krediti, Auditues, Kontabilist, Menaxher Dege, Analist Financiar. Strong demand for ACCA/CFA holders.',
  'Burime Njerëzore': 'HR generalist roles, recruiters, talent specialists. Roles: Specialist Burimesh Njerëzore, Rekrutues, Menaxher HR. SMEs and corporates.',
  'Inxhinieri':       'Civil engineering, electrical, mechanical, telecommunications. Roles: Inxhinier Ndërtimi, Inxhinier Elektrik, Inxhinier Mekanik, Inxhinier Telekomunikacioni. Big projects: TAP, KESH, Albcontrol.',
  'Dizajn':           'Graphic design, UI/UX, video editing. Roles: Dizajner Grafik, UI/UX Designer, Video Editor, Motion Designer. Tools: Adobe Suite, Figma, After Effects.',
  'Menaxhim':         'Operations, project management, general management. Roles: Menaxher Projektesh, Menaxher Operacionesh, Drejtor Departamenti.',
  'Shëndetësi':       'Doctors, nurses, pharmacists, lab technicians. Roles: Mjek/e, Infermier/e, Farmacist/e, Teknik Laboratori, Stomatologi, Fizioterapist.',
  'Arsim':            'Teachers, professors, tutors, academic admin. Roles: Mësues/e, Profesor/e, Lektor/e, Edukator/e Parashkollor, Asistent Akademik.',
  'Turizëm':          'Hotels, restaurants, travel agencies. Roles: Recepsionist/e, Menaxher Hoteli, Kuzhinier/e, Kamarier/e, Guide Turistike, Animator.',
  'Ndërtim':          'Construction workers, foremen, project leads, electricians, plumbers. Roles: Punëtor Ndërtimi, Kryepunëtor, Elektricist, Hidraulik, Topograf.',
  'Transport':        'Drivers, logistics, warehouse, supply chain. Roles: Shofer Kamioni, Magazinier, Specialist Logjistike, Operator Transportesh, Koordinator Magazinash.',
  'Tjetër':           'Misc: legal, security, public sector, media. Roles: Avokat, Specialist Sigurie, Gazetar, Operator Kamere, Truprojë.',
};

// Job count per category (sums to ~500)
const JOB_DISTRIBUTION = {
  'Shitje': 70, 'Financë': 60, 'Teknologji': 55, 'Shëndetësi': 45, 'Ndërtim': 45,
  'Transport': 40, 'Turizëm': 35, 'Inxhinieri': 35, 'Arsim': 30, 'Marketing': 30,
  'Burime Njerëzore': 20, 'Dizajn': 20, 'Menaxhim': 10, 'Tjetër': 5,
};

// User count per category (sums to ~100)
const USER_DISTRIBUTION = {
  'Shitje': 12, 'Financë': 12, 'Teknologji': 14, 'Shëndetësi': 8, 'Ndërtim': 7,
  'Transport': 6, 'Turizëm': 7, 'Inxhinieri': 7, 'Arsim': 7, 'Marketing': 8,
  'Burime Njerëzore': 4, 'Dizajn': 5, 'Menaxhim': 2, 'Tjetër': 1,
};

const SENIORITY_DIST = [['junior', 0.30], ['mid', 0.45], ['senior', 0.20], ['lead', 0.05]];
const EXPERIENCE_BY_SENIORITY = { junior: ['0-1 vjet','1-2 vjet'], mid: ['2-5 vjet'], senior: ['5-10 vjet'], lead: ['10+ vjet'] };
const JOBTYPE_DIST = [['full-time', 0.85], ['part-time', 0.10], ['internship', 0.05]];

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function pickWeighted(items) {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of items) {
    if ((r -= w) <= 0) return v;
  }
  return items[items.length - 1][0];
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function salaryFor(seniority, currency) {
  const ranges = {
    junior: [400, 800], mid: [800, 1500], senior: [1500, 3000], lead: [2500, 5000],
  };
  const [lo, hi] = ranges[seniority] || ranges.mid;
  const min = lo + Math.floor(Math.random() * (hi - lo) * 0.4);
  const max = min + Math.floor(Math.random() * (hi - min) + 100);
  if (currency === 'ALL') return { min: min * 100, max: max * 100, currency };
  return { min, max, currency };
}

async function callLLMJSON(systemPrompt, userPrompt, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
      });
      return JSON.parse(resp.choices[0].message.content);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Stage 1 — employers
// ──────────────────────────────────────────────────────────────────────────

async function seedEmployers(opts) {
  const existing = await User.countDocuments({ userType: 'employer' });
  if (existing > 0 && !opts.wipe) {
    console.log(`  ${existing} employers exist; skipping.`);
    return;
  }
  const all = Object.entries(COMPANIES_BY_CATEGORY).flatMap(([cat, cs]) => cs.map(c => ({ company: c, industry: cat })));
  const password = await bcrypt.hash(SHARED_PASSWORD, 12);
  let created = 0;
  for (const { company, industry } of all) {
    const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const email = `${slug}@harness.test`;
    if (await User.findOne({ email })) continue;
    try {
      await User.create({
        email, password, userType: 'employer', status: 'active', isVerified: true, isDeleted: false,
        profile: {
          firstName: 'HR', lastName: 'Department',
          location: { city: 'Tiranë' },
          employerProfile: {
            companyName: company,
            companySize: pick(['11-50','51-200','201-500','501+']),
            industry,
            description: `${company} is a ${industry} employer in Albania.`,
            verified: true,
            verificationStatus: 'approved',
            verificationDate: new Date(),
          },
        },
      });
      created++;
    } catch (e) {
      console.log(`    skip ${company}: ${e.message.slice(0, 80)}`);
    }
  }
  console.log(`  Created ${created} employers (target: ${all.length})`);
}

// ──────────────────────────────────────────────────────────────────────────
// Stage 2 — jobs (gpt-4o-mini, batched)
// ──────────────────────────────────────────────────────────────────────────

async function generateJobBatch(category, count, employers) {
  const seniorities = Array.from({ length: count }, () => pickWeighted(SENIORITY_DIST));
  const cities = Array.from({ length: count }, () => pickWeighted(CITIES));
  const jobTypes = Array.from({ length: count }, () => pickWeighted(JOBTYPE_DIST));
  const companies = COMPANIES_BY_CATEGORY[category] || COMPANIES_BY_CATEGORY['Tjetër'];

  const sysPrompt = `You generate realistic Albanian-language job postings for a real Albanian job board.
Write EVERYTHING in Albanian (titles, descriptions, requirements). For tech/skill keywords, use industry-standard English terms (Python, Excel, SAP, Adobe Photoshop, etc.) where natural.
Never use generic placeholder text. Each job must feel like it could be a real posting from a real Albanian employer.
Output STRICT JSON only matching the requested schema.`;

  const userPrompt = `Category: ${category}
Industry context: ${CATEGORY_CONTEXT[category]}
Real Albanian employers in this space: ${companies.join(', ')}

Generate ${count} DIFFERENT job postings, each unique in title and content. Match the constraints below for each one.

Constraints (use exactly these for each generated job, by index):
${Array.from({ length: count }, (_, i) =>
  `  [${i}] seniority=${seniorities[i]}, city=${cities[i]}, jobType=${jobTypes[i]}`
).join('\n')}

Output JSON:
{
  "jobs": [
    {
      "title": "Albanian job title (max 80 chars)",
      "company": "pick from real companies above",
      "description": "Albanian description, 250-500 chars, specific responsibilities and context",
      "requirements": ["3-5 Albanian requirement strings, 30-150 chars each"],
      "tags": ["5-10 keyword tags, mix Albanian and English where appropriate"]
    },
    ... ${count} entries
  ]
}`;

  const result = await callLLMJSON(sysPrompt, userPrompt);
  if (!Array.isArray(result.jobs) || result.jobs.length === 0) {
    throw new Error(`bad LLM output for ${category}: missing jobs array`);
  }
  const created = [];
  for (let i = 0; i < result.jobs.length; i++) {
    const j = result.jobs[i];
    const emp = employers.find(e => e.profile?.employerProfile?.companyName === j.company)
      || pick(employers.filter(e => e.profile?.employerProfile?.industry === category))
      || pick(employers);
    const sen = seniorities[i] || 'mid';
    const city = cities[i] || 'Tiranë';
    const jt = jobTypes[i] || 'full-time';
    const currency = Math.random() < 0.7 ? 'EUR' : 'ALL';
    try {
      const job = await Job.create({
        employerId: emp._id,
        title: String(j.title || '').slice(0, 100),
        description: String(j.description || '').slice(0, 5000),
        requirements: (j.requirements || []).map(r => String(r).slice(0, 500)).slice(0, 8),
        tags: (j.tags || []).map(t => String(t).slice(0, 30)).slice(0, 12),
        location: { city, remote: false, remoteType: 'none' },
        jobType: jt,
        category,
        seniority: sen,
        salary: salaryFor(sen, currency),
        platformCategories: { diaspora: false, ngaShtepia: false, partTime: jt === 'part-time', administrata: false, sezonale: false },
        status: 'active',
        tier: Math.random() < 0.1 ? 'premium' : 'basic',
        postedAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000),
        expiresAt: new Date(Date.now() + 60 * 86400000),
        embedding: { status: 'pending' },
      });
      created.push(job);
    } catch (e) {
      console.log(`    job create err (${category}): ${e.message.slice(0, 100)}`);
    }
  }
  return created;
}

async function seedJobs(opts) {
  const existing = await Job.countDocuments({ isDeleted: false });
  if (existing > 0 && !opts.wipe) {
    console.log(`  ${existing} jobs exist; skipping (use --wipe to regen).`);
    return;
  }
  const employers = await User.find({ userType: 'employer' }).lean();
  const target = opts.jobsTarget || 500;
  const scale = target / Object.values(JOB_DISTRIBUTION).reduce((a, x) => a + x, 0);
  const targets = Object.fromEntries(Object.entries(JOB_DISTRIBUTION).map(([c, n]) => [c, Math.max(1, Math.round(n * scale))]));

  console.log(`  Target: ${Object.values(targets).reduce((a, x) => a + x, 0)} jobs across ${Object.keys(targets).length} categories`);
  let total = 0;
  const tasks = [];
  for (const [category, count] of Object.entries(targets)) {
    let remaining = count;
    while (remaining > 0) {
      const batch = Math.min(remaining, 5);
      remaining -= batch;
      tasks.push(limit(async () => {
        try {
          const created = await generateJobBatch(category, batch, employers);
          total += created.length;
          process.stdout.write(`\r  Generated ${total}/${Object.values(targets).reduce((a, x) => a + x, 0)} jobs...`);
        } catch (e) {
          console.log(`\n    batch fail (${category}): ${e.message}`);
        }
      }));
    }
  }
  await Promise.all(tasks);
  console.log(`\n  Total jobs created: ${total}`);
}

// ──────────────────────────────────────────────────────────────────────────
// Stage 3 — jobseekers (gpt-4o-mini, one at a time per category)
// ──────────────────────────────────────────────────────────────────────────

async function generateUserBatch(category, count) {
  const seniorities = Array.from({ length: count }, () => pickWeighted(SENIORITY_DIST));
  const cities = Array.from({ length: count }, () => pickWeighted(CITIES));
  const genders = Array.from({ length: count }, () => Math.random() < 0.5 ? 'm' : 'f');
  const firstNames = genders.map(g => g === 'm' ? pick(FIRST_NAMES_M) : pick(FIRST_NAMES_F));
  const lastNames = Array.from({ length: count }, () => pick(LAST_NAMES));

  const sysPrompt = `You generate realistic Albanian jobseeker profiles for an Albanian job board.
Write EVERYTHING in Albanian (titles, bio, work-history descriptions). For technical skills, use industry-standard terms (Excel, SQL, Photoshop, etc.).
Each profile must be coherent: title matches skills matches work history. Senior people have longer/more advanced histories.
Output STRICT JSON only.`;

  const userPrompt = `Category: ${category}
Industry context: ${CATEGORY_CONTEXT[category]}

Generate ${count} DIFFERENT jobseeker profiles. For each, use these constraints:
${Array.from({ length: count }, (_, i) =>
  `  [${i}] firstName=${firstNames[i]}, lastName=${lastNames[i]}, seniority=${seniorities[i]}, city=${cities[i]}`
).join('\n')}

Output JSON:
{
  "profiles": [
    {
      "title": "Albanian professional title (max 80 chars)",
      "bio": "Albanian bio, 200-400 chars, what they do and seek",
      "skills": ["5-12 skill strings, mix Albanian and English where natural"],
      "workHistory": [
        { "position": "Albanian role", "company": "company name", "yearsAgoStart": <number>, "yearsAgoEnd": <number or 0 for current>, "description": "100-200 char Albanian description" }
      ],
      "education": [
        { "degree": "e.g. Bachelor", "fieldOfStudy": "field in Albanian", "institution": "Albanian university name" }
      ],
      "desiredSalaryMin": <number EUR>,
      "desiredSalaryMax": <number EUR>,
      "openToRemote": <boolean>
    },
    ... ${count} entries
  ]
}

Number of work history entries should match seniority: junior=1-2, mid=2-3, senior=3-4, lead=3-5.`;

  const result = await callLLMJSON(sysPrompt, userPrompt);
  if (!Array.isArray(result.profiles)) throw new Error(`bad LLM output for ${category} users`);

  const password = await bcrypt.hash(SHARED_PASSWORD, 12);
  const created = [];
  for (let i = 0; i < result.profiles.length; i++) {
    const p = result.profiles[i];
    const fn = firstNames[i].toLowerCase();
    const ln = lastNames[i].toLowerCase();
    const email = `${fn}.${ln}.${Math.floor(Math.random() * 9000 + 1000)}@harness.test`;
    const sen = seniorities[i];
    const exp = pick(EXPERIENCE_BY_SENIORITY[sen] || ['2-5 vjet']);

    const workHistory = (p.workHistory || []).slice(0, 5).map(w => ({
      position: String(w.position || '').slice(0, 100),
      company: String(w.company || '').slice(0, 100),
      startDate: new Date(Date.now() - (Number(w.yearsAgoStart) || 1) * 365 * 86400000),
      endDate: w.yearsAgoEnd && Number(w.yearsAgoEnd) > 0
        ? new Date(Date.now() - Number(w.yearsAgoEnd) * 365 * 86400000)
        : null,
      isCurrentJob: !w.yearsAgoEnd || Number(w.yearsAgoEnd) === 0,
      description: String(w.description || '').slice(0, 500),
    }));
    const education = (p.education || []).slice(0, 3).map(e => ({
      degree: String(e.degree || '').slice(0, 100),
      fieldOfStudy: String(e.fieldOfStudy || '').slice(0, 100),
      institution: String(e.institution || '').slice(0, 200),
    }));

    try {
      const u = await User.create({
        email, password, userType: 'jobseeker', status: 'active', isVerified: true, isDeleted: false,
        profile: {
          firstName: firstNames[i], lastName: lastNames[i],
          location: { city: cities[i] },
          jobSeekerProfile: {
            title: String(p.title || '').slice(0, 100),
            bio: String(p.bio || '').slice(0, 1000),
            skills: (p.skills || []).map(s => String(s).slice(0, 50)).slice(0, 15),
            experience: exp,
            workHistory,
            education,
            desiredSalary: { min: Number(p.desiredSalaryMin) || 800, max: Number(p.desiredSalaryMax) || 1500, currency: 'EUR' },
            openToRemote: Boolean(p.openToRemote),
            embedding: { status: 'pending' },
          },
        },
      });
      created.push(u);
    } catch (e) {
      console.log(`    user create err (${category}): ${e.message.slice(0, 120)}`);
    }
  }
  return created;
}

async function seedUsers(opts) {
  const existing = await User.countDocuments({ userType: 'jobseeker' });
  if (existing > 0 && !opts.wipe) {
    console.log(`  ${existing} jobseekers exist; skipping.`);
    return;
  }
  const target = opts.usersTarget || 100;
  const scale = target / Object.values(USER_DISTRIBUTION).reduce((a, x) => a + x, 0);
  const targets = Object.fromEntries(Object.entries(USER_DISTRIBUTION).map(([c, n]) => [c, Math.max(1, Math.round(n * scale))]));

  console.log(`  Target: ${Object.values(targets).reduce((a, x) => a + x, 0)} jobseekers`);
  let total = 0;
  const tasks = [];
  for (const [category, count] of Object.entries(targets)) {
    let remaining = count;
    while (remaining > 0) {
      const batch = Math.min(remaining, 4);
      remaining -= batch;
      tasks.push(limit(async () => {
        try {
          const created = await generateUserBatch(category, batch);
          total += created.length;
          process.stdout.write(`\r  Generated ${total} jobseekers...`);
        } catch (e) {
          console.log(`\n    batch fail (${category} users): ${e.message}`);
        }
      }));
    }
  }
  await Promise.all(tasks);
  console.log(`\n  Total jobseekers created: ${total}`);
}

// ──────────────────────────────────────────────────────────────────────────
// Stage 4 — applications (LLM picks per user)
// ──────────────────────────────────────────────────────────────────────────

async function pickApplicationsForUser(user, candidateJobs) {
  const profile = user.profile?.jobSeekerProfile || {};
  const sysPrompt = `You are a realistic Albanian jobseeker. Given your profile and a list of available jobs (numbered), return the indices of 3-8 jobs you would actually apply to. Realistic preferences: title alignment matters most, then location, then salary. Output STRICT JSON only.`;
  const userPrompt = `MY PROFILE:
title: ${profile.title}
city: ${user.profile?.location?.city}
experience: ${profile.experience}
skills: ${(profile.skills || []).join(', ')}
desired salary: ${profile.desiredSalary?.min}-${profile.desiredSalary?.max} ${profile.desiredSalary?.currency}
bio: ${(profile.bio || '').slice(0, 300)}

AVAILABLE JOBS:
${candidateJobs.map((j, i) => `[${i}] ${j.title} (${j.category}, ${j.location?.city}, ${j.seniority}, salary ${j.salary?.min || '?'}-${j.salary?.max || '?'} ${j.salary?.currency || ''})`).join('\n')}

Output JSON:
{ "applyToIndices": [<integer>, <integer>, ...] }

Pick between 3 and 8 integer indices from the list above. Only pick jobs you'd realistically apply to given your profile.`;
  const result = await callLLMJSON(sysPrompt, userPrompt);
  const indices = Array.isArray(result.applyToIndices) ? result.applyToIndices : [];
  return indices
    .map(i => Number(i))
    .filter(i => Number.isInteger(i) && i >= 0 && i < candidateJobs.length)
    .map(i => candidateJobs[i]);
}

const ADJACENT_CATEGORIES = {
  'Teknologji': ['Inxhinieri','Dizajn','Menaxhim'],
  'Marketing':  ['Dizajn','Shitje','Menaxhim'],
  'Shitje':     ['Marketing','Menaxhim','Turizëm'],
  'Financë':    ['Menaxhim','Burime Njerëzore'],
  'Burime Njerëzore': ['Menaxhim','Arsim'],
  'Inxhinieri': ['Teknologji','Ndërtim'],
  'Dizajn':     ['Marketing','Teknologji'],
  'Menaxhim':   ['Financë','Shitje','Marketing'],
  'Shëndetësi': ['Arsim'],
  'Arsim':      ['Shëndetësi','Burime Njerëzore'],
  'Turizëm':    ['Shitje','Transport'],
  'Ndërtim':    ['Inxhinieri','Transport'],
  'Transport':  ['Ndërtim','Turizëm'],
  'Tjetër':     [],
};

function inferCat(user) { return userEmbeddingService.inferUserCategory(user); }

async function seedApplications(opts) {
  const existing = await Application.countDocuments();
  if (existing > 0 && !opts.wipe) {
    console.log(`  ${existing} applications exist; skipping.`);
    return;
  }
  const users = await User.find({ userType: 'jobseeker' }).lean();
  const jobs  = await Job.find({ isDeleted: false, status: 'active' }).lean();
  const jobsByCat = {};
  for (const j of jobs) {
    if (!jobsByCat[j.category]) jobsByCat[j.category] = [];
    jobsByCat[j.category].push(j);
  }

  let totalApps = 0;
  let llmFails = 0;
  let usersDone = 0;
  const tasks = users.map(u => limit(async () => {
    const cat = inferCat(u) || pick(Object.keys(jobsByCat));
    const adjacent = ADJACENT_CATEGORIES[cat] || [];
    const candidates = [
      ...(jobsByCat[cat] || []).slice(0, 14),
      ...adjacent.flatMap(c => (jobsByCat[c] || []).slice(0, 4)),
    ].slice(0, 25);
    usersDone++;
    if (candidates.length === 0) return;
    try {
      const picked = await pickApplicationsForUser(u, candidates);
      for (const job of picked.slice(0, 8)) {
        try {
          await Application.create({
            jobId: job._id,
            jobSeekerId: u._id,
            employerId: job.employerId,
            applicationMethod: 'one_click',
            status: pick(['pending','viewed','reviewed','shortlisted']),
            appliedAt: new Date(Date.now() - Math.floor(Math.random() * 21) * 86400000),
          });
          totalApps++;
        } catch (e) {
          if (!/duplicate key/i.test(e.message)) console.log(`\n    app create err: ${e.message.slice(0, 120)}`);
        }
      }
      process.stdout.write(`\r  Apps: ${totalApps} created (${usersDone}/${users.length} users, ${llmFails} llm fails)   `);
    } catch (e) {
      llmFails++;
      console.log(`\n    apps fail for ${u.email}: ${e.message.slice(0, 100)}`);
    }
  }));
  await Promise.all(tasks);
  console.log(`\n  Total applications created: ${totalApps} (${llmFails} LLM failures)`);
}

// ──────────────────────────────────────────────────────────────────────────
// Stage 5 — embeddings
// ──────────────────────────────────────────────────────────────────────────

async function seedEmbeddings(opts) {
  const pendingJobs = await Job.find({ 'embedding.status': { $ne: 'completed' } }).select('_id title').lean();
  console.log(`  Generating embeddings for ${pendingJobs.length} jobs...`);
  let done = 0;
  await Promise.all(pendingJobs.map(j => limit(async () => {
    try { await jobEmbeddingService.generateEmbedding(j._id); done++; }
    catch (e) { console.log(`    job embed fail ${j.title}: ${e.message.slice(0, 80)}`); }
    if (done % 25 === 0) process.stdout.write(`\r    job embeddings: ${done}/${pendingJobs.length}`);
  })));
  console.log(`\n  Job embeddings done: ${done}`);

  const pendingUsers = await User.find({
    userType: 'jobseeker',
    'profile.jobSeekerProfile.embedding.status': { $ne: 'completed' },
  }).select('_id email').lean();
  console.log(`  Generating embeddings for ${pendingUsers.length} jobseekers...`);
  let udone = 0;
  await Promise.all(pendingUsers.map(u => limit(async () => {
    try { await userEmbeddingService.generateJobSeekerEmbedding(u._id); udone++; }
    catch (e) { console.log(`    user embed fail ${u.email}: ${e.message.slice(0, 80)}`); }
    if (udone % 10 === 0) process.stdout.write(`\r    user embeddings: ${udone}/${pendingUsers.length}`);
  })));
  console.log(`\n  User embeddings done: ${udone}`);
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { wipe: false, skipEmployers: false, skipJobs: false, skipUsers: false, skipApps: false, skipEmbeddings: false, jobsTarget: 500, usersTarget: 100 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--wipe') opts.wipe = true;
    else if (a === '--skip-employers') opts.skipEmployers = true;
    else if (a === '--skip-jobs') opts.skipJobs = true;
    else if (a === '--skip-users') opts.skipUsers = true;
    else if (a === '--skip-apps') opts.skipApps = true;
    else if (a === '--skip-embeddings') opts.skipEmbeddings = true;
    else if (a === '--jobs-target') opts.jobsTarget = parseInt(args[++i], 10);
    else if (a === '--users-target') opts.usersTarget = parseInt(args[++i], 10);
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  await mongoose.connect(process.env.MONGODB_URI, { dbName: HARNESS_DB });
  console.log(`Connected to ${HARNESS_DB}\n`);

  if (opts.wipe) {
    console.log('WIPING harness DB...');
    await Promise.all([Job.deleteMany({}), User.deleteMany({}), Application.deleteMany({})]);
    console.log('  done.\n');
  }

  if (!opts.skipEmployers) { console.log('STAGE 1 — Employers'); await seedEmployers(opts); console.log(); }
  if (!opts.skipJobs)      { console.log('STAGE 2 — Jobs');      await seedJobs(opts);      console.log(); }
  if (!opts.skipUsers)     { console.log('STAGE 3 — Jobseekers'); await seedUsers(opts);     console.log(); }
  if (!opts.skipApps)      { console.log('STAGE 4 — Applications'); await seedApplications(opts); console.log(); }
  if (!opts.skipEmbeddings){ console.log('STAGE 5 — Embeddings'); await seedEmbeddings(opts); console.log(); }

  // Summary
  const counts = {
    employers: await User.countDocuments({ userType: 'employer' }),
    jobseekers: await User.countDocuments({ userType: 'jobseeker' }),
    jobs: await Job.countDocuments({ isDeleted: false, status: 'active' }),
    apps: await Application.countDocuments(),
    jobsEmbedded: await Job.countDocuments({ 'embedding.status': 'completed' }),
    usersEmbedded: await User.countDocuments({ 'profile.jobSeekerProfile.embedding.status': 'completed' }),
  };
  console.log('────────────────────────────────────────');
  console.log('SUMMARY (advance-al-harness DB):');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(15)} ${v}`);
  console.log('────────────────────────────────────────');

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error('FATAL:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
