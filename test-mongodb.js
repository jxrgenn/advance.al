#!/usr/bin/env node

/**
 * MongoDB Testing Script for Albania JobFlow
 * Tests collections, data integrity, and generates report
 */

import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// MongoDB connection string (from .env)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://advanceal123456:StrongPassword123!@cluster0.gazdf55.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

const client = new MongoClient(MONGODB_URI);

async function testMongoDB() {
  const report = {
    timestamp: new Date().toISOString(),
    database: 'test',
    collections: {},
    dataIntegrity: {},
    indexes: {},
    issues: [],
    summary: {}
  };

  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    const db = client.db();
    report.database = db.databaseName;

    // List all collections
    console.log('📦 Fetching collections...');
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections:\n`);

    for (const collInfo of collections) {
      const collName = collInfo.name;
      console.log(`\n📊 Analyzing collection: ${collName}`);
      console.log('═'.repeat(50));

      const coll = db.collection(collName);
      
      // Get collection stats
      const count = await coll.countDocuments();
      console.log(`   Documents: ${count}`);

      report.collections[collName] = {
        count,
        sampleDocuments: []
      };

      // Get sample documents (first 2)
      if (count > 0) {
        const samples = await coll.find().limit(2).toArray();
        report.collections[collName].sampleDocuments = samples.map(doc => ({
          _id: doc._id,
          preview: Object.keys(doc).slice(0, 5).join(', ') + '...'
        }));

        console.log(`   Sample fields: ${Object.keys(samples[0]).join(', ')}`);
      }

      // Get indexes
      const indexes = await coll.indexes();
      report.indexes[collName] = indexes;
      console.log(`   Indexes: ${indexes.length}`);
      indexes.forEach(idx => {
        console.log(`      - ${idx.name}: ${JSON.stringify(idx.key)}`);
      });

      // Collection-specific checks
      if (collName === 'users') {
        await checkUsersCollection(coll, report);
      } else if (collName === 'jobs') {
        await checkJobsCollection(coll, report);
      } else if (collName === 'applications') {
        await checkApplicationsCollection(coll, report);
      }
    }

    // Generate summary
    report.summary = {
      totalCollections: collections.length,
      totalDocuments: Object.values(report.collections).reduce((sum, c) => sum + c.count, 0),
      totalIssues: report.issues.length,
      criticalIssues: report.issues.filter(i => i.severity === 'CRITICAL').length,
      highIssues: report.issues.filter(i => i.severity === 'HIGH').length,
      mediumIssues: report.issues.filter(i => i.severity === 'MEDIUM').length
    };

    console.log('\n\n🎯 SUMMARY');
    console.log('═'.repeat(50));
    console.log(`Total Collections: ${report.summary.totalCollections}`);
    console.log(`Total Documents: ${report.summary.totalDocuments}`);
    console.log(`Total Issues Found: ${report.summary.totalIssues}`);
    console.log(`   - Critical: ${report.summary.criticalIssues}`);
    console.log(`   - High: ${report.summary.highIssues}`);
    console.log(`   - Medium: ${report.summary.mediumIssues}`);

    if (report.issues.length > 0) {
      console.log('\n\n⚠️  ISSUES FOUND');
      console.log('═'.repeat(50));
      report.issues.forEach((issue, idx) => {
        console.log(`\n${idx + 1}. [${issue.severity}] ${issue.title}`);
        console.log(`   Collection: ${issue.collection}`);
        console.log(`   Details: ${issue.details}`);
        if (issue.count) console.log(`   Count: ${issue.count}`);
      });
    }

    // Save report to file
    const reportPath = 'MONGODB_TEST_REPORT.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n\n✅ Full report saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    report.issues.push({
      severity: 'CRITICAL',
      title: 'MongoDB Connection Failed',
      collection: 'N/A',
      details: error.message
    });
  } finally {
    await client.close();
    console.log('\n🔌 Connection closed.');
  }

  return report;
}

async function checkUsersCollection(coll, report) {
  console.log('\n   🔍 Running Users-specific checks...');

  // Check for duplicate emails
  const duplicateEmails = await coll.aggregate([
    { $group: { _id: '$email', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  if (duplicateEmails.length > 0) {
    report.issues.push({
      severity: 'CRITICAL',
      title: 'Duplicate Email Addresses',
      collection: 'users',
      details: `Found ${duplicateEmails.length} duplicate email addresses`,
      count: duplicateEmails.length,
      examples: duplicateEmails.slice(0, 3).map(d => d._id)
    });
    console.log(`      ⚠️  Found ${duplicateEmails.length} duplicate emails`);
  }

  // Check for expired suspensions
  const expiredSuspensions = await coll.countDocuments({
    status: 'suspended',
    'suspensionDetails.expiresAt': { $lt: new Date() }
  });

  if (expiredSuspensions > 0) {
    report.issues.push({
      severity: 'MEDIUM',
      title: 'Expired Suspensions Not Lifted',
      collection: 'users',
      details: `${expiredSuspensions} users have expired suspensions that should be auto-lifted`,
      count: expiredSuspensions
    });
    console.log(`      ⚠️  ${expiredSuspensions} users with expired suspensions`);
  }

  // Check for pending employer verifications
  const pendingVerifications = await coll.countDocuments({
    userType: 'employer',
    status: 'pending_verification'
  });

  console.log(`      ℹ️  ${pendingVerifications} employers pending verification`);

  // Check for users without required fields
  const usersWithoutEmail = await coll.countDocuments({ email: { $exists: false } });
  if (usersWithoutEmail > 0) {
    report.issues.push({
      severity: 'CRITICAL',
      title: 'Users Without Email',
      collection: 'users',
      details: `${usersWithoutEmail} users missing email field`,
      count: usersWithoutEmail
    });
  }

  report.dataIntegrity.users = {
    duplicateEmails: duplicateEmails.length,
    expiredSuspensions,
    pendingVerifications,
    usersWithoutEmail
  };
}

async function checkJobsCollection(coll, report) {
  console.log('\n   🔍 Running Jobs-specific checks...');

  // Count jobs by tier
  const jobsByTier = await coll.aggregate([
    { $group: { _id: '$tier', count: { $sum: 1 } } }
  ]).toArray();

  console.log('      Job tiers:');
  jobsByTier.forEach(tier => {
    console.log(`         - ${tier._id || 'undefined'}: ${tier.count}`);
  });

  // Count jobs by status
  const jobsByStatus = await coll.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray();

  console.log('      Job statuses:');
  jobsByStatus.forEach(status => {
    console.log(`         - ${status._id}: ${status.count}`);
  });

  // Check for jobs without employerId
  const jobsWithoutEmployer = await coll.countDocuments({
    employerId: { $exists: false }
  });

  if (jobsWithoutEmployer > 0) {
    report.issues.push({
      severity: 'HIGH',
      title: 'Jobs Without Employer ID',
      collection: 'jobs',
      details: `${jobsWithoutEmployer} jobs missing employerId reference`,
      count: jobsWithoutEmployer
    });
    console.log(`      ⚠️  ${jobsWithoutEmployer} jobs without employerId`);
  }

  // Check for expired jobs still marked as active
  const expiredActiveJobs = await coll.countDocuments({
    status: 'active',
    expiresAt: { $lt: new Date() }
  });

  if (expiredActiveJobs > 0) {
    report.issues.push({
      severity: 'MEDIUM',
      title: 'Expired Jobs Still Active',
      collection: 'jobs',
      details: `${expiredActiveJobs} jobs have expired but status is still 'active'`,
      count: expiredActiveJobs
    });
    console.log(`      ⚠️  ${expiredActiveJobs} expired jobs still marked as active`);
  }

  report.dataIntegrity.jobs = {
    byTier: Object.fromEntries(jobsByTier.map(t => [t._id || 'undefined', t.count])),
    byStatus: Object.fromEntries(jobsByStatus.map(s => [s._id, s.count])),
    withoutEmployer: jobsWithoutEmployer,
    expiredActive: expiredActiveJobs
  };
}

async function checkApplicationsCollection(coll, report) {
  console.log('\n   🔍 Running Applications-specific checks...');

  // Count applications by status
  const appsByStatus = await coll.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray();

  console.log('      Application statuses:');
  appsByStatus.forEach(status => {
    console.log(`         - ${status._id || 'undefined'}: ${status.count}`);
  });

  report.dataIntegrity.applications = {
    byStatus: Object.fromEntries(appsByStatus.map(s => [s._id || 'undefined', s.count]))
  };
}

// Run the test
console.log('🚀 Albania JobFlow - MongoDB Testing Script');
console.log('═'.repeat(50));
console.log('');

testMongoDB()
  .then(() => {
    console.log('\n✨ Testing complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n💥 Fatal error:', err);
    process.exit(1);
  });
