import { globalBus } from '../engine/EventBus.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';

/**
 * UISystem - Manages Title Screen, Loading Flow, Minimal Gameplay HUD, and Modals
 */
export class UISystem {
  constructor() {
    this.dom = {};
    this.playerPos = { x: -24.0, z: -46.5 };
    this.playerHeading = 0;
    this.hintTimer = null;
  }

  init() {
    this.cacheDOMElements();
    this.setupEventListeners();
    this.setupBusListeners();

    // Set initial UI state
    this.applyState(globalGameState.getState());
  }

  cacheDOMElements() {
    this.dom = {
      // Screens
      titleScreen: document.getElementById('title-screen'),
      loadingScreen: document.getElementById('loading-screen'),
      gameplayHud: document.getElementById('gameplay-hud'),
      pauseModal: document.getElementById('pause-modal'),
      infoModal: document.getElementById('info-modal'),

      // Title elements
      btnBegin: document.getElementById('btn-begin'),
      btnSettings: document.getElementById('btn-settings'),
      btnAbout: document.getElementById('btn-about'),

      // Loading elements
      loadingBarFill: document.getElementById('loading-bar-fill'),
      loadingStageLabel: document.getElementById('loading-stage-label'),

      // Gameplay HUD elements
      hudLocationText: document.getElementById('hud-location-text'),
      minimapWrapper: document.getElementById('minimap-wrapper'),
      minimapCanvas: document.getElementById('minimap-canvas'),
      minimapToggleHint: document.getElementById('minimap-toggle-hint'),
      hudTimeIcon: document.getElementById('hud-time-icon'),
      hudTimeStr: document.getElementById('hud-time-str'),
      hudStepTimeBtn: document.getElementById('hud-step-time-btn'),
      objectiveCard: document.getElementById('objective-card'),
      objectiveTitle: document.getElementById('objective-title'),
      objectiveDesc: document.getElementById('objective-desc'),
      startupControlHint: document.getElementById('startup-control-hint'),
      interactionPrompt: document.getElementById('interaction-prompt'),
      interactionText: document.getElementById('interaction-text'),

      // Dialogue Modal
      dialogueModal: document.getElementById('dialogue-modal'),
      dialogueAvatar: document.getElementById('dialogue-avatar'),
      dialogueSpeaker: document.getElementById('dialogue-speaker'),
      dialogueText: document.getElementById('dialogue-text'),

      // Pause Modal
      btnPauseResume: document.getElementById('btn-pause-resume'),
      btnPauseAudio: document.getElementById('btn-pause-audio'),
      btnPauseControls: document.getElementById('btn-pause-controls'),
      btnPauseQuit: document.getElementById('btn-pause-quit'),

      // Info Modal
      infoModalTitle: document.getElementById('info-modal-title'),
      infoModalBody: document.getElementById('info-modal-body'),
      btnInfoClose: document.getElementById('btn-info-close'),

      toastContainer: document.getElementById('toast-container'),
    };
  }

  setupEventListeners() {
    // 1. Title Screen Actions
    if (this.dom.btnBegin) {
      this.dom.btnBegin.addEventListener('click', () => {
        globalBus.emit('ui:startBegin');
      });
    }

    if (this.dom.btnSettings) {
      this.dom.btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openInfoModal('Settings', `
          <div class="settings-list">
            <div class="settings-item">
              <div class="settings-label">Audio Ambience</div>
              <div class="settings-desc">Environmental breeze, birds, and peaceful neighborhood soundscapes.</div>
            </div>
            <div class="settings-item">
              <div class="settings-label">Camera Sensitivity</div>
              <div class="settings-desc">Smooth orbital dampening and responsive third-person follow.</div>
            </div>
            <div class="settings-item">
              <div class="settings-label">Performance</div>
              <div class="settings-desc">Hardware acceleration active with optimized WebGL rendering.</div>
            </div>
          </div>
        `, this.dom.btnSettings);
      });
    }

    if (this.dom.btnAbout) {
      this.dom.btnAbout.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openInfoModal('About HEIWA', `
          <div class="about-content">
            <p><strong>HEIWA</strong> means peace.</p>
            <p>You play as Mayank, a humble, calm, observant, and helpful young Indian man living in a peaceful Japanese neighborhood (Sakuragaoka).</p>
            <p>The game is completely non-violent — centered on daily life exploration, neighborhood connection, and tranquility.</p>
          </div>
        `, this.dom.btnAbout);
      });
    }

    if (this.dom.btnInfoClose) {
      this.dom.btnInfoClose.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeInfoModal();
      });
    }

    if (this.dom.infoModal) {
      this.dom.infoModal.addEventListener('click', (e) => {
        // Clicking the backdrop outside info-card closes modal
        if (e.target === this.dom.infoModal) {
          this.closeInfoModal();
        }
      });
    }

    // 2. Gameplay HUD Actions (Minimap Toggle & Time Step)
    if (this.dom.minimapWrapper) {
      const handleMinimapToggle = (e) => {
        e.stopPropagation();
        if (globalGameState.is(GameState.PLAYING)) {
          this.toggleMinimap();
        }
      };
      this.dom.minimapWrapper.addEventListener('click', handleMinimapToggle);
      this.dom.minimapWrapper.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });
    }

    if (this.dom.hudStepTimeBtn) {
      this.dom.hudStepTimeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        globalBus.emit('time:step');
      });
    }

    // 3. Dialogue Modal Click to Advance
    if (this.dom.dialogueModal) {
      this.dom.dialogueModal.addEventListener('click', () => {
        this.closeDialogue();
      });
    }

    // 4. Pause Menu Actions
    if (this.dom.btnPauseResume) {
      this.dom.btnPauseResume.addEventListener('click', () => {
        globalGameState.setState(GameState.PLAYING);
      });
    }

    if (this.dom.btnPauseAudio) {
      this.dom.btnPauseAudio.addEventListener('click', () => {
        globalBus.emit('audio:toggle');
      });
    }

    if (this.dom.btnPauseControls) {
      this.dom.btnPauseControls.addEventListener('click', () => {
        this.openInfoModal('Controls Guide', `
          <div style="display:flex;flex-direction:column;gap:0.6rem;">
            <div><strong>[W A S D] / [Arrow Keys]</strong> — Move Mayank</div>
            <div><strong>[Space]</strong> — Jump</div>
            <div><strong>[Shift]</strong> — Jog</div>
            <div><strong>[Mouse Movement]</strong> — Orbit / Look Direction</div>
            <div><strong>[Scroll Wheel]</strong> — Zoom Camera Distance</div>
            <div><strong>[E]</strong> — Interact / Talk</div>
            <div><strong>[Esc]</strong> — Pause Menu</div>
            <div><strong>[M]</strong> — Toggle Minimap</div>
            <div><strong>[T]</strong> — Advance Time of Day</div>
          </div>
        `);
      });
    }

    if (this.dom.btnPauseQuit) {
      this.dom.btnPauseQuit.addEventListener('click', () => {
        globalGameState.setState(GameState.TITLE);
      });
    }
  }

  setupBusListeners() {
    globalBus.on('state:changed', (data) => {
      this.applyState(data.to);
    });

    globalBus.on('loading:progress', (data) => {
      if (this.dom.loadingBarFill) {
        this.dom.loadingBarFill.style.width = `${Math.min(100, Math.round(data.progress * 100))}%`;
      }
      if (this.dom.loadingStageLabel && data.stage) {
        this.dom.loadingStageLabel.textContent = data.stage.toUpperCase();
      }
    });

    globalBus.on('player:moved', (data) => {
      this.playerPos.x = data.position.x;
      this.playerPos.z = data.position.z;
      this.playerHeading = data.headingAngle;
      if (globalGameState.is(GameState.PLAYING)) {
        this.renderMinimap();
      }
    });

    globalBus.on('player:spawned', (data) => {
      this.playerPos.x = data.position.x;
      this.playerPos.z = data.position.z;
      this.renderMinimap();
    });

    globalBus.on('ui:toggleMinimap', (data) => {
      this.toggleMinimap(data?.open);
    });

    globalBus.on('zone:changed', (data) => {
      if (this.dom.hudLocationText) {
        this.dom.hudLocationText.textContent = data.locationName;
      }
    });

    globalBus.on('time:updated', (data) => {
      if (this.dom.hudTimeIcon) this.dom.hudTimeIcon.textContent = data.icon;
      if (this.dom.hudTimeStr) this.dom.hudTimeStr.textContent = data.timeStr;
    });

    globalBus.on('quest:stateChanged', (data) => {
      if (!this.dom.objectiveCard) return;

      this.dom.objectiveCard.style.opacity = '0';
      this.dom.objectiveCard.style.transform = 'translateY(4px)';

      setTimeout(() => {
        if (data.allCompleted) {
          if (this.dom.objectiveTitle) this.dom.objectiveTitle.textContent = 'Explore Sakuragaoka';
          if (this.dom.objectiveDesc) this.dom.objectiveDesc.textContent = '';
        } else if (data.currentQuest) {
          let shortTitle = data.currentQuest.title;
          if (data.currentQuest.id === 'errand_drink') shortTitle = 'Visit HIKARI MART';
          else if (data.currentQuest.id === 'meet_tanaka') shortTitle = 'Visit Sakuragaoka Park';
          else if (data.currentQuest.id === 'pet_cat') shortTitle = 'Pet Mochi the Cat';

          if (this.dom.objectiveTitle) this.dom.objectiveTitle.textContent = shortTitle;
          if (this.dom.objectiveDesc) this.dom.objectiveDesc.textContent = '';
        }

        this.dom.objectiveCard.style.opacity = '0.9';
        this.dom.objectiveCard.style.transform = 'translateY(0)';
      }, 200);
    });

    globalBus.on('interaction:focus', (data) => {
      if (this.dom.interactionPrompt && this.dom.interactionText) {
        this.dom.interactionText.textContent = data.prompt;
        this.dom.interactionPrompt.classList.remove('hidden');
      }
    });

    globalBus.on('interaction:blur', () => {
      if (this.dom.interactionPrompt) {
        this.dom.interactionPrompt.classList.add('hidden');
      }
    });

    globalBus.on('dialogue:open', (data) => {
      this.isDialogueActive = true;
      if (this.dom.dialogueModal) {
        this.dom.dialogueSpeaker.textContent = data.speaker;
        this.dom.dialogueAvatar.textContent = data.avatar || '👤';
        this.dom.dialogueText.textContent = data.text;
        this.dom.dialogueModal.classList.remove('hidden');
      }
    });

    globalBus.on('dialogue:close', () => {
      this.closeDialogue(false);
    });

    globalBus.on('toast:show', (data) => {
      this.showToast(data.message);
    });

    globalBus.on('audio:statusChanged', (data) => {
      if (this.dom.btnPauseAudio) {
        this.dom.btnPauseAudio.textContent = data.isMuted ? 'Ambience: Off 🔇' : 'Ambience: On 🔊';
      }
    });

    globalBus.on('ui:closeInfoModal', () => {
      this.closeInfoModal(false);
    });
  }

  applyState(state) {
    // Hide all layers first
    this.dom.titleScreen?.classList.add('hidden');
    this.dom.loadingScreen?.classList.add('hidden');
    this.dom.gameplayHud?.classList.add('hidden');
    this.dom.pauseModal?.classList.add('hidden');

    if (document.activeElement && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    switch (state) {
      case GameState.TITLE:
        this.dom.titleScreen?.classList.remove('hidden');
        this.closeDialogue();
        this.closeInfoModal();
        if (this.isMinimapExpanded) this.toggleMinimap(false);
        break;

      case GameState.LOADING:
        this.dom.loadingScreen?.classList.remove('hidden');
        break;

      case GameState.PLAYING:
        this.dom.gameplayHud?.classList.remove('hidden');
        this.triggerStartupControlHint();
        this.renderMinimap();
        break;

      case GameState.PAUSED:
        this.dom.gameplayHud?.classList.remove('hidden');
        this.dom.pauseModal?.classList.remove('hidden');
        break;
    }
  }

  triggerStartupControlHint() {
    if (!this.dom.startupControlHint) return;
    this.dom.startupControlHint.style.opacity = '1';
    this.dom.startupControlHint.style.transform = 'translateX(-50%) translateY(0)';

    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      if (this.dom.startupControlHint) {
        this.dom.startupControlHint.style.opacity = '0';
        this.dom.startupControlHint.style.transform = 'translateX(-50%) translateY(-12px)';
      }
    }, 4500);
  }

  toggleMinimap(forceState) {
    this.isMinimapExpanded = forceState !== undefined ? forceState : !this.isMinimapExpanded;
    if (this.dom.minimapWrapper) {
      if (this.isMinimapExpanded) {
        this.dom.minimapWrapper.classList.add('expanded');
        if (this.dom.minimapToggleHint) {
          this.dom.minimapToggleHint.textContent = '[M] CLOSE';
        }
      } else {
        this.dom.minimapWrapper.classList.remove('expanded');
        if (this.dom.minimapToggleHint) {
          this.dom.minimapToggleHint.textContent = '[M]';
        }
      }
    }
    this.renderMinimap();
  }

  renderMinimap() {
    const canvas = this.dom.minimapCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width || 320;
    const h = canvas.height || 320;
    const cx = w / 2;
    const cy = h / 2;
    const isExpanded = !!this.isMinimapExpanded;

    ctx.clearRect(0, 0, w, h);

    // Dynamic Scale and View Clipping
    const scale = isExpanded ? 2.1 : 1.35;
    const radius = cx - 4;

    ctx.save();
    if (!isExpanded) {
      // Circular compact boundary
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      // Background base
      ctx.fillStyle = 'rgba(11, 15, 23, 0.88)';
      ctx.fill();
    } else {
      // Rounded panel boundary
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(4, 4, w - 8, h - 8, 24);
      } else {
        ctx.rect(4, 4, w - 8, h - 8);
      }
      ctx.clip();
      ctx.fillStyle = 'rgba(11, 15, 23, 0.95)';
      ctx.fill();
    }

    // World coordinate to Map Canvas coordinate transformation (North-Up)
    const toMapX = (wx) => cx + (wx - this.playerPos.x) * scale;
    const toMapY = (wz) => cy + (wz - this.playerPos.z) * scale;

    // 1. Base District Turf
    ctx.fillStyle = 'rgba(22, 101, 52, 0.16)';
    ctx.fillRect(toMapX(-110), toMapY(-110), 220 * scale, 220 * scale);

    // 2. Sakuragaoka Neighborhood Park Grounds
    ctx.fillStyle = 'rgba(34, 197, 94, 0.26)';
    ctx.fillRect(toMapX(-45), toMapY(-9), 34 * scale, 38 * scale);

    // Park Walking Paths
    ctx.fillStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.fillRect(toMapX(-29.3), toMapY(-8), 2.6 * scale, 36 * scale);

    // 3. Roads & Arterial Street Network
    // Main North-South Arterial Road (8.5m wide)
    ctx.fillStyle = 'rgba(100, 116, 139, 0.38)';
    ctx.fillRect(toMapX(-4.25), toMapY(-100), 8.5 * scale, 200 * scale);

    // Sidewalk Borders
    ctx.fillStyle = 'rgba(203, 213, 225, 0.22)';
    ctx.fillRect(toMapX(-6.25), toMapY(-100), 2.0 * scale, 200 * scale);
    ctx.fillRect(toMapX(4.25), toMapY(-100), 2.0 * scale, 200 * scale);

    // Road Centerline Dash
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    ctx.setLineDash([4 * scale, 4 * scale]);
    ctx.beginPath();
    ctx.moveTo(toMapX(0), toMapY(-95));
    ctx.lineTo(toMapX(0), toMapY(95));
    ctx.stroke();
    ctx.setLineDash([]);

    // Residential Cross Streets
    ctx.fillStyle = 'rgba(100, 116, 139, 0.32)';
    ctx.fillRect(toMapX(-65), toMapY(-41.5), 65 * scale, 7.0 * scale); // West residential lane
    ctx.fillRect(toMapX(0), toMapY(38.5), 65 * scale, 7.5 * scale);    // South commercial lane

    // 4. District Buildings (Clean Footprints)
    const buildings = [
      // Sakura Heights Apartment (Player Home)
      { minX: -36.25, maxX: -19.75, minZ: -42.8, maxZ: -33.2, color: 'rgba(244, 114, 182, 0.35)', border: '#f472b6', label: 'Home' },
      // East Apartment
      { minX: 23.75, maxX: 40.25, minZ: -42.8, maxZ: -33.2, color: 'rgba(148, 163, 184, 0.30)', border: '#94a3b8', label: 'Apartments' },
      // HIKARI MART Convenience Store
      { minX: 18.0, maxX: 30.0, minZ: 34.5, maxZ: 49.5, color: 'rgba(56, 189, 248, 0.35)', border: '#38bdf8', label: 'HIKARI MART' },
      // Detached Houses
      { minX: -32.25, maxX: -23.75, minZ: -19.25, maxZ: -10.75, color: 'rgba(203, 213, 225, 0.25)', border: '#cbd5e1', label: '' },
      { minX: -32.5, maxX: -23.5, minZ: -66.5, maxZ: -57.5, color: 'rgba(203, 213, 225, 0.25)', border: '#cbd5e1', label: '' },
      { minX: -48.0, maxX: -40.0, minZ: -42.25, maxZ: -33.75, color: 'rgba(203, 213, 225, 0.25)', border: '#cbd5e1', label: '' },
      { minX: 27.75, maxX: 36.25, minZ: -19.25, maxZ: -10.75, color: 'rgba(203, 213, 225, 0.25)', border: '#cbd5e1', label: '' },
      { minX: 27.5, maxX: 36.5, minZ: -66.5, maxZ: -57.5, color: 'rgba(203, 213, 225, 0.25)', border: '#cbd5e1', label: '' },
      { minX: -22.5, maxX: -13.5, minZ: -89.25, maxZ: -80.75, color: 'rgba(203, 213, 225, 0.25)', border: '#cbd5e1', label: '' },
      { minX: 13.5, maxX: 22.5, minZ: -89.25, maxZ: -80.75, color: 'rgba(203, 213, 225, 0.25)', border: '#cbd5e1', label: '' },
      { minX: -22.25, maxX: -13.75, minZ: 70.75, maxZ: 79.25, color: 'rgba(203, 213, 225, 0.25)', border: '#cbd5e1', label: '' },
      { minX: 13.5, maxX: 22.5, minZ: 70.5, maxZ: 79.5, color: 'rgba(203, 213, 225, 0.25)', border: '#cbd5e1', label: '' },
    ];

    buildings.forEach((b) => {
      const bx = toMapX(b.minX);
      const by = toMapY(b.minZ);
      const bw = (b.maxX - b.minX) * scale;
      const bh = (b.maxZ - b.minZ) * scale;

      ctx.fillStyle = b.color;
      ctx.fillRect(bx, by, bw, bh);

      ctx.strokeStyle = b.border;
      ctx.lineWidth = 1.0;
      ctx.strokeRect(bx, by, bw, bh);

      if (isExpanded && b.label) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.label, bx + bw / 2, by + bh / 2 + 3);
      }
    });

    // 5. Interactive Landmarks & POIs
    const landmarks = [
      { x: -28, z: -38, color: '#f472b6', name: 'Home', icon: '🏠' },
      { x: 24, z: 42, color: '#38bdf8', name: 'HIKARI MART', icon: '🍱' },
      { x: -18.5, z: 8, color: '#4ade80', name: 'Park', icon: '🌸' },
      { x: 12, z: 43.5, color: '#fbbf24', name: 'Vending Hub', icon: '🥤' },
      { x: -8.4, z: 5.0, color: '#ef4444', name: 'Postbox', icon: '📮' },
    ];

    landmarks.forEach((lm) => {
      const lx = toMapX(lm.x);
      const ly = toMapY(lm.z);

      // Outer soft beacon glow
      ctx.fillStyle = `${lm.color}33`;
      ctx.beginPath();
      ctx.arc(lx, ly, isExpanded ? 8 : 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Core point
      ctx.fillStyle = lm.color;
      ctx.beginPath();
      ctx.arc(lx, ly, isExpanded ? 3.5 : 2.0, 0, Math.PI * 2);
      ctx.fill();

      if (isExpanded) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = '600 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(lm.name, lx, ly - 7);
      }
    });

    // 6. Dynamic NPC Positions (Real-time active neighborhood markers)
    const npcSys = this.engine?.systems?.find((s) => s.constructor.name === 'NPCSystem');
    if (npcSys && Array.isArray(npcSys.npcs)) {
      npcSys.npcs.forEach((npc) => {
        if (!npc || !npc.group) return;
        const nx = toMapX(npc.group.position.x);
        const ny = toMapY(npc.group.position.z);
        const isCat = npc.type === 'cat' || npc.config?.id === 'npc_mochi';

        ctx.fillStyle = isCat ? '#ffffff' : '#38bdf8';
        ctx.beginPath();
        ctx.arc(nx, ny, isExpanded ? 2.8 : 1.8, 0, Math.PI * 2);
        ctx.fill();

        if (isExpanded) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.font = '500 7px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(npc.config?.name || 'NPC', nx, ny + 7);
        }
      });
    }

    // 7. Player Directional Arrow (AAA Chevron Marker)
    // Symmetrical chevron pointing along Mayank's actual forward facing direction
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI - this.playerHeading);

    const arrL = isExpanded ? 15 : 10.5;
    const arrW = isExpanded ? 11 : 7.5;
    const notch = isExpanded ? 4.5 : 3.0;

    // Outer soft pulse presence ring
    ctx.fillStyle = 'rgba(56, 189, 248, 0.20)';
    ctx.beginPath();
    ctx.arc(0, 0, arrL * 1.15, 0, Math.PI * 2);
    ctx.fill();

    // Directional Chevron Arrowhead Path
    ctx.beginPath();
    ctx.moveTo(0, -arrL);                      // Arrow Tip (Forward)
    ctx.lineTo(arrW, arrL - notch);            // Right Wing
    ctx.lineTo(0, arrL - notch * 1.85);        // Center Notch
    ctx.lineTo(-arrW, arrL - notch);           // Left Wing
    ctx.closePath();

    // Dark outline for contrast
    ctx.fillStyle = '#0b0f17';
    ctx.strokeStyle = '#0b0f17';
    ctx.lineWidth = 3.0;
    ctx.stroke();

    // Solid bright core fill
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Cyan forward centerline indicator
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -arrL + 2.5);
    ctx.lineTo(0, arrL - notch * 1.85);
    ctx.stroke();

    ctx.restore();

    // 8. Compass Rose & Overlays
    // North Indicator (Top Right)
    const compassX = isExpanded ? w - 24 : w - 16;
    const compassY = isExpanded ? 24 : 16;
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', compassX, compassY);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(compassX, compassY - 8);
    ctx.lineTo(compassX - 3.5, compassY - 3);
    ctx.lineTo(compassX + 3.5, compassY - 3);
    ctx.closePath();
    ctx.fill();

    // Map Header Banner when expanded
    if (isExpanded) {
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('SAKURAGAOKA DISTRICT', 16, 22);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '500 8px sans-serif';
      ctx.fillText('MAP OVERVIEW', 16, 33);
    }

    ctx.restore();

    // Subtle outer frame border
    ctx.strokeStyle = isExpanded ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (!isExpanded) {
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    } else {
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(4, 4, w - 8, h - 8, 24);
      } else {
        ctx.rect(4, 4, w - 8, h - 8);
      }
    }
    ctx.stroke();
  }

  closeDialogue(emitEvent = true) {
    this.isDialogueActive = false;
    if (this.dom.dialogueModal) {
      this.dom.dialogueModal.classList.add('hidden');
    }
    if (emitEvent) {
      globalBus.emit('dialogue:close');
    }
  }

  openInfoModal(title, contentHtml, openerBtn = null) {
    this.lastModalOpener = openerBtn;
    if (this.dom.infoModalTitle) this.dom.infoModalTitle.textContent = title;
    if (this.dom.infoModalBody) this.dom.infoModalBody.innerHTML = contentHtml;
    this.dom.infoModal?.classList.remove('hidden');
    globalBus.emit('ui:openInfoModal');

    // Accessibility focus on close button
    setTimeout(() => {
      this.dom.btnInfoClose?.focus();
    }, 50);
  }

  closeInfoModal(emitEvent = true) {
    this.dom.infoModal?.classList.add('hidden');
    if (emitEvent) {
      globalBus.emit('ui:closeInfoModal');
    }
    if (this.lastModalOpener && typeof this.lastModalOpener.focus === 'function') {
      this.lastModalOpener.focus();
    }
  }

  showToast(message) {
    if (!this.dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    this.dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3200);
  }

  update() {}
}
