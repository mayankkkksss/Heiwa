import { globalBus } from './EventBus.js';
import { globalGameState, GameState } from './GameStateManager.js';
import {
  DEFAULT_KEY_BINDINGS,
  ACTION_DEFINITIONS,
  formatKeyDisplay,
  isReservedKey,
  loadStoredKeyBindings,
  saveStoredKeyBindings,
  clearStoredKeyBindings,
} from './KeyBindings.js';

/**
 * InputManager - Centralized keyboard, mouse, touch, and customizable key-binding handling for HEIWA
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

    // Key Bindings & Capture State
    this.bindings = loadStoredKeyBindings();
    this.capturingAction = null;
    this.onCaptureCallback = null;
    this.onCaptureCancelCallback = null;

    // Touch / Mobile Input State
    this.touchMovement = { x: 0, z: 0, length: 0 };
    this.isJogToggled = false;

    this.setupListeners();
  }

  setCanvas(canvasElement) {
    this.canvas = canvasElement;
  }

  requestPointerLock() {
    if (typeof document !== 'undefined' && this.canvas && document.pointerLockElement !== this.canvas) {
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
    if (typeof document !== 'undefined' && document.pointerLockElement) {
      try {
        document.exitPointerLock?.();
      } catch (err) {}
    }
    this.isPointerLocked = false;
    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
    this.hasLastMousePos = false;
  }

  // -------------------------------------------------------------
  // KEY BINDING MANAGEMENT
  // -------------------------------------------------------------

  getBindings() {
    return { ...this.bindings };
  }

  getBinding(action) {
    return this.bindings[action] || DEFAULT_KEY_BINDINGS[action] || '';
  }

  setBinding(action, code) {
    if (!action || !code) return false;
    this.bindings[action] = code;
    saveStoredKeyBindings(this.bindings);
    globalBus.emit('input:bindingsChanged', { bindings: this.getBindings() });
    return true;
  }

  resetBindings() {
    this.bindings = { ...DEFAULT_KEY_BINDINGS };
    saveStoredKeyBindings(this.bindings);
    globalBus.emit('input:bindingsChanged', { bindings: this.getBindings() });
  }

  findConflict(action, code) {
    if (!code) return null;
    for (const [act, boundCode] of Object.entries(this.bindings)) {
      if (act !== action && boundCode === code) {
        return act;
      }
    }
    return null;
  }

  startKeyCapture(action, onCaptured, onCancelled) {
    this.capturingAction = action;
    this.onCaptureCallback = onCaptured;
    this.onCaptureCancelCallback = onCancelled;
    globalBus.emit('input:captureStarted', { action });
  }

  cancelKeyCapture() {
    if (this.capturingAction) {
      const cb = this.onCaptureCancelCallback;
      this.capturingAction = null;
      this.onCaptureCallback = null;
      this.onCaptureCancelCallback = null;
      if (typeof cb === 'function') cb();
      globalBus.emit('input:captureCancelled');
    }
  }

  isCodeBoundToOtherAction(code, exceptAction) {
    for (const [act, boundCode] of Object.entries(this.bindings)) {
      if (act !== exceptAction && boundCode === code) return true;
    }
    return false;
  }

  isActionPressed(action) {
    if (!this.bindings || !this.bindings[action]) return false;
    const primary = this.bindings[action];

    if (this.isKeyPressed(primary)) return true;

    // Normalize letter keys
    if (primary.startsWith('Key')) {
      const char = primary.slice(3).toLowerCase();
      if (this.isKeyPressed(char)) return true;
    } else if (primary === 'Space') {
      if (this.isKeyPressed(' ') || this.isKeyPressed('space')) return true;
    } else if (primary === 'ShiftLeft' || primary === 'ShiftRight') {
      if (this.isKeyPressed('ShiftLeft') || this.isKeyPressed('ShiftRight') || this.isKeyPressed('shift')) return true;
    }

    // Default arrow key fallbacks for movement if not rebound to something else
    if (action === 'moveForward' && primary !== 'ArrowUp' && !this.isCodeBoundToOtherAction('ArrowUp', action)) {
      if (this.isKeyPressed('ArrowUp')) return true;
    } else if (action === 'moveBackward' && primary !== 'ArrowDown' && !this.isCodeBoundToOtherAction('ArrowDown', action)) {
      if (this.isKeyPressed('ArrowDown')) return true;
    } else if (action === 'moveLeft' && primary !== 'ArrowLeft' && !this.isCodeBoundToOtherAction('ArrowLeft', action)) {
      if (this.isKeyPressed('ArrowLeft')) return true;
    } else if (action === 'moveRight' && primary !== 'ArrowRight' && !this.isCodeBoundToOtherAction('ArrowRight', action)) {
      if (this.isKeyPressed('ArrowRight')) return true;
    }

    return false;
  }

  matchesActionKey(e, action) {
    const code = this.bindings[action];
    if (!code) return false;
    if (e.code === code) return true;

    if (code.startsWith('Key') && e.key && e.key.toLowerCase() === code.slice(3).toLowerCase()) {
      return true;
    }
    if (code === 'Space' && (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar')) {
      return true;
    }
    if (code === 'Escape' && (e.code === 'Escape' || e.key === 'Escape')) {
      return true;
    }
    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.key === 'Shift') return true;
    }
    return false;
  }

  // -------------------------------------------------------------
  // EVENT LISTENERS SETUP
  // -------------------------------------------------------------

  setupListeners() {
    globalBus.on('dialogue:open', () => {
      this.cancelKeyCapture();
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
      this.cancelKeyCapture();
      this.isModalOpen = false;
      this.mouse.deltaX = 0;
      this.mouse.deltaY = 0;
      this.hasLastMousePos = false;
    });

    globalBus.on('player:sittingChanged', (data) => {
      this.isSitting = data.isSitting;
    });

    globalBus.on('state:changed', (data) => {
      this.cancelKeyCapture();
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
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerlockchange', onPointerLockChange);
      document.addEventListener('mozpointerlockchange', onPointerLockChange);
      document.addEventListener('webkitpointerlockchange', onPointerLockChange);
    }

    // Keyboard keydown
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        // 1. If currently in Key Capture Mode (waiting for key assignment in Settings)
        if (this.capturingAction) {
          e.preventDefault();
          e.stopPropagation();

          // Escape cancels capture mode safely
          if (e.code === 'Escape' || e.key === 'Escape') {
            this.cancelKeyCapture();
            return;
          }

          // Reject reserved keys
          if (isReservedKey(e.code)) {
            globalBus.emit('toast:show', { message: 'This key cannot be assigned.' });
            return;
          }

          // Valid key pressed
          const action = this.capturingAction;
          const cb = this.onCaptureCallback;
          this.capturingAction = null;
          this.onCaptureCallback = null;
          this.onCaptureCancelCallback = null;
          if (typeof cb === 'function') {
            cb(e.code);
          }
          return;
        }

        // Prevent browser spacebar scrolling or spacebar clicking focused UI buttons
        if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();

          if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }

          if (this.isSitting) {
            globalBus.emit('player:stand');
            return;
          }

          if (globalGameState.is(GameState.PLAYING) && !this.isDialogueActive && !this.isModalOpen) {
            if (this.matchesActionKey(e, 'jump')) {
              const wasHeld = this.keys.get('Space') === true;
              if (!wasHeld) {
                this.jumpRequested = true;
              }
            }
          }
        }

        this.keys.set(e.code, true);
        if (e.key) {
          this.keys.set(e.key.toLowerCase(), true);
        }
        if (e.code === 'Space' || e.key === ' ') {
          this.keys.set('Space', true);
        }

        // Handle Escape: prioritize confirm modal dismissal, info modal dismissal, dialogue dismissal, sitting standup, pause toggle
        if (e.code === 'Escape' || e.key === 'Escape') {
          const confirmModal = document.getElementById('confirm-modal');
          if (confirmModal && !confirmModal.classList.contains('hidden')) {
            globalBus.emit('ui:closeConfirmModal');
            return;
          }
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
            return;
          }
        }

        // Handle Enter on Title screen or to dismiss/advance dialogue in PLAYING state
        if (e.code === 'Enter' || e.key === 'Enter') {
          const infoModal = document.getElementById('info-modal');
          if (infoModal && !infoModal.classList.contains('hidden')) {
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

        // Only process action keydown triggers if active in PLAYING state and not in modal
        if (globalGameState.is(GameState.PLAYING) && !this.isModalOpen) {
          // Jump for non-Space customized bindings
          if (this.matchesActionKey(e, 'jump') && e.code !== 'Space' && e.key !== ' ') {
            if (!this.isDialogueActive && !this.isSitting) {
              const wasHeld = this.keys.get(e.code) === true;
              if (!wasHeld) {
                this.jumpRequested = true;
              }
            }
          }

          // Handle Interaction Key: single edge-trigger
          if (this.matchesActionKey(e, 'interact')) {
            if (!e.repeat) {
              if (this.isDialogueActive) {
                globalBus.emit('dialogue:close');
              } else {
                globalBus.emit('input:interact');
              }
            }
          }

          // Handle Minimap Toggle Key: single edge-trigger
          if (this.matchesActionKey(e, 'minimap')) {
            if (!e.repeat) {
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

          // Handle Day Cycle Advance Key: single edge-trigger
          if (this.matchesActionKey(e, 'advanceTime')) {
            if (!e.repeat && !this.isDialogueActive) {
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

          // Handle Pause if bound to a custom key other than Escape
          if (this.matchesActionKey(e, 'pause') && e.code !== 'Escape') {
            if (!e.repeat && !this.isDialogueActive) {
              globalGameState.togglePause();
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
        if (e.key) {
          this.keys.set(e.key.toLowerCase(), false);
        }
      });

      // Window blur reset
      window.addEventListener('blur', () => {
        this.cancelKeyCapture();
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
        if (globalGameState.is(GameState.PLAYING) && !this.isDialogueActive && !this.isModalOpen && !this.capturingAction) {
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

        // Do not rotate camera during dialogue or when modals/captures are open
        if (this.isDialogueActive || this.isModalOpen || this.capturingAction) {
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

        this.mouse.deltaX += dx;
        this.mouse.deltaY += dy;
      });

      window.addEventListener(
        'wheel',
        (e) => {
          if (!this.isModalOpen && !this.capturingAction) {
            this.mouse.wheelDelta = e.deltaY;
          }
        },
        { passive: true }
      );
    }
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
    if (globalGameState.is(GameState.PLAYING) && !this.isDialogueActive && !this.isModalOpen) {
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
    if (globalGameState.is(GameState.PLAYING) && !this.isModalOpen) {
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
    if (!globalGameState.is(GameState.PLAYING) || this.isModalOpen) {
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
    if (!globalGameState.is(GameState.PLAYING) || this.isModalOpen || this.capturingAction) {
      return { x: 0, z: 0, length: 0, isJogging: false };
    }

    let x = 0;
    let z = 0;

    // Movement using customized key bindings
    if (this.isActionPressed('moveForward')) {
      z -= 1;
    }
    if (this.isActionPressed('moveBackward')) {
      z += 1;
    }
    if (this.isActionPressed('moveLeft')) {
      x -= 1;
    }
    if (this.isActionPressed('moveRight')) {
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

    const isJogging = this.isActionPressed('jog') || this.isJogToggled;

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
