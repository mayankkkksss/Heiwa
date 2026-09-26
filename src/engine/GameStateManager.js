import { globalBus } from './EventBus.js';

/**
 * GameState - Enum for application states
 */
export const GameState = {
  TITLE: 'TITLE',
  LOADING: 'LOADING',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
};

/**
 * GameStateManager - Clean centralized state machine for HEIWA
 */
export class GameStateManager {
  constructor() {
    this.currentState = GameState.TITLE;
    this.previousState = null;
  }

  getState() {
    return this.currentState;
  }

  is(state) {
    return this.currentState === state;
  }

  setState(newState, payload = {}) {
    if (this.currentState === newState) return;

    this.previousState = this.currentState;
    this.currentState = newState;

    console.log(`[GameState] Transitioned: ${this.previousState} -> ${this.currentState}`);

    globalBus.emit('state:changed', {
      from: this.previousState,
      to: this.currentState,
      ...payload,
    });
  }

  togglePause() {
    if (this.currentState === GameState.PLAYING) {
      this.setState(GameState.PAUSED);
    } else if (this.currentState === GameState.PAUSED) {
      this.setState(GameState.PLAYING);
    }
  }
}

export const globalGameState = new GameStateManager();
