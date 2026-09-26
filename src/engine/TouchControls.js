import { globalBus } from './EventBus.js';
import { globalGameState, GameState } from './GameStateManager.js';
import { globalInput } from './InputManager.js';

/**
 * TouchControls - Mobile Landscape Virtual Controls & Orientation Flow Manager
 */
export class TouchControls {
  constructor() {
    this.isTouch = false;
    this.isLandscape = false;
    this.wasPlayingBeforePortrait = false;

    // DOM References
    this.orientationScreen = null;
    this.touchControlsRoot = null;
    this.joystickZone = null;
    this.joystickBase = null;
    this.joystickKnob = null;
    this.touchLookZone = null;
    this.btnJump = null;
    this.btnInteract = null;
    this.btnJog = null;
    this.btnPause = null;
    this.interactLabel = null;

    // Joystick Math State
    this.joystickTouchId = null;
    this.joystickCenter = { x: 0, y: 0 };
    this.joystickMaxRadius = 46; // Max displacement in pixels

    // Touch Look Math State
    this.lookTouchId = null;
    this.lastLookX = 0;
    this.lastLookY = 0;
    this.lookSensitivityX = 0.0035;
    this.lookSensitivityY = 0.0028;

    this.init();
  }

  init() {
    this.detectTouchCapability();
    this.cacheElements();
    this.setupOrientationHandling();
    this.setupJoystick();
    this.setupTouchLook();
    this.setupActionButtons();
    this.setupBusListeners();

    // Initial check
    this.checkOrientation();
  }

  detectTouchCapability() {
    // Robust touch capability detection
    const hasTouch =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);

    this.isTouch = hasTouch;
  }

  cacheElements() {
    this.orientationScreen = document.getElementById('orientation-screen');
    this.touchControlsRoot = document.getElementById('touch-controls-root');
    this.joystickZone = document.getElementById('touch-joystick-zone');
    this.joystickBase = document.getElementById('joystick-base');
    this.joystickKnob = document.getElementById('joystick-knob');
    this.touchLookZone = document.getElementById('touch-look-zone');
    this.btnJump = document.getElementById('touch-btn-jump');
    this.btnInteract = document.getElementById('touch-btn-interact');
    this.btnJog = document.getElementById('touch-btn-jog');
    this.btnPause = document.getElementById('touch-btn-pause');
    this.interactLabel = document.getElementById('touch-interact-label');
  }

  setupOrientationHandling() {
    const handleOrientationChange = () => {
      // Re-evaluate touch capability in case device emulation or stylus connected
      this.detectTouchCapability();
      this.checkOrientation();
    };

    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);

    if (window.screen && window.screen.orientation) {
      window.screen.orientation.addEventListener('change', handleOrientationChange);
    }
  }

  checkOrientation() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isPortrait = h > w;
    this.isLandscape = !isPortrait;

    // Only enforce orientation screen on actual touch/mobile devices
    if (this.isTouch) {
      if (isPortrait) {
        // Show orientation blocker
        this.orientationScreen?.classList.remove('hidden');
        this.touchControlsRoot?.classList.add('hidden');

        // Safely pause gameplay if playing
        if (globalGameState.is(GameState.PLAYING)) {
          this.wasPlayingBeforePortrait = true;
          globalGameState.setState(GameState.PAUSED);
        }
      } else {
        // Landscape mode: hide orientation blocker
        this.orientationScreen?.classList.add('hidden');

        // Resume if we were playing before portrait orientation
        if (this.wasPlayingBeforePortrait && globalGameState.is(GameState.PAUSED)) {
          this.wasPlayingBeforePortrait = false;
          globalGameState.setState(GameState.PLAYING);
        }

        // Show touch controls if playing
        this.updateTouchControlsVisibility();
      }
    } else {
      // Desktop: ensure orientation screen is hidden
      this.orientationScreen?.classList.add('hidden');
      this.touchControlsRoot?.classList.add('hidden');
    }
  }

  updateTouchControlsVisibility() {
    if (!this.touchControlsRoot) return;

    if (this.isTouch && this.isLandscape && globalGameState.is(GameState.PLAYING)) {
      this.touchControlsRoot.classList.remove('hidden');
    } else {
      this.touchControlsRoot.classList.add('hidden');
      this.resetJoystick();
      this.resetTouchLook();
    }
  }

  setupBusListeners() {
    globalBus.on('state:changed', () => {
      this.updateTouchControlsVisibility();
    });

    globalBus.on('interaction:focus', (data) => {
      if (this.interactLabel) {
        let label = 'ACTION';
        if (data.type === 'bench') label = 'STAND';
        else if (data.type === 'npc' || data.type === 'person') label = 'TALK';
        else if (data.type === 'cat') label = 'PET';
        else if (data.type === 'vending') label = 'DRINK';
        else if (data.type === 'mailbox') label = 'MAIL';
        else if (data.prompt) {
          label = data.prompt.toUpperCase().slice(0, 8);
        }
        this.interactLabel.textContent = label;
      }
      this.btnInteract?.classList.add('touch-btn-focused');
    });

    globalBus.on('interaction:blur', () => {
      if (this.interactLabel) {
        this.interactLabel.textContent = 'ACTION';
      }
      this.btnInteract?.classList.remove('touch-btn-focused');
    });

    globalBus.on('dialogue:open', () => {
      if (this.interactLabel) {
        this.interactLabel.textContent = 'NEXT';
      }
      this.btnInteract?.classList.add('touch-btn-focused');
    });

    globalBus.on('dialogue:close', () => {
      if (this.interactLabel) {
        this.interactLabel.textContent = 'ACTION';
      }
      this.btnInteract?.classList.remove('touch-btn-focused');
    });
  }

  setupJoystick() {
    if (!this.joystickZone || !this.joystickBase || !this.joystickKnob) return;

    const onTouchStart = (e) => {
      e.preventDefault();
      if (this.joystickTouchId !== null) return;

      const touch = e.changedTouches[0];
      this.joystickTouchId = touch.identifier;

      const rect = this.joystickBase.getBoundingClientRect();
      this.joystickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      this.updateJoystickPosition(touch.clientX, touch.clientY);
    };

    const onTouchMove = (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.joystickTouchId) {
          this.updateJoystickPosition(touch.clientX, touch.clientY);
          break;
        }
      }
    };

    const onTouchEnd = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.joystickTouchId) {
          this.resetJoystick();
          break;
        }
      }
    };

    this.joystickZone.addEventListener('touchstart', onTouchStart, { passive: false });
    this.joystickZone.addEventListener('touchmove', onTouchMove, { passive: false });
    this.joystickZone.addEventListener('touchend', onTouchEnd, { passive: false });
    this.joystickZone.addEventListener('touchcancel', onTouchEnd, { passive: false });
  }

  updateJoystickPosition(touchX, touchY) {
    let dx = touchX - this.joystickCenter.x;
    let dy = touchY - this.joystickCenter.y;
    const distance = Math.hypot(dx, dy);

    if (distance > this.joystickMaxRadius) {
      dx = (dx / distance) * this.joystickMaxRadius;
      dy = (dy / distance) * this.joystickMaxRadius;
    }

    // Visual update
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    }

    // Vector calculations for PlayerSystem
    // dx is horizontal (right = +X), dy is vertical (up on screen is negative screen Y = forward in world -Z)
    const normalizedLength = Math.min(1.0, distance / this.joystickMaxRadius);
    if (normalizedLength > 0.08) {
      const normX = dx / this.joystickMaxRadius;
      const normZ = dy / this.joystickMaxRadius;
      globalInput.setTouchMovement(normX, normZ, normalizedLength);
    } else {
      globalInput.setTouchMovement(0, 0, 0);
    }
  }

  resetJoystick() {
    this.joystickTouchId = null;
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = 'translate3d(0, 0, 0)';
    }
    globalInput.setTouchMovement(0, 0, 0);
  }

  setupTouchLook() {
    if (!this.touchLookZone) return;

    const onTouchStart = (e) => {
      e.preventDefault();
      if (this.lookTouchId !== null) return;

      const touch = e.changedTouches[0];
      this.lookTouchId = touch.identifier;
      this.lastLookX = touch.clientX;
      this.lastLookY = touch.clientY;
    };

    const onTouchMove = (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.lookTouchId) {
          const deltaX = touch.clientX - this.lastLookX;
          const deltaY = touch.clientY - this.lastLookY;

          this.lastLookX = touch.clientX;
          this.lastLookY = touch.clientY;

          // Push delta to input manager
          globalInput.addTouchCameraDelta(deltaX, deltaY);
          break;
        }
      }
    };

    const onTouchEnd = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.lookTouchId) {
          this.resetTouchLook();
          break;
        }
      }
    };

    this.touchLookZone.addEventListener('touchstart', onTouchStart, { passive: false });
    this.touchLookZone.addEventListener('touchmove', onTouchMove, { passive: false });
    this.touchLookZone.addEventListener('touchend', onTouchEnd, { passive: false });
    this.touchLookZone.addEventListener('touchcancel', onTouchEnd, { passive: false });
  }

  resetTouchLook() {
    this.lookTouchId = null;
    this.lastLookX = 0;
    this.lastLookY = 0;
  }

  setupActionButtons() {
    // Jump Button
    if (this.btnJump) {
      const handleJump = (e) => {
        e.preventDefault();
        e.stopPropagation();
        globalInput.requestJump();
        this.btnJump.classList.add('touch-btn-active');
        setTimeout(() => this.btnJump.classList.remove('touch-btn-active'), 120);
      };
      this.btnJump.addEventListener('touchstart', handleJump, { passive: false });
    }

    // Interact Button
    if (this.btnInteract) {
      const handleInteract = (e) => {
        e.preventDefault();
        e.stopPropagation();
        globalInput.requestInteract();
        this.btnInteract.classList.add('touch-btn-active');
        setTimeout(() => this.btnInteract.classList.remove('touch-btn-active'), 120);
      };
      this.btnInteract.addEventListener('touchstart', handleInteract, { passive: false });
    }

    // Jog Toggle Button
    if (this.btnJog) {
      const handleJog = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isJogging = globalInput.toggleJog();
        if (isJogging) {
          this.btnJog.classList.add('touch-btn-toggled');
        } else {
          this.btnJog.classList.remove('touch-btn-toggled');
        }
      };
      this.btnJog.addEventListener('touchstart', handleJog, { passive: false });
    }

    // Pause Button
    if (this.btnPause) {
      const handlePause = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (globalGameState.is(GameState.PLAYING) || globalGameState.is(GameState.PAUSED)) {
          globalGameState.togglePause();
        }
      };
      this.btnPause.addEventListener('touchstart', handlePause, { passive: false });
    }
  }
}
