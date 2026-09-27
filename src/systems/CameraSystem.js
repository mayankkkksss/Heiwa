import * as THREE from 'three';
import { globalBus } from '../engine/EventBus.js';
import { globalInput } from '../engine/InputManager.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';

/**
 * Calm, Cinematic Third-Person Exploration Camera Configuration
 */
export const CAMERA_CONFIG = {
  PLAYER_ROTATION_SPEED: 12.0, // Mayank character turn rate (rad/s)
  CAMERA_FOLLOW_SPEED: 8.5, // Smooth position follow damping (calm & responsive)
  CAMERA_ROTATION_SPEED: 2.0, // Gentle yaw follow speed behind player heading (rad/s)
  CAMERA_DISTANCE: 4.2, // Comfortable medium third-person distance (meters)
  CAMERA_HEIGHT: 1.46, // Height above character base (reveals the road ahead naturally)
  CAMERA_PITCH_MIN: -0.15, // Min vertical pitch (radians, looking slightly up)
  CAMERA_PITCH_MAX: 1.10, // Max vertical pitch (radians, looking down)
  CAMERA_RECENTER_DELAY: 0.35, // Inactivity delay (seconds) after mouse movement before gentle follow resumes
  MOUSE_SENSITIVITY_X: 0.0026, // Smooth horizontal mouse sensitivity
  MOUSE_SENSITIVITY_Y: 0.0022, // Smooth vertical mouse sensitivity
};

/**
 * CameraSystem - Third-Person Exploration Camera with Smooth Auto-Follow, Jump Stability & Anti-Clipping
 */
export class CameraSystem {
  constructor() {
    this.camera = null;
    this.target = new THREE.Vector3(-24.0, CAMERA_CONFIG.CAMERA_HEIGHT, -46.5);
    this.smoothedTarget = new THREE.Vector3(-24.0, CAMERA_CONFIG.CAMERA_HEIGHT, -46.5);
    this.currentPosition = new THREE.Vector3(-24.0, 2.5, -41.0);

    // Title screen cinematic panorama center & orbit
    this.titleTarget = new THREE.Vector3(0, 1.8, 10);
    this.titleRadius = 24.0;
    this.titleAngle = 0;

    // Spherical coordinates for 3rd-person follow
    this.desiredDistance = CAMERA_CONFIG.CAMERA_DISTANCE;
    this.currentDistance = CAMERA_CONFIG.CAMERA_DISTANCE;
    this.minDistance = 1.8;
    this.maxDistance = 8.5;

    this.theta = 0; // Horizontal orbit angle (yaw) in radians
    this.phi = 0.24; // Vertical pitch angle in radians (comfortable view ahead)

    // Player motion tracking for heading follow
    this.playerHeadingAngle = 0;
    this.playerIsMoving = false;
    this.mouseInactiveTimer = CAMERA_CONFIG.CAMERA_RECENTER_DELAY;
    this.sensitivityMultiplier = 1.0;
    this.isVehicleMode = false;

    this.worldSystem = null;
  }

  get mode() {
    return this.isVehicleMode ? 'vehicle' : 'normal';
  }

  set mode(m) {
    this.isVehicleMode = (m === 'vehicle');
    if (this.isVehicleMode) {
      this.desiredDistance = 6.2;
      this.phi = 0.20;
    } else {
      this.desiredDistance = CAMERA_CONFIG.CAMERA_DISTANCE;
      this.phi = 0.24;
    }
  }

  /**
   * Authoritative third-person POV camera rotation method.
   * Consumed by both desktop free mouse-look and mobile touch camera delta inputs.
   */
  rotateFromInput(deltaX, deltaY) {
    if (deltaX !== 0 || deltaY !== 0) {
      this.theta -= deltaX * CAMERA_CONFIG.MOUSE_SENSITIVITY_X * this.sensitivityMultiplier;
      this.phi += deltaY * CAMERA_CONFIG.MOUSE_SENSITIVITY_Y * this.sensitivityMultiplier;
      this.clampAngles();
      this.mouseInactiveTimer = 0; // Reset inactivity auto-follow timer
    }
  }

  setSensitivityMultiplier(multiplier) {
    this.sensitivityMultiplier = THREE.MathUtils.clamp(multiplier, 0.1, 3.0);
  }

  init(engine) {
    this.engine = engine;
    this.camera = engine.camera;
    this.worldSystem = engine.systems.find((s) => typeof s.checkCollision === 'function');

    globalBus.on('player:moved', (data) => {
      if (globalGameState.is(GameState.PLAYING) || globalGameState.is(GameState.PAUSED)) {
        this.target.copy(data.position);
        this.target.y += this.isVehicleMode ? 1.65 : CAMERA_CONFIG.CAMERA_HEIGHT;
        this.playerHeadingAngle = data.headingAngle;
        this.playerIsMoving = data.isMoving;
      }
    });

    globalBus.on('vehicle:entered', (data) => {
      this.isVehicleMode = true;
      this.desiredDistance = 6.2;
      this.mouseInactiveTimer = CAMERA_CONFIG.CAMERA_RECENTER_DELAY;
    });

    globalBus.on('vehicle:exited', () => {
      this.isVehicleMode = false;
      this.desiredDistance = CAMERA_CONFIG.CAMERA_DISTANCE;
      this.mouseInactiveTimer = CAMERA_CONFIG.CAMERA_RECENTER_DELAY;
    });

    globalBus.on('player:spawned', (data) => {
      this.target.copy(data.position);
      this.target.y += CAMERA_CONFIG.CAMERA_HEIGHT;
      this.smoothedTarget.copy(this.target);
      this.theta = 0;
      this.phi = 0.24;
      this.currentDistance = CAMERA_CONFIG.CAMERA_DISTANCE;
      this.desiredDistance = CAMERA_CONFIG.CAMERA_DISTANCE;
      this.mouseInactiveTimer = CAMERA_CONFIG.CAMERA_RECENTER_DELAY;
      this.updateCameraInstant();
    });

    globalBus.on('state:changed', (data) => {
      if (data.to === GameState.PLAYING) {
        if (!this.isRestoredFromSave) {
          this.theta = 0;
          this.phi = 0.24;
        }
        this.isRestoredFromSave = false;
        this.smoothedTarget.copy(this.target);
        this.mouseInactiveTimer = CAMERA_CONFIG.CAMERA_RECENTER_DELAY;
        this.updateCameraInstant();
      }
    });
  }

  getStateForSave() {
    return {
      theta: this.theta,
      phi: this.phi,
      isVehicleMode: this.isVehicleMode,
    };
  }

  restoreState(data, focusPos) {
    if (!data) return;
    if (typeof data.theta === 'number' && isFinite(data.theta)) {
      this.theta = data.theta;
    }
    if (typeof data.phi === 'number' && isFinite(data.phi)) {
      this.phi = THREE.MathUtils.clamp(data.phi, CAMERA_CONFIG.CAMERA_PITCH_MIN, CAMERA_CONFIG.CAMERA_PITCH_MAX);
    }
    this.isVehicleMode = !!data.isVehicleMode;
    this.desiredDistance = this.isVehicleMode ? 6.2 : CAMERA_CONFIG.CAMERA_DISTANCE;
    this.currentDistance = this.desiredDistance;

    if (focusPos) {
      this.target.set(focusPos.x, focusPos.y + (this.isVehicleMode ? 1.65 : CAMERA_CONFIG.CAMERA_HEIGHT), focusPos.z);
      this.smoothedTarget.copy(this.target);
    }

    this.isRestoredFromSave = true;
    this.updateCameraInstant();
  }

  resetCamera() {
    this.target.set(-24.0, CAMERA_CONFIG.CAMERA_HEIGHT, -46.5);
    this.smoothedTarget.copy(this.target);
    this.theta = 0;
    this.phi = 0.24;
    this.isVehicleMode = false;
    this.desiredDistance = CAMERA_CONFIG.CAMERA_DISTANCE;
    this.currentDistance = CAMERA_CONFIG.CAMERA_DISTANCE;
    this.isRestoredFromSave = false;
    this.updateCameraInstant();
  }

  clampAngles() {
    this.phi = THREE.MathUtils.clamp(
      this.phi,
      CAMERA_CONFIG.CAMERA_PITCH_MIN,
      CAMERA_CONFIG.CAMERA_PITCH_MAX
    );
  }

  updateCameraInstant() {
    const x = this.smoothedTarget.x + this.currentDistance * Math.sin(this.theta) * Math.cos(this.phi);
    const y = this.smoothedTarget.y + this.currentDistance * Math.sin(this.phi);
    const z = this.smoothedTarget.z + this.currentDistance * Math.cos(this.theta) * Math.cos(this.phi);

    this.currentPosition.set(x, Math.max(y, 0.55), z);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.smoothedTarget);
  }

  /**
   * Helper to compute shortest angular difference between two angles in radians
   */
  static shortestAngleDiff(targetAngle, currentAngle) {
    let diff = targetAngle - currentAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  update(delta) {
    // 1. Title Screen Cinematic Panorama
    if (globalGameState.is(GameState.TITLE) || globalGameState.is(GameState.LOADING)) {
      this.titleAngle += delta * 0.04;

      const camX = this.titleTarget.x + Math.sin(this.titleAngle) * this.titleRadius;
      const camZ = this.titleTarget.z + Math.cos(this.titleAngle) * this.titleRadius;
      const camY = 5.2 + Math.sin(this.titleAngle * 0.5) * 0.8;

      this.currentPosition.set(camX, camY, camZ);
      this.camera.position.copy(this.currentPosition);
      this.camera.lookAt(this.titleTarget);
      return;
    }

    // 2. Gameplay Third-Person Camera Logic
    if (globalGameState.is(GameState.PLAYING)) {
      const mouse = globalInput.consumeMouseDelta();
      const hasMouseInput = mouse.dx !== 0 || mouse.dy !== 0;

      if (hasMouseInput) {
        // Authoritative rotation from desktop mouse or mobile touch delta
        this.rotateFromInput(mouse.dx, mouse.dy);
      } else {
        this.mouseInactiveTimer += delta;
      }

      if (mouse.wheel !== 0) {
        this.desiredDistance = THREE.MathUtils.clamp(
          this.desiredDistance + mouse.wheel * 0.004,
          this.minDistance,
          this.maxDistance
        );
      }

      // 3. Gentle Heading Follow: Smoothly steer camera behind Mayank when moving
      if (this.playerIsMoving && this.mouseInactiveTimer >= CAMERA_CONFIG.CAMERA_RECENTER_DELAY) {
        const desiredBehindTheta = this.playerHeadingAngle + Math.PI;
        const angleDiff = CameraSystem.shortestAngleDiff(desiredBehindTheta, this.theta);

        // Smooth, subtle angular follow
        const followSpeed = CAMERA_CONFIG.CAMERA_ROTATION_SPEED;
        this.theta += angleDiff * Math.min(followSpeed * delta, 1.0);
      }
    }

    // 4. Smooth Target Tracking with Jump/Vertical Dampening (keeps vertical stability during jumps)
    this.smoothedTarget.x = THREE.MathUtils.lerp(this.smoothedTarget.x, this.target.x, Math.min(1, 10.0 * delta));
    this.smoothedTarget.z = THREE.MathUtils.lerp(this.smoothedTarget.z, this.target.z, Math.min(1, 10.0 * delta));
    this.smoothedTarget.y = THREE.MathUtils.lerp(this.smoothedTarget.y, this.target.y, Math.min(1, 5.5 * delta));

    // 5. Anti-Clipping Raycast Collision
    let effectiveDist = this.desiredDistance;

    if (this.worldSystem) {
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        const testDist = this.minDistance + ((this.desiredDistance - this.minDistance) * i) / steps;
        const testX = this.smoothedTarget.x + testDist * Math.sin(this.theta) * Math.cos(this.phi);
        const testZ = this.smoothedTarget.z + testDist * Math.cos(this.theta) * Math.cos(this.phi);

        if (this.worldSystem.checkCollision(testX, testZ, 0.3)) {
          effectiveDist = Math.max(this.minDistance, testDist - 0.35);
          break;
        }
      }
    }

    this.currentDistance = THREE.MathUtils.lerp(
      this.currentDistance,
      effectiveDist,
      Math.min(1, 12.0 * delta)
    );

    // 6. Compute Ideal Camera Transform
    const idealX = this.smoothedTarget.x + this.currentDistance * Math.sin(this.theta) * Math.cos(this.phi);
    const idealY = Math.max(this.smoothedTarget.y + this.currentDistance * Math.sin(this.phi), 0.55);
    const idealZ = this.smoothedTarget.z + this.currentDistance * Math.cos(this.theta) * Math.cos(this.phi);

    // Smooth position interpolation
    this.currentPosition.x = THREE.MathUtils.lerp(
      this.currentPosition.x,
      idealX,
      Math.min(1, CAMERA_CONFIG.CAMERA_FOLLOW_SPEED * delta)
    );
    this.currentPosition.y = THREE.MathUtils.lerp(
      this.currentPosition.y,
      idealY,
      Math.min(1, CAMERA_CONFIG.CAMERA_FOLLOW_SPEED * delta)
    );
    this.currentPosition.z = THREE.MathUtils.lerp(
      this.currentPosition.z,
      idealZ,
      Math.min(1, CAMERA_CONFIG.CAMERA_FOLLOW_SPEED * delta)
    );

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.smoothedTarget);

    // Emit heading for UI compass / radar
    globalBus.emit('camera:heading', { theta: this.theta });
  }

  getStateForSave() {
    return {
      theta: this.theta,
      phi: this.phi,
      desiredDistance: this.desiredDistance,
      mode: this.mode,
    };
  }

  restoreState(data, focusPos) {
    if (data) {
      if (typeof data.theta === 'number' && !isNaN(data.theta)) {
        this.theta = data.theta;
      }
      if (typeof data.phi === 'number' && !isNaN(data.phi)) {
        this.phi = data.phi;
      }
      if (typeof data.desiredDistance === 'number' && !isNaN(data.desiredDistance)) {
        this.desiredDistance = data.desiredDistance;
        this.currentDistance = data.desiredDistance;
      }
      if (data.mode) {
        this.mode = data.mode;
      }
    }
    if (focusPos) {
      this.target.set(focusPos.x, (focusPos.y || 0) + (this.isVehicleMode ? 1.65 : CAMERA_CONFIG.CAMERA_HEIGHT), focusPos.z);
      this.smoothedTarget.copy(this.target);
      const idealX = this.smoothedTarget.x + this.currentDistance * Math.sin(this.theta) * Math.cos(this.phi);
      const idealY = Math.max(this.smoothedTarget.y + this.currentDistance * Math.sin(this.phi), 0.55);
      const idealZ = this.smoothedTarget.z + this.currentDistance * Math.cos(this.theta) * Math.cos(this.phi);
      this.currentPosition.set(idealX, idealY, idealZ);
      if (this.camera) {
        this.camera.position.copy(this.currentPosition);
        this.camera.lookAt(this.smoothedTarget);
      }
    }
  }

  resetCamera() {
    this.theta = 0;
    this.phi = 0.24;
    this.desiredDistance = CAMERA_CONFIG.CAMERA_DISTANCE;
    this.currentDistance = CAMERA_CONFIG.CAMERA_DISTANCE;
    this.mode = 'normal';
    this.target.set(-24.0, CAMERA_CONFIG.CAMERA_HEIGHT, -46.5);
    this.smoothedTarget.copy(this.target);
    this.currentPosition.set(-24.0, 2.5, -41.0);
    if (this.camera) {
      this.camera.position.copy(this.currentPosition);
      this.camera.lookAt(this.smoothedTarget);
    }
  }
}

