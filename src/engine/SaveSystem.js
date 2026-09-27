import { globalBus } from './EventBus.js';
import { globalGameState, GameState } from './GameStateManager.js';
import { setWorldSeed, getWorldSeed, resetWorldSeed, HEIWA_WORLD_SEED } from '../utils/SeededRandom.js';

export const SAVE_KEY = 'heiwa_save_v1';
export const SAVE_VERSION = 1;
export const AUTOSAVE_INTERVAL_MS = 25000; // 25 seconds periodic autosave
export const DEBOUNCE_DELAY_MS = 1500; // 1.5s event-driven save debouncing

/**
 * SaveSystem - Centralized persistence manager for HEIWA.
 * Handles deterministic world state serialization, multi-trigger autosaving,
 * offline browser storage, data validation, and clean game resets.
 */
export class SaveSystem {
  constructor() {
    this.engine = null;
    this.saveTimer = null;
    this.debounceTimer = null;
    this.isSaving = false;
    this.lastSaveTime = 0;
    this.lastSaveStatus = 'None';
  }

  init(engine) {
    this.engine = engine;

    // 1. Setup Event-driven autosave hooks
    globalBus.on('quest:stateChanged', () => this.scheduleSave('Quest Progress'));
    globalBus.on('vehicle:entered', () => this.scheduleSave('Entered Vehicle'));
    globalBus.on('vehicle:exited', () => this.scheduleSave('Exited Vehicle'));
    globalBus.on('time:updated', () => this.scheduleSave('Time Update'));
    globalBus.on('player:sittingChanged', () => this.scheduleSave('Sitting State'));
    globalBus.on('destination:discovered', () => this.scheduleSave('Destination Discovered'));
    globalBus.on('ui:requestReset', () => this.resetGame());

    // 2. Browser Page Lifecycle & Visibility Hooks
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && globalGameState.is(GameState.PLAYING)) {
          this.saveNow('Visibility Hidden');
        }
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => {
        if (globalGameState.is(GameState.PLAYING)) {
          this.saveNow('Page Hide');
        }
      });

      window.addEventListener('beforeunload', () => {
        if (globalGameState.is(GameState.PLAYING)) {
          this.saveNow('Before Unload');
        }
      });
    }

    // 3. Periodic Background Autosave
    if (typeof setInterval !== 'undefined') {
      this.saveTimer = setInterval(() => {
        if (globalGameState.is(GameState.PLAYING)) {
          this.saveNow('Periodic Autosave');
        }
      }, AUTOSAVE_INTERVAL_MS);
    }
  }

  /**
   * Checks whether a valid and compatible save file exists in localStorage
   */
  hasSave() {
    try {
      if (typeof localStorage === 'undefined') return false;
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return this.validateSaveData(parsed);
    } catch {
      return false;
    }
  }

  /**
   * Loads and validates save data from localStorage
   */
  loadSaveData() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (this.validateSaveData(parsed)) {
        return parsed;
      }
      console.warn('[SaveSystem] Stored save data is incompatible or corrupted.');
      return null;
    } catch (err) {
      console.warn('[SaveSystem] Failed to read save from localStorage:', err);
      return null;
    }
  }

  /**
   * Validates save data structure and numbers against corruption
   */
  validateSaveData(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.version !== SAVE_VERSION) return false;
    if (typeof data.timestamp !== 'number' || !isFinite(data.timestamp)) return false;
    if (typeof data.worldSeed !== 'number' || !isFinite(data.worldSeed)) return false;

    // Validate player block
    if (!data.player || typeof data.player !== 'object') return false;
    const pPos = data.player.position;
    if (!pPos || !this.isValidCoord(pPos.x) || !this.isValidCoord(pPos.z)) return false;

    // Validate vehicle block
    if (data.vehicle && typeof data.vehicle === 'object') {
      const vPos = data.vehicle.position;
      if (vPos && (!this.isValidCoord(vPos.x) || !this.isValidCoord(vPos.z))) return false;
    }

    return true;
  }

  isValidCoord(val) {
    return typeof val === 'number' && isFinite(val) && !isNaN(val) && Math.abs(val) <= 100000;
  }

  /**
   * Schedule a debounced save to coalesce multiple rapid game events
   */
  scheduleSave(reason = '') {
    if (!globalGameState.is(GameState.PLAYING)) return;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.saveNow(reason);
    }, DEBOUNCE_DELAY_MS);
  }

  /**
   * Performs an immediate, atomic write of current game state to localStorage
   */
  saveNow(reason = '', force = false) {
    if (this.isSaving) return false;
    if (!this.engine) return false;
    if (!force && !globalGameState.is(GameState.PLAYING)) return false;

    this.isSaving = true;
    try {
      const playerSys = this.engine.systems.find((s) => s.constructor.name === 'PlayerSystem');
      const vehicleSys = this.engine.systems.find((s) => s.constructor.name === 'VehicleSystem');
      const cameraSys = this.engine.systems.find((s) => s.constructor.name === 'CameraSystem');
      const worldSys = this.engine.systems.find((s) => s.constructor.name === 'WorldSystem');
      const streamingSys = this.engine.systems.find((s) => s.constructor.name === 'WorldStreamingSystem');
      const questSys = this.engine.systems.find((s) => s.constructor.name === 'QuestSystem');

      const activeSeed = getWorldSeed();

      const vState = vehicleSys ? vehicleSys.getStateForSave() : null;
      const isInVehicle = !!(vState?.isInVehicle || vState?.vehicleState === 'DRIVING');

      const payload = {
        version: SAVE_VERSION,
        timestamp: Date.now(),
        reason,
        worldSeed: activeSeed,
        isInVehicle,
        player: playerSys ? playerSys.getStateForSave() : null,
        vehicle: vState,
        camera: cameraSys ? cameraSys.getStateForSave() : null,
        world: worldSys ? worldSys.getStateForSave() : null,
        streaming: streamingSys ? streamingSys.getStateForSave() : null,
        quest: questSys ? questSys.getStateForSave() : null,
      };

      if (!this.validateSaveData(payload)) {
        console.warn('[SaveSystem] Generated payload failed validation check.');
        return false;
      }

      const serialized = JSON.stringify(payload);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SAVE_KEY, serialized);
      }

      this.lastSaveTime = Date.now();
      this.lastSaveStatus = 'Autosaved';

      globalBus.emit('save:saved', {
        timestamp: this.lastSaveTime,
        status: this.lastSaveStatus,
        reason,
      });

      return true;
    } catch (err) {
      console.warn('[SaveSystem] Unable to write save data to storage:', err);
      return false;
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Restores all registered systems to the state captured in the save file
   */
  restoreGameState() {
    const data = this.loadSaveData();
    if (!data) return false;

    console.log(`[SaveSystem] Restoring saved game from ${new Date(data.timestamp).toLocaleTimeString()} (seed: ${data.worldSeed})`);

    // 1. Restore Master World Seed
    if (typeof data.worldSeed === 'number') {
      setWorldSeed(data.worldSeed);
    }

    const playerSys = this.engine?.systems.find((s) => s.constructor.name === 'PlayerSystem');
    const vehicleSys = this.engine?.systems.find((s) => s.constructor.name === 'VehicleSystem');
    const cameraSys = this.engine?.systems.find((s) => s.constructor.name === 'CameraSystem');
    const worldSys = this.engine?.systems.find((s) => s.constructor.name === 'WorldSystem');
    const streamingSys = this.engine?.systems.find((s) => s.constructor.name === 'WorldStreamingSystem');
    const questSys = this.engine?.systems.find((s) => s.constructor.name === 'QuestSystem');

    const isInVehicle = !!(data.isInVehicle || data.player?.isInVehicle || data.vehicle?.isInVehicle || data.vehicle?.vehicleState === 'DRIVING' || data.vehicle?.state === 'IN_VEHICLE' || data.vehicle?.state === 'DRIVING');

    // 2. Restore World & Time State
    if (worldSys && data.world && typeof worldSys.restoreState === 'function') {
      worldSys.restoreState(data.world);
    }

    // 3. Restore Quests
    if (questSys && data.quest && typeof questSys.restoreState === 'function') {
      questSys.restoreState(data.quest);
    }

    // 4. Restore Vehicle
    if (vehicleSys && data.vehicle && typeof vehicleSys.restoreState === 'function') {
      vehicleSys.restoreState(data.vehicle, isInVehicle);
    }

    // 5. Restore Player
    if (playerSys && data.player && typeof playerSys.restoreState === 'function') {
      playerSys.restoreState(data.player);
    }

    // 6. Determine authoritative focus position for immediate chunk streaming
    const focusPos = isInVehicle && data.vehicle?.position
      ? data.vehicle.position
      : (data.player?.position || { x: -24.0, y: 0, z: -46.5 });

    if (streamingSys && typeof streamingSys.restoreState === 'function') {
      streamingSys.restoreState(data.streaming, focusPos);
    }

    // 7. Restore Camera Orientation
    if (cameraSys && data.camera && typeof cameraSys.restoreState === 'function') {
      cameraSys.restoreState(data.camera, focusPos);
    }

    this.lastSaveTime = data.timestamp;
    this.lastSaveStatus = 'Loaded';

    globalBus.emit('save:restored', {
      timestamp: data.timestamp,
      focusPosition: focusPos,
      isInVehicle,
    });

    return true;
  }

  /**
   * Permanently clears save from storage and resets all in-memory systems to default
   */
  resetGame() {
    console.log('[SaveSystem] Resetting game: clearing local storage and restoring defaults.');

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SAVE_KEY);
      }
    } catch (err) {
      console.warn('[SaveSystem] Error removing save from localStorage:', err);
    }

    // Reset master seed
    resetWorldSeed();

    const playerSys = this.engine?.systems.find((s) => s.constructor.name === 'PlayerSystem');
    const vehicleSys = this.engine?.systems.find((s) => s.constructor.name === 'VehicleSystem');
    const cameraSys = this.engine?.systems.find((s) => s.constructor.name === 'CameraSystem');
    const worldSys = this.engine?.systems.find((s) => s.constructor.name === 'WorldSystem');
    const streamingSys = this.engine?.systems.find((s) => s.constructor.name === 'WorldStreamingSystem');
    const questSys = this.engine?.systems.find((s) => s.constructor.name === 'QuestSystem');

    if (worldSys && typeof worldSys.resetWorld === 'function') {
      worldSys.resetWorld();
    }
    if (questSys && typeof questSys.resetQuests === 'function') {
      questSys.resetQuests();
    }
    if (vehicleSys && typeof vehicleSys.resetToInitial === 'function') {
      vehicleSys.resetToInitial();
    }
    if (playerSys && typeof playerSys.resetToSpawn === 'function') {
      playerSys.resetToSpawn();
    }
    if (streamingSys && typeof streamingSys.resetStreaming === 'function') {
      streamingSys.resetStreaming();
    }
    if (cameraSys && typeof cameraSys.resetCamera === 'function') {
      cameraSys.resetCamera();
    }

    this.lastSaveTime = 0;
    this.lastSaveStatus = 'Reset';

    globalBus.emit('save:deleted');
    globalBus.emit('toast:show', { message: 'Game progress has been reset.' });

    // Transition back to TITLE screen
    globalGameState.setState(GameState.TITLE);
  }

  destroy() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
