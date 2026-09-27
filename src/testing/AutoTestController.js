import * as THREE from 'three';
import { globalBus } from '../engine/EventBus.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';
import { globalInput } from '../engine/InputManager.js';
import { MOVEMENT_CONFIG } from '../systems/PlayerSystem.js';

const _targetVec = new THREE.Vector3();
const _diffVec = new THREE.Vector3();

/**
 * AutoTestController - Programmatically drives Mayank and game interactions
 * using real player kinematic functions and state machines for autonomous playability testing.
 */
export class AutoTestController {
  constructor(engine) {
    this.engine = engine;
    this.playerSystem = engine.systems.find((s) => s.constructor.name === 'PlayerSystem');
    this.interactionSystem = engine.systems.find((s) => s.constructor.name === 'InteractionSystem');
    this.npcSystem = engine.systems.find((s) => s.constructor.name === 'NPCSystem');
    this.worldSystem = engine.systems.find((s) => s.constructor.name === 'WorldSystem');
    this.cameraSystem = engine.systems.find((s) => s.constructor.name === 'CameraSystem');
    this.questSystem = engine.systems.find((s) => s.constructor.name === 'QuestSystem');
    this.uiSystem = engine.systems.find((s) => s.constructor.name === 'UISystem');
    this.audioSystem = engine.systems.find((s) => s.constructor.name === 'AudioSystem');
  }

  getPlayerPosition() {
    return this.playerSystem ? this.playerSystem.position : null;
  }

  inspectState() {
    return {
      gameState: globalGameState.getState(),
      playerPos: this.playerSystem ? this.playerSystem.position.clone() : null,
      playerVelocity: this.playerSystem ? this.playerSystem.velocity.clone() : null,
      verticalVelocity: this.playerSystem ? this.playerSystem.verticalVelocity : 0,
      isGrounded: this.playerSystem ? this.playerSystem.isGrounded : false,
      movementState: this.playerSystem ? this.playerSystem.movementState : 'UNKNOWN',
      isSitting: this.playerSystem ? this.playerSystem.isSitting : false,
      headingAngle: this.playerSystem ? this.playerSystem.headingAngle : 0,
      cameraPos: this.engine?.camera?.position?.clone() || null,
      timeOfDay: this.worldSystem ? this.worldSystem.timeOfDayHours : 9.0,
      currentQuest: this.questSystem ? this.questSystem.getCurrentQuest() : null,
      nearestInteractable: this.interactionSystem ? this.interactionSystem.currentNearestTarget : null,
    };
  }

  teleportTo(x, y, z) {
    if (!this.playerSystem) return;
    if (this.playerSystem.isSitting) {
      this.playerSystem.standUp();
    }
    this.playerSystem.position.set(x, y, z);
    if (this.playerSystem.mesh) {
      this.playerSystem.mesh.position.copy(this.playerSystem.position);
    }
    this.playerSystem.velocity.set(0, 0, 0);
    this.playerSystem.verticalVelocity = 0;
    this.playerSystem.isGrounded = true;

    globalBus.emit('player:moved', {
      position: this.playerSystem.position,
      headingAngle: this.playerSystem.headingAngle,
      isJogging: false,
      isGrounded: true,
      speed: 0,
    });
  }

  resetSpawn() {
    if (this.playerSystem) {
      this.playerSystem.resetToSpawn();
    }
  }

  rotateToward(targetX, targetZ) {
    if (!this.playerSystem) return;
    const dx = targetX - this.playerSystem.position.x;
    const dz = targetZ - this.playerSystem.position.z;
    if (Math.hypot(dx, dz) > 0.001) {
      this.playerSystem.headingAngle = Math.atan2(dx, dz);
      this.playerSystem.targetHeadingAngle = this.playerSystem.headingAngle;
      if (this.playerSystem.mesh) {
        this.playerSystem.mesh.rotation.y = this.playerSystem.headingAngle;
      }
    }
  }

  detectArrival(targetX, targetZ, threshold = 0.5) {
    if (!this.playerSystem) return false;
    const dx = this.playerSystem.position.x - targetX;
    const dz = this.playerSystem.position.z - targetZ;
    return Math.hypot(dx, dz) <= threshold;
  }

  async walkDirection(dx, dz, durationMs = 500, isJogging = false) {
    if (!this.playerSystem || this.playerSystem.isDialogueActive) return;

    const startTime = performance.now();
    const speed = isJogging ? MOVEMENT_CONFIG.JOG_SPEED : MOVEMENT_CONFIG.WALK_SPEED;
    const disp = new THREE.Vector3();

    while (performance.now() - startTime < durationMs) {
      if (!globalGameState.is(GameState.PLAYING) || this.playerSystem.isDialogueActive) {
        await this.wait(16);
        continue;
      }

      const dt = 0.016;
      disp.set(dx * speed * dt, 0, dz * speed * dt);

      if (this.worldSystem && typeof this.worldSystem.resolvePlayerMovement === 'function') {
        const playerRadius = this.playerSystem.colliderRadius || 0.38;
        const playerHeight = this.playerSystem.colliderHeight || 1.80;
        const stepHeight = this.playerSystem.stepHeight || 0.35;
        this.worldSystem.resolvePlayerMovement(
          this.playerSystem.position,
          disp,
          playerRadius,
          this.playerSystem.position.y,
          playerHeight,
          stepHeight
        );
      } else {
        this.playerSystem.position.x += disp.x;
        this.playerSystem.position.z += disp.z;
      }

      this.playerSystem.headingAngle = Math.atan2(dx, dz);

      if (this.playerSystem.mesh) {
        this.playerSystem.mesh.position.copy(this.playerSystem.position);
        this.playerSystem.mesh.rotation.y = this.playerSystem.headingAngle;
      }

      globalBus.emit('player:moved', {
        position: this.playerSystem.position,
        headingAngle: this.playerSystem.headingAngle,
        isJogging,
        isGrounded: true,
        speed,
      });

      await this.wait(16);
    }
  }

  async moveTo(targetX, targetZ, speed = 4.2, timeoutMs = 8000) {
    if (!this.playerSystem || this.playerSystem.isDialogueActive) return false;

    _targetVec.set(targetX, 0, targetZ);
    const startTime = performance.now();
    const disp = new THREE.Vector3();

    while (performance.now() - startTime < timeoutMs) {
      if (!globalGameState.is(GameState.PLAYING) || this.playerSystem.isDialogueActive) {
        await this.wait(16);
        continue;
      }

      const currentPos = this.playerSystem.position;
      _diffVec.subVectors(_targetVec, currentPos);
      _diffVec.y = 0;
      const dist = _diffVec.length();

      if (dist < 0.45) {
        this.playerSystem.velocity.set(0, 0, 0);
        return true;
      }

      _diffVec.normalize();
      const dt = 0.016;
      disp.set(_diffVec.x * speed * dt, 0, _diffVec.z * speed * dt);

      if (this.worldSystem && typeof this.worldSystem.resolvePlayerMovement === 'function') {
        const playerRadius = this.playerSystem.colliderRadius || 0.38;
        const playerHeight = this.playerSystem.colliderHeight || 1.80;
        const stepHeight = this.playerSystem.stepHeight || 0.35;
        this.worldSystem.resolvePlayerMovement(
          this.playerSystem.position,
          disp,
          playerRadius,
          this.playerSystem.position.y,
          playerHeight,
          stepHeight
        );
      } else {
        this.playerSystem.position.x += disp.x;
        this.playerSystem.position.z += disp.z;
      }

      this.playerSystem.headingAngle = Math.atan2(_diffVec.x, _diffVec.z);

      if (this.playerSystem.mesh) {
        this.playerSystem.mesh.position.copy(this.playerSystem.position);
        this.playerSystem.mesh.rotation.y = this.playerSystem.headingAngle;
      }

      globalBus.emit('player:moved', {
        position: this.playerSystem.position,
        headingAngle: this.playerSystem.headingAngle,
        isJogging: speed > 3.5,
        isGrounded: true,
        speed,
      });

      await this.wait(16);
    }

    return false;
  }

  triggerJump() {
    if (!this.playerSystem) return;
    if (this.playerSystem.isGrounded) {
      this.playerSystem.isGrounded = false;
      this.playerSystem.verticalVelocity = MOVEMENT_CONFIG.JUMP_VELOCITY;
      this.playerSystem.movementState = 'JUMP';
      globalBus.emit('player:jump');
    }
  }

  triggerInteract() {
    if (!this.interactionSystem) return;
    this.interactionSystem.triggerInteraction();
  }

  async wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
