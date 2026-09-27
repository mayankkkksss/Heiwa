import * as THREE from 'three';
import { globalBus } from '../engine/EventBus.js';
import { globalInput } from '../engine/InputManager.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';
import { getTerrainHeight } from '../utils/SeededRandom.js';

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

    // Collision body parameters (Vertical cylinder/capsule gameplay collider)
    this.colliderRadius = 0.38;
    this.colliderHeight = 1.80;
    this.stepHeight = 0.35;

    // Sitting system
    this.isSitting = false;
    this.benchPosition = new THREE.Vector3();
    this.benchHeading = 0;
  }

  init(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.worldSystem = engine.systems.find((s) => typeof s.resolvePlayerMovement === 'function' || typeof s.checkCollision === 'function');
    this.npcSystem = engine.systems.find((s) => s.constructor.name === 'NPCSystem');

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

    // Vehicle listeners
    this.isInVehicle = false;
    globalBus.on('vehicle:entered', () => {
      this.isInVehicle = true;
      if (this.mesh) this.mesh.visible = false;
    });

    globalBus.on('vehicle:moved', (data) => {
      if (this.isInVehicle && data.position) {
        this.position.copy(data.position);
        if (this.mesh) {
          this.mesh.position.copy(this.position);
        }
      }
    });

    globalBus.on('vehicle:exited', (data) => {
      this.isInVehicle = false;
      if (this.mesh) {
        this.mesh.visible = true;
        if (data.exitPosition) {
          this.position.copy(data.exitPosition);
          this.mesh.position.copy(this.position);
        }
        if (typeof data.headingAngle === 'number') {
          this.headingAngle = data.headingAngle;
          this.targetHeadingAngle = data.headingAngle;
          this.mesh.rotation.y = this.headingAngle;
        }
      }
      this.velocity.set(0, 0, 0);
      this.verticalVelocity = 0;
      this.isGrounded = true;
      this.movementState = 'IDLE';

      // Immediately broadcast player:moved at exit position for camera, minimap, streaming, etc.
      globalBus.emit('player:moved', {
        position: this.position,
        headingAngle: this.headingAngle,
        isMoving: false,
        isJogging: false,
        isGrounded: true,
        speed: 0,
      });
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

    // Step forward in facing direction away from the bench to clear seat collider
    this.position.x += Math.sin(this.headingAngle) * 0.75;
    this.position.z += Math.cos(this.headingAngle) * 0.75;
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

  getStateForSave() {
    return {
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      headingAngle: this.headingAngle,
      isInVehicle: this.isInVehicle,
      movementState: this.movementState,
    };
  }

  restoreState(data) {
    if (!data) return;
    this.isSitting = false;
    this.isDialogueActive = false;

    if (data.position) {
      this.position.set(data.position.x, data.position.y ?? 0, data.position.z);
      if (this.mesh) {
        this.mesh.position.copy(this.position);
      }
    }
    if (typeof data.headingAngle === 'number') {
      this.headingAngle = data.headingAngle;
      this.targetHeadingAngle = data.headingAngle;
      if (this.mesh) {
        this.mesh.rotation.y = this.headingAngle;
      }
    }
    this.isInVehicle = !!data.isInVehicle;
    if (this.mesh) {
      this.mesh.visible = !this.isInVehicle;
    }
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.movementState = data.movementState || 'IDLE';

    globalBus.emit('player:spawned', { position: this.position });
    globalBus.emit('player:moved', {
      position: this.position,
      headingAngle: this.headingAngle,
      isMoving: false,
      isJogging: false,
      isGrounded: true,
      speed: 0,
    });
  }

  createMayankCharacter() {
    const playerGroup = new THREE.Group();
    playerGroup.position.copy(this.position);

    // ========================================================================
    // 1. PALETTE & MATERIAL SEPARATION (Vibrant, High-Readability Aesthetic)
    // ========================================================================
    // Skin: Warm, radiant medium-brown Indian skin tone with natural luminosity
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xc28962,
      roughness: 0.52,
      metalness: 0.0,
    });
    const skinHighlightMat = new THREE.MeshStandardMaterial({
      color: 0xd09a74,
      roughness: 0.48,
      metalness: 0.0,
    });
    const skinShadowMat = new THREE.MeshStandardMaterial({
      color: 0xa66c46,
      roughness: 0.62,
      metalness: 0.0,
    });

    // Hair: Very dark espresso black-brown with soft matte texture
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x161312,
      roughness: 0.72,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    const hairHighlightMat = new THREE.MeshStandardMaterial({
      color: 0x28201d,
      roughness: 0.68,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });

    // Facial features: Expressive anime-inspired materials
    const eyebrowMat = new THREE.MeshStandardMaterial({
      color: 0x141110,
      roughness: 0.90,
    });
    const eyeWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xfbfcfe,
      roughness: 0.15,
      metalness: 0.0,
    });
    const eyeIrisMat = new THREE.MeshStandardMaterial({
      color: 0x2d170b,
      roughness: 0.15,
      metalness: 0.05,
    });
    const eyePupilMat = new THREE.MeshStandardMaterial({
      color: 0x080402,
      roughness: 0.10,
    });
    const eyeCatchlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.05,
    });
    const eyelidMat = new THREE.MeshStandardMaterial({
      color: 0x161312,
      roughness: 0.85,
    });
    const lipMat = new THREE.MeshStandardMaterial({
      color: 0x9e5442,
      roughness: 0.58,
    });

    // Wardrobe: Restrained Japanese casual streetwear
    // Jacket: Tasteful casual overshirt in muted indigo/slate-blue
    const jacketMat = new THREE.MeshStandardMaterial({
      color: 0x2a4362,
      roughness: 0.70,
      metalness: 0.02,
    });
    const jacketAccentMat = new THREE.MeshStandardMaterial({
      color: 0x1c2e42,
      roughness: 0.65,
    });

    // Shirt: Premium warm off-white neutral inner T-shirt
    const shirtMat = new THREE.MeshStandardMaterial({
      color: 0xf3eee6,
      roughness: 0.80,
    });

    // Trousers: Tailored straight-fit dark charcoal trousers
    const pantsMat = new THREE.MeshStandardMaterial({
      color: 0x2e3540,
      roughness: 0.76,
    });
    const beltMat = new THREE.MeshStandardMaterial({
      color: 0x1e1915,
      roughness: 0.60,
    });

    // Sneakers: Clean minimalist city low-top sneakers
    const shoeUpperMat = new THREE.MeshStandardMaterial({
      color: 0xededf2,
      roughness: 0.38,
    });
    const shoeTrimMat = new THREE.MeshStandardMaterial({
      color: 0x46576f,
      roughness: 0.45,
    });
    const soleMat = new THREE.MeshStandardMaterial({
      color: 0xdcd8d0,
      roughness: 0.65,
    });

    // Backpack: Modern canvas commuter bag in refined olive-khaki
    const bagMat = new THREE.MeshStandardMaterial({
      color: 0x7c6448,
      roughness: 0.75,
    });
    const bagStrapMat = new THREE.MeshStandardMaterial({
      color: 0x222325,
      roughness: 0.80,
    });
    const bagBottleMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.35,
    });

    // ========================================================================
    // 2. TORSO & LAYERED OUTFIT
    // ========================================================================
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 1.14, 0);

    // Main jacket / overshirt body
    const torsoGeo = new THREE.BoxGeometry(0.46, 0.58, 0.26);
    const torsoMesh = new THREE.Mesh(torsoGeo, jacketMat);
    torsoGroup.add(torsoMesh);

    // Inner crewneck T-shirt showing at center chest
    const innerShirtGeo = new THREE.BoxGeometry(0.20, 0.24, 0.27);
    const innerShirt = new THREE.Mesh(innerShirtGeo, shirtMat);
    innerShirt.position.set(0, 0.18, 0.005);
    torsoGroup.add(innerShirt);

    // T-shirt round collar
    const collarGeo = new THREE.CylinderGeometry(0.082, 0.082, 0.04, 16);
    const collar = new THREE.Mesh(collarGeo, shirtMat);
    collar.position.set(0, 0.29, 0.005);
    torsoGroup.add(collar);

    // Jacket open front panels (left and right lapels)
    const lapelGeo = new THREE.BoxGeometry(0.12, 0.44, 0.02);
    const leftLapel = new THREE.Mesh(lapelGeo, jacketMat);
    leftLapel.position.set(-0.13, 0.02, 0.132);
    torsoGroup.add(leftLapel);

    const rightLapel = new THREE.Mesh(lapelGeo, jacketMat);
    rightLapel.position.set(0.13, 0.02, 0.132);
    torsoGroup.add(rightLapel);

    // Chest pocket accent on left chest
    const chestPocketGeo = new THREE.BoxGeometry(0.08, 0.09, 0.015);
    const chestPocket = new THREE.Mesh(chestPocketGeo, jacketAccentMat);
    chestPocket.position.set(-0.13, 0.12, 0.142);
    torsoGroup.add(chestPocket);

    // Jacket stand/fold collar framing the neck
    const jacketCollarGeo = new THREE.BoxGeometry(0.30, 0.07, 0.28);
    const jacketCollar = new THREE.Mesh(jacketCollarGeo, jacketAccentMat);
    jacketCollar.position.set(0, 0.28, -0.01);
    torsoGroup.add(jacketCollar);

    // Jacket lower hem ribbing
    const hemGeo = new THREE.BoxGeometry(0.47, 0.05, 0.27);
    const hem = new THREE.Mesh(hemGeo, jacketAccentMat);
    hem.position.set(0, -0.27, 0);
    torsoGroup.add(hem);

    // Subtle dark belt / transition line
    const beltGeo = new THREE.BoxGeometry(0.44, 0.035, 0.25);
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.set(0, -0.30, 0);
    torsoGroup.add(belt);

    // Modern commuter backpack
    const bagGeo = new THREE.BoxGeometry(0.34, 0.42, 0.18);
    const bag = new THREE.Mesh(bagGeo, bagMat);
    bag.position.set(0, 0.02, -0.20);
    torsoGroup.add(bag);
    this.limbs.backpack = bag;

    // Backpack front pocket
    const pocketGeo = new THREE.BoxGeometry(0.26, 0.20, 0.07);
    const pocket = new THREE.Mesh(pocketGeo, bagMat);
    pocket.position.set(0, -0.06, -0.11);
    bag.add(pocket);

    // Backpack top grab loop
    const handleGeo = new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI);
    const handle = new THREE.Mesh(handleGeo, bagStrapMat);
    handle.position.set(0, 0.21, 0.02);
    handle.rotation.set(0, 0, 0);
    bag.add(handle);

    // Backpack front shoulder straps
    const strapGeo = new THREE.BoxGeometry(0.05, 0.50, 0.02);
    const leftStrap = new THREE.Mesh(strapGeo, bagStrapMat);
    leftStrap.position.set(-0.13, 0.04, 0.135);
    torsoGroup.add(leftStrap);

    const rightStrap = new THREE.Mesh(strapGeo, bagStrapMat);
    rightStrap.position.set(0.13, 0.04, 0.135);
    torsoGroup.add(rightStrap);

    // Backpack side water bottle holder
    const bottleGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.20, 10);
    const bottle = new THREE.Mesh(bottleGeo, bagBottleMat);
    bottle.position.set(0.18, -0.04, 0);
    bag.add(bottle);

    playerGroup.add(torsoGroup);
    this.limbs.torso = torsoGroup;

    // ========================================================================
    // 3. HEAD, HANDSOME ANIME FACE & ARCHITECTURAL HAIR SEPARATION
    // ========================================================================
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.62, 0);

    // Visible neck connection bridging torso and head seamlessly
    const neckGeo = new THREE.CylinderGeometry(0.062, 0.070, 0.16, 16);
    const neck = new THREE.Mesh(neckGeo, skinShadowMat);
    neck.position.set(0, -0.10, -0.01);
    headGroup.add(neck);

    // Head base / cranium (smooth rounded anime proportions)
    const craniumGeo = new THREE.SphereGeometry(0.146, 24, 20);
    const cranium = new THREE.Mesh(craniumGeo, skinMat);
    cranium.position.set(0, 0.015, 0);
    cranium.scale.set(0.95, 1.04, 0.98);
    headGroup.add(cranium);

    // Jaw and chin definition (handsome tapered lower face structure)
    const jawGeo = new THREE.CylinderGeometry(0.104, 0.058, 0.13, 16);
    const jaw = new THREE.Mesh(jawGeo, skinMat);
    jaw.position.set(0, -0.062, 0.024);
    jaw.scale.set(1.0, 1.0, 0.85);
    headGroup.add(jaw);

    // Clean, sculpted chin contour
    const chinGeo = new THREE.SphereGeometry(0.034, 14, 14);
    const chin = new THREE.Mesh(chinGeo, skinMat);
    chin.position.set(0, -0.110, 0.082);
    chin.scale.set(1.1, 0.85, 0.95);
    headGroup.add(chin);

    // Sculpted cheekbone planes
    const cheekGeo = new THREE.BoxGeometry(0.044, 0.038, 0.065);
    const leftCheek = new THREE.Mesh(cheekGeo, skinHighlightMat);
    leftCheek.position.set(-0.082, -0.012, 0.075);
    leftCheek.rotation.set(0.1, -0.25, 0.15);
    headGroup.add(leftCheek);

    const rightCheek = new THREE.Mesh(cheekGeo, skinHighlightMat);
    rightCheek.position.set(0.082, -0.012, 0.075);
    rightCheek.rotation.set(0.1, 0.25, -0.15);
    headGroup.add(rightCheek);

    // Symmetrical ears with inner shadow detail
    const earGeo = new THREE.CylinderGeometry(0.038, 0.030, 0.016, 12);
    const earInnerGeo = new THREE.CylinderGeometry(0.024, 0.018, 0.017, 12);

    const leftEar = new THREE.Mesh(earGeo, skinMat);
    leftEar.position.set(-0.142, 0.008, -0.015);
    leftEar.rotation.set(0.10, -0.22, 0.15);
    const leftEarInner = new THREE.Mesh(earInnerGeo, skinShadowMat);
    leftEar.add(leftEarInner);
    headGroup.add(leftEar);

    const rightEar = new THREE.Mesh(earGeo, skinMat);
    rightEar.position.set(0.142, 0.008, -0.015);
    rightEar.rotation.set(0.10, 0.22, -0.15);
    const rightEarInner = new THREE.Mesh(earInnerGeo, skinShadowMat);
    rightEar.add(rightEarInner);
    headGroup.add(rightEar);

    // ------------------------------------------------------------------------
    // Handsome Anime Facial Features (Eyes, Eyebrows, Nose, Mouth)
    // ------------------------------------------------------------------------
    // Dark expressive eyebrows (slightly arched, handsome masculine tilt)
    const eyebrowGeo = new THREE.BoxGeometry(0.056, 0.010, 0.020);
    const leftEyebrow = new THREE.Mesh(eyebrowGeo, eyebrowMat);
    leftEyebrow.position.set(-0.052, 0.050, 0.143);
    leftEyebrow.rotation.set(-0.05, 0.08, 0.08);
    headGroup.add(leftEyebrow);

    const rightEyebrow = new THREE.Mesh(eyebrowGeo, eyebrowMat);
    rightEyebrow.position.set(0.052, 0.050, 0.143);
    rightEyebrow.rotation.set(-0.05, -0.08, -0.08);
    headGroup.add(rightEyebrow);

    // Eyes: Almond-shaped anime eyes with dark-brown irises & lively catchlights
    const eyeScleraGeo = new THREE.SphereGeometry(0.027, 16, 12);
    const eyeIrisGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.008, 16);
    const eyePupilGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.009, 12);
    const eyeGleamGeo = new THREE.SphereGeometry(0.0045, 8, 8);
    const eyeGleamSmallGeo = new THREE.SphereGeometry(0.0025, 8, 8);
    const eyelidGeo = new THREE.BoxGeometry(0.048, 0.007, 0.018);

    // Left Eye
    const leftEyeGroup = new THREE.Group();
    leftEyeGroup.position.set(-0.052, 0.012, 0.141);

    const leftSclera = new THREE.Mesh(eyeScleraGeo, eyeWhiteMat);
    leftSclera.scale.set(1.25, 0.82, 0.45);
    leftEyeGroup.add(leftSclera);

    const leftLid = new THREE.Mesh(eyelidGeo, eyelidMat);
    leftLid.position.set(0, 0.013, 0.010);
    leftLid.rotation.set(-0.1, 0, 0.05);
    leftEyeGroup.add(leftLid);

    const leftIris = new THREE.Mesh(eyeIrisGeo, eyeIrisMat);
    leftIris.position.set(0.002, -0.001, 0.013);
    leftIris.rotation.x = Math.PI / 2;
    leftEyeGroup.add(leftIris);

    const leftPupil = new THREE.Mesh(eyePupilGeo, eyePupilMat);
    leftPupil.position.set(0.002, -0.001, 0.015);
    leftPupil.rotation.x = Math.PI / 2;
    leftEyeGroup.add(leftPupil);

    const leftGleam = new THREE.Mesh(eyeGleamGeo, eyeCatchlightMat);
    leftGleam.position.set(0.007, 0.005, 0.018);
    leftEyeGroup.add(leftGleam);

    const leftGleamSmall = new THREE.Mesh(eyeGleamSmallGeo, eyeCatchlightMat);
    leftGleamSmall.position.set(-0.004, -0.004, 0.017);
    leftEyeGroup.add(leftGleamSmall);

    headGroup.add(leftEyeGroup);

    // Right Eye
    const rightEyeGroup = new THREE.Group();
    rightEyeGroup.position.set(0.052, 0.012, 0.141);

    const rightSclera = new THREE.Mesh(eyeScleraGeo, eyeWhiteMat);
    rightSclera.scale.set(1.25, 0.82, 0.45);
    rightEyeGroup.add(rightSclera);

    const rightLid = new THREE.Mesh(eyelidGeo, eyelidMat);
    rightLid.position.set(0, 0.013, 0.010);
    rightLid.rotation.set(-0.1, 0, -0.05);
    rightEyeGroup.add(rightLid);

    const rightIris = new THREE.Mesh(eyeIrisGeo, eyeIrisMat);
    rightIris.position.set(-0.002, -0.001, 0.013);
    rightIris.rotation.x = Math.PI / 2;
    rightEyeGroup.add(rightIris);

    const rightPupil = new THREE.Mesh(eyePupilGeo, eyePupilMat);
    rightPupil.position.set(-0.002, -0.001, 0.015);
    rightPupil.rotation.x = Math.PI / 2;
    rightEyeGroup.add(rightPupil);

    const rightGleam = new THREE.Mesh(eyeGleamGeo, eyeCatchlightMat);
    rightGleam.position.set(0.007, 0.005, 0.018);
    rightEyeGroup.add(rightGleam);

    const rightGleamSmall = new THREE.Mesh(eyeGleamSmallGeo, eyeCatchlightMat);
    rightGleamSmall.position.set(-0.004, -0.004, 0.017);
    rightEyeGroup.add(rightGleamSmall);

    headGroup.add(rightEyeGroup);

    // Sleek anime nose shape
    const noseBridgeGeo = new THREE.BoxGeometry(0.017, 0.048, 0.026);
    const noseBridge = new THREE.Mesh(noseBridgeGeo, skinMat);
    noseBridge.position.set(0, -0.012, 0.148);
    noseBridge.rotation.x = 0.2;
    headGroup.add(noseBridge);

    const noseTipGeo = new THREE.SphereGeometry(0.015, 10, 10);
    const noseTip = new THREE.Mesh(noseTipGeo, skinHighlightMat);
    noseTip.position.set(0, -0.034, 0.158);
    headGroup.add(noseTip);

    // Approachable, calm neutral smile contour
    const upperLipGeo = new THREE.BoxGeometry(0.046, 0.006, 0.014);
    const upperLip = new THREE.Mesh(upperLipGeo, lipMat);
    upperLip.position.set(0, -0.074, 0.138);
    headGroup.add(upperLip);

    const lowerLipGeo = new THREE.BoxGeometry(0.036, 0.007, 0.013);
    const lowerLip = new THREE.Mesh(lowerLipGeo, lipMat);
    lowerLip.position.set(0, -0.082, 0.137);
    headGroup.add(lowerLip);

    // ------------------------------------------------------------------------
    // Modern Handsome Hairstyle (Complete 360° Coverage, Zero Scalp Gaps)
    // ------------------------------------------------------------------------
    const hairGroup = new THREE.Group();

    // 1. Main Cranium Hair Cap (Full Top, Crown, Back, and Upper Side Coverage)
    const hairCapGeo = new THREE.SphereGeometry(0.152, 24, 20);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.022, -0.015);
    hairCap.scale.set(0.97, 1.03, 1.01);
    hairGroup.add(hairCap);

    // 2. Full Back & Nape Coverage (Seamless from crown down to collar)
    const backSkullGeo = new THREE.BoxGeometry(0.24, 0.18, 0.11);
    const backSkull = new THREE.Mesh(backSkullGeo, hairMat);
    backSkull.position.set(0, 0.012, -0.102);
    hairGroup.add(backSkull);

    const napeGeo = new THREE.BoxGeometry(0.19, 0.14, 0.09);
    const nape = new THREE.Mesh(napeGeo, hairMat);
    nape.position.set(0, -0.065, -0.082);
    hairGroup.add(nape);

    // 3. Left Side Coverage (Temple, upper side, behind-ear, and sideburn)
    const sideUpperGeo = new THREE.BoxGeometry(0.042, 0.14, 0.16);
    const leftSideUpper = new THREE.Mesh(sideUpperGeo, hairMat);
    leftSideUpper.position.set(-0.134, 0.035, -0.005);
    leftSideUpper.rotation.y = -0.12;
    hairGroup.add(leftSideUpper);

    const sideRearGeo = new THREE.BoxGeometry(0.038, 0.13, 0.12);
    const leftSideRear = new THREE.Mesh(sideRearGeo, hairMat);
    leftSideRear.position.set(-0.126, -0.022, -0.060);
    hairGroup.add(leftSideRear);

    const sideburnGeo = new THREE.BoxGeometry(0.026, 0.11, 0.055);
    const leftSideburn = new THREE.Mesh(sideburnGeo, hairMat);
    leftSideburn.position.set(-0.138, -0.010, 0.020);
    leftSideburn.rotation.y = -0.15;
    hairGroup.add(leftSideburn);

    // 4. Right Side Coverage (Temple, upper side, behind-ear, and sideburn)
    const rightSideUpper = new THREE.Mesh(sideUpperGeo, hairMat);
    rightSideUpper.position.set(0.134, 0.035, -0.005);
    rightSideUpper.rotation.y = 0.12;
    hairGroup.add(rightSideUpper);

    const rightSideRear = new THREE.Mesh(sideRearGeo, hairMat);
    rightSideRear.position.set(0.126, -0.022, -0.060);
    hairGroup.add(rightSideRear);

    const rightSideburn = new THREE.Mesh(sideburnGeo, hairMat);
    rightSideburn.position.set(0.138, -0.010, 0.020);
    rightSideburn.rotation.y = 0.15;
    hairGroup.add(rightSideburn);

    // 5. Crown Volume & Structured Top Cushion
    const crownCushionGeo = new THREE.BoxGeometry(0.22, 0.07, 0.20);
    const crownCushion = new THREE.Mesh(crownCushionGeo, hairMat);
    crownCushion.position.set(0, 0.148, -0.010);
    hairGroup.add(crownCushion);

    // Multi-directional textured layered tufts on crown
    const crownTuftGeo1 = new THREE.ConeGeometry(0.060, 0.09, 5);
    const crownTuft1 = new THREE.Mesh(crownTuftGeo1, hairHighlightMat);
    crownTuft1.position.set(-0.015, 0.165, -0.005);
    crownTuft1.rotation.set(-0.25, 0.10, -0.12);
    hairGroup.add(crownTuft1);

    const crownTuftGeo2 = new THREE.ConeGeometry(0.052, 0.08, 5);
    const crownTuft2 = new THREE.Mesh(crownTuftGeo2, hairMat);
    crownTuft2.position.set(0.055, 0.158, 0.012);
    crownTuft2.rotation.set(-0.20, -0.18, 0.18);
    hairGroup.add(crownTuft2);

    const crownTuft3 = new THREE.Mesh(crownTuftGeo2, hairMat);
    crownTuft3.position.set(-0.065, 0.155, 0.010);
    crownTuft3.rotation.set(-0.22, 0.15, -0.22);
    hairGroup.add(crownTuft3);

    const crownTuft4 = new THREE.Mesh(crownTuftGeo2, hairMat);
    crownTuft4.position.set(0.010, 0.155, -0.055);
    crownTuft4.rotation.set(0.25, 0.05, 0.08);
    hairGroup.add(crownTuft4);

    // 6. Clean Forehead Hairline Arch & Side-Part Bangs (Above Eyebrows)
    const hairlineArchGeo = new THREE.BoxGeometry(0.18, 0.035, 0.055);
    const hairlineArch = new THREE.Mesh(hairlineArchGeo, hairMat);
    hairlineArch.position.set(0, 0.095, 0.102);
    hairGroup.add(hairlineArch);

    const bangGeo1 = new THREE.ConeGeometry(0.038, 0.085, 4);
    const bang1 = new THREE.Mesh(bangGeo1, hairMat);
    bang1.position.set(-0.048, 0.115, 0.125);
    bang1.rotation.set(-0.52, 0.15, -0.32);
    hairGroup.add(bang1);

    const bangGeo2 = new THREE.ConeGeometry(0.036, 0.078, 4);
    const bang2 = new THREE.Mesh(bangGeo2, hairHighlightMat);
    bang2.position.set(0.008, 0.120, 0.128);
    bang2.rotation.set(-0.48, -0.10, -0.12);
    hairGroup.add(bang2);

    const bangGeo3 = new THREE.ConeGeometry(0.040, 0.085, 4);
    const bang3 = new THREE.Mesh(bangGeo3, hairMat);
    bang3.position.set(0.062, 0.112, 0.122);
    bang3.rotation.set(-0.50, -0.22, 0.38);
    hairGroup.add(bang3);

    const templeTuftGeo = new THREE.ConeGeometry(0.032, 0.070, 4);
    const templeTuft = new THREE.Mesh(templeTuftGeo, hairMat);
    templeTuft.position.set(-0.095, 0.088, 0.105);
    templeTuft.rotation.set(-0.40, 0.25, -0.45);
    hairGroup.add(templeTuft);

    headGroup.add(hairGroup);

    playerGroup.add(headGroup);
    this.limbs.head = headGroup;

    // ========================================================================
    // 4. LEGS & SNEAKERS (Articulated Hip & Knee Joint Hierarchy)
    // ========================================================================
    const thighGeo = new THREE.BoxGeometry(0.15, 0.38, 0.17);
    const shinGeo = new THREE.BoxGeometry(0.14, 0.38, 0.16);
    const trouserCuffGeo = new THREE.BoxGeometry(0.148, 0.035, 0.168);
    const shoeUpperGeo = new THREE.BoxGeometry(0.162, 0.105, 0.27);
    const shoeTrimGeo = new THREE.BoxGeometry(0.168, 0.040, 0.14);
    const shoeCollarGeo = new THREE.BoxGeometry(0.148, 0.040, 0.12);
    const midsoleGeo = new THREE.BoxGeometry(0.172, 0.030, 0.285);
    const outsoleGeo = new THREE.BoxGeometry(0.176, 0.020, 0.290);

    // Left Leg
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.14, 0.80, 0);

    const leftThighMesh = new THREE.Mesh(thighGeo, pantsMat);
    leftThighMesh.position.y = -0.19;
    leftLegPivot.add(leftThighMesh);

    const leftKneePivot = new THREE.Group();
    leftKneePivot.position.set(0, -0.38, 0);

    const leftShinMesh = new THREE.Mesh(shinGeo, pantsMat);
    leftShinMesh.position.y = -0.19;
    leftKneePivot.add(leftShinMesh);

    const leftTrouserCuff = new THREE.Mesh(trouserCuffGeo, pantsMat);
    leftTrouserCuff.position.set(0, -0.34, 0);
    leftKneePivot.add(leftTrouserCuff);

    // Left Sneaker
    const leftShoeUpper = new THREE.Mesh(shoeUpperGeo, shoeUpperMat);
    leftShoeUpper.position.set(0, -0.365, 0.04);
    leftKneePivot.add(leftShoeUpper);

    const leftShoeTrim = new THREE.Mesh(shoeTrimGeo, shoeTrimMat);
    leftShoeTrim.position.set(0, -0.365, 0.04);
    leftKneePivot.add(leftShoeTrim);

    const leftShoeCollar = new THREE.Mesh(shoeCollarGeo, shoeTrimMat);
    leftShoeCollar.position.set(0, -0.31, 0.01);
    leftKneePivot.add(leftShoeCollar);

    const leftMidsole = new THREE.Mesh(midsoleGeo, shoeUpperMat);
    leftMidsole.position.set(0, -0.405, 0.04);
    leftKneePivot.add(leftMidsole);

    const leftOutsole = new THREE.Mesh(outsoleGeo, soleMat);
    leftOutsole.position.set(0, -0.425, 0.04);
    leftKneePivot.add(leftOutsole);

    leftLegPivot.add(leftKneePivot);
    playerGroup.add(leftLegPivot);
    this.limbs.leftLeg = leftLegPivot;
    this.limbs.leftKnee = leftKneePivot;

    // Right Leg
    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.14, 0.80, 0);

    const rightThighMesh = new THREE.Mesh(thighGeo, pantsMat);
    rightThighMesh.position.y = -0.19;
    rightLegPivot.add(rightThighMesh);

    const rightKneePivot = new THREE.Group();
    rightKneePivot.position.set(0, -0.38, 0);

    const rightShinMesh = new THREE.Mesh(shinGeo, pantsMat);
    rightShinMesh.position.y = -0.19;
    rightKneePivot.add(rightShinMesh);

    const rightTrouserCuff = new THREE.Mesh(trouserCuffGeo, pantsMat);
    rightTrouserCuff.position.set(0, -0.34, 0);
    rightKneePivot.add(rightTrouserCuff);

    // Right Sneaker
    const rightShoeUpper = new THREE.Mesh(shoeUpperGeo, shoeUpperMat);
    rightShoeUpper.position.set(0, -0.365, 0.04);
    rightKneePivot.add(rightShoeUpper);

    const rightShoeTrim = new THREE.Mesh(shoeTrimGeo, shoeTrimMat);
    rightShoeTrim.position.set(0, -0.365, 0.04);
    rightKneePivot.add(rightShoeTrim);

    const rightShoeCollar = new THREE.Mesh(shoeCollarGeo, shoeTrimMat);
    rightShoeCollar.position.set(0, -0.31, 0.01);
    rightKneePivot.add(rightShoeCollar);

    const rightMidsole = new THREE.Mesh(midsoleGeo, shoeUpperMat);
    rightMidsole.position.set(0, -0.405, 0.04);
    rightKneePivot.add(rightMidsole);

    const rightOutsole = new THREE.Mesh(outsoleGeo, soleMat);
    rightOutsole.position.set(0, -0.425, 0.04);
    rightKneePivot.add(rightOutsole);

    rightLegPivot.add(rightKneePivot);
    playerGroup.add(rightLegPivot);
    this.limbs.rightLeg = rightLegPivot;
    this.limbs.rightKnee = rightKneePivot;

    // ========================================================================
    // 5. ARMS, CUFFS & HANDS (Articulated Shoulder Joint Hierarchy)
    // ========================================================================
    const upperArmGeo = new THREE.BoxGeometry(0.13, 0.32, 0.14);
    const forearmGeo = new THREE.BoxGeometry(0.12, 0.24, 0.13);
    const cuffGeo = new THREE.BoxGeometry(0.13, 0.045, 0.14);
    const palmGeo = new THREE.BoxGeometry(0.08, 0.09, 0.085);
    const thumbGeo = new THREE.BoxGeometry(0.03, 0.04, 0.035);

    // Left Arm
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.32, 1.40, 0);

    const leftUpperArm = new THREE.Mesh(upperArmGeo, jacketMat);
    leftUpperArm.position.y = -0.16;
    leftArmPivot.add(leftUpperArm);

    const leftForearm = new THREE.Mesh(forearmGeo, jacketMat);
    leftForearm.position.y = -0.38;
    leftArmPivot.add(leftForearm);

    const leftCuff = new THREE.Mesh(cuffGeo, jacketAccentMat);
    leftCuff.position.y = -0.50;
    leftArmPivot.add(leftCuff);

    const leftPalm = new THREE.Mesh(palmGeo, skinMat);
    leftPalm.position.set(0, -0.565, 0.008);
    leftArmPivot.add(leftPalm);

    const leftThumb = new THREE.Mesh(thumbGeo, skinMat);
    leftThumb.position.set(0.035, -0.55, 0.022);
    leftThumb.rotation.set(0.2, 0, -0.3);
    leftArmPivot.add(leftThumb);

    playerGroup.add(leftArmPivot);
    this.limbs.leftArm = leftArmPivot;

    // Right Arm
    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.32, 1.40, 0);

    const rightUpperArm = new THREE.Mesh(upperArmGeo, jacketMat);
    rightUpperArm.position.y = -0.16;
    rightArmPivot.add(rightUpperArm);

    const rightForearm = new THREE.Mesh(forearmGeo, jacketMat);
    rightForearm.position.y = -0.38;
    rightArmPivot.add(rightForearm);

    const rightCuff = new THREE.Mesh(cuffGeo, jacketAccentMat);
    rightCuff.position.y = -0.50;
    rightArmPivot.add(rightCuff);

    const rightPalm = new THREE.Mesh(palmGeo, skinMat);
    rightPalm.position.set(0, -0.565, 0.008);
    rightArmPivot.add(rightPalm);

    const rightThumb = new THREE.Mesh(thumbGeo, skinMat);
    rightThumb.position.set(-0.035, -0.55, 0.022);
    rightThumb.rotation.set(0.2, 0, 0.3);
    rightArmPivot.add(rightThumb);

    playerGroup.add(rightArmPivot);
    this.limbs.rightArm = rightArmPivot;

    // Enable shadows on all character meshes
    playerGroup.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

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

    // Bypass walking simulation when driving Mayank's car
    if (this.isInVehicle) {
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

    // Dynamic Authoritative Terrain Grounding
    this.groundY = getTerrainHeight(this.position.x, this.position.z);

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
    } else {
      // Firmly adhere grounded player to terrain height
      this.position.y = this.groundY;
      if (this.landingTimer > 0) {
        this.landingTimer -= delta;
        if (this.landingTimer <= 0) {
          this.landingTimer = 0;
        }
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

    // 4. Apply Horizontal Position with Collision-Aware Resolution Pipeline
    this.moveStep.copy(this.velocity).multiplyScalar(delta);

    if (this.moveStep.lengthSq() > 0.000001 && !this.isSitting) {
      if (this.worldSystem && typeof this.worldSystem.resolvePlayerMovement === 'function') {
        this.worldSystem.resolvePlayerMovement(
          this.position,
          this.moveStep,
          this.colliderRadius,
          this.position.y,
          this.colliderHeight,
          this.stepHeight
        );
      } else {
        this.position.add(this.moveStep);
      }

      // Numerical sanity bounds for open-world exploration (no artificial district clamps)
      this.position.x = THREE.MathUtils.clamp(this.position.x, -50000, 50000);
      this.position.z = THREE.MathUtils.clamp(this.position.z, -50000, 50000);

      // Soft dynamic cylinder collision against NPCs & Mochi (Prevents direct body overlap)
      if (this.npcSystem && Array.isArray(this.npcSystem.npcs)) {
        for (let i = 0; i < this.npcSystem.npcs.length; i++) {
          const npc = this.npcSystem.npcs[i];
          if (!npc || !npc.group) continue;
          const npcPos = npc.group.position;
          const npcRadius = npc.type === 'cat' ? 0.30 : 0.40;
          const minDist = this.colliderRadius + npcRadius;
          const dx = this.position.x - npcPos.x;
          const dz = this.position.z - npcPos.z;
          const distSq = dx * dx + dz * dz;

          if (distSq < minDist * minDist) {
            const dist = Math.sqrt(distSq);
            if (dist > 0.001) {
              const overlap = minDist - dist;
              this.position.x += (dx / dist) * overlap;
              this.position.z += (dz / dist) * overlap;
            } else {
              this.position.z += minDist;
            }
          }
        }
      }
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

  getStateForSave() {
    return {
      position: {
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
      },
      headingAngle: this.headingAngle,
      movementState: this.movementState,
    };
  }

  restoreState(data) {
    if (!data || !data.position) return;
    const px = typeof data.position.x === 'number' && !isNaN(data.position.x) ? data.position.x : this.spawnPosition.x;
    const py = typeof data.position.y === 'number' && !isNaN(data.position.y) ? data.position.y : 0;
    const pz = typeof data.position.z === 'number' && !isNaN(data.position.z) ? data.position.z : this.spawnPosition.z;

    this.position.set(px, py, pz);
    if (this.mesh) {
      this.mesh.position.copy(this.position);
    }

    if (typeof data.headingAngle === 'number' && !isNaN(data.headingAngle)) {
      this.headingAngle = data.headingAngle;
      this.targetHeadingAngle = data.headingAngle;
      if (this.mesh) {
        this.mesh.rotation.y = this.headingAngle;
      }
    }

    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.isGrounded = true;

    globalBus.emit('player:moved', {
      position: this.position.clone(),
      headingAngle: this.headingAngle,
      isMoving: false,
      isJogging: false,
      movementState: 'IDLE',
    });
  }

  resetToSpawn() {
    this.position.copy(this.spawnPosition);
    if (this.mesh) {
      this.mesh.position.copy(this.position);
    }
    this.headingAngle = 0;
    this.targetHeadingAngle = 0;
    if (this.mesh) {
      this.mesh.rotation.y = 0;
    }
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.movementState = 'IDLE';

    globalBus.emit('player:spawned', {
      position: this.position.clone(),
      headingAngle: 0,
    });
  }
}

