import fs from 'fs';
import path from 'path';

console.log('====================================================');
console.log('HEIWA CHUNK 36 — BEGIN BUTTON HITBOX & POINTER AUDIT');
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

// 1. Read index.html and src/style.css
const htmlPath = path.resolve('index.html');
const cssPath = path.resolve('src/style.css');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const cssContent = fs.readFileSync(cssPath, 'utf8');

// Test 1: Button Semantic Element
assert(
  htmlContent.includes('<button id="btn-begin" class="btn-primary">'),
  'TEST 1: #btn-begin is a semantic <button> element in index.html'
);

// Test 2: Button Content Structure
assert(
  htmlContent.includes('<span class="btn-text">BEGIN</span>'),
  'TEST 2: #btn-begin contains primary text span "BEGIN"'
);

// Test 3: Title Screen Z-Index & Pointer Events
assert(
  cssContent.includes('.title-screen') &&
  cssContent.includes('z-index: 100;') &&
  cssContent.includes('pointer-events: auto;'),
  'TEST 3: .title-screen has elevated z-index (100) and pointer-events: auto'
);

// Test 4: Unified Button Target (.btn-primary * pointer-events: none)
assert(
  cssContent.includes('.btn-primary *') &&
  cssContent.includes('pointer-events: none;'),
  'TEST 4: .btn-primary child spans have pointer-events: none (prevents click fragmentation)'
);

// Test 5: Button Primary Pointer Events & Cursor
assert(
  cssContent.includes('.btn-primary {') &&
  cssContent.includes('pointer-events: auto;') &&
  cssContent.includes('cursor: pointer;'),
  'TEST 5: .btn-primary has pointer-events: auto and cursor: pointer'
);

// Test 6: Hidden class disables pointer events on all children
assert(
  cssContent.includes('.hidden,') &&
  cssContent.includes('.hidden *') &&
  cssContent.includes('pointer-events: none !important;'),
  'TEST 6: .hidden and .hidden * strictly enforce pointer-events: none !important'
);

// Test 7: Hidden class enforces visibility: hidden
assert(
  cssContent.includes('visibility: hidden !important;'),
  'TEST 7: .hidden enforces visibility: hidden !important (prevents hit-test interception)'
);

// Test 8: Language Audit
const japaneseRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const htmlMatches = (htmlContent.match(japaneseRegex) || []).filter((c) => c !== '平' && c !== '和');
const cssMatches = (cssContent.match(japaneseRegex) || []).filter((c) => c !== '平' && c !== '和');
assert(
  htmlMatches.length === 0 && cssMatches.length === 0,
  'TEST 8: Strict Japanese text rule maintained (Only 「平和」 allowed)'
);

console.log('\n====================================================');
console.log(`TOTAL PASSED: ${passedCount}`);
console.log(`TOTAL FAILED: ${failedCount}`);
console.log('====================================================');

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('STATUS: ALL BEGIN BUTTON AUDIT CHECKS PASSED');
  process.exit(0);
}
