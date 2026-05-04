/**
 * User Factory
 *
 * Generates test users for all user types
 */

import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';
import User from '../../src/models/User.js';

/**
 * Albanian cities for realistic test data
 */
const albanianCities = [
  'Tiranë', 'Durrës', 'Vlorë', 'Shkodër', 'Elbasan',
  'Korçë', 'Fier', 'Berat', 'Gjirokastër', 'Lushnjë'
];

/**
 * Generate random Albanian phone number
 */
function randomAlbanianPhone() {
  const prefix = faker.helpers.arrayElement(['69', '68', '67', '66']);
  const number = faker.string.numeric(7);
  return `+355${prefix}${number}`;
}

/**
 * Get random Albanian city
 */
function randomAlbanianCity() {
  return faker.helpers.arrayElement(albanianCities);
}

/**
 * Create Jobseeker User
 *
 * NOTE: We pass the plain password and rely on User.js's pre-save hook to
 * hash it. Earlier the factory bcrypt-hashed it before saving — the hook
 * then ran on top, double-hashing and breaking login.
 */
export async function createJobseeker(overrides = {}) {
  const password = overrides.password || 'password123';

  const city = overrides.city || randomAlbanianCity();
  const user = await User.create({
    email: overrides.email || faker.internet.email().toLowerCase(),
    password,
    userType: 'jobseeker',
    profile: {
      firstName: overrides.firstName || faker.person.firstName(),
      lastName: overrides.lastName || faker.person.lastName(),
      phone: overrides.phone || randomAlbanianPhone(),
      location: {
        city: city,
        region: city // Simplified - in real app, regions are mapped
      },
      jobSeekerProfile: {
        title: faker.person.jobTitle(),
        bio: faker.lorem.paragraph(),
        skills: overrides.skills || ['JavaScript', 'React', 'Node.js', 'MongoDB'],
        experience: faker.helpers.arrayElement(['0-1 vjet', '1-2 vjet', '2-5 vjet', '5-10 vjet', '10+ vjet']),
        desiredSalary: {
          min: 800,
          max: 1500,
          currency: 'EUR'
        },
        openToRemote: faker.datatype.boolean(),
        availability: faker.helpers.arrayElement(['immediately', '2weeks', '1month', '3months']),
        education: [
          {
            degree: 'Bachelor in Computer Science',
            school: 'University of Tirana',
            graduationYear: 2020
          }
        ],
        workHistory: [
          {
            company: faker.company.name(),
            position: faker.person.jobTitle(),
            startDate: new Date(2020, 0, 1),
            endDate: new Date(2023, 0, 1),
            description: faker.lorem.paragraph(),
            currentlyWorking: false
          }
        ]
      }
    },
    status: 'active',
    verified: true,
    ...overrides
  });

  return { user, plainPassword: password };
}

/**
 * Create Employer User
 */
export async function createEmployer(overrides = {}) {
  const password = overrides.password || 'password123';

  const city = overrides.city || randomAlbanianCity();
  const isVerified = overrides.verified !== undefined ? overrides.verified : true;
  const user = await User.create({
    email: overrides.email || faker.internet.email().toLowerCase(),
    password,
    userType: 'employer',
    profile: {
      firstName: overrides.firstName || faker.person.firstName(),
      lastName: overrides.lastName || faker.person.lastName(),
      phone: overrides.phone || randomAlbanianPhone(),
      location: {
        city: city,
        region: city
      },
      employerProfile: {
        companyName: overrides.companyName || faker.company.name(),
        industry: faker.helpers.arrayElement([
          'Teknologji', 'Marketing', 'Financë', 'Shëndetësi',
          'Arsim', 'Ndërtim', 'Turizëm'
        ]),
        companySize: faker.helpers.arrayElement(['1-10', '11-50', '51-200', '201-500', '501+']),
        description: faker.company.catchPhrase(),
        website: faker.internet.url(),
        logo: null,
        verified: isVerified,
        verificationStatus: isVerified ? 'approved' : 'pending',
        verificationDate: isVerified ? new Date() : undefined
      }
    },
    status: 'active',
    verified: isVerified,
    freePostingEnabled: overrides.freePostingEnabled || false,
    candidateMatchingEnabled: overrides.candidateMatchingEnabled || false,
    ...overrides
  });

  return { user, plainPassword: password };
}

/**
 * Create Admin User
 */
export async function createAdmin(overrides = {}) {
  const password = overrides.password || 'admin123';

  const user = await User.create({
    email: overrides.email || `admin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@advance.al`,
    password,
    userType: 'admin',
    profile: {
      firstName: overrides.firstName || 'Admin',
      lastName: overrides.lastName || 'User',
      phone: randomAlbanianPhone(),
      location: { city: 'Tiranë', region: 'Tiranë' }
    },
    status: 'active',
    verified: true,
    ...overrides
  });

  return { user, plainPassword: password };
}

/**
 * Create multiple jobseekers at once
 */
export async function createJobseekers(count = 5, overrides = {}) {
  const users = [];

  for (let i = 0; i < count; i++) {
    const result = await createJobseeker(overrides);
    users.push(result);
  }

  return users;
}

/**
 * Create multiple employers at once
 */
export async function createEmployers(count = 3, overrides = {}) {
  const users = [];

  for (let i = 0; i < count; i++) {
    const result = await createEmployer(overrides);
    users.push(result);
  }

  return users;
}

/**
 * Create a verified employer (most common test case)
 */
export async function createVerifiedEmployer(overrides = {}) {
  return createEmployer({ verified: true, status: 'active', ...overrides });
}

/**
 * Create an unverified employer (for testing verification flow)
 */
export async function createUnverifiedEmployer(overrides = {}) {
  return createEmployer({
    verified: false,
    status: 'pending_verification',
    ...overrides
  });
}

/**
 * Create a suspended user (for testing suspension)
 */
export async function createSuspendedUser(userType = 'jobseeker', overrides = {}) {
  const createFn = userType === 'employer' ? createEmployer : createJobseeker;

  return createFn({
    status: 'suspended',
    suspensionDetails: {
      reason: 'Testing suspension',
      suspendedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      suspendedBy: null
    },
    ...overrides
  });
}

/**
 * Create a banned user (for testing ban)
 */
export async function createBannedUser(userType = 'jobseeker', overrides = {}) {
  const createFn = userType === 'employer' ? createEmployer : createJobseeker;

  return createFn({
    status: 'banned',
    suspensionDetails: {
      reason: 'Testing ban',
      suspendedAt: new Date(),
      expiresAt: null, // Permanent ban
      suspendedBy: null
    },
    ...overrides
  });
}

export default {
  createJobseeker,
  createEmployer,
  createAdmin,
  createJobseekers,
  createEmployers,
  createVerifiedEmployer,
  createUnverifiedEmployer,
  createSuspendedUser,
  createBannedUser,
};
