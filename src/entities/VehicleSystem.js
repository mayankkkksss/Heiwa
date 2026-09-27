import * as THREE from 'three';
import { globalBus } from '../engine/EventBus.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';
import { globalInput } from '../engine/InputManager.js';
import { getTerrainHeight, HEIWA_WORLD_SEED } from '../utils/SeededRandom.js';

export const VehicleState = {
  ON_FOOT: 'ON_FOOT',
  ENTERING_VEHICLE: 'ENTERING_VEHICLE',
  IN_VEHICLE: 'IN_VEHICLE',
  EXITING_VEHICLE: 'EXITING_VEHICLE',
  // Backward compatibility aliases
  PARKED: 'ON_FOOT',
  ENTERING: 'ENTERING_VEHICLE',
  DRIVING: 'IN_VEHICLE',
  EXITING: 'EXITING_VEHICLE',
};

/**
 * VehicleSystem - Implements Mayank's personal compact Japanese commuter car,
 * kinematic driving physics, multi-touch/keyboard controls, multi-point ground probing,
 * collision resolution, and seamless entry/exit lifecycle.
 */
export class VehicleSystem {
  constructor() {
    this.engine = null;
    this.scene = null;
    this.worldSystem = null;

    this.state = VehicleState.ON_FOOT;

    // Kinematic transform & physics properties
    this.position = new THREE.Vector3(-20.0, 0, -46.5); // Parked on residential street near Home
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.speed = 0;
    this.maxSpeed = 14.0; // ~50 km/h (lightweight compact Japanese commuter car)
    this.maxReverseSpeed = -4.2; // ~15 km/h reverse
    this.acceleration = 6.5; // Smooth realistic commuter acceleration
    this.brakeForce = 14.0; // Responsive stopping brake
    this.friction = 3.0; // Natural rolling resistance
    this.handbrakeForce = 24.0; // Strong controlled handbrake

    this.headingAngle = Math.PI / 2; // Facing East along street
    this.steerAngle = 0;
    this.maxSteerAngle = 0.50; // ~28.6 degrees
    this.wheelbase = 2.4;
    this.trackWidth = 1.52;
    this.terrainPitch = 0;
    this.terrainRoll = 0;

    // Visual Mesh & parts
    this.mesh = null;
    this.driverEntryAnchor = null;
    this.chassisGroup = null;
    this.frontLeftWheel = null;
    this.frontRightWheel = null;
    this.rearLeftWheel = null;
    this.rearRightWheel = null;
    this.wheelAngle = 0;

    // Collision dimensions (box bounds for parking & driving)
    this.carWidth = 1.62;
    this.carLength = 3.55;
    this.carHeight = 1.48;
    this.collisionRadius = 0.85;
  }

  get carGroup() {
    return this.mesh;
  }

  get currentSpeed() {
    return this.speed;
  }

  get heading() {
    return this.headingAngle;
  }

  getInteractiveObjects() {
    return this.driverEntryAnchor ? [this.driverEntryAnchor, this.mesh] : [this.mesh];
  }

  getInteractiveTarget() {
    return this.driverEntryAnchor || this.mesh;
  }

  getWorldPosition(targetVec = new THREE.Vector3()) {
    if (this.mesh) {
      return this.mesh.getWorldPosition(targetVec);
    }
    return targetVec.copy(this.position);
  }

  getWorldDriverEntryPosition(targetVec = new THREE.Vector3()) {
    if (this.driverEntryAnchor) {
      return this.driverEntryAnchor.getWorldPosition(targetVec);
    }
    const worldPos = this.getWorldPosition(new THREE.Vector3());
    const offset = new THREE.Vector3(-1.15, 0.8, 0.2);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.headingAngle);
    return targetVec.copy(worldPos).add(offset);
  }

  getWorldDriverSeatPosition(targetVec = new THREE.Vector3()) {
    const worldPos = this.getWorldPosition(new THREE.Vector3());
    const offset = new THREE.Vector3(-0.35, 0.65, 0.15);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.headingAngle);
    return targetVec.copy(worldPos).add(offset);
  }

  getSafeExitPosition(targetVec = new THREE.Vector3()) {
    const worldPos = this.getWorldPosition(new THREE.Vector3());
    const heading = this.headingAngle;
    const upAxis = new THREE.Vector3(0, 1, 0);

    // Dynamic candidate offsets around the vehicle in local car space:
    // (local +X = Right, -X = Left/Driver, +Z = Front, -Z = Rear)
    const candidates = [
      // 1. Primary Driver side (left door)
      new THREE.Vector3(-1.35, 0, 0.2),
      // 2. Passenger side (right door)
      new THREE.Vector3(1.35, 0, 0.2),
      // 3. Driver front-side offset
      new THREE.Vector3(-1.35, 0, 1.1),
      // 4. Passenger front-side offset
      new THREE.Vector3(1.35, 0, 1.1),
      // 5. Driver rear-side offset
      new THREE.Vector3(-1.35, 0, -1.1),
      // 6. Passenger rear-side offset
      new THREE.Vector3(1.35, 0, -1.1),
      // 7. Behind vehicle (rear bumper clear)
      new THREE.Vector3(0, 0, -2.4),
      // 8. In front of vehicle (front bumper clear)
      new THREE.Vector3(0, 0, 2.4),
    ];

    const testPos = new THREE.Vector3();
    for (let i = 0; i < candidates.length; i++) {
      const offset = candidates[i].clone().applyAxisAngle(upAxis, heading);
      testPos.copy(worldPos).add(offset);
      testPos.y = getTerrainHeight(testPos.x, testPos.z);

      const isBlocked = this.worldSystem && typeof this.worldSystem.checkCollision === 'function' &&
        this.worldSystem.checkCollision(testPos.x, testPos.z, 0.38, testPos.y, 1.80, 0.35);

      if (!isBlocked) {
        if (window.__HEIWA_DEBUG_CAR__) {
          console.log(`[HEIWA CAR] Safe exit candidate found at index ${i}: (${testPos.x.toFixed(2)}, ${testPos.y.toFixed(2)}, ${testPos.z.toFixed(2)})`);
        }
        return targetVec.copy(testPos);
      }
    }

    // Safe fallback: Driver side anchored to current vehicle world position with local terrain height
    const fallbackOffset = new THREE.Vector3(-1.35, 0, 0.2).applyAxisAngle(upAxis, heading);
    targetVec.copy(worldPos).add(fallbackOffset);
    targetVec.y = getTerrainHeight(targetVec.x, targetVec.z);
    return targetVec;
  }

  /**
   * Multi-point collision envelope testing car center and front/rear bumpers
   */
  checkCarCollisionAt(x, z, heading) {
    if (!this.worldSystem || typeof this.worldSystem.checkCollision !== 'function') {
      return false;
    }

    // 1. Center envelope
    if (this.worldSystem.checkCollision(x, z, 0.78)) {
      return true;
    }

    // 2. Front bumper envelope (+1.20m along heading)
    const fX = x + Math.sin(heading) * 1.20;
    const fZ = z + Math.cos(heading) * 1.20;
    if (this.worldSystem.checkCollision(fX, fZ, 0.54)) {
      return true;
    }

    // 3. Rear bumper envelope (-1.20m along heading)
    const rX = x - Math.sin(heading) * 1.20;
    const rZ = z - Math.cos(heading) * 1.20;
    if (this.worldSystem.checkCollision(rX, rZ, 0.54)) {
      return true;
    }

    return false;
  }

  drive(throttle = 0, steer = 0, isHandbrake = false, delta = 0.016) {
    // 1. Acceleration / Active Braking / Rolling Friction
    if (throttle > 0) {
      if (this.speed < -0.15) {
        // Active braking from reverse
        this.speed = Math.min(0, this.speed + this.brakeForce * delta);
      } else {
        // Forward acceleration
        this.speed = Math.min(this.maxSpeed, this.speed + this.acceleration * throttle * delta);
      }
    } else if (throttle < 0) {
      if (this.speed > 0.15) {
        // Active braking when driving forward (S key brakes first)
        this.speed = Math.max(0, this.speed - this.brakeForce * Math.abs(throttle) * delta);
      } else {
        // Transition to reverse only when stopped or nearly stopped
        this.speed = Math.max(this.maxReverseSpeed, this.speed - this.acceleration * 0.65 * Math.abs(throttle) * delta);
      }
    } else {
      // Natural rolling friction deceleration
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.friction * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.friction * delta);
      }
    }

    // Handbrake application (Space)
    if (isHandbrake) {
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.handbrakeForce * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.handbrakeForce * delta);
      }
    }

    // 2. Speed-Dependent Steering Sensitivity Curve
    const absSpeed = Math.abs(this.speed);
    const speedRatio = Math.min(1.0, absSpeed / 12.0);
    const dynamicMaxSteer = THREE.MathUtils.lerp(this.maxSteerAngle, this.maxSteerAngle * 0.55, speedRatio);

    if (Math.abs(steer) > 0.01) {
      this.steerAngle = steer * dynamicMaxSteer;
    } else {
      this.steerAngle = 0;
    }

    // 3. Kinematic Turning (turning along forward direction)
    if (absSpeed > 0.05) {
      const turnRate = (this.speed / this.wheelbase) * Math.sin(this.steerAngle);
      this.headingAngle += turnRate * delta;
    }

    // 4. Proposed Movement & Collision Resolution with Axis Sliding
    const moveDist = this.speed * delta;
    const forwardX = Math.sin(this.headingAngle);
    const forwardZ = Math.cos(this.headingAngle);

    const deltaX = forwardX * moveDist;
    const deltaZ = forwardZ * moveDist;

    let nextX = this.position.x + deltaX;
    let nextZ = this.position.z + deltaZ;

    if (this.checkCarCollisionAt(nextX, nextZ, this.headingAngle)) {
      // Test sliding along X axis (sliding along N-S wall)
      if (!this.checkCarCollisionAt(this.position.x + deltaX, this.position.z, this.headingAngle)) {
        nextX = this.position.x + deltaX;
        nextZ = this.position.z;
        this.speed *= 0.94; // Light friction on slide
      }
      // Test sliding along Z axis (sliding along E-W wall)
      else if (!this.checkCarCollisionAt(this.position.x, this.position.z + deltaZ, this.headingAngle)) {
        nextX = this.position.x;
        nextZ = this.position.z + deltaZ;
        this.speed *= 0.94; // Light friction on slide
      }
      // Direct solid impact: stop penetration
      else {
        this.speed = -this.speed * 0.15;
        nextX = this.position.x;
        nextZ = this.position.z;
      }
    }

    this.position.x = nextX;
    this.position.z = nextZ;

    // Apply multi-point ground probing
    this.updateGrounding(delta);

    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.rotation.set(this.terrainPitch || 0, this.headingAngle, this.terrainRoll || 0, 'YXZ');
    }

    this.velocity.set(forwardX * this.speed, 0, forwardZ * this.speed);
  }

  /**
   * Continuous multi-point ground probing (FL, FR, RL, RR) using authoritative getTerrainHeight.
   * Resolves vehicle elevation, longitudinal pitch, and lateral roll with zero floating gap.
   */
  updateGrounding(delta = 0.016) {
    const cosH = Math.cos(this.headingAngle);
    const sinH = Math.sin(this.headingAngle);

    // Transform probe coordinates to global world space
    const transformProbe = (localX, localZ) => ({
      x: this.position.x + (cosH * localX + sinH * localZ),
      z: this.position.z + (-sinH * localX + cosH * localZ),
    });

    const fl = transformProbe(-0.76, 1.15);
    const fr = transformProbe(0.76, 1.15);
    const rl = transformProbe(-0.76, -1.15);
    const rr = transformProbe(0.76, -1.15);

    const hFL = getTerrainHeight(fl.x, fl.z);
    const hFR = getTerrainHeight(fr.x, fr.z);
    const hRL = getTerrainHeight(rl.x, rl.z);
    const hRR = getTerrainHeight(rr.x, rr.z);

    const targetGroundY = (hFL + hFR + hRL + hRR) / 4.0;

    // Fast responsive vertical grounding (prevents floating while smoothing high-frequency road bumps)
    if (delta >= 0.5) {
      this.position.y = targetGroundY;
    } else {
      this.position.y = THREE.MathUtils.lerp(this.position.y, targetGroundY, Math.min(1, 25.0 * delta));
    }

    // Dynamic terrain pitch and roll from 4-point elevation differentials
    const frontH = (hFL + hFR) / 2.0;
    const rearH = (hRL + hRR) / 2.0;
    const leftH = (hFL + hRL) / 2.0;
    const rightH = (hFR + hRR) / 2.0;

    // Correct pitch calculation: When front is higher than rear (uphill, frontH > rearH),
    // Three.js rotation.x must be negative to elevate the +Z front nose and keep -Z rear grounded.
    const targetPitch = THREE.MathUtils.clamp((rearH - frontH) / this.wheelbase, -0.22, 0.22);
    const targetRoll = THREE.MathUtils.clamp((rightH - leftH) / this.trackWidth, -0.18, 0.18);

    if (delta >= 0.5) {
      this.terrainPitch = targetPitch;
      this.terrainRoll = targetRoll;
    } else {
      this.terrainPitch = THREE.MathUtils.lerp(this.terrainPitch || 0, targetPitch, Math.min(1, 16.0 * delta));
      this.terrainRoll = THREE.MathUtils.lerp(this.terrainRoll || 0, targetRoll, Math.min(1, 16.0 * delta));
    }

    return {
      targetGroundY,
      hFL,
      hFR,
      hRL,
      hRR,
      frontH,
      rearH,
      terrainPitch: this.terrainPitch,
      terrainRoll: this.terrainRoll,
    };
  }

  init(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.worldSystem = engine.systems.find((s) => typeof s.checkCollision === 'function');

    this.createVehicleMesh();
    this.updateGrounding(1.0); // Immediate initial ground snap
    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.rotation.set(this.terrainPitch || 0, this.headingAngle, this.terrainRoll || 0, 'YXZ');
    }
    this.scene.add(this.mesh);

    // Register car and driver anchor as interactive targets with InteractionSystem
    const interactionSys = engine.systems.find((s) => typeof s.registerTarget === 'function');
    if (interactionSys) {
      if (this.driverEntryAnchor) {
        interactionSys.registerTarget(this.driverEntryAnchor);
      }
      interactionSys.registerTarget(this.mesh);
    }

    globalBus.on('input:interact', () => {
      if (this.state === VehicleState.IN_VEHICLE || this.state === 'DRIVING') {
        this.exitVehicle();
      }
    });

    globalBus.on('state:changed', (data) => {
      if (data.to !== GameState.PLAYING && (this.state === VehicleState.IN_VEHICLE || this.state === 'DRIVING')) {
        this.speed = 0;
        this.velocity.set(0, 0, 0);
      }
    });
  }

  createVehicleMesh() {
    this.mesh = new THREE.Group();
    this.mesh.name = 'Mayank_Car';
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.headingAngle;

    // Driver Entry Anchor beside the driver door (left side of vehicle)
    this.driverEntryAnchor = new THREE.Object3D();
    this.driverEntryAnchor.name = 'Mayank_Car_Driver_Anchor';
    this.driverEntryAnchor.position.set(-1.15, 0.8, 0.2);
    this.driverEntryAnchor.userData = {
      isInteractive: true,
      name: "Mayank's Car",
      prompt: 'Enter Car (press twice)',
      interactionType: 'vehicle',
      onInteract: () => this.enterVehicle(),
      parentVehicle: this,
    };
    this.mesh.add(this.driverEntryAnchor);

    // Backup interactive metadata on car root mesh
    this.mesh.userData = {
      isInteractive: true,
      name: "Mayank's Car",
      prompt: 'Enter Car (press twice)',
      interactionType: 'vehicle',
      onInteract: () => this.enterVehicle(),
      parentVehicle: this,
    };

    this.chassisGroup = new THREE.Group();

    // 1. Materials
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8, // Peaceful clean sky blue
      roughness: 0.35,
      metalness: 0.25,
    });
    const darkTrimMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.15,
      metalness: 0.85,
    });
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.9,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.3,
      metalness: 0.7,
    });
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfef08a,
      emissiveIntensity: 0.45,
      roughness: 0.2,
    });
    const taillightMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.55,
      roughness: 0.3,
    });

    // 2. Lower Chassis Body (Length: 3.4m, Width: 1.55m, Height: 0.65m)
    const lowerBodyGeo = new THREE.BoxGeometry(1.55, 0.65, 3.4);
    const lowerBody = new THREE.Mesh(lowerBodyGeo, bodyMat);
    lowerBody.position.set(0, 0.58, 0);
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;
    this.chassisGroup.add(lowerBody);

    // Front Bumper / Grille
    const frontBumperGeo = new THREE.BoxGeometry(1.52, 0.32, 0.25);
    const frontBumper = new THREE.Mesh(frontBumperGeo, darkTrimMat);
    frontBumper.position.set(0, 0.42, 1.72);
    frontBumper.castShadow = true;
    this.chassisGroup.add(frontBumper);

    // Rear Bumper
    const rearBumperGeo = new THREE.BoxGeometry(1.52, 0.32, 0.22);
    const rearBumper = new THREE.Mesh(rearBumperGeo, darkTrimMat);
    rearBumper.position.set(0, 0.42, -1.72);
    rearBumper.castShadow = true;
    this.chassisGroup.add(rearBumper);

    // 3. Cabin & Glass Roof (Length: 2.1m, Width: 1.38m, Height: 0.62m)
    const cabinGeo = new THREE.BoxGeometry(1.38, 0.62, 2.1);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 1.18, -0.15);
    cabin.castShadow = true;
    this.chassisGroup.add(cabin);

    // Roof Cap
    const roofGeo = new THREE.BoxGeometry(1.36, 0.08, 1.95);
    const roof = new THREE.Mesh(roofGeo, bodyMat);
    roof.position.set(0, 1.51, -0.18);
    roof.castShadow = true;
    this.chassisGroup.add(roof);

    // 4. Headlights (Front: +Z)
    const hlGeo = new THREE.BoxGeometry(0.32, 0.16, 0.08);
    const hlLeft = new THREE.Mesh(hlGeo, headlightMat);
    hlLeft.position.set(-0.54, 0.68, 1.71);
    const hlRight = new THREE.Mesh(hlGeo, headlightMat);
    hlRight.position.set(0.54, 0.68, 1.71);
    this.chassisGroup.add(hlLeft);
    this.chassisGroup.add(hlRight);

    // 5. Taillights (Rear: -Z)
    const tlGeo = new THREE.BoxGeometry(0.30, 0.15, 0.08);
    const tlLeft = new THREE.Mesh(tlGeo, taillightMat);
    tlLeft.position.set(-0.54, 0.70, -1.71);
    const tlRight = new THREE.Mesh(tlGeo, taillightMat);
    tlRight.position.set(0.54, 0.70, -1.71);
    this.chassisGroup.add(tlLeft);
    this.chassisGroup.add(tlRight);

    // 6. Side Mirrors
    const mirrorGeo = new THREE.BoxGeometry(0.18, 0.12, 0.12);
    const mirrorLeft = new THREE.Mesh(mirrorGeo, darkTrimMat);
    mirrorLeft.position.set(-0.84, 1.02, 0.72);
    const mirrorRight = new THREE.Mesh(mirrorGeo, darkTrimMat);
    mirrorRight.position.set(0.84, 1.02, 0.72);
    this.chassisGroup.add(mirrorLeft);
    this.chassisGroup.add(mirrorRight);

    this.mesh.add(this.chassisGroup);

    // 7. Wheels & Tires
    const createWheel = () => {
      const wheelGroup = new THREE.Group();
      const tireGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16);
      tireGeo.rotateZ(Math.PI / 2);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;

      const rimGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.23, 8);
      rimGeo.rotateZ(Math.PI / 2);
      const rim = new THREE.Mesh(rimGeo, rimMat);

      wheelGroup.add(tire);
      wheelGroup.add(rim);
      return wheelGroup;
    };

    const halfW = 0.76;
    const frontZ = 1.15;
    const rearZ = -1.15;
    const wheelY = 0.32;

    this.frontLeftWheel = createWheel();
    this.frontLeftWheel.position.set(-halfW, wheelY, frontZ);
    this.frontRightWheel = createWheel();
    this.frontRightWheel.position.set(halfW, wheelY, frontZ);
    this.rearLeftWheel = createWheel();
    this.rearLeftWheel.position.set(-halfW, wheelY, rearZ);
    this.rearRightWheel = createWheel();
    this.rearRightWheel.position.set(halfW, wheelY, rearZ);

    this.mesh.add(this.frontLeftWheel);
    this.mesh.add(this.frontRightWheel);
    this.mesh.add(this.rearLeftWheel);
    this.mesh.add(this.rearRightWheel);
  }

  enterVehicle() {
    if (this.state !== VehicleState.ON_FOOT && this.state !== 'PARKED') return false;

    if (window.__HEIWA_DEBUG_CAR__) {
      console.log('[HEIWA CAR] CAR ENTRY REQUEST: ON_FOOT -> ENTERING_VEHICLE -> IN_VEHICLE');
    }

    this.state = VehicleState.ENTERING_VEHICLE;
    if (this.driverEntryAnchor) {
      this.driverEntryAnchor.userData.prompt = 'Exit Car (press twice)';
    }
    this.mesh.userData.prompt = 'Exit Car (press twice)';

    // 1. Emit entering transition for smooth character alignment
    globalBus.emit('vehicle:entering', {
      position: this.position,
      headingAngle: this.headingAngle,
      entryPosition: this.getWorldDriverEntryPosition(),
      seatPosition: this.getWorldDriverSeatPosition(),
    });

    // 2. Transition into vehicle
    this.state = VehicleState.IN_VEHICLE;
    globalBus.emit('interaction:blur');
    globalBus.emit('vehicle:entered', {
      position: this.position,
      headingAngle: this.headingAngle,
    });
    globalBus.emit('toast:show', { message: 'Driving Mayank\'s Car. (WASD to Drive, Space to Brake, Press E twice to Exit)' });
    return true;
  }

  exitVehicle() {
    if (this.state !== VehicleState.IN_VEHICLE && this.state !== 'DRIVING') return false;

    const carWorldPos = this.getWorldPosition(new THREE.Vector3());
    const safeExitPos = this.getSafeExitPosition();

    if (window.__HEIWA_DEBUG_CAR__) {
      console.log(`[HEIWA CAR] EXIT: car=(${carWorldPos.x.toFixed(2)}, ${carWorldPos.y.toFixed(2)}, ${carWorldPos.z.toFixed(2)}) exit=(${safeExitPos.x.toFixed(2)}, ${safeExitPos.y.toFixed(2)}, ${safeExitPos.z.toFixed(2)})`);
    }

    this.state = VehicleState.EXITING_VEHICLE;
    this.speed = 0;
    this.velocity.set(0, 0, 0);

    if (this.driverEntryAnchor) {
      this.driverEntryAnchor.userData.prompt = 'Enter Car (press twice)';
    }
    this.mesh.userData.prompt = 'Enter Car (press twice)';

    globalBus.emit('vehicle:exited', {
      exitPosition: safeExitPos,
      headingAngle: this.headingAngle,
      vehiclePosition: carWorldPos,
    });

    this.state = VehicleState.ON_FOOT;
    return true;
  }

  update(delta) {
    if ((this.state !== VehicleState.IN_VEHICLE && this.state !== 'DRIVING') || !globalGameState.is(GameState.PLAYING)) {
      return;
    }

    const input = globalInput.getMovementInput();
    const isHandbrake = globalInput.isKeyPressed('Space');

    // 1. Acceleration & Braking
    // input.z < 0 is Forward (W key), input.z > 0 is Reverse (S key)
    let throttle = 0;
    if (input.z < -0.05) {
      throttle = -input.z; // 0..1 Forward
    } else if (input.z > 0.05) {
      throttle = -input.z; // -1..0 Reverse
    }

    if (throttle > 0) {
      if (this.speed < -0.15) {
        // Active braking from reverse
        this.speed = Math.min(0, this.speed + this.brakeForce * delta);
      } else {
        this.speed = Math.min(this.maxSpeed, this.speed + this.acceleration * throttle * delta);
      }
    } else if (throttle < 0) {
      if (this.speed > 0.15) {
        // Active braking when driving forward (S key brakes first)
        this.speed = Math.max(0, this.speed - this.brakeForce * Math.abs(throttle) * delta);
      } else {
        // Transition to reverse only when stopped or nearly stopped
        this.speed = Math.max(this.maxReverseSpeed, this.speed - this.acceleration * 0.65 * Math.abs(throttle) * delta);
      }
    } else {
      // Natural rolling friction deceleration
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.friction * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.friction * delta);
      }
    }

    // Handbrake application (Space)
    if (isHandbrake) {
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.handbrakeForce * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.handbrakeForce * delta);
      }
    }

    // 2. Speed-Dependent Steering Sensitivity Curve
    const absSpeed = Math.abs(this.speed);
    const speedRatio = Math.min(1.0, absSpeed / 12.0);
    const dynamicMaxSteer = THREE.MathUtils.lerp(this.maxSteerAngle, this.maxSteerAngle * 0.55, speedRatio);

    // input.x < 0 is Left (A key), input.x > 0 is Right (D key)
    let targetSteer = 0;
    if (Math.abs(input.x) > 0.05) {
      targetSteer = -input.x * dynamicMaxSteer; // Left steering turns positive heading
    }
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteer, Math.min(1, 12.0 * delta));

    // 3. Kinematic Bicycle Turning Model
    if (absSpeed > 0.05) {
      const turnRate = (this.speed / this.wheelbase) * Math.sin(this.steerAngle);
      this.headingAngle += turnRate * delta;
    }

    // 4. Proposed Position Update & Collision Resolution with Axis Sliding
    const moveDist = this.speed * delta;
    const forwardX = Math.sin(this.headingAngle);
    const forwardZ = Math.cos(this.headingAngle);

    const deltaX = forwardX * moveDist;
    const deltaZ = forwardZ * moveDist;

    let nextX = this.position.x + deltaX;
    let nextZ = this.position.z + deltaZ;

    if (this.checkCarCollisionAt(nextX, nextZ, this.headingAngle)) {
      // Test sliding along X axis (sliding along N-S wall)
      if (!this.checkCarCollisionAt(this.position.x + deltaX, this.position.z, this.headingAngle)) {
        nextX = this.position.x + deltaX;
        nextZ = this.position.z;
        this.speed *= 0.94; // Light friction on slide
      }
      // Test sliding along Z axis (sliding along E-W wall)
      else if (!this.checkCarCollisionAt(this.position.x, this.position.z + deltaZ, this.headingAngle)) {
        nextX = this.position.x;
        nextZ = this.position.z + deltaZ;
        this.speed *= 0.94; // Light friction on slide
      }
      // Direct solid impact: stop penetration
      else {
        this.speed = -this.speed * 0.15; // Soft bumper bounce
        nextX = this.position.x;
        nextZ = this.position.z;
      }
    }

    this.position.x = nextX;
    this.position.z = nextZ;

    // 5. Update Multi-Point Grounding, Elevation & Pitch/Roll
    this.updateGrounding(delta);

    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(this.terrainPitch || 0, this.headingAngle, this.terrainRoll || 0, 'YXZ');

    // Wheel spin & front steering
    this.wheelAngle += (this.speed / 0.32) * delta;
    if (this.frontLeftWheel) {
      this.frontLeftWheel.rotation.y = this.steerAngle;
      this.frontLeftWheel.children[0].rotation.x = this.wheelAngle;
    }
    if (this.frontRightWheel) {
      this.frontRightWheel.rotation.y = this.steerAngle;
      this.frontRightWheel.children[0].rotation.x = this.wheelAngle;
    }
    if (this.rearLeftWheel) {
      this.rearLeftWheel.children[0].rotation.x = this.wheelAngle;
    }
    if (this.rearRightWheel) {
      this.rearRightWheel.children[0].rotation.x = this.wheelAngle;
    }

    // Chassis dynamic body roll and acceleration/braking pitch response
    const bodyRoll = -(this.speed / this.maxSpeed) * (this.steerAngle / this.maxSteerAngle) * 0.08;

    // Corrected Acceleration Pitch: Forward acceleration transfers weight to rear (negative rotation around X tilts nose up, rear squats)
    // Braking transfers weight to front (positive rotation around X dips nose down)
    let bodyPitch = 0;
    if (throttle > 0) {
      bodyPitch = -(throttle * (this.acceleration / 6.5) * 0.018);
    } else if (throttle < 0) {
      if (this.speed > 0.15) {
        bodyPitch = +(Math.abs(throttle) * (this.brakeForce / 14.0) * 0.024); // Braking nose-dive
      } else {
        bodyPitch = +(Math.abs(throttle) * 0.012); // Reverse acceleration
      }
    }
    if (isHandbrake && Math.abs(this.speed) > 0.2) {
      bodyPitch = +(0.025); // Handbrake deceleration dip
    }

    if (this.chassisGroup) {
      this.chassisGroup.rotation.z = THREE.MathUtils.lerp(this.chassisGroup.rotation.z, bodyRoll, Math.min(1, 10.0 * delta));
      this.chassisGroup.rotation.x = THREE.MathUtils.lerp(this.chassisGroup.rotation.x, bodyPitch, Math.min(1, 10.0 * delta));
    }

    // 6. Broadcast vehicle state for CameraSystem, WorldStreamingSystem & HUD
    this.velocity.set(forwardX * this.speed, 0, forwardZ * this.speed);
    globalBus.emit('vehicle:moved', {
      position: this.position,
      headingAngle: this.headingAngle,
      velocity: this.velocity,
      speed: this.speed,
      maxSpeed: this.maxSpeed,
      terrainPitch: this.terrainPitch,
      terrainRoll: this.terrainRoll,
    });

    // Also notify PlayerSystem & CameraSystem of synchronized focus
    globalBus.emit('player:moved', {
      position: this.position,
      headingAngle: this.headingAngle,
      isMoving: Math.abs(this.speed) > 0.2,
    });
  }

  /**
   * Diagnostic summary for development and test harnesses
   */
  getDebugInfo() {
    return {
      state: this.state,
      speed: this.speed,
      maxSpeed: this.maxSpeed,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      headingAngle: this.headingAngle,
      forward: { x: Math.sin(this.headingAngle), z: Math.cos(this.headingAngle) },
      steerAngle: this.steerAngle,
      terrainPitch: this.terrainPitch,
      terrainRoll: this.terrainRoll,
      chassisPitch: this.chassisGroup ? this.chassisGroup.rotation.x : 0,
      chassisRoll: this.chassisGroup ? this.chassisGroup.rotation.z : 0,
    };
  }
}
