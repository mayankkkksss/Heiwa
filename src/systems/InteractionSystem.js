import * as THREE from 'three';
import { globalBus } from '../engine/EventBus.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';

const _targetPos = new THREE.Vector3();

/**
 * InteractionSystem - Centralized manager for neighborhood interactive points,
 * contextual prompts, cooldowns, session states, and peaceful world interactivity.
 */
export class InteractionSystem {
  constructor() {
    this.playerPos = new THREE.Vector3(-24.0, 0, -46.5);
    this.playerHeadingAngle = 0;
    this.interactiveTargets = [];
    this.currentNearestTarget = null;
    this.interactionRadius = 3.6;
    this.interactionRadiusSq = this.interactionRadius * this.interactionRadius;
    this.lastInteractionTime = 0;
    this.isPlayerSitting = false;
    this.isInVehicle = false;

    // Lightweight session state tracking
    this.sessionState = {
      mailboxChecked: false,
      mailboxCheckCount: 0,
      timesVended: 0,
      catPettedCount: 0,
      fountainUsedCount: 0,
      boardsRead: new Set(),
      bikeChecked: false,
    };
  }

  init(engine) {
    this.engine = engine;

    // Auto-discover and register VehicleSystem interactive targets
    const vehicleSys = this.engine.systems.find((s) => s.constructor.name === 'VehicleSystem');
    if (vehicleSys && typeof vehicleSys.getInteractiveObjects === 'function') {
      this.registerTargets(vehicleSys.getInteractiveObjects());
    }

    globalBus.on('player:moved', (data) => {
      this.playerPos.copy(data.position);
      if (typeof data.headingAngle === 'number') {
        this.playerHeadingAngle = data.headingAngle;
      }
    });

    globalBus.on('player:spawned', (data) => {
      this.playerPos.copy(data.position);
    });

    globalBus.on('player:sittingChanged', (data) => {
      this.isPlayerSitting = data.isSitting;
      if (this.isPlayerSitting) {
        globalBus.emit('interaction:focus', {
          targetName: 'Park Bench',
          prompt: 'Stand Up',
          type: 'bench',
        });
      } else {
        this.update();
      }
    });

    globalBus.on('vehicle:entered', () => {
      this.isInVehicle = true;
      this.currentNearestTarget = null;
      globalBus.emit('interaction:blur');
    });

    globalBus.on('vehicle:exited', () => {
      this.isInVehicle = false;
      this.update();
    });

    globalBus.on('input:interact', () => {
      this.triggerInteraction();
    });
  }

  registerTarget(object3D) {
    if (object3D && !this.interactiveTargets.includes(object3D)) {
      this.interactiveTargets.push(object3D);
    }
  }

  registerTargets(objectsArray) {
    if (Array.isArray(objectsArray)) {
      objectsArray.forEach((obj) => this.registerTarget(obj));
    }
  }

  triggerInteraction() {
    if (!globalGameState.is(GameState.PLAYING)) return;

    // If currently driving, pressing E exits vehicle
    if (this.isInVehicle) {
      const vehicleSys = this.engine.systems.find((s) => s.constructor.name === 'VehicleSystem');
      if (vehicleSys && (vehicleSys.state === 'IN_VEHICLE' || vehicleSys.state === 'DRIVING')) {
        vehicleSys.exitVehicle();
      }
      return;
    }

    // If currently sitting, pressing E stands up
    if (this.isPlayerSitting) {
      globalBus.emit('player:stand');
      return;
    }

    const now = performance.now();
    if (now - this.lastInteractionTime < 250) return; // 250ms debounce

    if (this.currentNearestTarget && this.currentNearestTarget.userData?.onInteract) {
      this.lastInteractionTime = now;
      const type = this.currentNearestTarget.userData.interactionType || 'generic';
      const name = this.currentNearestTarget.userData.name || 'Object';

      // Update session metrics
      if (type === 'mailbox') {
        this.sessionState.mailboxChecked = true;
        this.sessionState.mailboxCheckCount++;
      } else if (type === 'vending') {
        this.sessionState.timesVended++;
      } else if (type === 'cat') {
        this.sessionState.catPettedCount++;
      } else if (type === 'fountain') {
        this.sessionState.fountainUsedCount++;
      } else if (type === 'notice') {
        this.sessionState.boardsRead.add(name);
      } else if (type === 'bicycle') {
        this.sessionState.bikeChecked = true;
      }

      this.currentNearestTarget.userData.onInteract();
      globalBus.emit('interaction:success', { type, name });
    }
  }

  update() {
    if (!globalGameState.is(GameState.PLAYING)) {
      if (this.currentNearestTarget) {
        this.currentNearestTarget = null;
        globalBus.emit('interaction:blur');
      }
      return;
    }

    if (this.isPlayerSitting || this.isInVehicle) {
      if (this.currentNearestTarget) {
        this.currentNearestTarget = null;
        globalBus.emit('interaction:blur');
      }
      return;
    }

    let bestTarget = null;
    let bestScore = Infinity;

    // Player forward direction vector in world XZ
    const fwdX = Math.sin(this.playerHeadingAngle);
    const fwdZ = Math.cos(this.playerHeadingAngle);

    for (let i = 0; i < this.interactiveTargets.length; i++) {
      const obj = this.interactiveTargets[i];
      if (!obj || !obj.parent) continue;

      obj.getWorldPosition(_targetPos);

      const dx = _targetPos.x - this.playerPos.x;
      const dz = _targetPos.z - this.playerPos.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < this.interactionRadiusSq) {
        const dist = Math.sqrt(distSq);
        const dot = dist > 0.001 ? (dx * fwdX + dz * fwdZ) / dist : 1.0;

        // Facing bonus: items in front of player get strong preference; items directly behind get penalty
        const facingMultiplier = dot >= 0 ? (1.0 - dot * 0.42) : (1.0 - dot * 0.85);

        // Hysteresis factor to prevent prompt jitter between adjacent targets
        const hysteresis = (obj === this.currentNearestTarget) ? 0.80 : 1.0;
        const score = dist * facingMultiplier * hysteresis;

        if (score < bestScore) {
          bestScore = score;
          bestTarget = obj;
        }
      }
    }

    if (bestTarget !== this.currentNearestTarget) {
      this.currentNearestTarget = bestTarget;

      if (bestTarget) {
        globalBus.emit('interaction:focus', {
          targetName: bestTarget.userData.name || 'Object',
          prompt: bestTarget.userData.prompt || 'Interact',
          type: bestTarget.userData.interactionType || 'generic',
        });
      } else {
        globalBus.emit('interaction:blur');
      }
    }
  }
}
