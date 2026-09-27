import assert from 'node:assert';
import { SAVE_KEY, SAVE_VERSION, SaveSystem } from '../src/engine/SaveSystem.js';
import { setWorldSeed, getWorldSeed, resetWorldSeed, HEIWA_WORLD_SEED } from '../src/utils/SeededRandom.js';
import { globalGameState, GameState } from '../src/engine/GameStateManager.js';
import { globalBus } from '../src/engine/EventBus.js';

// Mock localStorage for Node test environment
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] !== undefined ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

global.localStorage = new MockLocalStorage();

console.log('🧪 Starting HEIWA SaveSystem & Auto-Save/Resume/Reset Test Suite...\n');

let passedTests = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function runAllTests() {
  // 1. Initial State / New Game with no save
  await test('1. New game has no save initially', () => {
    localStorage.clear();
    const saveSystem = new SaveSystem();
    assert.strictEqual(saveSystem.hasSave(), false);
    assert.strictEqual(saveSystem.loadSaveData(), null);
  });

  // 2. Save Creation & Serialization
  await test('2. Save creation and serialization', () => {
    localStorage.clear();
    resetWorldSeed();

    const mockEngine = {
      systems: [
        {
          constructor: { name: 'PlayerSystem' },
          getStateForSave: () => ({
            position: { x: 125.4, y: 1.2, z: -350.8 },
            headingAngle: 1.57,
            movementState: 'IDLE',
          }),
        },
        {
          constructor: { name: 'VehicleSystem' },
          getStateForSave: () => ({
            hasVehicle: true,
            isInVehicle: false,
            position: { x: 128.0, y: 1.0, z: -352.0 },
            rotationY: 1.57,
            vehicleState: 'PARKED',
          }),
        },
        {
          constructor: { name: 'WorldSystem' },
          getStateForSave: () => ({
            timeOfDay: 14.5,
            weather: 'CLEAR',
          }),
        },
        {
          constructor: { name: 'QuestSystem' },
          getStateForSave: () => ({
            currentQuestIndex: 1,
            quests: [{ id: 'errand_drink', completed: true }],
            allCompleted: false,
          }),
        },
        {
          constructor: { name: 'WorldStreamingSystem' },
          getStateForSave: () => ({
            activeChunksCount: 9,
            discoveredDestinations: ['cherry_grove_1'],
          }),
        },
        {
          constructor: { name: 'CameraSystem' },
          getStateForSave: () => ({
            theta: 0.5,
            phi: 0.3,
            radius: 6.0,
          }),
        },
      ],
    };

    globalGameState.setState(GameState.PLAYING);
    const saveSystem = new SaveSystem();
    saveSystem.init(mockEngine);

    const saved = saveSystem.saveNow('Test Manual Save');
    assert.strictEqual(saved, true);
    assert.strictEqual(saveSystem.hasSave(), true);

    const data = saveSystem.loadSaveData();
    assert.ok(data);
    assert.strictEqual(data.version, SAVE_VERSION);
    assert.strictEqual(data.worldSeed, HEIWA_WORLD_SEED);
    assert.strictEqual(data.player.position.x, 125.4);
    assert.strictEqual(data.player.position.z, -350.8);
    assert.strictEqual(data.vehicle.position.x, 128.0);
    assert.strictEqual(data.isInVehicle, false);
    assert.strictEqual(data.world.timeOfDay, 14.5);
    assert.strictEqual(data.quest.currentQuestIndex, 1);

    saveSystem.destroy();
  });

  // 3. Save Validation & Corrupted Data Safety
  await test('3. Save validation rejects corrupted, NaN, and invalid structures safely', () => {
    const saveSystem = new SaveSystem();

    // Invalid JSON/Types
    assert.strictEqual(saveSystem.validateSaveData(null), false);
    assert.strictEqual(saveSystem.validateSaveData(undefined), false);
    assert.strictEqual(saveSystem.validateSaveData('string'), false);
    assert.strictEqual(saveSystem.validateSaveData(123), false);
    assert.strictEqual(saveSystem.validateSaveData({}), false);

    // Incompatible version
    assert.strictEqual(saveSystem.validateSaveData({ version: 999, timestamp: Date.now(), worldSeed: 1234, player: { position: { x: 0, z: 0 } } }), false);

    // NaN coordinates
    assert.strictEqual(saveSystem.validateSaveData({
      version: SAVE_VERSION,
      timestamp: Date.now(),
      worldSeed: 1234,
      player: { position: { x: NaN, z: 0 } },
    }), false);

    // Infinity coordinates
    assert.strictEqual(saveSystem.validateSaveData({
      version: SAVE_VERSION,
      timestamp: Date.now(),
      worldSeed: 1234,
      player: { position: { x: Infinity, z: 0 } },
    }), false);

    // Extreme absurd coordinates out of world bounds (>100,000)
    assert.strictEqual(saveSystem.validateSaveData({
      version: SAVE_VERSION,
      timestamp: Date.now(),
      worldSeed: 1234,
      player: { position: { x: 999999999, z: 0 } },
    }), false);
  });

  // 4. Player & Vehicle Restoration in Distant Procedural Chunks (On Foot)
  await test('4. Player & Vehicle state restoration far out in procedural world', () => {
    localStorage.clear();

    let playerRestored = false;
    let vehicleRestored = false;
    let streamingRestored = false;
    let cameraRestored = false;
    let restoredStreamingFocus = null;

    const mockEngine = {
      systems: [
        {
          constructor: { name: 'PlayerSystem' },
          restoreState: (pData) => {
            playerRestored = true;
            assert.strictEqual(pData.position.x, 540.0);
            assert.strictEqual(pData.position.z, -880.0);
          },
        },
        {
          constructor: { name: 'VehicleSystem' },
          restoreState: (vData, inVehicle) => {
            vehicleRestored = true;
            assert.strictEqual(inVehicle, false);
            assert.strictEqual(vData.position.x, 545.0);
            assert.strictEqual(vData.position.z, -875.0);
          },
        },
        {
          constructor: { name: 'WorldSystem' },
          restoreState: (wData) => {
            assert.strictEqual(wData.timeOfDay, 17.0);
          },
        },
        {
          constructor: { name: 'QuestSystem' },
          restoreState: (qData) => {
            assert.strictEqual(qData.allCompleted, true);
          },
        },
        {
          constructor: { name: 'WorldStreamingSystem' },
          restoreState: (sData, focusPos) => {
            streamingRestored = true;
            restoredStreamingFocus = focusPos;
          },
        },
        {
          constructor: { name: 'CameraSystem' },
          restoreState: (cData, focusPos) => {
            cameraRestored = true;
          },
        },
      ],
    };

    const saveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      worldSeed: 777777,
      isInVehicle: false,
      player: { position: { x: 540.0, y: 3.5, z: -880.0 }, headingAngle: 3.14 },
      vehicle: { position: { x: 545.0, y: 3.5, z: -875.0 }, rotationY: 3.14, vehicleState: 'PARKED' },
      world: { timeOfDay: 17.0 },
      quest: { allCompleted: true },
      streaming: { discoveredDestinations: [] },
      camera: { theta: 0, phi: 0.2 },
    };

    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));

    const saveSystem = new SaveSystem();
    saveSystem.init(mockEngine);

    const restored = saveSystem.restoreGameState();
    assert.strictEqual(restored, true);
    assert.strictEqual(getWorldSeed(), 777777);
    assert.strictEqual(playerRestored, true);
    assert.strictEqual(vehicleRestored, true);
    assert.strictEqual(streamingRestored, true);
    assert.strictEqual(cameraRestored, true);
    assert.deepStrictEqual(restoredStreamingFocus, { x: 540.0, y: 3.5, z: -880.0 });

    saveSystem.destroy();
  });

  // 5. Vehicle Driving Save / Resume Focus Position
  await test('5. When saved while driving inside vehicle, vehicle is primary focus', () => {
    localStorage.clear();

    let restoredStreamingFocus = null;

    const mockEngine = {
      systems: [
        { constructor: { name: 'PlayerSystem' }, restoreState: () => {} },
        { constructor: { name: 'VehicleSystem' }, restoreState: () => {} },
        { constructor: { name: 'WorldSystem' }, restoreState: () => {} },
        { constructor: { name: 'QuestSystem' }, restoreState: () => {} },
        {
          constructor: { name: 'WorldStreamingSystem' },
          restoreState: (sData, focusPos) => {
            restoredStreamingFocus = focusPos;
          },
        },
        { constructor: { name: 'CameraSystem' }, restoreState: () => {} },
      ],
    };

    const saveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      worldSeed: HEIWA_WORLD_SEED,
      isInVehicle: true,
      player: { position: { x: 0, y: 0, z: 0 } },
      vehicle: { position: { x: 920.0, y: 5.0, z: -1200.0 }, rotationY: 0.5, vehicleState: 'DRIVING' },
      world: { timeOfDay: 12.0 },
      quest: {},
      streaming: {},
      camera: {},
    };

    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));

    const saveSystem = new SaveSystem();
    saveSystem.init(mockEngine);

    saveSystem.restoreGameState();
    assert.deepStrictEqual(restoredStreamingFocus, { x: 920.0, y: 5.0, z: -1200.0 });

    saveSystem.destroy();
  });

  // 6. Reset Game Behavior
  await test('6. Reset game clears storage and invokes system reset methods', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: SAVE_VERSION,
      timestamp: Date.now(),
      worldSeed: 123,
      player: { position: { x: -24.0, z: -46.5 } },
    }));

    let worldResetCalled = false;
    let questResetCalled = false;
    let vehicleResetCalled = false;
    let playerResetCalled = false;
    let streamingResetCalled = false;
    let cameraResetCalled = false;

    const mockEngine = {
      systems: [
        { constructor: { name: 'WorldSystem' }, resetWorld: () => { worldResetCalled = true; } },
        { constructor: { name: 'QuestSystem' }, resetQuests: () => { questResetCalled = true; } },
        { constructor: { name: 'VehicleSystem' }, resetToInitial: () => { vehicleResetCalled = true; } },
        { constructor: { name: 'PlayerSystem' }, resetToSpawn: () => { playerResetCalled = true; } },
        { constructor: { name: 'WorldStreamingSystem' }, resetStreaming: () => { streamingResetCalled = true; } },
        { constructor: { name: 'CameraSystem' }, resetCamera: () => { cameraResetCalled = true; } },
      ],
    };

    const saveSystem = new SaveSystem();
    saveSystem.init(mockEngine);

    assert.strictEqual(saveSystem.hasSave(), true);

    saveSystem.resetGame();

    assert.strictEqual(saveSystem.hasSave(), false);
    assert.strictEqual(localStorage.getItem(SAVE_KEY), null);
    assert.strictEqual(worldResetCalled, true);
    assert.strictEqual(questResetCalled, true);
    assert.strictEqual(vehicleResetCalled, true);
    assert.strictEqual(playerResetCalled, true);
    assert.strictEqual(streamingResetCalled, true);
    assert.strictEqual(cameraResetCalled, true);
    assert.strictEqual(getWorldSeed(), HEIWA_WORLD_SEED);
    assert.strictEqual(globalGameState.is(GameState.TITLE), true);

    saveSystem.destroy();
  });

  // 7. Version Mismatch Handling
  await test('7. Older or incompatible save version is rejected safely without crashing', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: 0, // Old unsupported version
      timestamp: Date.now(),
      worldSeed: 12345,
      player: { position: { x: 10, y: 0, z: 20 } },
    }));

    const saveSystem = new SaveSystem();
    assert.strictEqual(saveSystem.hasSave(), false);
    assert.strictEqual(saveSystem.loadSaveData(), null);
    assert.strictEqual(saveSystem.restoreGameState(), false);
  });

  // 8. World Seed Preservation and Restoration
  await test('8. World seed is correctly preserved across saves and resets', () => {
    localStorage.clear();
    setWorldSeed(987654321);
    assert.strictEqual(getWorldSeed(), 987654321);

    const mockEngine = {
      systems: [
        { constructor: { name: 'PlayerSystem' }, getStateForSave: () => ({ position: { x: 0, y: 0, z: 0 } }) },
        { constructor: { name: 'VehicleSystem' }, getStateForSave: () => null },
        { constructor: { name: 'CameraSystem' }, getStateForSave: () => null },
        { constructor: { name: 'WorldSystem' }, getStateForSave: () => null },
        { constructor: { name: 'WorldStreamingSystem' }, getStateForSave: () => null },
        { constructor: { name: 'QuestSystem' }, getStateForSave: () => null },
      ],
    };

    globalGameState.setState(GameState.PLAYING);
    const saveSystem = new SaveSystem();
    saveSystem.init(mockEngine);
    saveSystem.saveNow('Seed Test');

    const loaded = saveSystem.loadSaveData();
    assert.strictEqual(loaded.worldSeed, 987654321);

    // Now change seed in memory, then restore
    setWorldSeed(111111);
    assert.strictEqual(getWorldSeed(), 111111);

    saveSystem.restoreGameState();
    assert.strictEqual(getWorldSeed(), 987654321);

    // Reset restores default
    saveSystem.resetGame();
    assert.strictEqual(getWorldSeed(), HEIWA_WORLD_SEED);

    saveSystem.destroy();
  });

  // 9. Japanese Language Audit
  await test('9. Japanese Language Audit - The ONLY allowed Japanese text is 平和', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const srcDir = path.resolve('src');
    const files = [];

    function collectFiles(dir) {
      const list = fs.readdirSync(dir);
      for (const f of list) {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          collectFiles(full);
        } else if (/\.(js|html|css)$/.test(f)) {
          files.push(full);
        }
      }
    }

    collectFiles(srcDir);
    if (fs.existsSync(path.resolve('index.html'))) {
      files.push(path.resolve('index.html'));
    }

    // Regex for any Japanese characters (Hiragana, Katakana, CJK Unified Ideographs) except 平和
    const jpRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/gu;

    let forbiddenFound = [];

    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      // Remove all valid "平和" occurrences
      const cleaned = content.replaceAll('\u5e73\u548c', '');
      const matches = cleaned.match(jpRegex);
      if (matches && matches.length > 0) {
        forbiddenFound.push({ file, matches });
      }
    }

    if (forbiddenFound.length > 0) {
      console.error('Forbidden Japanese characters found:', JSON.stringify(forbiddenFound, null, 2));
    }
    assert.strictEqual(forbiddenFound.length, 0, 'Found forbidden Japanese text in source files!');
  });

  console.log(`\n🎉 All ${passedTests} SaveSystem & Auto-Save/Resume/Reset tests passed successfully!`);
}

runAllTests();
