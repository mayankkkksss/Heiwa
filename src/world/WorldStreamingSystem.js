import * as THREE from 'three';
import {
  HEIWA_WORLD_SEED,
  getChunkRng,
  hashChunkCoords,
  getTerrainHeight,
  getRoadCorridor,
  validateBuildingPlacement,
  getLandUseZone,
  getChunkRoadConfig,
  getChunkDestination,
  DestinationType,
  LandUseZone,
} from '../utils/SeededRandom.js';
import { ProceduralTextures } from '../utils/ProceduralTextures.js';
import { globalBus } from '../engine/EventBus.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';

export const CHUNK_SIZE = 100; // 100m x 100m per chunk
export const ACTIVE_RADIUS = 2; // 5x5 chunk grid active around player/car
export const UNLOAD_RADIUS = 3; // Chunks > 3 radius are unloaded
export const AUTHORED_BOUNDS = { minX: -140, maxX: 140, minZ: -140, maxZ: 140 };

/**
 * WorldStreamingSystem - Manages deterministic infinite open-world chunk generation,
 * multi-tier road hierarchy, land-use zoning, world destinations, distant horizon scenery,
 * and authoritative collision synchronization.
 */
export class WorldStreamingSystem {
  constructor() {
    this.scene = null;
    this.worldSystem = null;
    this.worldSeed = HEIWA_WORLD_SEED;

    this.activeChunks = new Map(); // key: "x,z" -> ChunkObject
    this.generationQueue = [];
    this.currentCenterChunk = { x: 0, z: 0 };
    this.targetFollowPos = new THREE.Vector3(0, 0, 0);
    this.targetFollowVelocity = new THREE.Vector3(0, 0, 0);

    // Track session destination discoveries
    this.discoveredDestinations = new Set();

    // Shared Materials to optimize draw calls and browser memory
    this.sharedMaterials = null;

    // Distant horizon mountain backdrop mesh
    this.horizonMesh = null;
  }

  init(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.worldSystem = engine.systems.find((s) => typeof s.checkCollision === 'function');

    this.initSharedMaterials();
    this.createDistantHorizonScenery();

    // Listen for player / vehicle movement to update streaming focus
    globalBus.on('player:moved', (data) => {
      this.targetFollowPos.copy(data.position);
    });

    globalBus.on('vehicle:moved', (data) => {
      this.targetFollowPos.copy(data.position);
      if (data.velocity) {
        this.targetFollowVelocity.copy(data.velocity);
      }
    });

    globalBus.on('state:changed', (data) => {
      if (data.to === GameState.PLAYING) {
        this.updateStreaming(true);
      }
    });

    // Initial streaming evaluation
    this.updateStreaming(true);
  }

  initSharedMaterials() {
    const grassTex = ProceduralTextures.createGrassTexture();
    grassTex.repeat.set(12, 12);

    const asphaltTex = ProceduralTextures.createAsphaltTexture();
    asphaltTex.repeat.set(4, 16);

    const gravelTex = ProceduralTextures.createSidewalkTexture();
    gravelTex.repeat.set(6, 6);

    this.sharedMaterials = {
      terrainSuburban: new THREE.MeshStandardMaterial({
        map: grassTex,
        roughness: 0.90,
        metalness: 0.02,
      }),
      terrainFarmland: new THREE.MeshStandardMaterial({
        color: 0x84a955,
        map: grassTex,
        roughness: 0.94,
        metalness: 0.01,
      }),
      terrainWoodland: new THREE.MeshStandardMaterial({
        color: 0x3d6b38,
        map: grassTex,
        roughness: 0.88,
        metalness: 0.02,
      }),
      farmlandCrop: new THREE.MeshStandardMaterial({
        color: 0x65a30d,
        roughness: 0.92,
      }),
      soilBed: new THREE.MeshStandardMaterial({
        color: 0x713f12,
        roughness: 0.95,
      }),
      pavedPlaza: new THREE.MeshStandardMaterial({
        map: gravelTex,
        roughness: 0.82,
        metalness: 0.05,
      }),
      road: new THREE.MeshStandardMaterial({
        map: asphaltTex,
        roughness: 0.85,
        metalness: 0.05,
      }),
      roadLine: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
      }),
      roadLineYellow: new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        roughness: 0.4,
      }),
      guardrailMetal: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.45,
        metalness: 0.7,
      }),
      waterSurface: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.1,
        metalness: 0.2,
        transparent: true,
        opacity: 0.82,
      }),
      bridgeDeck: new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.8,
      }),
      woodTrunk: new THREE.MeshStandardMaterial({
        color: 0x5c3a21,
        roughness: 0.9,
      }),
      cherryCanopy: new THREE.MeshStandardMaterial({
        color: 0xffb7c5,
        roughness: 0.8,
      }),
      greenCanopy: new THREE.MeshStandardMaterial({
        color: 0x2e7d32,
        roughness: 0.85,
      }),
      pineCanopy: new THREE.MeshStandardMaterial({
        color: 0x1b4332,
        roughness: 0.88,
      }),
      wallLight: new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        roughness: 0.8,
      }),
      wallCream: new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        roughness: 0.85,
      }),
      wallWood: new THREE.MeshStandardMaterial({
        color: 0x854d0e,
        roughness: 0.75,
      }),
      wallBarn: new THREE.MeshStandardMaterial({
        color: 0x991b1b,
        roughness: 0.85,
      }),
      roofSlate: new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.6,
      }),
      roofTerracotta: new THREE.MeshStandardMaterial({
        color: 0x9a3412,
        roughness: 0.65,
      }),
      poleMetal: new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.5,
        metalness: 0.6,
      }),
      vendingBodyRed: new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        roughness: 0.4,
        metalness: 0.3,
      }),
      vendingBodyBlue: new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        roughness: 0.4,
        metalness: 0.3,
      }),
      concreteBase: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.9,
      }),
      fenceWood: new THREE.MeshStandardMaterial({
        color: 0x78350f,
        roughness: 0.85,
      }),
      horizonMountain: new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.95,
        flatShading: true,
      }),
    };
  }

  /**
   * Panoramic low-poly mountain ring at the horizon providing continuous atmospheric depth
   */
  createDistantHorizonScenery() {
    if (this.horizonMesh) return;

    const segments = 32;
    const ringRadius = 480;
    const horizonGroup = new THREE.Group();
    horizonGroup.name = 'Distant_Horizon_Scenery';

    const geo = new THREE.BufferGeometry();
    const positions = [];
    const indices = [];

    // Create a 32-segment panoramic mountain silhouette ring
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.sin(angle) * ringRadius;
      const z = Math.cos(angle) * ringRadius;

      // Deterministic mountain peak variations
      const peakH = 32 + Math.sin(i * 1.8 + this.worldSeed * 0.01) * 18 + Math.cos(i * 3.4) * 10;

      // Bottom vertex
      positions.push(x, -5, z);
      // Top vertex (peak)
      positions.push(x * 1.04, peakH, z * 1.04);
    }

    for (let i = 0; i < segments; i++) {
      const b1 = i * 2;
      const t1 = i * 2 + 1;
      const b2 = (i + 1) * 2;
      const t2 = (i + 1) * 2 + 1;

      // Two triangles per quad segment
      indices.push(b1, t1, b2);
      indices.push(b2, t1, t2);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mountainMesh = new THREE.Mesh(geo, this.sharedMaterials.horizonMountain);
    mountainMesh.name = 'Horizon_Mountain_Mesh';
    horizonGroup.add(mountainMesh);

    this.scene.add(horizonGroup);
    this.horizonMesh = horizonGroup;
  }

  isInsideAuthoredArea(x, z, margin = 0) {
    return (
      x >= AUTHORED_BOUNDS.minX - margin &&
      x <= AUTHORED_BOUNDS.maxX + margin &&
      z >= AUTHORED_BOUNDS.minZ - margin &&
      z <= AUTHORED_BOUNDS.maxZ + margin
    );
  }

  isChunkFullyAuthored(chunkX, chunkZ) {
    const minX = chunkX * CHUNK_SIZE - CHUNK_SIZE / 2;
    const maxX = chunkX * CHUNK_SIZE + CHUNK_SIZE / 2;
    const minZ = chunkZ * CHUNK_SIZE - CHUNK_SIZE / 2;
    const maxZ = chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2;

    return (
      minX >= AUTHORED_BOUNDS.minX &&
      maxX <= AUTHORED_BOUNDS.maxX &&
      minZ >= AUTHORED_BOUNDS.minZ &&
      maxZ <= AUTHORED_BOUNDS.maxZ
    );
  }

  updateStreaming(arg1, arg2) {
    let immediate = false;
    if (typeof arg1 === 'boolean') {
      immediate = arg1;
    } else if (arg1 && typeof arg1.x === 'number') {
      this.targetFollowPos.copy(arg1);
      immediate = true;
    }
    if (arg2 && typeof arg2.x === 'number') {
      this.targetFollowVelocity.copy(arg2);
    }

    if (!globalGameState.is(GameState.PLAYING) && !immediate) return;

    const currentChunkX = Math.floor((this.targetFollowPos.x + CHUNK_SIZE / 2) / CHUNK_SIZE);
    const currentChunkZ = Math.floor((this.targetFollowPos.z + CHUNK_SIZE / 2) / CHUNK_SIZE);

    this.currentCenterChunk.x = currentChunkX;
    this.currentCenterChunk.z = currentChunkZ;

    // Update distant horizon center with player/car to maintain endless panorama
    if (this.horizonMesh) {
      this.horizonMesh.position.set(this.targetFollowPos.x, 0, this.targetFollowPos.z);
    }

    // Determine travel direction look-ahead offset
    let lookAheadX = 0;
    let lookAheadZ = 0;
    if (this.targetFollowVelocity.lengthSq() > 4.0) {
      const heading = Math.atan2(this.targetFollowVelocity.x, this.targetFollowVelocity.z);
      lookAheadX = Math.round(Math.sin(heading) * 1.2);
      lookAheadZ = Math.round(Math.cos(heading) * 1.2);
    }

    const requiredChunkKeys = new Set();

    // 1. Identify chunks within active radius (+ look-ahead)
    for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++) {
      for (let dz = -ACTIVE_RADIUS; dz <= ACTIVE_RADIUS; dz++) {
        const cx = currentChunkX + dx + (dx * lookAheadX > 0 ? lookAheadX : 0);
        const cz = currentChunkZ + dz + (dz * lookAheadZ > 0 ? lookAheadZ : 0);
        const key = `${cx},${cz}`;

        requiredChunkKeys.add(key);

        if (this.isChunkFullyAuthored(cx, cz)) {
          if (!this.activeChunks.has(key)) {
            this.activeChunks.set(key, {
              chunkX: cx,
              chunkZ: cz,
              key,
              isAuthored: true,
              zone: LandUseZone.SUBURBAN,
              destination: null,
              interactiveObjects: [],
              group: null,
              rootGroup: null,
              terrainMesh: null,
              roadGroup: null,
              buildings: [],
              vegetationInstances: [],
              colliders: [],
              roads: [],
            });
          }
        } else if (!this.activeChunks.has(key)) {
          if (!this.generationQueue.some((q) => q.key === key)) {
            this.generationQueue.push({ chunkX: cx, chunkZ: cz, key });
          }
        }
      }
    }

    // 2. Unload chunks outside unload radius (hysteresis margin)
    for (const [key, chunk] of this.activeChunks.entries()) {
      const dist = Math.max(
        Math.abs(chunk.chunkX - currentChunkX),
        Math.abs(chunk.chunkZ - currentChunkZ)
      );

      if (dist > UNLOAD_RADIUS && !chunk.isAuthored) {
        this.unloadChunk(key);
      }
    }

    // If immediate, process all queued chunks synchronously (e.g. startup)
    if (immediate) {
      while (this.generationQueue.length > 0) {
        const next = this.generationQueue.shift();
        this.generateChunk(next.chunkX, next.chunkZ, next.key);
      }
    }
  }

  processGenerationQueue(maxPerFrame = 1) {
    let generated = 0;
    while (this.generationQueue.length > 0 && generated < maxPerFrame) {
      const next = this.generationQueue.shift();
      if (!this.activeChunks.has(next.key)) {
        this.generateChunk(next.chunkX, next.chunkZ, next.key);
        generated++;
      }
    }
  }

  generateChunk(chunkX, chunkZ, key) {
    if (this.isChunkFullyAuthored(chunkX, chunkZ)) return;

    const chunkGroup = new THREE.Group();
    chunkGroup.name = `chunk_${key}`;

    const centerX = chunkX * CHUNK_SIZE;
    const centerZ = chunkZ * CHUNK_SIZE;
    const rng = getChunkRng(chunkX, chunkZ, 1, this.worldSeed);
    const roadCfg = getChunkRoadConfig(chunkX, chunkZ, this.worldSeed);
    const zone = roadCfg.zone;
    const destination = getChunkDestination(chunkX, chunkZ, this.worldSeed);

    const chunkColliders = [];
    const roadSegments = [];
    const interactiveObjects = [];

    // 1. Procedural Terrain Mesh with Land-Use Tone
    const terrain = this.createChunkTerrain(centerX, centerZ, chunkX, chunkZ, zone);
    if (terrain) {
      chunkGroup.add(terrain);
    }

    // 2. Procedural Water Canal / Stream (if present in zone)
    if (roadCfg.hasWaterStream) {
      const water = this.createChunkWater(centerX, centerZ, chunkX, chunkZ, roadCfg, chunkColliders);
      if (water) {
        chunkGroup.add(water);
      }
    }

    // 3. Procedural Road Network with Bridges & Hierarchy
    const roads = this.createChunkRoads(centerX, centerZ, chunkX, chunkZ, roadCfg, chunkColliders, roadSegments);
    if (roads) {
      chunkGroup.add(roads);
    }

    // 4. Procedural Exploration Destination (if present in chunk)
    if (destination) {
      const destGroup = this.createChunkDestination(
        centerX,
        centerZ,
        chunkX,
        chunkZ,
        destination,
        chunkColliders,
        interactiveObjects
      );
      if (destGroup) {
        chunkGroup.add(destGroup);
      }
    }

    // 5. Procedural Buildings by Land-Use Zone
    const buildings = this.createChunkBuildings(centerX, centerZ, chunkX, chunkZ, zone, rng, chunkColliders);
    if (buildings) {
      chunkGroup.add(buildings);
    }

    // 6. Procedural Vegetation Clusters by Zone
    const vegetation = this.createChunkVegetation(centerX, centerZ, chunkX, chunkZ, zone, rng, chunkColliders);
    if (vegetation) {
      chunkGroup.add(vegetation);
    }

    // 7. Roadside Infrastructure & Street Props
    const props = this.createChunkProps(centerX, centerZ, chunkX, chunkZ, zone, rng, chunkColliders);
    if (props) {
      chunkGroup.add(props);
    }

    this.scene.add(chunkGroup);

    // Register interactive targets with InteractionSystem
    const interactionSys = this.engine?.systems?.find((s) => typeof s.registerTarget === 'function');
    if (interactionSys && interactiveObjects.length > 0) {
      interactiveObjects.forEach((obj) => interactionSys.registerTarget(obj));
    }

    // Register colliders into WorldSystem's authoritative spatial collision system
    if (this.worldSystem && Array.isArray(this.worldSystem.colliders)) {
      chunkColliders.forEach((c) => {
        c._chunkKey = key;
        this.worldSystem.colliders.push(c);
      });
    }

    this.activeChunks.set(key, {
      chunkX,
      chunkZ,
      key,
      isAuthored: false,
      zone,
      destination,
      interactiveObjects,
      group: chunkGroup,
      rootGroup: chunkGroup,
      terrainMesh: terrain,
      roadGroup: roads,
      buildings: buildings ? buildings.children : [],
      colliders: chunkColliders,
      roads: roadSegments,
    });
  }

  createChunkTerrain(centerX, centerZ, chunkX, chunkZ, zone) {
    const segments = 12;
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = centerX + pos.getX(i);
      const vz = centerZ + pos.getZ(i);

      if (this.isInsideAuthoredArea(vx, vz)) {
        pos.setY(i, 0);
      } else {
        const h = getTerrainHeight(vx, vz, this.worldSeed);
        pos.setY(i, h);
      }
    }
    geo.computeVertexNormals();

    // Select material based on land-use zone
    let terrainMat = this.sharedMaterials.terrainSuburban;
    if (zone === LandUseZone.FARMLAND) {
      terrainMat = this.sharedMaterials.terrainFarmland;
    } else if (zone === LandUseZone.WOODLAND) {
      terrainMat = this.sharedMaterials.terrainWoodland;
    }

    const terrainMesh = new THREE.Mesh(geo, terrainMat);
    terrainMesh.position.set(centerX, 0, centerZ);
    terrainMesh.receiveShadow = true;
    return terrainMesh;
  }

  createChunkWater(centerX, centerZ, chunkX, chunkZ, roadCfg, colliders) {
    const waterGroup = new THREE.Group();
    const isEW = roadCfg.waterOrientation === 'EW';
    const streamWidth = 5.5;

    const waterGeo = isEW
      ? new THREE.PlaneGeometry(CHUNK_SIZE, streamWidth, 10, 2)
      : new THREE.PlaneGeometry(streamWidth, CHUNK_SIZE, 2, 10);
    waterGeo.rotateX(-Math.PI / 2);

    const pos = waterGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = centerX + pos.getX(i);
      const vz = centerZ + pos.getZ(i);
      const h = getTerrainHeight(vx, vz, this.worldSeed) - 0.45;
      pos.setY(i, h);
    }
    waterGeo.computeVertexNormals();

    const waterMesh = new THREE.Mesh(waterGeo, this.sharedMaterials.waterSurface);
    waterMesh.position.set(centerX, 0, centerZ);
    waterGroup.add(waterMesh);

    return waterGroup;
  }

  createChunkRoads(centerX, centerZ, chunkX, chunkZ, roadCfg, colliders, roadSegments) {
    const roadGroup = new THREE.Group();

    // 1. North-South Road Segment (Primary or Secondary)
    if (roadCfg.hasAnyRoadNS) {
      const isPrimary = roadCfg.isMainArterialNS;
      const roadWidth = isPrimary ? 8.5 : 6.5;
      const roadGeo = new THREE.PlaneGeometry(roadWidth, CHUNK_SIZE, 2, 12);
      roadGeo.rotateX(-Math.PI / 2);

      const pos = roadGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = centerX + pos.getX(i);
        const vz = centerZ + pos.getZ(i);
        const h = this.isInsideAuthoredArea(vx, vz) ? 0 : getTerrainHeight(vx, vz, this.worldSeed);
        pos.setY(i, h + 0.035);
      }
      roadGeo.computeVertexNormals();

      const roadMesh = new THREE.Mesh(roadGeo, this.sharedMaterials.road);
      roadMesh.position.set(centerX, 0, centerZ);
      roadMesh.receiveShadow = true;
      roadGroup.add(roadMesh);

      // Center divider markings
      const dividerGeo = new THREE.PlaneGeometry(0.18, CHUNK_SIZE, 1, 12);
      dividerGeo.rotateX(-Math.PI / 2);
      const dpos = dividerGeo.attributes.position;
      for (let i = 0; i < dpos.count; i++) {
        const vx = centerX + dpos.getX(i);
        const vz = centerZ + dpos.getZ(i);
        const h = this.isInsideAuthoredArea(vx, vz) ? 0 : getTerrainHeight(vx, vz, this.worldSeed);
        dpos.setY(i, h + 0.042);
      }
      dividerGeo.computeVertexNormals();

      const dividerMat = isPrimary ? this.sharedMaterials.roadLineYellow : this.sharedMaterials.roadLine;
      const dividerMesh = new THREE.Mesh(dividerGeo, dividerMat);
      dividerMesh.position.set(centerX, 0, centerZ);
      roadGroup.add(dividerMesh);

      // Bridge culvert if crossing water stream
      if (roadCfg.hasWaterStream && roadCfg.waterOrientation === 'EW') {
        const bridgeDeckGeo = new THREE.BoxGeometry(roadWidth + 1.2, 0.4, 8.0);
        const bridgeY = getTerrainHeight(centerX, centerZ, this.worldSeed) + 0.02;
        const bridgeMesh = new THREE.Mesh(bridgeDeckGeo, this.sharedMaterials.bridgeDeck);
        bridgeMesh.position.set(centerX, bridgeY, centerZ);
        roadGroup.add(bridgeMesh);

        // Guardrails on bridge sides
        [-1, 1].forEach((side) => {
          const railGeo = new THREE.BoxGeometry(0.2, 0.9, 8.0);
          const railMesh = new THREE.Mesh(railGeo, this.sharedMaterials.guardrailMetal);
          railMesh.position.set(centerX + side * (roadWidth / 2 + 0.4), bridgeY + 0.45, centerZ);
          roadGroup.add(railMesh);

          colliders.push({
            type: 'box',
            minX: centerX + side * (roadWidth / 2 + 0.4) - 0.15,
            maxX: centerX + side * (roadWidth / 2 + 0.4) + 0.15,
            minY: bridgeY,
            maxY: bridgeY + 1.0,
            minZ: centerZ - 4.0,
            maxZ: centerZ + 4.0,
            category: 'bridge',
          });
        });
      }

      roadSegments.push({
        type: 'NS',
        startX: centerX,
        startZ: centerZ - CHUNK_SIZE / 2,
        endX: centerX,
        endZ: centerZ + CHUNK_SIZE / 2,
        width: roadWidth,
        isPrimary,
      });
    }

    // 2. East-West Road Segment (Primary or Secondary)
    if (roadCfg.hasAnyRoadEW) {
      const isPrimary = roadCfg.isMainArterialEW;
      const roadWidth = isPrimary ? 8.5 : 6.5;
      const roadGeo = new THREE.PlaneGeometry(CHUNK_SIZE, roadWidth, 12, 2);
      roadGeo.rotateX(-Math.PI / 2);

      const pos = roadGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = centerX + pos.getX(i);
        const vz = centerZ + pos.getZ(i);
        const h = this.isInsideAuthoredArea(vx, vz) ? 0 : getTerrainHeight(vx, vz, this.worldSeed);
        pos.setY(i, h + 0.038);
      }
      roadGeo.computeVertexNormals();

      const roadMesh = new THREE.Mesh(roadGeo, this.sharedMaterials.road);
      roadMesh.position.set(centerX, 0, centerZ);
      roadMesh.receiveShadow = true;
      roadGroup.add(roadMesh);

      // Center divider markings
      const dividerGeo = new THREE.PlaneGeometry(CHUNK_SIZE, 0.18, 12, 1);
      dividerGeo.rotateX(-Math.PI / 2);
      const dpos = dividerGeo.attributes.position;
      for (let i = 0; i < dpos.count; i++) {
        const vx = centerX + dpos.getX(i);
        const vz = centerZ + dpos.getZ(i);
        const h = this.isInsideAuthoredArea(vx, vz) ? 0 : getTerrainHeight(vx, vz, this.worldSeed);
        dpos.setY(i, h + 0.045);
      }
      dividerGeo.computeVertexNormals();

      const dividerMat = isPrimary ? this.sharedMaterials.roadLineYellow : this.sharedMaterials.roadLine;
      const dividerMesh = new THREE.Mesh(dividerGeo, dividerMat);
      dividerMesh.position.set(centerX, 0, centerZ);
      roadGroup.add(dividerMesh);

      roadSegments.push({
        type: 'EW',
        startX: centerX - CHUNK_SIZE / 2,
        startZ: centerZ,
        endX: centerX + CHUNK_SIZE / 2,
        endZ: centerZ,
        width: roadWidth,
        isPrimary,
      });
    }

    return roadGroup.children.length > 0 ? roadGroup : null;
  }

  /**
   * Procedural Exploration Destination Builder
   */
  createChunkDestination(centerX, centerZ, chunkX, chunkZ, dest, colliders, interactiveObjects) {
    const destGroup = new THREE.Group();
    destGroup.name = `destination_${dest.id}`;

    const { worldX, worldZ, approachX, approachZ, type } = dest;
    const groundY = getTerrainHeight(worldX, worldZ, this.worldSeed);

    // 1. Paved approach connector pad from road
    const approachPadGeo = new THREE.BoxGeometry(8.0, 0.08, 6.0);
    const approachPadMesh = new THREE.Mesh(approachPadGeo, this.sharedMaterials.pavedPlaza);
    approachPadMesh.position.set(approachX, groundY + 0.04, approachZ);
    approachPadMesh.receiveShadow = true;
    destGroup.add(approachPadMesh);

    // 2. Archetype-Specific Destination Content
    if (type === DestinationType.SCENIC_VIEWPOINT) {
      // Scenic Viewpoint: Overlook pavilion, benches, safety railing
      const pavH = 3.6;
      const floorGeo = new THREE.BoxGeometry(9.0, 0.25, 7.0);
      const floorMesh = new THREE.Mesh(floorGeo, this.sharedMaterials.pavedPlaza);
      floorMesh.position.set(worldX, groundY + 0.12, worldZ);
      floorMesh.receiveShadow = true;
      destGroup.add(floorMesh);

      const roofGeo = new THREE.BoxGeometry(9.4, 0.3, 7.4);
      const roofMesh = new THREE.Mesh(roofGeo, this.sharedMaterials.roofSlate);
      roofMesh.position.set(worldX, groundY + pavH, worldZ);
      roofMesh.castShadow = true;
      destGroup.add(roofMesh);

      // Overlook railing
      const railGeo = new THREE.BoxGeometry(8.8, 0.9, 0.15);
      const railMesh = new THREE.Mesh(railGeo, this.sharedMaterials.guardrailMetal);
      railMesh.position.set(worldX, groundY + 0.45, worldZ + 3.4);
      destGroup.add(railMesh);

      colliders.push({
        type: 'box',
        minX: worldX - 4.4,
        maxX: worldX + 4.4,
        minY: groundY,
        maxY: groundY + 1.0,
        minZ: worldZ + 3.25,
        maxZ: worldZ + 3.55,
        category: 'fence',
      });

      // Interactive Benches
      [-2.6, 2.6].forEach((bxOffset, idx) => {
        const bench = this.createDestinationBench(
          worldX + bxOffset,
          groundY + 0.22,
          worldZ - 1.5,
          0,
          colliders,
          interactiveObjects
        );
        destGroup.add(bench);
      });
    } else if (type === DestinationType.RIVERSIDE_REST) {
      // Riverside Rest: Wooden deck, safety barrier, bench overlooking water
      const deckGeo = new THREE.BoxGeometry(8.0, 0.2, 8.0);
      const deckMesh = new THREE.Mesh(deckGeo, this.sharedMaterials.wallWood);
      deckMesh.position.set(worldX, groundY + 0.1, worldZ);
      deckMesh.receiveShadow = true;
      destGroup.add(deckMesh);

      // Low wooden barrier
      const railGeo = new THREE.BoxGeometry(7.8, 0.8, 0.15);
      const railMesh = new THREE.Mesh(railGeo, this.sharedMaterials.fenceWood);
      railMesh.position.set(worldX, groundY + 0.4, worldZ + 3.8);
      destGroup.add(railMesh);

      colliders.push({
        type: 'box',
        minX: worldX - 3.9,
        maxX: worldX + 3.9,
        minY: groundY,
        maxY: groundY + 0.9,
        minZ: worldZ + 3.65,
        maxZ: worldZ + 3.95,
        category: 'fence',
      });

      const bench = this.createDestinationBench(
        worldX,
        groundY + 0.22,
        worldZ,
        0,
        colliders,
        interactiveObjects
      );
      destGroup.add(bench);
    } else if (type === DestinationType.SMALL_FARM) {
      // Small Farm: Rustic farmhouse, small equipment shed, 2 crop patches
      const houseW = 8.0;
      const houseD = 7.0;
      const houseH = 4.0;

      const houseGeo = new THREE.BoxGeometry(houseW, houseH, houseD);
      const houseMesh = new THREE.Mesh(houseGeo, this.sharedMaterials.wallWood);
      houseMesh.position.set(worldX - 4.0, groundY + houseH / 2, worldZ - 3.0);
      houseMesh.castShadow = true;
      destGroup.add(houseMesh);

      const roofGeo = new THREE.ConeGeometry(6.5, 2.2, 4);
      roofGeo.rotateY(Math.PI / 4);
      const roofMesh = new THREE.Mesh(roofGeo, this.sharedMaterials.roofTerracotta);
      roofMesh.position.set(worldX - 4.0, groundY + houseH + 1.1, worldZ - 3.0);
      roofMesh.castShadow = true;
      destGroup.add(roofMesh);

      colliders.push({
        type: 'box',
        minX: worldX - 4.0 - houseW / 2,
        maxX: worldX - 4.0 + houseW / 2,
        minY: groundY,
        maxY: groundY + houseH + 2.2,
        minZ: worldZ - 3.0 - houseD / 2,
        maxZ: worldZ - 3.0 + houseD / 2,
        category: 'building',
      });

      // Small Shed
      const shedGeo = new THREE.BoxGeometry(4.5, 2.8, 3.5);
      const shedMesh = new THREE.Mesh(shedGeo, this.sharedMaterials.wallBarn);
      shedMesh.position.set(worldX + 5.0, groundY + 1.4, worldZ - 4.0);
      destGroup.add(shedMesh);

      colliders.push({
        type: 'box',
        minX: worldX + 5.0 - 2.25,
        maxX: worldX + 5.0 + 2.25,
        minY: groundY,
        maxY: groundY + 2.8,
        minZ: worldZ - 4.0 - 1.75,
        maxZ: worldZ - 4.0 + 1.75,
        category: 'building',
      });

      // Tilled Crop Patch
      const cropGeo = new THREE.BoxGeometry(8.0, 0.12, 6.0);
      const cropMesh = new THREE.Mesh(cropGeo, this.sharedMaterials.soilBed);
      cropMesh.position.set(worldX + 2.0, groundY + 0.06, worldZ + 4.0);
      cropMesh.receiveShadow = true;
      destGroup.add(cropMesh);
    } else if (type === DestinationType.FOREST_CLEARING) {
      // Forest Clearing: Open grassy clearing, central bench, stone path
      const clearingGeo = new THREE.CylinderGeometry(7.5, 7.5, 0.08, 16);
      const clearingMesh = new THREE.Mesh(clearingGeo, this.sharedMaterials.terrainSuburban);
      clearingMesh.position.set(worldX, groundY + 0.04, worldZ);
      clearingMesh.receiveShadow = true;
      destGroup.add(clearingMesh);

      const bench = this.createDestinationBench(
        worldX,
        groundY + 0.22,
        worldZ,
        0,
        colliders,
        interactiveObjects
      );
      destGroup.add(bench);
    } else if (type === DestinationType.VILLAGE_CLUSTER) {
      // Village Cluster: 2 houses, noticeboard, bench, vending stop
      [-5.0, 5.0].forEach((hxOffset) => {
        const hW = 6.5;
        const hD = 6.5;
        const hH = 3.8;
        const hGeo = new THREE.BoxGeometry(hW, hH, hD);
        const hMesh = new THREE.Mesh(hGeo, this.sharedMaterials.wallLight);
        hMesh.position.set(worldX + hxOffset, groundY + hH / 2, worldZ - 4.0);
        hMesh.castShadow = true;
        destGroup.add(hMesh);

        const rGeo = new THREE.ConeGeometry(5.2, 1.8, 4);
        rGeo.rotateY(Math.PI / 4);
        const rMesh = new THREE.Mesh(rGeo, this.sharedMaterials.roofSlate);
        rMesh.position.set(worldX + hxOffset, groundY + hH + 0.9, worldZ - 4.0);
        destGroup.add(rMesh);

        colliders.push({
          type: 'box',
          minX: worldX + hxOffset - hW / 2,
          maxX: worldX + hxOffset + hW / 2,
          minY: groundY,
          maxY: groundY + hH + 1.8,
          minZ: worldZ - 4.0 - hD / 2,
          maxZ: worldZ - 4.0 + hD / 2,
          category: 'building',
        });
      });

      const bench = this.createDestinationBench(
        worldX,
        groundY + 0.22,
        worldZ + 3.0,
        0,
        colliders,
        interactiveObjects
      );
      destGroup.add(bench);
    } else if (type === DestinationType.SMALL_COMMERCIAL_CLUSTER) {
      // Roadside Café & Shop with awning & vending station
      const shopW = 9.0;
      const shopD = 7.5;
      const shopH = 4.2;

      const shopGeo = new THREE.BoxGeometry(shopW, shopH, shopD);
      const shopMesh = new THREE.Mesh(shopGeo, this.sharedMaterials.wallCream);
      shopMesh.position.set(worldX, groundY + shopH / 2, worldZ - 2.0);
      shopMesh.castShadow = true;
      destGroup.add(shopMesh);

      const roofGeo = new THREE.BoxGeometry(9.6, 0.4, 8.2);
      const roofMesh = new THREE.Mesh(roofGeo, this.sharedMaterials.roofSlate);
      roofMesh.position.set(worldX, groundY + shopH + 0.2, worldZ - 2.0);
      destGroup.add(roofMesh);

      colliders.push({
        type: 'box',
        minX: worldX - shopW / 2,
        maxX: worldX + shopW / 2,
        minY: groundY,
        maxY: groundY + shopH + 0.6,
        minZ: worldZ - 2.0 - shopD / 2,
        maxZ: worldZ - 2.0 + shopD / 2,
        category: 'building',
      });

      // Vending Machine 1 & 2
      [-0.6, 0.6].forEach((vxOffset, vIdx) => {
        const vGeo = new THREE.BoxGeometry(0.85, 1.85, 0.7);
        const vMat = vIdx === 0 ? this.sharedMaterials.vendingBodyRed : this.sharedMaterials.vendingBodyBlue;
        const vMesh = new THREE.Mesh(vGeo, vMat);
        vMesh.position.set(worldX + 5.2 + vxOffset, groundY + 0.95, worldZ + 1.0);
        destGroup.add(vMesh);
      });

      colliders.push({
        type: 'box',
        minX: worldX + 4.2,
        maxX: worldX + 6.2,
        minY: groundY,
        maxY: groundY + 1.9,
        minZ: worldZ + 0.6,
        maxZ: worldZ + 1.4,
        category: 'prop',
      });

      const bench = this.createDestinationBench(
        worldX - 2.5,
        groundY + 0.22,
        worldZ + 3.0,
        0,
        colliders,
        interactiveObjects
      );
      destGroup.add(bench);
    } else if (type === DestinationType.QUIET_PARK) {
      // Peaceful Park: Circular lawn, 4 cherry blossoms, benches
      const parkGeo = new THREE.CylinderGeometry(10.0, 10.0, 0.1, 16);
      const parkMesh = new THREE.Mesh(parkGeo, this.sharedMaterials.terrainSuburban);
      parkMesh.position.set(worldX, groundY + 0.05, worldZ);
      parkMesh.receiveShadow = true;
      destGroup.add(parkMesh);

      // Cherry trees
      [
        [-6, -6],
        [6, -6],
        [-6, 6],
        [6, 6],
      ].forEach(([tx, tz]) => {
        const trunkGeo = new THREE.CylinderGeometry(0.18, 0.22, 2.6, 6);
        const trunk = new THREE.Mesh(trunkGeo, this.sharedMaterials.woodTrunk);
        trunk.position.set(worldX + tx, groundY + 1.3, worldZ + tz);
        destGroup.add(trunk);

        const canopyGeo = new THREE.DodecahedronGeometry(2.0);
        const canopy = new THREE.Mesh(canopyGeo, this.sharedMaterials.cherryCanopy);
        canopy.position.set(worldX + tx, groundY + 3.2, worldZ + tz);
        destGroup.add(canopy);

        colliders.push({
          type: 'cylinder',
          cx: worldX + tx,
          cz: worldZ + tz,
          radius: 0.35,
          minY: groundY,
          maxY: groundY + 4.0,
          category: 'tree',
        });
      });

      const bench = this.createDestinationBench(
        worldX,
        groundY + 0.22,
        worldZ,
        0,
        colliders,
        interactiveObjects
      );
      destGroup.add(bench);
    }

    return destGroup;
  }

  /**
   * Helper to create interactive destination benches
   */
  createDestinationBench(x, y, z, heading, colliders, interactiveObjects) {
    const benchGroup = new THREE.Group();
    benchGroup.position.set(x, y, z);
    benchGroup.rotation.y = heading;

    const seatGeo = new THREE.BoxGeometry(1.6, 0.12, 0.52);
    const seatMesh = new THREE.Mesh(seatGeo, this.sharedMaterials.wallWood);
    seatMesh.position.set(0, 0.26, 0);
    seatMesh.castShadow = true;
    benchGroup.add(seatMesh);

    // Legs
    [-0.65, 0.65].forEach((lx) => {
      const legGeo = new THREE.BoxGeometry(0.08, 0.52, 0.44);
      const legMesh = new THREE.Mesh(legGeo, this.sharedMaterials.poleMetal);
      legMesh.position.set(lx, 0.26, 0);
      benchGroup.add(legMesh);
    });

    // Make bench interactive with player sitting system
    benchGroup.userData = {
      isInteractive: true,
      name: 'Bench',
      prompt: 'Sit',
      interactionType: 'bench',
      onInteract: () => {
        globalBus.emit('player:sit', {
          position: new THREE.Vector3(x, y, z),
          heading: heading,
        });
      },
    };

    interactiveObjects.push(benchGroup);

    colliders.push({
      type: 'box',
      minX: x - 0.85,
      maxX: x + 0.85,
      minY: y,
      maxY: y + 0.8,
      minZ: z - 0.35,
      maxZ: z + 0.35,
      category: 'bench',
    });

    return benchGroup;
  }

  createChunkBuildings(centerX, centerZ, chunkX, chunkZ, zone, rng, colliders) {
    const buildingGroup = new THREE.Group();
    const existingFootprints = [];

    // Determine building count based on land-use zone
    let buildingCount = 0;
    if (zone === LandUseZone.SUBURBAN) {
      buildingCount = Math.floor(rng() * 3) + 2; // 2-4 houses in suburban outskirts
    } else if (zone === LandUseZone.RURAL_VILLAGE) {
      buildingCount = Math.floor(rng() * 2) + 2; // 2-3 clustered village buildings
    } else if (zone === LandUseZone.FARMLAND) {
      buildingCount = rng() > 0.4 ? 1 : 0; // 0-1 farmstead / barn
    }

    for (let i = 0; i < buildingCount; i++) {
      const width = 7.5 + rng() * 4.0;
      const depth = 8.5 + rng() * 4.0;
      const height = 4.2 + rng() * 2.2;

      // Try up to 6 candidate positions for deterministic slope & corridor validation
      for (let attempt = 0; attempt < 6; attempt++) {
        const offsetX = (rng() - 0.5) * (CHUNK_SIZE - 28);
        const offsetZ = (rng() - 0.5) * (CHUNK_SIZE - 28);
        const bx = centerX + offsetX;
        const bz = centerZ + offsetZ;

        const validation = validateBuildingPlacement(
          bx,
          bz,
          width,
          depth,
          this.worldSeed,
          existingFootprints
        );

        if (!validation.valid) {
          continue; // Rejected by spatial validation (corridor proximity, slope > 0.55m, or overlap)
        }

        const groundY = validation.groundY;

        // 1. Concrete Foundation Plinth (seats building flush with ground without gaps or burying)
        const plinthH = 0.50;
        const plinthGeo = new THREE.BoxGeometry(width + 0.35, plinthH, depth + 0.35);
        const plinthMesh = new THREE.Mesh(plinthGeo, this.sharedMaterials.concreteBase);
        plinthMesh.position.set(bx, groundY + plinthH / 2, bz);
        plinthMesh.rotation.y = validation.facingAngle || 0;
        plinthMesh.receiveShadow = true;
        buildingGroup.add(plinthMesh);

        // 2. Building Body
        const bodyGeo = new THREE.BoxGeometry(width, height, depth);
        const wallMat =
          rng() > 0.5
            ? this.sharedMaterials.wallLight
            : rng() > 0.5
            ? this.sharedMaterials.wallCream
            : this.sharedMaterials.wallWood;
        const bodyMesh = new THREE.Mesh(bodyGeo, wallMat);
        bodyMesh.position.set(bx, groundY + plinthH + height / 2, bz);
        bodyMesh.rotation.y = validation.facingAngle || 0;
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        buildingGroup.add(bodyMesh);

        // 3. Roof (Gabled/Hipped Japanese architectural silhouette)
        const roofH = 2.0;
        const roofGeo = new THREE.ConeGeometry(Math.max(width, depth) * 0.75, roofH, 4);
        roofGeo.rotateY(Math.PI / 4);
        const roofMat = rng() > 0.4 ? this.sharedMaterials.roofSlate : this.sharedMaterials.roofTerracotta;
        const roofMesh = new THREE.Mesh(roofGeo, roofMat);
        roofMesh.position.set(bx, groundY + plinthH + height + roofH / 2, bz);
        roofMesh.rotation.y = validation.facingAngle || 0;
        roofMesh.castShadow = true;
        buildingGroup.add(roofMesh);

        // 4. Register solid box collider
        colliders.push({
          type: 'box',
          minX: bx - width / 2,
          maxX: bx + width / 2,
          minY: groundY,
          maxY: groundY + plinthH + height + roofH,
          minZ: bz - depth / 2,
          maxZ: bz + depth / 2,
          category: 'building',
        });

        existingFootprints.push({ x: bx, z: bz, width, depth });
        break;
      }
    }

    return buildingGroup.children.length > 0 ? buildingGroup : null;
  }

  createChunkVegetation(centerX, centerZ, chunkX, chunkZ, zone, rng, colliders) {
    const vegGroup = new THREE.Group();

    // Vegetation density depends on biome
    let treeCount = 4;
    if (zone === LandUseZone.WOODLAND) {
      treeCount = Math.floor(rng() * 8) + 8; // 8-15 trees in forest groves
    } else if (zone === LandUseZone.FARMLAND) {
      treeCount = Math.floor(rng() * 4) + 3; // 3-6 field perimeter trees
    } else {
      treeCount = Math.floor(rng() * 5) + 4; // 4-8 trees in suburban/rural
    }

    for (let i = 0; i < treeCount; i++) {
      const offsetX = (rng() - 0.5) * (CHUNK_SIZE - 12);
      const offsetZ = (rng() - 0.5) * (CHUNK_SIZE - 12);
      const tx = centerX + offsetX;
      const tz = centerZ + offsetZ;

      // Safe driving setbacks: keep trees off road corridors and authored zone
      if (this.isInsideAuthoredArea(tx, tz, 10)) continue;

      const corridor = getRoadCorridor(tx, tz, this.worldSeed);
      if (corridor.distanceToRoad < corridor.roadHalfWidth + 2.2) continue;

      const groundY = getTerrainHeight(tx, tz, this.worldSeed);
      const treeType = rng();
      const trunkH = 2.6 + rng() * 1.2;
      const trunkR = 0.22 + rng() * 0.08;

      // Trunk
      const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.85, trunkR, trunkH, 7);
      const trunkMesh = new THREE.Mesh(trunkGeo, this.sharedMaterials.woodTrunk);
      trunkMesh.position.set(tx, groundY + trunkH / 2, tz);
      trunkMesh.castShadow = true;
      vegGroup.add(trunkMesh);

      // Canopy
      let canopyMesh;
      if (treeType < 0.35) {
        // Cherry Blossom (Pink)
        const canopyGeo = new THREE.DodecahedronGeometry(2.2 + rng() * 0.6);
        canopyMesh = new THREE.Mesh(canopyGeo, this.sharedMaterials.cherryCanopy);
        canopyMesh.position.set(tx, groundY + trunkH + 1.6, tz);
      } else if (treeType < 0.70) {
        // Japanese Cedar / Pine (Dark Green Cone)
        const canopyGeo = new THREE.ConeGeometry(2.0 + rng() * 0.4, 4.2, 7);
        canopyMesh = new THREE.Mesh(canopyGeo, this.sharedMaterials.pineCanopy);
        canopyMesh.position.set(tx, groundY + trunkH + 2.0, tz);
      } else {
        // Deciduous Zelkova (Green Sphere)
        const canopyGeo = new THREE.SphereGeometry(2.3 + rng() * 0.5, 7, 6);
        canopyMesh = new THREE.Mesh(canopyGeo, this.sharedMaterials.greenCanopy);
        canopyMesh.position.set(tx, groundY + trunkH + 1.8, tz);
      }

      canopyMesh.castShadow = true;
      vegGroup.add(canopyMesh);

      // Register solid trunk cylinder collider
      colliders.push({
        type: 'cylinder',
        cx: tx,
        cz: tz,
        radius: trunkR + 0.12,
        minY: groundY,
        maxY: groundY + trunkH + 3.0,
        category: 'tree',
      });
    }

    return vegGroup.children.length > 0 ? vegGroup : null;
  }

  createChunkProps(centerX, centerZ, chunkX, chunkZ, zone, rng, colliders) {
    const propsGroup = new THREE.Group();

    // 1. Roadside Utility Poles
    const poleCount = Math.floor(rng() * 3) + 1;
    for (let i = 0; i < poleCount; i++) {
      const side = rng() > 0.5 ? 1 : -1;
      const px = centerX + side * 5.4;
      const pz = centerZ + (rng() - 0.5) * (CHUNK_SIZE - 20);

      if (this.isInsideAuthoredArea(px, pz, 8)) continue;

      const groundY = getTerrainHeight(px, pz, this.worldSeed);
      const poleH = 7.0;
      const poleGeo = new THREE.CylinderGeometry(0.12, 0.14, poleH, 6);
      const poleMesh = new THREE.Mesh(poleGeo, this.sharedMaterials.poleMetal);
      poleMesh.position.set(px, groundY + poleH / 2, pz);
      poleMesh.castShadow = true;
      propsGroup.add(poleMesh);

      // Crossbar & Transformer
      const crossGeo = new THREE.BoxGeometry(1.6, 0.1, 0.1);
      const crossMesh = new THREE.Mesh(crossGeo, this.sharedMaterials.poleMetal);
      crossMesh.position.set(px, groundY + poleH - 0.5, pz);
      propsGroup.add(crossMesh);

      if (rng() > 0.5) {
        const transGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.8, 6);
        const transMesh = new THREE.Mesh(transGeo, this.sharedMaterials.poleMetal);
        transMesh.position.set(px + 0.35, groundY + poleH - 1.2, pz);
        propsGroup.add(transMesh);
      }

      colliders.push({
        type: 'cylinder',
        cx: px,
        cz: pz,
        radius: 0.25,
        minY: groundY,
        maxY: groundY + poleH,
        category: 'pole',
      });
    }

    // 2. Bus Stop Shelter with Bench (In Village zone)
    if (zone === LandUseZone.RURAL_VILLAGE && rng() > 0.6) {
      const sx = centerX + (rng() > 0.5 ? 6.2 : -6.2);
      const sz = centerZ + 15.0;

      if (!this.isInsideAuthoredArea(sx, sz, 10)) {
        const groundY = getTerrainHeight(sx, sz, this.worldSeed);

        // Shelter roof
        const roofGeo = new THREE.BoxGeometry(3.2, 0.1, 1.8);
        const roofMesh = new THREE.Mesh(roofGeo, this.sharedMaterials.roofSlate);
        roofMesh.position.set(sx, groundY + 2.4, sz);
        propsGroup.add(roofMesh);

        // Shelter posts
        const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6);
        const post1 = new THREE.Mesh(postGeo, this.sharedMaterials.poleMetal);
        post1.position.set(sx - 1.4, groundY + 1.2, sz - 0.7);
        const post2 = new THREE.Mesh(postGeo, this.sharedMaterials.poleMetal);
        post2.position.set(sx + 1.4, groundY + 1.2, sz - 0.7);
        propsGroup.add(post1);
        propsGroup.add(post2);

        // Wooden bench
        const benchGeo = new THREE.BoxGeometry(1.6, 0.45, 0.4);
        const benchMesh = new THREE.Mesh(benchGeo, this.sharedMaterials.wallWood);
        benchMesh.position.set(sx, groundY + 0.25, sz);
        propsGroup.add(benchMesh);

        colliders.push({
          type: 'box',
          minX: sx - 1.6,
          maxX: sx + 1.6,
          minY: groundY,
          maxY: groundY + 2.5,
          minZ: sz - 0.9,
          maxZ: sz + 0.9,
          category: 'prop',
        });
      }
    }

    return propsGroup.children.length > 0 ? propsGroup : null;
  }

  unloadChunk(key) {
    const chunk = this.activeChunks.get(key);
    if (!chunk) return;

    // 1. Remove interactive objects from InteractionSystem
    const interactionSys = this.engine?.systems?.find((s) => typeof s.unregisterTarget === 'function');
    if (interactionSys && chunk.interactiveObjects) {
      chunk.interactiveObjects.forEach((obj) => interactionSys.unregisterTarget(obj));
    }

    // 2. Remove group and dispose geometries
    if (chunk.group) {
      this.scene.remove(chunk.group);
      chunk.group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
    }

    // 3. Remove colliders from WorldSystem
    if (this.worldSystem && Array.isArray(this.worldSystem.colliders)) {
      this.worldSystem.colliders = this.worldSystem.colliders.filter(
        (c) => c._chunkKey !== key
      );
    }

    this.activeChunks.delete(key);
  }

  /**
   * Diagnostic verification that neighboring chunk boundaries align seamlessly
   */
  validateChunkAdjacency(chunkKey) {
    const chunk = this.activeChunks.get(chunkKey);
    if (!chunk || chunk.isAuthored) return { valid: true };

    const { chunkX, chunkZ } = chunk;
    const neighbors = [
      { key: `${chunkX + 1},${chunkZ}`, dx: 1, dz: 0 },
      { key: `${chunkX - 1},${chunkZ}`, dx: -1, dz: 0 },
      { key: `${chunkX},${chunkZ + 1}`, dx: 0, dz: 1 },
      { key: `${chunkX},${chunkZ - 1}`, dx: 0, dz: -1 },
    ];

    for (const n of neighbors) {
      const neighborChunk = this.activeChunks.get(n.key);
      if (neighborChunk && !neighborChunk.isAuthored) {
        // Sample border height consistency
        const midBorderX = (chunkX + n.dx * 0.5) * CHUNK_SIZE;
        const midBorderZ = (chunkZ + n.dz * 0.5) * CHUNK_SIZE;
        const h = getTerrainHeight(midBorderX, midBorderZ, this.worldSeed);
        if (!isFinite(h)) {
          return { valid: false, error: `Invalid border height at ${chunkKey} <-> ${n.key}` };
        }
      }
    }

    return { valid: true };
  }

  update(delta) {
    if (globalGameState.is(GameState.PLAYING)) {
      this.updateStreaming(false);
      this.processGenerationQueue(1);
      this.checkDestinationDiscovery(this.targetFollowPos);
    }
  }

  isDestinationDiscovered(destIdOrName) {
    if (!destIdOrName) return false;
    return this.discoveredDestinations.has(destIdOrName);
  }

  checkDestinationDiscovery(position) {
    const pos = position || this.targetFollowPos;
    if (!pos) return;
    for (const chunk of this.activeChunks.values()) {
      if (chunk.destination) {
        const dest = chunk.destination;
        const targetX = dest.worldX !== undefined ? dest.worldX : dest.x;
        const targetZ = dest.worldZ !== undefined ? dest.worldZ : dest.z;
        const dX = pos.x - targetX;
        const dZ = pos.z - targetZ;
        const distSq = dX * dX + dZ * dZ;
        const r = dest.discoveryRadius || 35.0;
        if (distSq <= r * r) {
          if (!this.discoveredDestinations.has(dest.id) && !this.discoveredDestinations.has(dest.name)) {
            this.discoveredDestinations.add(dest.id);
            this.discoveredDestinations.add(dest.name);
            globalBus.emit('toast:show', {
              text: `📍 Discovered: ${dest.name}`,
              message: `📍 Discovered: ${dest.name}`,
              duration: 3500,
            });
            globalBus.emit('destination:discovered', {
              id: dest.id,
              name: dest.name,
              type: dest.type,
              worldX: targetX,
              worldZ: targetZ,
            });
          }
        }
      }
    }
  }

  /**
   * Diagnostic summary of active streamed chunks and memory state
   */
  getStreamingStats() {
    return {
      worldSeed: this.worldSeed,
      centerChunk: { ...this.currentCenterChunk },
      activeChunkCount: this.activeChunks.size,
      queuedChunkCount: this.generationQueue.length,
      discoveredDestinationsCount: this.discoveredDestinations.size,
      activeRadius: ACTIVE_RADIUS,
      unloadRadius: UNLOAD_RADIUS,
      chunkSize: CHUNK_SIZE,
      hasHorizonScenery: !!this.horizonMesh,
    };
  }
}
