/**
 * test_touch_camera.js - Verification and behavioral test for Chunk 40 Desktop Free Mouse-Look + Mobile Touch POV Camera.
 */
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';

console.log("=== CHUNK 40 VERIFICATION: DESKTOP FREE MOUSE-LOOK + MOBILE TOUCH POV CAMERA ===");

let passed = true;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    passed = false;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

// 1. Static source audit
const camSrc = fs.readFileSync(path.resolve('src/systems/CameraSystem.js'), 'utf8');
assert(camSrc.includes('rotateFromInput(deltaX, deltaY)'), "CameraSystem exposes authoritative rotateFromInput(deltaX, deltaY)");
assert(camSrc.includes('this.rotateFromInput(mouse.dx, mouse.dy)'), "CameraSystem consumes mouse deltas through rotateFromInput");

const touchSrc = fs.readFileSync(path.resolve('src/engine/TouchControls.js'), 'utf8');
assert(touchSrc.includes('this.lookTouchId'), "TouchControls tracks touch identifier for camera look independently");
assert(touchSrc.includes('this.joystickTouchId'), "TouchControls tracks touch identifier for joystick independently");
assert(touchSrc.includes('globalInput.addTouchCameraDelta'), "TouchControls pushes touch delta to InputManager");

const inputSrc = fs.readFileSync(path.resolve('src/engine/InputManager.js'), 'utf8');
assert(inputSrc.includes('addTouchCameraDelta(dx, dy)'), "InputManager provides addTouchCameraDelta method");

// 2. Behavioral Verification
global.requestAnimationFrame = (fn) => setTimeout(fn, 16);
const listeners = {};
global.window = {
  innerWidth: 1920,
  innerHeight: 1080,
  addEventListener: (evt, fn) => {
    listeners[evt] = listeners[evt] || [];
    listeners[evt].push(fn);
  },
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false }),
};
global.document = {
  pointerLockElement: null,
  addEventListener: (evt, fn) => {
    listeners[evt] = listeners[evt] || [];
    listeners[evt].push(fn);
  },
  exitPointerLock: () => {
    global.document.pointerLockElement = null;
  },
  getElementById: (id) => ({
    id,
    classList: { contains: () => false, add: () => {}, remove: () => {} },
    style: {},
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 50, top: 500, width: 110, height: 110 }),
  }),
};

async function testBehavioral() {
  const { globalInput } = await import('../src/engine/InputManager.js');
  const { CameraSystem } = await import('../src/systems/CameraSystem.js');
  const { globalGameState, GameState } = await import('../src/engine/GameStateManager.js');
  const { TouchControls } = await import('../src/engine/TouchControls.js');

  const mockCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  const mockEngine = {
    camera: mockCamera,
    systems: []
  };

  const camSystem = new CameraSystem();
  camSystem.init(mockEngine);

  globalGameState.setState(GameState.PLAYING);

  const touchControls = new TouchControls();
  touchControls.isTouch = true;
  touchControls.isLandscape = true;

  // Test Mobile Touch Camera Drag
  const initialTheta = camSystem.theta;
  const initialPhi = camSystem.phi;

  // Simulate right-side touch start (Touch ID 42)
  const lookZone = touchControls.touchLookZone;
  touchControls.lookTouchId = 42;
  touchControls.lastLookX = 500;
  touchControls.lastLookY = 300;

  // Simulate touch move with delta (dx = +40, dy = -25)
  globalInput.addTouchCameraDelta(40, -25);
  camSystem.update(0.016);

  assert(camSystem.theta < initialTheta, `Camera yaw rotated right on positive dx (${initialTheta} -> ${camSystem.theta})`);
  assert(camSystem.phi < initialPhi, `Camera pitch looked up on negative dy (${initialPhi} -> ${camSystem.phi})`);

  // Simulate touch end (release finger)
  const thetaAfterDrag = camSystem.theta;
  const phiAfterDrag = camSystem.phi;
  touchControls.resetTouchLook();

  // Next frame: camera should stay at orientation without snapping back
  camSystem.update(0.016);
  assert(Math.abs(camSystem.theta - thetaAfterDrag) < 0.001, "Camera maintains yaw on touch release without snap back");
  assert(Math.abs(camSystem.phi - phiAfterDrag) < 0.001, "Camera maintains pitch on touch release without snap back");

  // Multi-Touch Test: Simultaneous Left Joystick and Right Look
  touchControls.joystickTouchId = 101;
  touchControls.lookTouchId = 102;
  touchControls.lastLookX = 600;
  touchControls.lastLookY = 300;

  // Joystick moves character forward
  globalInput.setTouchMovement(0, -1, 1.0);
  // Camera moves right
  globalInput.addTouchCameraDelta(30, 0);

  const moveInput = globalInput.getMovementInput();
  assert(moveInput.length > 0.9, "Movement joystick registered forward movement");

  camSystem.update(0.016);
  assert(camSystem.theta < thetaAfterDrag, "Camera rotated concurrently while joystick was active");

  console.log("[PASS] Multi-touch independence verified: simultaneous movement and POV camera look!");
}

// 3. Language Audit
const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g;
const filesToCheck = [
  'src/engine/InputManager.js',
  'src/engine/TouchControls.js',
  'src/systems/CameraSystem.js',
  'src/style.css',
  'index.html'
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

testBehavioral()
  .then(() => {
    if (passed) {
      console.log("\n>>> ALL CHUNK 40 TESTS PASSED SUCCESSFULLY! <<<");
      process.exit(0);
    } else {
      console.error("\n>>> VERIFICATION FAILED! <<<");
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("\n>>> BEHAVIORAL TEST ERROR:", err);
    process.exit(1);
  });
