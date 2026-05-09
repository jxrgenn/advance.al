/**
 * Quick read-only: show the embedding text for one or more jobs by title pattern.
 * node scripts/embeddings-inspect-job.js "SEO|Mobile|Web Developer|Operacionesh"
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../src/config/database.js';
import Job from '../src/models/Job.js';
import jobEmbeddingService from '../src/services/jobEmbeddingService.js';

dotenv.config();

async function main() {
  const pattern = process.argv[2] || 'SEO|Mobile|Web Developer|Operacionesh|Bankar';
  await connectDB();
  const jobs = await Job.find({
    status: 'active',
    title: { $regex: new RegExp(pattern, 'i') },
  }).select('title category seniority jobType description requirements tags location');

  console.log(`Found ${jobs.length} jobs matching /${pattern}/i\n`);
  for (const j of jobs) {
    const text = jobEmbeddingService.prepareTextForEmbedding(j);
    console.log('═'.repeat(80));
    console.log(`TITLE: ${j.title}  |  category: ${j.category}  |  ${j.location?.city}  |  seniority: ${j.seniority}  |  jobType: ${j.jobType}`);
    console.log(`tags: ${(j.tags || []).join(', ')}`);
    console.log(`requirements: ${(j.requirements || []).slice(0, 3).join(' | ')}`);
    console.log(`description (300 chars): ${(j.description || '').slice(0, 300).replace(/\s+/g, ' ')}`);
    console.log(`\nEMBEDDED TEXT (${text.length} chars):`);
    console.log(text.replace(/\s+/g, ' '));
    console.log('');
  }
  await mongoose.disconnect();
}

main().catch(async err => { console.error(err); try { await mongoose.disconnect(); } catch {}; process.exit(1); });
