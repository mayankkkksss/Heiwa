import { globalBus } from './EventBus.js';
import { globalGameState, GameState } from './GameStateManager.js';
import { globalInput } from './InputManager.js';
import { FullscreenManager } from '../utils/FullscreenManager.js';

/**
 * TouchControls - Mobile Landscape Virtual Controls & Orientation Flow Manager
 */
export class TouchControls {
  constructor() {
    this.isTouch = false;
    this.isLandscape = false;
    this.wasPlayingBeforePortrait = false;
    this.lastOrientation = null; // 'portrait' | 'landscape' | null

    // DOM References
    this.orientationScreen = null;
    this.orientationIconRotate = null;
    this.orientationTitle = null;
    this.orientationMessage = null;
    this.orientationActionBox = null;
    this.btnEnterFullscreen = null;
    this.btnSkipFullscreen = null;
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
    this.setupFullscreenListeners();
    this.setupJoystick();
    this.setupTouchLook();
    this.setupActionButtons();
    this.setupBusListeners();

    // Initial check
    this.checkOrientation();
  }

  detectTouchCapability() {
    // Robust touch capability detection with mobile vs desktop differentiation
    const hasTouch =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window ||
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
        (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches));

    const isMobileUA =
      typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry|Mobile/i.test(navigator.userAgent || '');

    const isCoarseOnly =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(pointer: coarse) and (hover: none)').matches;

    this.isTouch = Boolean(
      hasTouch &&
        (isMobileUA ||
          isCoarseOnly ||
          (typeof navigator !== 'undefined' &&
            navigator.maxTouchPoints > 0 &&
            typeof window !== 'undefined' &&
            Math.max(window.innerWidth, window.innerHeight) <= 1366))
    );
  }

  cacheElements() {
    if (typeof document === 'undefined') return;
    this.orientationScreen = document.getElementById('orientation-screen');
    this.orientationIconRotate = document.getElementById('orientation-icon-rotate');
    this.orientationTitle = document.getElementById('orientation-title');
    this.orientationMessage = document.getElementById('orientation-message');
    this.orientationActionBox = document.getElementById('orientation-action-box');
    this.btnEnterFullscreen = document.getElementById('btn-enter-fullscreen');
    this.btnSkipFullscreen = document.getElementById('btn-skip-fullscreen');
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
    if (typeof window === 'undefined') return;

    const handleOrientationChange = () => {
      this.detectTouchCapability();
      this.checkOrientation();
    };

    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', () => {
      handleOrientationChange();
      setTimeout(handleOrientationChange, 80);
      setTimeout(handleOrientationChange, 240);
    });

    if (window.screen && window.screen.orientation) {
      window.screen.orientation.addEventListener('change', () => {
        handleOrientationChange();
        setTimeout(handleOrientationChange, 80);
        setTimeout(handleOrientationChange, 240);
      });
    }

    if (window.matchMedia) {
      try {
        const mql = window.matchMedia('(orientation: landscape)');
        if (typeof mql.addEventListener === 'function') {
          mql.addEventListener('change', handleOrientationChange);
        } else if (typeof mql.addListener === 'function') {
          mql.addListener(handleOrientationChange);
        }
      } catch (e) {}
    }
  }

  setupFullscreenListeners() {
    // Fullscreen state listener via FullscreenManager
    FullscreenManager.addChangeListener((isFs) => {
      if (isFs && !this.isPortraitMode()) {
        this.onFullscreenSuccess();
      }
    });

    // One-tap Fullscreen Action Button
    if (this.btnEnterFullscreen) {
      const handleEnterFs = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Direct trusted user activation invocation
        const success = await FullscreenManager.requestGameFullscreen(
          document.getElementById('game-container')
        );

        if (success || !this.isPortraitMode()) {
          this.onFullscreenSuccess();
        }
      };

      this.btnEnterFullscreen.addEventListener('click', handleEnterFs);
      this.btnEnterFullscreen.addEventListener('touchend', handleEnterFs);
    }

    // Skip / Windowed Landscape Button
    if (this.btnSkipFullscreen) {
      const handleSkip = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onFullscreenSuccess();
      };

      this.btnSkipFullscreen.addEventListener('click', handleSkip);
      this.btnSkipFullscreen.addEventListener('touchend', handleSkip);
    }
  }

  onFullscreenSuccess() {
    this.orientationScreen?.classList.add('hidden');
    this.orientationActionBox?.classList.add('hidden');

    if (this.wasPlayingBeforePortrait && globalGameState.is(GameState.PAUSED)) {
      this.wasPlayingBeforePortrait = false;
      globalGameState.setState(GameState.PLAYING);
    }

    this.updateTouchControlsVisibility();
    globalBus.emit('viewport:resize', {
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }

  isPortraitMode() {
    // 1. screen.orientation API
    if (
      typeof window !== 'undefined' &&
      window.screen &&
      window.screen.orientation &&
      typeof window.screen.orientation.type === 'string'
    ) {
      if (window.screen.orientation.type.startsWith('portrait')) return true;
      if (window.screen.orientation.type.startsWith('landscape')) return false;
    }

    // 2. CSS matchMedia orientation query
    if (typeof window !== 'undefined' && window.matchMedia) {
      try {
        const mqlPortrait = window.matchMedia('(orientation: portrait)');
        if (mqlPortrait && mqlPortrait.matches) return true;
        const mqlLandscape = window.matchMedia('(orientation: landscape)');
        if (mqlLandscape && mqlLandscape.matches) return false;
      } catch (e) {}
    }

    // 3. Fallback: viewport dimensions
    if (typeof window !== 'undefined') {
      return window.innerHeight > window.innerWidth;
    }
    return false;
  }

  checkOrientation() {
    const isPortrait = this.isPortraitMode();
    this.isLandscape = !isPortrait;

    // Only enforce orientation screen on actual touch/mobile devices
    if (this.isTouch) {
      if (isPortrait) {
        // Show orientation blocker in portrait mode
        this.orientationScreen?.classList.remove('hidden');
        this.orientationIconRotate?.classList.remove('hidden');
        if (this.orientationTitle) this.orientationTitle.textContent = 'Landscape Mode Required';
        if (this.orientationMessage) {
          this.orientationMessage.textContent = 'Please rotate your device to landscape to play HEIWA.';
        }
        this.orientationActionBox?.classList.add('hidden');
        this.touchControlsRoot?.classList.add('hidden');

        // Immediately reset touch inputs so nothing lingers
        this.resetJoystick();
        this.resetTouchLook();
        globalInput.setTouchMovement(0, 0, 0);

        // Safely pause gameplay if currently playing
        if (globalGameState.is(GameState.PLAYING)) {
          this.wasPlayingBeforePortrait = true;
          globalGameState.setState(GameState.PAUSED);
        }

        this.lastOrientation = 'portrait';
      } else {
        // Landscape mode:
        const isFs = FullscreenManager.isGameFullscreen();
        const isFsSupported = FullscreenManager.isFullscreenSupported();
        const isTransitionFromPortrait = this.lastOrientation === 'portrait';

        if (isFs || !isFsSupported || !isTransitionFromPortrait) {
          // If already in fullscreen, OR if fullscreen is unsupported by browser (e.g. iOS Safari on iPhone),
          // OR if user was already playing in landscape (e.g. exited fullscreen without rotating):
          // Directly hide orientation blocker and keep landscape gameplay active
          this.orientationScreen?.classList.add('hidden');
          this.orientationActionBox?.classList.add('hidden');

          if (this.wasPlayingBeforePortrait && globalGameState.is(GameState.PAUSED)) {
            this.wasPlayingBeforePortrait = false;
            globalGameState.setState(GameState.PLAYING);
          }

          this.updateTouchControlsVisibility();
        } else {
          // Just rotated from portrait -> landscape, fullscreen is supported and requires user activation (e.g. Android Chrome):
          // Present the single-tap "ENTER FULLSCREEN" prompt
          this.orientationScreen?.classList.remove('hidden');
          this.orientationIconRotate?.classList.add('hidden');
          if (this.orientationTitle) this.orientationTitle.textContent = 'Landscape Detected';
          if (this.orientationMessage) {
            this.orientationMessage.textContent = 'Tap below to enter full-screen mode and start playing.';
          }
          this.orientationActionBox?.classList.remove('hidden');
          this.touchControlsRoot?.classList.add('hidden');
        }

        this.lastOrientation = 'landscape';
      }
    } else {
      // Desktop: ensure orientation screen is hidden
      this.orientationScreen?.classList.add('hidden');
      this.touchControlsRoot?.classList.add('hidden');
      this.lastOrientation = isPortrait ? 'portrait' : 'landscape';
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
