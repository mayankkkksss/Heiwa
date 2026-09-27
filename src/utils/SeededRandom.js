/**
 * SeededRandom.js - Deterministic Pseudo-Random Number Generator and Noise Utilities for HEIWA.
 * Ensures infinite procedural world reproducibility from a single master world seed.
 * Provides ONE authoritative terrain and road elevation system across all systems.
 */

export const HEIWA_WORLD_SEED = 20260927;
let activeWorldSeed = HEIWA_WORLD_SEED;

export function setWorldSeed(seed) {
  if (typeof seed === 'number' && isFinite(seed) && !isNaN(seed)) {
    activeWorldSeed = seed >>> 0;
  }
}

export function getWorldSeed() {
  return activeWorldSeed;
}

export function resetWorldSeed() {
  activeWorldSeed = HEIWA_WORLD_SEED;
}

/**
 * SplitMix32 / Mulberry32 deterministic generator
 */
export function createRng(seed = getWorldSeed()) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a deterministic 32-bit hash from chunk coordinates and world seed
 */
export function hashChunkCoords(chunkX, chunkZ, seed = getWorldSeed(), salt = 0) {
  let h = seed ^ (chunkX * 374761393) ^ (chunkZ * 668265263) ^ (salt * 1442695040);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Returns a seeded RNG scoped specifically to a chunk and sub-feature
 */
export function getChunkRng(chunkX, chunkZ, salt = 0, seed = getWorldSeed()) {
  const chunkSeed = hashChunkCoords(chunkX, chunkZ, seed, salt);
  return createRng(chunkSeed);
}

/**
 * Checks if a coordinate is inside the authored starting area
 */
export function isAuthoredRegion(worldX, worldZ, margin = 0) {
  return Math.abs(worldX) <= (140 + margin) && Math.abs(worldZ) <= (140 + margin);
}

/**
 * Land Use & Biome Classification
 */
export const LandUseZone = {
  SUBURBAN: 'SUBURBAN',
  FARMLAND: 'FARMLAND',
  WOODLAND: 'WOODLAND',
  RURAL_VILLAGE: 'RURAL_VILLAGE',
  SCENIC_OVERLOOK: 'SCENIC_OVERLOOK',
};

/**
 * Computes deterministic land-use classification for any chunk coordinate
 */
export function getLandUseZone(chunkX, chunkZ, seed = HEIWA_WORLD_SEED) {
  const distFromOrigin = Math.hypot(chunkX, chunkZ) * 100;

  // Immediate outer ring around authored area: suburban residential outskirts
  if (distFromOrigin < 260) {
    return LandUseZone.SUBURBAN;
  }

  // Large-scale coherent regional noise for natural land use zoning
  const zoneNoise1 = Math.sin(chunkX * 0.42 + seed * 0.005) + Math.cos(chunkZ * 0.38 + seed * 0.007);
  const zoneNoise2 = Math.sin(chunkX * 0.85 - chunkZ * 0.72);
  const combined = (zoneNoise1 * 0.65 + zoneNoise2 * 0.35 + 2.0) / 4.0; // 0..1

  if (combined < 0.28) {
    return LandUseZone.FARMLAND; // Open fields, rice paddies, agricultural lanes
  } else if (combined < 0.54) {
    return LandUseZone.WOODLAND; // Japanese cedar / pine / zelkova forests
  } else if (combined < 0.78) {
    return LandUseZone.RURAL_VILLAGE; // Quiet rural residential cluster with shops/vending
  } else {
    return LandUseZone.SCENIC_OVERLOOK; // Higher rolling hills, vistas, water towers
  }
}

/**
 * Deterministic road network configuration for a given chunk
 */
export function getChunkRoadConfig(chunkX, chunkZ, seed = HEIWA_WORLD_SEED) {
  const rng = getChunkRng(chunkX, chunkZ, 101, seed);
  const zone = getLandUseZone(chunkX, chunkZ, seed);

  // 1. Primary Arterial Highways (Infinite North-South along X=0, East-West along Z=0)
  const isMainArterialNS = chunkX === 0;
  const isMainArterialEW = chunkZ === 0;

  // 2. Secondary Regional Connectors (Grid connectors every 3 chunks)
  const isSecondaryNS = Math.abs(chunkX) % 3 === 0 && !isMainArterialNS;
  const isSecondaryEW = Math.abs(chunkZ) % 3 === 0 && !isMainArterialEW;

  // 3. Local Rural Branch Connectors
  const hasRuralRoadNS = !isMainArterialNS && !isSecondaryNS && rng() > 0.48;
  const hasRuralRoadEW = !isMainArterialEW && !isSecondaryEW && rng() > 0.48;

  // 4. Procedural Water Feature (Canals/Streams in Farmland & Woodland)
  const hasWaterStream = (zone === LandUseZone.FARMLAND || zone === LandUseZone.WOODLAND) && rng() > 0.62;
  const waterOrientation = rng() > 0.5 ? 'EW' : 'NS';

  // 5. Procedural Scenic Landmark
  const hasLandmark = rng() > 0.78;

  return {
    zone,
    isMainArterialNS,
    isMainArterialEW,
    isSecondaryNS,
    isSecondaryEW,
    hasRuralRoadNS,
    hasRuralRoadEW,
    hasWaterStream,
    waterOrientation,
    hasLandmark,
    hasAnyRoadNS: isMainArterialNS || isSecondaryNS || hasRuralRoadNS,
    hasAnyRoadEW: isMainArterialEW || isSecondaryEW || hasRuralRoadEW,
  };
}

/**
 * Evaluates the nearest road corridor for any global world coordinate (worldX, worldZ).
 * Returns precise distance to road centerline, road half-width, corridor exclusion radius, and road surface elevation.
 */
export function getRoadCorridor(worldX, worldZ, seed = HEIWA_WORLD_SEED) {
  const centerChunkX = Math.round(worldX / 100);
  const centerChunkZ = Math.round(worldZ / 100);

  let minDistance = Infinity;
  let roadHalfWidth = 3.25;
  let roadElevation = 0;
  let isPrimary = false;
  let roadOrientation = 'NS';
  let roadCenterX = 0;
  let roadCenterZ = 0;

  // Inspect nearby chunks in 3x3 local cluster
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const cx = centerChunkX + dx;
      const cz = centerChunkZ + dz;
      const chunkCenterX = cx * 100;
      const chunkCenterZ = cz * 100;
      const roadCfg = getChunkRoadConfig(cx, cz, seed);

      // Check North-South road segments in this chunk
      if (roadCfg.hasAnyRoadNS) {
        const halfW = roadCfg.isMainArterialNS ? 4.25 : 3.25;
        const zMin = chunkCenterZ - 50.0;
        const zMax = chunkCenterZ + 50.0;
        const clampedZ = Math.max(zMin, Math.min(worldZ, zMax));
        const dist = Math.hypot(worldX - chunkCenterX, worldZ - clampedZ);

        let isBetter = false;
        if (roadCfg.isMainArterialNS) {
          if (!isPrimary || dist < minDistance) isBetter = true;
        } else {
          if (!isPrimary && dist < minDistance) isBetter = true;
        }

        if (isBetter) {
          minDistance = dist;
          roadHalfWidth = halfW;
          isPrimary = roadCfg.isMainArterialNS;
          roadOrientation = 'NS';
          roadCenterX = chunkCenterX;
          roadCenterZ = clampedZ;
          roadElevation = getRoadElevationProfile(chunkCenterX, worldZ, seed);
        }
      }

      // Check East-West road segments in this chunk
      if (roadCfg.hasAnyRoadEW) {
        const halfW = roadCfg.isMainArterialEW ? 4.25 : 3.25;
        const xMin = chunkCenterX - 50.0;
        const xMax = chunkCenterX + 50.0;
        const clampedX = Math.max(xMin, Math.min(worldX, xMax));
        const dist = Math.hypot(worldX - clampedX, worldZ - chunkCenterZ);

        let isBetter = false;
        if (roadCfg.isMainArterialEW) {
          if (!isPrimary || dist < minDistance) isBetter = true;
        } else {
          if (!isPrimary && dist < minDistance) isBetter = true;
        }

        if (isBetter) {
          minDistance = dist;
          roadHalfWidth = halfW;
          isPrimary = roadCfg.isMainArterialEW;
          roadOrientation = 'EW';
          roadCenterX = clampedX;
          roadCenterZ = chunkCenterZ;
          roadElevation = getRoadElevationProfile(worldX, chunkCenterZ, seed);
        }
      }
    }
  }

  const corridorRadius = roadHalfWidth + 3.0; // Paved surface + clear road shoulder

  return {
    distanceToRoad: minDistance,
    roadHalfWidth,
    corridorRadius,
    roadElevation,
    isPrimary,
    roadOrientation,
    roadCenterX,
    roadCenterZ,
    isInsideCorridor: minDistance <= corridorRadius,
  };
}

/**
 * Calculates smooth, continuous longitudinal road elevation profile with limited grade (< 3.0%).
 * Completely flat in authored neighborhood and gentle rolling slopes in countryside.
 */
export function getRoadElevationProfile(worldX, worldZ, seed = HEIWA_WORLD_SEED) {
  // Authored area is strictly 0
  const distFromAuthoredX = Math.max(0, Math.abs(worldX) - 140);
  const distFromAuthoredZ = Math.max(0, Math.abs(worldZ) - 140);
  const authoredDist = Math.max(distFromAuthoredX, distFromAuthoredZ);

  if (authoredDist <= 0.001) {
    return 0;
  }

  // Smooth Hermite blend factor from authored zone
  const t = Math.min(1.0, authoredDist / 60.0);
  const blendFactor = t * t * (3.0 - 2.0 * t);

  // Very smooth, low-frequency longitudinal road undulation (max slope ~2.5%)
  const wave1 = Math.sin(worldX * 0.0035 + worldZ * 0.0035 + seed * 0.008) * 2.2;
  const wave2 = Math.cos(worldX * 0.007 - worldZ * 0.006) * 0.9;
  const rawElevation = wave1 + wave2;

  return rawElevation * blendFactor;
}

/**
 * Calculates natural terrain height for off-road landscape features, hills, and distant foothills.
 */
export function getNaturalTerrainHeight(worldX, worldZ, seed = HEIWA_WORLD_SEED) {
  const distFromAuthoredX = Math.max(0, Math.abs(worldX) - 140);
  const distFromAuthoredZ = Math.max(0, Math.abs(worldZ) - 140);
  const authoredDist = Math.max(distFromAuthoredX, distFromAuthoredZ);

  if (authoredDist <= 0.001) {
    return 0;
  }

  const t = Math.min(1.0, authoredDist / 60.0);
  const blendFactor = t * t * (3.0 - 2.0 * t);

  // Octave 1: Broad rolling countryside hills
  const freq1 = 0.0045;
  const n1 = (Math.sin(worldX * freq1 + seed * 0.012) + Math.cos(worldZ * freq1 + seed * 0.018)) * 0.5;

  // Octave 2: Countryside ridges
  const freq2 = 0.012;
  const n2 = (Math.sin(worldX * freq2 * 1.2 + 1.4) * Math.cos(worldZ * freq2 * 1.1 + 0.8)) * 0.5;

  // Octave 3: Subtle local terrain modulation
  const freq3 = 0.028;
  const n3 = (Math.sin(worldX * freq3) + Math.cos(worldZ * freq3)) * 0.25;

  let naturalHeight = n1 * 4.5 + n2 * 1.8 + n3 * 0.4;

  // Distant scenic foothills rise gradually only beyond 380m
  const outerDist = Math.max(0, Math.hypot(worldX, worldZ) - 380);
  if (outerDist > 0) {
    const hillRamp = Math.min(1.0, outerDist / 240.0);
    const distantHill = Math.sin(worldX * 0.0032 + worldZ * 0.0032) * 6.0;
    naturalHeight += distantHill * hillRamp;
  }

  return naturalHeight * blendFactor;
}

/**
 * ONE authoritative world terrain height function for all systems (terrain mesh, roads, buildings,
 * vegetation, props, destinations, vehicle grounding, NPC grounding).
 * Spatially integrates road corridors so terrain seamlessly adapts to road elevation with 0 clipping.
 */
export function getTerrainHeight(worldX, worldZ, seed = HEIWA_WORLD_SEED) {
  // 1. Check authored zone
  const distFromAuthoredX = Math.max(0, Math.abs(worldX) - 140);
  const distFromAuthoredZ = Math.max(0, Math.abs(worldZ) - 140);
  const authoredDist = Math.max(distFromAuthoredX, distFromAuthoredZ);

  if (authoredDist <= 0.001) {
    return 0;
  }

  // 2. Query road corridor influence
  const corridor = getRoadCorridor(worldX, worldZ, seed);
  const roadElev = corridor.roadElevation;
  const naturalElev = getNaturalTerrainHeight(worldX, worldZ, seed);

  // 3. Road Corridor Blending
  // Inside road surface + shoulder: terrain strictly matches road elevation
  const innerCorridor = corridor.roadHalfWidth + 1.5;
  const outerCorridor = corridor.roadHalfWidth + 18.0;

  if (corridor.distanceToRoad <= innerCorridor) {
    return roadElev;
  } else if (corridor.distanceToRoad < outerCorridor) {
    // Smooth Hermite blend from road elevation to natural terrain
    const ratio = (corridor.distanceToRoad - innerCorridor) / (outerCorridor - innerCorridor);
    const smoothT = ratio * ratio * (3.0 - 2.0 * ratio);
    return roadElev * (1.0 - smoothT) + naturalElev * smoothT;
  } else {
    // Fully off-road natural terrain
    return naturalElev;
  }
}

/**
 * Spatial building placement validation utility.
 * Validates road safety clearance, slope limits across 9 footprint sample points, authored bounds, and overlap.
 */
export function validateBuildingPlacement(
  worldX,
  worldZ,
  width,
  depth,
  seed = HEIWA_WORLD_SEED,
  existingFootprints = []
) {
  // 1. Authored starting area check
  if (Math.abs(worldX) <= 155 && Math.abs(worldZ) <= 155) {
    return { valid: false, reason: 'inside_authored_zone' };
  }

  // 2. Road clearance check
  const corridor = getRoadCorridor(worldX, worldZ, seed);
  const footprintRadius = Math.hypot(width, depth) / 2.0;
  const requiredClearance = corridor.roadHalfWidth + footprintRadius + 3.5;

  if (corridor.distanceToRoad < requiredClearance) {
    return { valid: false, reason: 'too_close_to_road' };
  }

  // 3. Terrain slope limit across 9 footprint sample points
  const hw = width / 2.0;
  const hd = depth / 2.0;
  const samplePoints = [
    [worldX, worldZ],
    [worldX - hw, worldZ - hd],
    [worldX + hw, worldZ - hd],
    [worldX - hw, worldZ + hd],
    [worldX + hw, worldZ + hd],
    [worldX - hw, worldZ],
    [worldX + hw, worldZ],
    [worldX, worldZ - hd],
    [worldX, worldZ + hd],
  ];

  let minH = Infinity;
  let maxH = -Infinity;
  let sumH = 0;

  for (const [sx, sz] of samplePoints) {
    const h = getTerrainHeight(sx, sz, seed);
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
    sumH += h;
  }

  const slopeVariance = maxH - minH;
  // Maximum slope variation allowed across footprint (0.55m)
  if (slopeVariance > 0.55) {
    return { valid: false, reason: 'slope_too_steep', slopeVariance };
  }

  // 4. Overlap with existing building footprints
  for (const ef of existingFootprints) {
    const dx = Math.abs(worldX - ef.x);
    const dz = Math.abs(worldZ - ef.z);
    const minSeparationX = (width + ef.width) / 2.0 + 3.0;
    const minSeparationZ = (depth + ef.depth) / 2.0 + 3.0;

    if (dx < minSeparationX && dz < minSeparationZ) {
      return { valid: false, reason: 'overlaps_existing_building' };
    }
  }

  // Calculate orientation facing toward nearest road
  let facingAngle = 0;
  const dX = corridor.roadCenterX - worldX;
  const dZ = corridor.roadCenterZ - worldZ;
  if (Math.abs(dX) > Math.abs(dZ)) {
    facingAngle = dX > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    facingAngle = dZ > 0 ? 0 : Math.PI;
  }

  return {
    valid: true,
    groundY: minH,
    baseHeight: minH,
    avgHeight: sumH / samplePoints.length,
    slopeVariance,
    facingAngle,
  };
}

/**
 * World Destination Archetypes
 */
export const DestinationType = {
  SCENIC_VIEWPOINT: 'SCENIC_VIEWPOINT',
  RIVERSIDE_REST: 'RIVERSIDE_REST',
  SMALL_FARM: 'SMALL_FARM',
  FOREST_CLEARING: 'FOREST_CLEARING',
  VILLAGE_CLUSTER: 'VILLAGE_CLUSTER',
  SMALL_COMMERCIAL_CLUSTER: 'SMALL_COMMERCIAL_CLUSTER',
  QUIET_PARK: 'QUIET_PARK',
  BRIDGE_CROSSING: 'BRIDGE_CROSSING',
};

export const DESTINATION_META = {
  SCENIC_VIEWPOINT: { name: 'Scenic Viewpoint', icon: '⛰️', color: '#38bdf8', discoveryRadius: 36.0 },
  RIVERSIDE_REST: { name: 'Riverside Rest Area', icon: '🌊', color: '#06b6d4', discoveryRadius: 32.0 },
  SMALL_FARM: { name: 'Rural Farmstead', icon: '🌾', color: '#eab308', discoveryRadius: 38.0 },
  FOREST_CLEARING: { name: 'Forest Clearing', icon: '🌲', color: '#22c55e', discoveryRadius: 34.0 },
  VILLAGE_CLUSTER: { name: 'Quiet Village', icon: '🏡', color: '#f97316', discoveryRadius: 42.0 },
  SMALL_COMMERCIAL_CLUSTER: { name: 'Roadside Café & Shop', icon: '☕', color: '#ec4899', discoveryRadius: 38.0 },
  QUIET_PARK: { name: 'Peaceful Park', icon: '🌸', color: '#f472b6', discoveryRadius: 36.0 },
  BRIDGE_CROSSING: { name: 'River Bridge', icon: '🌉', color: '#6366f1', discoveryRadius: 32.0 },
};

/**
 * Deterministic destination placement generator
 */
export function getChunkDestination(chunkX, chunkZ, seed = HEIWA_WORLD_SEED) {
  // Never place destinations inside authored starting neighborhood or immediate edge
  if (Math.abs(chunkX) <= 1 && Math.abs(chunkZ) <= 1) {
    return null;
  }

  const destRng = getChunkRng(chunkX, chunkZ, 505, seed);
  const roadCfg = getChunkRoadConfig(chunkX, chunkZ, seed);
  const zone = roadCfg.zone;

  // Occur in ~35% of procedural chunks for natural spacious discovery cadence
  if (destRng() > 0.35) {
    return null;
  }

  let type = DestinationType.SCENIC_VIEWPOINT;

  if (roadCfg.hasWaterStream && (roadCfg.hasAnyRoadNS || roadCfg.hasAnyRoadEW)) {
    type = destRng() > 0.5 ? DestinationType.BRIDGE_CROSSING : DestinationType.RIVERSIDE_REST;
  } else if (zone === LandUseZone.SCENIC_OVERLOOK) {
    type = destRng() > 0.4 ? DestinationType.SCENIC_VIEWPOINT : DestinationType.QUIET_PARK;
  } else if (zone === LandUseZone.FARMLAND) {
    type = destRng() > 0.3 ? DestinationType.SMALL_FARM : DestinationType.VILLAGE_CLUSTER;
  } else if (zone === LandUseZone.WOODLAND) {
    type = destRng() > 0.3 ? DestinationType.FOREST_CLEARING : DestinationType.SCENIC_VIEWPOINT;
  } else if (zone === LandUseZone.SUBURBAN) {
    type = destRng() > 0.5 ? DestinationType.QUIET_PARK : DestinationType.SMALL_COMMERCIAL_CLUSTER;
  } else if (zone === LandUseZone.RURAL_VILLAGE) {
    type = destRng() > 0.5 ? DestinationType.VILLAGE_CLUSTER : DestinationType.SMALL_COMMERCIAL_CLUSTER;
  }

  const meta = DESTINATION_META[type];
  const side = destRng() > 0.5 ? 1 : -1;
  const centerX = chunkX * 100;
  const centerZ = chunkZ * 100;

  // Compute world position offset alongside road
  let worldX = centerX + side * (16.0 + destRng() * 10.0);
  let worldZ = centerZ + (destRng() - 0.5) * 30.0;
  let approachX = centerX + side * 6.5;
  let approachZ = worldZ;

  if (type === DestinationType.BRIDGE_CROSSING) {
    worldX = centerX;
    worldZ = centerZ;
    approachX = centerX;
    approachZ = centerZ - 12.0;
  }

  return {
    id: `dest_${chunkX}_${chunkZ}`,
    chunkX,
    chunkZ,
    type,
    name: meta.name,
    icon: meta.icon,
    color: meta.color,
    discoveryRadius: meta.discoveryRadius,
    x: worldX,
    z: worldZ,
    worldX,
    worldZ,
    approachX,
    approachZ,
    hasRoadConnection: true,
  };
}
