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

  // 7. CHUNK 45 Detailed Vehicle Driving Physics & Gated Reverse
  console.log('\n--- Chunk 45 Vehicle Driving & Steering Polish Tests ---');
  
  // Test forward acceleration on clear open road
  vehicleSys.state = 'IN_VEHICLE';
  vehicleSys.position.set(0, 0, 50);
  vehicleSys.headingAngle = 0; // facing +Z along main arterial road
  vehicleSys.speed = 0;
  for (let i = 0; i < 20; i++) {
    vehicleSys.drive(1.0, 0, false, 0.05); // W key
  }
  assert.ok(vehicleSys.speed > 0, 'Car must accelerate forward with positive throttle');
  assert.ok(vehicleSys.speed <= vehicleSys.maxSpeed, 'Car speed must respect maxSpeed');

  // Test forward braking on S key (must not reverse while moving forward fast)
  const highSpeed = vehicleSys.speed;
  vehicleSys.drive(-1.0, 0, false, 0.05); // S key once
  assert.ok(vehicleSys.speed < highSpeed, 'Pressing S while moving forward must apply active brakes');
  assert.ok(vehicleSys.speed >= 0, 'Pressing S once from high speed must not instantly jump into reverse gear');

  // Brake until stopped
  while (vehicleSys.speed > 0.15) {
    vehicleSys.drive(-1.0, 0, false, 0.05);
  }
  // Now pressing S while stopped should enter reverse
  for (let i = 0; i < 15; i++) {
    vehicleSys.drive(-1.0, 0, false, 0.05);
  }
  assert.ok(vehicleSys.speed < 0, 'Car must reverse when S is pressed from stopped state');
  assert.ok(vehicleSys.speed >= vehicleSys.maxReverseSpeed, 'Car reverse speed must not exceed maxReverseSpeed');

  // Test active brake from reverse with W key
  vehicleSys.drive(1.0, 0, false, 0.05); // W key while reversing
  assert.ok(vehicleSys.speed > vehicleSys.maxReverseSpeed, 'Pressing W while reversing must actively brake towards 0');

  // Test Speed-dependent steering curves
  vehicleSys.speed = 0.5; // low parking speed
  vehicleSys.drive(0, 1.0, false, 0.016);
  const lowSpeedSteer = Math.abs(vehicleSys.steerAngle);
  
  vehicleSys.speed = 12.0; // high cruising speed
  vehicleSys.drive(0, 1.0, false, 0.016);
  const highSpeedSteer = Math.abs(vehicleSys.steerAngle);
  assert.ok(lowSpeedSteer >= highSpeedSteer, 'High speed steering angle must be slightly tightened compared to low speed for stability');

  // 8. Test Obstacle Collision Stopping & Wall Sliding
  console.log('\n--- Chunk 45 Multi-Point Collision & Obstacle Tests ---');
  // Register a solid tree cylinder obstacle at (0, 70) with radius 0.6
  worldSys.colliders.push({
    type: 'cylinder',
    cx: 0,
    cz: 70,
    radius: 0.6,
    minY: 0,
    maxY: 5.0,
    category: 'tree',
  });

  // Position car at (0, 65) facing +Z directly at tree
  vehicleSys.position.set(0, 0, 65.0);
  vehicleSys.headingAngle = 0; // facing +Z directly at tree
  vehicleSys.speed = 8.0;

  // Drive straight into tree
  for (let s = 0; s < 10; s++) {
    vehicleSys.drive(1.0, 0, false, 0.05);
  }
  // Car must be stopped by the tree and not tunnel through z = 70
  assert.ok(vehicleSys.position.z < 69.5, 'Vehicle collision must prevent tunneling through solid tree obstacle');
  console.log('[PASS] Multi-point collision successfully halted car before tree obstacle without tunneling.');

  // 9. Test Multi-Chunk Boundary Traversal & Safe Streaming
  console.log('\n--- Chunk 45/46 Multi-Chunk Boundary Traversal Tests ---');
  vehicleSys.position.set(0, 0, 50); // Inside authored area
  streamingSys.updateStreaming(vehicleSys.position, new THREE.Vector3(0, 0, 14));

  // Drive car across multiple chunks: chunk 1 (z=100), chunk 2 (z=200), chunk 3 (z=300)
  for (let targetZ = 80; targetZ <= 320; targetZ += 40) {
    vehicleSys.position.set(0, 0, targetZ);
    streamingSys.updateStreaming(vehicleSys.position, new THREE.Vector3(0, 0, 14));
    streamingSys.processGenerationQueue(10);
  }

  const chunk03 = streamingSys.activeChunks.get('0,3');
  assert.ok(chunk03, 'Chunk (0,3) must be active while car is in that region');
  assert.ok(chunk03.roads && chunk03.roads.length > 0, 'Chunk (0,3) must have procedural road network');

  // Verify authored zone is never unloaded
  const authoredChunk = streamingSys.activeChunks.get('0,0');
  assert.ok(authoredChunk, 'Authored chunk (0,0) must never be unloaded');
  assert.strictEqual(authoredChunk.isAuthored, true, 'Authored chunk must retain isAuthored true');
  console.log('[PASS] Driven across multiple chunk boundaries seamlessly; road continuity and authored chunk safety verified.');

  // 10. CHUNK 46: Land-Use Biomes, Road Hierarchy, Horizon Scenery & Adjacency Validation
  console.log('\n--- Chunk 46 Procedural World Quality & Horizon Scenery Tests ---');
  const { getLandUseZone, getChunkRoadConfig, LandUseZone, getChunkDestination, DestinationType, DESTINATION_META } = await import('../src/utils/SeededRandom.js');

  // Test Land Use Zoning
  const zoneSuburban = getLandUseZone(1, 1);
  assert.strictEqual(zoneSuburban, LandUseZone.SUBURBAN, 'Close-in chunk (1,1) must be Suburban Outskirts');

  const zoneFar = getLandUseZone(8, 8);
  assert.ok(typeof zoneFar === 'string', 'Distant chunk must have valid land use zone');

  // Test Road Hierarchy
  const roadCfgOrigin = getChunkRoadConfig(0, 3);
  assert.strictEqual(roadCfgOrigin.isMainArterialNS, true, 'Chunk (0,3) along X=0 must be Primary Arterial Highway');

  // Test Distant Horizon Scenery
  assert.ok(streamingSys.horizonMesh, 'WorldStreamingSystem must have distant horizon mountain scenery mesh');
  assert.ok(streamingSys.horizonMesh.children.length > 0, 'Horizon scenery must contain mountain geometry');

  // Test Chunk Adjacency Validation
  const adjResult = streamingSys.validateChunkAdjacency('0,2');
  assert.strictEqual(adjResult.valid, true, 'Chunk (0,2) must pass adjacency continuity validation');
  console.log('[PASS] Land-use zoning, road hierarchy, distant horizon scenery & chunk adjacency validation verified.');

  // 11. CHUNK 47: Procedural World Exploration Landmarks & Road Destination System
  console.log('\n--- Chunk 47 World Exploration Landmarks & Destinations Tests ---');

  // 11.1 Determinism & Authored Region Protection
  const destAuthored = getChunkDestination(0, 0, HEIWA_WORLD_SEED);
  assert.strictEqual(destAuthored, null, 'Authored starting chunk (0,0) must never generate procedural destinations');

  const destAuthoredCorner = getChunkDestination(1, 1, HEIWA_WORLD_SEED);
  assert.strictEqual(destAuthoredCorner, null, 'Authored region boundary chunk (1,1) must never generate procedural destinations');

  // 11.2 Check deterministic repeatability
  const destA = getChunkDestination(2, 4, HEIWA_WORLD_SEED);
  const destB = getChunkDestination(2, 4, HEIWA_WORLD_SEED);
  if (destA) {
    assert.deepStrictEqual(destA, destB, 'Destination for (2,4) must be 100% deterministic');
  }

  // 11.3 Archetype Diversity
  const foundTypes = new Set();
  for (let cx = -12; cx <= 12; cx++) {
    for (let cz = -12; cz <= 12; cz++) {
      const d = getChunkDestination(cx, cz, HEIWA_WORLD_SEED);
      if (d) {
        foundTypes.add(d.type);
        assert.ok(d.name && typeof d.name === 'string', 'Destination must have English name');
        assert.ok(d.discoveryRadius > 0, 'Destination must have positive discovery radius');
        assert.ok(d.color && d.color.startsWith('#'), 'Destination must have hex color for minimap');
        assert.ok(d.icon, 'Destination must have icon');
      }
    }
  }

  const expectedTypes = [
    DestinationType.SCENIC_VIEWPOINT,
    DestinationType.RIVERSIDE_REST,
    DestinationType.SMALL_FARM,
    DestinationType.FOREST_CLEARING,
    DestinationType.VILLAGE_CLUSTER,
    DestinationType.SMALL_COMMERCIAL_CLUSTER,
    DestinationType.QUIET_PARK,
    DestinationType.BRIDGE_CROSSING,
  ];

  for (const expType of expectedTypes) {
    assert.ok(foundTypes.has(expType), `Archetype ${expType} must be generated across world seed`);
  }
  console.log(`[PASS] Verified all 8 destination archetypes generated deterministically: ${Array.from(foundTypes).join(', ')}`);

  // 11.4 Destination Chunk Generation & Collision Registration
  let testChunkKey = null;
  let testDestCoord = null;
  for (let cx = 2; cx <= 8; cx++) {
    for (let cz = 2; cz <= 8; cz++) {
      const d = getChunkDestination(cx, cz, HEIWA_WORLD_SEED);
      if (d) {
        testChunkKey = `${cx},${cz}`;
        testDestCoord = { cx, cz, d };
        break;
      }
    }
    if (testChunkKey) break;
  }

  assert.ok(testChunkKey, 'Must find a valid test chunk with destination');
  
  // Stream to this chunk
  const destWorldPos = new THREE.Vector3(testDestCoord.cx * 100, 0, testDestCoord.cz * 100);
  const collidersBefore = worldSys.colliders.length;
  
  streamingSys.updateStreaming(destWorldPos, new THREE.Vector3(0, 0, 0));
  streamingSys.processGenerationQueue(20);

  const activeDestChunk = streamingSys.activeChunks.get(testChunkKey);
  assert.ok(activeDestChunk, `Chunk ${testChunkKey} must be active`);
  assert.ok(activeDestChunk.destination, 'Active chunk must contain destination object');
  assert.strictEqual(activeDestChunk.destination.type, testDestCoord.d.type, 'Active chunk destination type must match metadata');
  assert.ok(activeDestChunk.destination.hasRoadConnection, 'Destination must have road connection');
  assert.ok(worldSys.colliders.length > collidersBefore, 'Destination generation must register colliders with authoritative WorldSystem');

  // 11.5 Destination Discovery Notification & Session State
  const { globalBus } = await import('../src/engine/EventBus.js');
  let discoveryToastFired = false;
  let discoveryEventFired = false;
  globalBus.on('toast:show', (data) => {
    if (data && data.text && data.text.includes(activeDestChunk.destination.name)) {
      discoveryToastFired = true;
    }
  });
  globalBus.on('destination:discovered', (data) => {
    if (data && data.name === activeDestChunk.destination.name) {
      discoveryEventFired = true;
    }
  });

  // Check discovery proximity check
  assert.strictEqual(streamingSys.isDestinationDiscovered(activeDestChunk.destination.name), false, 'Destination must start undiscovered');
  
  // Player approaches destination
  const playerDestPos = new THREE.Vector3(activeDestChunk.destination.x, 0, activeDestChunk.destination.z);
  streamingSys.checkDestinationDiscovery(playerDestPos);

  assert.strictEqual(streamingSys.isDestinationDiscovered(activeDestChunk.destination.name), true, 'Destination must be marked discovered in session Set');
  assert.strictEqual(discoveryToastFired, true, 'Discovery toast event must be emitted when approaching destination');
  assert.strictEqual(discoveryEventFired, true, 'destination:discovered event must be emitted');

  // Verify approaching second time does NOT spam discovery toasts
  discoveryToastFired = false;
  streamingSys.checkDestinationDiscovery(playerDestPos);
  assert.strictEqual(discoveryToastFired, false, 'Approaching already-discovered destination must not trigger duplicate notifications');

  // 11.6 Destination Unload & Clean Collider Removal
  // Move player far away
  const farPos = new THREE.Vector3(2000, 0, 2000);
  streamingSys.updateStreaming(farPos, new THREE.Vector3(0, 0, 0));
  
  assert.strictEqual(streamingSys.activeChunks.has(testChunkKey), false, `Chunk ${testChunkKey} must be unloaded when player moves far away`);
  
  // Re-approach the chunk to test determinism and persistence of discovery
  streamingSys.updateStreaming(destWorldPos, new THREE.Vector3(0, 0, 0));
  streamingSys.processGenerationQueue(20);
  const reloadedChunk = streamingSys.activeChunks.get(testChunkKey);
  assert.ok(reloadedChunk && reloadedChunk.destination, 'Reloaded chunk must retain destination');
  assert.strictEqual(streamingSys.isDestinationDiscovered(reloadedChunk.destination.name), true, 'Discovery status must persist in session across chunk unload/reload');
  console.log('[PASS] Destination generation, approach road connection, discovery toast, session persistence, and memory cleanup verified.');

  // 12. CHUNK 48: Procedural World Geometry Consistency & Vehicle Grounding
  console.log('\n--- Chunk 48 World Geometry Consistency & Vehicle Grounding Tests ---');
  const { getRoadCorridor, getRoadElevationProfile, getNaturalTerrainHeight, validateBuildingPlacement } = await import('../src/utils/SeededRandom.js');

  // 12.1 Authoritative Road Corridor Protection
  // Sample along primary North-South highway across 1000 meters
  for (let z = 150; z <= 1000; z += 25) {
    const corridor = getRoadCorridor(0, z, HEIWA_WORLD_SEED);
    assert.strictEqual(corridor.isInsideCorridor, true, `Position (0, ${z}) must be inside NS highway corridor`);
    assert.ok(corridor.roadHalfWidth >= 4.25, 'Primary highway half width must be at least 4.25m');
    
    // Terrain height in driving lane (x=0, x=2, x=-2) must strictly match road surface elevation
    const hCenter = getTerrainHeight(0, z, HEIWA_WORLD_SEED);
    const hRightLane = getTerrainHeight(2.0, z, HEIWA_WORLD_SEED);
    const hLeftLane = getTerrainHeight(-2.0, z, HEIWA_WORLD_SEED);
    const roadElev = corridor.roadElevation;

    assert.ok(Math.abs(hCenter - roadElev) < 0.0001, `Terrain at (0, ${z}) must match road elevation ${roadElev}`);
    assert.ok(Math.abs(hRightLane - roadElev) < 0.0001, `Right driving lane at (2, ${z}) must match road elevation ${roadElev}`);
    assert.ok(Math.abs(hLeftLane - roadElev) < 0.0001, `Left driving lane at (-2, ${z}) must match road elevation ${roadElev}`);
  }
  console.log('[PASS] Road corridor protection verified: 0 terrain bumps/mountains rise through driving lane.');

  // 12.2 Road Grade Smoothness (< 3.5% gradient everywhere)
  for (let z = 200; z <= 800; z += 5) {
    const h1 = getTerrainHeight(0, z, HEIWA_WORLD_SEED);
    const h2 = getTerrainHeight(0, z + 5, HEIWA_WORLD_SEED);
    const slope = Math.abs((h2 - h1) / 5.0);
    assert.ok(slope <= 0.035, `Road longitudinal slope at z=${z} must be <= 3.5% (got ${(slope * 100).toFixed(2)}%)`);
  }
  console.log('[PASS] Road grade smoothness verified: gentle commuter slopes with no roller-coaster drops or cliffs.');

  // 12.3 Chunk Boundary Terrain Continuity
  for (let bz = 100; bz <= 500; bz += 100) {
    const hBefore = getTerrainHeight(35, bz - 0.001, HEIWA_WORLD_SEED);
    const hAfter = getTerrainHeight(35, bz + 0.001, HEIWA_WORLD_SEED);
    assert.ok(Math.abs(hBefore - hAfter) < 0.001, `Terrain height across chunk boundary z=${bz} must be continuous`);
  }
  console.log('[PASS] Global world-space coordinate continuity verified across chunk boundaries.');

  // 12.4 Building Spatial Placement & Slope Validation
  // Test A: Inside road corridor -> Must be rejected
  const resOnRoad = validateBuildingPlacement(0, 300, 8.0, 8.0, HEIWA_WORLD_SEED);
  assert.strictEqual(resOnRoad.valid, false, 'Building candidate inside road corridor must be rejected');
  assert.strictEqual(resOnRoad.reason, 'too_close_to_road');

  // Test B: Inside authored starting zone -> Must be rejected
  const resAuthored = validateBuildingPlacement(50, 50, 8.0, 8.0, HEIWA_WORLD_SEED);
  assert.strictEqual(resAuthored.valid, false, 'Building candidate inside authored zone must be rejected');
  assert.strictEqual(resAuthored.reason, 'inside_authored_zone');

  // Test C: Suitable roadside setback on gentle terrain -> Must be accepted with plinth base height
  const resValid = validateBuildingPlacement(28.0, 300, 8.0, 8.0, HEIWA_WORLD_SEED);
  if (resValid.valid) {
    assert.ok(resValid.groundY !== undefined, 'Valid building must return groundY foundation level');
    assert.ok(resValid.slopeVariance <= 0.55, 'Valid building slope variance must not exceed 0.55m');
    assert.ok(typeof resValid.facingAngle === 'number', 'Valid building must face toward nearest road');
  }
  console.log('[PASS] Building placement validation verified (road clearance, authored protection, slope limits, and foundation plinth).');

  // 12.5 Vehicle 4-Point Ground Probing & Pitch/Roll
  // Test A: Vehicle in flat authored area
  vehicleSys.position.set(-20, 0, -46.5);
  vehicleSys.headingAngle = 0;
  vehicleSys.updateGrounding(1.0);
  assert.ok(Math.abs(vehicleSys.position.y) < 0.001, 'Car parked in authored area must have position.y = 0');
  assert.ok(Math.abs(vehicleSys.terrainPitch) < 0.001, 'Car on flat terrain must have pitch = 0');
  assert.ok(Math.abs(vehicleSys.terrainRoll) < 0.001, 'Car on flat terrain must have roll = 0');

  // Test B: Vehicle driven into procedural world on rolling road
  vehicleSys.position.set(0, 0, 450);
  vehicleSys.headingAngle = 0;
  const probeResult = vehicleSys.updateGrounding(1.0);
  const expectedRoadH = getTerrainHeight(0, 450, HEIWA_WORLD_SEED);
  assert.ok(Math.abs(vehicleSys.position.y - expectedRoadH) < 0.05, `Car on road at z=450 must match road height ${expectedRoadH} (got ${vehicleSys.position.y})`);
  assert.ok(isFinite(vehicleSys.terrainPitch), 'Vehicle pitch must be finite');
  assert.ok(isFinite(vehicleSys.terrainRoll), 'Vehicle roll must be finite');
  console.log('[PASS] Vehicle 4-point ground probing & zero-gap road adhesion verified (no hovering, no sinking).');

  // 13. Test Language Rule
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

  console.log('\n🎉 ALL CHUNK 48 PROCEDURAL WORLD GEOMETRY CONSISTENCY TESTS PASSED!\n');
}

runChunk42Tests().catch(err => {
  console.error('\n❌ CHUNK 48 TEST FAILED:', err);
  process.exit(1);
});
