/**
 * Response serializers (QA Round 2 — API data-exposure hardening).
 *
 * Single source of truth for *what leaves the building* on public read
 * endpoints. DB documents are mapped through these before `res.json`, so
 * internal fields never ride along: embedding vectors, similarity caches
 * (`similarJobs` / `similarityMetadata`), notification fan-out state,
 * payment internals (`paymentId` / `paymentStatus` / `paidAt`), admin
 * moderation flags, `__v`, etc.
 *
 * The allowlists below mirror the `Job` / employer shapes the frontend
 * actually consumes (frontend/src/lib/api.ts). The companion test
 * `tests/integration/api-exposure.test.js` fails CI if anything denylisted
 * ever appears in a public response.
 */

// --- Employer -------------------------------------------------------------

/**
 * An employer as seen embedded in a public job.
 * Company-level info is public; the contact details and the contact
 * person's name are exposed ONLY to authenticated viewers.
 *
 * @param {object} employer  populated employer User document/lean object
 * @param {{ viewer?: object }} opts  `viewer` = req.user (truthy if logged in)
 */
export function publicEmployer(employer, { viewer } = {}) {
  if (!employer || typeof employer !== 'object') return employer ?? null;
  const emp = employer.profile?.employerProfile || {};
  const loc = employer.profile?.location || {};

  const out = {
    _id: employer._id,
    profile: {
      location: { city: loc.city, region: loc.region },
      employerProfile: {
        companyName: emp.companyName,
        logo: emp.logo,
        description: emp.description,
        website: emp.website,
      },
    },
  };

  if (viewer) {
    out.profile.employerProfile.phone = emp.phone;
    out.profile.employerProfile.whatsapp = emp.whatsapp;
    out.profile.firstName = employer.profile?.firstName;
    out.profile.lastName = employer.profile?.lastName;
  }
  return out;
}

// --- Job ------------------------------------------------------------------

// Internal fields that must never appear on a public job payload. A
// denylist (rather than an allowlist) is used so that adding a legitimate
// public field to the Job schema doesn't silently break the frontend; the
// companion api-exposure.test.js guards the leak side.
const OMIT_JOB_FIELDS = new Set([
  'embedding', 'similarJobs', 'similarityMetadata', 'notification',
  'pricing', 'paymentRequired', 'paymentStatus', 'paymentId', 'paidAt',
  'paymentMethod', 'paymentInitiatedAt', 'paymentReminderSentAt',
  'paymentReminderLevel', 'paymentTimeoutAlertedAt',
  'isDeleted', 'adminApproved', 'rejectionReason', '__v',
]);

/**
 * Serialize a job for a public read endpoint.
 * @param {object} job  job document/lean object
 * @param {{ viewer?: object }} opts  `viewer` = req.user (truthy if logged in)
 */
export function publicJob(job, { viewer } = {}) {
  if (!job || typeof job !== 'object') return job ?? null;

  const out = {};
  for (const [key, value] of Object.entries(job)) {
    if (OMIT_JOB_FIELDS.has(key)) continue;
    out[key] = value;
  }

  // contactOverrides holds per-job phone/whatsapp/email — same rule as
  // employer contact: authenticated viewers only.
  if (!viewer) delete out.contactOverrides;

  // Respect the employer's "don't show salary" choice — drop the numbers
  // entirely rather than shipping them in the JSON for the UI to hide.
  if (out.salary && out.salary.showPublic === false) {
    out.salary = {
      currency: out.salary.currency,
      negotiable: out.salary.negotiable,
      showPublic: false,
    };
  }

  // employerId is either a populated object or a bare ObjectId.
  if (job.employerId && typeof job.employerId === 'object' && job.employerId.profile) {
    out.employerId = publicEmployer(job.employerId, { viewer });
  }
  return out;
}

// --- Jobseeker public profile --------------------------------------------

/**
 * The curated jobseeker profile an employer sees — professional data only,
 * never email / phone / auth fields.
 */
export function publicJobseekerProfile(user) {
  if (!user) return null;
  const js = user.profile?.jobSeekerProfile || {};
  return {
    id: user._id,
    profile: {
      firstName: user.profile?.firstName,
      lastName: user.profile?.lastName,
      location: user.profile?.location,
      jobSeekerProfile: {
        title: js.title,
        bio: js.bio,
        experience: js.experience,
        skills: js.skills,
        education: js.education,
        workHistory: js.workHistory,
        profilePhoto: js.profilePhoto,
        cvFile: js.cvFile,
        availability: js.availability,
        openToRemote: js.openToRemote,
      },
    },
    memberSince: user.createdAt,
  };
}
