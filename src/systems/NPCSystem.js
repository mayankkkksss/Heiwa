import * as THREE from 'three';
import { globalBus } from '../engine/EventBus.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';
import { WaypointNetwork } from './WaypointNetwork.js';

// Pre-allocated reusable vectors for high-performance updates
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _steerOffset = new THREE.Vector3();

export const NPCState = {
  IDLE: 'IDLE',
  WALKING: 'WALKING',
  ARRIVING: 'ARRIVING',
  ACTIVITY: 'ACTIVITY',
  SITTING: 'SITTING',
  LOOKING: 'LOOKING',
  GREETING: 'GREETING',
  RETURNING_HOME: 'RETURNING_HOME',
};

export const ActivityType = {
  GARDEN: 'GARDEN',
  SHOP: 'SHOP',
  CHECKOUT: 'CHECKOUT',
  INSPECT: 'INSPECT',
  SIT: 'SIT',
  LOOK_AROUND: 'LOOK_AROUND',
  PHOTOGRAPH: 'PHOTOGRAPH',
  VENDING_STOP: 'VENDING_STOP',
  DELIVERY: 'DELIVERY',
  REST: 'REST',
  WAIT: 'WAIT',
};

/**
 * NPCSystem - Manages realistic daily routines, state machines, waypoint navigation,
 * social awareness, and interactions for Sakuragaoka District residents.
 */
export class NPCSystem {
  constructor() {
    this.scene = null;
    this.npcs = [];
    this.playerPos = new THREE.Vector3();
    this.waypointNetwork = new WaypointNetwork();
    this.currentHours = 9.0;
  }

  init(engine) {
    this.engine = engine;
    this.scene = engine.scene;

    globalBus.on('player:moved', (data) => {
      this.playerPos.copy(data.position);
    });

    globalBus.on('time:updated', (data) => {
      this.currentHours = data.hours;
      this.evaluateSchedules();
    });

    this.spawnDistrictNPCs();
  }

  evaluateSchedules() {
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      if (npc.type !== 'human') continue;
      this.updateNPCScheduleBlock(npc);
    }
  }

  getScheduleBlock() {
    const h = this.currentHours;
    if (h >= 6.0 && h < 12.0) return 'MORNING';
    if (h >= 12.0 && h < 16.0) return 'MIDDAY';
    if (h >= 16.0 && h < 19.0) return 'AFTERNOON';
    return 'EVENING';
  }

  updateNPCScheduleBlock(npc) {
    const currentBlock = this.getScheduleBlock();
    if (npc.scheduleBlock === currentBlock) return;

    npc.scheduleBlock = currentBlock;
    const schedule = npc.config.schedules[currentBlock];
    if (!schedule) return;

    // Pick a destination from the schedule block
    const destList = schedule.destinations;
    const nextDestId = destList[Math.floor(Math.random() * destList.length)];
    this.assignNPCDestination(npc, nextDestId, schedule.activity);
  }

  assignNPCDestination(npc, targetWaypointId, preferredActivity = ActivityType.REST) {
    const targetNode = this.waypointNetwork.getNode(targetWaypointId);
    if (!targetNode) return;

    const path = this.waypointNetwork.findPath(npc.group.position, targetWaypointId);
    if (!path || path.length === 0) return;

    npc.currentPath = path;
    npc.pathIndex = 0;
    npc.targetWaypointId = targetWaypointId;
    npc.targetActivity = targetNode.activity !== 'WALK' ? targetNode.activity : preferredActivity;
    npc.state = NPCState.WALKING;
  }

  spawnDistrictNPCs() {
    // ------------------------------------------------------------------------
    // 1. MRS. TANAKA - Elderly neighborhood resident & gardener
    // ------------------------------------------------------------------------
    this.createHumanNPC({
      id: 'npc_tanaka',
      name: 'Mrs. Tanaka',
      avatar: '👵',
      homeNode: 'tanaka_porch',
      position: new THREE.Vector3(-20.5, 0.2, -41.0),
      speed: 1.0,
      scale: 0.94,
      colors: { skin: 0xf5d0b5, hair: 0xd1d5db, top: 0x059669, pants: 0x475569 },
      schedules: {
        MORNING: { destinations: ['park_flowerbed', 'park_path_e'], activity: ActivityType.GARDEN },
        MIDDAY: { destinations: ['park_bench_1', 'park_fountain'], activity: ActivityType.SIT },
        AFTERNOON: { destinations: ['mart_aisle_1', 'tanaka_porch'], activity: ActivityType.SHOP },
        EVENING: { destinations: ['tanaka_porch'], activity: ActivityType.REST },
      },
      dialogues: [
        'Good morning, Mayank! Such lovely weather for gardening today.',
        'The morning air in Sakuragaoka is so refreshing today, isn’t it?',
        'Thank you for always being such a kind neighbor. Have a wonderful day!',
      ],
      questIdTrigger: 'meet_tanaka',
    });

    // ------------------------------------------------------------------------
    // 2. MOCHI - Friendly neighborhood calico cat
    // ------------------------------------------------------------------------
    this.createCatNPC({
      id: 'npc_cat',
      name: 'Mochi',
      avatar: '🐱',
      position: new THREE.Vector3(-26.5, 0.2, 10.0),
      roamNodes: ['park_grove_south', 'park_fountain', 'sakura_heights_canopy', 'park_bench_1'],
    });

    // ------------------------------------------------------------------------
    // 3. AOI - HIKARI MART Convenience Store Employee
    // ------------------------------------------------------------------------
    this.createHumanNPC({
      id: 'npc_aoi',
      name: 'Aoi (Store Clerk)',
      avatar: '🏪',
      homeNode: 'mart_register',
      position: new THREE.Vector3(25.5, 0.2, 44.5),
      speed: 1.15,
      scale: 0.96,
      colors: { skin: 0xfbd0b5, hair: 0x27272a, top: 0x0284c7, pants: 0x1e293b },
      schedules: {
        MORNING: { destinations: ['mart_register', 'mart_cooler'], activity: ActivityType.CHECKOUT },
        MIDDAY: { destinations: ['mart_aisle_1', 'mart_aisle_2'], activity: ActivityType.INSPECT },
        AFTERNOON: { destinations: ['mart_apron', 'mart_register'], activity: ActivityType.LOOK_AROUND },
        EVENING: { destinations: ['mart_register'], activity: ActivityType.CHECKOUT },
      },
      dialogues: [
        'Welcome! Welcome to HIKARI MART!',
        'The fresh onigiri and hot Boss Coffee just arrived this morning.',
        'Let me know if you need help finding anything, Mayank-san.',
      ],
      questIdTrigger: 'errand_drink',
    });

    // ------------------------------------------------------------------------
    // 4. KENJI - High school / university student
    // ------------------------------------------------------------------------
    this.createHumanNPC({
      id: 'npc_kenji',
      name: 'Kenji (Student)',
      avatar: '🎒',
      homeNode: 'res_se_lane',
      position: new THREE.Vector3(6.5, 0.2, 15.0),
      speed: 1.35,
      scale: 0.98,
      hasBag: true,
      colors: { skin: 0xf1c29b, hair: 0x18181b, top: 0x1e293b, pants: 0x334155 },
      schedules: {
        MORNING: { destinations: ['ms_e_60', 'ms_e_20'], activity: ActivityType.WAIT },
        MIDDAY: { destinations: ['park_playground_swings', 'vending_hub'], activity: ActivityType.LOOK_AROUND },
        AFTERNOON: { destinations: ['vending_hub', 'mart_aisle_2'], activity: ActivityType.VENDING_STOP },
        EVENING: { destinations: ['res_se_lane'], activity: ActivityType.REST },
      },
      dialogues: [
        'Good morning, Mayank-san! Heading to morning classes.',
        'I love how calm this street is before the afternoon rush.',
      ],
    });

    // ------------------------------------------------------------------------
    // 5. MR. SATO - Diligent office worker / salaryman
    // ------------------------------------------------------------------------
    this.createHumanNPC({
      id: 'npc_sato',
      name: 'Mr. Sato (Salaryman)',
      avatar: '💼',
      homeNode: 'res_sw_lane',
      position: new THREE.Vector3(-6.5, 0.2, -15.0),
      speed: 1.4,
      scale: 1.0,
      colors: { skin: 0xf5d0b5, hair: 0x27272a, top: 0x1e3a8a, pants: 0x1e293b },
      schedules: {
        MORNING: { destinations: ['ms_w_80', 'cw_40_e'], activity: ActivityType.WAIT },
        MIDDAY: { destinations: ['vending_hub', 'ms_e_20'], activity: ActivityType.VENDING_STOP },
        AFTERNOON: { destinations: ['ms_w_n20', 'ms_w_n40'], activity: ActivityType.WAIT },
        EVENING: { destinations: ['res_sw_lane'], activity: ActivityType.REST },
      },
      dialogues: [
        'Good morning, Mayank. Beautiful weather for a morning commute.',
        'A cup of hot coffee from the vending machine always helps start the day right.',
      ],
    });

    // ------------------------------------------------------------------------
    // 6. YUKA - Neighborhood mother enjoying peaceful morning strolls
    // ------------------------------------------------------------------------
    this.createHumanNPC({
      id: 'npc_yuka',
      name: 'Yuka',
      avatar: '🌸',
      homeNode: 'res_nw_lane',
      position: new THREE.Vector3(-14.5, 0.2, 6.0),
      speed: 1.1,
      scale: 0.96,
      colors: { skin: 0xfed7aa, hair: 0x713f12, top: 0xf472b6, pants: 0xfef08a },
      schedules: {
        MORNING: { destinations: ['park_path_e', 'park_flowerbed'], activity: ActivityType.LOOK_AROUND },
        MIDDAY: { destinations: ['park_bench_2', 'park_playground_slide'], activity: ActivityType.SIT },
        AFTERNOON: { destinations: ['mart_aisle_1', 'vending_hub'], activity: ActivityType.SHOP },
        EVENING: { destinations: ['res_nw_lane'], activity: ActivityType.REST },
      },
      dialogues: [
        'Hello Mayank-kun! Isn’t the cherry blossom bloom lovely today?',
        'The children love the new yellow swings at the park.',
      ],
    });

    // ------------------------------------------------------------------------
    // 7. HIROSHI - Friendly cyclist and neighborhood resident
    // ------------------------------------------------------------------------
    this.createHumanNPC({
      id: 'npc_hiroshi',
      name: 'Hiroshi (Cyclist)',
      avatar: '🚴',
      homeNode: 'shop_st_mid',
      position: new THREE.Vector3(14.0, 0.2, 41.0),
      speed: 1.3,
      scale: 1.03,
      colors: { skin: 0xfbcfe8, hair: 0x18181b, top: 0xeab308, pants: 0x1e293b },
      schedules: {
        MORNING: { destinations: ['vending_hub', 'shop_st_w'], activity: ActivityType.VENDING_STOP },
        MIDDAY: { destinations: ['ms_e_20', 'cw_5_w'], activity: ActivityType.LOOK_AROUND },
        AFTERNOON: { destinations: ['sakura_heights_bike', 'shop_st_mid'], activity: ActivityType.INSPECT },
        EVENING: { destinations: ['shop_st_mid'], activity: ActivityType.REST },
      },
      dialogues: [
        'Hey Mayank! Just stopped by the vending machine to grab some barley tea.',
        'This neighborhood has the best smooth cycling paths around Tokyo.',
      ],
    });

    // ------------------------------------------------------------------------
    // 8. MR. TAKAHASHI - Elder community resident
    // ------------------------------------------------------------------------
    this.createHumanNPC({
      id: 'npc_takahashi',
      name: 'Mr. Takahashi',
      avatar: '👴',
      homeNode: 'res_lane_mid',
      position: new THREE.Vector3(-24.5, 0.2, 8.0),
      speed: 0.75,
      scale: 0.93,
      colors: { skin: 0xf5d0b5, hair: 0xe5e7eb, top: 0x78716c, pants: 0x44403c },
      schedules: {
        MORNING: { destinations: ['park_bench_1', 'park_fountain'], activity: ActivityType.SIT },
        MIDDAY: { destinations: ['park_bench_2', 'park_grove_north'], activity: ActivityType.SIT },
        AFTERNOON: { destinations: ['park_path_e', 'tanaka_porch'], activity: ActivityType.LOOK_AROUND },
        EVENING: { destinations: ['res_lane_mid'], activity: ActivityType.REST },
      },
      dialogues: [
        'Ah, Mayank-san. Peace and quiet... that is the true wealth of life.',
        'I have lived in Sakuragaoka for fifty years, and the spring breeze never gets old.',
      ],
    });

    // ------------------------------------------------------------------------
    // 9. SAKURA - Scenic photographer capturing seasonal blossoms
    // ------------------------------------------------------------------------
    this.createHumanNPC({
      id: 'npc_sakura',
      name: 'Sakura (Photographer)',
      avatar: '📷',
      homeNode: 'res_se_lane',
      position: new THREE.Vector3(-30.0, 0.2, 18.0),
      speed: 1.15,
      scale: 0.95,
      colors: { skin: 0xfed7aa, hair: 0x451a03, top: 0x8b5cf6, pants: 0x334155 },
      schedules: {
        MORNING: { destinations: ['park_grove_north', 'park_grove_south'], activity: ActivityType.PHOTOGRAPH },
        MIDDAY: { destinations: ['ms_w_20', 'park_flowerbed'], activity: ActivityType.PHOTOGRAPH },
        AFTERNOON: { destinations: ['park_bench_1', 'park_ent'], activity: ActivityType.PHOTOGRAPH },
        EVENING: { destinations: ['res_se_lane'], activity: ActivityType.REST },
      },
      dialogues: [
        'The morning light filtering through the sakura petals is magnificent!',
        'Every corner of this neighborhood tells a peaceful story.',
      ],
    });

    // ------------------------------------------------------------------------
    // 10. DAISUKE - Friendly local parcel courier
    // ------------------------------------------------------------------------
    this.createHumanNPC({
      id: 'npc_daisuke',
      name: 'Daisuke (Courier)',
      avatar: '📦',
      homeNode: 'res_sw_lane',
      position: new THREE.Vector3(-18.0, 0.2, -38.0),
      speed: 1.45,
      scale: 1.02,
      colors: { skin: 0xfbcfe8, hair: 0x18181b, top: 0x15803d, pants: 0x166534 },
      schedules: {
        MORNING: { destinations: ['sakura_heights_mail', 'res_lane_mid', 'mart_back_dock'], activity: ActivityType.DELIVERY },
        MIDDAY: { destinations: ['res_ne_lane', 'res_se_lane', 'garbage_station'], activity: ActivityType.DELIVERY },
        AFTERNOON: { destinations: ['res_nw_lane', 'sakura_heights_canopy'], activity: ActivityType.DELIVERY },
        EVENING: { destinations: ['res_sw_lane'], activity: ActivityType.REST },
      },
      dialogues: [
        'Good day, Mayank-san! Dropping off packages for Sakura Heights.',
        'Always good to see you smiling. Have a great morning!',
      ],
    });
  }

  createHumanNPC(config) {
    const group = new THREE.Group();
    group.position.copy(config.position);
    if (config.scale) {
      group.scale.setScalar(config.scale);
    }

    const skinMat = new THREE.MeshStandardMaterial({ color: config.colors.skin, roughness: 0.65 });
    const hairMat = new THREE.MeshStandardMaterial({ color: config.colors.hair, roughness: 0.5 });
    const topMat = new THREE.MeshStandardMaterial({ color: config.colors.top, roughness: 0.75 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: config.colors.pants, roughness: 0.8 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });

    // 1. Torso
    const torsoGeo = new THREE.BoxGeometry(0.44, 0.58, 0.26);
    const torso = new THREE.Mesh(torsoGeo, topMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    torso.receiveShadow = true;
    group.add(torso);

    // 2. Head & Hair
    const headGeo = new THREE.SphereGeometry(0.16, 16, 16);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.48;
    head.castShadow = true;
    group.add(head);

    const hairGeo = new THREE.DodecahedronGeometry(0.18, 1);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.set(0, 0.04, -0.02);
    head.add(hair);

    // 3. Articulated Limbs (Hip, Knee, and Shoulder Pivots)
    const thighGeo = new THREE.BoxGeometry(0.14, 0.35, 0.15);
    const shinGeo = new THREE.BoxGeometry(0.13, 0.35, 0.14);
    const shoeGeo = new THREE.BoxGeometry(0.15, 0.10, 0.23);
    const armGeo = new THREE.BoxGeometry(0.11, 0.50, 0.12);

    // Left Leg
    const leftHip = new THREE.Group();
    leftHip.position.set(-0.12, 0.76, 0);
    const leftThigh = new THREE.Mesh(thighGeo, pantsMat);
    leftThigh.position.y = -0.175;
    leftThigh.castShadow = true;
    leftHip.add(leftThigh);

    const leftKnee = new THREE.Group();
    leftKnee.position.set(0, -0.35, 0);
    const leftShin = new THREE.Mesh(shinGeo, pantsMat);
    leftShin.position.y = -0.175;
    leftShin.castShadow = true;
    leftKnee.add(leftShin);

    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.35, 0.03);
    leftShoe.castShadow = true;
    leftKnee.add(leftShoe);

    leftHip.add(leftKnee);
    group.add(leftHip);

    // Right Leg
    const rightHip = new THREE.Group();
    rightHip.position.set(0.12, 0.76, 0);
    const rightThigh = new THREE.Mesh(thighGeo, pantsMat);
    rightThigh.position.y = -0.175;
    rightThigh.castShadow = true;
    rightHip.add(rightThigh);

    const rightKnee = new THREE.Group();
    rightKnee.position.set(0, -0.35, 0);
    const rightShin = new THREE.Mesh(shinGeo, pantsMat);
    rightShin.position.y = -0.175;
    rightShin.castShadow = true;
    rightKnee.add(rightShin);

    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.35, 0.03);
    rightShoe.castShadow = true;
    rightKnee.add(rightShoe);

    rightHip.add(rightKnee);
    group.add(rightHip);

    // Left Arm (Shoulder Pivot)
    const leftShoulder = new THREE.Group();
    leftShoulder.position.set(-0.28, 1.26, 0);
    const leftArm = new THREE.Mesh(armGeo, topMat);
    leftArm.position.y = -0.24;
    leftArm.castShadow = true;
    leftShoulder.add(leftArm);
    group.add(leftShoulder);

    // Right Arm (Shoulder Pivot)
    const rightShoulder = new THREE.Group();
    rightShoulder.position.set(0.28, 1.26, 0);
    const rightArm = new THREE.Mesh(armGeo, topMat);
    rightArm.position.y = -0.24;
    rightArm.castShadow = true;
    rightShoulder.add(rightArm);
    group.add(rightShoulder);

    // Accessories
    let cameraMesh = null;
    let briefcaseMesh = null;

    if (config.id === 'npc_tanaka') {
      const visorGeo = new THREE.CylinderGeometry(0.26, 0.28, 0.06, 16);
      const visorMat = new THREE.MeshStandardMaterial({ color: 0xfef08a });
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 1.62, 0);
      group.add(visor);

      const apronGeo = new THREE.BoxGeometry(0.38, 0.45, 0.04);
      const apronMat = new THREE.MeshStandardMaterial({ color: 0xecfdf5 });
      const apron = new THREE.Mesh(apronGeo, apronMat);
      apron.position.set(0, 0.95, 0.14);
      group.add(apron);
    } else if (config.id === 'npc_aoi') {
      const apronGeo = new THREE.BoxGeometry(0.42, 0.5, 0.04);
      const apronMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4 });
      const apron = new THREE.Mesh(apronGeo, apronMat);
      apron.position.set(0, 1.0, 0.14);
      group.add(apron);

      const badgeGeo = new THREE.PlaneGeometry(0.08, 0.05);
      const badgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const badge = new THREE.Mesh(badgeGeo, badgeMat);
      badge.position.set(0.12, 1.15, 0.17);
      group.add(badge);
    } else if (config.id === 'npc_sato') {
      const tieGeo = new THREE.PlaneGeometry(0.06, 0.32);
      const tieMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
      const tie = new THREE.Mesh(tieGeo, tieMat);
      tie.position.set(0, 1.08, 0.14);
      group.add(tie);

      const caseGeo = new THREE.BoxGeometry(0.1, 0.3, 0.38);
      const caseMat = new THREE.MeshStandardMaterial({ color: 0x451a03 });
      briefcaseMesh = new THREE.Mesh(caseGeo, caseMat);
      briefcaseMesh.position.set(0, -0.28, 0);
      briefcaseMesh.castShadow = true;
      rightShoulder.add(briefcaseMesh);
    } else if (config.id === 'npc_sakura') {
      const camGeo = new THREE.BoxGeometry(0.18, 0.12, 0.1);
      const camMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
      cameraMesh = new THREE.Mesh(camGeo, camMat);
      cameraMesh.position.set(0, 1.02, 0.18);
      group.add(cameraMesh);

      const lensGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8);
      lensGeo.rotateX(Math.PI / 2);
      const lensMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
      const lens = new THREE.Mesh(lensGeo, lensMat);
      lens.position.set(0, 1.02, 0.24);
      group.add(lens);
    } else if (config.hasBag) {
      const bagGeo = new THREE.BoxGeometry(0.3, 0.36, 0.16);
      const bagMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
      const bag = new THREE.Mesh(bagGeo, bagMat);
      bag.position.set(0, 1.0, -0.18);
      bag.castShadow = true;
      group.add(bag);
    }

    const npcData = {
      group,
      type: 'human',
      config,
      state: NPCState.IDLE,
      scheduleBlock: null,
      currentActivity: ActivityType.REST,
      targetWaypointId: null,
      currentPath: [],
      pathIndex: 0,
      activityTimer: Math.random() * 8 + 4,
      greetingCooldown: 0,
      greetingTimer: 0,
      walkTime: Math.random() * 10,
      currentSpeed: 0,
      actualVelocity: 0,
      locomotionBlend: 0,
      limbs: {
        leftLeg: leftHip,
        leftKnee: leftKnee,
        rightLeg: rightHip,
        rightKnee: rightKnee,
        leftArm: leftShoulder,
        rightArm: rightShoulder,
        head,
        torso,
        cameraMesh,
        briefcaseMesh,
      },
      walkSpeed: config.speed || 1.2,
      baseY: config.position.y,
    };

    group.userData = {
      isInteractive: true,
      interactionType: 'npc',
      prompt: `Talk to ${config.name}`,
      name: config.name,
      avatar: config.avatar,
      dialogues: config.dialogues,
      dialogueIndex: 0,
      onInteract: () => {
        // Trigger greeting gesture towards Mayank
        this.triggerMayankGreeting(npcData);

        let dialog = config.dialogues[group.userData.dialogueIndex % config.dialogues.length];

        // Contextual dynamic dialogue based on activity
        if (npcData.currentActivity === ActivityType.GARDEN) {
          dialog = 'These flowers are doing so well this morning. Taking care of them brings true peace.';
        } else if (npcData.currentActivity === ActivityType.PHOTOGRAPH) {
          dialog = 'The lighting filtering through the cherry blossoms is exquisite today. Perfect for a photo!';
        } else if (npcData.currentActivity === ActivityType.CHECKOUT || npcData.currentActivity === ActivityType.SHOP) {
          dialog = 'We just restocked the fresh onigiri and chilled beverages. Let me know if you need help!';
        } else if (npcData.currentActivity === ActivityType.DELIVERY) {
          dialog = 'Quite a full delivery route this morning, but I always enjoy walking through Sakuragaoka.';
        } else if (npcData.currentActivity === ActivityType.VENDING_STOP) {
          dialog = 'Grabbing a quick refreshing drink from the machine. Nothing beats a cold tea on a morning walk.';
        } else if (npcData.currentActivity === ActivityType.SIT && config.id === 'npc_takahashi') {
          dialog = 'Sitting here listening to the birds... there is no rush in life, Mayank-san.';
        }

        group.userData.dialogueIndex++;

        globalBus.emit('dialogue:open', {
          speaker: config.name,
          avatar: config.avatar,
          text: dialog,
        });

        if (config.questIdTrigger) {
          globalBus.emit('quest:update', { questId: config.questIdTrigger, progress: 1.0 });
        }
      },
    };

    this.scene.add(group);
    this.npcs.push(npcData);
    this.updateNPCScheduleBlock(npcData);
  }

  createCatNPC(config) {
    const group = new THREE.Group();
    group.position.copy(config.position);

    const catMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.9 });
    const patchMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.9 });

    const bodyGeo = new THREE.SphereGeometry(0.22, 12, 12);
    bodyGeo.scale(1.2, 0.8, 1.4);
    const body = new THREE.Mesh(bodyGeo, catMat);
    body.position.y = 0.16;
    body.castShadow = true;
    group.add(body);

    const patchGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const patch = new THREE.Mesh(patchGeo, patchMat);
    patch.position.set(0.08, 0.24, 0.05);
    group.add(patch);

    const headGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const head = new THREE.Mesh(headGeo, catMat);
    head.position.set(0, 0.22, 0.22);
    head.castShadow = true;
    group.add(head);

    [-0.07, 0.07].forEach((x) => {
      const earGeo = new THREE.ConeGeometry(0.04, 0.08, 4);
      const ear = new THREE.Mesh(earGeo, patchMat);
      ear.position.set(x, 0.32, 0.2);
      ear.rotation.x = -0.2;
      group.add(ear);
    });

    const catData = {
      group,
      type: 'cat',
      config,
      state: NPCState.IDLE,
      activityTimer: Math.random() * 10 + 5,
      currentPath: [],
      pathIndex: 0,
      walkSpeed: 0.85,
    };

    group.userData = {
      isInteractive: true,
      interactionType: 'cat',
      prompt: `Gently Pet ${config.name}`,
      name: config.name,
      avatar: config.avatar,
      onInteract: () => {
        globalBus.emit('dialogue:open', {
          speaker: 'Mochi (Cat)',
          avatar: '🐾',
          text: '*Purrrr...* Mochi leans happily into your hand under the warm sakura blossoms.',
        });
        globalBus.emit('toast:show', { message: 'Gently petted Mochi the cat.' });
        globalBus.emit('quest:update', { questId: 'pet_cat', progress: 1.0 });
      },
    };

    this.scene.add(group);
    this.npcs.push(catData);
  }

  triggerMayankGreeting(npc) {
    if (npc.state === NPCState.SITTING) return;
    _vecA.subVectors(this.playerPos, npc.group.position);
    npc.group.rotation.y = Math.atan2(_vecA.x, _vecA.z);
    npc.state = NPCState.GREETING;
    npc.greetingTimer = 2.5;
  }

  getInteractiveObjects() {
    return this.npcs.map((n) => n.group);
  }

  update(delta, elapsedTime) {
    if (!globalGameState.is(GameState.PLAYING)) return;

    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];

      // Distance LOD check
      const distSq = npc.group.position.distanceToSquared(this.playerPos);
      if (distSq > 4900) continue; // > 70m away

      if (npc.type === 'human') {
        this.updateHumanNPC(npc, delta, elapsedTime, i);
      } else if (npc.type === 'cat') {
        this.updateCatNPC(npc, delta, elapsedTime);
      }
    }
  }

  updateHumanNPC(npc, delta, elapsedTime, index) {
    if (npc.greetingCooldown > 0) npc.greetingCooldown -= delta;

    switch (npc.state) {
      case NPCState.WALKING:
        this.stepNPCWalking(npc, delta, elapsedTime, index);
        break;

      case NPCState.GREETING:
        npc.greetingTimer -= delta;
        // Polite nod animation
        npc.limbs.head.rotation.x = Math.sin(elapsedTime * 4) * 0.15;
        if (npc.greetingTimer <= 0) {
          npc.limbs.head.rotation.x = 0;
          npc.state = npc.currentPath.length > 0 ? NPCState.WALKING : NPCState.IDLE;
        }
        break;

      case NPCState.ACTIVITY:
      case NPCState.SITTING:
      case NPCState.LOOKING:
      case NPCState.IDLE:
        this.stepNPCActivity(npc, delta, elapsedTime);
        break;

      default:
        npc.state = NPCState.IDLE;
        break;
    }

    // NPC-to-NPC Awareness Check
    this.checkNPCSocialAwareness(npc, index);
  }

  stepNPCWalking(npc, delta, elapsedTime, index) {
    if (!npc.currentPath || npc.pathIndex >= npc.currentPath.length) {
      this.arriveAtActivity(npc);
      return;
    }

    const targetPos = npc.currentPath[npc.pathIndex];
    _moveDir.subVectors(targetPos, npc.group.position);
    _moveDir.y = 0;
    const distToTarget = _moveDir.length();

    if (distToTarget < 0.35) {
      npc.pathIndex++;
      if (npc.pathIndex >= npc.currentPath.length) {
        this.arriveAtActivity(npc);
        return;
      }
    }

    _moveDir.normalize();

    // Lightweight crowd separation steering
    this.applyCrowdRepulsion(npc, _moveDir, index);

    // Smooth speed modulation when approaching waypoint/destination to prevent foot sliding
    const isFinalWaypoint = npc.pathIndex >= npc.currentPath.length - 1;
    let speedScale = 1.0;
    if (isFinalWaypoint && distToTarget < 0.75) {
      speedScale = THREE.MathUtils.clamp(distToTarget / 0.75, 0.35, 1.0);
    }

    const targetSpeed = npc.walkSpeed * speedScale;
    npc.actualVelocity = THREE.MathUtils.lerp(npc.actualVelocity || 0, targetSpeed, Math.min(1, delta * 8.0));
    npc.locomotionBlend = THREE.MathUtils.lerp(npc.locomotionBlend || 0, speedScale, Math.min(1, delta * 7.0));

    // Smooth position movement along direction
    const step = npc.actualVelocity * delta;
    npc.group.position.x += _moveDir.x * step;
    npc.group.position.z += _moveDir.z * step;

    // Shortest-arc smooth rotation towards movement direction
    const targetAngle = Math.atan2(_moveDir.x, _moveDir.z);
    let angleDiff = targetAngle - npc.group.rotation.y;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    npc.group.rotation.y += angleDiff * Math.min(1, delta * 7.5);

    // Speed-scaled cadence matching natural human strides (~4.8 rad/s at normal walk)
    const speedRatio = Math.max(0.1, npc.actualVelocity / (npc.walkSpeed || 1.2));
    const cadence = 4.8 * speedRatio;
    npc.walkTime += delta * cadence;
    const phase = npc.walkTime;

    const blend = npc.locomotionBlend;

    // Natural, relaxed stride amplitude
    const strideAmp = 0.36 * blend;
    const legSwing = Math.sin(phase) * strideAmp;

    // Alternating opposite-phase leg swing
    npc.limbs.leftLeg.rotation.x = legSwing;
    npc.limbs.rightLeg.rotation.x = -legSwing;

    // Articulated knee flex during forward swing (knee bends backward when swinging forward)
    npc.limbs.leftKnee.rotation.x = Math.max(0, -legSwing) * 0.75;
    npc.limbs.rightKnee.rotation.x = Math.max(0, legSwing) * 0.75;

    // Opposite-phase arm swinging
    const isHoldingBriefcase = npc.config.id === 'npc_sato' && npc.limbs.briefcaseMesh;
    const armMultiplier = isHoldingBriefcase ? 0.35 : 0.78;
    npc.limbs.leftArm.rotation.x = -legSwing * 0.78;
    npc.limbs.rightArm.rotation.x = legSwing * armMultiplier;

    // Relaxed slight outward arm angle
    npc.limbs.leftArm.rotation.z = -0.05;
    npc.limbs.rightArm.rotation.z = 0.05;

    // Subtle natural vertical body bobbing (ground contact at midpoint of stride)
    const bob = Math.abs(Math.sin(phase)) * 0.015 * blend;
    npc.group.position.y = THREE.MathUtils.lerp(npc.group.position.y, npc.baseY + bob, Math.min(1, delta * 12.0));

    // Subtle natural torso yaw twist & lateral roll
    npc.limbs.torso.rotation.y = -legSwing * 0.08;
    npc.limbs.torso.rotation.z = Math.sin(phase) * 0.015 * blend;
    npc.limbs.torso.rotation.x = THREE.MathUtils.lerp(npc.limbs.torso.rotation.x, 0.02 * blend, delta * 6.0);

    // Stabilize head (subtle counter-twist and counter-roll to keep vision steady)
    npc.limbs.head.rotation.y = legSwing * 0.04;
    npc.limbs.head.rotation.z = -Math.sin(phase) * 0.01 * blend;
    npc.limbs.head.rotation.x = THREE.MathUtils.lerp(npc.limbs.head.rotation.x, 0, delta * 6.0);
  }

  applyCrowdRepulsion(npc, moveDir, myIndex) {
    _steerOffset.set(0, 0, 0);

    for (let j = 0; j < this.npcs.length; j++) {
      if (j === myIndex) continue;
      const other = this.npcs[j];
      const dSq = npc.group.position.distanceToSquared(other.group.position);

      if (dSq < 1.44 && dSq > 0.001) {
        // Distance < 1.2m
        _vecA.subVectors(npc.group.position, other.group.position);
        _vecA.y = 0;
        const d = Math.sqrt(dSq);
        _steerOffset.addScaledVector(_vecA, (1.2 - d) / d * 0.4);
      }
    }

    if (_steerOffset.lengthSq() > 0.001) {
      moveDir.add(_steerOffset).normalize();
    }
  }

  arriveAtActivity(npc) {
    npc.currentPath = [];
    npc.pathIndex = 0;
    npc.actualVelocity = 0;

    npc.currentActivity = npc.targetActivity || ActivityType.REST;
    npc.activityTimer = Math.random() * 18 + 12; // 12-30 seconds activity

    if (npc.currentActivity === ActivityType.SIT) {
      npc.state = NPCState.SITTING;
    } else {
      npc.state = NPCState.ACTIVITY;
    }
  }

  stepNPCActivity(npc, delta, elapsedTime) {
    npc.activityTimer -= delta;

    // Smoothly decay locomotion blend to 0
    npc.locomotionBlend = THREE.MathUtils.lerp(npc.locomotionBlend || 0, 0, Math.min(1, delta * 6.0));
    npc.actualVelocity = THREE.MathUtils.lerp(npc.actualVelocity || 0, 0, Math.min(1, delta * 6.0));

    if (npc.state === NPCState.SITTING) {
      // Smoothly blend to sitting bench pose
      npc.group.position.y = THREE.MathUtils.lerp(npc.group.position.y, npc.baseY - 0.28, delta * 5.0);
      npc.limbs.leftLeg.rotation.x = THREE.MathUtils.lerp(npc.limbs.leftLeg.rotation.x, -1.48, delta * 5.0);
      npc.limbs.rightLeg.rotation.x = THREE.MathUtils.lerp(npc.limbs.rightLeg.rotation.x, -1.48, delta * 5.0);
      npc.limbs.leftKnee.rotation.x = THREE.MathUtils.lerp(npc.limbs.leftKnee.rotation.x, 1.50, delta * 5.0);
      npc.limbs.rightKnee.rotation.x = THREE.MathUtils.lerp(npc.limbs.rightKnee.rotation.x, 1.50, delta * 5.0);
      npc.limbs.leftArm.rotation.x = THREE.MathUtils.lerp(npc.limbs.leftArm.rotation.x, 0.38, delta * 5.0);
      npc.limbs.rightArm.rotation.x = THREE.MathUtils.lerp(npc.limbs.rightArm.rotation.x, 0.38, delta * 5.0);
      npc.limbs.leftArm.rotation.z = THREE.MathUtils.lerp(npc.limbs.leftArm.rotation.z, -0.04, delta * 5.0);
      npc.limbs.rightArm.rotation.z = THREE.MathUtils.lerp(npc.limbs.rightArm.rotation.z, 0.04, delta * 5.0);
      npc.limbs.torso.rotation.x = THREE.MathUtils.lerp(npc.limbs.torso.rotation.x, -0.04, delta * 5.0);
      npc.limbs.torso.rotation.y = THREE.MathUtils.lerp(npc.limbs.torso.rotation.y, 0, delta * 5.0);
      npc.limbs.torso.rotation.z = THREE.MathUtils.lerp(npc.limbs.torso.rotation.z, 0, delta * 5.0);
      npc.limbs.head.rotation.set(0, 0, 0);
    } else {
      // Smoothly blend limbs back to standing idle
      npc.limbs.leftLeg.rotation.x = THREE.MathUtils.lerp(npc.limbs.leftLeg.rotation.x, 0, delta * 6.0);
      npc.limbs.rightLeg.rotation.x = THREE.MathUtils.lerp(npc.limbs.rightLeg.rotation.x, 0, delta * 6.0);
      npc.limbs.leftKnee.rotation.x = THREE.MathUtils.lerp(npc.limbs.leftKnee.rotation.x, 0, delta * 6.0);
      npc.limbs.rightKnee.rotation.x = THREE.MathUtils.lerp(npc.limbs.rightKnee.rotation.x, 0, delta * 6.0);
      // Subtle standing posture & natural weight shifts
      const postureRoll = Math.sin(elapsedTime * 0.4 + (npc.config.position.x * 2.5)) * 0.018;
      const glanceYaw = Math.sin(elapsedTime * 0.35 + (npc.config.position.z * 1.8)) * 0.12;

      npc.limbs.torso.rotation.z = THREE.MathUtils.lerp(npc.limbs.torso.rotation.z, postureRoll, delta * 4.0);
      npc.limbs.torso.rotation.y = THREE.MathUtils.lerp(npc.limbs.torso.rotation.y, 0, delta * 6.0);
      npc.limbs.leftArm.rotation.z = THREE.MathUtils.lerp(npc.limbs.leftArm.rotation.z, -0.04, delta * 6.0);
      npc.limbs.rightArm.rotation.z = THREE.MathUtils.lerp(npc.limbs.rightArm.rotation.z, 0.04, delta * 6.0);

      // Gentle natural breathing
      const breathe = Math.sin(elapsedTime * 1.8 + npc.config.position.x) * 0.006;
      npc.group.position.y = THREE.MathUtils.lerp(npc.group.position.y, npc.baseY + breathe, delta * 6.0);

      // Specific activity procedural motions
      switch (npc.currentActivity) {
        case ActivityType.PHOTOGRAPH:
          if (npc.limbs.cameraMesh) {
            // Raise camera to eye level
            npc.limbs.rightArm.rotation.x = THREE.MathUtils.lerp(npc.limbs.rightArm.rotation.x, -Math.PI * 0.45, delta * 5.0);
            npc.limbs.head.rotation.y = Math.sin(elapsedTime * 0.8) * 0.28;
            npc.limbs.head.rotation.x = -0.05;
          }
          break;

        case ActivityType.GARDEN:
          // Gentle tending / bending forward
          npc.limbs.torso.rotation.x = THREE.MathUtils.lerp(npc.limbs.torso.rotation.x, 0.18, delta * 4.0);
          npc.limbs.head.rotation.x = 0.12;
          npc.limbs.leftArm.rotation.x = -0.28 + Math.sin(elapsedTime * 2.5) * 0.08;
          npc.limbs.rightArm.rotation.x = -0.28 - Math.sin(elapsedTime * 2.5) * 0.08;
          break;

        case ActivityType.CHECKOUT:
        case ActivityType.SHOP:
        case ActivityType.LOOK_AROUND:
          npc.limbs.torso.rotation.x = THREE.MathUtils.lerp(npc.limbs.torso.rotation.x, 0, delta * 5.0);
          npc.limbs.head.rotation.y = glanceYaw;
          npc.limbs.head.rotation.x = 0;
          npc.limbs.rightArm.rotation.x = THREE.MathUtils.lerp(npc.limbs.rightArm.rotation.x, 0, delta * 5.0);
          npc.limbs.leftArm.rotation.x = THREE.MathUtils.lerp(npc.limbs.leftArm.rotation.x, 0, delta * 5.0);
          break;

        case ActivityType.VENDING_STOP:
          npc.limbs.torso.rotation.x = THREE.MathUtils.lerp(npc.limbs.torso.rotation.x, 0, delta * 5.0);
          npc.limbs.rightArm.rotation.x = THREE.MathUtils.lerp(npc.limbs.rightArm.rotation.x, -0.38, delta * 5.0);
          npc.limbs.leftArm.rotation.x = THREE.MathUtils.lerp(npc.limbs.leftArm.rotation.x, 0, delta * 5.0);
          npc.limbs.head.rotation.y = THREE.MathUtils.lerp(npc.limbs.head.rotation.y, 0.1, delta * 4.0);
          break;

        default:
          npc.limbs.torso.rotation.x = THREE.MathUtils.lerp(npc.limbs.torso.rotation.x, 0, delta * 5.0);
          npc.limbs.rightArm.rotation.x = THREE.MathUtils.lerp(npc.limbs.rightArm.rotation.x, 0, delta * 5.0);
          npc.limbs.leftArm.rotation.x = THREE.MathUtils.lerp(npc.limbs.leftArm.rotation.x, 0, delta * 5.0);
          npc.limbs.head.rotation.y = glanceYaw;
          npc.limbs.head.rotation.x = 0;
          break;
      }
    }

    if (npc.activityTimer <= 0) {
      this.pickNextDestination(npc);
    }
  }

  pickNextDestination(npc) {
    const block = this.getScheduleBlock();
    const schedule = npc.config.schedules[block];
    if (!schedule) return;

    const destList = schedule.destinations;
    const nextDestId = destList[Math.floor(Math.random() * destList.length)];
    this.assignNPCDestination(npc, nextDestId, schedule.activity);
  }

  checkNPCSocialAwareness(npc, myIndex) {
    if (npc.greetingCooldown > 0 || npc.state === NPCState.SITTING || npc.state === NPCState.GREETING) {
      return;
    }

    for (let j = 0; j < this.npcs.length; j++) {
      if (j === myIndex) continue;
      const other = this.npcs[j];
      if (other.type !== 'human' || other.state === NPCState.SITTING) continue;

      const dSq = npc.group.position.distanceToSquared(other.group.position);
      if (dSq < 6.25 && dSq > 1.0) {
        // Distance between 1.0m and 2.5m
        if (Math.random() < 0.25) {
          // Trigger polite social nod
          npc.state = NPCState.GREETING;
          npc.greetingTimer = 2.0;
          npc.greetingCooldown = 25.0;

          other.state = NPCState.GREETING;
          other.greetingTimer = 2.0;
          other.greetingCooldown = 25.0;
          break;
        }
      }
    }
  }

  updateCatNPC(cat, delta, elapsedTime) {
    cat.activityTimer -= delta;

    // Purring breath
    const purr = Math.sin(elapsedTime * 4) * 0.006;
    cat.group.scale.set(1 + purr, 1 + purr, 1 + purr);

    if (cat.state === NPCState.WALKING) {
      if (!cat.currentPath || cat.pathIndex >= cat.currentPath.length) {
        cat.state = NPCState.IDLE;
        cat.activityTimer = Math.random() * 14 + 8;
        return;
      }

      const targetPos = cat.currentPath[cat.pathIndex];
      _moveDir.subVectors(targetPos, cat.group.position);
      _moveDir.y = 0;
      const dist = _moveDir.length();

      if (dist < 0.3) {
        cat.pathIndex++;
        if (cat.pathIndex >= cat.currentPath.length) {
          cat.state = NPCState.IDLE;
          cat.activityTimer = Math.random() * 14 + 8;
          return;
        }
      }

      _moveDir.normalize();
      cat.group.position.x += _moveDir.x * cat.walkSpeed * delta;
      cat.group.position.z += _moveDir.z * cat.walkSpeed * delta;
      cat.group.rotation.y = Math.atan2(_moveDir.x, _moveDir.z);
    } else {
      // Idle looking around
      if (cat.activityTimer <= 0) {
        if (cat.config.roamNodes && Math.random() < 0.6) {
          const targetNodeId =
            cat.config.roamNodes[Math.floor(Math.random() * cat.config.roamNodes.length)];
          const path = this.waypointNetwork.findPath(cat.group.position, targetNodeId);
          if (path && path.length > 0) {
            cat.currentPath = path;
            cat.pathIndex = 0;
            cat.state = NPCState.WALKING;
          }
        } else {
          cat.activityTimer = Math.random() * 12 + 6;
          // Slight random head turn
          cat.group.rotation.y += (Math.random() - 0.5) * 1.2;
        }
      }
    }
  }
}
