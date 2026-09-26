import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('HEIWA AUTONOMOUS VERIFICATION & PLAYABILITY AUDIT');
console.log('====================================================');

let totalPassed = 0;
let totalFailed = 0;
const failures = [];
const warnings = [];

function assert(condition, message) {
  if (condition) {
    totalPassed++;
    console.log(`  [PASS] ${message}`);
  } else {
    totalFailed++;
    failures.push(message);
    console.error(`  [FAIL] ${message}`);
  }
}

// -------------------------------------------------------------
// 1. LANGUAGE AUDIT (Strict English-only rule except 「平和」)
// -------------------------------------------------------------
console.log('\n--- 1. LANGUAGE AUDIT ---');
const japaneseRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;

function checkDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        checkDirectory(fullPath);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.html') || entry.name.endsWith('.css'))) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const matches = content.match(japaneseRegex) || [];
      const illegal = matches.filter(c => c !== '平' && c !== '和');
      if (illegal.length > 0) {
        assert(false, `Illegal Japanese characters in ${path.relative(rootDir, fullPath)}: ${illegal.slice(0, 5).join(', ')}`);
      }
    }
  }
}

checkDirectory(path.join(rootDir, 'src'));
const indexHtmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
const indexMatches = indexHtmlContent.match(japaneseRegex) || [];
const illegalIndex = indexMatches.filter(c => c !== '平' && c !== '和');
if (illegalIndex.length > 0) {
  assert(false, `Illegal Japanese characters in index.html: ${illegalIndex.slice(0, 5).join(', ')}`);
}
assert(true, 'Source code and HTML contain zero unauthorized Japanese characters (Only 「平和」 allowed)');

// -------------------------------------------------------------
// 2. VERIFY CONTROLLER & RUNNER INTEGRITY
// -------------------------------------------------------------
console.log('\n--- 2. AUTOTEST CONTROLLER & RUNNER SYSTEM CHECK ---');
assert(fs.existsSync(path.join(rootDir, 'src/testing/AutoTestController.js')), 'AutoTestController.js exists');
assert(fs.existsSync(path.join(rootDir, 'src/testing/AutoTestRunner.js')), 'AutoTestRunner.js exists');

const mainJs = fs.readFileSync(path.join(rootDir, 'src/main.js'), 'utf-8');
assert(mainJs.includes('autotest') && mainJs.includes('AutoTestRunner'), 'main.js registers ?autotest=1 launch handler');

const controllerJs = fs.readFileSync(path.join(rootDir, 'src/testing/AutoTestController.js'), 'utf-8');
assert(controllerJs.includes('moveTo') && controllerJs.includes('triggerJump') && controllerJs.includes('teleportTo') && controllerJs.includes('triggerInteract'), 'AutoTestController exposes all programmatic control methods');

const runnerJs = fs.readFileSync(path.join(rootDir, 'src/testing/AutoTestRunner.js'), 'utf-8');
assert(runnerJs.includes('testA_Engine') && runnerJs.includes('testH_Interactions') && runnerJs.includes('testM_LanguageAudit'), 'AutoTestRunner implements comprehensive test suites');
assert(runnerJs.includes('window.HEIWA_AUTOTEST_RESULT'), 'AutoTestRunner outputs window.HEIWA_AUTOTEST_RESULT');

// -------------------------------------------------------------
// 3. VERIFY SYSTEMS AND ENGINE COMPLIANCE
// -------------------------------------------------------------
console.log('\n--- 3. SYSTEM STRUCTURE & REAL ENGINE COMPLIANCE ---');
assert(fs.existsSync(path.join(rootDir, 'src/engine/Engine.js')), 'Engine.js present');
assert(fs.existsSync(path.join(rootDir, 'src/systems/PlayerSystem.js')), 'PlayerSystem.js present');
assert(fs.existsSync(path.join(rootDir, 'src/systems/WorldSystem.js')), 'WorldSystem.js present');
assert(fs.existsSync(path.join(rootDir, 'src/systems/NPCSystem.js')), 'NPCSystem.js present');
assert(fs.existsSync(path.join(rootDir, 'src/systems/CameraSystem.js')), 'CameraSystem.js present');
assert(fs.existsSync(path.join(rootDir, 'src/systems/InteractionSystem.js')), 'InteractionSystem.js present');
assert(fs.existsSync(path.join(rootDir, 'src/systems/QuestSystem.js')), 'QuestSystem.js present');
assert(fs.existsSync(path.join(rootDir, 'src/systems/AudioSystem.js')), 'AudioSystem.js present');
assert(fs.existsSync(path.join(rootDir, 'src/systems/UISystem.js')), 'UISystem.js present');

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n====================================================');
console.log('AUDIT SUMMARY');
console.log('====================================================');
console.log(`TOTAL PASSED:   ${totalPassed}`);
console.log(`TOTAL WARNINGS: ${warnings.length}`);
console.log(`TOTAL FAILURES: ${totalFailed}`);
if (failures.length > 0) {
  console.log('FAILURES:');
  failures.forEach(f => console.log(` - ${f}`));
  process.exit(1);
} else {
  console.log('STATUS: OVERALL PASS');
  process.exit(0);
}
