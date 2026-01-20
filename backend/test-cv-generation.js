// Test CV Generation with enhanced prompt
// This script tests the OpenAI service directly

import dotenv from 'dotenv';
dotenv.config();

import { extractCVDataFromText } from './src/services/openaiService.js';
import { generateCVDocument } from './src/services/cvDocumentService.js';
import fs from 'fs/promises';

const testInput = `
Jam Alban Hoxha, kam 5 vjet eksperienc si fullstack web developer. Kom punu me React, Node.js, MongoDB, dhe Express.

Kam diplomu nga Universiteti Politeknik i Tiranes ne 2018, inxhinieri kompjuterik, me mesatare 8.7.

Aktualisht punoj ne nje kompani teknologjike ku zhvilloj aplikacione web per klient te ndryshem. Kam punu ne projekte te medha me ekip, baj code review, dhe ndonjeher trainoj developer te rinj.

Flas shqip amtare, anglisht shum mir (C1), dhe pak italisht.

Kam certifikata nga Udemy per React dhe Node.js.
`;

async function testCVGeneration() {
  console.log('🧪 Testing CV Generation with Enhanced Prompt\n');
  console.log('📝 Input Text:');
  console.log(testInput);
  console.log('\n' + '='.repeat(80) + '\n');

  try {
    // Test Albanian version
    console.log('🇦🇱 Testing Albanian version...\n');
    const resultSQ = await extractCVDataFromText(testInput, 'sq');

    console.log('✅ Extraction successful!');
    console.log('\n📊 Token Usage:', resultSQ.usage);
    console.log('\n📄 Generated CV Data (Albanian):\n');
    console.log(JSON.stringify(resultSQ.data, null, 2));

    // Check quality metrics
    console.log('\n\n🎯 QUALITY METRICS:');

    if (resultSQ.data.professionalSummary) {
      const summaryWords = resultSQ.data.professionalSummary.split(/\s+/).length;
      console.log(`✓ Professional Summary: ${summaryWords} words (Target: 80-120)`);
      if (summaryWords < 80) console.log('  ⚠️ WARNING: Too short!');
    }

    if (resultSQ.data.workExperience && resultSQ.data.workExperience.length > 0) {
      resultSQ.data.workExperience.forEach((exp, idx) => {
        console.log(`\n✓ Job ${idx + 1}: ${exp.position} at ${exp.company}`);
        console.log(`  - Responsibilities: ${exp.responsibilities?.length || 0} bullets (Target: 8-12)`);
        if (exp.responsibilities?.length < 8) {
          console.log('    ⚠️ WARNING: Too few responsibility bullets!');
        }

        exp.responsibilities?.forEach((resp, i) => {
          const words = resp.split(/\s+/).length;
          console.log(`    • Bullet ${i + 1}: ${words} words (Target: 20-35)`);
          if (words < 20) console.log(`      ⚠️ WARNING: Too short!`);
        });

        console.log(`  - Achievements: ${exp.achievements?.length || 0} bullets (Target: 2-3+)`);
        if (!exp.achievements || exp.achievements.length < 2) {
          console.log('    ⚠️ WARNING: Missing or insufficient achievements!');
        }
      });
    }

    if (resultSQ.data.skills) {
      console.log(`\n✓ Technical Skills: ${resultSQ.data.skills.technical?.length || 0} items (Target: 8-15)`);
      if (resultSQ.data.skills.technical?.length < 8) console.log('  ⚠️ WARNING: Too few technical skills!');

      console.log(`✓ Soft Skills: ${resultSQ.data.skills.soft?.length || 0} items (Target: 6-10)`);
      if (resultSQ.data.skills.soft?.length < 6) console.log('  ⚠️ WARNING: Too few soft skills!');

      console.log(`✓ Tools/Software: ${resultSQ.data.skills.tools?.length || 0} items (Target: 6-12)`);
      if (resultSQ.data.skills.tools?.length < 6) console.log('  ⚠️ WARNING: Too few tools!');
    }

    // Generate Word document
    console.log('\n\n📄 Generating Word document...');
    const docBuffer = await generateCVDocument(resultSQ.data, 'sq');
    await fs.writeFile('/tmp/test_cv_albanian.docx', docBuffer);
    console.log('✅ Document saved to: /tmp/test_cv_albanian.docx');
    console.log(`📦 File size: ${(docBuffer.length / 1024).toFixed(2)} KB`);

    console.log('\n\n' + '='.repeat(80));
    console.log('🎉 TEST COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    console.error('\nError details:', error.message);
    process.exit(1);
  }
}

testCVGeneration();
