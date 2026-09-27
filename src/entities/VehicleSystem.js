import * as THREE from 'three';
import { globalBus } from '../engine/EventBus.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';
import { globalInput } from '../engine/InputManager.js';

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
 * kinematic driving physics, multi-touch/keyboard controls, collision resolution,
 * and seamless entry/exit lifecycle.
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
    this.maxSpeed = 15.0; // ~54 km/h (peaceful & responsive neighborhood driving)
    this.maxReverseSpeed = -4.5;
    this.acceleration = 6.8;
    this.brakeForce = 12.0;
    this.friction = 3.2;

    this.headingAngle = Math.PI / 2; // Facing East along street
    this.steerAngle = 0;
    this.maxSteerAngle = 0.52; // ~30 degrees
    this.wheelbase = 2.4;

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
    this.collisionRadius = 0.95;
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

  getWorldDriverEntryPosition(targetVec = new THREE.Vector3()) {
    if (this.driverEntryAnchor) {
      return this.driverEntryAnchor.getWorldPosition(targetVec);
    }
    const offset = new THREE.Vector3(-1.15, 0, 0.2);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.headingAngle);
    return targetVec.copy(this.position).add(offset);
  }

  getWorldDriverSeatPosition(targetVec = new THREE.Vector3()) {
    const offset = new THREE.Vector3(-0.35, 0.65, 0.15);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.headingAngle);
    return targetVec.copy(this.position).add(offset);
  }

  getSafeExitPosition(targetVec = new THREE.Vector3()) {
    // 1. Driver side (left side: local x = -1.35, z = 0.2)
    const leftOffset = new THREE.Vector3(-1.35, 0, 0.2);
    leftOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.headingAngle);
    const candidate = this.position.clone().add(leftOffset);
    candidate.y = 0;

    if (!this.worldSystem || !this.worldSystem.checkCollision(candidate.x, candidate.z, 0.4)) {
      return targetVec.copy(candidate);
    }

    // 2. Passenger side (right side: local x = 1.35, z = 0.2)
    const rightOffset = new THREE.Vector3(1.35, 0, 0.2);
    rightOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.headingAngle);
    candidate.copy(this.position).add(rightOffset);
    candidate.y = 0;

    if (!this.worldSystem || !this.worldSystem.checkCollision(candidate.x, candidate.z, 0.4)) {
      return targetVec.copy(candidate);
    }

    // 3. Fallback: Behind vehicle
    const rearOffset = new THREE.Vector3(0, 0, -2.4);
    rearOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.headingAngle);
    candidate.copy(this.position).add(rearOffset);
    candidate.y = 0;
    return targetVec.copy(candidate);
  }

  drive(throttle = 0, steer = 0, isHandbrake = false, delta = 0.016) {
    if (throttle > 0) {
      if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.brakeForce * delta);
      } else {
        this.speed = Math.min(this.maxSpeed, this.speed + this.acceleration * throttle * delta);
      }
    } else if (throttle < 0) {
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.brakeForce * Math.abs(throttle) * delta);
      } else {
        this.speed = Math.max(this.maxReverseSpeed, this.speed - this.acceleration * 0.6 * Math.abs(throttle) * delta);
      }
    } else {
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.friction * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.friction * delta);
      }
    }

    if (isHandbrake) {
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.brakeForce * 1.8 * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.brakeForce * 1.8 * delta);
      }
    }

    if (Math.abs(steer) > 0.01) {
      this.steerAngle = steer * this.maxSteerAngle;
    } else {
      this.steerAngle = 0;
    }

    if (Math.abs(this.speed) > 0.05) {
      const turnRate = (this.speed / this.wheelbase) * Math.sin(this.steerAngle);
      this.headingAngle += turnRate * delta;
    }

    const moveDist = this.speed * delta;
    const forwardX = Math.sin(this.headingAngle);
    const forwardZ = Math.cos(this.headingAngle);

    const deltaX = forwardX * moveDist;
    const deltaZ = forwardZ * moveDist;

    let nextX = this.position.x + deltaX;
    let nextZ = this.position.z + deltaZ;

    if (this.worldSystem && typeof this.worldSystem.checkCollision === 'function') {
      const hasCollision = this.worldSystem.checkCollision(nextX, nextZ, this.collisionRadius);
      if (hasCollision) {
        this.speed = -this.speed * 0.25;
        nextX = this.position.x;
        nextZ = this.position.z;
      }
    }

    this.position.x = nextX;
    this.position.z = nextZ;

    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.rotation.y = this.headingAngle;
    }

    this.velocity.set(forwardX * this.speed, 0, forwardZ * this.speed);
  }

  init(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.worldSystem = engine.systems.find((s) => typeof s.checkCollision === 'function');

    this.createVehicleMesh();
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

    if (window.__HEIWA_DEBUG_CAR__) {
      console.log('[HEIWA CAR] CAR EXIT REQUEST: IN_VEHICLE -> EXITING_VEHICLE -> ON_FOOT');
    }

    this.state = VehicleState.EXITING_VEHICLE;
    this.speed = 0;
    this.velocity.set(0, 0, 0);

    const safeExitPos = this.getSafeExitPosition();

    if (this.driverEntryAnchor) {
      this.driverEntryAnchor.userData.prompt = 'Enter Car (press twice)';
    }
    this.mesh.userData.prompt = 'Enter Car (press twice)';

    globalBus.emit('vehicle:exited', {
      exitPosition: safeExitPos,
      headingAngle: this.headingAngle,
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
      if (this.speed < 0) {
        // Active braking from reverse
        this.speed = Math.min(0, this.speed + this.brakeForce * delta);
      } else {
        this.speed = Math.min(this.maxSpeed, this.speed + this.acceleration * throttle * delta);
      }
    } else if (throttle < 0) {
      if (this.speed > 0) {
        // Active braking from forward
        this.speed = Math.max(0, this.speed - this.brakeForce * Math.abs(throttle) * delta);
      } else {
        this.speed = Math.max(this.maxReverseSpeed, this.speed - this.acceleration * 0.6 * Math.abs(throttle) * delta);
      }
    } else {
      // Natural rolling friction deceleration
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.friction * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.friction * delta);
      }
    }

    if (isHandbrake) {
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.brakeForce * 1.8 * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.brakeForce * 1.8 * delta);
      }
    }

    // 2. Steering with speed-sensitive stability curve
    const speedRatio = Math.min(1.0, Math.abs(this.speed) / 10.0);
    const targetSteerMax = THREE.MathUtils.lerp(this.maxSteerAngle, this.maxSteerAngle * 0.45, speedRatio);

    // input.x < 0 is Left (A key), input.x > 0 is Right (D key)
    let targetSteer = 0;
    if (Math.abs(input.x) > 0.05) {
      targetSteer = -input.x * targetSteerMax; // Left steering turns positive heading
    }
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteer, Math.min(1, 12.0 * delta));

    // 3. Kinematic Bicycle Turning Model
    if (Math.abs(this.speed) > 0.05) {
      const turnRate = (this.speed / this.wheelbase) * Math.sin(this.steerAngle);
      this.headingAngle += turnRate * delta;
    }

    // 4. Proposed Position Update & Collision Resolution
    const moveDist = this.speed * delta;
    const forwardX = Math.sin(this.headingAngle);
    const forwardZ = Math.cos(this.headingAngle);

    const deltaX = forwardX * moveDist;
    const deltaZ = forwardZ * moveDist;

    let nextX = this.position.x + deltaX;
    let nextZ = this.position.z + deltaZ;

    // Check collision against solid world instances
    if (this.worldSystem && typeof this.worldSystem.checkCollision === 'function') {
      const hasCollision = this.worldSystem.checkCollision(nextX, nextZ, this.collisionRadius);
      if (hasCollision) {
        // Car bumper obstruction: halt forward velocity on solid collision
        this.speed = -this.speed * 0.25; // Gentle bounce
        nextX = this.position.x;
        nextZ = this.position.z;
      }
    }

    this.position.x = nextX;
    this.position.z = nextZ;

    // 5. Update Visual Wheel & Chassis Transforms
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.headingAngle;

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

    // Chassis dynamic body roll and pitch
    const bodyRoll = -(this.speed / this.maxSpeed) * (this.steerAngle / this.maxSteerAngle) * 0.08;
    const bodyPitch = (throttle * this.acceleration * 0.015);
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
    });

    // Also notify PlayerSystem & CameraSystem of synchronized focus
    globalBus.emit('player:moved', {
      position: this.position,
      headingAngle: this.headingAngle,
      isMoving: Math.abs(this.speed) > 0.2,
    });
  }
}
