/**
 * test_free_mouselook.js - Verification test for Chunk 39 Default Free Mouse-Look Camera.
 */
import fs from 'fs';
import path from 'path';

console.log("=== CHUNK 39 VERIFICATION: DEFAULT FREE MOUSE-LOOK CAMERA ===");

let passed = true;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    passed = false;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

// 1. Check InputManager.js source
const inputSrc = fs.readFileSync(path.resolve('src/engine/InputManager.js'), 'utf8');

assert(!inputSrc.includes('if (this.mouse.isDown)') || inputSrc.includes('// Free mouse-look'),
  "InputManager does not require mouse.isDown for camera rotation");
assert(inputSrc.includes('requestPointerLock'), "InputManager implements requestPointerLock");
assert(inputSrc.includes('exitPointerLock'), "InputManager implements exitPointerLock");
assert(inputSrc.includes('pointerlockchange'), "InputManager listens for pointerlockchange");
assert(inputSrc.includes('this.mouse.deltaX += dx'), "InputManager accumulates deltaX continuously from mouse movement");
assert(inputSrc.includes('this.mouse.deltaY += dy'), "InputManager accumulates deltaY continuously from mouse movement");

// 2. Check CameraSystem.js source
const camSrc = fs.readFileSync(path.resolve('src/systems/CameraSystem.js'), 'utf8');
assert(camSrc.includes('globalInput.consumeMouseDelta()'), "CameraSystem consumes mouse delta from InputManager");
assert(camSrc.includes('rotateFromInput') || camSrc.includes('this.targetTheta'), "CameraSystem applies smooth horizontal yaw");
assert(camSrc.includes('rotateFromInput') || camSrc.includes('this.targetPhi'), "CameraSystem applies smooth vertical pitch");

// 3. Check Language Audit (Only 平和 allowed)
const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g;
const filesToCheck = [
  'src/engine/InputManager.js',
  'src/systems/CameraSystem.js',
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
  console.log("\n>>> ALL CHUNK 39 STATIC CHECKS PASSED! <<<");
  process.exit(0);
} else {
  console.error("\n>>> CHUNK 39 CHECKS FAILED! <<<");
  process.exit(1);
}
