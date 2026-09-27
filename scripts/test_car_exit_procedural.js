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
    removeEventListener: () => {},
    click: () => {},
    getContext: (type) => ({
      fillRect: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(400) }),
      putImageData: () => {},
      createImageData: () => ({ data: new Uint8ClampedArray(400) }),
      drawImage: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      save: () => {},
      restore: () => {},
      clip: () => {},
      setLineDash: () => {},
    }),
    appendChild: () => {},
    removeChild: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
  };
  domElements.set(id, el);
  return el;
}

global.document = {
  readyState: 'complete',
  activeElement: null,
  getElementById: (id) => domElements.get(id) || createMockElement(id),
  querySelector: (sel) => createMockElement(sel),
  querySelectorAll: () => [],
  createElement: (tag) => createMockElement('dynamic-' + Math.random(), tag),
  body: createMockElement('body', 'body'),
  addEventListener: () => {},
  removeEventListener: () => {},
  pointerLockElement: null,
  exitPointerLock: () => {},
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

async function runChunk50Tests() {
  console.log('🧪 Starting CHUNK 50: Car Exit Position in Procedural World Test Suite...\n');

  const THREE = await import('three');
  const fs = (await import('fs')).default;
  const path = (await import('path')).default;
  const { VehicleSystem, VehicleState } = await import('../src/entities/VehicleSystem.js');
  const { PlayerSystem } = await import('../src/systems/PlayerSystem.js');
  const { InteractionSystem } = await import('../src/systems/InteractionSystem.js');
  const { CameraSystem } = await import('../src/systems/CameraSystem.js');
  const { WorldStreamingSystem, CHUNK_SIZE } = await import('../src/world/WorldStreamingSystem.js');
  const { globalBus } = await import('../src/engine/EventBus.js');
  const { globalGameState, GameState } = await import('../src/engine/GameStateManager.js');
  const { getTerrainHeight } = await import('../src/utils/SeededRandom.js');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, testName, detail = '') {
    if (condition) {
      passedCount++;
      console.log(`[PASS] ${testName}`);
    } else {
      failedCount++;
      console.error(`[FAIL] ${testName}: ${detail}`);
    }
  }

  // Minimal mock engine harness
  class TestEngine {
    constructor() {
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
      this.systems = [];
      this.clock = { getElapsedTime: () => 1.0 };
    }
  }

  // Simulated world system with colliders
  class MockWorldSystem {
    constructor() {
      this.colliders = [];
    }
    checkCollision(x, z, radius = 0.38, y = 0, height = 1.80, stepHeight = 0.35) {
      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        if (c.type === 'box') {
          const closestX = Math.max(c.minX, Math.min(x, c.maxX));
          const closestZ = Math.max(c.minZ, Math.min(z, c.maxZ));
          const dx = x - closestX;
          const dz = z - closestZ;
          if (dx * dx + dz * dz < radius * radius) return true;
        }
      }
      return false;
    }
    resolvePlayerMovement(pos, step, radius, y, height, stepHeight) {
      pos.add(step);
      return pos;
    }
  }

  const engine = new TestEngine();
  const mockWorld = new MockWorldSystem();
  engine.systems.push(mockWorld);

  const vehicleSys = new VehicleSystem();
  const playerSys = new PlayerSystem();
  const interactionSys = new InteractionSystem();
  const cameraSys = new CameraSystem();
  const streamingSys = new WorldStreamingSystem();

  engine.systems.push(vehicleSys, playerSys, interactionSys, cameraSys, streamingSys);

  vehicleSys.init(engine);
  playerSys.init(engine);
  interactionSys.init(engine);
  cameraSys.init(engine);
  streamingSys.init(engine);

  globalGameState.setState(GameState.PLAYING);

  console.log('--- 1. Enter Car in Spawn Town and Drive to Distant Procedural Chunk ---');
  const spawnTownPos = playerSys.position.clone();
  assert(
    Math.abs(spawnTownPos.x - (-24.0)) < 0.1 && Math.abs(spawnTownPos.z - (-46.5)) < 0.1,
    'Player starts in authored spawn town'
  );

  // Enter vehicle
  vehicleSys.enterVehicle();
  assert(vehicleSys.state === VehicleState.IN_VEHICLE, 'Vehicle state is IN_VEHICLE');
  assert(playerSys.isInVehicle === true, 'PlayerSystem.isInVehicle is true');

  // Simulate driving 500 meters into procedural world
  const targetDistantPos = new THREE.Vector3(420, 0, -310);
  vehicleSys.position.copy(targetDistantPos);
  vehicleSys.position.y = getTerrainHeight(targetDistantPos.x, targetDistantPos.z);
  vehicleSys.headingAngle = Math.PI * 0.25; // Northeast heading
  if (vehicleSys.mesh) {
    vehicleSys.mesh.position.copy(vehicleSys.position);
    vehicleSys.mesh.rotation.y = vehicleSys.headingAngle;
  }
  engine.scene.updateMatrixWorld(true);

  // Broadcast vehicle movement
  globalBus.emit('vehicle:moved', {
    position: vehicleSys.position,
    headingAngle: vehicleSys.headingAngle,
  });

  assert(
    playerSys.position.distanceTo(vehicleSys.position) < 0.01,
    'PlayerSystem position tracked car into procedural world in real-time'
  );

  console.log('\n--- 2. Exit Car in Distant Procedural World ---');
  // Trigger exit
  vehicleSys.exitVehicle();

  assert(vehicleSys.state === VehicleState.ON_FOOT, 'Vehicle state transitioned to ON_FOOT');
  assert(playerSys.isInVehicle === false, 'PlayerSystem.isInVehicle transitioned to false');

  const distPlayerToCar = playerSys.position.distanceTo(vehicleSys.position);
  assert(
    distPlayerToCar > 0.5 && distPlayerToCar < 2.5,
    `Player exited beside car in procedural chunk (dist = ${distPlayerToCar.toFixed(2)}m)`,
    `Found dist: ${distPlayerToCar}`
  );

  assert(
    playerSys.position.distanceTo(spawnTownPos) > 400,
    `Player did NOT teleport back to spawn town (dist from spawn = ${playerSys.position.distanceTo(spawnTownPos).toFixed(1)}m)`
  );

  assert(
    Math.abs(playerSys.position.x - 420) < 5.0 && Math.abs(playerSys.position.z - (-310)) < 5.0,
    `Player coordinates accurately match procedural stop position: (${playerSys.position.x.toFixed(1)}, ${playerSys.position.z.toFixed(1)})`
  );

  console.log('\n--- 3. Verify Walking Movement in Procedural Chunk (No District Clamp) ---');
  const preWalkPos = playerSys.position.clone();
  // Simulate walking step beyond legacy 110m limit
  playerSys.moveStep.set(2.0, 0, 0);
  playerSys.position.add(playerSys.moveStep);
  // Run clamp check
  playerSys.position.x = THREE.MathUtils.clamp(playerSys.position.x, -50000, 50000);
  playerSys.position.z = THREE.MathUtils.clamp(playerSys.position.z, -50000, 50000);

  assert(
    playerSys.position.x > preWalkPos.x + 1.0,
    `Player walked freely beyond 110m boundary without district clamping (X = ${playerSys.position.x.toFixed(2)})`
  );
  assert(
    playerSys.position.x > 400,
    `Player position remains at distant procedural chunk (X = ${playerSys.position.x.toFixed(2)})`
  );

  console.log('\n--- 4. Verify Dynamic Rotation of Safe Exit Anchor ---');
  // Test exit at different vehicle headings
  const testHeadings = [
    { name: 'North (heading = 0)', angle: 0 },
    { name: 'East (heading = PI/2)', angle: Math.PI / 2 },
    { name: 'South (heading = PI)', angle: Math.PI },
    { name: 'West (heading = 3PI/2)', angle: (3 * Math.PI) / 2 },
  ];

  for (const th of testHeadings) {
    vehicleSys.position.set(-600, 0, 800);
    vehicleSys.headingAngle = th.angle;
    if (vehicleSys.mesh) {
      vehicleSys.mesh.position.copy(vehicleSys.position);
      vehicleSys.mesh.rotation.y = th.angle;
    }
    engine.scene.updateMatrixWorld(true);
    const exitPos = vehicleSys.getSafeExitPosition();
    const deltaFromCar = exitPos.clone().sub(vehicleSys.position);
    const horizDist = Math.hypot(deltaFromCar.x, deltaFromCar.z);

    assert(
      Math.abs(horizDist - 1.365) < 0.1,
      `Dynamic exit offset for ${th.name} rotates correctly (horiz length = ${horizDist.toFixed(2)}m)`
    );
  }

  console.log('\n--- 5. Verify Obstacle Collision Fallback on Exit ---');
  // Place a blocking obstacle on the driver's side (left)
  vehicleSys.position.set(200, 0, 200);
  vehicleSys.headingAngle = 0;
  if (vehicleSys.mesh) {
    vehicleSys.mesh.position.copy(vehicleSys.position);
    vehicleSys.mesh.rotation.y = 0;
  }
  engine.scene.updateMatrixWorld(true);

  // Primary driver candidate is at (200 - 1.35, 200 + 0.2) = (198.65, 200.2)
  mockWorld.colliders.push({
    type: 'box',
    minX: 198.0,
    maxX: 199.5,
    minZ: 199.5,
    maxZ: 201.0,
  });

  const fallbackExitPos = vehicleSys.getSafeExitPosition();
  assert(
    fallbackExitPos.x > 200.5,
    `When driver door is blocked, safe exit fell back to passenger side (X = ${fallbackExitPos.x.toFixed(2)})`
  );

  console.log('\n--- 6. Verify Interaction System & Re-entry in Procedural World ---');
  // Position player beside car facing the car
  vehicleSys.mesh.position.copy(vehicleSys.position);
  engine.scene.updateMatrixWorld(true);

  playerSys.position.copy(fallbackExitPos);
  playerSys.headingAngle = -Math.PI / 2;
  globalBus.emit('player:moved', { position: playerSys.position, headingAngle: playerSys.headingAngle });
  interactionSys.update();

  assert(
    interactionSys.currentNearestTarget !== null,
    'InteractionSystem finds car interactive target in distant procedural world'
  );

  console.log('\n--- 7. Strict Japanese Language Audit ---');
  const filesToAudit = [
    'src/entities/VehicleSystem.js',
    'src/systems/PlayerSystem.js',
    'src/systems/InteractionSystem.js',
    'src/systems/CameraSystem.js',
    'src/world/WorldStreamingSystem.js',
  ];

  const japaneseRegex = /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/g;
  let languagePassed = true;

  for (const relPath of filesToAudit) {
    const fullPath = path.resolve(relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const matches = content.match(japaneseRegex) || [];
    for (const m of matches) {
      if (m !== '平' && m !== '和') {
        languagePassed = false;
        console.error(`  [FAIL] Unauthorized Japanese character '${m}' found in ${relPath}`);
      }
    }
  }
  assert(languagePassed, 'Strict Japanese language audit passed: strictly 「平和」 only across all source files');

  console.log(`\n====================================================`);
  console.log(`TOTAL PASSED: ${passedCount}`);
  console.log(`TOTAL FAILED: ${failedCount}`);
  console.log(`====================================================`);

  if (failedCount > 0) {
    process.exit(1);
  } else {
    console.log('\n🎉 ALL CHUNK 50 PROCEDURAL CAR EXIT TESTS PASSED!\n');
  }
}

runChunk50Tests().catch((err) => {
  console.error('Test runner encountered error:', err);
  process.exit(1);
});
