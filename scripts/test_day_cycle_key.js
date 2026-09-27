/**
 * test_day_cycle_key.js - Verification and behavioral test for Chunk 41 Day Cycle Key Binding (T).
 */
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';

console.log("=== CHUNK 41 VERIFICATION: DAY CYCLE KEY BINDING (T) ===");

let passed = true;

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    passed = false;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

// 1. Static Audit
const inputSrc = fs.readFileSync(path.resolve('src/engine/InputManager.js'), 'utf8');
assert(inputSrc.includes('advanceTime') || inputSrc.includes('KeyT'), "InputManager handles KeyT / advanceTime action");
assert(inputSrc.includes("emit('time:advance'"), "InputManager emits 'time:advance' on KeyT");
assert(inputSrc.includes('!e.repeat'), "InputManager ignores repeat keydown events for KeyT");

const worldSrc = fs.readFileSync(path.resolve('src/systems/WorldSystem.js'), 'utf8');
assert(worldSrc.includes("on('time:advance'"), "WorldSystem listens for 'time:advance'");
assert(worldSrc.includes('advanceTime('), "WorldSystem implements advanceTime()");
assert(worldSrc.includes('updateSunPosition()'), "WorldSystem updates sun and lighting on time advance");
assert(worldSrc.includes('broadcastTime()'), "WorldSystem broadcasts time:updated on time advance");

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
};

function createMockElement(id) {
  return {
    id,
    classList: { contains: () => false, add: () => {}, remove: () => {} },
    style: {},
    addEventListener: () => {},
  };
}

global.document = {
  pointerLockElement: null,
  addEventListener: (evt, fn) => {
    listeners[evt] = listeners[evt] || [];
    listeners[evt].push(fn);
  },
  exitPointerLock: () => {},
  getElementById: (id) => createMockElement(id),
  createElement: (tag) => {
    const el = createMockElement('created_' + Math.random());
    el.getContext = () => ({
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
      stroke: () => {},
      clip: () => {},
      ellipse: () => {},
      translate: () => {},
      rotate: () => {},
      closePath: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      strokeRect: () => {},
      roundRect: () => {},
      setLineDash: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: () => {},
    });
    return el;
  },
};

function fireEvent(type, eventObj) {
  if (listeners[type]) {
    for (const fn of listeners[type]) {
      fn(eventObj);
    }
  }
}

async function runBehavioralTests() {
  const { globalInput } = await import('../src/engine/InputManager.js');
  const { WorldSystem } = await import('../src/systems/WorldSystem.js');
  const { NPCSystem } = await import('../src/systems/NPCSystem.js');
  const { globalGameState, GameState } = await import('../src/engine/GameStateManager.js');
  const { globalBus } = await import('../src/engine/EventBus.js');

  const mockScene = new THREE.Scene();
  const mockEngine = {
    scene: mockScene,
    camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000),
    systems: [],
  };

  const worldSystem = new WorldSystem();
  worldSystem.init(mockEngine);

  const npcSystem = new NPCSystem();
  npcSystem.init(mockEngine);

  // 1. Initial State: TITLE -> Pressing T does nothing
  console.log("Current GameState:", globalGameState.getState());
  const initialHours = worldSystem.timeOfDayHours;
  fireEvent('keydown', { code: 'KeyT', key: 't', repeat: false, preventDefault: () => {} });
  assert(worldSystem.timeOfDayHours === initialHours, "Pressing T in TITLE state does not advance time");

  // 2. Transition to PLAYING
  globalGameState.setState(GameState.PLAYING);
  console.log("Transitioned to PLAYING.");

  let lastBroadcast = null;
  globalBus.on('time:updated', (data) => {
    lastBroadcast = data;
  });

  // Press T once
  fireEvent('keydown', { code: 'KeyT', key: 't', repeat: false, preventDefault: () => {} });
  assert(worldSystem.timeOfDayHours === initialHours + 1.0, `Pressing T advances time by exactly 1 hour (${initialHours} -> ${worldSystem.timeOfDayHours})`);
  assert(lastBroadcast && lastBroadcast.hours === worldSystem.timeOfDayHours, "time:updated event emitted with updated time");
  assert(npcSystem.currentHours === worldSystem.timeOfDayHours, "NPCSystem received updated time");

  // Press T again
  fireEvent('keydown', { code: 'KeyT', key: 't', repeat: false, preventDefault: () => {} });
  assert(worldSystem.timeOfDayHours === initialHours + 2.0, `Pressing T again advances time by 1 more hour (${initialHours + 1.0} -> ${worldSystem.timeOfDayHours})`);

  // Key repeat test (holding T)
  fireEvent('keydown', { code: 'KeyT', key: 't', repeat: true, preventDefault: () => {} });
  assert(worldSystem.timeOfDayHours === initialHours + 2.0, "Holding T (repeat=true) does NOT trigger rapid time changes");

  // Advance time past midnight (23:00 -> 00:00 -> 01:00)
  worldSystem.timeOfDayHours = 23.0;
  fireEvent('keydown', { code: 'KeyT', key: 't', repeat: false, preventDefault: () => {} });
  assert(worldSystem.timeOfDayHours === 0.0, `Midnight wraparound: 23:00 -> ${worldSystem.timeOfDayHours}:00`);
  assert(lastBroadcast.timeStr === '12:00 AM', `Formatted time at midnight: ${lastBroadcast.timeStr}`);

  fireEvent('keydown', { code: 'KeyT', key: 't', repeat: false, preventDefault: () => {} });
  assert(worldSystem.timeOfDayHours === 1.0, `Past midnight advance: 0:00 -> ${worldSystem.timeOfDayHours}:00`);
  assert(lastBroadcast.timeStr === '1:00 AM', `Formatted time past midnight: ${lastBroadcast.timeStr}`);

  // Dialog active test
  globalBus.emit('dialogue:open', { speaker: 'Tanaka', text: 'Good morning' });
  const timeBeforeDialogue = worldSystem.timeOfDayHours;
  fireEvent('keydown', { code: 'KeyT', key: 't', repeat: false, preventDefault: () => {} });
  assert(worldSystem.timeOfDayHours === timeBeforeDialogue, "Pressing T during dialogue does NOT change time");
  globalBus.emit('dialogue:close');

  // Modal active test
  globalBus.emit('ui:openInfoModal');
  fireEvent('keydown', { code: 'KeyT', key: 't', repeat: false, preventDefault: () => {} });
  assert(worldSystem.timeOfDayHours === timeBeforeDialogue, "Pressing T while modal is open does NOT change time");
  globalBus.emit('ui:closeInfoModal');

  // Pause test
  globalGameState.setState(GameState.PAUSED);
  fireEvent('keydown', { code: 'KeyT', key: 't', repeat: false, preventDefault: () => {} });
  assert(worldSystem.timeOfDayHours === timeBeforeDialogue, "Pressing T while paused does NOT change time");

  console.log("[PASS] All behavioral checks for day cycle key binding passed!");
}

// 3. Language Audit
const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g;
const filesToCheck = [
  'src/engine/InputManager.js',
  'src/systems/WorldSystem.js',
  'src/systems/UISystem.js',
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

runBehavioralTests()
  .then(() => {
    if (passed) {
      console.log("\n>>> ALL CHUNK 41 TESTS PASSED SUCCESSFULLY! <<<");
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
