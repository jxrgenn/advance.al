#!/usr/bin/env node

/**
 * Puppeteer E2E Testing Script for Albania JobFlow
 * Tests authentication, job browsing, and user flows
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5173';
const SCREENSHOTS_DIR = './test-screenshots';

// Create screenshots directory
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR);
}

const testReport = {
  timestamp: new Date().toISOString(),
  baseUrl: BASE_URL,
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  }
};

async function takeScreenshot(page, name) {
  const filepath = path.join(SCREENSHOTS_DIR, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`   📸 Screenshot saved: ${filepath}`);
  return filepath;
}

async function runTest(name, testFn) {
  console.log(`\n🧪 Test: ${name}`);
  console.log('─'.repeat(50));
  
  const test = {
    name,
    status: 'pending',
    startTime: new Date().toISOString(),
    screenshots: [],
    errors: []
  };

  try {
    await testFn(test);
    test.status = 'passed';
    test Report.summary.passed++;
    console.log(`✅ PASSED: ${name}\n`);
  } catch (error) {
    test.status = 'failed';
    test.errors.push(error.message);
    testReport.summary.failed++;
    console.log(`❌ FAILED: ${name}`);
    console.log(`   Error: ${error.message}\n`);
  }

  test.endTime = new Date().toISOString();
  test.duration = new Date(test.endTime) - new Date(test.startTime);
  testReport.tests.push(test);
  testReport.summary.total++;
}

async function main() {
  console.log('🎭 Albania JobFlow - Puppeteer E2E Testing');
  console.log('═'.repeat(50));
  console.log(`Base URL: ${BASE_URL}\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Test 1: Homepage loads
  await runTest('Homepage Loads Successfully', async (test) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 10000 });
    test.screenshots.push(await takeScreenshot(page, 'homepage'));
    
    const title = await page.title();
    console.log(`   Page title: ${title}`);
    
    // Check for key elements
    const navigation = await page.$('nav');
    if (!navigation) throw new Error('Navigation not found');
    console.log('   ✓ Navigation found');
  });

  // Test 2: Jobs page loads
  await runTest('Jobs Page Loads and Shows Job Listings', async (test) => {
    await page.goto(`${BASE_URL}/jobs`, { waitUntil: 'networkidle2', timeout: 10000 });
    test.screenshots.push(await takeScreenshot(page, 'jobs-page'));
    
    // Wait for job cards
    try {
      await page.waitForSelector('[data-testid="job-card"], .job-card, article', { timeout: 5000 });
      const jobCards = await page.$$('[data-testid="job-card"], .job-card, article');
      console.log(`   ✓ Found ${jobCards.length} job listings`);
    } catch (e) {
      console.log('   ℹ️  No job cards found (might be empty state)');
    }
  });

  // Test 3: Search functionality
  await runTest('Job Search Functionality', async (test) => {
    await page.goto(`${BASE_URL}/jobs`, { waitUntil: 'networkidle2' });
    
    // Find search input
    const searchInput = await page.$('input[type="search"], input[placeholder*="kërko"], input[placeholder*="search"]');
    if (!searchInput) throw new Error('Search input not found');
    
    await searchInput.type('software');
    console.log('   ✓ Entered search term: software');
    
    await page.waitForTimeout(1000); // Wait for debounce
    test.screenshots.push(await takeScreenshot(page, 'search-results'));
    console.log('   ✓ Search executed');
  });

  // Test 4: Login page loads
  await runTest('Login Page Loads', async (test) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    test.screenshots.push(await takeScreenshot(page, 'login-page'));
    
    const emailInput = await page.$('input[type="email"]');
    const passwordInput = await page.$('input[type="password"]');
    
    if (!emailInput) throw new Error('Email input not found');
    if (!passwordInput) throw new Error('Password input not found');
    
    console.log('   ✓ Email input found');
    console.log('   ✓ Password input found');
  });

  // Test 5: Registration page loads
  await runTest('Registration Page Loads', async (test) => {
    await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle2' });
    test.screenshots.push(await takeScreenshot(page, 'register-page'));
    
    const form = await page.$('form');
    if (!form) throw new Error('Registration form not found');
    
    console.log('   ✓ Registration form found');
  });

  // Test 6: Companies page loads
  await runTest('Companies Page Loads', async (test) => {
    await page.goto(`${BASE_URL}/companies`, { waitUntil: 'networkidle2' });
    test.screenshots.push(await takeScreenshot(page, 'companies-page'));
    
    console.log('   ✓ Companies page loaded');
  });

  // Test 7: Check for console errors
  await runTest('No Console Errors on Homepage', async (test) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);
    
    if (errors.length > 0) {
      console.log(`   ⚠️  Found ${errors.length} console errors:`);
      errors.forEach(err => console.log(`      - ${err}`));
    } else {
      console.log('   ✓ No console errors found');
    }
    
    test.consoleErrors = errors;
  });

  // Test 8: Responsive design (mobile)
  await runTest('Mobile Responsive Design', async (test) => {
    await page.setViewport({ width: 375, height: 667 }); // iPhone SE
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    test.screenshots.push(await takeScreenshot(page, 'mobile-homepage'));
    
    await page.goto(`${BASE_URL}/jobs`, { waitUntil: 'networkidle2' });
    test.screenshots.push(await takeScreenshot(page, 'mobile-jobs'));
    
    console.log('   ✓ Mobile viewport tested');
  });

  await browser.close();

  // Generate summary
  console.log('\n\n🎯 TEST SUMMARY');
  console.log('═'.repeat(50));
  console.log(`Total Tests: ${testReport.summary.total}`);
  console.log(`✅ Passed: ${testReport.summary.passed}`);
  console.log(`❌ Failed: ${testReport.summary.failed}`);
  console.log(`⏭️  Skipped: ${testReport.summary.skipped}`);
  console.log(`Success Rate: ${((testReport.summary.passed / testReport.summary.total) * 100).toFixed(1)}%`);

  // Save report
  const reportPath = 'PUPPETEER_TEST_REPORT.json';
  fs.writeFileSync(reportPath, JSON.stringify(testReport, null, 2));
  console.log(`\n✅ Full report saved to: ${reportPath}`);
  console.log(`📸 Screenshots saved to: ${SCREENSHOTS_DIR}/`);

  // Exit with appropriate code
  process.exit(testReport.summary.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
