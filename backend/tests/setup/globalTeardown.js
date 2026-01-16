/**
 * Jest Global Teardown
 *
 * Runs once after all tests complete
 */

export default async function globalTeardown() {
  console.log('\n🏁 All tests complete');
  console.log('🧹 Cleaning up...\n');

  // Give time for async operations to complete
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('✅ Global teardown complete\n');
}
