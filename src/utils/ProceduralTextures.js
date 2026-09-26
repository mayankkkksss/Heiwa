import * as THREE from 'three';

/**
 * ProceduralTextures - Generates crisp anime/Japanese urban textures at runtime
 */
export class ProceduralTextures {
  /**
   * Asphalt Road with realistic fine grain, curb weathering, and subtle tone variation
   */
  static createAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base neutral dark asphalt tone (anime realism: soft slate-charcoal)
    ctx.fillStyle = '#2d333b';
    ctx.fillRect(0, 0, 512, 512);

    // Fine aggregate noise
    for (let i = 0; i < 30000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const gray = Math.floor(Math.random() * 32 + 38);
      ctx.fillStyle = `rgb(${gray}, ${gray + 2}, ${gray + 4})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    // Subtle road aggregate speckling (light mineral flecks)
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const light = Math.floor(Math.random() * 40 + 85);
      ctx.fillStyle = `rgba(${light}, ${light + 2}, ${light + 6}, 0.6)`;
      ctx.fillRect(x, y, 1.2, 1.2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Sidewalk Concrete Tiles (Japanese standard urban square paving with bevel seams)
   */
  static createSidewalkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Light warm gray base
    ctx.fillStyle = '#b8bec9';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle concrete grain
    for (let i = 0; i < 15000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const v = Math.floor(Math.random() * 24 + 175);
      ctx.fillStyle = `rgb(${v}, ${v + 1}, ${v + 4})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Grid tile seams (64px tiles)
    const tileSize = 128;
    for (let x = 0; x < 512; x += tileSize) {
      for (let y = 0; y < 512; y += tileSize) {
        // Individual tile subtle tone variation
        const toneShift = (Math.random() - 0.5) * 8;
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.abs(toneShift) * 0.008})`;
        ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

        // Dark bevel line
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x, y, tileSize, tileSize);

        // Highlight bevel edge
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 1, y + tileSize - 1);
        ctx.lineTo(x + 1, y + 1);
        ctx.lineTo(x + tileSize - 1, y + 1);
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Japanese Tactile Paving (Tenji-buroku yellow warning blocks)
   */
  static createTactilePavingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Vibrant safety yellow
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 256, 256);

    // Tactile raised line bars
    for (let y = 16; y < 256; y += 64) {
      // Shadow
      ctx.fillStyle = '#b45309';
      ctx.fillRect(12, y + 22, 232, 4);

      // Main bar
      ctx.fillStyle = '#d97706';
      ctx.fillRect(12, y, 232, 22);

      // Highlight
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(12, y, 232, 4);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Japanese Kawara Roof Tiles Texture (Slate gray undulating ceramic tiles)
   */
  static createRoofTileTexture(baseHex = '#2e3846') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 512, 512);

    const rowHeight = 48;
    const colWidth = 32;

    for (let y = 0; y < 512; y += rowHeight) {
      // Horizontal row shadow
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, y + rowHeight - 4, 512, 4);

      // Subtle vertical wave grooves
      for (let x = 0; x < 512; x += colWidth) {
        const grad = ctx.createLinearGradient(x, 0, x + colWidth, 0);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.25)');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, colWidth, rowHeight - 4);
      }

      // Top highlight lip
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(0, y, 512, 3);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Residential Wall Siding (Japanese modern stucco / siding panels with subtle grain)
   */
  static createWallSidingTexture(baseColor = '#f8fafc', panelHeight = 48) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 512, 512);

    // Stucco texture specks
    for (let i = 0; i < 12000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
      ctx.fillRect(x, y, 2, 2);
    }

    // Horizontal panel seam lines
    for (let y = 0; y <= 512; y += panelHeight) {
      // Shadow groove
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();

      // Highlight below groove
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + 2);
      ctx.lineTo(512, y + 2);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Traditional Japanese Cedar Clapboard (Yakisugi / Natural Timber)
   */
  static createWoodSidingTexture(timberHex = '#4a3728') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = timberHex;
    ctx.fillRect(0, 0, 512, 512);

    // Wood grain lines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    for (let i = 0; i < 60; i++) {
      const y = Math.random() * 512;
      ctx.fillRect(0, y, 512, Math.random() * 4 + 1);
    }

    // Vertical plank grooves
    const plankWidth = 64;
    for (let x = 0; x <= 512; x += plankWidth) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, 0);
      ctx.lineTo(x + 2, 512);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Convenience Store Interior Floor Tiles
   */
  static createStoreFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Clean polished bright beige vinyl tiles
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2.5;
    const tileSize = 128;
    for (let i = 0; i <= 512; i += tileSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * HIKARI MART Exterior Glowing Sign
   */
  static createHikariMartSignTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Classic Japanese convenience store tri-color band (Teal, Orange, White)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 128);

    // Top vibrant orange stripe
    ctx.fillStyle = '#f97316';
    ctx.fillRect(0, 0, 512, 28);

    // Bottom cyan-teal stripe
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(0, 100, 512, 28);

    // Logo & Typography
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 46px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HIKARI MART', 225, 74);

    // Convenience Store Badge
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('CONVENIENCE', 420, 72);

    // Sunburst icon
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.arc(58, 64, 22, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Apartment Complex Entrance Sign (Sakura Heights)
   */
  static createSakuraHeightsSignTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Dark sleek bronze / brushed slate plate
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 128);

    // Gold border trim
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 500, 116);

    // Sakura icon
    ctx.fillStyle = '#ff758f';
    ctx.font = '36px sans-serif';
    ctx.fillText('🌸', 45, 76);

    // Main English Name
    ctx.fillStyle = '#fef08a';
    ctx.font = '900 40px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SAKURA HEIGHTS', 95, 68);

    // English subtitle
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('APARTMENT RESIDENCE', 98, 98);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Convenience Store Shelves Texture (Bentos, onigiri, snacks)
   */
  static createShelfProductsTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 512);

    const colors = ['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];
    for (let row = 0; row < 4; row++) {
      const y = row * 128 + 16;
      // Shelf metal divider
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, row * 128 + 116, 512, 12);

      for (let col = 0; col < 6; col++) {
        const x = col * 84 + 12;
        ctx.fillStyle = colors[(row * 6 + col) % colors.length];
        ctx.fillRect(x, y, 68, 92);

        // Product packaging label
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 8, y + 26, 52, 18);

        // Price tag
        ctx.fillStyle = '#facc15';
        ctx.fillRect(x + 12, y + 70, 44, 12);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Road Marking Texture (STOP & Speed 30)
   */
  static createRoadMarkingTexture(text = 'STOP') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Transparent background
    ctx.clearRect(0, 0, 256, 512);

    // Slightly faded weathered white markings (anime realistic)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.textAlign = 'center';

    if (text === 'STOP') {
      ctx.font = '900 85px sans-serif';
      ctx.fillText('S', 128, 115);
      ctx.fillText('T', 128, 225);
      ctx.fillText('O', 128, 335);
      ctx.fillText('P', 128, 445);
    } else if (text === '30') {
      ctx.font = '900 135px sans-serif';
      ctx.fillText('30', 128, 300);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Japanese Road Drainage Gutter & Slotted Grates Texture
   */
  static createDrainGutterTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Dark concrete gutter channel base
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 128, 512);

    // Cast iron slotted grates along gutter
    const grateSpacing = 64;
    for (let y = 0; y < 512; y += grateSpacing) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(8, y + 4, 112, 56);

      ctx.fillStyle = '#0f172a';
      for (let s = 14; s < 114; s += 16) {
        ctx.fillRect(s, y + 10, 8, 44);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Vending Machine Display Texture
   */
  static createVendingMachineFrontTexture(theme = 'red') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 256, 512);

    // Header
    const grad = ctx.createLinearGradient(0, 0, 256, 60);
    if (theme === 'red') {
      grad.addColorStop(0, '#e11d48');
      grad.addColorStop(1, '#f43f5e');
    } else {
      grad.addColorStop(0, '#0284c7');
      grad.addColorStop(1, '#38bdf8');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(10, 10, 236, 50);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(theme === 'red' ? 'HOT & COLD DRINKS' : 'REFRESHING TEA', 128, 42);

    const rows = 3;
    const cols = 4;
    const drinkColors = ['#0284c7', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];

    for (let r = 0; r < rows; r++) {
      const y = 80 + r * 90;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(14, y, 228, 75);

      for (let c = 0; c < cols; c++) {
        const x = 24 + c * 54;
        const color = drinkColors[(r * cols + c) % drinkColors.length];

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x, y + 10, 38, 50, 4);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillRect(x + 4, y + 25, 30, 8);

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(x + 4, y + 63, 30, 8, 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(14, 370, 228, 120);

    ctx.fillStyle = '#020617';
    ctx.fillRect(30, 410, 196, 60);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 410, 196, 60);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('PUSH', 128, 445);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Stylized Wood Texture for Park Benches & Traditional Fences
   */
  static createWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#704214';
    for (let i = 0; i < 35; i++) {
      const y = Math.random() * 256;
      ctx.fillRect(0, y, 256, Math.random() * 3 + 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Japanese Manhole Cover Texture (Stylized Sakura Blossom design)
   */
  static createManholeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Outer cast iron circle
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(128, 128, 124, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Inner patterned grooves
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(128, 128, 90, 0, Math.PI * 2);
    ctx.stroke();

    // Stylized sakura in center
    ctx.fillStyle = '#ff758f';
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const x = 128 + Math.cos(angle) * 35;
      const y = 128 + Math.sin(angle) * 35;
      ctx.beginPath();
      ctx.ellipse(x, y, 16, 24, angle + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Center hub
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(128, 128, 14, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Anime Lush Grass Texture with soft blade flecks and subtle tone variation
   */
  static createGrassTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base spring lawn green
    ctx.fillStyle = '#6ee7b7';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle dark lawn patches
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = Math.random() * 6 + 2;
      ctx.fillStyle = 'rgba(52, 211, 153, 0.45)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Light sunlit blade flecks
    for (let i = 0; i < 6000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillStyle = 'rgba(187, 247, 208, 0.6)';
      ctx.fillRect(x, y, 1.5, 3.5);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}

