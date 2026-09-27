import { globalBus } from '../engine/EventBus.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';
import { globalInput } from '../engine/InputManager.js';
import { ACTION_DEFINITIONS, formatKeyDisplay } from '../engine/KeyBindings.js';

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
      btnCredits: document.getElementById('btn-credits'),

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
      btnPauseSettings: document.getElementById('btn-pause-settings'),
      btnPauseCredits: document.getElementById('btn-pause-credits'),
      btnPauseQuit: document.getElementById('btn-pause-quit'),

      // Info Modal
      infoModalTitle: document.getElementById('info-modal-title'),
      infoModalBody: document.getElementById('info-modal-body'),
      btnInfoClose: document.getElementById('btn-info-close'),

      // Confirmation Modal
      confirmModal: document.getElementById('confirm-modal'),
      confirmModalTitle: document.getElementById('confirm-modal-title'),
      confirmModalBody: document.getElementById('confirm-modal-body'),
      btnConfirmCancel: document.getElementById('btn-confirm-cancel'),
      btnConfirmAccept: document.getElementById('btn-confirm-accept'),

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
        this.openSettingsModal(this.dom.btnSettings);
      });
    }

    if (this.dom.btnAbout) {
      this.dom.btnAbout.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openAboutModal(this.dom.btnAbout);
      });
    }

    if (this.dom.btnCredits) {
      this.dom.btnCredits.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openCreditsModal(this.dom.btnCredits);
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

    // Confirmation Modal Actions
    if (this.dom.btnConfirmCancel) {
      this.dom.btnConfirmCancel.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeConfirmModal();
      });
    }

    if (this.dom.btnConfirmAccept) {
      this.dom.btnConfirmAccept.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof this.confirmCallback === 'function') {
          const cb = this.confirmCallback;
          this.confirmCallback = null;
          cb();
        }
      });
    }

    if (this.dom.confirmModal) {
      this.dom.confirmModal.addEventListener('click', (e) => {
        if (e.target === this.dom.confirmModal) {
          this.closeConfirmModal();
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
        `, this.dom.btnPauseControls);
      });
    }

    if (this.dom.btnPauseSettings) {
      this.dom.btnPauseSettings.addEventListener('click', () => {
        this.openSettingsModal(this.dom.btnPauseSettings);
      });
    }

    if (this.dom.btnPauseCredits) {
      this.dom.btnPauseCredits.addEventListener('click', () => {
        this.openCreditsModal(this.dom.btnPauseCredits);
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

    globalBus.on('ui:closeConfirmModal', () => {
      this.closeConfirmModal(false);
    });

    globalBus.on('ui:openConfirmModal', (data) => {
      if (data) {
        this.openConfirmModal(data.title, data.message, data.onConfirm);
      }
    });

    globalBus.on('save:completed', () => {
      // Unobtrusive update
      const statusEl = document.getElementById('save-status-indicator');
      if (statusEl) {
        statusEl.textContent = 'Saved just now';
      }
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

    // Procedural Road Network from active streamed chunks
    const streamingSys = this.engine?.systems?.find((s) => s.constructor.name === 'WorldStreamingSystem');
    if (streamingSys && streamingSys.activeChunks) {
      ctx.fillStyle = 'rgba(100, 116, 139, 0.38)';
      for (const chunk of streamingSys.activeChunks.values()) {
        if (chunk.isAuthored || !chunk.roads) continue;
        for (const r of chunk.roads) {
          if (r.type === 'NS') {
            const rx = toMapX(r.startX - r.width / 2);
            const ry = toMapY(r.startZ);
            const rw = r.width * scale;
            const rh = (r.endZ - r.startZ) * scale;
            ctx.fillRect(rx, ry, rw, rh);
          } else if (r.type === 'EW') {
            const rx = toMapX(r.startX);
            const ry = toMapY(r.startZ - r.width / 2);
            const rw = (r.endX - r.startX) * scale;
            const rh = r.width * scale;
            ctx.fillRect(rx, ry, rw, rh);
          }
        }
      }
    }

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

    // Procedural Buildings from active streamed chunks
    if (streamingSys && streamingSys.activeChunks) {
      for (const chunk of streamingSys.activeChunks.values()) {
        if (chunk.isAuthored || !chunk.colliders) continue;
        for (const col of chunk.colliders) {
          if (col.category === 'building' && col.type === 'box') {
            const bx = toMapX(col.minX);
            const by = toMapY(col.minZ);
            const bw = (col.maxX - col.minX) * scale;
            const bh = (col.maxZ - col.minZ) * scale;

            ctx.fillStyle = 'rgba(203, 213, 225, 0.22)';
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1.0;
            ctx.strokeRect(bx, by, bw, bh);
          }
        }
      }
    }

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

    // 5b. Procedural World Exploration Landmarks & Destinations
    if (streamingSys && streamingSys.activeChunks) {
      for (const chunk of streamingSys.activeChunks.values()) {
        if (!chunk.destination) continue;
        const dest = chunk.destination;
        const dx = toMapX(dest.x);
        const dy = toMapY(dest.z);
        const isDiscovered = streamingSys.isDestinationDiscovered ? streamingSys.isDestinationDiscovered(dest.name) : false;

        // Outer beacon ring
        ctx.fillStyle = `${dest.color || '#38bdf8'}33`;
        ctx.beginPath();
        ctx.arc(dx, dy, isExpanded ? 9 : 5.0, 0, Math.PI * 2);
        ctx.fill();

        // Core marker
        ctx.fillStyle = dest.color || '#38bdf8';
        ctx.beginPath();
        ctx.arc(dx, dy, isExpanded ? 4.0 : 2.4, 0, Math.PI * 2);
        ctx.fill();

        // White center dot for discovered destinations
        if (isDiscovered) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(dx, dy, isExpanded ? 1.6 : 1.0, 0, Math.PI * 2);
          ctx.fill();
        }

        if (isExpanded) {
          ctx.fillStyle = '#f8fafc';
          ctx.font = '600 8.5px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(dest.name, dx, dy - 8);
        }
      }
    }

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

  openSettingsModal(openerBtn = null) {
    const content = `
      <div class="settings-content settings-list" style="display:flex;flex-direction:column;gap:1.2rem;">
        <div class="settings-nav-bar">
          <button class="settings-nav-btn active">Settings</button>
          <button class="settings-nav-btn" id="nav-settings-about">About</button>
          <button class="settings-nav-btn" id="nav-settings-credits">Credits</button>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem 0.8rem;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
          <div>
            <div style="font-weight:600;font-size:0.95rem;color:#f8fafc;">Ambience & Audio</div>
            <div style="font-size:0.8rem;color:#94a3b8;">Background environmental audio and effects</div>
          </div>
          <button id="btn-settings-toggle-audio" class="btn btn-secondary" style="padding:0.4rem 0.8rem;font-size:0.85rem;">Toggle Audio</button>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem 0.8rem;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
          <div>
            <div style="font-weight:600;font-size:0.95rem;color:#f8fafc;">Auto-Save Status</div>
            <div style="font-size:0.8rem;color:#94a3b8;">Saves location, quests, vehicle, and world state automatically</div>
          </div>
          <div id="save-status-indicator" style="font-size:0.85rem;color:#38bdf8;font-weight:500;">Saved</div>
        </div>

        <div class="key-bindings-section">
          <div class="key-bindings-header">
            <div>
              <div style="font-weight:600;font-size:0.95rem;color:#f8fafc;">Key Bindings</div>
              <div style="font-size:0.8rem;color:#94a3b8;">Customize controls for walking and driving</div>
            </div>
            <button id="btn-settings-reset-controls" class="btn btn-secondary" style="padding:0.35rem 0.75rem;font-size:0.8rem;">Reset Controls</button>
          </div>
          <div id="key-bindings-list" class="key-bindings-list"></div>
        </div>

        <div style="margin-top:0.2rem;padding:0.8rem;background:rgba(239,68,68,0.06);border-radius:8px;border:1px solid rgba(239,68,68,0.2);display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:600;font-size:0.95rem;color:#fca5a5;">Reset Game</div>
            <div style="font-size:0.78rem;color:#f87171;">Permanently delete local save and start fresh</div>
          </div>
          <button id="btn-settings-reset" class="btn-reset-game">Reset Game</button>
        </div>
      </div>
    `;

    this.openInfoModal('Settings', content, openerBtn);

    // Nav bar listeners
    const navAbout = document.getElementById('nav-settings-about');
    if (navAbout) {
      navAbout.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openAboutModal(openerBtn);
      });
    }

    const navCredits = document.getElementById('nav-settings-credits');
    if (navCredits) {
      navCredits.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openCreditsModal(openerBtn);
      });
    }

    // 1. Audio toggle
    const toggleAudioBtn = document.getElementById('btn-settings-toggle-audio');
    if (toggleAudioBtn) {
      toggleAudioBtn.addEventListener('click', () => {
        globalBus.emit('audio:toggle');
      });
    }

    // 2. Key Bindings rendering and interaction
    const renderKeyBindingRows = () => {
      const listEl = document.getElementById('key-bindings-list');
      if (!listEl) return;

      listEl.innerHTML = ACTION_DEFINITIONS.map((act) => {
        const currentCode = globalInput.getBinding(act.id);
        const displayKey = formatKeyDisplay(currentCode);
        return `
          <div class="key-binding-row" data-action="${act.id}">
            <span class="key-action-label">${act.label}</span>
            <div class="key-binding-controls">
              <span class="key-binding-badge" id="key-badge-${act.id}">${displayKey}</span>
              <button class="btn btn-secondary btn-change-key" id="btn-change-${act.id}" data-action="${act.id}">Change</button>
            </div>
          </div>
        `;
      }).join('');

      attachKeyChangeListeners();
    };

    const attachKeyChangeListeners = () => {
      const changeButtons = document.querySelectorAll('.btn-change-key');
      changeButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const actionId = btn.getAttribute('data-action');
          if (!actionId) return;

          // Reset all other change buttons
          changeButtons.forEach((b) => {
            b.textContent = 'Change';
            b.classList.remove('listening');
          });

          btn.textContent = 'Press a key...';
          btn.classList.add('listening');

          globalInput.startKeyCapture(
            actionId,
            (newCode) => {
              btn.textContent = 'Change';
              btn.classList.remove('listening');

              const conflictAction = globalInput.findConflict(actionId, newCode);
              if (conflictAction) {
                const conflictDef = ACTION_DEFINITIONS.find((a) => a.id === conflictAction);
                const actionDef = ACTION_DEFINITIONS.find((a) => a.id === actionId);
                const keyName = formatKeyDisplay(newCode);

                this.openConfirmModal(
                  'Key Conflict',
                  `${keyName} is already assigned to ${conflictDef?.label || conflictAction}. Replace existing binding?`,
                  () => {
                    this.closeConfirmModal();
                    // Clear conflicting action and assign newCode to actionId
                    globalInput.setBinding(conflictAction, '');
                    globalInput.setBinding(actionId, newCode);
                    renderKeyBindingRows();
                    this.showToast(`${actionDef?.label || actionId} bound to ${keyName}.`);
                  }
                );
              } else {
                globalInput.setBinding(actionId, newCode);
                renderKeyBindingRows();
                const actionDef = ACTION_DEFINITIONS.find((a) => a.id === actionId);
                this.showToast(`${actionDef?.label || actionId} bound to ${formatKeyDisplay(newCode)}.`);
              }
            },
            () => {
              btn.textContent = 'Change';
              btn.classList.remove('listening');
            }
          );
        });
      });
    };

    renderKeyBindingRows();

    // 3. Reset Controls button
    const resetControlsBtn = document.getElementById('btn-settings-reset-controls');
    if (resetControlsBtn) {
      resetControlsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openConfirmModal(
          'Reset Controls?',
          'Restore all keyboard controls to their default keys?',
          () => {
            this.closeConfirmModal();
            globalInput.resetBindings();
            renderKeyBindingRows();
            this.showToast('Keyboard controls restored to defaults.');
          }
        );
      });
    }

    // 4. Reset Game button
    const resetBtn = document.getElementById('btn-settings-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openConfirmModal(
          'Reset Game?',
          'Your saved progress will be permanently deleted.',
          () => {
            this.closeConfirmModal();
            this.closeInfoModal();
            globalBus.emit('game:reset');
          }
        );
      });
    }
  }

  openAboutModal(openerBtn = null) {
    const content = `
      <div class="about-content">
        <div class="settings-nav-bar">
          <button class="settings-nav-btn" id="nav-about-settings">Settings</button>
          <button class="settings-nav-btn active">About</button>
          <button class="settings-nav-btn" id="nav-about-credits">Credits</button>
        </div>
        <p><strong>HEIWA</strong> means peace.</p>
        <p>You play as Mayank, a humble, calm, observant, and helpful young Indian man living in a peaceful Japanese neighborhood (Sakuragaoka).</p>
        <p>The game is completely non-violent — centered on daily life exploration, neighborhood connection, and tranquility.</p>
        <div style="margin-top:0.5rem;padding-top:0.75rem;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:0.82rem;color:#94a3b8;">Created by Mayank Suthar</span>
          <button id="btn-about-view-credits" class="btn btn-secondary" style="padding:0.35rem 0.75rem;font-size:0.8rem;">View Credits</button>
        </div>
      </div>
    `;
    this.openInfoModal('About HEIWA', content, openerBtn);

    const navSettings = document.getElementById('nav-about-settings');
    if (navSettings) {
      navSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openSettingsModal(openerBtn);
      });
    }
    const navCredits = document.getElementById('nav-about-credits');
    if (navCredits) {
      navCredits.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openCreditsModal(openerBtn);
      });
    }
    const btnViewCredits = document.getElementById('btn-about-view-credits');
    if (btnViewCredits) {
      btnViewCredits.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openCreditsModal(openerBtn);
      });
    }
  }

  openCreditsModal(openerBtn = null) {
    const content = `
      <div class="credits-panel">
        <div class="settings-nav-bar">
          <button class="settings-nav-btn" id="nav-credits-settings">Settings</button>
          <button class="settings-nav-btn" id="nav-credits-about">About</button>
          <button class="settings-nav-btn active">Credits</button>
        </div>

        <div class="credits-header">
          <div style="font-size:2rem;font-weight:700;color:#ff758f;margin-bottom:0.2rem;">平和</div>
          <div style="font-size:1.1rem;font-weight:700;color:#ffffff;letter-spacing:0.08em;">HEIWA</div>
          <div style="font-size:0.82rem;color:#94a3b8;margin-top:0.2rem;">A Quiet Life in Japan</div>
        </div>

        <div class="credits-section">
          <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:#38bdf8;font-weight:600;margin-bottom:0.35rem;">Creator / Developer</div>
          <div style="font-size:1.1rem;font-weight:700;color:#ffffff;margin-bottom:0.4rem;">Mayank Suthar</div>
          <div style="font-size:0.85rem;color:#cbd5e1;display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
            <span style="color:#94a3b8;">GitHub:</span>
            <a href="https://github.com/mayankkkksss/" target="_blank" rel="noopener noreferrer" class="credits-link" id="credits-github-link">https://github.com/mayankkkksss/</a>
          </div>
        </div>

        <div class="credits-section" style="display:flex;flex-direction:column;gap:0.85rem;">
          <div>
            <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:#38bdf8;font-weight:600;margin-bottom:0.25rem;">Development & Coding Tool</div>
            <div style="font-size:0.95rem;font-weight:600;color:#ffffff;">Antigravity</div>
            <div style="font-size:0.8rem;color:#94a3b8;">Coding and implementation</div>
          </div>
          <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:0.75rem;">
            <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:#38bdf8;font-weight:600;margin-bottom:0.25rem;">Prompting & AI Assistance</div>
            <div style="font-size:0.95rem;font-weight:600;color:#ffffff;">ChatGPT</div>
            <div style="font-size:0.8rem;color:#94a3b8;">Prompting and AI-assisted development guidance</div>
          </div>
        </div>

        <div class="credits-section" style="font-size:0.8rem;color:#94a3b8;line-height:1.5;">
          <div><strong>Three.js</strong> — 3D WebGL Graphics Engine</div>
          <div><strong>Vite</strong> — Next Generation Frontend Tooling</div>
          <div><strong>Plus Jakarta Sans</strong> — Typography by Tokotype</div>
        </div>
      </div>
    `;
    this.openInfoModal('Credits', content, openerBtn);

    const navSettings = document.getElementById('nav-credits-settings');
    if (navSettings) {
      navSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openSettingsModal(openerBtn);
      });
    }
    const navAbout = document.getElementById('nav-credits-about');
    if (navAbout) {
      navAbout.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openAboutModal(openerBtn);
      });
    }

    const ghLink = document.getElementById('credits-github-link');
    if (ghLink) {
      ghLink.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  }

  openConfirmModal(title, message, onConfirm) {
    this.confirmCallback = onConfirm;
    if (this.dom.confirmModalTitle) this.dom.confirmModalTitle.textContent = title;
    if (this.dom.confirmModalBody) this.dom.confirmModalBody.textContent = message;
    this.dom.confirmModal?.classList.remove('hidden');
    globalBus.emit('ui:openConfirmModalActive');

    setTimeout(() => {
      this.dom.btnConfirmCancel?.focus();
    }, 50);
  }

  closeConfirmModal(emitEvent = true) {
    this.confirmCallback = null;
    this.dom.confirmModal?.classList.add('hidden');
    if (emitEvent) {
      globalBus.emit('ui:closeConfirmModal');
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
    globalInput.cancelKeyCapture();
    if (this.dom.confirmModal && !this.dom.confirmModal.classList.contains('hidden')) {
      this.closeConfirmModal(false);
    }
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

