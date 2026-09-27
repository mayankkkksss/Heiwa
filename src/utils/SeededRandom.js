/**
 * SeededRandom.js - Deterministic Pseudo-Random Number Generator and Noise Utilities for HEIWA.
 * Ensures infinite procedural world reproducibility from a single master world seed.
 */

export const HEIWA_WORLD_SEED = 20260927;

/**
 * SplitMix32 / Mulberry32 deterministic generator
 */
export function createRng(seed) {
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
export function hashChunkCoords(chunkX, chunkZ, seed = HEIWA_WORLD_SEED, salt = 0) {
  let h = seed ^ (chunkX * 374761393) ^ (chunkZ * 668265263) ^ (salt * 1442695040);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Returns a seeded RNG scoped specifically to a chunk and sub-feature
 */
export function getChunkRng(chunkX, chunkZ, salt = 0, seed = HEIWA_WORLD_SEED) {
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
 * Simple 2D smooth value noise for gentle rolling terrain
 */
export function getTerrainHeight(worldX, worldZ, seed = HEIWA_WORLD_SEED) {
  // Check if inside authored starting area: keep completely flat ground for starting neighborhood
  if (Math.abs(worldX) < 140 && Math.abs(worldZ) < 140) {
    return 0;
  }

  // Frequency octaves for gentle rolling countryside
  const freq1 = 0.008;
  const freq2 = 0.022;

  const n1 = (Math.sin(worldX * freq1 + seed * 0.01) + Math.cos(worldZ * freq1 + seed * 0.02)) * 0.5;
  const n2 = (Math.sin(worldX * freq2 * 1.3) * Math.cos(worldZ * freq2 * 1.1)) * 0.5;

  const rawHeight = n1 * 3.5 + n2 * 1.2;

  // Smooth ramp-in transition near the boundary of the authored starting area
  const distFromAuthoredX = Math.max(0, Math.abs(worldX) - 140);
  const distFromAuthoredZ = Math.max(0, Math.abs(worldZ) - 140);
  const blendFactor = Math.min(1.0, Math.max(distFromAuthoredX, distFromAuthoredZ) / 40.0);

  return rawHeight * blendFactor;
}

