import './style.css';
import { Engine } from './engine/Engine.js';
import { WorldSystem } from './systems/WorldSystem.js';
import { PlayerSystem } from './systems/PlayerSystem.js';
import { CameraSystem } from './systems/CameraSystem.js';
import { NPCSystem } from './systems/NPCSystem.js';
import { InteractionSystem } from './systems/InteractionSystem.js';
import { QuestSystem } from './systems/QuestSystem.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { UISystem } from './systems/UISystem.js';
import { WorldStreamingSystem } from './world/WorldStreamingSystem.js';
import { VehicleSystem } from './entities/VehicleSystem.js';
import { SaveSystem } from './engine/SaveSystem.js';
import { globalBus } from './engine/EventBus.js';
import { globalGameState, GameState } from './engine/GameStateManager.js';
import { globalInput } from './engine/InputManager.js';
import { TouchControls } from './engine/TouchControls.js';

/**
 * Display a production-safe startup error overlay in case of fatal initialization failure.
 */
function showStartupError(systemName, error) {
  console.error(`[HEIWA ERROR] Subsystem '${systemName}' failure:`, error);

  const existing = document.getElementById('heiwa-startup-error-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'heiwa-startup-error-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(11, 15, 23, 0.96);
    color: #f8fafc;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-sizing: border-box;
  `;

  const userMessage = error?.message && error.message.includes('WebGL')
    ? 'WebGL is not supported or hardware acceleration is disabled in your browser. Please enable hardware acceleration in your browser settings or try a modern WebGL-compatible browser.'
    : 'Unable to start the game environment. Please refresh the page or try using a modern desktop browser with WebGL enabled.';

  overlay.innerHTML = `
    <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 16px; padding: 32px; max-width: 480px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
      <div style="font-size: 2.2rem; margin-bottom: 12px; color: #ff758f;">平和</div>
      <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 12px; color: #ffffff;">Unable to Start HEIWA</h2>
      <p style="font-size: 0.9rem; line-height: 1.6; color: #94a3b8; margin-bottom: 24px;">${userMessage}</p>
      <button onclick="location.reload()" style="background: linear-gradient(135deg, #ff758f, #f43f5e); color: white; border: none; padding: 10px 24px; border-radius: 9999px; font-weight: 600; cursor: pointer; font-size: 0.9rem; box-shadow: 0 4px 16px rgba(255, 117, 143, 0.35);">Reload Page</button>
    </div>
  `;

  document.body.appendChild(overlay);
}

/**
 * HEIWA - Main Game Bootstrap & Lifecycle Manager
 */
class GameApp {
  constructor() {
    this.engine = null;
    this.isInitialized = false;
    this.isLoadingInProgress = false;
  }

  async start() {
    try {
      const canvas = document.getElementById('webgl-canvas');
      if (!canvas) {
        throw new Error('Failed to locate #webgl-canvas element.');
      }

      globalInput.setCanvas(canvas);

      // Initialize mobile touch controls and orientation monitor
      this.touchControls = new TouchControls();

      // 1. Initialize Core Engine
      this.engine = new Engine(canvas);

      // 2. Instantiate Systems with Individual Safety Blocks
      const audioSystem = new AudioSystem();
      const worldSystem = new WorldSystem();
      const streamingSystem = new WorldStreamingSystem();
      const playerSystem = new PlayerSystem();
      const vehicleSystem = new VehicleSystem();
      const cameraSystem = new CameraSystem();
      const npcSystem = new NPCSystem();
      const interactionSystem = new InteractionSystem();
      const questSystem = new QuestSystem();
      const uiSystem = new UISystem();
      const saveSystem = new SaveSystem();

      this.saveSystem = saveSystem;
      window.__HEIWA_SAVE_SYSTEM__ = saveSystem;

      const systemsToRegister = [
        { name: 'AudioSystem', instance: audioSystem, optional: true },
        { name: 'WorldSystem', instance: worldSystem, optional: false },
        { name: 'WorldStreamingSystem', instance: streamingSystem, optional: false },
        { name: 'NPCSystem', instance: npcSystem, optional: false },
        { name: 'PlayerSystem', instance: playerSystem, optional: false },
        { name: 'VehicleSystem', instance: vehicleSystem, optional: false },
        { name: 'CameraSystem', instance: cameraSystem, optional: false },
        { name: 'InteractionSystem', instance: interactionSystem, optional: false },
        { name: 'QuestSystem', instance: questSystem, optional: false },
        { name: 'UISystem', instance: uiSystem, optional: false },
        { name: 'SaveSystem', instance: saveSystem, optional: false },
      ];

      for (const sys of systemsToRegister) {
        try {
          this.engine.registerSystem(sys.instance);
        } catch (err) {
          if (sys.optional) {
            console.warn(`[GameApp] Optional system ${sys.name} failed to initialize:`, err);
          } else {
            showStartupError(sys.name, err);
            throw err;
          }
        }
      }

      // 3. Register Interactive Targets
      try {
        interactionSystem.registerTargets(worldSystem.interactiveObjects);
        interactionSystem.registerTargets(npcSystem.getInteractiveObjects());
        if (typeof vehicleSystem.getInteractiveObjects === 'function') {
          interactionSystem.registerTargets(vehicleSystem.getInteractiveObjects());
        }
      } catch (err) {
        console.warn('[GameApp] Non-fatal error registering interactive targets:', err);
      }

      // 4. Start the Engine Loop
      this.engine.start();

      // Listen for Title "Begin" button or Enter key
      globalBus.on('ui:startBegin', () => {
        this.beginGameLoading();
      });

      this.isInitialized = true;
      console.log('🌸 HEIWA Engine & Title Screen Ready.');

      // Check for development test mode via URL query param: ?autotest=1
      const isAutotest = new URLSearchParams(window.location.search).get('autotest') === '1';
      console.log(`[HEIWA AUTOTEST] detected: ${isAutotest}`);
      if (isAutotest) {
        this.launchAutotestMode();
      }
    } catch (fatalError) {
      showStartupError('GameApp.start', fatalError);
    }
  }

  async launchAutotestMode() {
    try {
      const { AutoTestRunner } = await import('./testing/AutoTestRunner.js');
      // Programmatically transition directly to PLAYING state for autotest
      globalGameState.setState(GameState.PLAYING);
      const runner = new AutoTestRunner(this.engine);
      window.__HEIWA_AUTOTEST_RUNNER__ = runner;
      await runner.runAll();
    } catch (err) {
      showStartupError('AutoTestRunner', err);
    }
  }

  async beginGameLoading() {
    if (this.isLoadingInProgress) return;
    this.isLoadingInProgress = true;

    globalGameState.setState(GameState.LOADING);

    // Startup timeout safeguard (8 seconds max) to prevent infinite loading screens
    const loadingTimeout = setTimeout(() => {
      if (globalGameState.is(GameState.LOADING)) {
        console.error('[GameApp] Loading timeout exceeded (8s). Forcing transition to PLAYING.');
        globalGameState.setState(GameState.PLAYING);
      }
    }, 8000);

    const hasSaveData = this.saveSystem && this.saveSystem.hasSave();

    const stages = [
      { name: 'INITIALIZING ENGINE...', progress: 0.15, delay: 50 },
      { name: hasSaveData ? 'STREAMING SAVED REGION...' : 'BUILDING DISTRICT ENVIRONMENT...', progress: 0.4, delay: 60 },
      { name: 'CONFIGURING MAYANK & PHYSICS...', progress: 0.65, delay: 50 },
      { name: 'POPULATING NEIGHBORHOOD RESIDENTS...', progress: 0.85, delay: 50 },
      { name: 'PREPARING PEACEFUL SOUNDSCAPES...', progress: 0.95, delay: 40 },
      { name: 'READY', progress: 1.0, delay: 60 },
    ];

    try {
      let restored = false;
      if (hasSaveData) {
        try {
          restored = this.saveSystem.restoreGameState();
        } catch (err) {
          console.warn('[GameApp] Error restoring saved state:', err);
        }
      }

      for (const stage of stages) {
        globalBus.emit('loading:progress', {
          stage: stage.name,
          progress: stage.progress,
        });
        await new Promise((resolve) => setTimeout(resolve, stage.delay));
      }

      clearTimeout(loadingTimeout);

      // Transition smoothly to PLAYING
      globalGameState.setState(GameState.PLAYING);

      if (restored) {
        globalBus.emit('toast:show', {
          message: 'Resumed exploration.',
        });
      } else {
        globalBus.emit('toast:show', {
          message: 'Welcome to Sakuragaoka District!',
        });
      }
    } catch (err) {
      clearTimeout(loadingTimeout);
      showStartupError('beginGameLoading', err);
      // Fallback transition so game is never permanently stuck
      globalGameState.setState(GameState.PLAYING);
    } finally {
      this.isLoadingInProgress = false;
    }
  }
}

const app = new GameApp();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.start());
} else {
  app.start();
}
