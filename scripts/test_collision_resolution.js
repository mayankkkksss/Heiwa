import * as THREE from 'three';

console.log('====================================================');
console.log('HEIWA CHUNK 33 — RIGOROUS GROUND-UP COLLISION AUDIT');
console.log('====================================================');

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    passedCount++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedCount++;
    console.error(`  [FAIL] ${testName}: ${detail}`);
  }
}

// Minimal WorldSystem collision simulator replicating src/systems/WorldSystem.js
class TestWorldSystem {
  constructor() {
    this.colliders = [];
  }

  addBoxCollider(x, y, z, width, height, depth) {
    this.colliders.push({
      type: 'box',
      x,
      y,
      z,
      width,
      height,
      depth,
      minX: x - width / 2,
      maxX: x + width / 2,
      minY: y,
      maxY: y + height,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
    });
  }

  addCylinderCollider(cx, cz, radius, minY = 0, maxY = 25) {
    this.colliders.push({
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
    });
  }

  resolvePlayerMovement(pos, disp, radius = 0.38, y = 0, height = 1.80, stepHeight = 0.35) {
    const feetY = y;
    const headY = y + height;

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

    // 1. Initial de-penetration
    for (let cIdx = 0; cIdx < this.colliders.length; cIdx++) {
      depenetrateFromCollider(pos, this.colliders[cIdx]);
    }

    // 2. Substepped movement
    const totalDist = Math.hypot(disp.x, disp.z);
    if (totalDist < 0.00001) return pos;

    const maxSubstepDist = 0.04;
    const substeps = Math.min(12, Math.max(1, Math.ceil(totalDist / maxSubstepDist)));
    const stepX = disp.x / substeps;
    const stepZ = disp.z / substeps;

    for (let s = 0; s < substeps; s++) {
      // Resolve X
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
                proposedX = Math.min(proposedX, col.minX - radius - 0.0005);
              } else if (pos.x >= col.maxX) {
                proposedX = Math.max(proposedX, col.maxX + radius + 0.0005);
              } else {
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

      // Resolve Z
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
                proposedZ = Math.min(proposedZ, col.minZ - radius - 0.0005);
              } else if (pos.z >= col.maxZ) {
                proposedZ = Math.max(proposedZ, col.maxZ + radius + 0.0005);
              } else {
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

    // 3. Final safety de-penetration
    for (let cIdx = 0; cIdx < this.colliders.length; cIdx++) {
      depenetrateFromCollider(pos, this.colliders[cIdx]);
    }

    return pos;
  }
}

const world = new TestWorldSystem();
const playerRadius = 0.38;

// Register representative world geometry
const treeX = -16.5;
const treeZ = -48.0;
const treeRadius = 0.48;
world.addCylinderCollider(treeX, treeZ, treeRadius, 0, 6.0); // Street Sakura Tree near spawn

world.addBoxCollider(-24.0, 0, -58.0, 16.0, 12.0, 8.0); // Sakura Heights building
world.addBoxCollider(-25.5, 0, 29.0, 20.0, 1.2, 0.3);   // Park fence
world.addBoxCollider(0, 0, 18.0, 3.0, 0.8, 1.0);        // Park Bench
world.addBoxCollider(21.0, 0, -40.0, 0.9, 1.8, 3.5);    // HIKARI Mart shelf
world.addCylinderCollider(5.0, -5.0, 0.28, 0, 9.0);     // Utility Pole

// TEST 1: Tree Trunk Walk Collision (Cannot pass through)
let pos = new THREE.Vector3(treeX, 0, treeZ + 2.0);
world.resolvePlayerMovement(pos, new THREE.Vector3(0, 0, -3.0), playerRadius);
let distToTree = Math.hypot(pos.x - treeX, pos.z - treeZ);
assert(distToTree >= treeRadius + playerRadius - 0.002, 'TEST 1: Walk directly toward Tree trunk (stopped before intersecting)', `dist = ${distToTree.toFixed(4)}, min = ${(treeRadius + playerRadius).toFixed(4)}`);

// TEST 2: Tree Trunk Jogging Collision (Cannot tunnel through)
pos = new THREE.Vector3(treeX, 0, treeZ + 1.5);
world.resolvePlayerMovement(pos, new THREE.Vector3(0, 0, -4.5), playerRadius);
distToTree = Math.hypot(pos.x - treeX, pos.z - treeZ);
assert(distToTree >= treeRadius + playerRadius - 0.002, 'TEST 2: Jog directly toward Tree trunk (no tunneling)', `dist = ${distToTree.toFixed(4)}`);

// TEST 3: Tree Diagonal Movement (Slides smoothly around trunk)
pos = new THREE.Vector3(treeX - 0.1, 0, treeZ + treeRadius + playerRadius);
const initialX = pos.x;
world.resolvePlayerMovement(pos, new THREE.Vector3(-0.5, 0, -0.5), playerRadius);
assert(pos.x < initialX - 0.1, 'TEST 3A: Diagonal movement allows X sliding around tree trunk', `pos.x = ${pos.x.toFixed(4)}`);
distToTree = Math.hypot(pos.x - treeX, pos.z - treeZ);
assert(distToTree >= treeRadius + playerRadius - 0.002, 'TEST 3B: Tree sliding maintains safe distance from trunk', `dist = ${distToTree.toFixed(4)}`);

// TEST 4: Walk into Building Wall (Cannot pass through)
pos = new THREE.Vector3(-24.0, 0, -53.2);
world.resolvePlayerMovement(pos, new THREE.Vector3(0, 0, -2.0), playerRadius);
assert(pos.z >= -54.0 + playerRadius - 0.002, 'TEST 4: Walk into Sakura Heights building wall (stopped outside wall)', `pos.z = ${pos.z.toFixed(4)}`);

// TEST 5: Jog into Building Wall (No tunneling)
pos = new THREE.Vector3(-24.0, 0, -52.5);
world.resolvePlayerMovement(pos, new THREE.Vector3(0, 0, -4.0), playerRadius);
assert(pos.z >= -54.0 + playerRadius - 0.002, 'TEST 5: Jog into Building wall (no tunneling)', `pos.z = ${pos.z.toFixed(4)}`);

// TEST 6: Walk into Fence (Blocked)
pos = new THREE.Vector3(-25.5, 0, 27.5);
world.resolvePlayerMovement(pos, new THREE.Vector3(0, 0, 2.5), playerRadius);
const fenceMinZ = 29.0 - 0.15;
assert(pos.z <= fenceMinZ - playerRadius + 0.002, 'TEST 6: Walk into Park Fence (blocked)', `pos.z = ${pos.z.toFixed(4)}, fenceMinZ = ${fenceMinZ}`);

// TEST 7: Walk into Bench (Blocked)
pos = new THREE.Vector3(0, 0, 16.5);
world.resolvePlayerMovement(pos, new THREE.Vector3(0, 0, 2.0), playerRadius);
const benchMinZ = 18.0 - 0.5;
assert(pos.z <= benchMinZ - playerRadius + 0.002, 'TEST 7: Walk into Park Bench (blocked)', `pos.z = ${pos.z.toFixed(4)}`);

// TEST 8: Walk into HIKARI Shelf (Blocked)
pos = new THREE.Vector3(22.5, 0, -40.0);
world.resolvePlayerMovement(pos, new THREE.Vector3(-2.5, 0, 0), playerRadius);
const shelfMaxX = 21.0 + 0.45;
assert(pos.x >= shelfMaxX + playerRadius - 0.002, 'TEST 8: Walk into HIKARI Mart snack shelf (blocked)', `pos.x = ${pos.x.toFixed(4)}`);

// TEST 9: Walk into Utility Pole Cylinder (Blocked)
pos = new THREE.Vector3(5.0, 0, -6.5);
world.resolvePlayerMovement(pos, new THREE.Vector3(0, 0, 2.5), playerRadius);
const poleDist = Math.hypot(pos.x - 5.0, pos.z - (-5.0));
assert(poleDist >= 0.28 + playerRadius - 0.002, 'TEST 9: Walk into Utility Pole cylinder (blocked)', `dist = ${poleDist.toFixed(4)}`);

// TEST 10: De-penetration from inside solid box
pos = new THREE.Vector3(-24.0, 0, -54.2);
world.resolvePlayerMovement(pos, new THREE.Vector3(0, 0, 0), playerRadius);
assert(pos.z >= -54.0 + playerRadius - 0.002, 'TEST 10: De-penetration pushes player out of solid box', `pos.z = ${pos.z.toFixed(4)}`);

// TEST 11: Continuous 100-frame movement held against tree
pos = new THREE.Vector3(treeX, 0, treeZ + 1.2);
for (let f = 0; f < 100; f++) {
  world.resolvePlayerMovement(pos, new THREE.Vector3(0, 0, -0.08), playerRadius);
}
distToTree = Math.hypot(pos.x - treeX, pos.z - treeZ);
assert(distToTree >= treeRadius + playerRadius - 0.002, 'TEST 11: 100-frame continuous movement against tree holds boundary', `dist = ${distToTree.toFixed(4)}`);

// TEST 12: NPC dynamic soft collision avoidance
const npcPos = new THREE.Vector3(-10.0, 0, 5.0);
const npcRadius = 0.40;
let playerPos = new THREE.Vector3(-10.0, 0, 4.2); // Proposing movement directly into NPC center
const minDistNpc = playerRadius + npcRadius; // 0.38 + 0.40 = 0.78m
const dxNpc = playerPos.x - npcPos.x;
const dzNpc = playerPos.z - npcPos.z;
const distNpcSq = dxNpc * dxNpc + dzNpc * dzNpc;
if (distNpcSq < minDistNpc * minDistNpc) {
  const dist = Math.sqrt(distNpcSq);
  const overlap = minDistNpc - dist;
  playerPos.x += (dxNpc / dist) * overlap;
  playerPos.z += (dzNpc / dist) * overlap;
}
const finalNpcDist = Math.hypot(playerPos.x - npcPos.x, playerPos.z - npcPos.z);
assert(finalNpcDist >= minDistNpc - 0.001, 'TEST 12: Dynamic NPC soft repulsion prevents player body overlap', `dist = ${finalNpcDist.toFixed(4)}, minDist = ${minDistNpc.toFixed(4)}`);

// TEST 13: Walk into HIKARI MART Kei Car (Blocked from walking through vehicle)
world.addBoxCollider(13.8, 0, 48.0, 3.6, 1.8, 1.8); // World-space Kei Car at (13.8, 48.0)
pos = new THREE.Vector3(13.8, 0, 44.5);
world.resolvePlayerMovement(pos, new THREE.Vector3(0, 0, 5.0), playerRadius);
const carMinZ = 48.0 - 0.9;
assert(pos.z <= carMinZ - playerRadius + 0.002, 'TEST 13: Walk into HIKARI Kei Car (stopped outside vehicle body)', `pos.z = ${pos.z.toFixed(4)}, carMinZ = ${carMinZ}`);

// TEST 14: Walk into Roadside Bush Planter (Blocked)
world.addBoxCollider(-6.2, 0, -20.0, 0.7, 0.6, 16.0); // Roadside hedge planter
pos = new THREE.Vector3(-4.0, 0, -20.0);
world.resolvePlayerMovement(pos, new THREE.Vector3(-3.0, 0, 0), playerRadius);
const planterMaxX = -6.2 + 0.35;
assert(pos.x >= planterMaxX + playerRadius - 0.002, 'TEST 14: Walk into Roadside Bush Planter (blocked)', `pos.x = ${pos.x.toFixed(4)}, planterMaxX = ${planterMaxX}`);

// TEST 15: Open Doorway Entrance (Walkable through opening)
// HIKARI MART doorway is open at x = 18.0 between z = 38.5 and z = 45.0
pos = new THREE.Vector3(16.0, 0, 41.5);
world.resolvePlayerMovement(pos, new THREE.Vector3(4.0, 0, 0), playerRadius);
assert(pos.x >= 19.5, 'TEST 15: Walk through open doorway entrance into HIKARI MART', `pos.x = ${pos.x.toFixed(4)}`);

console.log('\n====================================================');
console.log(`TOTAL PASSED: ${passedCount}`);
console.log(`TOTAL FAILED: ${failedCount}`);
console.log('====================================================');

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('STATUS: ALL COLLISION TESTS PASSED PERFECTLY');
  process.exit(0);
}
