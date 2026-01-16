/**
 * Job Factory
 *
 * Generates test jobs with realistic data
 */

import { faker } from '@faker-js/faker';
import Job from '../../src/models/Job.js';

/**
 * Job categories in Albanian
 */
const jobCategories = [
  'Teknologji', 'Marketing', 'Shitje', 'Financë',
  'Burime Njerëzore', 'Inxhinieri', 'Dizajn',
  'Menaxhim', 'Shëndetësi', 'Arsim', 'Turizëm',
  'Ndërtim', 'Transport', 'Tjetër'
];

/**
 * Albanian cities
 */
const albanianCities = [
  'Tiranë', 'Durrës', 'Vlorë', 'Shkodër', 'Elbasan',
  'Korçë', 'Fier', 'Berat', 'Gjirokastër', 'Lushnjë'
];

/**
 * Job types
 */
const jobTypes = ['full-time', 'part-time', 'contract', 'internship'];

/**
 * Seniority levels
 */
const seniorityLevels = ['junior', 'mid', 'senior', 'lead'];

/**
 * Generate unique slug
 */
function generateSlug(title) {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim();

  return `${baseSlug}-${Date.now()}-${faker.string.alphanumeric(5)}`;
}

/**
 * Create a basic job
 */
export async function createJob(employer, overrides = {}) {
  const city = overrides.city || faker.helpers.arrayElement(albanianCities);

  const job = await Job.create({
    employerId: employer._id,
    title: overrides.title || faker.person.jobTitle(),
    description: overrides.description || faker.lorem.paragraphs(3),
    requirements: overrides.requirements || [
      'Bachelor degree or equivalent experience',
      '2+ years of relevant experience',
      'Strong communication skills',
      'Ability to work in a team'
    ],
    benefits: overrides.benefits || [
      'Health insurance',
      'Flexible working hours',
      'Professional development opportunities',
      'Competitive salary'
    ],
    location: {
      city: city,
      region: city, // Simplified
      remote: overrides.remote || false,
      remoteType: overrides.remoteType || 'none'
    },
    jobType: overrides.jobType || faker.helpers.arrayElement(jobTypes),
    category: overrides.category || faker.helpers.arrayElement(jobCategories),
    seniority: overrides.seniority || faker.helpers.arrayElement(seniorityLevels),
    salary: overrides.salary !== undefined ? overrides.salary : {
      min: faker.number.int({ min: 600, max: 1000 }),
      max: faker.number.int({ min: 1000, max: 2000 }),
      currency: 'EUR',
      negotiable: true,
      showPublic: true
    },
    platformCategories: overrides.platformCategories !== undefined ? overrides.platformCategories : {
      diaspora: false,
      ngaShtepia: false,
      partTime: false,
      administrata: false,
      sezonale: false
    },
    tags: overrides.tags || [
      faker.helpers.arrayElement(['javascript', 'python', 'java', 'react', 'nodejs']),
      faker.helpers.arrayElement(['frontend', 'backend', 'fullstack']),
      faker.helpers.arrayElement(['remote', 'hybrid', 'onsite'])
    ],
    status: overrides.status || 'active',
    tier: overrides.tier || 'basic',
    slug: generateSlug(overrides.title || faker.person.jobTitle()),
    pricing: overrides.pricing || {
      basePrice: 50,
      finalPrice: 50,
      appliedRules: [],
      discount: 0,
      priceIncrease: 0,
      campaignApplied: null
    },
    paymentRequired: overrides.paymentRequired || 0,
    paymentStatus: overrides.paymentStatus || 'paid',
    customQuestions: overrides.customQuestions || [],
    ...overrides
  });

  return job;
}

/**
 * Create a premium job
 */
export async function createPremiumJob(employer, overrides = {}) {
  return createJob(employer, {
    tier: 'premium',
    ...overrides
  });
}

/**
 * Create a job pending payment
 */
export async function createJobPendingPayment(employer, overrides = {}) {
  return createJob(employer, {
    status: 'pending_payment',
    paymentRequired: 50,
    paymentStatus: 'pending',
    ...overrides
  });
}

/**
 * Create a remote job
 */
export async function createRemoteJob(employer, overrides = {}) {
  return createJob(employer, {
    location: {
      city: 'Tiranë',
      region: 'Tiranë',
      remote: true,
      remoteType: 'full'
    },
    platformCategories: {
      diaspora: false,
      ngaShtepia: true,
      partTime: false,
      administrata: false,
      sezonale: false
    },
    ...overrides
  });
}

/**
 * Create a diaspora job
 */
export async function createDiasporaJob(employer, overrides = {}) {
  return createJob(employer, {
    location: {
      city: 'London',
      region: 'UK',
      remote: false,
      remoteType: 'none'
    },
    platformCategories: {
      diaspora: true,
      ngaShtepia: false,
      partTime: false,
      administrata: false,
      sezonale: false
    },
    ...overrides
  });
}

/**
 * Create a part-time job
 */
export async function createPartTimeJob(employer, overrides = {}) {
  return createJob(employer, {
    jobType: 'part-time',
    platformCategories: {
      diaspora: false,
      ngaShtepia: false,
      partTime: true,
      administrata: false,
      sezonale: false
    },
    ...overrides
  });
}

/**
 * Create a seasonal job
 */
export async function createSeasonalJob(employer, overrides = {}) {
  return createJob(employer, {
    platformCategories: {
      diaspora: false,
      ngaShtepia: false,
      partTime: false,
      administrata: false,
      sezonale: true
    },
    ...overrides
  });
}

/**
 * Create an expired job
 */
export async function createExpiredJob(employer, overrides = {}) {
  return createJob(employer, {
    status: 'expired',
    expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday
    ...overrides
  });
}

/**
 * Create a paused job
 */
export async function createPausedJob(employer, overrides = {}) {
  return createJob(employer, {
    status: 'paused',
    ...overrides
  });
}

/**
 * Create a closed job
 */
export async function createClosedJob(employer, overrides = {}) {
  return createJob(employer, {
    status: 'closed',
    ...overrides
  });
}

/**
 * Create multiple jobs at once
 */
export async function createJobs(employer, count = 5, overrides = {}) {
  const jobs = [];

  for (let i = 0; i < count; i++) {
    const job = await createJob(employer, {
      title: `Test Job ${i + 1}`,
      ...overrides
    });
    jobs.push(job);
  }

  return jobs;
}

/**
 * Create jobs with custom questions
 */
export async function createJobWithCustomQuestions(employer, overrides = {}) {
  return createJob(employer, {
    customQuestions: [
      {
        question: 'Why do you want to work for our company?',
        required: true,
        type: 'text'
      },
      {
        question: 'What is your expected salary?',
        required: false,
        type: 'text'
      },
      {
        question: 'Upload your portfolio (optional)',
        required: false,
        type: 'file'
      }
    ],
    ...overrides
  });
}

/**
 * Create a job in a specific category
 */
export async function createJobInCategory(employer, category, overrides = {}) {
  if (!jobCategories.includes(category)) {
    throw new Error(`Invalid category: ${category}. Must be one of: ${jobCategories.join(', ')}`);
  }

  return createJob(employer, {
    category,
    ...overrides
  });
}

/**
 * Create a job in a specific city
 */
export async function createJobInCity(employer, city, overrides = {}) {
  return createJob(employer, {
    location: {
      city,
      region: city,
      remote: false,
      remoteType: 'none'
    },
    ...overrides
  });
}

export default {
  createJob,
  createPremiumJob,
  createJobPendingPayment,
  createRemoteJob,
  createDiasporaJob,
  createPartTimeJob,
  createSeasonalJob,
  createExpiredJob,
  createPausedJob,
  createClosedJob,
  createJobs,
  createJobWithCustomQuestions,
  createJobInCategory,
  createJobInCity,
};
