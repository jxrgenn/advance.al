import { User, Job, CandidateMatch } from '../models/index.js';

/**
 * Candidate Matching Service
 * Implements algorithm to find best matching candidates for jobs
 */

class CandidateMatchingService {

  /**
   * Calculate match score between a candidate and a job
   * Returns object with total score (0-100) and breakdown
   */
  calculateMatchScore(candidate, job) {
    const breakdown = {
      titleMatch: this.calculateTitleMatch(candidate, job),
      skillsMatch: this.calculateSkillsMatch(candidate, job),
      experienceMatch: this.calculateExperienceMatch(candidate, job),
      locationMatch: this.calculateLocationMatch(candidate, job),
      educationMatch: this.calculateEducationMatch(candidate, job),
      salaryMatch: this.calculateSalaryMatch(candidate, job),
      availabilityMatch: this.calculateAvailabilityMatch(candidate, job)
    };

    const totalScore = Object.values(breakdown).reduce((sum, score) => sum + score, 0);

    return {
      totalScore: Math.round(totalScore * 10) / 10, // Round to 1 decimal
      breakdown
    };
  }

  /**
   * Title Match (0-20 points)
   * Check if candidate's desired position matches job title
   */
  calculateTitleMatch(candidate, job) {
    const candidateTitle = (candidate.profile?.jobSeekerProfile?.title || '').toLowerCase();
    const jobTitle = (job.title || '').toLowerCase();

    if (!candidateTitle || !jobTitle) return 0;

    // Exact match
    if (candidateTitle === jobTitle) return 20;

    // Partial match (contains keywords)
    const candidateWords = candidateTitle.split(/\s+/);
    const jobWords = jobTitle.split(/\s+/);

    let matchedWords = 0;
    candidateWords.forEach(word => {
      if (word.length > 3 && jobWords.some(jw => jw.includes(word) || word.includes(jw))) {
        matchedWords++;
      }
    });

    const matchRatio = matchedWords / Math.max(candidateWords.length, jobWords.length);
    return Math.round(matchRatio * 20);
  }

  /**
   * Skills Match (0-25 points)
   * Check overlap between candidate skills and job requirements
   */
  calculateSkillsMatch(candidate, job) {
    const candidateSkills = (candidate.profile?.jobSeekerProfile?.skills || [])
      .map(skill => skill.toLowerCase());

    const jobRequirements = (job.requirements || []).join(' ').toLowerCase();

    if (candidateSkills.length === 0 || !jobRequirements) return 0;

    // Count how many candidate skills are mentioned in job requirements
    let matchedSkills = 0;
    candidateSkills.forEach(skill => {
      if (jobRequirements.includes(skill)) {
        matchedSkills++;
      }
    });

    const matchRatio = matchedSkills / candidateSkills.length;
    return Math.round(matchRatio * 25);
  }

  /**
   * Experience Match (0-15 points)
   * Compare candidate experience level with job requirements
   */
  calculateExperienceMatch(candidate, job) {
    const candidateExp = candidate.profile?.jobSeekerProfile?.experience || '';
    const jobExp = job.experience || '';

    if (!candidateExp || !jobExp) return 0;

    // Map experience strings to numeric values
    const expMap = {
      '0-1 vjet': 0.5,
      '1-2 vjet': 1.5,
      '2-5 vjet': 3.5,
      '5-10 vjet': 7.5,
      '10+ vjet': 12
    };

    const candidateYears = expMap[candidateExp] || 0;
    const jobYears = expMap[jobExp] || 0;

    // Perfect match
    if (candidateYears === jobYears) return 15;

    // Candidate has more experience (good)
    if (candidateYears > jobYears) {
      const diff = candidateYears - jobYears;
      if (diff <= 2) return 13;
      if (diff <= 5) return 10;
      return 7; // Too overqualified might be expensive
    }

    // Candidate has less experience (acceptable if close)
    const diff = jobYears - candidateYears;
    if (diff <= 1) return 12;
    if (diff <= 2) return 8;
    if (diff <= 3) return 4;
    return 0; // Too underqualified
  }

  /**
   * Location Match (0-15 points)
   * Compare candidate location with job location
   */
  calculateLocationMatch(candidate, job) {
    const candidateCity = candidate.profile?.location?.city || '';
    const jobCity = job.location?.city || '';

    if (!candidateCity || !jobCity) return 0;

    // Same city - perfect match
    if (candidateCity.toLowerCase() === jobCity.toLowerCase()) {
      return 15;
    }

    // Check if job is remote or hybrid
    const jobType = job.jobType?.toLowerCase() || '';
    if (jobType.includes('remote') || jobType.includes('hybrid')) {
      return 12; // Good match even if different city
    }

    // Different city, not remote - less points
    return 5;
  }

  /**
   * Education Match (0-5 points)
   * Check if candidate education meets job requirements
   */
  calculateEducationMatch(candidate, job) {
    const candidateEdu = (candidate.profile?.jobSeekerProfile?.education || [])
      .map(edu => edu.degree?.toLowerCase() || '')
      .join(' ');
    const jobReq = (job.requirements || []).join(' ').toLowerCase();

    if (!candidateEdu || !jobReq) return 0;

    // Check if education keywords appear in job requirements
    const eduKeywords = ['bachelor', 'master', 'phd', 'diploma', 'degree', 'university', 'college'];

    let hasEducationRequirement = false;
    eduKeywords.forEach(keyword => {
      if (jobReq.includes(keyword)) hasEducationRequirement = true;
    });

    if (!hasEducationRequirement) return 5; // No specific requirement, give full points

    // Job requires education - check if candidate has it
    let matchFound = false;
    eduKeywords.forEach(keyword => {
      if (candidateEdu.includes(keyword) && jobReq.includes(keyword)) {
        matchFound = true;
      }
    });

    return matchFound ? 5 : 2;
  }

  /**
   * Salary Match (0-10 points)
   * Compare candidate expected salary with job offering
   */
  calculateSalaryMatch(candidate, job) {
    const candidateSalaryMin = candidate.profile?.jobSeekerProfile?.desiredSalary?.min || 0;
    const candidateSalaryMax = candidate.profile?.jobSeekerProfile?.desiredSalary?.max || 0;
    const candidateSalary = candidateSalaryMax || candidateSalaryMin || 0;

    const jobSalaryMin = job.salary?.min || 0;
    const jobSalaryMax = job.salary?.max || 0;

    // If either doesn't specify salary, give neutral points
    if (candidateSalary === 0 || (jobSalaryMin === 0 && jobSalaryMax === 0)) {
      return 5;
    }

    // Candidate expectation within job range - perfect
    if (candidateSalary >= jobSalaryMin && candidateSalary <= jobSalaryMax) {
      return 10;
    }

    // Candidate expects less than job offers - good for employer
    if (candidateSalary < jobSalaryMin) {
      return 8;
    }

    // Candidate expects more than job offers
    const difference = candidateSalary - jobSalaryMax;
    const percentDiff = (difference / jobSalaryMax) * 100;

    if (percentDiff <= 10) return 6; // Close enough
    if (percentDiff <= 20) return 4; // Bit high
    if (percentDiff <= 30) return 2; // Too high
    return 0; // Way too high
  }

  /**
   * Availability Match (0-10 points)
   * Check how soon candidate can start
   */
  calculateAvailabilityMatch(candidate, job) {
    const availability = candidate.profile?.jobSeekerProfile?.availability || '';

    if (!availability) return 5; // Neutral if not specified

    // Map availability to scores
    const availabilityScores = {
      'immediately': 10,
      '2weeks': 8,
      '1month': 6,
      '3months': 4
    };

    return availabilityScores[availability] || 5;
  }

  /**
   * Find top matching candidates for a job
   * Uses hybrid caching approach:
   * 1. Check if matches exist in cache (< 24 hours old)
   * 2. If not, calculate matches and store in cache
   */
  async findTopCandidates(jobId, limit = 15) {
    try {
      // Check cache first
      const cachedMatches = await CandidateMatch.find({
        jobId,
        expiresAt: { $gt: new Date() } // Not expired
      })
      .sort({ matchScore: -1 })
      .limit(limit)
      .populate({
        path: 'candidateId',
        select: 'email profile createdAt',
        populate: {
          path: 'profile',
          select: 'firstName lastName phone location jobSeekerProfile'
        }
      });

      // If we have enough cached matches, return them
      if (cachedMatches.length >= limit) {
        console.log(`✅ Found ${cachedMatches.length} cached matches for job ${jobId}`);
        return {
          success: true,
          fromCache: true,
          matches: cachedMatches
        };
      }

      // Cache miss or insufficient matches - recalculate
      console.log(`🔄 Recalculating matches for job ${jobId}`);

      // Get job details
      const job = await Job.findById(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      // Get all job seekers
      const candidates = await User.find({
        userType: 'jobseeker',
        'profile.jobSeekerProfile': { $exists: true },
        isDeleted: false,
        status: 'active'
      })
      .select('email profile createdAt');

      console.log(`📊 Found ${candidates.length} total job seekers`);

      // Calculate match scores for all candidates
      const matchResults = [];
      for (const candidate of candidates) {
        const { totalScore, breakdown } = this.calculateMatchScore(candidate, job);

        matchResults.push({
          candidate,
          matchScore: totalScore,
          matchBreakdown: breakdown
        });
      }

      // Sort by score descending
      matchResults.sort((a, b) => b.matchScore - a.matchScore);

      // Take top matches
      const topMatches = matchResults.slice(0, limit);

      // Store in cache with 24 hour expiration
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      const matchDocuments = topMatches.map(match => ({
        jobId,
        candidateId: match.candidate._id,
        matchScore: match.matchScore,
        matchBreakdown: match.matchBreakdown,
        calculatedAt: new Date(),
        expiresAt,
        contacted: false
      }));

      // Delete old matches for this job
      await CandidateMatch.deleteMany({ jobId });

      // Insert new matches
      await CandidateMatch.insertMany(matchDocuments);

      console.log(`✅ Cached ${matchDocuments.length} new matches for job ${jobId}`);

      // Fetch newly created matches with populated data
      const newMatches = await CandidateMatch.find({ jobId })
        .sort({ matchScore: -1 })
        .limit(limit)
        .populate({
          path: 'candidateId',
          select: 'email profile createdAt',
          populate: {
            path: 'profile',
            select: 'firstName lastName phone location jobSeekerProfile'
          }
        });

      return {
        success: true,
        fromCache: false,
        matches: newMatches
      };

    } catch (error) {
      console.error('Error finding top candidates:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Check if employer has access to candidate matching for a specific job
   */
  async hasAccessToJob(employerId, jobId) {
    try {
      const employer = await User.findById(employerId);

      if (!employer || employer.userType !== 'employer') {
        return false;
      }

      // Check if employer has candidate matching enabled globally
      if (!employer.profile?.employerProfile?.candidateMatchingEnabled) {
        return false;
      }

      // Check if specific job has access
      const jobAccess = employer.profile.employerProfile.candidateMatchingJobs || [];
      const hasJobAccess = jobAccess.some(access => {
        const isThisJob = access.jobId.toString() === jobId.toString();
        const notExpired = !access.expiresAt || new Date(access.expiresAt) > new Date();
        return isThisJob && notExpired;
      });

      return hasJobAccess;

    } catch (error) {
      console.error('Error checking access:', error);
      return false;
    }
  }

  /**
   * Grant employer access to candidate matching for a specific job
   * (Called after successful payment)
   */
  async grantAccessToJob(employerId, jobId) {
    try {
      const employer = await User.findById(employerId);

      if (!employer || employer.userType !== 'employer') {
        throw new Error('Invalid employer');
      }

      // Enable global access if not already
      if (!employer.profile.employerProfile.candidateMatchingEnabled) {
        employer.profile.employerProfile.candidateMatchingEnabled = true;
      }

      // Check if job already has access
      const existingAccess = employer.profile.employerProfile.candidateMatchingJobs || [];
      const alreadyHasAccess = existingAccess.some(
        access => access.jobId.toString() === jobId.toString()
      );

      if (!alreadyHasAccess) {
        // Add job to access list
        if (!employer.profile.employerProfile.candidateMatchingJobs) {
          employer.profile.employerProfile.candidateMatchingJobs = [];
        }

        employer.profile.employerProfile.candidateMatchingJobs.push({
          jobId,
          enabledAt: new Date(),
          expiresAt: null // No expiration for now (lifetime access per job)
        });

        await employer.save();
      }

      return {
        success: true,
        message: 'Access granted successfully'
      };

    } catch (error) {
      console.error('Error granting access:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Track when employer contacts a candidate
   * (For analytics and future features)
   */
  async trackContact(jobId, candidateId, contactMethod) {
    try {
      await CandidateMatch.findOneAndUpdate(
        { jobId, candidateId },
        {
          $set: {
            contacted: true,
            contactedAt: new Date(),
            contactMethod
          }
        }
      );

      return { success: true };

    } catch (error) {
      console.error('Error tracking contact:', error);
      return { success: false, message: error.message };
    }
  }
}

export default new CandidateMatchingService();
