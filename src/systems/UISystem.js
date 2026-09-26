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
      minimapCanvas: document.getElementById('minimap-canvas'),
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
      this.dom.btnSettings.addEventListener('click', () => {
        this.openInfoModal('Settings', `
          <div style="display:flex;flex-direction:column;gap:1rem;">
            <div><strong>Audio Ambience:</strong> Toggle environmental breeze & soundscapes.</div>
            <div><strong>Camera Sensitivity:</strong> Smooth orbital dampening active.</div>
            <div><strong>Performance:</strong> Browser hardware acceleration active.</div>
          </div>
        `);
      });
    }

    if (this.dom.btnAbout) {
      this.dom.btnAbout.addEventListener('click', () => {
        this.openInfoModal('About HEIWA', `
          <p style="margin-bottom:0.8rem;"><strong>HEIWA</strong> means peace.</p>
          <p style="margin-bottom:0.8rem;">You play as Mayank, a humble, calm, observant, and helpful young Indian man living in a peaceful Japanese neighborhood (Sakuragaoka).</p>
          <p>The game is completely non-violent — centered on daily life exploration, neighborhood connection, and tranquility.</p>
        `);
      });
    }

    if (this.dom.btnInfoClose) {
      this.dom.btnInfoClose.addEventListener('click', () => {
        this.closeInfoModal();
      });
    }

    // 2. Gameplay HUD Actions
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
            <div><strong>[M]</strong> — Toggle Ambient Audio</div>
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

  renderMinimap() {
    const canvas = this.dom.minimapCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = cx - 1.5;
    const scale = 0.65;

    ctx.clearRect(0, 0, w, h);

    // Clean subtle background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
    ctx.clip();

    const toMapX = (wx) => cx + (wx - this.playerPos.x) * scale;
    const toMapY = (wz) => cy + (wz - this.playerPos.z) * scale;

    // Park Area (Subtle muted green)
    ctx.fillStyle = 'rgba(74, 222, 128, 0.18)';
    ctx.fillRect(toMapX(-45), toMapY(-9), 34 * scale, 38 * scale);

    // Roads (Soft muted slate)
    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.fillRect(toMapX(-4.25), toMapY(-100), 8.5 * scale, 200 * scale);
    ctx.fillRect(toMapX(0), toMapY(36.5), 65 * scale, 7.5 * scale);
    ctx.fillRect(toMapX(-65), toMapY(-43.5), 65 * scale, 7.0 * scale);

    // Key Landmark Indicators (Minimal subtle dots)
    const landmarks = [
      { x: -28, z: -38, color: 'rgba(244, 114, 182, 0.75)' }, // Shrine
      { x: 24, z: 42, color: 'rgba(56, 189, 248, 0.75)' },   // Mart
      { x: -28, z: 10, color: 'rgba(74, 222, 128, 0.75)' },   // Park Garden
    ];

    landmarks.forEach((lm) => {
      ctx.fillStyle = lm.color;
      ctx.beginPath();
      ctx.arc(toMapX(lm.x), toMapY(lm.z), 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Player marker: simple clean dot + orientation tick
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const dirX = Math.sin(this.playerHeading) * 7.5;
    const dirY = Math.cos(this.playerHeading) * 7.5;
    ctx.lineTo(cx + dirX, cy + dirY);
    ctx.stroke();

    ctx.restore();

    // Subtle outer border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
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

  openInfoModal(title, contentHtml) {
    if (this.dom.infoModalTitle) this.dom.infoModalTitle.textContent = title;
    if (this.dom.infoModalBody) this.dom.infoModalBody.innerHTML = contentHtml;
    this.dom.infoModal?.classList.remove('hidden');
  }

  closeInfoModal() {
    this.dom.infoModal?.classList.add('hidden');
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
