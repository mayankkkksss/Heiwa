import * as THREE from 'three';
import { HEIWA_WORLD_SEED, getChunkRng, hashChunkCoords, getTerrainHeight } from '../utils/SeededRandom.js';
import { ProceduralTextures } from '../utils/ProceduralTextures.js';
import { globalBus } from '../engine/EventBus.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';

export const CHUNK_SIZE = 100; // 100m x 100m per chunk
export const ACTIVE_RADIUS = 2; // 5x5 chunk grid active around player/car
export const UNLOAD_RADIUS = 3; // Chunks > 3 radius are unloaded
export const AUTHORED_BOUNDS = { minX: -140, maxX: 140, minZ: -140, maxZ: 140 };

/**
 * WorldStreamingSystem - Manages deterministic infinite open-world chunk generation,
 * streaming lifecycle, road continuity, procedural scenery, and collision synchronization.
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

    // Shared Materials to optimize draw calls and browser memory
    this.sharedMaterials = null;
  }

  init(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.worldSystem = engine.systems.find((s) => typeof s.checkCollision === 'function');

    this.initSharedMaterials();

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

    this.sharedMaterials = {
      terrain: new THREE.MeshStandardMaterial({
        map: grassTex,
        roughness: 0.92,
        metalness: 0.02,
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
      roofSlate: new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.6,
      }),
      roofTerracotta: new THREE.MeshStandardMaterial({
        color: 0x9a3412,
        roughness: 0.65,
      }),
      windowGlass: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.2,
        metalness: 0.8,
      }),
      poleMetal: new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.5,
        metalness: 0.6,
      }),
    };
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

    // Check if the chunk is completely submerged in the authored starting area
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

    // 2. Unload chunks outside unload radius
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

    const chunkColliders = [];
    const roadSegments = [];

    // 1. Procedural Terrain Mesh
    const terrain = this.createChunkTerrain(centerX, centerZ, chunkX, chunkZ);
    if (terrain) {
      chunkGroup.add(terrain);
    }

    // 2. Procedural Road Network
    const roads = this.createChunkRoads(centerX, centerZ, chunkX, chunkZ, rng, chunkColliders, roadSegments);
    if (roads) {
      chunkGroup.add(roads);
    }

    // 3. Procedural Buildings along roads
    const buildings = this.createChunkBuildings(centerX, centerZ, chunkX, chunkZ, rng, chunkColliders);
    if (buildings) {
      chunkGroup.add(buildings);
    }

    // 4. Procedural Vegetation Clusters
    const vegetation = this.createChunkVegetation(centerX, centerZ, chunkX, chunkZ, rng, chunkColliders);
    if (vegetation) {
      chunkGroup.add(vegetation);
    }

    // 5. Roadside Infrastructure Props (Utility poles, barriers)
    const props = this.createChunkProps(centerX, centerZ, chunkX, chunkZ, rng, chunkColliders);
    if (props) {
      chunkGroup.add(props);
    }

    this.scene.add(chunkGroup);

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
      group: chunkGroup,
      rootGroup: chunkGroup,
      terrainMesh: terrain,
      roadGroup: roads,
      buildings: buildings ? buildings.children : [],
      colliders: chunkColliders,
      roads: roadSegments,
    });
  }

  createChunkTerrain(centerX, centerZ, chunkX, chunkZ) {
    const segments = 10;
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

    const terrainMesh = new THREE.Mesh(geo, this.sharedMaterials.terrain);
    terrainMesh.position.set(centerX, 0, centerZ);
    terrainMesh.receiveShadow = true;
    return terrainMesh;
  }

  createChunkRoads(centerX, centerZ, chunkX, chunkZ, rng, colliders, roadSegments) {
    const roadGroup = new THREE.Group();

    // Deterministic road presence flags
    // Main Arterial runs through chunkX = 0 (North-South)
    const isMainArterialNS = chunkX === 0;
    // Secondary Arterial runs through chunkZ = 0 (East-West)
    const isMainArterialEW = chunkZ === 0;

    // Rural connector probability for other chunks
    const hasRuralRoadNS = !isMainArterialNS && rng() > 0.45;
    const hasRuralRoadEW = !isMainArterialEW && rng() > 0.45;

    // 1. North-South Road Segment
    if (isMainArterialNS || hasRuralRoadNS) {
      const roadWidth = isMainArterialNS ? 8.5 : 6.0;
      const roadGeo = new THREE.PlaneGeometry(roadWidth, CHUNK_SIZE);
      roadGeo.rotateX(-Math.PI / 2);

      const roadMesh = new THREE.Mesh(roadGeo, this.sharedMaterials.road);
      roadMesh.position.set(centerX, 0.03, centerZ);
      roadMesh.receiveShadow = true;
      roadGroup.add(roadMesh);

      // Center divider markings
      const dividerGeo = new THREE.PlaneGeometry(0.18, CHUNK_SIZE);
      dividerGeo.rotateX(-Math.PI / 2);
      const dividerMat = isMainArterialNS ? this.sharedMaterials.roadLineYellow : this.sharedMaterials.roadLine;
      const dividerMesh = new THREE.Mesh(dividerGeo, dividerMat);
      dividerMesh.position.set(centerX, 0.035, centerZ);
      roadGroup.add(dividerMesh);

      roadSegments.push({
        type: 'NS',
        startX: centerX,
        startZ: centerZ - CHUNK_SIZE / 2,
        endX: centerX,
        endZ: centerZ + CHUNK_SIZE / 2,
        width: roadWidth,
      });
    }

    // 2. East-West Road Segment
    if (isMainArterialEW || hasRuralRoadEW) {
      const roadWidth = isMainArterialEW ? 8.5 : 6.0;
      const roadGeo = new THREE.PlaneGeometry(CHUNK_SIZE, roadWidth);
      roadGeo.rotateX(-Math.PI / 2);

      const roadMesh = new THREE.Mesh(roadGeo, this.sharedMaterials.road);
      roadMesh.position.set(centerX, 0.032, centerZ);
      roadMesh.receiveShadow = true;
      roadGroup.add(roadMesh);

      // Center divider markings
      const dividerGeo = new THREE.PlaneGeometry(CHUNK_SIZE, 0.18);
      dividerGeo.rotateX(-Math.PI / 2);
      const dividerMat = isMainArterialEW ? this.sharedMaterials.roadLineYellow : this.sharedMaterials.roadLine;
      const dividerMesh = new THREE.Mesh(dividerGeo, dividerMat);
      dividerMesh.position.set(centerX, 0.036, centerZ);
      roadGroup.add(dividerMesh);

      roadSegments.push({
        type: 'EW',
        startX: centerX - CHUNK_SIZE / 2,
        startZ: centerZ,
        endX: centerX + CHUNK_SIZE / 2,
        endZ: centerZ,
        width: roadWidth,
      });
    }

    return roadGroup.children.length > 0 ? roadGroup : null;
  }

  createChunkBuildings(centerX, centerZ, chunkX, chunkZ, rng, colliders) {
    const buildingGroup = new THREE.Group();
    const buildingCount = Math.floor(rng() * 3) + 1; // 1-3 buildings per rural/suburban chunk

    for (let i = 0; i < buildingCount; i++) {
      const offsetX = (rng() - 0.5) * (CHUNK_SIZE - 28);
      const offsetZ = (rng() - 0.5) * (CHUNK_SIZE - 28);
      const bx = centerX + offsetX;
      const bz = centerZ + offsetZ;

      // Keep buildings off road centers and away from authored starting area
      if (this.isInsideAuthoredArea(bx, bz, 15)) continue;
      if (Math.abs(offsetX) < 9.0 || Math.abs(offsetZ) < 9.0) continue;

      const width = 8.0 + rng() * 4.0;
      const depth = 9.0 + rng() * 4.0;
      const height = 4.5 + rng() * 2.5;

      // Building Body
      const bodyGeo = new THREE.BoxGeometry(width, height, depth);
      const wallMat = rng() > 0.5 ? this.sharedMaterials.wallLight : (rng() > 0.5 ? this.sharedMaterials.wallCream : this.sharedMaterials.wallWood);
      const bodyMesh = new THREE.Mesh(bodyGeo, wallMat);
      bodyMesh.position.set(bx, height / 2, bz);
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      buildingGroup.add(bodyMesh);

      // Roof (Gabled/Hipped)
      const roofH = 2.2;
      const roofGeo = new THREE.ConeGeometry(Math.max(width, depth) * 0.75, roofH, 4);
      roofGeo.rotateY(Math.PI / 4);
      const roofMat = rng() > 0.4 ? this.sharedMaterials.roofSlate : this.sharedMaterials.roofTerracotta;
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.position.set(bx, height + roofH / 2, bz);
      roofMesh.castShadow = true;
      buildingGroup.add(roofMesh);

      // Register solid box collider
      colliders.push({
        type: 'box',
        minX: bx - width / 2,
        maxX: bx + width / 2,
        minY: 0,
        maxY: height + roofH,
        minZ: bz - depth / 2,
        maxZ: bz + depth / 2,
        category: 'building',
      });
    }

    return buildingGroup.children.length > 0 ? buildingGroup : null;
  }

  createChunkVegetation(centerX, centerZ, chunkX, chunkZ, rng, colliders) {
    const vegGroup = new THREE.Group();
    const treeCount = Math.floor(rng() * 7) + 4; // 4-10 trees per chunk

    for (let i = 0; i < treeCount; i++) {
      const offsetX = (rng() - 0.5) * (CHUNK_SIZE - 12);
      const offsetZ = (rng() - 0.5) * (CHUNK_SIZE - 12);
      const tx = centerX + offsetX;
      const tz = centerZ + offsetZ;

      // Safe driving setbacks: keep trees off road center corridors and authored zone
      if (this.isInsideAuthoredArea(tx, tz, 10)) continue;
      if (Math.abs(offsetX) < 6.5 || Math.abs(offsetZ) < 6.5) continue;

      const treeType = rng();
      const trunkH = 2.6 + rng() * 1.2;
      const trunkR = 0.22 + rng() * 0.08;

      // Trunk
      const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.85, trunkR, trunkH, 7);
      const trunkMesh = new THREE.Mesh(trunkGeo, this.sharedMaterials.woodTrunk);
      trunkMesh.position.set(tx, trunkH / 2, tz);
      trunkMesh.castShadow = true;
      vegGroup.add(trunkMesh);

      // Canopy
      let canopyMesh;
      if (treeType < 0.35) {
        // Cherry Blossom (Pink)
        const canopyGeo = new THREE.DodecahedronGeometry(2.2 + rng() * 0.6);
        canopyMesh = new THREE.Mesh(canopyGeo, this.sharedMaterials.cherryCanopy);
        canopyMesh.position.set(tx, trunkH + 1.6, tz);
      } else if (treeType < 0.70) {
        // Japanese Cedar / Pine (Dark Green Cone)
        const canopyGeo = new THREE.ConeGeometry(2.0 + rng() * 0.4, 4.2, 7);
        canopyMesh = new THREE.Mesh(canopyGeo, this.sharedMaterials.pineCanopy);
        canopyMesh.position.set(tx, trunkH + 2.0, tz);
      } else {
        // Deciduous Zelkova (Green Sphere)
        const canopyGeo = new THREE.SphereGeometry(2.3 + rng() * 0.5, 7, 6);
        canopyMesh = new THREE.Mesh(canopyGeo, this.sharedMaterials.greenCanopy);
        canopyMesh.position.set(tx, trunkH + 1.8, tz);
      }

      canopyMesh.castShadow = true;
      vegGroup.add(canopyMesh);

      // Register solid trunk cylinder collider
      colliders.push({
        type: 'cylinder',
        cx: tx,
        cz: tz,
        radius: trunkR + 0.12,
        minY: 0,
        maxY: trunkH + 3.0,
        category: 'tree',
      });
    }

    return vegGroup.children.length > 0 ? vegGroup : null;
  }

  createChunkProps(centerX, centerZ, chunkX, chunkZ, rng, colliders) {
    const propsGroup = new THREE.Group();
    const poleCount = Math.floor(rng() * 3) + 1;

    for (let i = 0; i < poleCount; i++) {
      const side = rng() > 0.5 ? 1 : -1;
      const px = centerX + side * 5.2;
      const pz = centerZ + (rng() - 0.5) * (CHUNK_SIZE - 20);

      if (this.isInsideAuthoredArea(px, pz, 8)) continue;

      const poleH = 7.0;
      const poleGeo = new THREE.CylinderGeometry(0.12, 0.14, poleH, 6);
      const poleMesh = new THREE.Mesh(poleGeo, this.sharedMaterials.poleMetal);
      poleMesh.position.set(px, poleH / 2, pz);
      poleMesh.castShadow = true;
      propsGroup.add(poleMesh);

      // Crossbar
      const crossGeo = new THREE.BoxGeometry(1.6, 0.1, 0.1);
      const crossMesh = new THREE.Mesh(crossGeo, this.sharedMaterials.poleMetal);
      crossMesh.position.set(px, poleH - 0.5, pz);
      propsGroup.add(crossMesh);

      colliders.push({
        type: 'cylinder',
        cx: px,
        cz: pz,
        radius: 0.25,
        minY: 0,
        maxY: poleH,
        category: 'pole',
      });
    }

    return propsGroup.children.length > 0 ? propsGroup : null;
  }

  unloadChunk(key) {
    const chunk = this.activeChunks.get(key);
    if (!chunk) return;

    // 1. Remove group and dispose geometries
    if (chunk.group) {
      this.scene.remove(chunk.group);
      chunk.group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
    }

    // 2. Remove colliders from WorldSystem
    if (this.worldSystem && Array.isArray(this.worldSystem.colliders)) {
      this.worldSystem.colliders = this.worldSystem.colliders.filter(
        (c) => c._chunkKey !== key
      );
    }

    this.activeChunks.delete(key);
  }

  update(delta) {
    if (globalGameState.is(GameState.PLAYING)) {
      this.updateStreaming(false);
      this.processGenerationQueue(1);
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
      activeRadius: ACTIVE_RADIUS,
      unloadRadius: UNLOAD_RADIUS,
      chunkSize: CHUNK_SIZE,
    };
  }
}
