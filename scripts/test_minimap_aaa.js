/**
 * test_minimap_aaa.js - Verification test for Chunk 38 AAA-style Minimap Toggle & Directional Arrow.
 */
import fs from 'fs';
import path from 'path';

console.log("=== CHUNK 38 VERIFICATION: AAA MINIMAP TOGGLE & DIRECTIONAL ARROW ===");

let passed = true;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    passed = false;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

// 1. Check index.html
const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
assert(indexHtml.includes('id="minimap-wrapper"'), "index.html has #minimap-wrapper");
assert(indexHtml.includes('id="minimap-toggle-hint"'), "index.html has #minimap-toggle-hint");
assert(indexHtml.includes('id="minimap-canvas"'), "index.html has #minimap-canvas");

// 2. Check src/style.css
const styleCss = fs.readFileSync(path.resolve('src/style.css'), 'utf8');
assert(styleCss.includes('.minimap-wrapper'), "style.css defines .minimap-wrapper");
assert(styleCss.includes('.minimap-wrapper.expanded'), "style.css defines .minimap-wrapper.expanded transition styles");
assert(styleCss.includes('pointer-events: auto'), "style.css ensures minimap captures pointer events");

// 3. Check InputManager.js
const inputManager = fs.readFileSync(path.resolve('src/engine/InputManager.js'), 'utf8');
assert(inputManager.includes('toggleMinimap') || inputManager.includes('KeyM'), "InputManager handles KeyM / toggleMinimap");
assert(inputManager.includes('ui:toggleMinimap'), "InputManager emits 'ui:toggleMinimap'");

// 4. Check UISystem.js
const uiSystem = fs.readFileSync(path.resolve('src/systems/UISystem.js'), 'utf8');
assert(uiSystem.includes('toggleMinimap'), "UISystem defines toggleMinimap method");
assert(uiSystem.includes('isMinimapExpanded'), "UISystem manages isMinimapExpanded state");
assert(uiSystem.includes('pointerdown'), "UISystem handles pointerdown on minimap to stop camera conflict");
assert(uiSystem.includes('Math.PI - this.playerHeading'), "UISystem renders directional arrow with correct Math.PI - this.playerHeading transform");
assert(uiSystem.includes('ctx.moveTo(0, -arrL)') && uiSystem.includes('ctx.lineTo(arrW, arrL - notch)'), "UISystem draws vector chevron directional arrow");

// 5. Check Language Rule: ONLY 平和 in Japanese allowed
const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g;
const filesToCheck = [
  'index.html',
  'src/style.css',
  'src/engine/InputManager.js',
  'src/systems/UISystem.js'
];

for (const relPath of filesToCheck) {
  const content = fs.readFileSync(path.resolve(relPath), 'utf8');
  const matches = content.match(japaneseRegex) || [];
  for (const char of matches) {
    if (char !== '平' && char !== '和') {
      assert(false, `Unauthorized Japanese character '${char}' found in ${relPath}`);
    }
  }
}
console.log("[PASS] Japanese language check: strictly '平和' only across all modified files.");

if (passed) {
  console.log("\n>>> ALL CHUNK 38 VERIFICATIONS PASSED SUCCESSFULLY! <<<");
  process.exit(0);
} else {
  console.error("\n>>> VERIFICATION FAILED! <<<");
  process.exit(1);
}
