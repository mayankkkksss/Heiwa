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
    this.isModalOpen = false;
    this.isPointerLocked = false;
    this.lastMousePos = { x: 0, y: 0 };
    this.hasLastMousePos = false;

    // Touch / Mobile Input State
    this.touchMovement = { x: 0, z: 0, length: 0 };
    this.isJogToggled = false;

    this.setupListeners();
  }

  setCanvas(canvasElement) {
    this.canvas = canvasElement;
  }

  requestPointerLock() {
    if (this.canvas && document.pointerLockElement !== this.canvas) {
      try {
        const promise = this.canvas.requestPointerLock?.();
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => {});
        }
      } catch (err) {
        // Silently handle any browser security restrictions
      }
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock?.();
      } catch (err) {}
    }
    this.isPointerLocked = false;
    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
    this.hasLastMousePos = false;
  }

  setupListeners() {
    globalBus.on('dialogue:open', () => {
      this.isDialogueActive = true;
      this.exitPointerLock();
    });

    globalBus.on('dialogue:close', () => {
      this.isDialogueActive = false;
      this.mouse.deltaX = 0;
      this.mouse.deltaY = 0;
      this.hasLastMousePos = false;
    });

    globalBus.on('ui:openInfoModal', () => {
      this.isModalOpen = true;
      this.exitPointerLock();
    });

    globalBus.on('ui:closeInfoModal', () => {
      this.isModalOpen = false;
      this.mouse.deltaX = 0;
      this.mouse.deltaY = 0;
      this.hasLastMousePos = false;
    });

    globalBus.on('player:sittingChanged', (data) => {
      this.isSitting = data.isSitting;
    });

    globalBus.on('state:changed', (data) => {
      if (data.to !== GameState.PLAYING) {
        this.exitPointerLock();
        this.isDialogueActive = false;
        this.isSitting = false;
        this.touchMovement = { x: 0, z: 0, length: 0 };
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;
        this.hasLastMousePos = false;
      }
    });

    // Pointer Lock change listener
    const onPointerLockChange = () => {
      const isLocked = document.pointerLockElement === this.canvas || !!document.pointerLockElement;
      this.isPointerLocked = isLocked;
      if (!isLocked) {
        this.mouse.deltaX = 0;
        this.mouse.deltaY = 0;
        this.hasLastMousePos = false;
      }
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mozpointerlockchange', onPointerLockChange);
    document.addEventListener('webkitpointerlockchange', onPointerLockChange);

    // Keyboard keydown
    window.addEventListener('keydown', (e) => {
      // Prevent browser spacebar scrolling or spacebar clicking focused UI buttons
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();

        // If a UI button has focus, blur it immediately so Space doesn't activate it
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
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

      // Handle Escape: prioritize info modal dismissal, then dialogue dismissal, then bench standup, then pause toggle
      if (e.code === 'Escape' || e.key === 'Escape') {
        const infoModal = document.getElementById('info-modal');
        if (infoModal && !infoModal.classList.contains('hidden')) {
          globalBus.emit('ui:closeInfoModal');
          return;
        }
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
        const infoModal = document.getElementById('info-modal');
        if (infoModal && !infoModal.classList.contains('hidden')) {
          // Modal is active - allow normal button click if focused, but do NOT start game
          return;
        }
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

      // Handle Minimap Toggle Key M: single edge-trigger (ignores text inputs)
      if (e.code === 'KeyM' || e.key.toLowerCase() === 'm') {
        if (!e.repeat && globalGameState.is(GameState.PLAYING)) {
          const isTextInput =
            e.target &&
            (e.target.tagName === 'INPUT' ||
             e.target.tagName === 'TEXTAREA' ||
             !!e.target.isContentEditable);
          if (!isTextInput) {
            globalBus.emit('ui:toggleMinimap');
          }
        }
      }

      // Handle Day Cycle Advance Key T: single edge-trigger (ignores text inputs, requires active gameplay, no dialogue/modal)
      if (e.code === 'KeyT' || e.key.toLowerCase() === 't') {
        if (!e.repeat && globalGameState.is(GameState.PLAYING) && !this.isDialogueActive && !this.isModalOpen) {
          const isTextInput =
            e.target &&
            (e.target.tagName === 'INPUT' ||
             e.target.tagName === 'TEXTAREA' ||
             !!e.target.isContentEditable);
          if (!isTextInput) {
            globalBus.emit('time:advance', { hours: 1.0 });
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
      this.touchMovement = { x: 0, z: 0, length: 0 };
      this.mouse.deltaX = 0;
      this.mouse.deltaY = 0;
      this.hasLastMousePos = false;
    });

    // Mouse events - Free Mouse-Look & Pointer Lock
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        this.mouse.isDown = true;
      }

      // When clicking during active gameplay outside UI, request pointer lock
      if (globalGameState.is(GameState.PLAYING) && !this.isDialogueActive && !this.isModalOpen) {
        const target = e.target;
        const isInteractiveUI =
          target &&
          typeof target.closest === 'function' &&
          (target.closest('button, a, input, textarea, #minimap-wrapper, #info-modal, #pause-modal, #dialogue-modal, .touch-controls-root, .orientation-screen') !== null);

        if (!isInteractiveUI) {
          this.requestPointerLock();
        }
      }
    });

    window.addEventListener('mouseup', () => {
      this.mouse.isDown = false;
    });

    window.addEventListener('mousemove', (e) => {
      // Free mouse-look only during active PLAYING state
      if (!globalGameState.is(GameState.PLAYING)) {
        this.hasLastMousePos = false;
        return;
      }

      // Do not rotate camera during dialogue or when modals are open
      if (this.isDialogueActive || this.isModalOpen) {
        this.hasLastMousePos = false;
        return;
      }

      // If not pointer locked, ensure cursor is not over interactive UI elements
      if (!this.isPointerLocked) {
        const target = e.target;
        if (
          target &&
          typeof target.closest === 'function' &&
          target.closest('button, a, input, textarea, #minimap-wrapper, #info-modal, #pause-modal, #dialogue-modal, .touch-controls-root, .orientation-screen, .screen-layer:not(.hidden):not(.gameplay-hud)')
        ) {
          this.hasLastMousePos = false;
          return;
        }
      }

      // Extract mouse movement delta
      let dx = 0;
      let dy = 0;

      if (typeof e.movementX === 'number' && typeof e.movementY === 'number' && (e.movementX !== 0 || e.movementY !== 0)) {
        // Guard against single-frame pointer lock acquisition jump spikes
        if (Math.abs(e.movementX) < 400 && Math.abs(e.movementY) < 400) {
          dx = e.movementX;
          dy = e.movementY;
        }
      } else if (this.hasLastMousePos) {
        dx = e.clientX - this.lastMousePos.x;
        dy = e.clientY - this.lastMousePos.y;
      }

      this.lastMousePos.x = e.clientX;
      this.lastMousePos.y = e.clientY;
      this.hasLastMousePos = true;

      // Feed delta directly into mouse look without requiring button hold
      this.mouse.deltaX += dx;
      this.mouse.deltaY += dy;
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
   * Set mobile virtual joystick movement vector
   */
  setTouchMovement(x, z, length) {
    this.touchMovement.x = x;
    this.touchMovement.z = z;
    this.touchMovement.length = length;
  }

  /**
   * Add touch camera delta for smooth third-person look
   */
  addTouchCameraDelta(dx, dy) {
    this.mouse.deltaX += dx;
    this.mouse.deltaY += dy;
  }

  /**
   * Mobile touch Jump trigger
   */
  requestJump() {
    if (this.isSitting) {
      globalBus.emit('player:stand');
      return;
    }
    if (globalGameState.is(GameState.PLAYING) && !this.isDialogueActive) {
      this.jumpRequested = true;
    }
  }

  /**
   * Mobile touch Interact trigger
   */
  requestInteract() {
    if (this.isDialogueActive) {
      globalBus.emit('dialogue:close');
      return;
    }
    if (this.isSitting) {
      globalBus.emit('player:stand');
      return;
    }
    if (globalGameState.is(GameState.PLAYING)) {
      globalBus.emit('input:interact');
    }
  }

  /**
   * Toggle jog state on mobile
   */
  toggleJog() {
    this.isJogToggled = !this.isJogToggled;
    return this.isJogToggled;
  }

  setJogToggle(active) {
    this.isJogToggled = active;
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

    // Keyboard Forward / Backward
    if (this.isKeyPressed('KeyW') || this.isKeyPressed('ArrowUp') || this.isKeyPressed('w')) {
      z -= 1;
    }
    if (this.isKeyPressed('KeyS') || this.isKeyPressed('ArrowDown') || this.isKeyPressed('s')) {
      z += 1;
    }

    // Keyboard Left / Right
    if (this.isKeyPressed('KeyA') || this.isKeyPressed('ArrowLeft') || this.isKeyPressed('a')) {
      x -= 1;
    }
    if (this.isKeyPressed('KeyD') || this.isKeyPressed('ArrowRight') || this.isKeyPressed('d')) {
      x += 1;
    }

    let length = Math.hypot(x, z);
    if (length > 0.001) {
      x /= length;
      z /= length;
    } else if (this.touchMovement.length > 0.001) {
      // Use analog touch joystick input
      x = this.touchMovement.x;
      z = this.touchMovement.z;
      length = this.touchMovement.length;
    }

    const isJoggingKey =
      this.isKeyPressed('ShiftLeft') ||
      this.isKeyPressed('ShiftRight') ||
      this.isKeyPressed('shift');

    const isJogging = isJoggingKey || this.isJogToggled;

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
