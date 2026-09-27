/**
 * test_mouselook_behavior.js - Behavioral unit test for Chunk 39 Free Mouse-Look Camera.
 */
import * as THREE from 'three';

// Global browser mocks for Node runtime
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
  }),
};

function fireEvent(type, eventObj) {
  if (listeners[type]) {
    for (const fn of listeners[type]) {
      fn(eventObj);
    }
  }
}

async function runBehavioralTests() {
  console.log("=== RUNNING MOUSE-LOOK BEHAVIORAL TESTS ===");
  const { InputManager, globalInput } = await import('../src/engine/InputManager.js');
  const { CameraSystem } = await import('../src/systems/CameraSystem.js');
  const { globalGameState, GameState } = await import('../src/engine/GameStateManager.js');
  const { globalBus } = await import('../src/engine/EventBus.js');

  const mockCanvas = {
    requestPointerLock: () => {
      global.document.pointerLockElement = mockCanvas;
      fireEvent('pointerlockchange', {});
    }
  };
  globalInput.setCanvas(mockCanvas);

  const mockCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  const mockEngine = {
    camera: mockCamera,
    systems: []
  };

  const camSystem = new CameraSystem();
  camSystem.init(mockEngine);

  // 1. Initial State: TITLE
  console.log("Initial state:", globalGameState.getState());
  fireEvent('mousemove', { movementX: 10, movementY: 5, clientX: 100, clientY: 100 });
  let delta = globalInput.consumeMouseDelta();
  if (delta.dx !== 0 || delta.dy !== 0) {
    throw new Error(`Mouse look should NOT accumulate in TITLE state, got dx=${delta.dx}, dy=${delta.dy}`);
  }
  console.log("[PASS] Mouse move in TITLE state does not rotate camera.");

  // 2. Transition to PLAYING
  globalGameState.setState(GameState.PLAYING);
  console.log("State transitioned to PLAYING.");

  const initialTheta = camSystem.theta;
  const initialPhi = camSystem.phi;

  // Move mouse without any mouse button pressed (FREE MOUSE-LOOK)
  fireEvent('mousemove', { movementX: 20, movementY: -10, clientX: 120, clientY: 90 });
  delta = globalInput.consumeMouseDelta();
  if (delta.dx !== 20 || delta.dy !== -10) {
    throw new Error(`Expected delta {dx: 20, dy: -10}, got dx=${delta.dx}, dy=${delta.dy}`);
  }
  console.log("[PASS] Free mouse movement produced exact deltas without holding left-click!");

  // Feed delta to CameraSystem
  globalInput.mouse.deltaX = 20;
  globalInput.mouse.deltaY = -10;
  camSystem.update(0.016);

  if (camSystem.theta === initialTheta) {
    throw new Error("Camera theta did not update from mouse movement!");
  }
  if (camSystem.phi === initialPhi) {
    throw new Error("Camera phi did not update from mouse movement!");
  }
  console.log(`[PASS] Camera yaw updated: ${initialTheta.toFixed(4)} -> ${camSystem.theta.toFixed(4)}`);
  console.log(`[PASS] Camera pitch updated: ${initialPhi.toFixed(4)} -> ${camSystem.phi.toFixed(4)}`);

  // 3. Dialogue blocks free mouse-look
  globalBus.emit('dialogue:open', { speaker: 'Tanaka', text: 'Hello!' });
  fireEvent('mousemove', { movementX: 30, movementY: 30, clientX: 150, clientY: 120 });
  delta = globalInput.consumeMouseDelta();
  if (delta.dx !== 0 || delta.dy !== 0) {
    throw new Error(`Mouse look should NOT accumulate during dialogue, got dx=${delta.dx}, dy=${delta.dy}`);
  }
  console.log("[PASS] Mouse move during dialogue does not rotate camera.");
  globalBus.emit('dialogue:close');

  // 4. Modal blocks free mouse-look
  globalBus.emit('ui:openInfoModal');
  fireEvent('mousemove', { movementX: 30, movementY: 30, clientX: 180, clientY: 150 });
  delta = globalInput.consumeMouseDelta();
  if (delta.dx !== 0 || delta.dy !== 0) {
    throw new Error(`Mouse look should NOT accumulate while modal is open, got dx=${delta.dx}, dy=${delta.dy}`);
  }
  console.log("[PASS] Mouse move while info modal is open does not rotate camera.");
  globalBus.emit('ui:closeInfoModal');

  // 5. Pause blocks free mouse-look
  globalGameState.setState(GameState.PAUSED);
  fireEvent('mousemove', { movementX: 50, movementY: 50, clientX: 230, clientY: 200 });
  delta = globalInput.consumeMouseDelta();
  if (delta.dx !== 0 || delta.dy !== 0) {
    throw new Error(`Mouse look should NOT accumulate during PAUSED state, got dx=${delta.dx}, dy=${delta.dy}`);
  }
  console.log("[PASS] Mouse move during PAUSED state does not rotate camera.");

  // Resume to PLAYING
  globalGameState.setState(GameState.PLAYING);
  delta = globalInput.consumeMouseDelta();
  if (delta.dx !== 0 || delta.dy !== 0) {
    throw new Error(`Deltas should be 0 on unpause, got dx=${delta.dx}, dy=${delta.dy}`);
  }
  console.log("[PASS] Resuming from PAUSED cleanly resets deltas without camera jumps.");

  console.log("\n>>> ALL MOUSE-LOOK BEHAVIORAL TESTS PASSED SUCCESSFULLY! <<<");
}

runBehavioralTests().catch((err) => {
  console.error("\n>>> TEST FAILED:", err);
  process.exit(1);
});
