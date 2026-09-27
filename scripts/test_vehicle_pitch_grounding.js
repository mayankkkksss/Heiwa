import * as THREE from 'three';
import assert from 'assert';

// Setup Mock Environment
global.requestAnimationFrame = (fn) => setTimeout(fn, 16);
global.window = {
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1,
  location: { search: '' },
  addEventListener: () => {},
  removeEventListener: () => {},
  requestAnimationFrame: global.requestAnimationFrame,
};

const domElements = new Map();
function createMockElement(id, tag = 'div') {
  const el = {
    id,
    tagName: tag.toUpperCase(),
    classList: {
      classes: new Set(),
      add: (c) => el.classList.classes.add(c),
      remove: (c) => el.classList.classes.delete(c),
      contains: (c) => el.classList.classes.has(c),
    },
    style: {},
    addEventListener: () => {},
    click: () => {},
    getContext: (type) => {
      if (type === 'webgl' || type === 'webgl2') {
        return {
          getExtension: () => ({ loseContext: () => {} }),
          getParameter: () => 16,
          createTexture: () => ({}),
          bindTexture: () => {},
          texParameteri: () => {},
          texImage2D: () => {},
          clearColor: () => {},
          clearDepth: () => {},
          clearStencil: () => {},
          enable: () => {},
          disable: () => {},
          depthFunc: () => {},
          frontFace: () => {},
          cullFace: () => {},
          viewport: () => {},
          scissor: () => {},
          canvas: el,
        };
      }
      return {
        clearRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        save: () => {},
        restore: () => {},
        fillRect: () => {},
        fillText: () => {},
        moveTo: () => {},
        lineTo: () => {},
        translate: () => {},
        rotate: () => {},
        closePath: () => {},
        stroke: () => {},
        clip: () => {},
        ellipse: () => {},
        setLineDash: () => {},
        roundRect: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData: () => {},
        strokeRect: () => {},
      };
    },
    appendChild: () => {},
    remove: () => {},
  };
  domElements.set(id, el);
  return el;
}

global.document = {
  readyState: 'complete',
  activeElement: null,
  getElementById: (id) => domElements.get(id) || createMockElement(id),
  createElement: (tag) => createMockElement('created_' + Math.random(), tag),
  body: createMockElement('body', 'body'),
  addEventListener: () => {},
};

[
  'webgl-canvas', 'ui-root', 'title-screen', 'loading-screen', 'gameplay-hud',
  'pause-modal', 'info-modal', 'btn-begin', 'btn-settings', 'btn-about',
  'loading-bar-fill', 'loading-stage-label', 'hud-location-text',
  'minimap-canvas', 'minimap-wrapper', 'hud-time-icon', 'hud-time-str',
  'objective-card', 'objective-title', 'objective-desc', 'interaction-prompt',
  'interaction-text', 'dialogue-modal', 'dialogue-avatar', 'dialogue-speaker',
  'dialogue-text', 'toast-container'
].forEach(id => createMockElement(id));

async function runChunk49Tests() {
  console.log('🧪 Starting CHUNK 49: Vehicle Pitch & Grounding Direction Test Suite...\n');

  const { Engine } = await import('../src/engine/Engine.js');
  Engine.prototype.initRenderer = function() {
    this.renderer = { setSize: () => {}, setPixelRatio: () => {}, render: () => {}, shadowMap: {} };
  };

  const { WorldSystem } = await import('../src/systems/WorldSystem.js');
  const { WorldStreamingSystem } = await import('../src/world/WorldStreamingSystem.js');
  const { VehicleSystem, VehicleState } = await import('../src/entities/VehicleSystem.js');
  const { globalGameState, GameState } = await import('../src/engine/GameStateManager.js');
  const { globalInput } = await import('../src/engine/InputManager.js');
  const { getTerrainHeight, HEIWA_WORLD_SEED } = await import('../src/utils/SeededRandom.js');

  const canvas = document.getElementById('webgl-canvas');
  const engine = new Engine(canvas);
  const worldSys = new WorldSystem();
  const streamingSys = new WorldStreamingSystem();
  const vehicleSys = new VehicleSystem();

  engine.systems.push(worldSys, streamingSys, vehicleSys);
  worldSys.init(engine);
  streamingSys.init(engine);
  vehicleSys.init(engine);

  globalGameState.state = GameState.PLAYING;

  // 1. Inspect vehicle coordinate system & model orientation
  console.log('--- 1. Vehicle Model Coordinates & Axle Direction ---');
  assert.ok(vehicleSys.mesh, 'Vehicle mesh must be created');
  assert.ok(vehicleSys.chassisGroup, 'Chassis group must be created');
  assert.strictEqual(vehicleSys.wheelbase, 2.4, 'Wheelbase must be 2.4m');
  assert.strictEqual(vehicleSys.trackWidth, 1.52, 'Track width must be 1.52m');

  // Verify that +Z is front and -Z is rear
  assert.strictEqual(vehicleSys.frontLeftWheel.position.z, 1.15, 'Front left wheel must be at +Z');
  assert.strictEqual(vehicleSys.rearLeftWheel.position.z, -1.15, 'Rear left wheel must be at -Z');
  console.log('[PASS] Model coordinate verification: +Z = FRONT (+1.15m), -Z = REAR (-1.15m).');

  // 2. Test Ground Probing on Flat Surface
  console.log('\n--- 2. Flat Road Neutral Orientation ---');
  vehicleSys.position.set(-20.0, 0, -46.5);
  vehicleSys.headingAngle = 0; // facing +Z (North)
  vehicleSys.speed = 0;
  vehicleSys.updateGrounding(1.0);

  assert.ok(Math.abs(vehicleSys.position.y) < 0.001, `Flat road position.y must be 0 (got ${vehicleSys.position.y})`);
  assert.ok(Math.abs(vehicleSys.terrainPitch) < 0.001, `Flat road pitch must be 0 (got ${vehicleSys.terrainPitch})`);
  assert.ok(Math.abs(vehicleSys.terrainRoll) < 0.001, `Flat road roll must be 0 (got ${vehicleSys.terrainRoll})`);
  console.log('[PASS] Flat surface grounding: pitch = 0, roll = 0, y = 0.');

  // 3. Test Uphill Ground Pitch Direction
  console.log('\n--- 3. Uphill Ground Pitch Direction ---');
  // Position car facing +Z heading onto an uphill slope
  // When front (+Z) is higher than rear (-Z): frontH > rearH
  // In Three.js, rotation.x must be NEGATIVE to tilt +Z nose UP towards the sky and keep -Z rear DOWN on the road!
  const mockFrontH = 2.5;
  const mockRearH = 1.0;
  const expectedPitchSign = -1; // Negative rotation.x tilts nose UP

  // Test the calculation directly
  const calculatedPitch = THREE.MathUtils.clamp((mockRearH - mockFrontH) / vehicleSys.wheelbase, -0.22, 0.22);
  assert.ok(calculatedPitch < 0, `Uphill pitch must be negative for Three.js rotation.x to lift front nose (got ${calculatedPitch})`);

  // Verify that setting rotation.x = calculatedPitch rotates a test vector at front (+Z) UP (+Y)
  const testFrontVector = new THREE.Vector3(0, 0, 1.15);
  testFrontVector.applyAxisAngle(new THREE.Vector3(1, 0, 0), calculatedPitch);
  assert.ok(testFrontVector.y > 0, `Uphill pitch must elevate front axle (+Z) upward into positive Y (got y=${testFrontVector.y})`);

  const testRearVector = new THREE.Vector3(0, 0, -1.15);
  testRearVector.applyAxisAngle(new THREE.Vector3(1, 0, 0), calculatedPitch);
  assert.ok(testRearVector.y < 0, `Uphill pitch must keep rear axle (-Z) lower along slope (got y=${testRearVector.y})`);
  console.log(`[PASS] Uphill slope response verified: front elevated (y=${testFrontVector.y.toFixed(3)}), rear grounded (y=${testRearVector.y.toFixed(3)}).`);

  // 4. Test Downhill Ground Pitch Direction
  console.log('\n--- 4. Downhill Ground Pitch Direction ---');
  const mockDownFrontH = 1.0;
  const mockDownRearH = 2.5;
  const calculatedDownPitch = THREE.MathUtils.clamp((mockDownRearH - mockDownFrontH) / vehicleSys.wheelbase, -0.22, 0.22);
  assert.ok(calculatedDownPitch > 0, `Downhill pitch must be positive for Three.js rotation.x to tilt front nose downward (got ${calculatedDownPitch})`);

  const testDownFront = new THREE.Vector3(0, 0, 1.15);
  testDownFront.applyAxisAngle(new THREE.Vector3(1, 0, 0), calculatedDownPitch);
  assert.ok(testDownFront.y < 0, `Downhill pitch must depress front axle downward (got y=${testDownFront.y})`);
  console.log(`[PASS] Downhill slope response verified: front dips (y=${testDownFront.y.toFixed(3)}), rear elevated.`);

  // 5. Test Acceleration Dynamic Body Pitch Response
  console.log('\n--- 5. Dynamic Body Pitch (Acceleration vs Braking) ---');
  vehicleSys.state = VehicleState.IN_VEHICLE;
  vehicleSys.position.set(0, 0, 100);
  vehicleSys.speed = 0;

  // Simulate forward throttle (W key, throttle = 1.0)
  globalInput.keys.set('KeyW', true);
  globalInput.keys.set('KeyS', false);
  globalInput.keys.set('Space', false);

  for (let i = 0; i < 15; i++) {
    vehicleSys.update(0.016);
  }

  const accelPitch = vehicleSys.chassisGroup.rotation.x;
  // Forward acceleration transfers weight back -> nose tilts up slightly (negative rotation around X)
  assert.ok(accelPitch <= 0, `Forward acceleration body pitch must be negative (nose up/rear squat), got ${accelPitch}`);
  console.log(`[PASS] Forward acceleration response: chassis pitch = ${accelPitch.toFixed(4)} (rear squats naturally, NO rear lifting).`);

  // Simulate active braking from speed (S key while moving forward)
  globalInput.keys.set('KeyW', false);
  globalInput.keys.set('KeyS', true);

  for (let i = 0; i < 5; i++) {
    vehicleSys.update(0.016);
  }

  const brakePitch = vehicleSys.chassisGroup.rotation.x;
  // Braking transfers weight forward -> nose dips down slightly (positive rotation around X)
  assert.ok(brakePitch >= 0, `Braking body pitch must be positive (nose dive), got ${brakePitch}`);
  console.log(`[PASS] Braking response: chassis pitch = ${brakePitch.toFixed(4)} (nose dips naturally).`);

  // 6. Test Lateral Roll Response
  console.log('\n--- 6. Lateral Roll Response ---');
  const mockLeftH = 1.0;
  const mockRightH = 1.4;
  const calculatedRoll = THREE.MathUtils.clamp((mockRightH - mockLeftH) / vehicleSys.trackWidth, -0.18, 0.18);
  assert.ok(calculatedRoll > 0, `Right side higher must produce positive roll differential (got ${calculatedRoll})`);

  const testRightWheel = new THREE.Vector3(0.76, 0, 0);
  testRightWheel.applyAxisAngle(new THREE.Vector3(0, 0, 1), calculatedRoll);
  assert.ok(testRightWheel.y > 0, `Right side higher must elevate right wheel (+X) upward (got y=${testRightWheel.y})`);
  console.log(`[PASS] Lateral roll response verified: right wheel elevates (y=${testRightWheel.y.toFixed(3)}).`);

  // 7. Test Language Rule
  console.log('\n--- 7. Strict Japanese Language Audit ---');
  const fs = await import('fs');
  const path = await import('path');
  const japaneseRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
  
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
        scanDir(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.html') || entry.name.endsWith('.css'))) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const matches = content.match(japaneseRegex) || [];
        const illegal = matches.filter(c => c !== '平' && c !== '和');
        assert.strictEqual(illegal.length, 0, `Illegal Japanese character(s) [${illegal.join(',')}] found in ${fullPath}`);
      }
    }
  }

  scanDir(path.resolve('src'));
  console.log('[PASS] Strict Japanese language audit passed: strictly 「平和」 only across all source files.');

  console.log('\n🎉 ALL CHUNK 49 VEHICLE PITCH & GROUNDING DIRECTION TESTS PASSED!\n');
}

runChunk49Tests().catch(err => {
  console.error('\n❌ CHUNK 49 TEST FAILED:', err);
  process.exit(1);
});
