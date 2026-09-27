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

async function runChunk42Tests() {
  console.log('🧪 Starting CHUNK 42: Open-World Streaming & Mayank Car Test Suite...\n');

  // 1. Test SeededRandom & PRNG Determinism
  const { HEIWA_WORLD_SEED, getChunkRng, getTerrainHeight, isAuthoredRegion } = await import('../src/utils/SeededRandom.js');
  assert.strictEqual(typeof HEIWA_WORLD_SEED, 'number', 'HEIWA_WORLD_SEED must be a number');
  
  const rng1 = getChunkRng(5, -3, 100);
  const v1_a = rng1();
  const v1_b = rng1();
  
  const rng2 = getChunkRng(5, -3, 100);
  const v2_a = rng2();
  const v2_b = rng2();

  assert.strictEqual(v1_a, v2_a, 'Deterministic PRNG must yield identical values for identical chunk coords & subseed');
  assert.strictEqual(v1_b, v2_b, 'Deterministic PRNG sequence must be consistent');
  console.log('[PASS] 1. Deterministic PRNG seed & reproducibility verified.');

  // 2. Test Terrain Blending & Authored Area Protection
  assert.strictEqual(isAuthoredRegion(0, 0), true, 'Center (0,0) must be authored region');
  assert.strictEqual(isAuthoredRegion(100, 100), true, '(100, 100) must be authored region (|x|,|z| <= 140)');
  assert.strictEqual(isAuthoredRegion(200, 0), false, '(200, 0) must NOT be authored region');
  
  const hAuthored = getTerrainHeight(50, 50);
  assert.strictEqual(hAuthored, 0, 'Terrain height in authored region must be 0 for flat urban street grid');
  
  const hProcedural = getTerrainHeight(350, 350);
  assert.strictEqual(typeof hProcedural, 'number', 'Procedural terrain height must be a number');
  assert.ok(isFinite(hProcedural), 'Procedural terrain height must be finite');
  console.log('[PASS] 2. Authored region protection & continuous terrain height blending verified.');

  // 3. Test Engine & System Integration
  const { Engine } = await import('../src/engine/Engine.js');
  Engine.prototype.initRenderer = function() {
    this.renderer = { setSize: () => {}, setPixelRatio: () => {}, render: () => {}, shadowMap: {} };
  };
  const { WorldSystem } = await import('../src/systems/WorldSystem.js');
  const { WorldStreamingSystem } = await import('../src/world/WorldStreamingSystem.js');
  const { PlayerSystem } = await import('../src/systems/PlayerSystem.js');
  const { VehicleSystem } = await import('../src/entities/VehicleSystem.js');
  const { CameraSystem } = await import('../src/systems/CameraSystem.js');
  const { globalGameState, GameState } = await import('../src/engine/GameStateManager.js');

  const canvas = document.getElementById('webgl-canvas');
  const engine = new Engine(canvas);
  const worldSys = new WorldSystem();
  const streamingSys = new WorldStreamingSystem();
  const playerSys = new PlayerSystem();
  const vehicleSys = new VehicleSystem();
  const cameraSys = new CameraSystem();

  engine.registerSystem(worldSys);
  engine.registerSystem(streamingSys);
  engine.registerSystem(playerSys);
  engine.registerSystem(vehicleSys);
  engine.registerSystem(cameraSys);

  globalGameState.setState(GameState.PLAYING);

  // 4. Test World Streaming Lifecycle
  assert.ok(streamingSys.activeChunks.size >= 9, `Expected >= 9 active chunks around origin, got ${streamingSys.activeChunks.size}`);
  const originChunk = streamingSys.activeChunks.get('0,0');
  assert.ok(originChunk, 'Origin chunk (0,0) must be loaded');
  assert.strictEqual(originChunk.isAuthored, true, 'Origin chunk must be flagged as authored');
  assert.strictEqual(originChunk.buildings.length, 0, 'Origin chunk must not duplicate authored buildings');

  // Verify procedural chunk features (e.g., chunk 0, 2)
  const procChunk = streamingSys.activeChunks.get('0,2');
  assert.ok(procChunk, 'Procedural chunk (0,2) must be loaded in active radius');
  assert.ok(procChunk.terrainMesh, 'Procedural chunk (0,2) must have terrain mesh');
  assert.ok(procChunk.roadGroup, 'Procedural chunk (0,2) must have road geometry');

  const chunkColliders = worldSys.colliders.filter(c => c._chunkKey === '0,2');
  assert.ok(chunkColliders.length > 0, 'Procedural chunk (0,2) must register solid colliders into WorldSystem');
  console.log(`[PASS] 3. Procedural chunk streaming, road network & colliders verified (${chunkColliders.length} colliders in chunk 0,2).`);

  // 5. Test Streaming Lookahead Preloading & Unloading
  streamingSys.updateStreaming(new THREE.Vector3(0, 0, 260), new THREE.Vector3(0, 0, 15));
  const lookaheadChunk = streamingSys.activeChunks.get('0,3');
  assert.ok(lookaheadChunk, 'Lookahead vector must preload upcoming chunk (0,3)');

  // Unload chunk 0,3 and verify collider cleanup
  const countBefore = worldSys.colliders.filter(c => c._chunkKey === '0,3').length;
  streamingSys.unloadChunk('0,3');
  const countAfter = worldSys.colliders.filter(c => c._chunkKey === '0,3').length;
  assert.strictEqual(countAfter, 0, 'Unloading chunk must cleanly remove all registered colliders without memory leaks');
  console.log('[PASS] 4. Lookahead pre-generation & clean collider unregistration on chunk unload verified.');

  // 6. Test Mayank's Car System & Interaction Pipeline
  const { InteractionSystem } = await import('../src/systems/InteractionSystem.js');
  const interactionSys = new InteractionSystem();
  engine.registerSystem(interactionSys);
  interactionSys.registerTargets(vehicleSys.getInteractiveObjects());

  assert.ok(vehicleSys.carGroup, 'VehicleSystem must have modular carGroup mesh');
  assert.strictEqual(vehicleSys.state, 'ON_FOOT', 'Initial vehicle state must be ON_FOOT');
  assert.strictEqual(playerSys.isInVehicle, false, 'Player must initially be walking');

  // Verify driver entry anchor is registered
  const isRegistered = interactionSys.interactiveTargets.some(
    t => t === vehicleSys.driverEntryAnchor || t === vehicleSys.mesh || t.userData?.interactionType === 'vehicle'
  );
  assert.strictEqual(isRegistered, true, 'Car driver anchor must be registered in InteractionSystem');

  // Move player near driver's door
  const anchorPos = new THREE.Vector3();
  vehicleSys.getWorldDriverEntryPosition(anchorPos);
  playerSys.position.set(anchorPos.x - 0.5, 0, anchorPos.z);
  interactionSys.playerPos.copy(playerSys.position);
  interactionSys.update();

  assert.ok(interactionSys.currentNearestTarget, 'Car must be detected as nearest interactive target near driver door');

  // Enter Vehicle via interaction pipeline
  interactionSys.triggerInteraction();
  assert.strictEqual(vehicleSys.state, 'IN_VEHICLE', 'Vehicle state must transition to IN_VEHICLE');
  assert.strictEqual(playerSys.isInVehicle, true, 'Player must be flagged as in-vehicle');
  assert.strictEqual(cameraSys.mode, 'vehicle', 'CameraSystem must switch to vehicle camera mode');

  // Test Acceleration & Steering
  const startCarPos = vehicleSys.position.clone();
  for (let step = 0; step < 10; step++) {
    vehicleSys.drive(1, 0, false, 0.05); // throttle forward
  }
  assert.ok(vehicleSys.currentSpeed > 0, 'Vehicle speed must increase under forward throttle');
  assert.ok(vehicleSys.position.distanceTo(startCarPos) > 0.05, 'Vehicle position must advance');

  const headingBefore = vehicleSys.heading;
  for (let step = 0; step < 10; step++) {
    vehicleSys.drive(1, 1, false, 0.05); // steer right while moving
  }
  assert.notStrictEqual(vehicleSys.heading, headingBefore, 'Vehicle heading must rotate while steering');

  // Test Handbrake
  for (let step = 0; step < 25; step++) {
    vehicleSys.drive(0, 0, true, 0.05); // handbrake
  }
  assert.ok(Math.abs(vehicleSys.currentSpeed) < 0.1, 'Handbrake must bring car to rest');

  // Exit Vehicle via interaction pipeline
  interactionSys.triggerInteraction();
  assert.strictEqual(vehicleSys.state, 'ON_FOOT', 'Vehicle state must return to ON_FOOT');
  assert.strictEqual(playerSys.isInVehicle, false, 'Player must return to walking mode');
  assert.strictEqual(cameraSys.mode, 'normal', 'CameraSystem must return to normal walking mode');
  assert.ok(isFinite(playerSys.position.x) && isFinite(playerSys.position.z), 'Player position must be valid after exiting vehicle');
  console.log('[PASS] 5. Mayank Car interaction pipeline & driving lifecycle (ON_FOOT -> ENTER -> DRIVE -> STEER -> BRAKE -> EXIT) verified.');

  // 7. Test Language Rule
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
  console.log('[PASS] 6. Strict Japanese language audit passed: strictly 「平和」 only across all source files.');

  console.log('\n🎉 ALL CHUNK 42 OPEN-WORLD STREAMING & MAYANK CAR TESTS PASSED!\n');
}

runChunk42Tests().catch(err => {
  console.error('\n❌ CHUNK 42 TEST FAILED:', err);
  process.exit(1);
});
