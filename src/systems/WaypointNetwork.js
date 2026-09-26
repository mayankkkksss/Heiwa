import * as THREE from 'three';

/**
 * WaypointNetwork - Graph-based navigation network for Sakuragaoka District
 * Provides pre-mapped pedestrian routes along sidewalks, crosswalks, park trails, and shop interiors.
 */
export class WaypointNetwork {
  constructor() {
    this.nodes = new Map();
    this.buildDistrictGraph();
  }

  addNode(id, x, y, z, activity = 'WALK', neighbors = []) {
    this.nodes.set(id, {
      id,
      position: new THREE.Vector3(x, y, z),
      activity,
      neighbors: [...neighbors],
    });
  }

  addBidirectionalEdge(id1, id2) {
    const node1 = this.nodes.get(id1);
    const node2 = this.nodes.get(id2);
    if (node1 && node2) {
      if (!node1.neighbors.includes(id2)) node1.neighbors.push(id2);
      if (!node2.neighbors.includes(id1)) node2.neighbors.push(id1);
    }
  }

  buildDistrictGraph() {
    // ----------------------------------------------------
    // 1. MAIN STREET - WEST SIDEWALK (X = -6.5)
    // ----------------------------------------------------
    this.addNode('ms_w_n60', -6.5, 0.2, -60, 'WALK');
    this.addNode('ms_w_n40', -6.5, 0.2, -40, 'WALK');
    this.addNode('ms_w_n20', -6.5, 0.2, -20, 'WALK');
    this.addNode('ms_w_0', -6.5, 0.2, 0, 'WALK');
    this.addNode('ms_w_5', -6.5, 0.2, 5, 'WALK');
    this.addNode('ms_w_20', -6.5, 0.2, 20, 'WALK');
    this.addNode('ms_w_40', -6.5, 0.2, 40, 'WALK');
    this.addNode('ms_w_60', -6.5, 0.2, 60, 'WALK');
    this.addNode('ms_w_80', -6.5, 0.2, 80, 'WALK');

    this.addBidirectionalEdge('ms_w_n60', 'ms_w_n40');
    this.addBidirectionalEdge('ms_w_n40', 'ms_w_n20');
    this.addBidirectionalEdge('ms_w_n20', 'ms_w_0');
    this.addBidirectionalEdge('ms_w_0', 'ms_w_5');
    this.addBidirectionalEdge('ms_w_5', 'ms_w_20');
    this.addBidirectionalEdge('ms_w_20', 'ms_w_40');
    this.addBidirectionalEdge('ms_w_40', 'ms_w_60');
    this.addBidirectionalEdge('ms_w_60', 'ms_w_80');

    // ----------------------------------------------------
    // 2. MAIN STREET - EAST SIDEWALK (X = +6.5)
    // ----------------------------------------------------
    this.addNode('ms_e_n60', 6.5, 0.2, -60, 'WALK');
    this.addNode('ms_e_n40', 6.5, 0.2, -40, 'WALK');
    this.addNode('ms_e_n20', 6.5, 0.2, -20, 'WALK');
    this.addNode('ms_e_0', 6.5, 0.2, 0, 'WALK');
    this.addNode('ms_e_5', 6.5, 0.2, 5, 'WALK');
    this.addNode('ms_e_20', 6.5, 0.2, 20, 'WALK');
    this.addNode('ms_e_40', 6.5, 0.2, 40, 'WALK');
    this.addNode('ms_e_60', 6.5, 0.2, 60, 'WALK');
    this.addNode('ms_e_80', 6.5, 0.2, 80, 'WALK');

    this.addBidirectionalEdge('ms_e_n60', 'ms_e_n40');
    this.addBidirectionalEdge('ms_e_n40', 'ms_e_n20');
    this.addBidirectionalEdge('ms_e_n20', 'ms_e_0');
    this.addBidirectionalEdge('ms_e_0', 'ms_e_5');
    this.addBidirectionalEdge('ms_e_5', 'ms_e_20');
    this.addBidirectionalEdge('ms_e_20', 'ms_e_40');
    this.addBidirectionalEdge('ms_e_40', 'ms_e_60');
    this.addBidirectionalEdge('ms_e_60', 'ms_e_80');

    // ----------------------------------------------------
    // 3. CROSSWALKS ACROSS MAIN STREET
    // ----------------------------------------------------
    this.addNode('cw_n40_w', -3.5, 0.2, -40, 'WALK');
    this.addNode('cw_n40_e', 3.5, 0.2, -40, 'WALK');
    this.addBidirectionalEdge('ms_w_n40', 'cw_n40_w');
    this.addBidirectionalEdge('cw_n40_w', 'cw_n40_e');
    this.addBidirectionalEdge('cw_n40_e', 'ms_e_n40');

    this.addNode('cw_5_w', -3.5, 0.2, 5, 'WALK');
    this.addNode('cw_5_e', 3.5, 0.2, 5, 'WALK');
    this.addBidirectionalEdge('ms_w_5', 'cw_5_w');
    this.addBidirectionalEdge('cw_5_w', 'cw_5_e');
    this.addBidirectionalEdge('cw_5_e', 'ms_e_5');

    this.addNode('cw_40_w', -3.5, 0.2, 40, 'WALK');
    this.addNode('cw_40_e', 3.5, 0.2, 40, 'WALK');
    this.addBidirectionalEdge('ms_w_40', 'cw_40_w');
    this.addBidirectionalEdge('cw_40_w', 'cw_40_e');
    this.addBidirectionalEdge('cw_40_e', 'ms_e_40');

    // ----------------------------------------------------
    // 4. SHOPPING STREET & HIKARI MART (EAST)
    // ----------------------------------------------------
    this.addNode('shop_st_w', 10.0, 0.2, 40.0, 'WALK');
    this.addNode('vending_hub', 12.0, 0.2, 43.5, 'VENDING_STOP');
    this.addNode('shop_st_mid', 14.0, 0.2, 41.0, 'WALK');
    this.addNode('mart_apron', 16.5, 0.2, 42.0, 'LOOK_AROUND');
    this.addNode('mart_doors', 18.0, 0.2, 42.0, 'WALK');
    this.addNode('mart_aisle_1', 21.0, 0.2, 40.0, 'SHOP');
    this.addNode('mart_aisle_2', 21.0, 0.2, 44.0, 'SHOP');
    this.addNode('mart_cooler', 24.0, 0.2, 38.0, 'INSPECT');
    this.addNode('mart_register', 25.5, 0.2, 44.5, 'CHECKOUT');
    this.addNode('mart_back_dock', 24.0, 0.2, 50.0, 'DELIVERY');
    this.addNode('res_ne_lane', 28.0, 0.2, 60.0, 'DELIVERY');
    this.addNode('res_se_lane', 25.0, 0.2, -40.0, 'DELIVERY');

    this.addBidirectionalEdge('ms_e_40', 'shop_st_w');
    this.addBidirectionalEdge('shop_st_w', 'vending_hub');
    this.addBidirectionalEdge('shop_st_w', 'shop_st_mid');
    this.addBidirectionalEdge('vending_hub', 'shop_st_mid');
    this.addBidirectionalEdge('shop_st_mid', 'mart_apron');
    this.addBidirectionalEdge('mart_apron', 'mart_doors');
    this.addBidirectionalEdge('mart_doors', 'mart_aisle_1');
    this.addBidirectionalEdge('mart_doors', 'mart_aisle_2');
    this.addBidirectionalEdge('mart_aisle_1', 'mart_cooler');
    this.addBidirectionalEdge('mart_aisle_2', 'mart_register');
    this.addBidirectionalEdge('mart_cooler', 'mart_register');
    this.addBidirectionalEdge('shop_st_mid', 'mart_back_dock');
    this.addBidirectionalEdge('mart_back_dock', 'res_ne_lane');
    this.addBidirectionalEdge('ms_e_n40', 'res_se_lane');

    // ----------------------------------------------------
    // 5. RESIDENTIAL LANE & SAKURA HEIGHTS (WEST)
    // ----------------------------------------------------
    this.addNode('res_lane_e', -10.0, 0.2, -40.0, 'WALK');
    this.addNode('garbage_station', -16.0, 0.2, -42.0, 'INSPECT');
    this.addNode('res_lane_mid', -18.0, 0.2, -38.0, 'DELIVERY');
    this.addNode('tanaka_porch', -20.5, 0.2, -41.0, 'GARDEN');
    this.addNode('sakura_heights_canopy', -25.5, 0.2, -42.5, 'LOOK_AROUND');
    this.addNode('sakura_heights_mail', -23.2, 0.2, -42.5, 'DELIVERY');
    this.addNode('sakura_heights_bike', -29.5, 0.2, -44.0, 'INSPECT');
    this.addNode('sakura_heights_unit102', -25.5, 0.2, -39.0, 'REST');
    this.addNode('res_sw_lane', -32.0, 0.2, -55.0, 'DELIVERY');

    this.addBidirectionalEdge('ms_w_n40', 'res_lane_e');
    this.addBidirectionalEdge('res_lane_e', 'garbage_station');
    this.addBidirectionalEdge('res_lane_e', 'res_lane_mid');
    this.addBidirectionalEdge('garbage_station', 'tanaka_porch');
    this.addBidirectionalEdge('res_lane_mid', 'tanaka_porch');
    this.addBidirectionalEdge('tanaka_porch', 'sakura_heights_mail');
    this.addBidirectionalEdge('sakura_heights_mail', 'sakura_heights_canopy');
    this.addBidirectionalEdge('sakura_heights_canopy', 'sakura_heights_unit102');
    this.addBidirectionalEdge('sakura_heights_canopy', 'sakura_heights_bike');
    this.addBidirectionalEdge('sakura_heights_canopy', 'res_sw_lane');

    // ----------------------------------------------------
    // 6. SAKURAGAOKA PARK & NATURE GROVE (WEST)
    // ----------------------------------------------------
    this.addNode('park_ent', -9.0, 0.2, 5.0, 'LOOK_AROUND');
    this.addNode('park_path_e', -13.0, 0.2, 8.0, 'WALK');
    this.addNode('park_fountain', -16.0, 0.2, 6.0, 'REST');
    this.addNode('park_flowerbed', -19.0, 0.2, 14.0, 'GARDEN');
    this.addNode('park_bench_1', -24.5, 0.2, 8.0, 'SIT');
    this.addNode('park_playground_swings', -20.0, 0.2, -2.0, 'LOOK_AROUND');
    this.addNode('park_playground_slide', -26.0, 0.2, 0.0, 'REST');
    this.addNode('park_grove_south', -26.5, 0.2, 10.0, 'PHOTOGRAPH');
    this.addNode('park_grove_north', -30.0, 0.2, 18.0, 'PHOTOGRAPH');
    this.addNode('park_bench_2', -18.0, 0.2, 20.0, 'SIT');
    this.addNode('res_nw_lane', -28.0, 0.2, 50.0, 'DELIVERY');

    this.addBidirectionalEdge('ms_w_5', 'park_ent');
    this.addBidirectionalEdge('park_ent', 'park_path_e');
    this.addBidirectionalEdge('park_path_e', 'park_fountain');
    this.addBidirectionalEdge('park_path_e', 'park_flowerbed');
    this.addBidirectionalEdge('park_fountain', 'park_bench_1');
    this.addBidirectionalEdge('park_fountain', 'park_playground_swings');
    this.addBidirectionalEdge('park_playground_swings', 'park_playground_slide');
    this.addBidirectionalEdge('park_playground_slide', 'park_bench_1');
    this.addBidirectionalEdge('park_bench_1', 'park_grove_south');
    this.addBidirectionalEdge('park_flowerbed', 'park_grove_south');
    this.addBidirectionalEdge('park_flowerbed', 'park_bench_2');
    this.addBidirectionalEdge('park_grove_south', 'park_grove_north');
    this.addBidirectionalEdge('park_bench_2', 'park_grove_north');
    this.addBidirectionalEdge('park_grove_north', 'res_nw_lane');
    this.addBidirectionalEdge('res_nw_lane', 'ms_w_60');
  }

  getNode(id) {
    return this.nodes.get(id) || null;
  }

  getClosestNodeId(pos) {
    let closestId = null;
    let minDistSq = Infinity;

    for (const [id, node] of this.nodes) {
      const dSq = node.position.distanceToSquared(pos);
      if (dSq < minDistSq) {
        minDistSq = dSq;
        closestId = id;
      }
    }
    return closestId;
  }

  findPath(startPos, targetNodeId) {
    const targetNode = this.nodes.get(targetNodeId);
    if (!targetNode) return [];

    const startNodeId = this.getClosestNodeId(startPos);
    if (!startNodeId) return [targetNode.position.clone()];

    if (startNodeId === targetNodeId) {
      return [targetNode.position.clone()];
    }

    // Breadth-First Search on waypoint graph
    const queue = [startNodeId];
    const visited = new Set([startNodeId]);
    const parentMap = new Map();

    let found = false;
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (currentId === targetNodeId) {
        found = true;
        break;
      }

      const currentNode = this.nodes.get(currentId);
      if (!currentNode) continue;

      for (const neighborId of currentNode.neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          parentMap.set(neighborId, currentId);
          queue.push(neighborId);
        }
      }
    }

    if (!found) {
      // Direct path fallback
      return [targetNode.position.clone()];
    }

    // Reconstruct path
    const pathNodes = [];
    let curr = targetNodeId;
    while (curr) {
      const node = this.nodes.get(curr);
      if (node) pathNodes.unshift(node.position.clone());
      curr = parentMap.get(curr);
    }

    return pathNodes;
  }
}
