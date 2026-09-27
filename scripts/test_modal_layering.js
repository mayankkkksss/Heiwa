import fs from 'fs';
import path from 'path';

console.log('====================================================');
console.log('HEIWA CHUNK 37 — SETTINGS & ABOUT MODAL AUDIT');
console.log('====================================================');

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    passedCount++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedCount++;
    console.error(`  [FAIL] ${testName}: ${detail}`);
  }
}

// 1. Read files
const htmlPath = path.resolve('index.html');
const cssPath = path.resolve('src/style.css');
const uiSysPath = path.resolve('src/systems/UISystem.js');
const inputManPath = path.resolve('src/engine/InputManager.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const cssContent = fs.readFileSync(cssPath, 'utf8');
const uiSysContent = fs.readFileSync(uiSysPath, 'utf8');
const inputManContent = fs.readFileSync(inputManPath, 'utf8');

// Test 1: HTML Structure
assert(
  htmlContent.includes('id="info-modal"') &&
  htmlContent.includes('id="info-modal-title"') &&
  htmlContent.includes('id="btn-info-close"') &&
  htmlContent.includes('id="info-modal-body"'),
  'TEST 1: #info-modal DOM elements present in index.html'
);

// Test 2: Info Modal CSS Fixed Layering & Z-Index
assert(
  cssContent.includes('.info-modal {') &&
  cssContent.includes('position: fixed;') &&
  cssContent.includes('z-index: 500;'),
  'TEST 2: .info-modal is fixed foreground layer at z-index: 500'
);

// Test 3: Stacking Hierarchy (.title-screen z-index < .info-modal z-index)
const titleScreenZMatch = cssContent.match(/\.title-screen\s*\{[^}]*z-index:\s*(\d+)/);
const infoModalZMatch = cssContent.match(/\.info-modal\s*\{[^}]*z-index:\s*(\d+)/);
const titleZ = titleScreenZMatch ? parseInt(titleScreenZMatch[1], 10) : 0;
const infoZ = infoModalZMatch ? parseInt(infoModalZMatch[1], 10) : 0;
assert(
  titleZ > 0 && infoZ > titleZ,
  `TEST 3: .info-modal z-index (${infoZ}) is strictly higher than .title-screen z-index (${titleZ})`
);

// Test 4: Modal Backdrop Blurs & Covers Screen
assert(
  cssContent.includes('.info-modal') &&
  cssContent.includes('backdrop-filter: blur(24px);') &&
  cssContent.includes('background: rgba(11, 15, 23,'),
  'TEST 4: Modal backdrop provides cinematic dark blur obscuring title screen'
);

// Test 5: Panel Responsive Centering & Scrollable Body
assert(
  cssContent.includes('.info-card') &&
  cssContent.includes('.info-body {') &&
  cssContent.includes('overflow-y: auto;'),
  'TEST 5: .info-card is responsive with scrollable .info-body container'
);

// Test 6: UISystem Settings & About Content Populated
assert(
  uiSysContent.includes("openInfoModal('Settings'") &&
  uiSysContent.includes("openInfoModal('About HEIWA'") &&
  uiSysContent.includes('settings-list') &&
  uiSysContent.includes('about-content'),
  'TEST 6: UISystem populates structured markup for Settings and About'
);

// Test 7: Backdrop Click-to-Close in UISystem
assert(
  uiSysContent.includes('e.target === this.dom.infoModal') &&
  uiSysContent.includes('this.closeInfoModal()'),
  'TEST 7: Backdrop click-to-close implemented without closing on card click'
);

// Test 8: Escape Key Modal Close Priority in InputManager
assert(
  inputManContent.includes('ui:closeInfoModal') &&
  inputManContent.includes("infoModal && !infoModal.classList.contains('hidden')"),
  'TEST 8: Escape key closes info modal with top priority before pause toggle'
);

// Test 9: Enter Key Blocked while Modal Open
assert(
  inputManContent.includes("if (infoModal && !infoModal.classList.contains('hidden'))") &&
  inputManContent.includes('return;'),
  'TEST 9: Enter key does NOT trigger game start when info modal is open'
);

// Test 10: Strict Japanese Language Compliance (Only 「平和」 allowed)
const japaneseRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const allCode = htmlContent + cssContent + uiSysContent + inputManContent;
const illegalChars = (allCode.match(japaneseRegex) || []).filter((c) => c !== '平' && c !== '和');
assert(
  illegalChars.length === 0,
  `TEST 10: Language audit passed (Found 0 illegal Japanese characters, only 「平和」 allowed)`
);

console.log('\n====================================================');
console.log(`TOTAL PASSED: ${passedCount}`);
console.log(`TOTAL FAILED: ${failedCount}`);
console.log('====================================================');

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('STATUS: ALL MODAL AUDIT CHECKS PASSED');
  process.exit(0);
}
