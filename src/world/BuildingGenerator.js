import * as THREE from 'three';
import { ProceduralTextures } from '../utils/ProceduralTextures.js';
import { globalBus } from '../engine/EventBus.js';

/**
 * BuildingGenerator - Creates modular Japanese urban architecture, houses, apartments, and convenience store
 */
export class BuildingGenerator {
  constructor() {
    // Shared materials for performance and batching
    this.materials = {
      roofTileDark: new THREE.MeshStandardMaterial({
        map: ProceduralTextures.createRoofTileTexture('#27303f'),
        roughness: 0.65,
      }),
      roofTileSlate: new THREE.MeshStandardMaterial({
        map: ProceduralTextures.createRoofTileTexture('#334155'),
        roughness: 0.65,
      }),
      concreteSidewalk: new THREE.MeshStandardMaterial({
        map: ProceduralTextures.createSidewalkTexture(),
        roughness: 0.8,
      }),
      wood: new THREE.MeshStandardMaterial({
        map: ProceduralTextures.createWoodTexture(),
        roughness: 0.6,
      }),
      woodDark: new THREE.MeshStandardMaterial({
        map: ProceduralTextures.createWoodSidingTexture('#38281b'),
        roughness: 0.7,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.48,
        roughness: 0.08,
        metalness: 0.15,
      }),
      glassWarm: new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.55,
        roughness: 0.1,
        emissive: 0xfef08a,
        emissiveIntensity: 0.25,
      }),
      windowFrame: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.4,
      }),
      windowFrameWhite: new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        roughness: 0.4,
      }),
      acUnit: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.35,
      }),
      metalDark: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.7,
        roughness: 0.35,
      }),
      metalSteel: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.65,
        roughness: 0.35,
      }),
      gutter: new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.5,
      }),
      curtainWarm: new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        roughness: 0.9,
      }),
    };
  }

  /**
   * Creates a modular 2-story Japanese detached home with anime-realistic architecture
   */
  createDetachedHouse(config) {
    const {
      x = 0,
      z = 0,
      rotationY = 0,
      wallColor = '#f8fafc',
      roofColor = '#334155',
      width = 8.5,
      depth = 9.0,
      height = 6.4,
      style = 'contemporary', // 'contemporary' | 'traditional_modern' | 'wood_accent'
    } = config;

    const houseGroup = new THREE.Group();
    houseGroup.position.set(x, 0, z);
    houseGroup.rotation.y = rotationY;

    // 1st and 2nd floor materials based on architectural style
    let f1Mat, f2Mat;
    if (style === 'wood_accent') {
      const woodTex = ProceduralTextures.createWoodSidingTexture('#3f2e22');
      woodTex.repeat.set(2, 2);
      f1Mat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 });

      const plasterTex = ProceduralTextures.createWallSidingTexture('#fef3c7', 48);
      plasterTex.repeat.set(2, 2);
      f2Mat = new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.75 });
    } else if (style === 'traditional_modern') {
      const stuccoTex = ProceduralTextures.createWallSidingTexture(wallColor, 36);
      stuccoTex.repeat.set(2, 2);
      f1Mat = new THREE.MeshStandardMaterial({ map: stuccoTex, roughness: 0.75 });
      f2Mat = f1Mat;
    } else {
      const modernTex = ProceduralTextures.createWallSidingTexture(wallColor, 44);
      modernTex.repeat.set(2, 2);
      f1Mat = new THREE.MeshStandardMaterial({ map: modernTex, roughness: 0.7 });
      f2Mat = f1Mat;
    }

    // 1. Solid Grounded Foundation Slab
    const slabGeo = new THREE.BoxGeometry(width + 0.4, 0.35, depth + 0.4);
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9 });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.y = 0.175;
    slab.receiveShadow = true;
    houseGroup.add(slab);

    // 2. 1st Floor Body
    const f1Height = height * 0.48;
    const f1Geo = new THREE.BoxGeometry(width, f1Height, depth);
    const f1Mesh = new THREE.Mesh(f1Geo, f1Mat);
    f1Mesh.position.y = 0.35 + f1Height / 2;
    f1Mesh.castShadow = true;
    f1Mesh.receiveShadow = true;
    houseGroup.add(f1Mesh);

    // 3. 2nd Floor (Slight architectural articulation & setback)
    const f2Width = width * 0.94;
    const f2Depth = depth * 0.88;
    const f2Height = height * 0.46;
    const f2Geo = new THREE.BoxGeometry(f2Width, f2Height, f2Depth);
    const f2Mesh = new THREE.Mesh(f2Geo, f2Mat);
    f2Mesh.position.set(0, 0.35 + f1Height + f2Height / 2, -depth * 0.04);
    f2Mesh.castShadow = true;
    f2Mesh.receiveShadow = true;
    houseGroup.add(f2Mesh);

    // Floor Separation Belt Course / Trim (Mizukiri flashing)
    const trimGeo = new THREE.BoxGeometry(width + 0.22, 0.12, depth + 0.22);
    const trim = new THREE.Mesh(trimGeo, this.materials.metalDark);
    trim.position.set(0, 0.35 + f1Height, 0);
    trim.castShadow = true;
    houseGroup.add(trim);

    // 4. Balcony on 2nd Floor Front
    const balconyGeo = new THREE.BoxGeometry(width * 0.65, 0.9, 1.1);
    const balconyMesh = new THREE.Mesh(balconyGeo, f2Mat);
    balconyMesh.position.set(0, 0.35 + f1Height + 0.45, depth * 0.44);
    balconyMesh.castShadow = true;
    houseGroup.add(balconyMesh);

    // Balcony top handrail
    const railGeo = new THREE.BoxGeometry(width * 0.67, 0.06, 0.06);
    const railMesh = new THREE.Mesh(railGeo, this.materials.metalSteel);
    railMesh.position.set(0, 0.35 + f1Height + 0.92, depth * 0.44 + 0.52);
    houseGroup.add(railMesh);

    // 5. Roof Architecture (Varied hip-and-gable, traditional tile, or modern pitched roof)
    const roofOverhangX = width + 1.4;
    const roofOverhangZ = f2Depth + 1.4;
    const roofMat = style === 'traditional_modern' ? this.materials.roofTileSlate : this.materials.roofTileDark;

    const roofGeo = new THREE.ConeGeometry(roofOverhangX * 0.72, 1.7, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.set(0, 0.35 + height + 0.85, -depth * 0.04);
    roofMesh.scale.set(1.0, 1.0, roofOverhangZ / roofOverhangX);
    roofMesh.castShadow = true;
    houseGroup.add(roofMesh);

    // Roof Ridge Cap (Munagawara)
    const ridgeGeo = new THREE.BoxGeometry(roofOverhangX * 0.25, 0.14, roofOverhangZ * 0.7);
    const ridge = new THREE.Mesh(ridgeGeo, this.materials.roofTileSlate);
    ridge.position.set(0, 0.35 + height + 1.68, -depth * 0.04);
    ridge.castShadow = true;
    houseGroup.add(ridge);

    // Gutters and Downspouts
    this.addGuttersAndDownspouts(houseGroup, width, depth, height);

    // 6. Sliding Sash Windows with Frames, Sills, and Curtains
    this.addDetailedWindows(houseGroup, width, depth, height);

    // 7. AC Compressor Units with Wall Piping
    this.addDetailedAcUnit(houseGroup, width / 2 + 0.25, 0.5, depth * 0.2, Math.PI / 2);
    this.addDetailedAcUnit(houseGroup, width / 2 + 0.25, 3.4, -depth * 0.2, Math.PI / 2);

    // 8. Front Genkan Entrance (Door, Steps, Porch Canopy, Nameplate, Doorbell)
    this.addGenkanEntrance(houseGroup, width, depth);

    // 9. Perimeter Wall, Gate Pillar, and Garden Accents
    this.addHousePerimeter(houseGroup, width, depth, style);

    return houseGroup;
  }

  addGuttersAndDownspouts(group, width, depth, height) {
    // Eaves Gutter front & back
    [-depth / 2 - 0.5, depth / 2 + 0.3].forEach((zPos) => {
      const gutterGeo = new THREE.BoxGeometry(width + 0.8, 0.08, 0.08);
      const gutter = new THREE.Mesh(gutterGeo, this.materials.gutter);
      gutter.position.set(0, height + 0.3, zPos);
      group.add(gutter);
    });

    // Vertical Downspout on corner
    const pipeGeo = new THREE.CylinderGeometry(0.03, 0.03, height, 8);
    const pipe = new THREE.Mesh(pipeGeo, this.materials.gutter);
    pipe.position.set(width / 2 + 0.15, height / 2 + 0.2, depth / 2 + 0.2);
    group.add(pipe);
  }

  addDetailedWindows(group, width, depth, height) {
    const winMat = this.materials.glass;
    const frameMat = this.materials.windowFrame;

    // 1st Floor Living Room Large Sliding Window
    this.createSlidingWindow(group, width * 0.24, 1.85, depth / 2 + 0.02, 1.8, 1.4, 0, true);

    // 2nd Floor Balcony Window
    this.createSlidingWindow(group, 0, height * 0.5 + 2.05, depth * 0.4 + 0.02, 1.8, 1.9, 0, true);

    // Side Windows
    [-depth * 0.2, depth * 0.2].forEach((zPos) => {
      this.createSlidingWindow(group, -width / 2 - 0.02, 1.85, zPos, 1.4, 1.1, -Math.PI / 2, false);
      this.createSlidingWindow(group, -width / 2 - 0.02, 4.6, zPos, 1.4, 1.1, -Math.PI / 2, false);
    });
  }

  createSlidingWindow(group, x, y, z, w, h, rotY = 0, hasCurtain = true) {
    const winGroup = new THREE.Group();
    winGroup.position.set(x, y, z);
    winGroup.rotation.y = rotY;

    // Exterior Frame
    const frameGeo = new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.08);
    const frame = new THREE.Mesh(frameGeo, this.materials.windowFrame);
    frame.position.z = 0.02;
    frame.castShadow = true;
    winGroup.add(frame);

    // Glass Panes (Left & Right sliding panes)
    const paneGeo = new THREE.PlaneGeometry(w * 0.48, h * 0.92);
    const leftGlass = new THREE.Mesh(paneGeo, this.materials.glass);
    leftGlass.position.set(-w * 0.24, 0, 0.04);
    winGroup.add(leftGlass);

    const rightGlass = new THREE.Mesh(paneGeo, this.materials.glass);
    rightGlass.position.set(w * 0.24, 0, 0.06);
    winGroup.add(rightGlass);

    // Interior Soft Curtain
    if (hasCurtain) {
      const curtainGeo = new THREE.PlaneGeometry(w * 0.42, h * 0.88);
      const curtain = new THREE.Mesh(curtainGeo, this.materials.curtainWarm);
      curtain.position.set(-w * 0.24, 0, 0.02);
      winGroup.add(curtain);
    }

    // Window sill / ledge
    const sillGeo = new THREE.BoxGeometry(w + 0.16, 0.05, 0.12);
    const sill = new THREE.Mesh(sillGeo, this.materials.metalDark);
    sill.position.set(0, -h / 2 - 0.03, 0.04);
    winGroup.add(sill);

    group.add(winGroup);
  }

  addDetailedAcUnit(group, x, y, z, rotY = 0) {
    const acGroup = new THREE.Group();
    acGroup.position.set(x, y, z);
    acGroup.rotation.y = rotY;

    // Base body
    const bodyGeo = new THREE.BoxGeometry(0.78, 0.56, 0.36);
    const body = new THREE.Mesh(bodyGeo, this.materials.acUnit);
    body.castShadow = true;
    acGroup.add(body);

    // Circular fan grille
    const fanGeo = new THREE.CircleGeometry(0.19, 16);
    const fanMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
    const fan = new THREE.Mesh(fanGeo, fanMat);
    fan.position.set(0.12, 0, 0.185);
    acGroup.add(fan);

    // Side vent slots
    const slotGeo = new THREE.PlaneGeometry(0.24, 0.32);
    const slotMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
    const slot = new THREE.Mesh(slotGeo, slotMat);
    slot.position.set(-0.22, 0, 0.185);
    acGroup.add(slot);

    // Insulated piping conduit leading up wall
    const pipeGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8);
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1 });
    const pipe = new THREE.Mesh(pipeGeo, pipeMat);
    pipe.position.set(-0.32, 0.7, -0.1);
    acGroup.add(pipe);

    group.add(acGroup);
  }

  addGenkanEntrance(group, width, depth) {
    const entranceX = -width * 0.25;

    // Genkan Porch Step
    const stepGeo = new THREE.BoxGeometry(1.8, 0.18, 1.2);
    const step = new THREE.Mesh(stepGeo, this.materials.concreteSidewalk);
    step.position.set(entranceX, 0.09, depth / 2 + 0.6);
    step.receiveShadow = true;
    group.add(step);

    // Entrance Canopy Overhang
    const canopyGeo = new THREE.BoxGeometry(1.9, 0.1, 1.1);
    const canopy = new THREE.Mesh(canopyGeo, this.materials.metalDark);
    canopy.position.set(entranceX, 2.5, depth / 2 + 0.55);
    canopy.castShadow = true;
    group.add(canopy);

    // Entrance Porch Light (Warm Japanese entry lantern)
    const lampGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfef08a,
      emissiveIntensity: 0.35,
    });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(entranceX + 0.75, 2.3, depth / 2 + 0.15);
    group.add(lamp);

    // Wooden Genkan Sliding Door with Frosted Glass Slits
    const doorGeo = new THREE.BoxGeometry(1.2, 2.15, 0.08);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x473324, roughness: 0.5 });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(entranceX, 1.25, depth / 2 + 0.04);
    door.castShadow = true;
    group.add(door);

    // Door vertical frosted glass slit
    const glassSlitGeo = new THREE.PlaneGeometry(0.14, 1.6);
    const slit = new THREE.Mesh(glassSlitGeo, this.materials.glassWarm);
    slit.position.set(entranceX + 0.25, 1.3, depth / 2 + 0.09);
    group.add(slit);

    // Door Handle
    const handleGeo = new THREE.BoxGeometry(0.04, 0.35, 0.04);
    const handle = new THREE.Mesh(handleGeo, this.materials.metalSteel);
    handle.position.set(entranceX + 0.48, 1.15, depth / 2 + 0.1);
    group.add(handle);
  }

  addHousePerimeter(group, width, depth, style = 'contemporary') {
    let wallColor = 0xd1d5db;
    let capColor = 0x475569;

    if (style === 'wood_accent') {
      wallColor = 0xe5e7eb;
      capColor = 0x3f2e22;
    } else if (style === 'traditional_modern') {
      wallColor = 0xf3f4f6;
      capColor = 0x334155;
    }

    const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.85 });
    const capMat = new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.5 });

    const wallW = width + 2.5;
    const wallD = depth + 3.0;

    // Front boundary wall left
    const leftWallGeo = new THREE.BoxGeometry(wallW * 0.35, 1.1, 0.2);
    const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.position.set(-wallW * 0.3, 0.55, wallD / 2);
    leftWall.castShadow = true;
    group.add(leftWall);

    // Front boundary wall right
    const rightWallGeo = new THREE.BoxGeometry(wallW * 0.45, 1.1, 0.2);
    const rightWall = new THREE.Mesh(rightWallGeo, wallMat);
    rightWall.position.set(wallW * 0.25, 0.55, wallD / 2);
    rightWall.castShadow = true;
    group.add(rightWall);

    // Gate Entry Pillar with House Nameplate & Intercom
    const monchuuGeo = new THREE.BoxGeometry(0.4, 1.35, 0.4);
    const monchuu = new THREE.Mesh(monchuuGeo, wallMat);
    monchuu.position.set(-wallW * 0.12, 0.675, wallD / 2);
    monchuu.castShadow = true;
    group.add(monchuu);

    // Monchuu Top Cap
    const monchuuCapGeo = new THREE.BoxGeometry(0.46, 0.08, 0.46);
    const monchuuCap = new THREE.Mesh(monchuuCapGeo, capMat);
    monchuuCap.position.set(-wallW * 0.12, 1.38, wallD / 2);
    monchuuCap.castShadow = true;
    group.add(monchuuCap);

    // Hyosatsu Nameplate
    const nameplateGeo = new THREE.PlaneGeometry(0.18, 0.26);
    const nameplateMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.4 });
    const nameplate = new THREE.Mesh(nameplateGeo, nameplateMat);
    nameplate.position.set(-wallW * 0.12, 1.05, wallD / 2 + 0.21);
    group.add(nameplate);

    // Intercom / Doorbell unit
    const intercomGeo = new THREE.PlaneGeometry(0.12, 0.18);
    const intercomMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
    const intercom = new THREE.Mesh(intercomGeo, intercomMat);
    intercom.position.set(-wallW * 0.12, 0.8, wallD / 2 + 0.21);
    group.add(intercom);

    // Side & back fences
    const sideWallGeo = new THREE.BoxGeometry(0.2, 1.1, wallD);
    const leftSide = new THREE.Mesh(sideWallGeo, wallMat);
    leftSide.position.set(-wallW / 2, 0.55, 0);
    leftSide.castShadow = true;
    group.add(leftSide);

    const rightSide = new THREE.Mesh(sideWallGeo, wallMat);
    rightSide.position.set(wallW / 2, 0.55, 0);
    rightSide.castShadow = true;
    group.add(rightSide);

    const backWallGeo = new THREE.BoxGeometry(wallW, 1.1, 0.2);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, 0.55, -wallD / 2);
    backWall.castShadow = true;
    group.add(backWall);

    // Garden manicured shrub in courtyard
    this.addManicuredGardenBonsai(group, wallW * 0.32, 0, wallD * 0.35);
  }

  addManicuredGardenBonsai(group, x, y, z) {
    const gardenGroup = new THREE.Group();
    gardenGroup.position.set(x, y, z);

    // Ceramic planter pot
    const potGeo = new THREE.CylinderGeometry(0.35, 0.25, 0.4, 12);
    const potMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.8 });
    const pot = new THREE.Mesh(potGeo, potMat);
    pot.position.y = 0.2;
    pot.castShadow = true;
    gardenGroup.add(pot);

    // Stylized cloud-pruned Japanese Pine / Azalea
    const foliageMat = new THREE.MeshStandardMaterial({
      color: 0x15803d,
      roughness: 0.8,
      flatShading: true,
    });
    const puffGeo = new THREE.DodecahedronGeometry(0.38, 1);

    const p1 = new THREE.Mesh(puffGeo, foliageMat);
    p1.position.set(0, 0.65, 0);
    p1.castShadow = true;
    gardenGroup.add(p1);

    const p2 = new THREE.Mesh(puffGeo, foliageMat);
    p2.position.set(0.18, 0.85, -0.1);
    p2.scale.setScalar(0.75);
    p2.castShadow = true;
    gardenGroup.add(p2);

    group.add(gardenGroup);
  }

  /**
   * Creates Sakura Heights — Mayank's Authentic Japanese Apartment Complex
   */
  createApartmentBuilding(config) {
    const { x = 0, z = 0, rotationY = 0 } = config;

    const aptGroup = new THREE.Group();
    aptGroup.position.set(x, 0, z);
    aptGroup.rotation.y = rotationY;

    const width = 16.5;
    const depth = 9.6;
    const floors = 3;
    const floorHeight = 2.9;
    const totalHeight = floors * floorHeight;

    const wallTex = ProceduralTextures.createWallSidingTexture('#f1f5f9', 36);
    wallTex.repeat.set(4, 3);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.75 });

    // 1. Concrete Foundation Slab
    const foundationGeo = new THREE.BoxGeometry(width + 0.6, 0.4, depth + 0.6);
    const foundation = new THREE.Mesh(foundationGeo, this.materials.concreteSidewalk);
    foundation.position.y = 0.2;
    foundation.receiveShadow = true;
    aptGroup.add(foundation);

    // 2. Main Apartment Block
    const bodyGeo = new THREE.BoxGeometry(width, totalHeight, depth);
    const bodyMesh = new THREE.Mesh(bodyGeo, wallMat);
    bodyMesh.position.y = totalHeight / 2 + 0.2;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    aptGroup.add(bodyMesh);

    // 3. Roof Parapet & Perimeter Coping
    const roofCapGeo = new THREE.BoxGeometry(width + 0.5, 0.45, depth + 0.5);
    const roofCap = new THREE.Mesh(roofCapGeo, this.materials.metalDark);
    roofCap.position.y = totalHeight + 0.4;
    roofCap.castShadow = true;
    aptGroup.add(roofCap);

    // 4. Exterior Balconies (Front Side facing South)
    for (let f = 0; f < floors; f++) {
      const y = f * floorHeight + 1.4;

      // Concrete balcony slab
      const balconyGeo = new THREE.BoxGeometry(width - 1.2, 0.22, 1.3);
      const balcony = new THREE.Mesh(balconyGeo, this.materials.concreteSidewalk);
      balcony.position.set(0, y - 1.3, depth / 2 + 0.65);
      balcony.castShadow = true;
      balcony.receiveShadow = true;
      aptGroup.add(balcony);

      // Balcony front wall with frosted glass/metal panel
      const railGeo = new THREE.BoxGeometry(width - 1.2, 0.95, 0.1);
      const rail = new THREE.Mesh(railGeo, wallMat);
      rail.position.set(0, y - 0.85, depth / 2 + 1.25);
      rail.castShadow = true;
      aptGroup.add(rail);

      // Steel top grab rail
      const grabRailGeo = new THREE.BoxGeometry(width - 1.15, 0.05, 0.05);
      const grabRail = new THREE.Mesh(grabRailGeo, this.materials.metalSteel);
      grabRail.position.set(0, y - 0.35, depth / 2 + 1.25);
      aptGroup.add(grabRail);

      // Units on this floor (3 units per floor)
      for (let u = -1; u <= 1; u++) {
        const ux = u * 4.8;
        this.createSlidingWindow(aptGroup, ux, y, depth / 2 + 0.02, 2.2, 2.0, 0, true);
        this.addDetailedAcUnit(aptGroup, ux + 1.8, y - 1.0, depth / 2 + 0.65, 0);
      }
    }

    // 5. Exterior Steel Staircase Tower on Side
    const stairTowerGeo = new THREE.BoxGeometry(3.2, totalHeight, 3.0);
    const stairTower = new THREE.Mesh(stairTowerGeo, this.materials.metalDark);
    stairTower.position.set(-width / 2 - 1.6, totalHeight / 2 + 0.2, -depth * 0.15);
    stairTower.castShadow = true;
    aptGroup.add(stairTower);

    // 6. Signature Entrance Canopy with Illuminated "Sakura Heights" Sign
    const entranceX = 2.5;
    const canopyGeo = new THREE.BoxGeometry(4.2, 0.22, 2.4);
    const canopy = new THREE.Mesh(canopyGeo, this.materials.metalDark);
    canopy.position.set(entranceX, 2.7, -depth / 2 - 1.2);
    canopy.castShadow = true;
    aptGroup.add(canopy);

    // Illuminated Sakura Heights Sign
    const signGeo = new THREE.BoxGeometry(2.4, 0.6, 0.08);
    const signTex = ProceduralTextures.createSakuraHeightsSignTexture();
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissive: 0xffffff,
      emissiveMap: signTex,
      emissiveIntensity: 0.35,
      roughness: 0.3,
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(entranceX, 3.2, -depth / 2 - 0.06);
    sign.castShadow = true;
    aptGroup.add(sign);

    // Canopy Downlight
    const canopyLight = new THREE.PointLight(0xffedd5, 1.2, 6);
    canopyLight.position.set(entranceX, 2.5, -depth / 2 - 1.2);
    aptGroup.add(canopyLight);

    // 7. Mayank's Unit 102 (His residence!)
    this.addMayankApartmentDoor(aptGroup, entranceX, -depth / 2);

    // 8. Stainless Mailbox Cluster & Intercom Panel
    this.addMailboxCluster(aptGroup, 4.8, 1.1, -depth / 2 - 0.5);

    // 9. Covered Resident Bicycle Parking with Mayank's Blue Bike
    this.addBicycleParking(aptGroup, -2.5, 0, -depth / 2 - 2.0);

    // 10. Utility Gas Meter Bank & Corridor Planters
    this.addUtilityMetersAndPlants(aptGroup, width, depth);

    return aptGroup;
  }

  addMayankApartmentDoor(group, x, z) {
    // Navy Genkan Door for Unit 102
    const doorGeo = new THREE.BoxGeometry(1.05, 2.2, 0.08);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.4 });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(x, 1.2, z - 0.04);
    door.castShadow = true;
    group.add(door);

    // Unit 102 Brass Number Plate
    const plateGeo = new THREE.BoxGeometry(0.28, 0.14, 0.04);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8, roughness: 0.3 });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.set(x, 2.0, z - 0.09);
    group.add(plate);

    // Doorbell Intercom
    const bellGeo = new THREE.PlaneGeometry(0.08, 0.12);
    const bellMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    const bell = new THREE.Mesh(bellGeo, bellMat);
    bell.position.set(x + 0.65, 1.5, z - 0.05);
    group.add(bell);

    // Mayank's Door Entry Interaction
    door.userData = {
      isInteractive: true,
      interactionType: 'door',
      prompt: 'Check Door',
      name: "Mayank's Apartment",
      onInteract: () => {
        globalBus.emit('dialogue:open', {
          speaker: 'Unit 102 (Mayank)',
          avatar: '🏠',
          text: 'Sakura Heights Unit 102. Your cozy, peaceful apartment in Sakuragaoka. Everything is tidy and calm.',
        });
        globalBus.emit('toast:show', { message: 'Home: Unit 102 (Sakura Heights).' });
      },
    };
  }

  addMailboxCluster(group, x, y, z) {
    const clusterGroup = new THREE.Group();
    clusterGroup.position.set(x, y, z);

    const boxGeo = new THREE.BoxGeometry(0.9, 1.0, 0.35);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7, roughness: 0.3 });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.castShadow = true;
    clusterGroup.add(box);

    // Mail slots
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const slotGeo = new THREE.PlaneGeometry(0.22, 0.04);
        const slotMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
        const slot = new THREE.Mesh(slotGeo, slotMat);
        slot.position.set(-0.26 + c * 0.26, 0.3 - r * 0.28, 0.18);
        clusterGroup.add(slot);
      }
    }

    const mailResponses = [
      'You checked mailbox #102: A neighborhood community flyer about the upcoming garden cleanup day.',
      'You checked mailbox #102: An electric utility statement. Paid on time!',
      'You checked mailbox #102: No new mail this morning. Everything is up to date.',
      'You checked mailbox #102: A colorful coupon flyer for HIKARI MART specials.',
    ];
    let mailIdx = 0;

    clusterGroup.userData = {
      isInteractive: true,
      interactionType: 'mailbox',
      prompt: 'Check Mail',
      name: 'Resident Mailboxes',
      onInteract: () => {
        const text = mailResponses[mailIdx % mailResponses.length];
        mailIdx++;
        globalBus.emit('dialogue:open', {
          speaker: 'Mailbox (Unit 102)',
          avatar: '📬',
          text,
        });
        globalBus.emit('toast:show', { message: 'Checked mailbox #102.' });
      },
    };

    group.add(clusterGroup);
  }

  addBicycleParking(group, x, y, z) {
    // Corrugated shelter canopy
    const shelterGeo = new THREE.BoxGeometry(4.2, 0.14, 2.2);
    const shelter = new THREE.Mesh(shelterGeo, this.materials.metalDark);
    shelter.position.set(x, 2.2, z);
    shelter.castShadow = true;
    group.add(shelter);

    // Support steel posts
    [-1.9, 1.9].forEach((px) => {
      const poleGeo = new THREE.CylinderGeometry(0.045, 0.045, 2.2, 8);
      const pole = new THREE.Mesh(poleGeo, this.materials.metalSteel);
      pole.position.set(x + px, 1.1, z);
      pole.castShadow = true;
      group.add(pole);
    });

    // Parked bicycles (Mayank's blue commuter bike + resident mama-chari bikes)
    this.addParkedBicycle(group, x - 1.1, 0, z, 0, 0x2563eb, true);
    this.addParkedBicycle(group, x, 0, z, 0.04, 0xdc2626, false);
    this.addParkedBicycle(group, x + 1.1, 0, z, -0.04, 0x16a34a, false);
  }

  addUtilityMetersAndPlants(group, width, depth) {
    // Utility Gas Meters Bank along side wall
    const meterBankGeo = new THREE.BoxGeometry(0.3, 0.8, 1.8);
    const meterBankMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6 });
    const meterBank = new THREE.Mesh(meterBankGeo, meterBankMat);
    meterBank.position.set(width / 2 + 0.18, 1.0, -depth * 0.2);
    meterBank.castShadow = true;
    group.add(meterBank);

    // Potted Plants along entrance walkway
    [-1.0, 1.0, 3.8].forEach((px) => {
      this.addManicuredGardenBonsai(group, px, 0, -depth / 2 - 0.8);
    });
  }

  /**
   * Japanese City Commuter Bicycle (Mama-chari)
   */
  addParkedBicycle(group, x, y, z, rotY = 0, frameColor = 0x2563eb, isMayanks = false) {
    const bikeGroup = new THREE.Group();
    bikeGroup.position.set(x, y, z);
    bikeGroup.rotation.y = rotY;

    const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, metalness: 0.65, roughness: 0.35 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });

    // Wheels
    const wheelGeo = new THREE.TorusGeometry(0.32, 0.03, 8, 24);

    const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
    frontWheel.position.set(0.65, 0.32, 0);
    frontWheel.rotation.y = Math.PI / 2;
    frontWheel.castShadow = true;
    bikeGroup.add(frontWheel);

    const rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
    rearWheel.position.set(-0.65, 0.32, 0);
    rearWheel.rotation.y = Math.PI / 2;
    rearWheel.castShadow = true;
    bikeGroup.add(rearWheel);

    // Frame tubes
    const tubeGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8);

    const topTube = new THREE.Mesh(tubeGeo, frameMat);
    topTube.position.set(0, 0.55, 0);
    topTube.rotation.z = Math.PI / 2;
    bikeGroup.add(topTube);

    const downTube = new THREE.Mesh(tubeGeo, frameMat);
    downTube.position.set(0.05, 0.42, 0);
    downTube.rotation.z = Math.PI / 4;
    bikeGroup.add(downTube);

    // Handlebars with wire basket
    const handleGeo = new THREE.BoxGeometry(0.04, 0.04, 0.55);
    const handle = new THREE.Mesh(handleGeo, this.materials.metalSteel);
    handle.position.set(0.58, 0.9, 0);
    bikeGroup.add(handle);

    const basketGeo = new THREE.BoxGeometry(0.28, 0.22, 0.36);
    const basket = new THREE.Mesh(basketGeo, this.materials.metalSteel);
    basket.position.set(0.72, 0.8, 0);
    basket.castShadow = true;
    bikeGroup.add(basket);

    // Saddle / Seat
    const seatGeo = new THREE.BoxGeometry(0.24, 0.06, 0.18);
    const seat = new THREE.Mesh(seatGeo, this.materials.metalDark);
    seat.position.set(-0.25, 0.78, 0);
    bikeGroup.add(seat);

    // Kickstand slight lean
    bikeGroup.rotation.z = -0.08;

    if (isMayanks) {
      bikeGroup.userData = {
        isInteractive: true,
        interactionType: 'bicycle',
        prompt: 'Check Bike',
        name: "Mayank's Bicycle",
        onInteract: () => {
          globalBus.emit('dialogue:open', {
            speaker: "Mayank's Bicycle",
            avatar: '🚲',
            text: 'Your reliable blue city commuter bike. Tires are pumped and the lock is secure.',
          });
          globalBus.emit('toast:show', { message: 'Checked commuter bicycle.' });
        },
      };
    }

    group.add(bikeGroup);
    return bikeGroup;
  }

  /**
   * Creates HIKARI MART — Iconic Japanese Convenience Store Landmark
   */
  createHikariMart(config) {
    const { x = 0, z = 0, rotationY = 0 } = config;

    const storeGroup = new THREE.Group();
    storeGroup.position.set(x, 0, z);
    storeGroup.rotation.y = rotationY;

    const width = 15.0;
    const depth = 12.0;
    const height = 4.2;

    const wallTex = ProceduralTextures.createWallSidingTexture('#ffffff', 48);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.5 });
    const floorTex = ProceduralTextures.createStoreFloorTexture();
    floorTex.repeat.set(6, 5);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.3 });

    // 1. Interior Floor
    const floorGeo = new THREE.PlaneGeometry(width - 0.4, depth - 0.4);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.03, 0);
    floor.receiveShadow = true;
    storeGroup.add(floor);

    // 2. Ceiling / Roof Slab with Parapet
    const ceilingGeo = new THREE.BoxGeometry(width + 0.8, 0.45, depth + 0.8);
    const ceiling = new THREE.Mesh(ceilingGeo, this.materials.metalDark);
    ceiling.position.y = height + 0.22;
    ceiling.castShadow = true;
    storeGroup.add(ceiling);

    // 3. Walls
    // Back Wall
    const backWallGeo = new THREE.BoxGeometry(width, height, 0.3);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, height / 2, -depth / 2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    storeGroup.add(backWall);

    // Left Wall
    const leftWallGeo = new THREE.BoxGeometry(0.3, height, depth);
    const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.position.set(-width / 2, height / 2, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    storeGroup.add(leftWall);

    // Right Wall
    const rightWallGeo = new THREE.BoxGeometry(0.3, height, depth);
    const rightWall = new THREE.Mesh(rightWallGeo, wallMat);
    rightWall.position.set(width / 2, height / 2, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    storeGroup.add(rightWall);

    // 4. Front Glass Facade with Doorway Opening
    const frontWallLeftGeo = new THREE.BoxGeometry(4.0, height, 0.2);
    const frontWallLeft = new THREE.Mesh(frontWallLeftGeo, wallMat);
    frontWallLeft.position.set(-width / 2 + 2.0, height / 2, depth / 2);
    storeGroup.add(frontWallLeft);

    const frontWallRightGeo = new THREE.BoxGeometry(6.5, height, 0.2);
    const frontWallRight = new THREE.Mesh(frontWallRightGeo, wallMat);
    frontWallRight.position.set(width / 2 - 3.25, height / 2, depth / 2);
    storeGroup.add(frontWallRight);

    // Glass storefront display window
    const frontGlassGeo = new THREE.PlaneGeometry(3.6, 2.6);
    const frontGlass = new THREE.Mesh(frontGlassGeo, this.materials.glass);
    frontGlass.position.set(width / 2 - 3.25, 2.0, depth / 2 + 0.12);
    storeGroup.add(frontGlass);

    // Sliding Glass Doors
    const doorGlassGeo = new THREE.PlaneGeometry(1.6, 2.8);
    const leftDoorGlass = new THREE.Mesh(doorGlassGeo, this.materials.glass);
    leftDoorGlass.position.set(-2.0, 1.4, depth / 2 + 0.12);
    storeGroup.add(leftDoorGlass);

    const rightDoorGlass = new THREE.Mesh(doorGlassGeo, this.materials.glass);
    rightDoorGlass.position.set(0.6, 1.4, depth / 2 + 0.12);
    storeGroup.add(rightDoorGlass);

    // Konbini Red Welcome Mat
    const matGeo = new THREE.PlaneGeometry(2.0, 1.4);
    const matMat = new THREE.MeshStandardMaterial({ color: 0x991b1b });
    const mat = new THREE.Mesh(matGeo, matMat);
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(-0.7, 0.035, depth / 2);
    storeGroup.add(mat);

    // 5. Iconic Backlit HIKARI MART Sign Board
    const signGeo = new THREE.BoxGeometry(width + 0.4, 1.25, 0.35);
    const signTex = ProceduralTextures.createHikariMartSignTexture();
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissive: 0xffffff,
      emissiveMap: signTex,
      emissiveIntensity: 0.65,
      roughness: 0.25,
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, height + 0.65, depth / 2 + 0.2);
    sign.castShadow = true;
    storeGroup.add(sign);

    // 6. Soft Fluorescent Ceiling Light Grids
    const light1 = new THREE.PointLight(0xfffbeb, 1.8, 14);
    light1.position.set(-2.5, height - 0.4, 0);
    storeGroup.add(light1);

    const light2 = new THREE.PointLight(0xfffbeb, 1.8, 14);
    light2.position.set(2.5, height - 0.4, 0);
    storeGroup.add(light2);

    // 7. Store Interior Aisles (Snacks, instant noodles, onigiri)
    this.addStoreInteriorAisles(storeGroup, width, depth);

    // 8. Checkout Counter with POS Register & Hot Snack Warmer
    this.addStoreCheckoutCounter(storeGroup, width, depth);

    // 9. Exterior Parking Bays, Kei Car & Recycling Bins
    this.addStoreExteriorPavement(storeGroup, width, depth);

    return storeGroup;
  }

  addStoreInteriorAisles(group, width, depth) {
    const shelfTex = ProceduralTextures.createShelfProductsTexture();
    const shelfMat = new THREE.MeshStandardMaterial({ map: shelfTex, roughness: 0.4 });

    // Aisle Shelves (Center rows)
    [-1.8, 1.8].forEach((xPos) => {
      const aisleGeo = new THREE.BoxGeometry(1.2, 1.7, 5.5);
      const aisle = new THREE.Mesh(aisleGeo, shelfMat);
      aisle.position.set(xPos, 0.85, 0.2);
      aisle.castShadow = true;
      aisle.receiveShadow = true;

      aisle.userData = {
        isInteractive: true,
        interactionType: 'store_shelf',
        prompt: 'Browse Snacks',
        name: 'Snack Shelf',
        onInteract: () => {
          globalBus.emit('dialogue:open', {
            speaker: 'HIKARI MART (Snacks)',
            avatar: '🍱',
            text: 'You browse fresh onigiri (Salmon & Tuna Mayo), egg salad sandwiches, and savory rice crackers.',
          });
          globalBus.emit('toast:show', { message: 'Browsed fresh bentos and snacks.' });
          globalBus.emit('quest:update', { questId: 'errand_drink', progress: 1.0 });
        },
      };

      group.add(aisle);
    });

    // Refrigerated Drink Wall along back
    const fridgeGeo = new THREE.BoxGeometry(width - 2.5, 2.4, 0.8);
    const fridgeMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.4,
      roughness: 0.2,
    });
    const fridge = new THREE.Mesh(fridgeGeo, fridgeMat);
    fridge.position.set(0, 1.2, -depth / 2 + 0.5);
    fridge.castShadow = true;

    fridge.userData = {
      isInteractive: true,
      interactionType: 'store_fridge',
      prompt: 'Browse Drinks',
      name: 'Beverage Cooler',
      onInteract: () => {
        globalBus.emit('dialogue:open', {
          speaker: 'HIKARI MART (Drink Cooler)',
          avatar: '🧃',
          text: 'You picked a chilled roasted barley tea and a sweet royal milk tea. Refreshing and cold!',
        });
        globalBus.emit('toast:show', { message: 'Purchased chilled green tea!' });
        globalBus.emit('quest:update', { questId: 'errand_drink', progress: 1.0 });
      },
    };

    group.add(fridge);
  }

  addStoreCheckoutCounter(group, width, depth) {
    const counterGeo = new THREE.BoxGeometry(2.4, 1.0, 1.2);
    const counterMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 });
    const counter = new THREE.Mesh(counterGeo, counterMat);
    counter.position.set(width / 2 - 2.4, 0.5, depth / 2 - 2.2);
    counter.castShadow = true;
    group.add(counter);

    // Cash Register POS Screen
    const posGeo = new THREE.BoxGeometry(0.45, 0.35, 0.45);
    const pos = new THREE.Mesh(posGeo, this.materials.metalDark);
    pos.position.set(width / 2 - 2.4, 1.18, depth / 2 - 2.2);
    group.add(pos);

    // Hot snack warmer case
    const warmerGeo = new THREE.BoxGeometry(0.65, 0.5, 0.45);
    const warmerMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.25,
      roughness: 0.3,
    });
    const warmer = new THREE.Mesh(warmerGeo, warmerMat);
    warmer.position.set(width / 2 - 1.5, 1.25, depth / 2 - 2.2);
    warmer.castShadow = true;

    warmer.userData = {
      isInteractive: true,
      interactionType: 'store_warmer',
      prompt: 'Inspect',
      name: 'Hot Snack Case',
      onInteract: () => {
        globalBus.emit('dialogue:open', {
          speaker: 'HIKARI MART (Warmer)',
          avatar: '🍗',
          text: 'Crispy seasoned fried chicken pieces and hot steamed pork buns kept warm under the glow.',
        });
        globalBus.emit('toast:show', { message: 'Inspected hot food warmer.' });
      },
    };
    group.add(warmer);

    counter.userData = {
      isInteractive: true,
      interactionType: 'store_counter',
      prompt: 'Check Out',
      name: 'Checkout Counter',
      onInteract: () => {
        globalBus.emit('dialogue:open', {
          speaker: 'Aoi (Store Clerk)',
          avatar: '🏪',
          text: 'Welcome! That will be 150 yen. Have a wonderful morning, Mayank-san!',
        });
        globalBus.emit('toast:show', { message: 'Checked out at Hikari Mart.' });
        globalBus.emit('quest:update', { questId: 'errand_drink', progress: 1.0 });
      },
    };
  }

  addStoreExteriorPavement(group, width, depth) {
    // Concrete apron in front of store
    const apronGeo = new THREE.PlaneGeometry(width + 4, 8);
    const apron = new THREE.Mesh(apronGeo, this.materials.concreteSidewalk);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, 0.025, depth / 2 + 4);
    apron.receiveShadow = true;
    group.add(apron);

    // Recycling bins outside store (PET Bottles, Cans, Burnables)
    const binColors = [0x0284c7, 0x16a34a, 0xf59e0b];
    binColors.forEach((color, idx) => {
      const binGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.85, 12);
      const binMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      const bin = new THREE.Mesh(binGeo, binMat);
      bin.position.set(-width / 2 + 0.8 + idx * 0.6, 0.425, depth / 2 + 0.8);
      bin.castShadow = true;
      group.add(bin);
    });

    // Parked Kei-Car in store parking bay
    this.addParkedCar(group, width / 2 - 1.5, 0, depth / 2 + 4.2, 0, 0xf8fafc);
  }

  /**
   * Japanese Compact Kei-Car (Cute boxy wagon)
   */
  addParkedCar(group, x, y, z, rotY = 0, bodyColor = 0xf8fafc) {
    const carGroup = new THREE.Group();
    carGroup.position.set(x, y, z);
    carGroup.rotation.y = rotY;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      metalness: 0.45,
      roughness: 0.3,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.1,
    });

    // Lower Chassis
    const lowerGeo = new THREE.BoxGeometry(1.7, 0.75, 3.4);
    const lower = new THREE.Mesh(lowerGeo, bodyMat);
    lower.position.y = 0.55;
    lower.castShadow = true;
    carGroup.add(lower);

    // Upper Cabin
    const cabinGeo = new THREE.BoxGeometry(1.6, 0.8, 2.1);
    const cabin = new THREE.Mesh(cabinGeo, bodyMat);
    cabin.position.set(0, 1.25, -0.2);
    cabin.castShadow = true;
    carGroup.add(cabin);

    // Windshield & Windows
    const winGeo = new THREE.BoxGeometry(1.62, 0.6, 1.95);
    const win = new THREE.Mesh(winGeo, glassMat);
    win.position.set(0, 1.26, -0.2);
    carGroup.add(win);

    // Headlights
    [-0.6, 0.6].forEach((hx) => {
      const lightGeo = new THREE.BoxGeometry(0.3, 0.15, 0.05);
      const lightMat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfef08a,
        emissiveIntensity: 0.25,
      });
      const light = new THREE.Mesh(lightGeo, lightMat);
      light.position.set(hx, 0.65, 1.71);
      carGroup.add(light);
    });

    // Japanese License Plate (Yellow kei car plate)
    const plateGeo = new THREE.PlaneGeometry(0.4, 0.2);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xfacc15 });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.set(0, 0.4, 1.72);
    carGroup.add(plate);

    // 4 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    wheelGeo.rotateZ(Math.PI / 2);

    [
      [-0.85, 0.28, 1.0],
      [0.85, 0.28, 1.0],
      [-0.85, 0.28, -1.0],
      [0.85, 0.28, -1.0],
    ].forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, wy, wz);
      wheel.castShadow = true;
      carGroup.add(wheel);
    });

    group.add(carGroup);
    return carGroup;
  }

  /**
   * Lightweight Distant Background Building (Silhouettes for Horizon Depth)
   */
  createDistantBuildingBlock(config) {
    const {
      x = 0,
      z = 0,
      rotationY = 0,
      width = 12,
      depth = 10,
      height = 7.5,
      type = 'house', // 'house' | 'mansion'
      wallColor = 0xd1d5db,
      roofColor = 0x334155,
    } = config;

    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;

    const wallMat = new THREE.MeshStandardMaterial({
      color: wallColor,
      roughness: 0.85,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: roofColor,
      roughness: 0.75,
    });

    // Base building body
    const bodyGeo = new THREE.BoxGeometry(width, height, depth);
    const body = new THREE.Mesh(bodyGeo, wallMat);
    body.position.y = height / 2;
    group.add(body);

    if (type === 'house') {
      // Pitched Hip Roof
      const roofGeo = new THREE.ConeGeometry((width + 1.2) * 0.7, 2.2, 4);
      roofGeo.rotateY(Math.PI / 4);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(0, height + 1.1, 0);
      roof.scale.set(1.0, 1.0, (depth + 1.2) / (width + 1.2));
      group.add(roof);
    } else {
      // Apartment / Commercial Parapet & Roof Cap
      const capGeo = new THREE.BoxGeometry(width + 0.4, 0.4, depth + 0.4);
      const cap = new THREE.Mesh(capGeo, roofMat);
      cap.position.y = height + 0.2;
      group.add(cap);

      // Balcony band
      const balconyGeo = new THREE.BoxGeometry(width + 0.1, 0.7, depth * 0.2);
      const balcony = new THREE.Mesh(balconyGeo, wallMat);
      balcony.position.set(0, height * 0.5, depth * 0.5 + depth * 0.08);
      group.add(balcony);
    }

    return group;
  }
}
