import * as THREE from 'three';
import { ProceduralTextures } from '../utils/ProceduralTextures.js';
import { BuildingGenerator } from '../world/BuildingGenerator.js';
import { StreetPropsGenerator } from '../world/StreetPropsGenerator.js';
import { globalBus } from '../engine/EventBus.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';

/**
 * WorldSystem - Assembles and manages the full anime-realistic Sakuragaoka District
 */
export class WorldSystem {
  constructor() {
    this.scene = null;
    this.timeOfDayHours = 9.0; // 9:00 AM (Crisp pleasant morning)
    this.timeCycleSpeed = 0.02;

    this.buildingGen = new BuildingGenerator();
    this.propsGen = new StreetPropsGenerator();

    // Lighting refs
    this.sunLight = null;
    this.hemiLight = null;
    this.ambientLight = null;
    this.streetLights = [];
    this.windowGlows = [];

    // Solid World Collision System (Spatial Grid)
    this.colliders = [];
    this.collisionBoxes = []; // Backwards compatibility ref
    this.gridCellSize = 12;
    this.spatialGrid = new Map();

    // Sky & particles
    this.skyMesh = null;
    this.petalsParticleSystem = null;
    this.interactiveObjects = [];
    this.swayingCanopies = [];
  }

  init(engine) {
    this.engine = engine;
    this.scene = engine.scene;

    this.setupLighting();
    this.setupSky();
    this.buildTerrainAndRoadNetwork();
    this.buildDistrictBuildings();
    this.buildNeighborhoodPark();
    this.buildStreetVegetationClusters();
    this.buildBackgroundScenery();
    this.buildStreetInfrastructure();
    this.setupSakuraParticles();

    // Validate authoritative solid collider registry (Category breakdown)
    this.validateAndLogColliders();

    // Broadcast initial time
    this.broadcastTime();
    this.updateSunPosition();

    // Listen for time step / advance requests
    globalBus.on('time:step', () => this.advanceTime(1.0));
    globalBus.on('time:advance', (data) => this.advanceTime(data?.hours ?? 1.0));
  }

  setupLighting() {
    // Soft atmospheric distance fog for visual depth and anime realism (keeps foreground crisp, distant horizon soft)
    this.scene.fog = new THREE.Fog(0xdbeafe, 80, 260);

    // Soft skylight with warm green/peach ground bounce for anime realism
    this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0xbbf7d0, 0.76);
    this.hemiLight.position.set(0, 90, 0);
    this.scene.add(this.hemiLight);

    // Warm daylight directional key light with calibrated PCF soft shadows
    this.sunLight = new THREE.DirectionalLight(0xfff7ed, 1.22);
    this.sunLight.position.set(48, 58, 32);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 1.0;
    this.sunLight.shadow.camera.far = 190;
    this.sunLight.shadow.camera.left = -75;
    this.sunLight.shadow.camera.right = 75;
    this.sunLight.shadow.camera.top = 75;
    this.sunLight.shadow.camera.bottom = -75;
    this.sunLight.shadow.bias = -0.00015;
    this.sunLight.shadow.normalBias = 0.028;
    this.sunLight.shadow.radius = 1.8;
    this.scene.add(this.sunLight);

    // Balanced soft ambient fill preventing crushed-black shadows across roads and buildings
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.36);
    this.scene.add(this.ambientLight);
  }

  setupSky() {
    const skyGeo = new THREE.SphereGeometry(450, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x38bdf8) },
        bottomColor: { value: new THREE.Color(0xffedd5) },
        offset: { value: 30 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
    });

    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyMesh);
  }

  buildTerrainAndRoadNetwork() {
    const asphaltTex = ProceduralTextures.createAsphaltTexture();
    asphaltTex.repeat.set(16, 32);

    const sidewalkTex = ProceduralTextures.createSidewalkTexture();
    sidewalkTex.repeat.set(12, 24);

    const tactileTex = ProceduralTextures.createTactilePavingTexture();
    tactileTex.repeat.set(1, 32);

    const drainTex = ProceduralTextures.createDrainGutterTexture();
    drainTex.repeat.set(1, 32);

    const grassTex = ProceduralTextures.createGrassTexture();
    grassTex.repeat.set(24, 24);

    // 1. Base District Ground (280m x 280m)
    const baseGroundGeo = new THREE.PlaneGeometry(280, 280);
    const baseGroundMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      roughness: 0.9,
      metalness: 0.02,
    });
    const baseGround = new THREE.Mesh(baseGroundGeo, baseGroundMat);
    baseGround.rotation.x = -Math.PI / 2;
    baseGround.receiveShadow = true;
    this.scene.add(baseGround);

    // 2. Main Street (Primary Arterial: North-South, 8.5m wide, 220m long)
    const mainRoadGeo = new THREE.PlaneGeometry(8.5, 220);
    const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.85 });
    const mainRoad = new THREE.Mesh(mainRoadGeo, roadMat);
    mainRoad.rotation.x = -Math.PI / 2;
    mainRoad.position.set(0, 0.02, 0);
    mainRoad.receiveShadow = true;
    this.scene.add(mainRoad);

    // Road markings on Main Street (Center dashed line)
    for (let z = -100; z <= 100; z += 5) {
      if (Math.abs(z - 40) < 5 || Math.abs(z - (-40)) < 5 || Math.abs(z - 5) < 5) continue;
      const dashGeo = new THREE.PlaneGeometry(0.2, 2.5);
      const dashMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.025, z);
      dash.receiveShadow = true;
      this.scene.add(dash);
    }

    // Road side boundary lines (continuous white lines)
    [-4.0, 4.0].forEach((xPos) => {
      const edgeGeo = new THREE.PlaneGeometry(0.2, 220);
      const edgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
      const edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(xPos, 0.025, 0);
      edge.receiveShadow = true;
      this.scene.add(edge);
    });

    // Street Drainage Gutters with Slotted Grates along Main Street curbs
    [-4.18, 4.18].forEach((xPos) => {
      const gutterGeo = new THREE.PlaneGeometry(0.32, 220);
      const gutterMat = new THREE.MeshStandardMaterial({ map: drainTex, roughness: 0.7 });
      const gutter = new THREE.Mesh(gutterGeo, gutterMat);
      gutter.rotation.x = -Math.PI / 2;
      gutter.position.set(xPos, 0.024, 0);
      gutter.receiveShadow = true;
      this.scene.add(gutter);
    });

    // 3. Sidewalks on Main Street (Continuous 4.5m wide raised pedestrian curbs)
    [-6.5, 6.5].forEach((xPos) => {
      const curbGeo = new THREE.BoxGeometry(4.5, 0.18, 220);
      const curbMat = new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 0.8 });
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(xPos, 0.09, 0);
      curb.receiveShadow = true;
      curb.castShadow = true;
      this.scene.add(curb);

      // Yellow tactile paving guidance strip
      const tactileGeo = new THREE.PlaneGeometry(0.45, 220);
      const tactileMat = new THREE.MeshStandardMaterial({ map: tactileTex, roughness: 0.6 });
      const tactile = new THREE.Mesh(tactileGeo, tactileMat);
      tactile.rotation.x = -Math.PI / 2;
      tactile.position.set(xPos > 0 ? xPos - 1.1 : xPos + 1.1, 0.185, 0);
      tactile.receiveShadow = true;
      this.scene.add(tactile);
    });

    // 4. Secondary Residential Cross Streets & Sidewalks
    // Shopping Street (z = 40, East to HIKARI MART: width 7.5m, length 60m)
    this.createCrossStreet(35, 40, 60, 7.5, 0);
    this.createStreetSidewalk(35, 44.8, 60, 2.2, 0); // South sidewalk leading to HIKARI MART
    this.createStreetSidewalk(35, 35.2, 60, 2.2, 0); // North sidewalk

    // Residential Lane (z = -40, West to Sakura Heights: width 6.8m, length 60m)
    this.createCrossStreet(-35, -40, 60, 6.8, 0);
    this.createStreetSidewalk(-35, -44.5, 60, 2.4, 0); // North sidewalk leading to Sakura Heights
    this.createStreetSidewalk(-35, -35.5, 60, 2.2, 0); // South sidewalk

    // 5. Secondary Residential Access Lanes
    // North Residential Lane (z = -85)
    this.createCrossStreet(0, -85, 84, 5.5, 0);
    // South Residential Lane (z = 75)
    this.createCrossStreet(0, 75, 84, 5.5, 0);
    // West Back Alley (x = -44, z = -40)
    const alleyGeo = new THREE.PlaneGeometry(4.8, 52);
    const alleyMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.88 });
    const alley = new THREE.Mesh(alleyGeo, alleyMat);
    alley.rotation.x = -Math.PI / 2;
    alley.position.set(-44, 0.02, -40);
    alley.receiveShadow = true;
    this.scene.add(alley);

    // 6. Japanese Pedestrian Crosswalks (Zebra stripes with comfortable spacing)
    this.createCrosswalk(0, 5, 8.0); // Park entrance crossing
    this.createCrosswalk(0, 40, 8.0); // Main Street Shopping Crossing
    this.createCrosswalk(0, -40, 8.0); // Main Street Residential Crossing
    this.createCrosswalk(9.5, 40, 7.2, true); // East Cross-street crossing
    this.createCrosswalk(-9.5, -40, 6.6, true); // West Cross-lane crossing

    // 7. English-Safe Road Markings (STOP and 30 km/h)
    this.createRoadTextMarking(0, 20, '30');
    this.createRoadTextMarking(0, -20, '30');
    this.createRoadTextMarking(8.8, 40, 'STOP', -Math.PI / 2);
    this.createRoadTextMarking(-8.8, -40, 'STOP', Math.PI / 2);

    // 8. Drainage Channels / Gutters with Cast Iron Manholes
    this.createDrainageGrates();
  }

  createCrossStreet(centerX, centerZ, length, width, angle = 0) {
    const asphaltTex = ProceduralTextures.createAsphaltTexture();
    asphaltTex.repeat.set(length / 8, 2);

    const roadGeo = new THREE.PlaneGeometry(width, length);
    const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.85 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = Math.PI / 2 + angle;
    road.position.set(centerX, 0.02, centerZ);
    road.receiveShadow = true;
    this.scene.add(road);
  }

  createStreetSidewalk(centerX, centerZ, length, width, angle = 0) {
    const sidewalkTex = ProceduralTextures.createSidewalkTexture();
    sidewalkTex.repeat.set(length / 4, width / 2);

    const curbGeo = new THREE.BoxGeometry(width, 0.18, length);
    const curbMat = new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 0.8 });
    const curb = new THREE.Mesh(curbGeo, curbMat);
    curb.rotation.y = Math.PI / 2 + angle;
    curb.position.set(centerX, 0.09, centerZ);
    curb.receiveShadow = true;
    curb.castShadow = true;
    this.scene.add(curb);
  }

  createCrosswalk(x, z, width = 8.0, isCrossStreet = false) {
    for (let r = -width / 2 + 0.4; r <= width / 2 - 0.4; r += 0.85) {
      const stripeGeo = new THREE.PlaneGeometry(0.55, 3.4);
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      if (isCrossStreet) {
        stripe.rotation.z = Math.PI / 2;
        stripe.position.set(x, 0.028, z + r);
      } else {
        stripe.position.set(x + r, 0.028, z);
      }
      stripe.receiveShadow = true;
      this.scene.add(stripe);
    }
  }

  createRoadTextMarking(x, z, text, rotZ = 0) {
    const tex = ProceduralTextures.createRoadMarkingTexture(text);
    const planeGeo = new THREE.PlaneGeometry(2.2, 4.4);
    const planeMat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      roughness: 0.5,
    });
    const mesh = new THREE.Mesh(planeGeo, planeMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rotZ;
    mesh.position.set(x, 0.027, z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  createDrainageGrates() {
    const manholeTex = ProceduralTextures.createManholeTexture();
    const manholeMat = new THREE.MeshStandardMaterial({ map: manholeTex, roughness: 0.6 });

    // Manhole covers along streets (flush with asphalt, non-blocking)
    [
      [2.2, 14],
      [-2.2, -14],
      [2.2, 68],
      [-2.2, -68],
      [22, 40],
      [-22, -40],
      [-44, -38],
      [32, -38],
    ].forEach(([mx, mz]) => {
      const manholeGeo = new THREE.CircleGeometry(0.48, 16);
      const manhole = new THREE.Mesh(manholeGeo, manholeMat);
      manhole.rotation.x = -Math.PI / 2;
      manhole.position.set(mx, 0.026, mz);
      manhole.receiveShadow = true;
      this.scene.add(manhole);
    });
  }

  buildDistrictBuildings() {
    // 1. Mayank's Apartment Building: "Sakura Heights"
    const mayankApt = this.buildingGen.createApartmentBuilding({
      x: -28,
      z: -38,
      rotationY: 0,
    });
    this.scene.add(mayankApt);

    // Sakura Heights Colliders: main building block, side stair tower, resident bike shelter, mailbox
    this.registerBoxCollider(-36.25, -19.75, -42.8, -33.2, 0, 12, 'sakura_heights_main');
    this.registerBoxCollider(-39.45, -36.25, -40.94, -37.94, 0, 12, 'sakura_heights_stairs');
    this.registerBoxCollider(-32.6, -28.4, -45.9, -43.7, 0, 2.4, 'sakura_heights_bike_rack');
    this.registerBoxCollider(-23.65, -22.75, -43.5, -43.1, 0, 1.8, 'sakura_heights_mailbox');

    // 2. East Apartment Complex
    const eastApt = this.buildingGen.createApartmentBuilding({
      x: 32,
      z: -38,
      rotationY: Math.PI,
    });
    this.scene.add(eastApt);

    // East Apartment Colliders
    this.registerBoxCollider(23.75, 40.25, -42.8, -33.2, 0, 12, 'east_apt_main');
    this.registerBoxCollider(40.25, 43.45, -38.06, -35.06, 0, 12, 'east_apt_stairs');
    this.registerBoxCollider(27.4, 31.6, -32.3, -30.1, 0, 2.4, 'east_apt_bike_rack');

    // 3. HIKARI MART Convenience Store Landmark
    const hikariMart = this.buildingGen.createHikariMart({
      x: 24,
      z: 42,
      rotationY: -Math.PI / 2,
    });
    this.scene.add(hikariMart);

    // Precise HIKARI MART colliders: walls, interior shelves & counter are solid while entrance & aisles are walkable
    this.registerBoxCollider(29.7, 30.3, 34.5, 49.5, 0, 4.5, 'hikari_back_fridge_wall');
    this.registerBoxCollider(18.0, 30.0, 34.2, 34.8, 0, 4.5, 'hikari_north_wall');
    this.registerBoxCollider(18.0, 30.0, 49.2, 49.8, 0, 4.5, 'hikari_south_wall');
    this.registerBoxCollider(17.8, 18.3, 34.5, 38.5, 0, 4.5, 'hikari_front_left_glass');
    this.registerBoxCollider(17.8, 18.3, 45.0, 49.5, 0, 4.5, 'hikari_front_right_glass');
    // Note: entrance between z = 38.5 and z = 45.0 at x = 18.0 is completely OPEN and walkable!

    // Interior Snack Shelves (Aisles are generous and walkable)
    this.registerBoxCollider(21.45, 26.95, 39.6, 40.8, 0, 1.8, 'hikari_shelf_1');
    this.registerBoxCollider(21.45, 26.95, 43.2, 44.4, 0, 1.8, 'hikari_shelf_2');

    // Checkout Counter
    this.registerBoxCollider(27.2, 28.4, 45.9, 48.3, 0, 1.3, 'hikari_checkout_counter');

    // Exterior Kei Car & Recycling Bins (Accurately transformed from storeGroup at x=24, z=42, rotY=-PI/2)
    this.registerBoxCollider(12.0, 15.6, 47.1, 48.9, 0, 1.8, 'hikari_kei_car');
    this.registerBoxCollider(16.8, 17.6, 35.0, 36.8, 0, 1.2, 'hikari_bins');

    // Register all interactive objects from buildings
    mayankApt.traverse((child) => {
      if (child.userData?.isInteractive) this.interactiveObjects.push(child);
    });
    hikariMart.traverse((child) => {
      if (child.userData?.isInteractive) this.interactiveObjects.push(child);
    });

    // 4. Detached Japanese Houses with varied architectural styles & colors
    const houses = [
      // Residential West Lane
      { x: -28, z: -15, rotY: 0, wall: '#fef3c7', roof: '#334155', w: 8.5, d: 8.5, style: 'contemporary' },
      { x: -28, z: -62, rotY: 0, wall: '#f1f5f9', roof: '#1e293b', w: 9.0, d: 9.0, style: 'traditional_modern' },
      { x: -44, z: -38, rotY: Math.PI / 2, wall: '#e2e8f0', roof: '#475569', w: 8.5, d: 8.0, style: 'wood_accent' },
      // Residential East Lane
      { x: 32, z: -15, rotY: Math.PI, wall: '#f8fafc', roof: '#334155', w: 8.5, d: 8.5, style: 'traditional_modern' },
      { x: 32, z: -62, rotY: Math.PI, wall: '#fef3c7', roof: '#1e293b', w: 9.0, d: 9.0, style: 'contemporary' },
      // North Main Street Houses
      { x: -18, z: -85, rotY: Math.PI / 2, wall: '#e2e8f0', roof: '#334155', w: 9.0, d: 8.5, style: 'wood_accent' },
      { x: 18, z: -85, rotY: -Math.PI / 2, wall: '#f1f5f9', roof: '#1e293b', w: 9.0, d: 8.5, style: 'contemporary' },
      // South Commercial/Residential
      { x: -18, z: 75, rotY: Math.PI / 2, wall: '#fef3c7', roof: '#334155', w: 8.5, d: 8.5, style: 'contemporary' },
      { x: 18, z: 75, rotY: -Math.PI / 2, wall: '#f1f5f9', roof: '#475569', w: 9.0, d: 9.0, style: 'traditional_modern' },
    ];

    houses.forEach((h) => {
      const houseMesh = this.buildingGen.createDetachedHouse({
        x: h.x,
        z: h.z,
        rotationY: h.rotY,
        wallColor: h.wall,
        roofColor: h.roof,
        width: h.w,
        depth: h.d,
        style: h.style,
      });
      this.scene.add(houseMesh);
      this.registerHouseColliders(h.x, h.z, h.w, h.d, h.rotY);
    });
  }

  buildNeighborhoodPark() {
    const parkGroup = new THREE.Group();
    parkGroup.position.set(-28, 0, 10);

    const parkW = 34;
    const parkD = 38;

    // 1. Lush Park Turf with procedural grass texture & tone
    const grassTex = ProceduralTextures.createGrassTexture();
    grassTex.repeat.set(6, 6);
    const turfGeo = new THREE.PlaneGeometry(parkW, parkD);
    const turfMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      roughness: 0.88,
      metalness: 0.02,
    });
    const turf = new THREE.Mesh(turfGeo, turfMat);
    turf.rotation.x = -Math.PI / 2;
    turf.position.y = 0.03;
    turf.receiveShadow = true;
    parkGroup.add(turf);

    // 2. Paved Winding Walking Path through Park
    const pathTex = ProceduralTextures.createSidewalkTexture();
    pathTex.repeat.set(2, 8);
    const pathGeo = new THREE.PlaneGeometry(2.6, parkD - 2);
    const pathMat = new THREE.MeshStandardMaterial({ map: pathTex, roughness: 0.8 });
    const path = new THREE.Mesh(pathGeo, pathMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.035, 0);
    path.receiveShadow = true;
    parkGroup.add(path);

    // 3. Low Wooden Park Boundary Fence
    const fenceMat = new THREE.MeshStandardMaterial({
      map: ProceduralTextures.createWoodTexture(),
      roughness: 0.7,
    });
    for (let x = -parkW / 2 + 1; x <= parkW / 2 - 1; x += 3.5) {
      if (Math.abs(x) < 2.5) continue; // Wide generous entrance opening
      const postGeo = new THREE.BoxGeometry(0.12, 0.9, 0.12);
      const post = new THREE.Mesh(postGeo, fenceMat);
      post.position.set(x, 0.45, parkD / 2);
      post.castShadow = true;
      parkGroup.add(post);

      const railGeo = new THREE.BoxGeometry(3.5, 0.08, 0.06);
      const rail = new THREE.Mesh(railGeo, fenceMat);
      rail.position.set(x + 1.75, 0.65, parkD / 2);
      rail.castShadow = true;
      parkGroup.add(rail);
    }

    // 4. Sakura & Japanese Green Maple Trees (Balanced natural park planting)
    this.createSakuraTreeSpreading(parkGroup, -10, 0, -11);
    this.createSakuraTreeTall(parkGroup, 9.5, 0, -12);
    this.createSakuraTreeWeeping(parkGroup, -10.5, 0, 11);
    this.createJapaneseGreenMaple(parkGroup, 10, 0, 12);
    this.createSakuraTreeCompact(parkGroup, -5.5, 0, 0.5);

    // Grand Sakura Centerpiece Tree (Interactive)
    const landmarkTree = this.createSakuraTreeSpreading(parkGroup, 9.5, 0, -2, 1.25);
    landmarkTree.userData = {
      isInteractive: true,
      interactionType: 'tree',
      prompt: 'Look',
      name: 'Grand Sakura Tree',
      onInteract: () => {
        globalBus.emit('dialogue:open', {
          speaker: 'Grand Sakura Tree',
          avatar: '🌸',
          text: 'Sakura petals drift gently in the morning breeze, scattering soft pink hues across the grass.',
        });
        globalBus.emit('toast:show', { message: 'Admired the grand cherry blossom tree.' });
      },
    };
    this.interactiveObjects.push(landmarkTree);

    // 5. Playground Area (Slide & Swings)
    const playground = this.propsGen.createPlayground(-6, 0, -8);
    parkGroup.add(playground);

    // 6. Drinking Water Fountain (Mizunomi-ba)
    const fountain = this.propsGen.createDrinkingFountain(3.5, 0, 4.5);
    parkGroup.add(fountain);
    this.interactiveObjects.push(fountain);

    // 7. Stone-bordered Flower Beds with Blooming Azaleas & Hydrangeas
    const flowerBed1 = this.propsGen.createFlowerBed(7.5, 0, -7.5, 4.5, 1.6);
    parkGroup.add(flowerBed1);

    const flowerBed2 = this.propsGen.createFlowerBed(7.5, 0, 5.5, 4.5, 1.6);
    parkGroup.add(flowerBed2);

    // 8. Cedar Park Benches
    const bench1 = this.createParkBench(parkGroup, 3.5, 0, -2, -Math.PI / 2);
    const bench2 = this.createParkBench(parkGroup, -3.5, 0, 8, Math.PI / 2);
    this.interactiveObjects.push(bench1, bench2);

    // Register Solid Park Colliders (World coordinates):
    // Park perimeter south fence (z = 29, entrance open at x between -30.5 and -25.5)
    this.registerBoxCollider(-45.0, -30.5, 28.85, 29.15, 0, 1.1, 'park_fence_left');
    this.registerBoxCollider(-25.5, -11.0, 28.85, 29.15, 0, 1.1, 'park_fence_right');

    // Park benches
    this.registerBoxCollider(-24.9, -24.1, 6.9, 9.1, 0, 0.9, 'park_bench_1');
    this.registerBoxCollider(-31.9, -31.1, 16.9, 19.1, 0, 0.9, 'park_bench_2');

    // Playground structure
    this.registerBoxCollider(-36.0, -32.0, 0.25, 3.75, 0, 3.2, 'park_playground');

    // Drinking water fountain
    this.registerCylinderCollider(-24.5, 14.5, 0.45, 0, 1.1, 'park_fountain');

    // Flower beds
    this.registerBoxCollider(-22.75, -18.25, 1.7, 3.3, 0, 0.5, 'park_flower_bed_1');
    this.registerBoxCollider(-22.75, -18.25, 14.7, 16.3, 0, 0.5, 'park_flower_bed_2');

    // Tree trunks
    this.registerCylinderCollider(-18.5, 8.0, 0.55, 0, 6.0, 'park_grand_sakura');
    this.registerCylinderCollider(-38.0, -1.0, 0.45, 0, 5.0, 'park_tree_1');
    this.registerCylinderCollider(-18.5, -2.0, 0.45, 0, 5.0, 'park_tree_2');
    this.registerCylinderCollider(-38.5, 21.0, 0.45, 0, 5.0, 'park_tree_3');
    this.registerCylinderCollider(-18.0, 22.0, 0.45, 0, 5.0, 'park_maple');
    this.registerCylinderCollider(-33.5, 10.5, 0.40, 0, 5.0, 'park_tree_4');

    // 9. Softening Shrubs & Grass Tufts along fence and path corners
    parkGroup.add(this.propsGen.createShrubCluster(-parkW / 2 + 1.2, 0, parkD / 2 - 0.4, 0.9));
    parkGroup.add(this.propsGen.createShrubCluster(parkW / 2 - 1.2, 0, parkD / 2 - 0.4, 0.95));
    parkGroup.add(this.propsGen.createShrubCluster(-13, 0, -14, 1.1));
    parkGroup.add(this.propsGen.createShrubCluster(12, 0, 9, 1.0));

    parkGroup.add(this.propsGen.createGrassTuft(-10, 0, -9.5, 1.1));
    parkGroup.add(this.propsGen.createGrassTuft(9.5, 0, -10.5, 1.0));
    parkGroup.add(this.propsGen.createGrassTuft(1.6, 0, -4, 0.9));

    this.scene.add(parkGroup);
  }

  createParkBench(group, x, y, z, rotY = 0) {
    const woodTex = ProceduralTextures.createWoodTexture();
    const benchGroup = new THREE.Group();
    benchGroup.position.set(x, y, z);
    benchGroup.rotation.y = rotY;

    const seatGeo = new THREE.BoxGeometry(2.0, 0.08, 0.55);
    const seatMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.6 });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.y = 0.5;
    seat.castShadow = true;
    benchGroup.add(seat);

    const backGeo = new THREE.BoxGeometry(2.0, 0.45, 0.08);
    const back = new THREE.Mesh(backGeo, seatMat);
    back.position.set(0, 0.8, -0.24);
    back.castShadow = true;
    benchGroup.add(back);

    [-0.85, 0.85].forEach((lx) => {
      const legGeo = new THREE.BoxGeometry(0.08, 0.5, 0.5);
      const legMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.25, 0);
      leg.castShadow = true;
      benchGroup.add(leg);
    });

    benchGroup.userData = {
      isInteractive: true,
      interactionType: 'bench',
      prompt: 'Sit',
      name: 'Park Bench',
      benchDimensions: {
        seatHeight: 0.54,
        seatDepth: 0.55,
        backrestOffset: -0.24,
      },
      onInteract: () => {
        const worldPos = new THREE.Vector3();
        benchGroup.getWorldPosition(worldPos);

        const worldQuat = new THREE.Quaternion();
        benchGroup.getWorldQuaternion(worldQuat);

        // Calculate world forward direction (perpendicular to backrest, facing away from bench)
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat).normalize();
        const heading = Math.atan2(forward.x, forward.z);

        // Seat anchor slightly in front of the backrest
        const seatAnchor = worldPos.clone().addScaledVector(forward, 0.06);
        seatAnchor.y = worldPos.y;

        globalBus.emit('player:sit', {
          position: seatAnchor,
          heading: heading,
          seatHeight: 0.54,
        });
      },
    };

    group.add(benchGroup);
    return benchGroup;
  }

  /**
   * Sakura Tree Variation 1: Broad Spreading Canopy
   */
  createSakuraTreeSpreading(group, x, y, z, scale = 1.0) {
    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, y, z);
    treeGroup.scale.setScalar(scale);

    // Trunk with root flare
    const trunkGeo = new THREE.CylinderGeometry(0.32, 0.52, 4.2, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.1;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);

    // Multi-layered Anime Blossom Clouds in a canopy container for wind motion
    const canopyGroup = new THREE.Group();
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xffa8b8,
      roughness: 0.8,
      flatShading: true,
    });
    const puffGeo = new THREE.DodecahedronGeometry(1.85, 1);

    const mainPuff = new THREE.Mesh(puffGeo, canopyMat);
    mainPuff.position.set(0, 4.6, 0);
    mainPuff.scale.set(1.45, 1.15, 1.45);
    mainPuff.castShadow = true;
    canopyGroup.add(mainPuff);

    const clusters = [
      [1.3, 4.1, 0.8, 0.95],
      [-1.2, 4.3, -0.9, 0.9],
      [0.4, 5.0, 1.1, 0.85],
      [-1.0, 4.7, 1.0, 0.88],
      [0.9, 4.4, -1.1, 0.9],
    ];
    clusters.forEach(([ox, oy, oz, s]) => {
      const cluster = new THREE.Mesh(puffGeo, canopyMat);
      cluster.position.set(ox, oy, oz);
      cluster.scale.setScalar(s);
      cluster.castShadow = true;
      canopyGroup.add(cluster);
    });

    treeGroup.add(canopyGroup);
    this.swayingCanopies.push({
      group: canopyGroup,
      initialRotZ: 0,
      initialRotX: 0,
      phase: Math.random() * Math.PI * 2,
      speed: 1.1 + Math.random() * 0.4,
      amp: 0.022,
    });

    group.add(treeGroup);
    return treeGroup;
  }

  /**
   * Sakura Tree Variation 2: Tall Stately Blossom Tree
   */
  createSakuraTreeTall(group, x, y, z, scale = 1.0) {
    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, y, z);
    treeGroup.scale.setScalar(scale);

    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.46, 5.2, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.6;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const canopyGroup = new THREE.Group();
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xffb7c5,
      roughness: 0.8,
      flatShading: true,
    });
    const puffGeo = new THREE.DodecahedronGeometry(1.6, 1);

    const topPuff = new THREE.Mesh(puffGeo, canopyMat);
    topPuff.position.set(0, 5.8, 0);
    topPuff.scale.set(1.2, 1.4, 1.2);
    topPuff.castShadow = true;
    canopyGroup.add(topPuff);

    const clusters = [
      [0.9, 4.8, 0.6, 0.9],
      [-0.9, 4.9, -0.6, 0.88],
      [-0.6, 5.4, 0.8, 0.85],
      [0.7, 5.2, -0.8, 0.85],
    ];
    clusters.forEach(([ox, oy, oz, s]) => {
      const cluster = new THREE.Mesh(puffGeo, canopyMat);
      cluster.position.set(ox, oy, oz);
      cluster.scale.setScalar(s);
      cluster.castShadow = true;
      canopyGroup.add(cluster);
    });

    treeGroup.add(canopyGroup);
    this.swayingCanopies.push({
      group: canopyGroup,
      initialRotZ: 0,
      initialRotX: 0,
      phase: Math.random() * Math.PI * 2,
      speed: 1.2 + Math.random() * 0.4,
      amp: 0.018,
    });

    group.add(treeGroup);
    return treeGroup;
  }

  /**
   * Sakura Tree Variation 3: Gentle Weeping Curve
   */
  createSakuraTreeWeeping(group, x, y, z, scale = 1.0) {
    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, y, z);
    treeGroup.scale.setScalar(scale);

    // Curved trunk
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.48, 4.4, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(0.3, 2.2, 0);
    trunk.rotation.z = -0.12;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const canopyGroup = new THREE.Group();
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xfbcfe8,
      roughness: 0.85,
      flatShading: true,
    });
    const puffGeo = new THREE.DodecahedronGeometry(1.7, 1);

    const mainPuff = new THREE.Mesh(puffGeo, canopyMat);
    mainPuff.position.set(0.6, 4.4, 0);
    mainPuff.scale.set(1.3, 1.0, 1.3);
    mainPuff.castShadow = true;
    canopyGroup.add(mainPuff);

    const clusters = [
      [-0.8, 3.8, 0.5, 0.85],
      [1.4, 3.7, -0.5, 0.88],
      [0.2, 4.8, 0.9, 0.8],
      [1.1, 4.2, 0.8, 0.82],
    ];
    clusters.forEach(([ox, oy, oz, s]) => {
      const cluster = new THREE.Mesh(puffGeo, canopyMat);
      cluster.position.set(ox, oy, oz);
      cluster.scale.setScalar(s);
      cluster.castShadow = true;
      canopyGroup.add(cluster);
    });

    treeGroup.add(canopyGroup);
    this.swayingCanopies.push({
      group: canopyGroup,
      initialRotZ: 0,
      initialRotX: 0,
      phase: Math.random() * Math.PI * 2,
      speed: 1.0 + Math.random() * 0.3,
      amp: 0.024,
    });

    group.add(treeGroup);
    return treeGroup;
  }

  /**
   * Sakura Tree Variation 4: Compact Residential Garden Blossom
   */
  createSakuraTreeCompact(group, x, y, z, scale = 1.0) {
    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, y, z);
    treeGroup.scale.setScalar(scale);

    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.38, 3.2, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x473324, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.6;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const canopyGroup = new THREE.Group();
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xf9a8d4,
      roughness: 0.8,
      flatShading: true,
    });
    const puffGeo = new THREE.DodecahedronGeometry(1.3, 1);

    const mainPuff = new THREE.Mesh(puffGeo, canopyMat);
    mainPuff.position.set(0, 3.5, 0);
    mainPuff.scale.set(1.2, 1.1, 1.2);
    mainPuff.castShadow = true;
    canopyGroup.add(mainPuff);

    const sidePuff = new THREE.Mesh(puffGeo, canopyMat);
    sidePuff.position.set(0.6, 3.2, 0.4);
    sidePuff.scale.setScalar(0.75);
    sidePuff.castShadow = true;
    canopyGroup.add(sidePuff);

    treeGroup.add(canopyGroup);
    this.swayingCanopies.push({
      group: canopyGroup,
      initialRotZ: 0,
      initialRotX: 0,
      phase: Math.random() * Math.PI * 2,
      speed: 1.3,
      amp: 0.016,
    });

    group.add(treeGroup);
    return treeGroup;
  }

  /**
   * Japanese Green Maple (Momiji / Keyaki) for species variety & authentic streetscape
   */
  createJapaneseGreenMaple(group, x, y, z, scale = 1.0) {
    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, y, z);
    treeGroup.scale.setScalar(scale);

    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.44, 4.4, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3f2e22, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.2;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const canopyGroup = new THREE.Group();
    const foliageMat = new THREE.MeshStandardMaterial({
      color: 0x16a34a, // Vibrant lush summer green
      roughness: 0.82,
      flatShading: true,
    });
    const puffGeo = new THREE.DodecahedronGeometry(1.65, 1);

    const mainPuff = new THREE.Mesh(puffGeo, foliageMat);
    mainPuff.position.set(0, 4.5, 0);
    mainPuff.scale.set(1.3, 1.1, 1.3);
    mainPuff.castShadow = true;
    canopyGroup.add(mainPuff);

    const clusters = [
      [1.1, 4.0, 0.6, 0.85],
      [-1.0, 4.2, -0.6, 0.88],
      [0.3, 5.1, 0.8, 0.8],
      [-0.8, 4.6, 0.7, 0.82],
    ];
    clusters.forEach(([ox, oy, oz, s]) => {
      const cluster = new THREE.Mesh(puffGeo, foliageMat);
      cluster.position.set(ox, oy, oz);
      cluster.scale.setScalar(s);
      cluster.castShadow = true;
      canopyGroup.add(cluster);
    });

    treeGroup.add(canopyGroup);
    this.swayingCanopies.push({
      group: canopyGroup,
      initialRotZ: 0,
      initialRotX: 0,
      phase: Math.random() * Math.PI * 2,
      speed: 1.15,
      amp: 0.02,
    });

    group.add(treeGroup);
    return treeGroup;
  }

  buildStreetInfrastructure() {
    // 1. Japanese Utility Poles with Transformers along outer sidewalk boundaries (keeps walking path clear)
    const polePositions = [
      [-8.2, 0, -80],
      [-8.2, 0, -45],
      [-8.2, 0, -10],
      [-8.2, 0, 25],
      [-8.2, 0, 60],
      [8.2, 0, -60],
      [8.2, 0, -25],
      [8.2, 0, 10],
      [8.2, 0, 45],
      [8.2, 0, 80],
    ];

    polePositions.forEach(([px, py, pz]) => {
      const { poleGroup, light } = this.propsGen.createUtilityPole(px, py, pz);
      this.scene.add(poleGroup);
      this.streetLights.push(light);
    });

    // 2. Connect Utility Poles with Catenary Overhead Wires
    this.propsGen.createOverheadWires(this.scene);

    // 3. Road Traffic Mirrors at Intersections
    const mirror1 = this.propsGen.createRoadMirror(-8.4, 0.18, -40, Math.PI / 4);
    const mirror2 = this.propsGen.createRoadMirror(8.4, 0.18, 40, -Math.PI / 4);
    this.scene.add(mirror1, mirror2);
    this.interactiveObjects.push(mirror1, mirror2);

    // 4. Japanese Public Red Postbox near Residential / Park Intersection
    const postbox = this.propsGen.createJapanesePostbox(-8.4, 0.18, 5, Math.PI / 2);
    this.scene.add(postbox);
    this.interactiveObjects.push(postbox);

    // 5. Japanese Road Signs (Speed 30 & Pedestrian)
    const sign1 = this.propsGen.createRoadSign(-8.2, 0.18, -25, 'speed30', 0);
    const sign2 = this.propsGen.createRoadSign(8.2, 0.18, 25, 'pedestrian', Math.PI);
    this.scene.add(sign1, sign2);

    // 6. Garbage Collection Station on Residential Lane
    const garbageStation = this.propsGen.createGarbageStation(-16, 0.18, -43.2);
    this.scene.add(garbageStation);
    this.interactiveObjects.push(garbageStation);

    // 7. Community Notice Boards (Residential corner & Park entrance)
    const noticeBoard1 = this.propsGen.createNoticeBoard(-14, 0.18, -37, 'community', Math.PI / 2);
    const noticeBoard2 = this.propsGen.createNoticeBoard(-8.8, 0.18, 7.5, 'park', -Math.PI / 2);
    this.scene.add(noticeBoard1, noticeBoard2);
    this.interactiveObjects.push(noticeBoard1, noticeBoard2);

    // 8. Japanese Vending Machine Hub on Shopping Street
    this.createVendingMachineHub(12, 0.18, 43.5);

    // Register Solid Street Infrastructure Colliders:
    // 10 Utility Poles
    polePositions.forEach(([px, py, pz]) => {
      this.registerCylinderCollider(px, pz, 0.28, 0, 9.0, 'utility_pole');
    });

    // Vending Machine Hub at (12, 43.5)
    this.registerBoxCollider(11.4, 12.6, 41.8, 45.2, 0, 2.1, 'vending_hub');

    // Japanese Public Red Postbox at (-8.4, 5.0)
    this.registerBoxCollider(-8.8, -8.0, 4.6, 5.4, 0, 1.4, 'postbox');

    // Garbage Collection Station at (-16, -43.2)
    this.registerBoxCollider(-17.3, -14.7, -43.8, -42.6, 0, 1.4, 'garbage_station');

    // Community Notice Boards
    this.registerBoxCollider(-14.3, -13.7, -38.0, -36.0, 0, 2.2, 'notice_board_1');
    this.registerBoxCollider(-9.1, -8.5, 6.5, 8.5, 0, 2.2, 'notice_board_2');

    // Road Traffic Mirrors
    this.registerCylinderCollider(-8.4, -40, 0.22, 0, 3.2, 'road_mirror_1');
    this.registerCylinderCollider(8.4, 40, 0.22, 0, 3.2, 'road_mirror_2');
  }

  createVendingMachineHub(x, y, z) {
    const hubGroup = new THREE.Group();
    hubGroup.position.set(x, y, z);
    hubGroup.rotation.y = -Math.PI / 2;

    // Machine 1: Red Boss Coffee
    const redTex = ProceduralTextures.createVendingMachineFrontTexture('red');
    const m1 = this.createVendingMachineUnit(0, 0, 0, 0xdc2626, redTex, 'Boss Coffee');
    hubGroup.add(m1);
    this.interactiveObjects.push(m1);

    // Machine 2: Blue Cold Green Tea & Water
    const blueTex = ProceduralTextures.createVendingMachineFrontTexture('blue');
    const m2 = this.createVendingMachineUnit(1.3, 0, 0, 0x0284c7, blueTex, 'Cold Green Tea');
    hubGroup.add(m2);
    this.interactiveObjects.push(m2);

    // Recycling Bin
    const binGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.85, 12);
    const binMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 });
    const bin = new THREE.Mesh(binGeo, binMat);
    bin.position.set(2.2, 0.425, 0);
    bin.castShadow = true;
    hubGroup.add(bin);

    this.scene.add(hubGroup);
  }

  createVendingMachineUnit(x, y, z, bodyColor, frontTex, drinkName) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const bodyGeo = new THREE.BoxGeometry(1.1, 1.95, 0.85);
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.3, roughness: 0.4 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.975;
    body.castShadow = true;
    group.add(body);

    const frontGeo = new THREE.PlaneGeometry(0.95, 1.8);
    const frontMat = new THREE.MeshStandardMaterial({
      map: frontTex,
      emissive: 0xffffff,
      emissiveMap: frontTex,
      emissiveIntensity: 0.4,
      roughness: 0.3,
    });
    const front = new THREE.Mesh(frontGeo, frontMat);
    front.position.set(0, 0.975, 0.43);
    group.add(front);

    group.userData = {
      isInteractive: true,
      interactionType: 'vending',
      prompt: `Buy ${drinkName}`,
      name: 'Vending Machine',
      onInteract: () => {
        globalBus.emit('dialogue:open', {
          speaker: 'Vending Machine',
          avatar: '🥫',
          text: `*Clunk!* A refreshing ${drinkName} dispensed into the bottom slot.`,
        });
        globalBus.emit('toast:show', { message: `Purchased ${drinkName}!` });
        globalBus.emit('quest:update', { questId: 'errand_drink', progress: 1.0 });
      },
    };

    return group;
  }

  getGridKey(gx, gz) {
    return `${gx}_${gz}`;
  }

  addColliderToGrid(collider) {
    const minGX = Math.floor(collider.minX / this.gridCellSize);
    const maxGX = Math.floor(collider.maxX / this.gridCellSize);
    const minGZ = Math.floor(collider.minZ / this.gridCellSize);
    const maxGZ = Math.floor(collider.maxZ / this.gridCellSize);

    for (let gx = minGX; gx <= maxGX; gx++) {
      for (let gz = minGZ; gz <= maxGZ; gz++) {
        const key = this.getGridKey(gx, gz);
        let cell = this.spatialGrid.get(key);
        if (!cell) {
          cell = [];
          this.spatialGrid.set(key, cell);
        }
        cell.push(collider);
      }
    }
  }

  registerBoxCollider(minX, maxX, minZ, maxZ, minY = 0, maxY = 25, label = 'box') {
    const collider = {
      type: 'box',
      minX: Math.min(minX, maxX),
      maxX: Math.max(minX, maxX),
      minZ: Math.min(minZ, maxZ),
      maxZ: Math.max(minZ, maxZ),
      minY,
      maxY,
      label,
    };
    this.colliders.push(collider);
    this.collisionBoxes.push(collider); // For backwards compatibility
    this.addColliderToGrid(collider);
  }

  registerCylinderCollider(cx, cz, radius, minY = 0, maxY = 25, label = 'cylinder') {
    const collider = {
      type: 'cylinder',
      cx,
      cz,
      radius,
      radiusSq: radius * radius,
      minX: cx - radius,
      maxX: cx + radius,
      minZ: cz - radius,
      maxZ: cz + radius,
      minY,
      maxY,
      label,
    };
    this.colliders.push(collider);
    this.collisionBoxes.push(collider); // For backwards compatibility
    this.addColliderToGrid(collider);
  }

  registerCollisionBox(centerX, centerZ, width, depth, minY = 0, maxY = 25) {
    this.registerBoxCollider(
      centerX - width / 2,
      centerX + width / 2,
      centerZ - depth / 2,
      centerZ + depth / 2,
      minY,
      maxY
    );
  }

  registerHouseColliders(cx, cz, w, d, rotY) {
    const halfW = w / 2;
    const halfD = d / 2;

    if (Math.abs(rotY) < 0.1) {
      // rotY = 0 (Facing South)
      this.registerBoxCollider(cx - halfW, cx + halfW, cz - halfD, cz + halfD, 0, 7.0, 'house_main');
      const wallW = w + 2.5;
      const wallD = d + 3.0;
      this.registerBoxCollider(cx - wallW / 2 - 0.1, cx - wallW / 2 + 0.1, cz - wallD / 2, cz + wallD / 2, 0, 1.2, 'house_fence_left');
      this.registerBoxCollider(cx + wallW / 2 - 0.1, cx + wallW / 2 + 0.1, cz - wallD / 2, cz + wallD / 2, 0, 1.2, 'house_fence_right');
      this.registerBoxCollider(cx - wallW / 2, cx + wallW / 2, cz - wallD / 2 - 0.1, cz - wallD / 2 + 0.1, 0, 1.2, 'house_fence_back');
      // Front left fence
      this.registerBoxCollider(cx - wallW / 2, cx - wallW * 0.14, cz + wallD / 2 - 0.1, cz + wallD / 2 + 0.1, 0, 1.2, 'house_fence_fl');
      // Front right fence
      this.registerBoxCollider(cx + wallW * 0.04, cx + wallW / 2, cz + wallD / 2 - 0.1, cz + wallD / 2 + 0.1, 0, 1.2, 'house_fence_fr');
    } else if (Math.abs(rotY - Math.PI) < 0.1 || Math.abs(rotY + Math.PI) < 0.1) {
      // rotY = PI (Facing North)
      this.registerBoxCollider(cx - halfW, cx + halfW, cz - halfD, cz + halfD, 0, 7.0, 'house_main');
      const wallW = w + 2.5;
      const wallD = d + 3.0;
      this.registerBoxCollider(cx - wallW / 2 - 0.1, cx - wallW / 2 + 0.1, cz - wallD / 2, cz + wallD / 2, 0, 1.2, 'house_fence_left');
      this.registerBoxCollider(cx + wallW / 2 - 0.1, cx + wallW / 2 + 0.1, cz - wallD / 2, cz + wallD / 2, 0, 1.2, 'house_fence_right');
      this.registerBoxCollider(cx - wallW / 2, cx + wallW / 2, cz + wallD / 2 - 0.1, cz + wallD / 2 + 0.1, 0, 1.2, 'house_fence_back');
      // Front left fence (world back right)
      this.registerBoxCollider(cx + wallW * 0.14, cx + wallW / 2, cz - wallD / 2 - 0.1, cz - wallD / 2 + 0.1, 0, 1.2, 'house_fence_fl');
      // Front right fence (world back left)
      this.registerBoxCollider(cx - wallW / 2, cx - wallW * 0.04, cz - wallD / 2 - 0.1, cz - wallD / 2 + 0.1, 0, 1.2, 'house_fence_fr');
    } else if (Math.abs(rotY - Math.PI / 2) < 0.1) {
      // rotY = PI/2 (Facing East)
      this.registerBoxCollider(cx - halfD, cx + halfD, cz - halfW, cz + halfW, 0, 7.0, 'house_main');
      const wallW = w + 2.5;
      const wallD = d + 3.0;
      this.registerBoxCollider(cx - wallD / 2 - 0.1, cx - wallD / 2 + 0.1, cz - wallW / 2, cz + wallW / 2, 0, 1.2, 'house_fence_back');
      this.registerBoxCollider(cx - wallD / 2, cx + wallD / 2, cz - wallW / 2 - 0.1, cz - wallW / 2 + 0.1, 0, 1.2, 'house_fence_left');
      this.registerBoxCollider(cx - wallD / 2, cx + wallD / 2, cz + wallW / 2 - 0.1, cz + wallW / 2 + 0.1, 0, 1.2, 'house_fence_right');
      this.registerBoxCollider(cx + wallD / 2 - 0.1, cx + wallD / 2 + 0.1, cz - wallW / 2, cz - wallW * 0.14, 0, 1.2, 'house_fence_fl');
      this.registerBoxCollider(cx + wallD / 2 - 0.1, cx + wallD / 2 + 0.1, cz + wallW * 0.04, cz + wallW / 2, 0, 1.2, 'house_fence_fr');
    } else {
      // rotY = -PI/2 (Facing West)
      this.registerBoxCollider(cx - halfD, cx + halfD, cz - halfW, cz + halfW, 0, 7.0, 'house_main');
      const wallW = w + 2.5;
      const wallD = d + 3.0;
      this.registerBoxCollider(cx + wallD / 2 - 0.1, cx + wallD / 2 + 0.1, cz - wallW / 2, cz + wallW / 2, 0, 1.2, 'house_fence_back');
      this.registerBoxCollider(cx - wallD / 2, cx + wallD / 2, cz - wallW / 2 - 0.1, cz - wallW / 2 + 0.1, 0, 1.2, 'house_fence_left');
      this.registerBoxCollider(cx - wallD / 2, cx + wallD / 2, cz + wallW / 2 - 0.1, cz + wallW / 2 + 0.1, 0, 1.2, 'house_fence_right');
      this.registerBoxCollider(cx - wallD / 2 - 0.1, cx - wallD / 2 + 0.1, cz + wallW * 0.14, cz + wallW / 2, 0, 1.2, 'house_fence_fl');
      this.registerBoxCollider(cx - wallD / 2 - 0.1, cx - wallD / 2 + 0.1, cz - wallW / 2, cz - wallW * 0.04, 0, 1.2, 'house_fence_fr');
    }
  }

  resolvePlayerMovement(pos, disp, radius = 0.38, y = 0, height = 1.80, stepHeight = 0.35) {
    const feetY = y;
    const headY = y + height;

    // Helper: De-penetrate position against a single collider
    const depenetrateFromCollider = (p, col) => {
      if (headY <= col.minY + stepHeight || feetY >= col.maxY) return;

      if (col.type === 'box') {
        const closestX = Math.max(col.minX, Math.min(p.x, col.maxX));
        const closestZ = Math.max(col.minZ, Math.min(p.z, col.maxZ));
        const dx = p.x - closestX;
        const dz = p.z - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          const dist = Math.sqrt(distSq);
          if (dist > 0.0001) {
            const overlap = radius - dist + 0.001;
            p.x += (dx / dist) * overlap;
            p.z += (dz / dist) * overlap;
          } else {
            // Center is inside the box: push out along shortest axis
            const penLeft = p.x - (col.minX - radius);
            const penRight = (col.maxX + radius) - p.x;
            const penBack = p.z - (col.minZ - radius);
            const penFront = (col.maxZ + radius) - p.z;
            const minPen = Math.min(penLeft, penRight, penBack, penFront);
            if (minPen === penLeft) p.x = col.minX - radius - 0.001;
            else if (minPen === penRight) p.x = col.maxX + radius + 0.001;
            else if (minPen === penBack) p.z = col.minZ - radius - 0.001;
            else p.z = col.maxZ + radius + 0.001;
          }
        }
      } else if (col.type === 'cylinder') {
        const dx = p.x - col.cx;
        const dz = p.z - col.cz;
        const distSq = dx * dx + dz * dz;
        const minDist = col.radius + radius;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          if (dist > 0.0001) {
            const overlap = minDist - dist + 0.001;
            p.x += (dx / dist) * overlap;
            p.z += (dz / dist) * overlap;
          } else {
            p.z += minDist + 0.001;
          }
        }
      }
    };

    // 1. Initial De-penetration Pass across all colliders
    for (let cIdx = 0; cIdx < this.colliders.length; cIdx++) {
      depenetrateFromCollider(pos, this.colliders[cIdx]);
    }

    // 2. Substepped Movement
    const totalDist = Math.hypot(disp.x, disp.z);
    if (totalDist < 0.00001) return pos;

    const maxSubstepDist = 0.04;
    const substeps = Math.min(12, Math.max(1, Math.ceil(totalDist / maxSubstepDist)));
    const stepX = disp.x / substeps;
    const stepZ = disp.z / substeps;

    for (let s = 0; s < substeps; s++) {
      // -------------------------------------------------------------
      // RESOLVE X AXIS
      // -------------------------------------------------------------
      if (Math.abs(stepX) > 0.00001) {
        let proposedX = pos.x + stepX;

        for (let cIdx = 0; cIdx < this.colliders.length; cIdx++) {
          const col = this.colliders[cIdx];
          if (headY <= col.minY + stepHeight || feetY >= col.maxY) continue;

          if (col.type === 'box') {
            const closestX = Math.max(col.minX, Math.min(proposedX, col.maxX));
            const closestZ = Math.max(col.minZ, Math.min(pos.z, col.maxZ));
            const dx = proposedX - closestX;
            const dz = pos.z - closestZ;

            if (dx * dx + dz * dz < radius * radius) {
              if (pos.x <= col.minX) {
                // Approaching box from left (+X movement into box)
                proposedX = Math.min(proposedX, col.minX - radius - 0.0005);
              } else if (pos.x >= col.maxX) {
                // Approaching box from right (-X movement into box)
                proposedX = Math.max(proposedX, col.maxX + radius + 0.0005);
              } else {
                // Along top or bottom face: reject X penetration
                proposedX = pos.x;
              }
            }
          } else if (col.type === 'cylinder') {
            const dx = proposedX - col.cx;
            const dz = pos.z - col.cz;
            const minDist = col.radius + radius;

            if (dx * dx + dz * dz < minDist * minDist) {
              const allowedDxSq = minDist * minDist - dz * dz;
              if (allowedDxSq > 0) {
                const allowedDx = Math.sqrt(allowedDxSq);
                if (pos.x <= col.cx) {
                  proposedX = Math.min(proposedX, col.cx - allowedDx - 0.0005);
                } else {
                  proposedX = Math.max(proposedX, col.cx + allowedDx + 0.0005);
                }
              } else {
                proposedX = pos.x;
              }
            }
          }
        }
        pos.x = proposedX;
      }

      // -------------------------------------------------------------
      // RESOLVE Z AXIS
      // -------------------------------------------------------------
      if (Math.abs(stepZ) > 0.00001) {
        let proposedZ = pos.z + stepZ;

        for (let cIdx = 0; cIdx < this.colliders.length; cIdx++) {
          const col = this.colliders[cIdx];
          if (headY <= col.minY + stepHeight || feetY >= col.maxY) continue;

          if (col.type === 'box') {
            const closestX = Math.max(col.minX, Math.min(pos.x, col.maxX));
            const closestZ = Math.max(col.minZ, Math.min(proposedZ, col.maxZ));
            const dx = pos.x - closestX;
            const dz = proposedZ - closestZ;

            if (dx * dx + dz * dz < radius * radius) {
              if (pos.z <= col.minZ) {
                // Approaching box from back (+Z movement into box)
                proposedZ = Math.min(proposedZ, col.minZ - radius - 0.0005);
              } else if (pos.z >= col.maxZ) {
                // Approaching box from front (-Z movement into box)
                proposedZ = Math.max(proposedZ, col.maxZ + radius + 0.0005);
              } else {
                // Along side face: reject Z penetration
                proposedZ = pos.z;
              }
            }
          } else if (col.type === 'cylinder') {
            const dx = pos.x - col.cx;
            const dz = proposedZ - col.cz;
            const minDist = col.radius + radius;

            if (dx * dx + dz * dz < minDist * minDist) {
              const allowedDzSq = minDist * minDist - dx * dx;
              if (allowedDzSq > 0) {
                const allowedDz = Math.sqrt(allowedDzSq);
                if (pos.z <= col.cz) {
                  proposedZ = Math.min(proposedZ, col.cz - allowedDz - 0.0005);
                } else {
                  proposedZ = Math.max(proposedZ, col.cz + allowedDz + 0.0005);
                }
              } else {
                proposedZ = pos.z;
              }
            }
          }
        }
        pos.z = proposedZ;
      }
    }

    // 3. Final De-penetration Safety Polish
    for (let cIdx = 0; cIdx < this.colliders.length; cIdx++) {
      depenetrateFromCollider(pos, this.colliders[cIdx]);
    }

    return pos;
  }

  checkCollision(x, z, radius = 0.38, y = 0, height = 1.80, stepHeight = 0.35) {
    const feetY = y;
    const headY = y + height;
    const radSq = radius * radius;

    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (headY <= c.minY + stepHeight || feetY >= c.maxY) continue;

      if (c.type === 'cylinder') {
        const dx = x - c.cx;
        const dz = z - c.cz;
        const minDist = radius + c.radius;
        if (dx * dx + dz * dz < minDist * minDist) {
          return true;
        }
      } else {
        const closestX = Math.max(c.minX, Math.min(x, c.maxX));
        const closestZ = Math.max(c.minZ, Math.min(z, c.maxZ));
        const dx = x - closestX;
        const dz = z - closestZ;
        if (dx * dx + dz * dz < radSq) {
          return true;
        }
      }
    }
    return false;
  }

  toggleCollisionDebug(enable = null) {
    if (enable === null) {
      this.debugCollisionVisible = !this.debugCollisionVisible;
    } else {
      this.debugCollisionVisible = !!enable;
    }

    if (this.debugCollisionGroup) {
      this.scene.remove(this.debugCollisionGroup);
      this.debugCollisionGroup = null;
    }

    if (this.debugCollisionVisible) {
      this.debugCollisionGroup = new THREE.Group();
      const wireMat = new THREE.MeshBasicMaterial({ color: 0xef4444, wireframe: true });

      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        if (c.type === 'box') {
          const w = c.maxX - c.minX;
          const d = c.maxZ - c.minZ;
          const h = c.maxY - c.minY;
          const geo = new THREE.BoxGeometry(w, h, d);
          const mesh = new THREE.Mesh(geo, wireMat);
          mesh.position.set((c.minX + c.maxX) / 2, c.minY + h / 2, (c.minZ + c.maxZ) / 2);
          this.debugCollisionGroup.add(mesh);
        } else if (c.type === 'cylinder') {
          const h = c.maxY - c.minY;
          const geo = new THREE.CylinderGeometry(c.radius, c.radius, h, 12, 1, true);
          const mesh = new THREE.Mesh(geo, wireMat);
          mesh.position.set(c.cx, c.minY + h / 2, c.cz);
          this.debugCollisionGroup.add(mesh);
        }
      }
      this.scene.add(this.debugCollisionGroup);
    }
    return this.debugCollisionVisible;
  }

  validateAndLogColliders() {
    let treeCount = 0;
    let poleCount = 0;
    let carCount = 0;
    let fenceCount = 0;
    let benchCount = 0;
    let buildingCount = 0;
    let propCount = 0;

    for (const c of this.colliders) {
      const lbl = c.label || '';
      if (lbl.includes('tree') || lbl.includes('sakura') || lbl.includes('maple')) {
        treeCount++;
      } else if (lbl.includes('pole')) {
        poleCount++;
      } else if (lbl.includes('car')) {
        carCount++;
      } else if (lbl.includes('fence') || lbl.includes('planter')) {
        fenceCount++;
      } else if (lbl.includes('bench')) {
        benchCount++;
      } else if (lbl.includes('house') || lbl.includes('apt') || lbl.includes('hikari_') || lbl.includes('building')) {
        buildingCount++;
      } else {
        propCount++;
      }
    }

    if (typeof window !== 'undefined' || (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production')) {
      console.log(
        `[WorldSystem] World colliders registered: ${this.colliders.length} | Trees: ${treeCount} | Poles: ${poleCount} | Cars: ${carCount} | Fences/Planters: ${fenceCount} | Benches: ${benchCount} | Buildings/Interiors: ${buildingCount} | Props: ${propCount}`
      );
    }
  }

  setupSakuraParticles() {
    const petalCount = 280;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(petalCount * 3);
    const velocities = new Float32Array(petalCount * 3);

    for (let i = 0; i < petalCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 85;
      positions[i * 3 + 1] = Math.random() * 10 + 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 85;

      velocities[i * 3] = (Math.random() - 0.5) * 0.35 - 0.35;
      velocities[i * 3 + 1] = -(Math.random() * 0.25 + 0.18);
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff758f';
    ctx.beginPath();
    ctx.ellipse(16, 16, 12, 6, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    const petalTex = new THREE.CanvasTexture(canvas);
    const material = new THREE.PointsMaterial({
      size: 0.32,
      map: petalTex,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });

    this.petalsParticleSystem = new THREE.Points(geometry, material);
    this.petalsVelocities = velocities;
    this.scene.add(this.petalsParticleSystem);
  }

  advanceTime(hours = 1.0) {
    this.timeOfDayHours = (this.timeOfDayHours + hours) % 24;
    if (this.timeOfDayHours < 0) this.timeOfDayHours += 24;
    this.broadcastTime();
    this.updateSunPosition();
  }

  setTimeOfDay(hours = 9.0) {
    if (typeof hours === 'number' && isFinite(hours)) {
      this.timeOfDayHours = (hours % 24 + 24) % 24;
      this.broadcastTime();
      this.updateSunPosition();
    }
  }

  stepTimeOfDay() {
    this.advanceTime(1.0);
  }

  getStateForSave() {
    return {
      timeOfDayHours: this.timeOfDayHours,
    };
  }

  restoreState(data) {
    if (data && typeof data.timeOfDayHours === 'number') {
      this.setTimeOfDay(data.timeOfDayHours);
    }
  }

  resetWorld() {
    this.setTimeOfDay(9.0);
  }

  broadcastTime() {
    const hours = Math.floor(this.timeOfDayHours);
    const mins = Math.floor((this.timeOfDayHours % 1) * 60);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
    const timeStr = `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;

    let icon = '☀️';
    if (hours >= 5 && hours < 8) icon = '🌅';
    else if (hours >= 8 && hours < 16) icon = '☀️';
    else if (hours >= 16 && hours < 19) icon = '🌇';
    else icon = '🌙';

    globalBus.emit('time:updated', {
      hours: this.timeOfDayHours,
      timeStr,
      icon,
    });
  }

  buildBackgroundScenery() {
    const bgGroup = new THREE.Group();

    // 1. Distant rolling green hills/mountains framing the horizon (Radius ~150-210m)
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x6ee7b7,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
    });

    const hillPositions = [
      // North backdrop hills
      { x: 0, z: -175, r: 85, h: 28 },
      { x: -90, z: -165, r: 75, h: 24 },
      { x: 95, z: -170, r: 80, h: 26 },
      // East backdrop hills
      { x: 180, z: 0, r: 90, h: 30 },
      { x: 170, z: -80, r: 70, h: 22 },
      { x: 175, z: 85, r: 75, h: 25 },
      // West backdrop hills
      { x: -180, z: 0, r: 88, h: 28 },
      { x: -170, z: -85, r: 72, h: 23 },
      { x: -175, z: 80, r: 76, h: 24 },
      // South backdrop hills
      { x: 0, z: 180, r: 85, h: 26 },
      { x: -85, z: 170, r: 70, h: 22 },
      { x: 90, z: 175, r: 78, h: 25 },
    ];

    hillPositions.forEach((hp) => {
      const hillGeo = new THREE.ConeGeometry(hp.r, hp.h, 16);
      const hill = new THREE.Mesh(hillGeo, hillMat);
      hill.position.set(hp.x, hp.h / 2 - 2, hp.z);
      hill.receiveShadow = false;
      bgGroup.add(hill);
    });

    // 2. Distant tree line canopy silhouettes along outer ridges
    const distantFoliageMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      roughness: 0.9,
      flatShading: true,
    });
    const foliagePuffGeo = new THREE.DodecahedronGeometry(8, 1);

    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 10) {
      const dist = 145 + (Math.sin(angle * 4) * 12);
      const fx = Math.cos(angle) * dist;
      const fz = Math.sin(angle) * dist;
      const puff = new THREE.Mesh(foliagePuffGeo, distantFoliageMat);
      puff.position.set(fx, 4.5, fz);
      puff.scale.set(1.4, 1.0 + Math.sin(angle * 3) * 0.3, 1.4);
      bgGroup.add(puff);
    }

    // 3. Distant Japanese Neighborhood Silhouettes (Perimeter depth beyond playable bounds)
    const distantBuildings = [
      // North residential skyline
      { x: -25, z: -112, rotY: 0, w: 14, d: 11, h: 8.5, type: 'house', wall: 0xd1d5db, roof: 0x334155 },
      { x: 0, z: -118, rotY: 0, w: 16, d: 10, h: 9.0, type: 'mansion', wall: 0xe2e8f0, roof: 0x1e293b },
      { x: 28, z: -112, rotY: 0, w: 13, d: 11, h: 8.0, type: 'house', wall: 0xf3f4f6, roof: 0x475569 },
      // South residential skyline
      { x: -24, z: 108, rotY: Math.PI, w: 14, d: 11, h: 8.5, type: 'house', wall: 0xd1d5db, roof: 0x334155 },
      { x: 0, z: 114, rotY: Math.PI, w: 16, d: 10, h: 9.2, type: 'mansion', wall: 0xf1f5f9, roof: 0x1e293b },
      { x: 26, z: 108, rotY: Math.PI, w: 13, d: 11, h: 8.0, type: 'house', wall: 0xe5e7eb, roof: 0x475569 },
      // West backdrop (Behind Sakura Heights)
      { x: -68, z: -38, rotY: Math.PI / 2, w: 15, d: 12, h: 9.5, type: 'mansion', wall: 0xe2e8f0, roof: 0x334155 },
      { x: -66, z: -15, rotY: Math.PI / 2, w: 13, d: 10, h: 8.0, type: 'house', wall: 0xf3f4f6, roof: 0x1e293b },
      { x: -66, z: -62, rotY: Math.PI / 2, w: 13, d: 10, h: 8.0, type: 'house', wall: 0xd1d5db, roof: 0x475569 },
      // East backdrop (Behind HIKARI MART)
      { x: 62, z: 42, rotY: -Math.PI / 2, w: 15, d: 12, h: 9.0, type: 'mansion', wall: 0xf1f5f9, roof: 0x334155 },
      { x: 60, z: 18, rotY: -Math.PI / 2, w: 13, d: 10, h: 8.0, type: 'house', wall: 0xe5e7eb, roof: 0x1e293b },
      { x: 60, z: 65, rotY: -Math.PI / 2, w: 13, d: 10, h: 8.0, type: 'house', wall: 0xd1d5db, roof: 0x475569 },
    ];

    distantBuildings.forEach((db) => {
      const bMesh = this.buildingGen.createDistantBuildingBlock({
        x: db.x,
        z: db.z,
        rotationY: db.rotY,
        width: db.w,
        depth: db.d,
        height: db.h,
        type: db.type,
        wallColor: db.wall,
        roofColor: db.roof,
      });
      bgGroup.add(bMesh);
    });

    // 4. Distant Transmission Pylon / Antenna Silhouette on Hilltop
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.8,
      roughness: 0.4,
    });
    const pylonGroup = new THREE.Group();
    pylonGroup.position.set(-85, 22, -155);

    const mastGeo = new THREE.CylinderGeometry(0.2, 0.9, 18, 4);
    const mast = new THREE.Mesh(mastGeo, pylonMat);
    mast.position.y = 9;
    pylonGroup.add(mast);

    [-3, 0, 3].forEach((cy, idx) => {
      const crossGeo = new THREE.BoxGeometry(4.5 - idx * 0.8, 0.15, 0.15);
      const cross = new THREE.Mesh(crossGeo, pylonMat);
      cross.position.y = 12 + cy;
      pylonGroup.add(cross);
    });
    bgGroup.add(pylonGroup);

    // 5. Vanishing Point Road Extensions (Extends Main Street into atmospheric distance)
    const asphaltTex = ProceduralTextures.createAsphaltTexture();
    asphaltTex.repeat.set(4, 8);
    const extMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.85 });

    // North Road Extension
    const northExtGeo = new THREE.PlaneGeometry(8.5, 45);
    const northExt = new THREE.Mesh(northExtGeo, extMat);
    northExt.rotation.x = -Math.PI / 2;
    northExt.position.set(0, 0.018, -132.5);
    bgGroup.add(northExt);

    // South Road Extension
    const southExtGeo = new THREE.PlaneGeometry(8.5, 45);
    const southExt = new THREE.Mesh(southExtGeo, extMat);
    southExt.rotation.x = -Math.PI / 2;
    southExt.position.set(0, 0.018, 132.5);
    bgGroup.add(southExt);

    this.scene.add(bgGroup);
  }

  buildStreetVegetationClusters() {
    const vegGroup = new THREE.Group();

    // 1. Natural 1-3 tree clusters along road corridors framing scenic views (Slow Roads-inspired layout)
    const treeClusters = [
      // Cluster A: Framing Sakura Heights forecourt & west residential corner
      { x: -14.5, z: -32, type: 'spreading', s: 0.95 },
      { x: -16.5, z: -48, type: 'tall', s: 1.05 },
      { x: -14.0, z: -58, type: 'compact', s: 0.9 },
      // Cluster B: Framing entrance corridor to Sakuragaoka Park
      { x: -12.5, z: -2, type: 'weeping', s: 1.05 },
      { x: -13.5, z: 22, type: 'green_maple', s: 1.0 },
      // Cluster C: Framing Shopping Street toward HIKARI MART (keeps storefront & parking wide open)
      { x: 14.5, z: 28, type: 'tall', s: 1.0 },
      { x: 15.5, z: 56, type: 'spreading', s: 0.95 },
      { x: 14.0, z: 18, type: 'green_maple', s: 0.95 },
      // Cluster D: North scenic road enclosure
      { x: -12.5, z: -68, type: 'spreading', s: 1.05 },
      { x: 13.5, z: -70, type: 'tall', s: 1.0 },
      { x: -13.0, z: -92, type: 'green_maple', s: 0.95 },
      // Cluster E: South scenic road vista
      { x: -13.5, z: 62, type: 'tall', s: 0.95 },
      { x: 14.0, z: 65, type: 'weeping', s: 1.05 },
      { x: 13.5, z: 86, type: 'compact', s: 0.9 },
    ];

    treeClusters.forEach((tc) => {
      let tree;
      const s = tc.s || 1.0;
      if (tc.type === 'spreading') {
        tree = this.createSakuraTreeSpreading(vegGroup, tc.x, 0, tc.z, s);
      } else if (tc.type === 'tall') {
        tree = this.createSakuraTreeTall(vegGroup, tc.x, 0, tc.z, s);
      } else if (tc.type === 'compact') {
        tree = this.createSakuraTreeCompact(vegGroup, tc.x, 0, tc.z, s);
      } else if (tc.type === 'green_maple') {
        tree = this.createJapaneseGreenMaple(vegGroup, tc.x, 0, tc.z, s);
      } else {
        tree = this.createSakuraTreeWeeping(vegGroup, tc.x, 0, tc.z, s);
      }
      tree.rotation.y = (tc.x * 17 + tc.z * 31) % Math.PI;

      // Register solid world collider for tree trunk
      this.registerCylinderCollider(tc.x, tc.z, 0.44 * s, 0, 6.0, `street_tree_${tc.type}`);
    });

    // 2. Low decorative hedge planters along property borders (clean foreground framing)
    const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.85 });
    const planterMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 });

    const planterPositions = [
      // West residential sidewalk boundary
      { x: -9.2, z: -25, len: 12 },
      { x: -9.2, z: -55, len: 10 },
      // East commercial sidewalk boundary
      { x: 9.2, z: 20, len: 14 },
      { x: 9.2, z: -20, len: 12 },
    ];

    planterPositions.forEach((pp) => {
      const boxGeo = new THREE.BoxGeometry(0.5, 0.35, pp.len);
      const box = new THREE.Mesh(boxGeo, planterMat);
      box.position.set(pp.x, 0.28, pp.z);
      box.castShadow = true;
      box.receiveShadow = true;
      vegGroup.add(box);

      const hedgeGeo = new THREE.BoxGeometry(0.42, 0.45, pp.len - 0.2);
      const hedge = new THREE.Mesh(hedgeGeo, hedgeMat);
      hedge.position.set(pp.x, 0.58, pp.z);
      hedge.castShadow = true;
      vegGroup.add(hedge);

      // Register solid world collider for sidewalk planter box
      this.registerBoxCollider(
        pp.x - 0.32,
        pp.x + 0.32,
        pp.z - pp.len / 2,
        pp.z + pp.len / 2,
        0,
        1.1,
        'sidewalk_planter'
      );
    });

    // 3. Shrub Clusters softening residential walls, house corners, and HIKARI MART side
    const shrubLocs = [
      [-19, 0, -32, 1.0],
      [-36, 0, -38, 0.9],
      [-20, 0, 75, 1.05],
      [20, 0, -85, 0.95],
      [31, 0, 34, 1.1], // Hikari Mart side wall
      [18, 0, 52, 0.85],
    ];
    shrubLocs.forEach(([sx, sy, sz, sc]) => {
      vegGroup.add(this.propsGen.createShrubCluster(sx, sy, sz, sc));
    });

    // 4. Low grass tufts along residential lawn edges
    const tuftLocs = [
      [-14.5, 0, -30],
      [-12.5, 0, 0],
      [14.5, 0, 26],
      [13.5, 0, -68],
    ];
    tuftLocs.forEach(([tx, ty, tz]) => {
      vegGroup.add(this.propsGen.createGrassTuft(tx, ty, tz, 0.9));
    });

    this.scene.add(vegGroup);
  }

  updateSunPosition() {
    if (!this.sunLight) return;
    const hours = this.timeOfDayHours;
    const angle = ((hours - 6) / 24) * Math.PI * 2;
    const sunElevation = Math.sin(angle);
    const sunDist = 70;

    // Smooth orbital sun tracking
    this.sunLight.position.x = Math.cos(angle) * sunDist;
    this.sunLight.position.y = Math.max(sunElevation * sunDist + 8, 16);
    this.sunLight.position.z = 32 + Math.sin(angle) * 14;

    if (hours >= 5.0 && hours < 9.0) {
      // 1. MORNING (Fresh, crisp, soft warm golden-white light, gentle peach horizon)
      const t = (hours - 5.0) / 4.0;
      this.sunLight.intensity = 1.05 + t * 0.17; // 1.05 -> 1.22
      this.sunLight.color.setHex(0xfff7ed);
      this.hemiLight.color.setHex(0xe0f2fe);
      this.hemiLight.groundColor.setHex(0xbbf7d0);
      this.hemiLight.intensity = 0.74;
      this.ambientLight.color.setHex(0xffffff);
      this.ambientLight.intensity = 0.35;

      this.skyMesh.material.uniforms.topColor.value.setHex(0x38bdf8);
      this.skyMesh.material.uniforms.bottomColor.value.setHex(0xfef3c7);
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0xe0f2fe);
        this.scene.fog.near = 80;
        this.scene.fog.far = 260;
      }
      this.streetLights.forEach((l) => (l.intensity = 0.1));
    } else if (hours >= 9.0 && hours < 15.0) {
      // 2. MIDDAY (Clear high cerulean sky, balanced neutral-warm daylight, clean readability)
      this.sunLight.intensity = 1.24;
      this.sunLight.color.setHex(0xfffdfa);
      this.hemiLight.color.setHex(0xbae6fd);
      this.hemiLight.groundColor.setHex(0xbbf7d0);
      this.hemiLight.intensity = 0.78;
      this.ambientLight.color.setHex(0xffffff);
      this.ambientLight.intensity = 0.36;

      this.skyMesh.material.uniforms.topColor.value.setHex(0x0ea5e9);
      this.skyMesh.material.uniforms.bottomColor.value.setHex(0xe0f2fe);
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0xdbeafe);
        this.scene.fog.near = 85;
        this.scene.fog.far = 265;
      }
      this.streetLights.forEach((l) => (l.intensity = 0.05));
    } else if (hours >= 15.0 && hours < 17.5) {
      // 3. AFTERNOON (Warm honey-golden sunlight, soft amber atmosphere, gentle long shadows)
      this.sunLight.intensity = 1.18;
      this.sunLight.color.setHex(0xfef08a);
      this.hemiLight.color.setHex(0xfde68a);
      this.hemiLight.groundColor.setHex(0xcbd5e1);
      this.hemiLight.intensity = 0.72;
      this.ambientLight.color.setHex(0xfffbeb);
      this.ambientLight.intensity = 0.36;

      this.skyMesh.material.uniforms.topColor.value.setHex(0x0284c7);
      this.skyMesh.material.uniforms.bottomColor.value.setHex(0xfde68a);
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0xfef3c7);
        this.scene.fog.near = 80;
        this.scene.fog.far = 250;
      }
      this.streetLights.forEach((l) => (l.intensity = 0.25));
    } else if (hours >= 17.5 && hours < 20.0) {
      // 4. EVENING / SUNSET (Rich amber-tangerine glow, warm twilight sky, streetlights turn on)
      this.sunLight.intensity = 0.95;
      this.sunLight.color.setHex(0xfb923c);
      this.hemiLight.color.setHex(0xf472b6);
      this.hemiLight.groundColor.setHex(0x475569);
      this.hemiLight.intensity = 0.65;
      this.ambientLight.color.setHex(0xfed7aa);
      this.ambientLight.intensity = 0.38;

      this.skyMesh.material.uniforms.topColor.value.setHex(0x6366f1);
      this.skyMesh.material.uniforms.bottomColor.value.setHex(0xf97316);
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0xfed7aa);
        this.scene.fog.near = 75;
        this.scene.fog.far = 240;
      }
      this.streetLights.forEach((l) => (l.intensity = 1.5));
    } else {
      // 5. NIGHT (Peaceful, soft midnight blue/lavender ambiance, navigable & fully visible, never pitch black)
      this.sunLight.intensity = 0.32;
      this.sunLight.color.setHex(0x93c5fd); // Soft lunar key light
      this.sunLight.position.set(-30, 52, 28);

      this.hemiLight.color.setHex(0x1e293b);
      this.hemiLight.groundColor.setHex(0x0f172a);
      this.hemiLight.intensity = 0.52;
      this.ambientLight.color.setHex(0x38bdf8);
      this.ambientLight.intensity = 0.28;

      this.skyMesh.material.uniforms.topColor.value.setHex(0x020617);
      this.skyMesh.material.uniforms.bottomColor.value.setHex(0x1e1b4b);
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0x0f172a);
        this.scene.fog.near = 65;
        this.scene.fog.far = 210;
      }
      this.streetLights.forEach((l) => (l.intensity = 1.8));
    }
  }

  update(delta, elapsedTime) {
    if (globalGameState.is(GameState.PAUSED)) return;

    // 1. Subtle, slow wind sway on tree canopies for calm breathing neighborhood atmosphere
    if (this.swayingCanopies && this.swayingCanopies.length > 0) {
      for (let i = 0; i < this.swayingCanopies.length; i++) {
        const item = this.swayingCanopies[i];
        const sway = Math.sin(elapsedTime * item.speed + item.phase) * item.amp;
        item.group.rotation.z = item.initialRotZ + sway;
        item.group.rotation.x = item.initialRotX + sway * 0.45;
      }
    }

    // 2. Sakura petal drift physics with gentle wave oscillation
    if (this.petalsParticleSystem) {
      const posAttr = this.petalsParticleSystem.geometry.attributes.position;
      const count = posAttr.count;

      for (let i = 0; i < count; i++) {
        let px = posAttr.getX(i) + this.petalsVelocities[i * 3] * delta;
        let py = posAttr.getY(i) + this.petalsVelocities[i * 3 + 1] * delta;
        let pz = posAttr.getZ(i) + this.petalsVelocities[i * 3 + 2] * delta;

        // Subtle swaying wave
        px += Math.sin(elapsedTime * 1.5 + i) * 0.005;

        if (py < 0.1 || px < -50 || px > 50 || pz < -50 || pz > 50) {
          px = (Math.random() - 0.5) * 85;
          py = Math.random() * 6 + 6;
          pz = (Math.random() - 0.5) * 85;
        }

        posAttr.setXYZ(i, px, py, pz);
      }
      posAttr.needsUpdate = true;
    }
  }
}
