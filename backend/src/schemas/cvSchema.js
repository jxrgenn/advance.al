import { z } from 'zod';

// Define Zod schema for OpenAI structured output
// Note: OpenAI requires .nullable() with .optional() or use .default() instead
export const cvSchema = z.object({
  language: z.enum(['sq', 'en', 'de']).describe('Detected language: sq for Albanian, en for English, de for German'),
  personalInfo: z.object({
    fullName: z.string().describe('Full name of the person'),
    email: z.string().default(''),
    phone: z.string().default(''),
    address: z.string().default(''),
    dateOfBirth: z.string().default(''),
    nationality: z.string().default(''),
    linkedIn: z.string().default(''),
    portfolio: z.string().default('')
  }),
  professionalSummary: z.string().max(1000).default('').describe('Brief professional summary/objective'),
  workExperience: z.array(z.object({
    company: z.string(),
    position: z.string(),
    startDate: z.string().describe('Format: YYYY-MM or Month YYYY'),
    endDate: z.string().default(''),
    current: z.boolean().default(false),
    location: z.string().default(''),
    responsibilities: z.array(z.string()).default([]),
    achievements: z.array(z.string()).default([])
  })).default([]),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    fieldOfStudy: z.string(),
    startDate: z.string(),
    endDate: z.string().default(''),
    current: z.boolean().default(false),
    gpa: z.string().default(''),
    honors: z.string().default('')
  })).default([]),
  skills: z.object({
    technical: z.array(z.string()).default([]),
    soft: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([])
  }),
  languages: z.array(z.object({
    name: z.string(),
    proficiency: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'])
  })).default([]),
  certifications: z.array(z.object({
    name: z.string(),
    issuer: z.string().default(''),
    dateObtained: z.string().default(''),
    expiryDate: z.string().default(''),
    credentialId: z.string().default('')
  })).default([]),
  references: z.array(z.object({
    name: z.string(),
    position: z.string().default(''),
    company: z.string().default(''),
    email: z.string().default(''),
    phone: z.string().default(''),
    relationship: z.string().default('')
  })).default([])
});
