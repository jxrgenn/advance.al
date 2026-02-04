import 'dotenv/config';
import mongoose from 'mongoose';
import Job from './src/models/Job.js';
import jobEmbeddingService from './src/services/jobEmbeddingService.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getTestEmployerId() {
  const { User } = await import('./src/models/index.js');
  const employer = await User.findOne({ userType: 'employer' }).lean();
  if (!employer) throw new Error('No employer found');
  return employer._id;
}

async function getTestLocation() {
  const { Location } = await import('./src/models/index.js');
  const location = await Location.findOne({ isActive: true }).lean();
  if (!location) throw new Error('No location found');
  return location;
}

async function testVueVsReact() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n' + '='.repeat(80));
    console.log('🎯 CRITICAL TEST: Vue.js vs React Similarity');
    console.log('='.repeat(80) + '\n');

    const employerId = await getTestEmployerId();
    const location = await getTestLocation();

    // Create a Vue.js developer job
    console.log('📝 Creating Vue.js Developer job...\n');

    const vueJob = new Job({
      employerId,
      title: 'Senior Vue.js Developer',
      slug: `test-vue-developer-${Date.now()}`,
      description: 'We need an experienced Vue.js developer to build modern web applications. You will work with Vue 3, Composition API, Pinia for state management, and Nuxt.js for SSR. Strong JavaScript fundamentals required. Experience with TypeScript is a plus.',
      requirements: [
        '4+ years of Vue.js experience',
        'Strong JavaScript/TypeScript skills',
        'Experience with Vue 3 and Composition API',
        'Knowledge of Pinia or Vuex',
        'Understanding of modern frontend tooling'
      ],
      benefits: [
        'Competitive salary',
        'Remote work',
        'Health insurance',
        'Learning budget'
      ],
      location: {
        city: location.city,
        region: location.region,
        remote: true,
        remoteType: 'hybrid'
      },
      jobType: 'full-time',
      category: 'Teknologji',
      seniority: 'senior',
      salary: {
        min: 2200,
        max: 3800,
        currency: 'EUR',
        negotiable: true,
        showPublic: true
      },
      tags: ['Vue.js', 'JavaScript', 'TypeScript', 'Nuxt.js', 'Frontend'],
      platformCategories: {
        diaspora: false,
        ngaShtepia: true,
        partTime: false,
        administrata: false,
        sezonale: false
      },
      tier: 'basic',
      status: 'active'
    });

    await vueJob.save();
    console.log(`✅ Vue.js job created: ${vueJob._id}`);
    console.log(`   Title: ${vueJob.title}`);
    console.log(`   Tags: ${vueJob.tags.join(', ')}`);

    // Queue for processing
    await jobEmbeddingService.queueEmbeddingGeneration(vueJob._id, 1);
    console.log('\n⏳ Waiting for processing...\n');

    let attempts = 0;
    while (attempts < 24) {
      attempts++;
      await sleep(5000);

      const updated = await Job.findById(vueJob._id);
      console.log(`Attempt ${attempts}/24: Embedding = ${updated.embedding?.status}, Similar jobs = ${updated.similarJobs?.length || 0}`);

      if (updated.embedding?.status === 'completed' &&
          updated.similarJobs &&
          updated.similarJobs.length > 0) {
        console.log('\n✅ Processing complete!\n');
        break;
      }
    }

    // Get results
    const finalJob = await Job.findById(vueJob._id);

    if (!finalJob.similarJobs || finalJob.similarJobs.length === 0) {
      console.log('❌ No similar jobs found!');
      return;
    }

    console.log('='.repeat(80));
    console.log('🔍 SIMILARITY RESULTS');
    console.log('='.repeat(80) + '\n');

    const similarJobIds = finalJob.similarJobs.map(s => s.jobId);
    const similarJobs = await Job.find({ _id: { $in: similarJobIds } })
      .select('title category tags')
      .lean();

    const jobMap = new Map(similarJobs.map(j => [j._id.toString(), j]));

    console.log(`📋 Our Job: ${finalJob.title}`);
    console.log(`   Framework: Vue.js`);
    console.log(`   Role Type: Frontend Developer`);
    console.log(`   Tags: ${finalJob.tags.join(', ')}\n`);

    console.log(`🎯 Similar jobs found:\n`);

    let hasReactJob = false;
    let hasFrontendJob = false;
    let hasAngularJob = false;

    finalJob.similarJobs.forEach((similar, i) => {
      const job = jobMap.get(similar.jobId.toString());
      if (!job) return;

      const titleLower = job.title.toLowerCase();
      const isReact = titleLower.includes('react');
      const isVue = titleLower.includes('vue');
      const isAngular = titleLower.includes('angular');
      const isFrontend = titleLower.includes('frontend') || titleLower.includes('front-end');

      if (isReact) hasReactJob = true;
      if (isFrontend && !isReact && !isVue && !isAngular) hasFrontendJob = true;
      if (isAngular) hasAngularJob = true;

      console.log(`${i + 1}. ${job.title}`);
      console.log(`   Tags: ${job.tags?.join(', ') || 'none'}`);
      console.log(`   AI Score: ${(similar.score * 100).toFixed(1)}%`);
      console.log(`   Framework: ${isReact ? 'React' : isVue ? 'Vue' : isAngular ? 'Angular' : isFrontend ? 'Generic Frontend' : 'Other'}`);
      console.log(`   Match Quality: ${
        (isReact || isFrontend) ? '✅ EXCELLENT (different framework, same role!)' :
        isVue ? '✅ PERFECT (same framework)' :
        isAngular ? '✅ GOOD (different framework, same role!)' :
        '⚠️  QUESTIONABLE (not frontend?)'
      }`);
      console.log();
    });

    console.log('='.repeat(80));
    console.log('📊 ANALYSIS');
    console.log('='.repeat(80));
    console.log(`
Found React jobs: ${hasReactJob ? '✅ YES' : '❌ NO'}
Found generic Frontend jobs: ${hasFrontendJob ? '✅ YES' : '❌ NO'}
Found Angular jobs: ${hasAngularJob ? '✅ YES' : '⚠️  NO (might not exist in DB)'}

${hasReactJob || hasFrontendJob ? '✅ SUCCESS!' : '❌ PROBLEM!'} The algorithm ${hasReactJob || hasFrontendJob ? 'CORRECTLY' : 'FAILED TO'} understand${hasReactJob || hasFrontendJob ? 's' : ''} that:
- Vue.js Developer and React Developer are both Frontend Developers
- They should match with each other despite different frameworks
- Generic "Frontend Developer" jobs should match both

${hasReactJob || hasFrontendJob ?
'🎉 The improved algorithm is working! Vue.js jobs now find React jobs!' :
'❌ The algorithm still needs work. Vue.js jobs are not finding React jobs.'}
`);

    // Cleanup
    await vueJob.softDelete();
    console.log('🗑️  Test job cleaned up\n');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
  }
}

testVueVsReact();
