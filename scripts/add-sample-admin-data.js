import { connectDB } from '../src/config/database.js';
import { User, Job, Application, QuickUser } from '../src/models/index.js';

// Sample data for testing admin dashboard
const sampleData = {
  jobs: [
    {
      title: 'Senior Software Engineer',
      category: 'Teknologji',
      location: { city: 'Tiranë', region: 'Tiranë' },
      tier: 'premium'
    },
    {
      title: 'Marketing Manager',
      category: 'Marketing',
      location: { city: 'Durrës', region: 'Durrës' },
      tier: 'featured'
    },
    {
      title: 'Graphic Designer',
      category: 'Dizajn',
      location: { city: 'Vlorë', region: 'Vlorë' },
      tier: 'basic'
    }
  ],

  quickUsers: [
    {
      firstName: 'Ana',
      lastName: 'Hoxha',
      email: 'ana.hoxha@example.com',
      location: 'Tiranë',
      interests: ['Teknologji', 'Marketing']
    },
    {
      firstName: 'Blerim',
      lastName: 'Krasniqi',
      email: 'blerim.k@example.com',
      location: 'Shkodër',
      interests: ['Shitje', 'Menaxhim']
    }
  ]
};

async function addSampleData() {
  try {
    await connectDB();
    console.log('🔗 Connected to database');

    // Add sample jobs if none exist
    const existingJobs = await Job.countDocuments();
    if (existingJobs === 0) {
      console.log('📝 Adding sample jobs...');

      // Create a sample employer first
      let sampleEmployer = await User.findOne({ userType: 'employer' });

      if (!sampleEmployer) {
        sampleEmployer = new User({
          email: 'employer@test.com',
          password: 'password123',
          userType: 'employer',
          profile: {
            firstName: 'Test',
            lastName: 'Employer',
            location: { city: 'Tiranë', region: 'Tiranë' },
            employerProfile: {
              companyName: 'TechCorp Albania',
              industry: 'Technology',
              companySize: '50-100',
              verified: true,
              verificationStatus: 'approved'
            }
          }
        });
        await sampleEmployer.save();
        console.log('✅ Created sample employer');
      }

      // Add sample jobs
      for (const jobData of sampleData.jobs) {
        const job = new Job({
          ...jobData,
          description: `Sample job posting for ${jobData.title}`,
          requirements: ['Experience required', 'Team player'],
          benefits: ['Health insurance', 'Flexible hours'],
          jobType: 'full-time',
          seniority: 'mid',
          status: 'active',
          employerId: sampleEmployer._id,
          postedAt: new Date()
        });
        await job.save();
      }
      console.log('✅ Added sample jobs');
    }

    // Add sample quick users if none exist
    const existingQuickUsers = await QuickUser.countDocuments();
    if (existingQuickUsers === 0) {
      console.log('📝 Adding sample quick users...');
      for (const userData of sampleData.quickUsers) {
        const quickUser = new QuickUser(userData);
        await quickUser.save();
      }
      console.log('✅ Added sample quick users');
    }

    // Add sample applications if we have jobs and job seekers
    const existingApplications = await Application.countDocuments();
    if (existingApplications === 0) {
      const jobs = await Job.find().limit(2);
      let jobseeker = await User.findOne({ userType: 'jobseeker' });

      if (!jobseeker && jobs.length > 0) {
        jobseeker = new User({
          email: 'jobseeker@test.com',
          password: 'password123',
          userType: 'jobseeker',
          profile: {
            firstName: 'Test',
            lastName: 'Jobseeker',
            location: { city: 'Tiranë', region: 'Tiranë' },
            jobSeekerProfile: {
              title: 'Software Developer',
              bio: 'Passionate developer',
              skills: ['JavaScript', 'React', 'Node.js']
            }
          }
        });
        await jobseeker.save();
        console.log('✅ Created sample job seeker');
      }

      if (jobs.length > 0 && jobseeker) {
        for (const job of jobs.slice(0, 2)) {
          const application = new Application({
            jobId: job._id,
            jobSeekerId: jobseeker._id,
            employerId: job.employerId,
            applicationMethod: 'one_click',
            status: 'pending'
          });
          await application.save();
        }
        console.log('✅ Added sample applications');
      }
    }

    // Display current stats
    const [userCount, jobCount, applicationCount, quickUserCount] = await Promise.all([
      User.countDocuments(),
      Job.countDocuments(),
      Application.countDocuments(),
      QuickUser.countDocuments()
    ]);

    console.log('\n📊 Current Database Stats:');
    console.log(`👥 Total Users: ${userCount}`);
    console.log(`💼 Total Jobs: ${jobCount}`);
    console.log(`📄 Total Applications: ${applicationCount}`);
    console.log(`⚡ Quick Users: ${quickUserCount}`);

    console.log('\n🎉 Sample data setup complete!');
    console.log('🔍 You can now test the admin dashboard with real data');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error adding sample data:', error);
    process.exit(1);
  }
}

addSampleData();