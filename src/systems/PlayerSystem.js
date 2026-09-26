import * as THREE from 'three';
import { globalBus } from '../engine/EventBus.js';
import { globalInput } from '../engine/InputManager.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';

/**
 * Polished Movement & Kinematic Configuration
 */
export const MOVEMENT_CONFIG = {
  // Speeds
  WALK_SPEED: 2.8, // m/s (natural human walk)
  JOG_SPEED: 4.8, // m/s (relaxed suburban jog)

  // Ground Acceleration & Deceleration
  WALK_ACCELERATION: 9.5, // m/s²
  WALK_DECELERATION: 14.0, // m/s²
  JOG_ACCELERATION: 11.0, // m/s²
  JOG_DECELERATION: 15.0, // m/s²

  // Air Control (Limited mid-air steering)
  AIR_ACCELERATION: 3.5, // m/s²
  AIR_DECELERATION: 1.5, // m/s²

  // Rotation
  ROTATION_SPEED: 12.0, // rad/s

  // Jump
  JUMP_VELOCITY: 5.6, // m/s (~0.85m realistic jump apex)
  GRAVITY: -17.5, // m/s²

  // Footstep intervals
  STEP_INTERVAL_WALK: 0.52, // seconds
  STEP_INTERVAL_JOG: 0.34, // seconds
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const ZERO_VEC = new THREE.Vector3(0, 0, 0);

/**
 * PlayerSystem - High Polish Third-Person Kinematics, State Blending & Procedural Animations
 */
export class PlayerSystem {
  constructor() {
    this.mesh = null;
    this.spawnPosition = new THREE.Vector3(-24.0, 0, -46.5);
    this.position = this.spawnPosition.clone();

    // Reusable vectors for zero garbage collection
    this.velocity = new THREE.Vector3();
    this.targetVelocity = new THREE.Vector3();
    this.moveDirection = new THREE.Vector3();
    this.cameraForward = new THREE.Vector3();
    this.cameraRight = new THREE.Vector3();
    this.moveStep = new THREE.Vector3();

    // Angular orientation
    this.headingAngle = 0; // Facing North (world -Z)
    this.targetHeadingAngle = 0;

    // Vertical Physics
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.groundY = 0;

    // Movement & Animation States: 'IDLE' | 'WALK' | 'JOG' | 'JUMP' | 'FALL' | 'LAND'
    this.movementState = 'IDLE';
    this.isMoving = false;
    this.isJogging = false;
    this.speedFraction = 0; // 0 (idle) to 1 (full jog)
    this.animTime = 0;
    this.stepTimer = 0;
    this.landingTimer = 0;

    // Smooth animation blend values
    this.legSwingLeft = 0;
    this.legSwingRight = 0;
    this.armSwingLeft = 0;
    this.armSwingRight = 0;
    this.bodyBob = 0;
    this.landingSquat = 0;

    // Body limbs
    this.limbs = {
      torso: null,
      head: null,
      leftLeg: null,
      leftKnee: null,
      rightLeg: null,
      rightKnee: null,
      leftArm: null,
      rightArm: null,
      backpack: null,
    };

    this.worldSystem = null;
    this.isDialogueActive = false;

    // Sitting system
    this.isSitting = false;
    this.benchPosition = new THREE.Vector3();
    this.benchHeading = 0;
  }

  init(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.worldSystem = engine.systems.find((s) => typeof s.checkCollision === 'function');

    this.createMayankCharacter();

    // Broadcast initial position
    globalBus.emit('player:spawned', { position: this.position });

    // Track dialogue state so movement pauses naturally while talking
    globalBus.on('dialogue:open', () => {
      this.isDialogueActive = true;
    });

    globalBus.on('dialogue:close', () => {
      this.endDialogueInteraction();
    });

    // Sitting listeners
    globalBus.on('player:sit', (data) => {
      this.sitDown(data.position, data.heading);
    });

    globalBus.on('player:stand', () => {
      this.standUp();
    });

    // Handle reset on new game session
    globalBus.on('state:changed', (data) => {
      this.endDialogueInteraction();
      if (data.to === GameState.PLAYING && data.from === GameState.LOADING) {
        this.resetToSpawn();
      }
    });
  }

  endDialogueInteraction() {
    this.isDialogueActive = false;
  }

  sitDown(benchPos, heading = 0) {
    if (this.isSitting) {
      this.standUp();
      return;
    }

    this.isSitting = true;
    this.benchPosition.copy(benchPos);
    this.benchHeading = heading;
    this.position.copy(benchPos);
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.headingAngle = heading;
    this.targetHeadingAngle = heading;

    globalBus.emit('player:sittingChanged', { isSitting: true });
    globalBus.emit('toast:show', { message: 'Sitting peacefully. (Press E, Space, or WASD to stand)' });
  }

  standUp() {
    if (!this.isSitting) return;

    this.isSitting = false;
    if (this.limbs.leftLeg) {
      this.limbs.leftLeg.position.set(-0.14, 0.80, 0);
      this.limbs.leftLeg.rotation.set(0, 0, 0);
    }
    if (this.limbs.rightLeg) {
      this.limbs.rightLeg.position.set(0.14, 0.80, 0);
      this.limbs.rightLeg.rotation.set(0, 0, 0);
    }
    if (this.limbs.leftKnee) {
      this.limbs.leftKnee.position.set(0, -0.38, 0);
      this.limbs.leftKnee.rotation.set(0, 0, 0);
    }
    if (this.limbs.rightKnee) {
      this.limbs.rightKnee.position.set(0, -0.38, 0);
      this.limbs.rightKnee.rotation.set(0, 0, 0);
    }
    if (this.limbs.leftArm) {
      this.limbs.leftArm.position.set(-0.32, 1.4, 0);
      this.limbs.leftArm.rotation.set(0, 0, 0);
    }
    if (this.limbs.rightArm) {
      this.limbs.rightArm.position.set(0.32, 1.4, 0);
      this.limbs.rightArm.rotation.set(0, 0, 0);
    }
    if (this.limbs.torso) {
      this.limbs.torso.position.set(0, 1.14, 0);
      this.limbs.torso.rotation.set(0, 0, 0);
    }
    if (this.limbs.head) {
      this.limbs.head.position.set(0, 1.62, 0);
      this.limbs.head.rotation.set(0, 0, 0);
    }

    // Step slightly forward in facing direction away from the bench
    this.position.x += Math.sin(this.headingAngle) * 0.55;
    this.position.z += Math.cos(this.headingAngle) * 0.55;
    this.position.y = 0;

    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.rotation.y = this.headingAngle;
    }

    globalBus.emit('player:sittingChanged', { isSitting: false });
    globalBus.emit('interaction:blur');
  }

  resetToSpawn() {
    this.isSitting = false;
    this.position.copy(this.spawnPosition);
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.headingAngle = 0;
    this.targetHeadingAngle = 0;
    this.speedFraction = 0;
    this.movementState = 'IDLE';
    this.landingTimer = 0;
    this.isDialogueActive = false;

    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.rotation.y = this.headingAngle;
    }
    globalBus.emit('player:spawned', { position: this.position });
  }

  createMayankCharacter() {
    const playerGroup = new THREE.Group();
    playerGroup.position.copy(this.position);

    // Anime-realistic skin and wardrobe materials
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.65 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.45 });
    const jacketMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.65 }); // Classic royal/navy blue jacket
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 }); // White ribbed cuffs/collar
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.75 }); // Dark charcoal trousers
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
    const soleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
    const bagMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.75 }); // Mustard/ochre travel backpack

    // 1. Torso & Jacket
    const torsoGeo = new THREE.BoxGeometry(0.48, 0.62, 0.28);
    const torso = new THREE.Mesh(torsoGeo, jacketMat);
    torso.position.y = 1.14;
    torso.castShadow = true;
    torso.receiveShadow = true;
    playerGroup.add(torso);
    this.limbs.torso = torso;

    // White jacket collar trim
    const collarGeo = new THREE.BoxGeometry(0.32, 0.08, 0.3);
    const collar = new THREE.Mesh(collarGeo, trimMat);
    collar.position.set(0, 0.3, 0);
    torso.add(collar);

    // Inner crewneck shirt
    const innerShirtGeo = new THREE.BoxGeometry(0.22, 0.14, 0.29);
    const innerShirt = new THREE.Mesh(innerShirtGeo, shirtMat);
    innerShirt.position.set(0, 0.24, 0.01);
    torso.add(innerShirt);

    // Jacket hem ribbing
    const hemGeo = new THREE.BoxGeometry(0.49, 0.06, 0.29);
    const hem = new THREE.Mesh(hemGeo, trimMat);
    hem.position.set(0, -0.3, 0);
    torso.add(hem);

    // 2. Backpack with Pockets & Straps
    const bagGeo = new THREE.BoxGeometry(0.36, 0.46, 0.2);
    const bag = new THREE.Mesh(bagGeo, bagMat);
    bag.position.set(0, -0.02, -0.21);
    bag.castShadow = true;
    torso.add(bag);
    this.limbs.backpack = bag;

    // Backpack front pocket
    const pocketGeo = new THREE.BoxGeometry(0.28, 0.22, 0.08);
    const pocket = new THREE.Mesh(pocketGeo, bagMat);
    pocket.position.set(0, -0.1, -0.12);
    pocket.castShadow = true;
    bag.add(pocket);

    // Backpack side water bottle holder
    const bottleGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.22, 8);
    const bottleMat = new THREE.MeshStandardMaterial({ color: 0x0284c7 });
    const bottle = new THREE.Mesh(bottleGeo, bottleMat);
    bottle.position.set(0.19, -0.05, 0);
    bag.add(bottle);

    // 3. Head & Layered Anime Hair
    const headGeo = new THREE.SphereGeometry(0.17, 16, 16);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.set(0, 1.62, 0);
    head.castShadow = true;
    playerGroup.add(head);
    this.limbs.head = head;

    // Layered Anime Hairstyle
    const hairBaseGeo = new THREE.DodecahedronGeometry(0.2, 1);
    const hairBase = new THREE.Mesh(hairBaseGeo, hairMat);
    hairBase.position.set(0, 0.04, -0.02);
    hairBase.scale.set(1.02, 1.08, 1.12);
    head.add(hairBase);

    // Front Fringe / Bangs Tuft
    const fringeGeo = new THREE.ConeGeometry(0.08, 0.18, 4);
    const fringe = new THREE.Mesh(fringeGeo, hairMat);
    fringe.position.set(0.04, 0.12, 0.16);
    fringe.rotation.x = -0.6;
    fringe.rotation.z = -0.2;
    head.add(fringe);

    // 4. Legs & Sneakers (Articulated Hip & Knee joints)
    const thighGeo = new THREE.BoxGeometry(0.15, 0.38, 0.17);
    const shinGeo = new THREE.BoxGeometry(0.14, 0.38, 0.16);
    const shoeGeo = new THREE.BoxGeometry(0.17, 0.11, 0.28);
    const soleGeo = new THREE.BoxGeometry(0.18, 0.04, 0.29);

    // Left Leg
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.14, 0.80, 0);
    const leftThighMesh = new THREE.Mesh(thighGeo, pantsMat);
    leftThighMesh.position.y = -0.19;
    leftThighMesh.castShadow = true;
    leftLegPivot.add(leftThighMesh);

    const leftKneePivot = new THREE.Group();
    leftKneePivot.position.set(0, -0.38, 0);
    const leftShinMesh = new THREE.Mesh(shinGeo, pantsMat);
    leftShinMesh.position.y = -0.19;
    leftShinMesh.castShadow = true;
    leftKneePivot.add(leftShinMesh);

    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.36, 0.04);
    leftShoe.castShadow = true;
    leftKneePivot.add(leftShoe);

    const leftSole = new THREE.Mesh(soleGeo, soleMat);
    leftSole.position.set(0, -0.41, 0.04);
    leftKneePivot.add(leftSole);

    leftLegPivot.add(leftKneePivot);
    playerGroup.add(leftLegPivot);
    this.limbs.leftLeg = leftLegPivot;
    this.limbs.leftKnee = leftKneePivot;

    // Right Leg
    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.14, 0.80, 0);
    const rightThighMesh = new THREE.Mesh(thighGeo, pantsMat);
    rightThighMesh.position.y = -0.19;
    rightThighMesh.castShadow = true;
    rightLegPivot.add(rightThighMesh);

    const rightKneePivot = new THREE.Group();
    rightKneePivot.position.set(0, -0.38, 0);
    const rightShinMesh = new THREE.Mesh(shinGeo, pantsMat);
    rightShinMesh.position.y = -0.19;
    rightShinMesh.castShadow = true;
    rightKneePivot.add(rightShinMesh);

    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.36, 0.04);
    rightShoe.castShadow = true;
    rightKneePivot.add(rightShoe);

    const rightSole = new THREE.Mesh(soleGeo, soleMat);
    rightSole.position.set(0, -0.41, 0.04);
    rightKneePivot.add(rightSole);

    rightLegPivot.add(rightKneePivot);
    playerGroup.add(rightLegPivot);
    this.limbs.rightLeg = rightLegPivot;
    this.limbs.rightKnee = rightKneePivot;

    // 5. Arms & Cuffs
    const armGeo = new THREE.BoxGeometry(0.12, 0.56, 0.13);

    // Left Arm
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.32, 1.4, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, jacketMat);
    leftArmMesh.position.y = -0.26;
    leftArmMesh.castShadow = true;
    leftArmPivot.add(leftArmMesh);

    const cuffGeo = new THREE.BoxGeometry(0.13, 0.05, 0.14);
    const leftCuff = new THREE.Mesh(cuffGeo, trimMat);
    leftCuff.position.y = -0.52;
    leftArmPivot.add(leftCuff);

    const handGeo = new THREE.SphereGeometry(0.065, 8, 8);
    const leftHand = new THREE.Mesh(handGeo, skinMat);
    leftHand.position.y = -0.58;
    leftArmPivot.add(leftHand);

    playerGroup.add(leftArmPivot);
    this.limbs.leftArm = leftArmPivot;

    // Right Arm
    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.32, 1.4, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, jacketMat);
    rightArmMesh.position.y = -0.26;
    rightArmMesh.castShadow = true;
    rightArmPivot.add(rightArmMesh);

    const rightCuff = new THREE.Mesh(cuffGeo, trimMat);
    rightCuff.position.y = -0.52;
    rightArmPivot.add(rightCuff);

    const rightHand = new THREE.Mesh(handGeo, skinMat);
    rightHand.position.y = -0.58;
    rightArmPivot.add(rightHand);

    playerGroup.add(rightArmPivot);
    this.limbs.rightArm = rightArmPivot;

    this.mesh = playerGroup;
    this.scene.add(this.mesh);
  }

  update(delta) {
    if (!this.mesh) return;

    // Freeze motion during non-playing states (Pause, Title, Loading)
    if (!globalGameState.is(GameState.PLAYING)) {
      this.updateProceduralAnimation(delta, false, false, true, 0);
      return;
    }

    if (this.isSitting) {
      const sitInput = globalInput.getMovementInput();
      if (sitInput.length > 0.1 || globalInput.consumeJumpPress()) {
        this.standUp();
      } else {
        // Maintain seated position & authentic Japanese bench sitting pose
        this.position.copy(this.benchPosition);
        // Lower pelvis root so character sits directly on top of the seat surface (~0.52m height)
        this.mesh.position.set(this.position.x, this.position.y - 0.28, this.position.z);
        this.mesh.rotation.set(0, this.benchHeading, 0);

        // Explicit symmetrical lateral positions for both leg pivots on respective sides
        this.limbs.leftLeg.position.set(-0.14, 0.80, 0);
        this.limbs.rightLeg.position.set(0.14, 0.80, 0);
        this.limbs.leftKnee.position.set(0, -0.38, 0);
        this.limbs.rightKnee.position.set(0, -0.38, 0);

        // Thighs bent forward ~90° parallel to seat plank pointing forward from pelvis (+Z)
        this.limbs.leftLeg.rotation.set(-1.48, 0, 0);
        this.limbs.rightLeg.rotation.set(-1.48, 0, 0);

        // Knees bent downward ~90°, lower legs hang down and feet rest naturally on ground underneath knees
        this.limbs.leftKnee.rotation.set(1.50, 0, 0);
        this.limbs.rightKnee.rotation.set(1.50, 0, 0);

        // Arms relaxed at sides with hands comfortably resting on thighs
        this.limbs.leftArm.position.set(-0.32, 1.4, 0);
        this.limbs.rightArm.position.set(0.32, 1.4, 0);
        this.limbs.leftArm.rotation.set(0.38, 0, -0.04);
        this.limbs.rightArm.rotation.set(0.38, 0, 0.04);

        // Subtle relaxed breathing on torso & head
        const breathe = Math.sin(this.engine.clock.getElapsedTime() * 2) * 0.006;
        this.limbs.torso.position.set(0, 1.14 + breathe, 0);
        this.limbs.torso.rotation.set(-0.04, 0, 0);
        this.limbs.head.position.set(0, 1.62 + breathe, 0);
        this.limbs.head.rotation.set(0, 0, 0);

        globalBus.emit('player:moved', {
          position: this.position,
          headingAngle: this.benchHeading,
          isJogging: false,
          isGrounded: true,
          speed: 0,
        });
        return;
      }
    }

    // 1. Check Vertical Jump Input
    if (this.isGrounded && !this.isDialogueActive && globalInput.consumeJumpPress()) {
      this.isGrounded = false;
      this.verticalVelocity = MOVEMENT_CONFIG.JUMP_VELOCITY;
      this.movementState = 'JUMP';
      globalBus.emit('player:jump');
    }

    // 2. Vertical Kinematic Physics (Gravity & Landing)
    if (!this.isGrounded) {
      this.verticalVelocity += MOVEMENT_CONFIG.GRAVITY * delta;
      this.position.y += this.verticalVelocity * delta;

      if (this.verticalVelocity > 0) {
        this.movementState = 'JUMP';
      } else {
        this.movementState = 'FALL';
      }

      // Ground landing contact
      if (this.position.y <= this.groundY) {
        this.position.y = this.groundY;
        this.verticalVelocity = 0;
        this.isGrounded = true;
        this.movementState = 'LAND';
        this.landingTimer = 0.22; // Brief landing compression window
        globalBus.emit('player:land');
      }
    } else if (this.landingTimer > 0) {
      this.landingTimer -= delta;
      if (this.landingTimer <= 0) {
        this.landingTimer = 0;
      }
    }

    // 3. Horizontal Movement & Camera-Relative Orientation
    const input = this.isDialogueActive ? { x: 0, z: 0, length: 0, isJogging: false } : globalInput.getMovementInput();
    this.isMoving = input.length > 0.01;
    this.isJogging = input.isJogging;

    if (this.isMoving) {
      // Derive movement vector from camera's horizontal forward and right
      const camera = this.engine.camera;
      camera.getWorldDirection(this.cameraForward);
      this.cameraForward.y = 0;
      this.cameraForward.normalize();

      this.cameraRight.crossVectors(this.cameraForward, WORLD_UP).normalize();

      // Normalize camera-relative movement direction
      this.moveDirection
        .copy(this.cameraForward)
        .multiplyScalar(-input.z)
        .addScaledVector(this.cameraRight, input.x)
        .normalize();

      // Target world heading
      this.targetHeadingAngle = Math.atan2(this.moveDirection.x, this.moveDirection.z);

      // Smooth shortest-arc rotation
      let angleDiff = this.targetHeadingAngle - this.headingAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      this.headingAngle += angleDiff * Math.min(MOVEMENT_CONFIG.ROTATION_SPEED * delta, 1.0);

      // Target speed & acceleration based on ground vs air state
      const targetSpeed = this.isJogging ? MOVEMENT_CONFIG.JOG_SPEED : MOVEMENT_CONFIG.WALK_SPEED;
      this.targetVelocity.copy(this.moveDirection).multiplyScalar(targetSpeed);

      let accel = this.isJogging ? MOVEMENT_CONFIG.JOG_ACCELERATION : MOVEMENT_CONFIG.WALK_ACCELERATION;
      if (!this.isGrounded) {
        accel = MOVEMENT_CONFIG.AIR_ACCELERATION;
      }

      this.velocity.lerp(this.targetVelocity, accel * delta);
    } else {
      // Smooth deceleration to stop
      let decel = this.isJogging ? MOVEMENT_CONFIG.JOG_DECELERATION : MOVEMENT_CONFIG.WALK_DECELERATION;
      if (!this.isGrounded) {
        decel = MOVEMENT_CONFIG.AIR_DECELERATION;
      }
      this.velocity.lerp(ZERO_VEC, decel * delta);
      if (this.velocity.lengthSq() < 0.0001) {
        this.velocity.set(0, 0, 0);
      }
    }

    // 4. Apply Horizontal Position with Collision Resolution
    this.moveStep.copy(this.velocity).multiplyScalar(delta);

    if (this.moveStep.lengthSq() > 0.000001) {
      const nextX = this.position.x + this.moveStep.x;
      const nextZ = this.position.z + this.moveStep.z;

      // X-axis collision test
      if (!this.worldSystem || !this.worldSystem.checkCollision(nextX, this.position.z, 0.4)) {
        this.position.x = nextX;
      }

      // Z-axis collision test
      if (!this.worldSystem || !this.worldSystem.checkCollision(this.position.x, nextZ, 0.4)) {
        this.position.z = nextZ;
      }

      // District boundaries clamp
      this.position.x = THREE.MathUtils.clamp(this.position.x, -110, 110);
      this.position.z = THREE.MathUtils.clamp(this.position.z, -110, 110);
    }

    // 5. Update Current Speed Fraction & State
    const currentSpeed = this.velocity.length();
    this.speedFraction = currentSpeed / MOVEMENT_CONFIG.JOG_SPEED;

    if (this.isGrounded) {
      if (this.landingTimer > 0) {
        this.movementState = 'LAND';
      } else if (currentSpeed > 3.4) {
        this.movementState = 'JOG';
      } else if (currentSpeed > 0.15) {
        this.movementState = 'WALK';
      } else {
        this.movementState = 'IDLE';
      }

      // Footstep cadence synced to movement speed
      if (currentSpeed > 0.3) {
        const interval = this.movementState === 'JOG' ? MOVEMENT_CONFIG.STEP_INTERVAL_JOG : MOVEMENT_CONFIG.STEP_INTERVAL_WALK;
        this.stepTimer += delta;
        if (this.stepTimer >= interval) {
          this.stepTimer = 0;
          globalBus.emit('player:footstep', { isJogging: this.movementState === 'JOG' });
        }
      } else {
        this.stepTimer = 0;
      }
    } else {
      this.stepTimer = 0;
    }

    // Update Mesh Transform
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.headingAngle;

    // 6. Update Procedural Animation
    this.updateProceduralAnimation(delta, this.isMoving, this.isJogging, this.isGrounded, currentSpeed);

    // Broadcast update
    globalBus.emit('player:moved', {
      position: this.position,
      headingAngle: this.headingAngle,
      isMoving: this.isMoving,
      velocity: this.velocity,
      isGrounded: this.isGrounded,
      movementState: this.movementState,
    });
  }

  updateProceduralAnimation(delta, isMoving, isJogging, isGrounded, currentSpeed) {
    if (!isGrounded) {
      // JUMP / FALL STATE
      if (this.verticalVelocity > 0) {
        // Takeoff & Ascent pose
        this.legSwingLeft = THREE.MathUtils.lerp(this.legSwingLeft, -0.38, delta * 12);
        this.legSwingRight = THREE.MathUtils.lerp(this.legSwingRight, 0.28, delta * 12);
        this.armSwingLeft = THREE.MathUtils.lerp(this.armSwingLeft, 0.42, delta * 12);
        this.armSwingRight = THREE.MathUtils.lerp(this.armSwingRight, -0.42, delta * 12);
      } else {
        // Apex & Descent pose
        this.legSwingLeft = THREE.MathUtils.lerp(this.legSwingLeft, -0.18, delta * 10);
        this.legSwingRight = THREE.MathUtils.lerp(this.legSwingRight, -0.18, delta * 10);
        this.armSwingLeft = THREE.MathUtils.lerp(this.armSwingLeft, 0.18, delta * 10);
        this.armSwingRight = THREE.MathUtils.lerp(this.armSwingRight, 0.18, delta * 10);
      }
      this.bodyBob = 0;
      this.landingSquat = 0;
    } else if (this.movementState === 'LAND') {
      // LANDING COMPRESSION BLEND
      const landingProgress = this.landingTimer / 0.22;
      this.landingSquat = Math.sin(landingProgress * Math.PI) * 0.08;
      this.legSwingLeft = THREE.MathUtils.lerp(this.legSwingLeft, -0.15, delta * 14);
      this.legSwingRight = THREE.MathUtils.lerp(this.legSwingRight, -0.15, delta * 14);
      this.armSwingLeft = THREE.MathUtils.lerp(this.armSwingLeft, 0.2, delta * 14);
      this.armSwingRight = THREE.MathUtils.lerp(this.armSwingRight, 0.2, delta * 14);
    } else if (currentSpeed > 0.15) {
      // GROUNDED WALK / JOG STRIDE
      const strideRate = isJogging ? 11.5 : 7.8;
      this.animTime += delta * strideRate * (currentSpeed / (isJogging ? MOVEMENT_CONFIG.JOG_SPEED : MOVEMENT_CONFIG.WALK_SPEED));

      const strideAmplitude = isJogging ? 0.7 : 0.42;
      const armAmplitude = isJogging ? 0.55 : 0.32;

      const targetLegLeft = Math.sin(this.animTime) * strideAmplitude;
      const targetLegRight = -Math.sin(this.animTime) * strideAmplitude;
      const targetArmLeft = -Math.sin(this.animTime) * armAmplitude;
      const targetArmRight = Math.sin(this.animTime) * armAmplitude;

      // Smooth interpolation for stride
      this.legSwingLeft = THREE.MathUtils.lerp(this.legSwingLeft, targetLegLeft, delta * 18);
      this.legSwingRight = THREE.MathUtils.lerp(this.legSwingRight, targetLegRight, delta * 18);
      this.armSwingLeft = THREE.MathUtils.lerp(this.armSwingLeft, targetArmLeft, delta * 18);
      this.armSwingRight = THREE.MathUtils.lerp(this.armSwingRight, targetArmRight, delta * 18);

      this.bodyBob = Math.abs(Math.cos(this.animTime)) * (isJogging ? 0.045 : 0.025);
      this.landingSquat = THREE.MathUtils.lerp(this.landingSquat, 0, delta * 10);
    } else {
      // IDLE BREATHING BLEND
      this.legSwingLeft = THREE.MathUtils.lerp(this.legSwingLeft, 0, delta * 8);
      this.legSwingRight = THREE.MathUtils.lerp(this.legSwingRight, 0, delta * 8);
      this.armSwingLeft = THREE.MathUtils.lerp(this.armSwingLeft, 0, delta * 8);
      this.armSwingRight = THREE.MathUtils.lerp(this.armSwingRight, 0, delta * 8);

      this.bodyBob = Math.sin(this.engine.clock.getElapsedTime() * 2) * 0.012;
      this.landingSquat = THREE.MathUtils.lerp(this.landingSquat, 0, delta * 10);
    }

    // Apply rotation and positions to limb nodes
    this.limbs.leftLeg.rotation.x = this.legSwingLeft;
    this.limbs.rightLeg.rotation.x = this.legSwingRight;

    if (this.limbs.leftKnee && this.limbs.rightKnee) {
      if (!isGrounded) {
        this.limbs.leftKnee.rotation.x = -0.3;
        this.limbs.rightKnee.rotation.x = -0.2;
      } else if (currentSpeed > 0.15) {
        // Natural backward knee flexion during backward leg swing
        this.limbs.leftKnee.rotation.x = -Math.max(0, this.legSwingLeft) * (isJogging ? 0.85 : 0.6);
        this.limbs.rightKnee.rotation.x = -Math.max(0, this.legSwingRight) * (isJogging ? 0.85 : 0.6);
      } else {
        this.limbs.leftKnee.rotation.x = THREE.MathUtils.lerp(this.limbs.leftKnee.rotation.x, 0, delta * 8);
        this.limbs.rightKnee.rotation.x = THREE.MathUtils.lerp(this.limbs.rightKnee.rotation.x, 0, delta * 8);
      }
    }

    this.limbs.leftArm.rotation.x = this.armSwingLeft;
    this.limbs.rightArm.rotation.x = this.armSwingRight;

    const baseTorsoY = 1.14 - this.landingSquat + this.bodyBob;
    const baseHeadY = 1.62 - this.landingSquat + this.bodyBob;

    this.limbs.torso.position.y = baseTorsoY;
    this.limbs.head.position.y = baseHeadY;
  }
}
