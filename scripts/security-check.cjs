#!/usr/bin/env node
/**
 * Security check: audit, lint, contract tests.
 * Usage: node scripts/security-check.cjs [--skip-fix] [--skip-e2e]
 *   --skip-fix   skip npm audit fix (useful in CI to avoid modifying lockfile)
 *   --skip-e2e   skip Playwright E2E tests (faster run)
 */
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const skipFix = args.includes('--skip-fix');
const skipE2e = args.includes('--skip-e2e');

let failed = false;

function run(label, cmd, optional = false) {
  console.log(`\n--- ${label} ---\n`);
  try {
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch (e) {
    if (optional) {
      console.log(`\n^ ${label} had issues (non-blocking).\n`);
      return true;
    }
    failed = true;
    return false;
  }
}

console.log('=== SECURITY CHECK ===');

run('1. npm audit', 'npm audit', true);

if (!skipFix) {
  run('2. npm audit fix (safe)', 'npm audit fix', true);
} else {
  console.log('\n--- 2. npm audit fix ---\n(skipped)');
}

run('3. Lint', 'npx eslint . --ext ts,tsx --max-warnings 999', true);

run('4. ArcDEX contract tests', 'npm run test:dex', false);

run('5. FajuFarm contract tests', 'npx hardhat test test/FajuFarm.test.cjs --config hardhat.config.cjs', false);

if (!skipE2e) {
  run('6. E2E tests (Playwright)', 'npm run test:e2e', true);
} else {
  console.log('\n--- 6. E2E tests ---\n(skipped)');
}

if (failed) {
  console.error('\n=== SECURITY CHECK FAILED ===\n');
  process.exit(1);
}
console.log('\n=== SECURITY CHECK PASSED ===\n');
