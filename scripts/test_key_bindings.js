import assert from 'node:assert';
import {
  DEFAULT_KEY_BINDINGS,
  ACTION_DEFINITIONS,
  KEYBINDINGS_STORAGE_KEY,
  formatKeyDisplay,
  isReservedKey,
  loadStoredKeyBindings,
  saveStoredKeyBindings,
  clearStoredKeyBindings,
} from '../src/engine/KeyBindings.js';
import { InputManager } from '../src/engine/InputManager.js';
import { globalGameState, GameState } from '../src/engine/GameStateManager.js';
import { globalBus } from '../src/engine/EventBus.js';
import { SaveSystem, SAVE_KEY } from '../src/engine/SaveSystem.js';

// Mock localStorage for Node environment
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

console.log('🧪 Starting HEIWA Key Bindings & Custom Controls Test Suite...\n');

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
  // 1. Default Key Bindings
  await test('1. Default key bindings configuration', () => {
    localStorage.clear();
    assert.strictEqual(DEFAULT_KEY_BINDINGS.moveForward, 'KeyW');
    assert.strictEqual(DEFAULT_KEY_BINDINGS.moveBackward, 'KeyS');
    assert.strictEqual(DEFAULT_KEY_BINDINGS.moveLeft, 'KeyA');
    assert.strictEqual(DEFAULT_KEY_BINDINGS.moveRight, 'KeyD');
    assert.strictEqual(DEFAULT_KEY_BINDINGS.jump, 'Space');
    assert.strictEqual(DEFAULT_KEY_BINDINGS.interact, 'KeyE');
    assert.strictEqual(DEFAULT_KEY_BINDINGS.jog, 'ShiftLeft');
    assert.strictEqual(DEFAULT_KEY_BINDINGS.pause, 'Escape');
    assert.strictEqual(DEFAULT_KEY_BINDINGS.minimap, 'KeyM');
    assert.strictEqual(DEFAULT_KEY_BINDINGS.advanceTime, 'KeyT');
  });

  // 2. Key Display Formatter
  await test('2. Friendly key display name formatting', () => {
    assert.strictEqual(formatKeyDisplay('KeyW'), 'W');
    assert.strictEqual(formatKeyDisplay('KeyE'), 'E');
    assert.strictEqual(formatKeyDisplay('Space'), 'Space');
    assert.strictEqual(formatKeyDisplay('ShiftLeft'), 'Shift');
    assert.strictEqual(formatKeyDisplay('Escape'), 'Escape');
    assert.strictEqual(formatKeyDisplay('ArrowUp'), 'Arrow Up');
    assert.strictEqual(formatKeyDisplay('ArrowDown'), 'Arrow Down');
    assert.strictEqual(formatKeyDisplay('ArrowLeft'), 'Arrow Left');
    assert.strictEqual(formatKeyDisplay('ArrowRight'), 'Arrow Right');
    assert.strictEqual(formatKeyDisplay('Digit1'), '1');
    assert.strictEqual(formatKeyDisplay('Numpad5'), 'Num 5');
  });

  // 3. Reserved Key Detection
  await test('3. Browser and OS reserved keys detection', () => {
    assert.strictEqual(isReservedKey('F5'), true);
    assert.strictEqual(isReservedKey('F11'), true);
    assert.strictEqual(isReservedKey('F12'), true);
    assert.strictEqual(isReservedKey('MetaLeft'), true);
    assert.strictEqual(isReservedKey('KeyW'), false);
    assert.strictEqual(isReservedKey('Space'), false);
    assert.strictEqual(isReservedKey('KeyE'), false);
  });

  // 4. Changing a Key Binding & Conflict Detection
  await test('4. Changing a key binding and conflict detection', () => {
    localStorage.clear();
    const input = new InputManager();

    // Default binding
    assert.strictEqual(input.getBinding('moveForward'), 'KeyW');

    // Conflict check: 'Space' is already bound to 'jump'
    const conflict = input.findConflict('moveForward', 'Space');
    assert.strictEqual(conflict, 'jump');

    // No conflict for unbound key 'KeyI'
    assert.strictEqual(input.findConflict('moveForward', 'KeyI'), null);

    // Set binding
    input.setBinding('moveForward', 'KeyI');
    assert.strictEqual(input.getBinding('moveForward'), 'KeyI');

    // Verify localStorage was updated
    const saved = loadStoredKeyBindings();
    assert.strictEqual(saved.moveForward, 'KeyI');
  });

  // 5. InputManager Action Polling & Movement with Custom Keys
  await test('5. Movement calculation reflects customized key bindings immediately', () => {
    localStorage.clear();
    globalGameState.setState(GameState.PLAYING);
    const input = new InputManager();

    // Rebind WASD to IJKL
    input.setBinding('moveForward', 'KeyI');
    input.setBinding('moveBackward', 'KeyK');
    input.setBinding('moveLeft', 'KeyJ');
    input.setBinding('moveRight', 'KeyL');

    // Press old 'KeyW' -> should produce 0 movement
    input.keys.set('KeyW', true);
    let movement = input.getMovementInput();
    assert.strictEqual(movement.z, 0);
    assert.strictEqual(movement.length, 0);

    // Press new 'KeyI' -> should move forward (z = -1)
    input.keys.set('KeyW', false);
    input.keys.set('KeyI', true);
    movement = input.getMovementInput();
    assert.strictEqual(movement.z, -1);
    assert.strictEqual(movement.length, 1);

    // Press new 'KeyL' -> should move forward-right
    input.keys.set('KeyL', true);
    movement = input.getMovementInput();
    assert.ok(movement.x > 0);
    assert.ok(movement.z < 0);

    input.keys.clear();
  });

  // 6. Custom Jog Binding
  await test('6. Jogging state reflects customized jog binding', () => {
    localStorage.clear();
    globalGameState.setState(GameState.PLAYING);
    const input = new InputManager();

    input.setBinding('moveForward', 'KeyW');
    input.setBinding('jog', 'KeyX');

    input.keys.set('KeyW', true);
    // Not jogging yet
    assert.strictEqual(input.getMovementInput().isJogging, false);

    // Press custom jog key 'KeyX'
    input.keys.set('KeyX', true);
    assert.strictEqual(input.getMovementInput().isJogging, true);

    input.keys.clear();
  });

  // 7. Custom Jump Binding
  await test('7. Jump action responds to custom jump key', () => {
    localStorage.clear();
    globalGameState.setState(GameState.PLAYING);
    const input = new InputManager();

    input.setBinding('jump', 'KeyJ');
    assert.strictEqual(input.isActionPressed('jump'), false);

    input.keys.set('KeyJ', true);
    assert.strictEqual(input.isActionPressed('jump'), true);

    input.keys.clear();
  });

  // 8. Key Capture Mode & Escape Cancel
  await test('8. Key capture mode waits for key and cancels on Escape safely', () => {
    const input = new InputManager();

    let capturedCode = null;
    let cancelCalled = false;

    input.startKeyCapture(
      'jump',
      (code) => { capturedCode = code; },
      () => { cancelCalled = true; }
    );

    assert.strictEqual(input.capturingAction, 'jump');

    // Cancel via cancelKeyCapture() (simulating Escape)
    input.cancelKeyCapture();
    assert.strictEqual(input.capturingAction, null);
    assert.strictEqual(cancelCalled, true);
    assert.strictEqual(capturedCode, null);
  });

  // 9. Reset Controls
  await test('9. Reset Controls restores all defaults without touching game progress', () => {
    localStorage.clear();
    const input = new InputManager();

    input.setBinding('moveForward', 'KeyZ');
    input.setBinding('jump', 'KeyX');
    input.setBinding('interact', 'KeyC');

    assert.strictEqual(input.getBinding('moveForward'), 'KeyZ');

    input.resetBindings();

    assert.strictEqual(input.getBinding('moveForward'), 'KeyW');
    assert.strictEqual(input.getBinding('jump'), 'Space');
    assert.strictEqual(input.getBinding('interact'), 'KeyE');

    const stored = loadStoredKeyBindings();
    assert.strictEqual(stored.moveForward, 'KeyW');
  });

  // 10. Reset Game does not wipe user Key Bindings
  await test('10. Reset Game preserves user control bindings preferences', () => {
    localStorage.clear();
    const input = new InputManager();
    input.setBinding('moveForward', 'KeyI');

    // Simulate saving gameplay progress
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      worldSeed: 12345,
      player: { position: { x: 10, y: 0, z: 20 } },
    }));

    const saveSystem = new SaveSystem();
    saveSystem.init({ systems: [] });

    assert.strictEqual(saveSystem.hasSave(), true);
    assert.strictEqual(loadStoredKeyBindings().moveForward, 'KeyI');

    // Perform game reset
    saveSystem.resetGame();

    // Game save deleted
    assert.strictEqual(saveSystem.hasSave(), false);

    // Key bindings preserved!
    assert.strictEqual(loadStoredKeyBindings().moveForward, 'KeyI');
  });

  // 11. Japanese Language Compliance
  await test('11. Japanese Language Audit - ONLY 「平和」 allowed in whole codebase', async () => {
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

  console.log(`\n🎉 All ${passedTests} Key Bindings & Custom Controls tests passed successfully!`);
}

runAllTests();
