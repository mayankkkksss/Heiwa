import assert from 'node:assert';
import { SAVE_KEY, SAVE_VERSION, SaveSystem } from '../src/engine/SaveSystem.js';
import { setWorldSeed, getWorldSeed, resetWorldSeed, HEIWA_WORLD_SEED } from '../src/utils/SeededRandom.js';
import { globalGameState, GameState } from '../src/engine/GameStateManager.js';
import { globalBus } from '../src/engine/EventBus.js';
import {
  DEFAULT_KEY_BINDINGS,
  KEYBINDINGS_STORAGE_KEY,
  loadStoredKeyBindings,
  saveStoredKeyBindings,
} from '../src/engine/KeyBindings.js';
import { PlayerSystem } from '../src/systems/PlayerSystem.js';
import { WorldSystem } from '../src/systems/WorldSystem.js';
import { QuestSystem } from '../src/systems/QuestSystem.js';
import { VehicleSystem } from '../src/entities/VehicleSystem.js';
import { CameraSystem } from '../src/systems/CameraSystem.js';
import { WorldStreamingSystem } from '../src/world/WorldStreamingSystem.js';

// Mock environment for Node
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
    addEventListener: (evt, handler) => {
      el._listeners = el._listeners || {};
      el._listeners[evt] = el._listeners[evt] || [];
      el._listeners[evt].push(handler);
    },
    getContext: (type) => ({
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
    }),
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
window.localStorage = global.localStorage;

console.log('🧪 Starting HEIWA Reset Game Deep Verification Test Suite...\n');

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
  // 1. Save and subsequent Reset Flow
  await test('1. Reset Game deletes save from storage and cleans up in-memory state', () => {
    localStorage.clear();
    setWorldSeed(888888);

    const playerSys = new PlayerSystem();
    const vehicleSys = new VehicleSystem();
    const cameraSys = new CameraSystem();
    const worldSys = new WorldSystem();
    const streamingSys = new WorldStreamingSystem();
    const questSys = new QuestSystem();

    const mockEngine = {
      systems: [playerSys, vehicleSys, cameraSys, worldSys, streamingSys, questSys],
    };

    globalGameState.setState(GameState.PLAYING);

    // Simulate moved player, moved car, advanced quest, advanced time
    playerSys.position.set(450.0, 5.0, -920.0);
    vehicleSys.position.set(455.0, 5.0, -915.0);
    vehicleSys.state = 'DRIVING';
    worldSys.setTimeOfDay(20.5);
    questSys.currentQuestIndex = 2;

    const saveSystem = new SaveSystem();
    saveSystem.init(mockEngine);

    // Save state
    const saved = saveSystem.saveNow('Pre-reset save', true);
    assert.strictEqual(saved, true);
    assert.strictEqual(saveSystem.hasSave(), true);

    // Verify saved payload has distant coordinates
    const stored = JSON.parse(localStorage.getItem(SAVE_KEY));
    assert.strictEqual(stored.player.position.x, 450.0);
    assert.strictEqual(stored.worldSeed, 888888);

    // Trigger Reset via EventBus ('game:reset')
    globalBus.emit('game:reset');

    // 1. Save must be deleted from localStorage
    assert.strictEqual(saveSystem.hasSave(), false);
    assert.strictEqual(localStorage.getItem(SAVE_KEY), null);

    // 2. World seed must return to default HEIWA_WORLD_SEED
    assert.strictEqual(getWorldSeed(), HEIWA_WORLD_SEED);

    // 3. Player must return to default spawn (-24.0, 0, -46.5)
    assert.strictEqual(playerSys.position.x, -24.0);
    assert.strictEqual(playerSys.position.z, -46.5);
    assert.strictEqual(playerSys.headingAngle, 0);

    // 4. Vehicle must return to default starting area and ON_FOOT state
    assert.strictEqual(vehicleSys.position.x, -20.0);
    assert.strictEqual(vehicleSys.position.z, -46.5);
    assert.strictEqual(vehicleSys.state, 'ON_FOOT');

    // 5. Quest must return to initial Morning Errand state
    assert.strictEqual(questSys.currentQuestIndex, 0);

    // 6. Time must return to default morning time (9:00 AM)
    assert.strictEqual(worldSys.timeOfDayHours, 9.0);

    // 7. World streaming must return to starting area
    assert.strictEqual(streamingSys.currentCenterChunk.x, 0);
    assert.strictEqual(streamingSys.currentCenterChunk.z, 0);

    // 8. Game state transitioned to TITLE
    assert.strictEqual(globalGameState.is(GameState.TITLE), true);

    saveSystem.destroy();
  });

  // 2. Autosave Race Condition Protection during Reset
  await test('2. Debounced saves scheduled prior to reset do not recreate stale save', async () => {
    localStorage.clear();
    const mockEngine = { systems: [] };

    globalGameState.setState(GameState.PLAYING);
    const saveSystem = new SaveSystem();
    saveSystem.init(mockEngine);

    // Schedule debounced save
    saveSystem.scheduleSave('Debounced action before reset');
    assert.ok(saveSystem.debounceTimer !== null);

    // Execute reset immediately
    saveSystem.resetGame();

    // Verify debounce timer was canceled
    assert.strictEqual(saveSystem.debounceTimer, null);

    // Wait past debounce delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Storage must still be completely empty!
    assert.strictEqual(localStorage.getItem(SAVE_KEY), null);
    assert.strictEqual(saveSystem.hasSave(), false);

    saveSystem.destroy();
  });

  // 3. Key Bindings Preservation on Reset Game
  await test('3. Reset Game strictly preserves user Key Bindings preferences', () => {
    localStorage.clear();

    // Set custom key bindings
    const customBindings = {
      ...DEFAULT_KEY_BINDINGS,
      moveForward: 'KeyI',
      jump: 'KeyJ',
      interact: 'KeyF',
    };
    saveStoredKeyBindings(customBindings);

    // Save gameplay progress
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: SAVE_VERSION,
      timestamp: Date.now(),
      worldSeed: 12345,
      player: { position: { x: 50, y: 0, z: 50 } },
    }));

    const saveSystem = new SaveSystem();
    saveSystem.init({ systems: [] });

    assert.strictEqual(saveSystem.hasSave(), true);
    assert.strictEqual(loadStoredKeyBindings().moveForward, 'KeyI');

    // Reset Game
    saveSystem.resetGame();

    // Game progress is deleted
    assert.strictEqual(saveSystem.hasSave(), false);
    assert.strictEqual(localStorage.getItem(SAVE_KEY), null);

    // Custom Key Bindings REMAIN INTACT
    const currentBindings = loadStoredKeyBindings();
    assert.strictEqual(currentBindings.moveForward, 'KeyI');
    assert.strictEqual(currentBindings.jump, 'KeyJ');
    assert.strictEqual(currentBindings.interact, 'KeyF');

    saveSystem.destroy();
  });

  // 4. Fresh Game Autosave after Reset
  await test('4. Normal autosaving functions correctly for new game post-reset', () => {
    localStorage.clear();
    const playerSys = new PlayerSystem();
    const mockEngine = {
      systems: [playerSys],
    };

    const saveSystem = new SaveSystem();
    saveSystem.init(mockEngine);

    // 1. Reset
    saveSystem.resetGame();
    assert.strictEqual(saveSystem.hasSave(), false);

    // 2. Start fresh game and move slightly
    globalGameState.setState(GameState.PLAYING);
    playerSys.position.set(-22.0, 0, -45.0);

    // 3. Trigger new save
    saveSystem.saveNow('Post-reset exploration save');
    assert.strictEqual(saveSystem.hasSave(), true);

    const postResetData = saveSystem.loadSaveData();
    assert.strictEqual(postResetData.player.position.x, -22.0);
    assert.strictEqual(postResetData.worldSeed, HEIWA_WORLD_SEED);

    saveSystem.destroy();
  });

  // 5. Japanese Language Audit
  await test('5. Japanese Language Audit - The ONLY allowed Japanese text is 平和', async () => {
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

    const jpRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/gu;
    let forbiddenFound = [];

    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
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

  console.log(`\n🎉 All ${passedTests} Reset Game deep verification tests passed successfully!`);
}

runAllTests();
