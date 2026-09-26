import { globalBus } from './EventBus.js';
import { globalGameState, GameState } from './GameStateManager.js';

/**
 * InputManager - Centralized keyboard and mouse input handling for HEIWA
 */
export class InputManager {
  constructor() {
    this.keys = new Map();
    this.previousKeys = new Map();
    this.mouse = {
      isDown: false,
      deltaX: 0,
      deltaY: 0,
      wheelDelta: 0,
    };

    this.jumpRequested = false;
    this.canvas = null;
    this.isDialogueActive = false;
    this.isSitting = false;
    this.setupListeners();
  }

  setCanvas(canvasElement) {
    this.canvas = canvasElement;
  }

  setupListeners() {
    globalBus.on('dialogue:open', () => {
      this.isDialogueActive = true;
    });

    globalBus.on('dialogue:close', () => {
      this.isDialogueActive = false;
    });

    globalBus.on('player:sittingChanged', (data) => {
      this.isSitting = data.isSitting;
    });

    globalBus.on('state:changed', (data) => {
      if (data.to !== GameState.PLAYING) {
        this.isDialogueActive = false;
        this.isSitting = false;
      }
    });

    // Keyboard keydown
    window.addEventListener('keydown', (e) => {
      // Prevent browser spacebar scrolling or spacebar clicking focused UI buttons
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();

        // If a UI button has focus, blur it immediately so Space doesn't activate it
        if (document.activeElement && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }

        // If currently sitting, Space stands up
        if (this.isSitting) {
          globalBus.emit('player:stand');
          return;
        }

        // Only register jump if in PLAYING state, not in dialogue, and was not already held down
        if (globalGameState.is(GameState.PLAYING) && !this.isDialogueActive) {
          const wasHeld = this.keys.get('Space') === true;
          if (!wasHeld) {
            this.jumpRequested = true;
          }
        }
      }

      this.keys.set(e.code, true);
      this.keys.set(e.key.toLowerCase(), true);
      if (e.code === 'Space' || e.key === ' ') {
        this.keys.set('Space', true);
      }

      // Handle Escape: prioritize dialogue dismissal, then bench standup, then pause toggle
      if (e.code === 'Escape' || e.key === 'Escape') {
        if (this.isDialogueActive) {
          globalBus.emit('dialogue:close');
          return;
        }
        if (this.isSitting) {
          globalBus.emit('player:stand');
          return;
        }
        if (globalGameState.is(GameState.PLAYING) || globalGameState.is(GameState.PAUSED)) {
          globalGameState.togglePause();
        }
      }

      // Handle Enter on Title screen or to dismiss/advance dialogue in PLAYING state
      if (e.code === 'Enter' || e.key === 'Enter') {
        if (globalGameState.is(GameState.TITLE)) {
          globalBus.emit('ui:startBegin');
        } else if (globalGameState.is(GameState.PLAYING)) {
          if (this.isDialogueActive) {
            globalBus.emit('dialogue:close');
          }
        }
      }

      // Handle Interaction Key E: single edge-trigger (no repeat hold spam)
      if (e.code === 'KeyE' || e.key.toLowerCase() === 'e') {
        if (!e.repeat && globalGameState.is(GameState.PLAYING)) {
          if (this.isDialogueActive) {
            globalBus.emit('dialogue:close');
          } else {
            globalBus.emit('input:interact');
          }
        }
      }
    });

    // Keyboard keyup
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        this.keys.set('Space', false);
      }
      this.keys.set(e.code, false);
      this.keys.set(e.key.toLowerCase(), false);
    });

    // Window blur reset
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.jumpRequested = false;
      this.mouse.isDown = false;
    });

    // Mouse events
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        this.mouse.isDown = true;
      }
    });

    window.addEventListener('mouseup', () => {
      this.mouse.isDown = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.mouse.deltaX = e.movementX || 0;
        this.mouse.deltaY = e.movementY || 0;
      } else if (this.mouse.isDown) {
        this.mouse.deltaX = e.movementX || 0;
        this.mouse.deltaY = e.movementY || 0;
      }
    });

    window.addEventListener(
      'wheel',
      (e) => {
        this.mouse.wheelDelta = e.deltaY;
      },
      { passive: true }
    );
  }

  isKeyPressed(codeOrKey) {
    return this.keys.get(codeOrKey) === true;
  }

  /**
   * Consumes single-frame jump press
   */
  consumeJumpPress() {
    if (!globalGameState.is(GameState.PLAYING)) {
      this.jumpRequested = false;
      return false;
    }
    const requested = this.jumpRequested;
    this.jumpRequested = false;
    return requested;
  }

  /**
   * Returns normalized [x, z] input vector for character movement
   */
  getMovementInput() {
    if (!globalGameState.is(GameState.PLAYING)) {
      return { x: 0, z: 0, length: 0, isJogging: false };
    }

    let x = 0;
    let z = 0;

    // Forward / Backward
    if (this.isKeyPressed('KeyW') || this.isKeyPressed('ArrowUp') || this.isKeyPressed('w')) {
      z -= 1;
    }
    if (this.isKeyPressed('KeyS') || this.isKeyPressed('ArrowDown') || this.isKeyPressed('s')) {
      z += 1;
    }

    // Left / Right
    if (this.isKeyPressed('KeyA') || this.isKeyPressed('ArrowLeft') || this.isKeyPressed('a')) {
      x -= 1;
    }
    if (this.isKeyPressed('KeyD') || this.isKeyPressed('ArrowRight') || this.isKeyPressed('d')) {
      x += 1;
    }

    const length = Math.hypot(x, z);
    if (length > 0.001) {
      x /= length;
      z /= length;
    }

    const isJogging =
      this.isKeyPressed('ShiftLeft') ||
      this.isKeyPressed('ShiftRight') ||
      this.isKeyPressed('shift');

    return {
      x,
      z,
      length,
      isJogging: length > 0.001 && isJogging,
    };
  }

  consumeMouseDelta() {
    const delta = {
      dx: this.mouse.deltaX,
      dy: this.mouse.deltaY,
      wheel: this.mouse.wheelDelta,
    };
    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
    this.mouse.wheelDelta = 0;
    return delta;
  }
}

export const globalInput = new InputManager();
