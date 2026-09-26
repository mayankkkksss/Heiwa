import * as THREE from 'three';
import { ProceduralTextures } from '../utils/ProceduralTextures.js';
import { globalBus } from '../engine/EventBus.js';

/**
 * StreetPropsGenerator - Creates quintessential Japanese urban details, utility poles, wires, road mirrors, park playground
 */
export class StreetPropsGenerator {
  constructor() {
    this.materials = {
      poleConcrete: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85 }),
      transformer: new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.65, roughness: 0.35 }),
      metalOrange: new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.55, roughness: 0.3 }),
      mirrorGlass: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.95, roughness: 0.05 }),
      wireDark: new THREE.LineBasicMaterial({ color: 0x1e293b, linewidth: 2 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.3 }),
      postboxRed: new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.4, roughness: 0.35 }),
    };

    this.utilityPoleTops = [];
  }

  /**
   * Japanese Utility Pole with multi-tier crossarms, transformers & streetlamps
   */
  createUtilityPole(x, y, z) {
    const poleGroup = new THREE.Group();
    poleGroup.position.set(x, y, z);

    const height = 9.8;

    // 1. Concrete Pole Body
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.24, height, 12);
    const pole = new THREE.Mesh(poleGeo, this.materials.poleConcrete);
    pole.position.y = height / 2;
    pole.castShadow = true;
    pole.receiveShadow = true;
    poleGroup.add(pole);

    // 2. Crossarm 1 (Top high-voltage tier)
    const cross1Geo = new THREE.BoxGeometry(2.5, 0.1, 0.1);
    const cross1 = new THREE.Mesh(cross1Geo, this.materials.steel);
    cross1.position.set(0, height - 0.6, 0);
    cross1.castShadow = true;
    poleGroup.add(cross1);

    // Insulators on crossarm
    [-1.0, 0, 1.0].forEach((ix) => {
      const insGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.18, 8);
      const insMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
      const ins = new THREE.Mesh(insGeo, insMat);
      ins.position.set(ix, height - 0.45, 0);
      poleGroup.add(ins);
    });

    // 3. Crossarm 2 (Lower telecommunication / residential distribution tier)
    const cross2Geo = new THREE.BoxGeometry(1.9, 0.08, 0.08);
    const cross2 = new THREE.Mesh(cross2Geo, this.materials.steel);
    cross2.position.set(0, height - 1.8, 0);
    cross2.castShadow = true;
    poleGroup.add(cross2);

    // 4. Cylindrical Transformer with cooling fins & insulator caps
    const transGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.95, 12);
    const trans = new THREE.Mesh(transGeo, this.materials.transformer);
    trans.position.set(0.42, height - 2.8, 0);
    trans.castShadow = true;
    poleGroup.add(trans);

    // 5. Utility Street Lamp attached to pole
    const lampArmGeo = new THREE.BoxGeometry(0.65, 0.04, 0.04);
    const lampArm = new THREE.Mesh(lampArmGeo, this.materials.steel);
    lampArm.position.set(-0.38, 4.9, 0);
    poleGroup.add(lampArm);

    const lampGeo = new THREE.BoxGeometry(0.38, 0.14, 0.22);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffedd5,
      emissive: 0xfef08a,
      emissiveIntensity: 0.55,
    });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(-0.65, 4.85, 0);
    poleGroup.add(lamp);

    // Street Light Point Light
    const light = new THREE.PointLight(0xfef08a, 0.9, 14);
    light.position.set(-0.65, 4.6, 0);
    poleGroup.add(light);

    // 6. Yellow & Black Striped Warning Base Marker (Reflective Japanese pole wrap)
    const baseWrapGeo = new THREE.CylinderGeometry(0.245, 0.25, 1.4, 12);
    const baseWrapMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 });
    const baseWrap = new THREE.Mesh(baseWrapGeo, baseWrapMat);
    baseWrap.position.y = 0.7;
    poleGroup.add(baseWrap);

    // Japanese Neighborhood Address Plate
    const addressPlateGeo = new THREE.PlaneGeometry(0.14, 0.38);
    const addressPlateMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.4 });
    const addressPlate = new THREE.Mesh(addressPlateGeo, addressPlateMat);
    addressPlate.position.set(0, 1.8, 0.245);
    poleGroup.add(addressPlate);

    // Save anchor for catenary wire generation
    this.utilityPoleTops.push(new THREE.Vector3(x, y + height - 0.6, z));

    return { poleGroup, light };
  }

  /**
   * Connects utility poles with realistic catenary sagging overhead wires
   */
  createOverheadWires(scene) {
    if (this.utilityPoleTops.length < 2) return;

    for (let i = 0; i < this.utilityPoleTops.length - 1; i++) {
      const p1 = this.utilityPoleTops[i];
      const p2 = this.utilityPoleTops[i + 1];

      // Connect poles within reasonable distance (< 55m)
      if (p1.distanceTo(p2) < 55) {
        [-0.45, 0.45].forEach((offset) => {
          const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
          midPoint.y -= 0.65; // Catenary sag

          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(p1.x + offset, p1.y, p1.z),
            midPoint,
            new THREE.Vector3(p2.x + offset, p2.y, p2.z)
          );

          const points = curve.getPoints(16);
          const wireGeo = new THREE.BufferGeometry().setFromPoints(points);
          const wire = new THREE.Line(wireGeo, this.materials.wireDark);
          scene.add(wire);
        });
      }
    }
  }

  /**
   * Japanese Road Traffic Mirror (Convex Orange Road Mirror)
   */
  createRoadMirror(x, y, z, rotY = 0) {
    const mirrorGroup = new THREE.Group();
    mirrorGroup.position.set(x, y, z);
    mirrorGroup.rotation.y = rotY;

    // Orange Support Pole
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 3.2, 8);
    const pole = new THREE.Mesh(poleGeo, this.materials.metalOrange);
    pole.position.y = 1.6;
    pole.castShadow = true;
    mirrorGroup.add(pole);

    // Round Orange Housing with Weather Sunshade Rim
    const housingGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.09, 16);
    housingGeo.rotateX(Math.PI / 2);
    const housing = new THREE.Mesh(housingGeo, this.materials.metalOrange);
    housing.position.set(0, 3.0, 0.15);
    housing.rotation.x = 0.2; // Angle down towards street
    housing.castShadow = true;
    mirrorGroup.add(housing);

    // Convex Mirror Surface
    const mirrorGeo = new THREE.SphereGeometry(0.4, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.4);
    const mirror = new THREE.Mesh(mirrorGeo, this.materials.mirrorGlass);
    mirror.position.set(0, 3.0, 0.2);
    mirror.rotation.x = Math.PI + 0.2;
    mirrorGroup.add(mirror);

    mirrorGroup.userData = {
      isInteractive: true,
      interactionType: 'road_mirror',
      prompt: 'Check Road Mirror',
      name: 'Intersection Curved Mirror',
      onInteract: () => {
        globalBus.emit('dialogue:open', {
          speaker: 'Road Mirror',
          avatar: '🪞',
          text: 'A clean convex street mirror. The intersection is clear and peaceful.',
        });
        globalBus.emit('toast:show', { message: 'Checked intersection mirror.' });
      },
    };

    return mirrorGroup;
  }

  /**
   * Japanese Road Sign (30 km/h Speed Limit or Pedestrian)
   */
  createRoadSign(x, y, z, type = 'speed30', rotY = 0) {
    const signGroup = new THREE.Group();
    signGroup.position.set(x, y, z);
    signGroup.rotation.y = rotY;

    // Pole
    const poleGeo = new THREE.CylinderGeometry(0.035, 0.035, 3.0, 8);
    const pole = new THREE.Mesh(poleGeo, this.materials.steel);
    pole.position.y = 1.5;
    pole.castShadow = true;
    signGroup.add(pole);

    // Sign Board
    const signGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.03, 16);
    signGeo.rotateX(Math.PI / 2);

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    if (type === 'speed30') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(64, 64, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 14;
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.font = '900 64px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('30', 64, 86);
    } else {
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(4, 4, 120, 120);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚶', 64, 80);
    }

    const tex = new THREE.CanvasTexture(canvas);
    const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3 });
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(0, 2.7, 0.02);
    signMesh.castShadow = true;
    signGroup.add(signMesh);

    return signGroup;
  }

  /**
   * Japanese Red Public Postbox
   */
  createJapanesePostbox(x, y, z, rotY = 0) {
    const postGroup = new THREE.Group();
    postGroup.position.set(x, y, z);
    postGroup.rotation.y = rotY;

    // Red Main Body
    const bodyGeo = new THREE.BoxGeometry(0.72, 0.85, 0.52);
    const body = new THREE.Mesh(bodyGeo, this.materials.postboxRed);
    body.position.y = 0.85;
    body.castShadow = true;
    postGroup.add(body);

    // Silver Base Pedestal
    const baseGeo = new THREE.BoxGeometry(0.5, 0.45, 0.4);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.225;
    base.castShadow = true;
    postGroup.add(base);

    // Post symbol "POST" mark
    const markGeo = new THREE.PlaneGeometry(0.24, 0.16);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POST', 64, 46);

    const markTex = new THREE.CanvasTexture(canvas);
    const markMat = new THREE.MeshStandardMaterial({ map: markTex, transparent: true });
    const mark = new THREE.Mesh(markGeo, markMat);
    mark.position.set(0, 1.05, 0.27);
    postGroup.add(mark);

    // Dual Mail slots
    [-0.18, 0.18].forEach((sx) => {
      const slotGeo = new THREE.BoxGeometry(0.22, 0.05, 0.08);
      const slotMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
      const slot = new THREE.Mesh(slotGeo, slotMat);
      slot.position.set(sx, 1.18, 0.24);
      postGroup.add(slot);
    });

    postGroup.userData = {
      isInteractive: true,
      interactionType: 'postbox',
      prompt: 'Post a Letter',
      name: 'Japan Post Box',
      onInteract: () => {
        globalBus.emit('dialogue:open', {
          speaker: 'Post Box',
          avatar: '📮',
          text: 'A classic bright red neighborhood mailbox. Letters dropped here will be collected at 11:30 AM.',
        });
        globalBus.emit('toast:show', { message: 'Checked neighborhood postbox.' });
      },
    };

    return postGroup;
  }

  /**
   * Japanese Neighborhood Garbage Collection Station (Gomi Net / Cage)
   */
  createGarbageStation(x, y, z) {
    const stationGroup = new THREE.Group();
    stationGroup.position.set(x, y, z);

    // Green Protective Netting Box
    const netGeo = new THREE.BoxGeometry(1.8, 0.7, 1.2);
    const netMat = new THREE.MeshStandardMaterial({
      color: 0x15803d,
      roughness: 0.9,
    });
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.y = 0.35;
    net.castShadow = true;
    stationGroup.add(net);

    // Blue and Yellow Plastic Sorting Bins
    [-0.5, 0.5].forEach((bx, i) => {
      const binGeo = new THREE.BoxGeometry(0.45, 0.5, 0.45);
      const binMat = new THREE.MeshStandardMaterial({
        color: i === 0 ? 0x0284c7 : 0xeab308,
        roughness: 0.5,
      });
      const bin = new THREE.Mesh(binGeo, binMat);
      bin.position.set(bx, 0.25, 0);
      stationGroup.add(bin);
    });

    stationGroup.userData = {
      isInteractive: true,
      interactionType: 'garbage',
      prompt: 'Inspect',
      name: 'Garbage Collection Station',
      onInteract: () => {
        globalBus.emit('dialogue:open', {
          speaker: 'Neighborhood Recycling Station',
          avatar: '♻️',
          text: 'Residential waste & recycling collection point. Blue bins for glass/cans, yellow for plastics, and green mesh net for burnables. Everything is neatly sorted.',
        });
        globalBus.emit('toast:show', { message: 'Inspected neighborhood recycling station.' });
      },
    };

    return stationGroup;
  }

  /**
   * Neighborhood Community Notice Board / Park Map
   */
  createNoticeBoard(x, y, z, type = 'community', rotY = 0) {
    const boardGroup = new THREE.Group();
    boardGroup.position.set(x, y, z);
    boardGroup.rotation.y = rotY;

    // Wooden Posts
    [-0.9, 0.9].forEach((px) => {
      const postGeo = new THREE.BoxGeometry(0.12, 2.4, 0.12);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.8 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, 1.2, 0);
      post.castShadow = true;
      boardGroup.add(post);
    });

    // Roof Eaves Cap
    const roofGeo = new THREE.BoxGeometry(2.1, 0.1, 0.35);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, 2.35, 0);
    roof.castShadow = true;
    boardGroup.add(roof);

    // Cork Bulletin Board backing
    const boardGeo = new THREE.BoxGeometry(1.8, 1.1, 0.06);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.9 });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 1.6, 0);
    board.castShadow = true;
    boardGroup.add(board);

    // Posters / Flyers on Board
    const flyerColors = [0xfef08a, 0xffedd5, 0xe0f2fe, 0xfce7f3];
    [-0.55, -0.18, 0.18, 0.55].forEach((fx, i) => {
      const flyerGeo = new THREE.PlaneGeometry(0.3, 0.42);
      const flyerMat = new THREE.MeshStandardMaterial({
        color: flyerColors[i % flyerColors.length],
        roughness: 0.5,
      });
      const flyer = new THREE.Mesh(flyerGeo, flyerMat);
      flyer.position.set(fx, 1.6 + (i % 2 === 0 ? 0.08 : -0.08), 0.035);
      boardGroup.add(flyer);
    });

    const isPark = type === 'park';
    boardGroup.userData = {
      isInteractive: true,
      interactionType: 'notice',
      prompt: 'Read',
      name: isPark ? 'Park Information Board' : 'Community Notice Board',
      onInteract: () => {
        const text = isPark
          ? 'Sakuragaoka Park Guide: 1. Keep the cherry blossom grove clean. 2. Playground open from 6:00 AM to 7:00 PM. 3. Dogs must be on a leash. Enjoy your peaceful walk!'
          : 'Sakuragaoka Community Notice: Next neighborhood garden cleanup is scheduled for Sunday morning. Local library book exchange box open at Community Center.';
        globalBus.emit('dialogue:open', {
          speaker: isPark ? 'Park Information Board' : 'Community Notice Board',
          avatar: '📋',
          text,
        });
        globalBus.emit('toast:show', { message: `Read ${boardGroup.userData.name}.` });
      },
    };

    return boardGroup;
  }

  /**
   * Japanese Park Playground (Slide & Swings)
   */
  createPlayground(x, y, z) {
    const playGroup = new THREE.Group();
    playGroup.position.set(x, y, z);

    // 1. Kids Slide
    const slideGroup = new THREE.Group();
    slideGroup.position.set(-3.5, 0, 0);

    const platformGeo = new THREE.BoxGeometry(1.2, 0.1, 1.2);
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = 1.8;
    platform.castShadow = true;
    slideGroup.add(platform);

    // 4 legs
    [
      [-0.55, 0.55],
      [0.55, 0.55],
      [-0.55, -0.55],
      [0.55, -0.55],
    ].forEach(([lx, lz]) => {
      const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8);
      const leg = new THREE.Mesh(legGeo, this.materials.steel);
      leg.position.set(lx, 0.9, lz);
      leg.castShadow = true;
      slideGroup.add(leg);
    });

    // Slide chute ramp
    const chuteGeo = new THREE.BoxGeometry(0.7, 0.08, 3.2);
    const chuteMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.5, roughness: 0.2 });
    const chute = new THREE.Mesh(chuteGeo, chuteMat);
    chute.position.set(0, 0.9, 1.6);
    chute.rotation.x = Math.PI / 6;
    chute.castShadow = true;
    slideGroup.add(chute);

    // Slide ladder steps
    for (let s = 1; s <= 5; s++) {
      const stepGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8);
      stepGeo.rotateZ(Math.PI / 2);
      const step = new THREE.Mesh(stepGeo, this.materials.steel);
      step.position.set(0, s * 0.32, -0.58);
      slideGroup.add(step);
    }

    playGroup.add(slideGroup);

    // 2. Swings
    const swingGroup = new THREE.Group();
    swingGroup.position.set(3.0, 0, 0);

    const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, 4.0, 8);
    beamGeo.rotateZ(Math.PI / 2);
    const beamMat = new THREE.MeshStandardMaterial({ color: 0xfacc15 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 2.4;
    beam.castShadow = true;
    swingGroup.add(beam);

    // A-frame side supports
    [-1.9, 1.9].forEach((sx) => {
      [-0.6, 0.6].forEach((sz) => {
        const supportGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8);
        const support = new THREE.Mesh(supportGeo, beamMat);
        support.position.set(sx, 1.2, sz * 0.5);
        support.rotation.x = sz > 0 ? -0.25 : 0.25;
        support.castShadow = true;
        swingGroup.add(support);
      });
    });

    // Two swing seats
    [-0.8, 0.8].forEach((seatX) => {
      const seatGeo = new THREE.BoxGeometry(0.5, 0.04, 0.24);
      const seatMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
      const seat = new THREE.Mesh(seatGeo, seatMat);
      seat.position.set(seatX, 0.45, 0);
      swingGroup.add(seat);

      // Chains
      [-0.2, 0.2].forEach((cx) => {
        const chainGeo = new THREE.CylinderGeometry(0.01, 0.01, 1.95, 4);
        const chain = new THREE.Mesh(chainGeo, this.materials.steel);
        chain.position.set(seatX + cx, 1.425, 0);
        swingGroup.add(chain);
      });
    });

    playGroup.add(swingGroup);

    return playGroup;
  }

  /**
   * Japanese Park Drinking Fountain
   */
  createDrinkingFountain(x, y, z) {
    const fountainGroup = new THREE.Group();
    fountainGroup.position.set(x, y, z);

    // Concrete Pedestal
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.85, 0.5);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.425;
    body.castShadow = true;
    fountainGroup.add(body);

    // Stainless basin & tap
    const basinGeo = new THREE.CylinderGeometry(0.2, 0.18, 0.1, 12);
    const basin = new THREE.Mesh(basinGeo, this.materials.steel);
    basin.position.set(0, 0.9, 0);
    fountainGroup.add(basin);

    const tapGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6);
    const tap = new THREE.Mesh(tapGeo, this.materials.steel);
    tap.position.set(0, 0.98, 0.08);
    tap.rotation.x = -0.3;
    fountainGroup.add(tap);

    fountainGroup.userData = {
      isInteractive: true,
      interactionType: 'fountain',
      prompt: 'Drink Fresh Water',
      name: 'Park Water Fountain',
      onInteract: () => {
        globalBus.emit('dialogue:open', {
          speaker: 'Drinking Fountain',
          avatar: '💧',
          text: 'You take a cool, refreshing sip of clean water in the quiet park.',
        });
        globalBus.emit('toast:show', { message: 'Drank fresh water at the park.' });
      },
    };

    return fountainGroup;
  }

  /**
   * Flower Bed with vibrant blooming flowers (Azaleas & Hydrangeas)
   */
  createFlowerBed(x, y, z, width = 4.0, depth = 1.6) {
    const bedGroup = new THREE.Group();
    bedGroup.position.set(x, y, z);

    // Stone curbing border
    const borderGeo = new THREE.BoxGeometry(width, 0.22, depth);
    const borderMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85 });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.position.y = 0.11;
    border.castShadow = true;
    border.receiveShadow = true;
    bedGroup.add(border);

    // Dark organic garden mulch/soil
    const soilGeo = new THREE.PlaneGeometry(width - 0.25, depth - 0.25);
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 1.0 });
    const soil = new THREE.Mesh(soilGeo, soilMat);
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.2;
    bedGroup.add(soil);

    // Controlled Japanese flower palette: pink azalea, soft hydrangea blue, soft marigold yellow, and white lilies
    const flowerColors = [0xf472b6, 0x60a5fa, 0xfbbf24, 0xf8fafc, 0xfb7185];
    const flowerGeo = new THREE.DodecahedronGeometry(0.18, 1);

    for (let fx = -width * 0.38; fx <= width * 0.38; fx += 0.58) {
      for (let fz = -depth * 0.28; fz <= depth * 0.28; fz += 0.52) {
        const color = flowerColors[Math.floor(Math.random() * flowerColors.length)];
        const flowerMat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, flatShading: true });
        const flower = new THREE.Mesh(flowerGeo, flowerMat);
        flower.position.set(fx + (Math.random() - 0.5) * 0.16, 0.28, fz + (Math.random() - 0.5) * 0.16);
        flower.scale.set(0.9, 0.75, 0.9);
        flower.castShadow = true;
        bedGroup.add(flower);
      }
    }

    return bedGroup;
  }

  /**
   * Japanese Garden / Street Shrub Cluster to soften edges and fence bases
   */
  createShrubCluster(x, y, z, scale = 1.0, colorHex = 0x16a34a) {
    const shrubGroup = new THREE.Group();
    shrubGroup.position.set(x, y, z);

    const foliageMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.85,
      flatShading: true,
    });
    const puffGeo = new THREE.DodecahedronGeometry(0.42 * scale, 1);

    const base = new THREE.Mesh(puffGeo, foliageMat);
    base.position.set(0, 0.35 * scale, 0);
    base.scale.set(1.2, 0.9, 1.2);
    base.castShadow = true;
    shrubGroup.add(base);

    const offsets = [
      [0.22 * scale, 0.42 * scale, -0.1 * scale, 0.8],
      [-0.2 * scale, 0.38 * scale, 0.15 * scale, 0.85],
      [0.05 * scale, 0.55 * scale, 0.08 * scale, 0.75],
    ];

    offsets.forEach(([ox, oy, oz, s]) => {
      const p = new THREE.Mesh(puffGeo, foliageMat);
      p.position.set(ox, oy, oz);
      p.scale.setScalar(s);
      p.castShadow = true;
      shrubGroup.add(p);
    });

    return shrubGroup;
  }

  /**
   * Low 3D Anime Grass Tuft Accent
   */
  createGrassTuft(x, y, z, scale = 1.0) {
    const tuftGroup = new THREE.Group();
    tuftGroup.position.set(x, y, z);

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x4ade80,
      roughness: 0.8,
      flatShading: true,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < 4; i++) {
      const bladeGeo = new THREE.PlaneGeometry(0.12 * scale, 0.38 * scale);
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.y = 0.19 * scale;
      blade.rotation.y = (i * Math.PI) / 4;
      blade.rotation.x = (Math.random() - 0.5) * 0.2;
      tuftGroup.add(blade);
    }

    return tuftGroup;
  }
}
