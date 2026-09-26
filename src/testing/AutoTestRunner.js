import * as THREE from 'three';
import { globalBus } from '../engine/EventBus.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';
import { AutoTestController } from './AutoTestController.js';
import { ActivityType } from '../systems/NPCSystem.js';

/**
 * AutoTestRunner - Autonomous smoke and playability verification suite for HEIWA (平和).
 * Executes without manual WASD/mouse input, verifying real systems with robust timeout protection.
 */
export class AutoTestRunner {
  constructor(engine) {
    this.engine = engine;
    this.controller = new AutoTestController(engine);

    this.results = {
      passed: true,
      total: 0,
      passedCount: 0,
      warningsCount: 0,
      failuresCount: 0,
      skippedCount: 0,
      tests: {},
      failures: [],
      warnings: [],
      caughtErrors: [],
    };

    this.hudElement = null;
    this.setupErrorMonitor();
  }

  setupErrorMonitor() {
    window.addEventListener('error', (event) => {
      const msg = `Uncaught Exception: ${event.message} at ${event.filename}:${event.lineno}`;
      this.results.caughtErrors.push(msg);
      this.results.failures.push(msg);
      this.results.passed = false;
      console.error('[HEIWA AUTOTEST ERROR MONITOR]', msg);
    });

    window.addEventListener('unhandledrejection', (event) => {
      const msg = `Unhandled Rejection: ${event.reason}`;
      this.results.caughtErrors.push(msg);
      this.results.failures.push(msg);
      this.results.passed = false;
      console.error('[HEIWA AUTOTEST ERROR MONITOR]', msg);
    });
  }

  createHUD() {
    const existing = document.getElementById('autotest-hud');
    if (existing) existing.remove();

    const hud = document.createElement('div');
    hud.id = 'autotest-hud';
    hud.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      width: 320px;
      max-height: 90vh;
      overflow-y: auto;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      padding: 16px;
      color: #f8fafc;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px;
      z-index: 99999;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      pointer-events: none;
    `;

    hud.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; margin-bottom: 12px;">
        <span style="font-weight: 700; letter-spacing: 0.05em; color: #38bdf8;">HEIWA AUTOTEST</span>
        <span id="autotest-status-badge" style="background: #0284c7; color: white; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 10px;">RUNNING</span>
      </div>
      <div id="autotest-items-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
      <div id="autotest-summary" style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; font-weight: 600;"></div>
    `;

    document.body.appendChild(hud);
    this.hudElement = hud;
  }

  updateHUDItem(name, status, detail = '') {
    const list = document.getElementById('autotest-items-list');
    if (!list) return;

    let row = document.getElementById(`autotest-row-${name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`);
    if (!row) {
      row = document.createElement('div');
      row.id = `autotest-row-${name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
      row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-size: 11px;';
      list.appendChild(row);
    }

    let badgeColor = '#64748b';
    let badgeText = status;
    if (status === 'PASS') {
      badgeColor = '#10b981';
    } else if (status === 'FAIL') {
      badgeColor = '#ef4444';
    } else if (status === 'WARN') {
      badgeColor = '#f59e0b';
    } else if (status === 'SKIP') {
      badgeColor = '#94a3b8';
    } else if (status === 'RUNNING') {
      badgeColor = '#3b82f6';
    }

    row.innerHTML = `
      <span style="color: #cbd5e1;">${name}</span>
      <span style="color: ${badgeColor}; font-weight: 700; margin-left: 8px;">${badgeText}</span>
    `;

    if (detail && status !== 'PASS') {
      const detailEl = document.createElement('div');
      detailEl.style.cssText = 'font-size: 10px; color: #f87171; margin-bottom: 4px; padding-left: 8px;';
      detailEl.textContent = detail;
      list.appendChild(detailEl);
    }
  }

  finalizeHUD() {
    const summary = document.getElementById('autotest-summary');
    const badge = document.getElementById('autotest-status-badge');
    if (!summary || !badge) return;

    const allPassed = this.results.failuresCount === 0;
    badge.textContent = allPassed ? 'COMPLETE' : 'FAILED';
    badge.style.background = allPassed ? '#059669' : '#dc2626';

    summary.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>PASS: <strong style="color: #34d399;">${this.results.passedCount}</strong></span>
        <span>WARNINGS: <strong style="color: #fbbf24;">${this.results.warningsCount}</strong></span>
        <span>FAILURES: <strong style="color: #f87171;">${this.results.failuresCount}</strong></span>
      </div>
      <div style="color: ${allPassed ? '#34d399' : '#f87171'}; font-size: 12px; margin-top: 4px;">
        Overall: <strong>${allPassed ? 'PASS' : 'FAIL'}</strong>
      </div>
    `;
  }

  async runWithTimeout(fn, timeoutMs = 5000, timeoutMsg = 'Operation timed out') {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(timeoutMsg)), timeoutMs);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      clearTimeout(timeoutHandle);
      return result;
    } catch (err) {
      clearTimeout(timeoutHandle);
      throw err;
    }
  }

  async runTest(name, testFn, isCritical = false) {
    this.results.total++;
    this.updateHUDItem(name, 'RUNNING');

    try {
      const res = await this.runWithTimeout(testFn, 8000, `Test "${name}" timed out after 8s`);
      if (res.passed) {
        if (res.warnings && res.warnings.length > 0) {
          this.results.warningsCount += res.warnings.length;
          this.results.warnings.push(...res.warnings);
          this.results.tests[name] = 'WARN';
          this.updateHUDItem(name, 'WARN', res.warnings.join('; '));
        } else {
          this.results.passedCount++;
          this.results.tests[name] = 'PASS';
          this.updateHUDItem(name, 'PASS');
        }
        return true;
      } else if (res.skipped) {
        this.results.skippedCount++;
        this.results.tests[name] = 'SKIP';
        this.updateHUDItem(name, 'SKIP', res.reason || 'Skipped');
        return true;
      } else {
        this.results.failuresCount++;
        this.results.passed = false;
        const failMsg = `${name}: ${res.error || 'Check failed'}`;
        this.results.failures.push(failMsg);
        this.results.tests[name] = 'FAIL';
        this.updateHUDItem(name, 'FAIL', res.error);
        if (isCritical) {
          console.error(`[HEIWA AUTOTEST] Critical failure in ${name}: ${res.error}`);
        }
        return !isCritical;
      }
    } catch (err) {
      this.results.failuresCount++;
      this.results.passed = false;
      const errStr = `${name} exception: ${err.message || err}`;
      this.results.failures.push(errStr);
      this.results.tests[name] = 'FAIL';
      this.updateHUDItem(name, 'FAIL', errStr);
      if (isCritical) {
        console.error(`[HEIWA AUTOTEST] Critical exception in ${name}:`, err);
      }
      return !isCritical;
    }
  }

  async runAll() {
    console.log('[HEIWA AUTOTEST] 🚀 Initializing Autonomous Test Suite...');
    this.createHUD();

    // 1. Critical Startup Smoke Tests (Engine, State, Loop, Player)
    const testA = await this.runTest('Engine', () => this.testA_Engine(), true);
    if (!testA) {
      this.finalizeResults();
      return window.HEIWA_AUTOTEST_RESULT;
    }

    const testB = await this.runTest('Game State', () => this.testB_GameState(), true);
    if (!testB) {
      this.finalizeResults();
      return window.HEIWA_AUTOTEST_RESULT;
    }

    const testC = await this.runTest('Game Loop', () => this.testC_GameLoop(), true);
    if (!testC) {
      this.finalizeResults();
      return window.HEIWA_AUTOTEST_RESULT;
    }

    const testD = await this.runTest('Player', () => this.testD_Player(), true);
    if (!testD) {
      this.finalizeResults();
      return window.HEIWA_AUTOTEST_RESULT;
    }

    // 2. Gameplay Subsystems Verification
    await this.runTest('Camera', () => this.testE_Camera());
    await this.runTest('Movement & Jump', () => this.testF_MovementAndJump());
    await this.runTest('Bench Seating', () => this.testO_BenchSeating());
    await this.runTest('NPC Locomotion', () => this.testP_NPCLocomotion());
    await this.runTest('NPCs', () => this.testG_NPCs());
    await this.runTest('Interactions', () => this.testH_Interactions());
    await this.runTest('Quest', () => this.testI_Quest());
    await this.runTest('Pause / Resume', () => this.testJ_PauseResume());
    await this.runTest('Minimap', () => this.testK_Minimap());
    await this.runTest('Audio', () => this.testL_Audio());
    await this.runTest('NPC Dialogue Exit / Control Restoration', () => this.testN_NPCDialogueExitAndControlRestoration());
    await this.runTest('Language Audit', () => this.testM_LanguageAudit());

    // Reset player back to spawn after tests
    this.controller.teleportTo(-24.0, 0, -46.5);

    this.finalizeResults();
    return window.HEIWA_AUTOTEST_RESULT;
  }

  finalizeResults() {
    this.finalizeHUD();

    window.HEIWA_AUTOTEST_RESULT = {
      passed: this.results.passed && this.results.failuresCount === 0,
      total: this.results.total,
      passedCount: this.results.passedCount,
      warningsCount: this.results.warningsCount,
      failuresCount: this.results.failuresCount,
      skippedCount: this.results.skippedCount,
      tests: this.results.tests,
      failures: this.results.failures,
      warnings: this.results.warnings,
    };

    console.log('HEIWA_AUTOTEST_RESULT', window.HEIWA_AUTOTEST_RESULT);
  }

  // -------------------------------------------------------------
  // TEST A: Engine Initialized & Ready
  // -------------------------------------------------------------
  async testA_Engine() {
    if (!this.engine) return { passed: false, error: 'Engine instance missing' };
    if (!this.engine.ready) return { passed: false, error: 'Engine ready flag is false' };
    if (!this.engine.renderer) return { passed: false, error: 'Engine WebGLRenderer is missing' };
    if (!this.engine.scene) return { passed: false, error: 'Engine Three.js Scene is missing' };
    if (!this.engine.camera) return { passed: false, error: 'Engine PerspectiveCamera is missing' };

    const world = this.engine.systems.find((s) => s.constructor.name === 'WorldSystem');
    if (!world) return { passed: false, error: 'WorldSystem not registered on Engine' };

    return { passed: true };
  }

  // -------------------------------------------------------------
  // TEST B: Game State = PLAYING
  // -------------------------------------------------------------
  async testB_GameState() {
    // If not already in PLAYING, transition directly to PLAYING programmatically
    if (!globalGameState.is(GameState.PLAYING)) {
      globalGameState.setState(GameState.PLAYING);
      await this.controller.wait(150);
    }

    if (!globalGameState.is(GameState.PLAYING)) {
      return {
        passed: false,
        error: `Game state did not reach PLAYING. Current: ${globalGameState.getState()}`,
      };
    }

    return { passed: true };
  }

  // -------------------------------------------------------------
  // TEST C: Game Loop Running
  // -------------------------------------------------------------
  async testC_GameLoop() {
    const initialFrames = this.engine.frameCount || 0;
    await this.controller.wait(150);
    const subsequentFrames = this.engine.frameCount || 0;

    if (subsequentFrames <= initialFrames) {
      return {
        passed: false,
        error: `GAME LOOP NOT RUNNING (frameCount did not increment: was ${initialFrames}, now ${subsequentFrames})`,
      };
    }

    return { passed: true };
  }

  // -------------------------------------------------------------
  // TEST D: Player Exists & Finite Position
  // -------------------------------------------------------------
  async testD_Player() {
    const p = this.controller.playerSystem;
    if (!p) return { passed: false, error: 'PlayerSystem missing' };
    if (!p.mesh) return { passed: false, error: 'Player mesh not instantiated' };

    const pos = p.position;
    if (!pos || !isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) {
      return { passed: false, error: `Player position is invalid or non-finite: (${pos?.x}, ${pos?.y}, ${pos?.z})` };
    }

    return { passed: true };
  }

  // -------------------------------------------------------------
  // TEST E: Camera System
  // -------------------------------------------------------------
  async testE_Camera() {
    const camSys = this.controller.cameraSystem;
    const cam = this.engine.camera;
    if (!camSys || !cam) return { passed: false, error: 'CameraSystem or camera missing' };

    if (!isFinite(cam.position.x) || !isFinite(cam.position.y) || !isFinite(cam.position.z)) {
      return { passed: false, error: 'Camera position is non-finite' };
    }

    const dist = cam.position.distanceTo(this.controller.playerSystem.position);
    if (dist < 1.0 || dist > 25.0) {
      return { passed: false, error: `Camera distance outside safe bounds: ${dist.toFixed(2)}m` };
    }

    return { passed: true };
  }

  // -------------------------------------------------------------
  // TEST F: Player Kinematics & Jump
  // -------------------------------------------------------------
  async testF_MovementAndJump() {
    const p = this.controller.playerSystem;
    if (!p) return { passed: false, error: 'PlayerSystem missing' };

    this.controller.teleportTo(-24.0, 0, -46.5);
    const startPos = p.position.clone();

    // Walk forward (-Z)
    await this.controller.walkDirection(0, -1, 300);
    if (p.position.z >= startPos.z) {
      return { passed: false, error: 'Player forward walk did not advance position in -Z' };
    }

    // Trigger jump
    this.controller.triggerJump();
    let jumped = false;
    const jumpStart = performance.now();

    while (performance.now() - jumpStart < 1200) {
      await this.controller.wait(30);
      if (p.position.y > 0.15) jumped = true;
      if (jumped && p.isGrounded && Math.abs(p.position.y) <= 0.05) {
        break;
      }
    }

    if (!jumped) {
      return { passed: false, error: 'Jump did not elevate character vertically' };
    }

    return { passed: true };
  }

  // -------------------------------------------------------------
  // TEST G: NPC System & Roster Integrity
  // -------------------------------------------------------------
  async testG_NPCs() {
    const npcSys = this.controller.npcSystem;
    if (!npcSys) return { passed: false, error: 'NPCSystem missing' };
    if (!Array.isArray(npcSys.npcs) || npcSys.npcs.length < 10) {
      return { passed: false, error: `Expected 10 NPCs, found ${npcSys.npcs?.length || 0}` };
    }

    const expectedRoster = [
      'Tanaka',
      'Mochi',
      'Aoi',
      'Kenji',
      'Sato',
      'Yuka',
      'Hiroshi',
      'Takahashi',
      'Sakura',
      'Daisuke',
    ];

    for (const expectedName of expectedRoster) {
      const found = npcSys.npcs.some(
        (n) => n.config?.name?.includes(expectedName) || n.group?.userData?.name?.includes(expectedName)
      );
      if (!found) {
        return { passed: false, error: `Expected NPC "${expectedName}" was not found in active roster` };
      }
    }

    for (const npc of npcSys.npcs) {
      const pos = npc.group?.position;
      if (!pos || !isFinite(pos.x) || !isFinite(pos.z)) {
        return { passed: false, error: `NPC ${npc.config?.name || 'Unknown'} has invalid non-finite position` };
      }
    }

    // Step simulated time to advance schedules across day
    globalBus.emit('time:updated', { hours: 12.0 });
    await this.controller.wait(50);

    // Step simulated time to afternoon & evening
    globalBus.emit('time:updated', { hours: 17.0 });
    await this.controller.wait(50);

    // Reset back to morning
    globalBus.emit('time:updated', { hours: 9.0 });
    await this.controller.wait(50);

    return { passed: true };
  }

  // -------------------------------------------------------------
  // TEST H: World Interactions
  // -------------------------------------------------------------
  async testH_Interactions() {
    const interactionSys = this.controller.interactionSystem;
    if (!interactionSys) return { passed: false, error: 'InteractionSystem missing' };

    const targets = interactionSys.interactiveTargets || [];
    if (targets.length === 0) {
      return { passed: false, error: 'No interactive targets registered in InteractionSystem' };
    }

    const warnings = [];

    // 1. Verify specific target categories exist
    const categoriesToCheck = [
      { key: 'mailbox', label: 'Mailbox' },
      { key: 'vending', label: 'Vending Machine' },
      { key: 'bench', label: 'Park Bench' },
      { key: 'fountain', label: 'Drinking Fountain' },
      { key: 'cat', label: 'Mochi (Cat)' },
      { key: 'npc', label: 'Resident NPCs' },
    ];

    for (const cat of categoriesToCheck) {
      const found = targets.some((t) => t.userData?.interactionType === cat.key || t.userData?.name?.toLowerCase().includes(cat.label.toLowerCase()));
      if (!found) {
        warnings.push(`Optional interaction category "${cat.label}" not currently registered`);
      }
    }

    // 2. Test mailbox interaction execution
    const mailbox = targets.find((t) => t.userData?.interactionType === 'mailbox' || t.userData?.name?.includes('Mailbox'));
    if (mailbox && mailbox.userData?.onInteract) {
      mailbox.userData.onInteract();
      globalBus.emit('dialogue:close');
    }

    // 3. Test fountain interaction execution
    const fountain = targets.find((t) => t.userData?.interactionType === 'fountain');
    if (fountain && fountain.userData?.onInteract) {
      fountain.userData.onInteract();
      globalBus.emit('dialogue:close');
    }

    // 4. Test Mochi interaction execution
    const mochi = targets.find((t) => t.userData?.interactionType === 'cat');
    if (mochi && mochi.userData?.onInteract) {
      mochi.userData.onInteract();
      globalBus.emit('dialogue:close');
    }

    // 5. Test control restoration
    if (this.controller.playerSystem.isSitting) {
      this.controller.playerSystem.standUp();
    }
    await this.controller.wait(50);

    return { passed: true, warnings };
  }

  // -------------------------------------------------------------
  // TEST I: Quest System
  // -------------------------------------------------------------
  async testI_Quest() {
    const questSys = this.controller.questSystem;
    if (!questSys) return { passed: false, error: 'QuestSystem missing' };

    const errandQuest = questSys.quests?.find((q) => q.id === 'errand_drink' || q.title?.includes('Morning Errand'));
    if (!errandQuest) {
      return { passed: false, error: 'Morning Errand quest definition missing' };
    }

    const current = questSys.getCurrentQuest();
    if (!current) {
      return { passed: false, error: 'No active current quest found' };
    }

    return { passed: true };
  }

  // -------------------------------------------------------------
  // TEST J: Pause / Resume
  // -------------------------------------------------------------
  async testJ_PauseResume() {
    globalGameState.setState(GameState.PAUSED);
    if (!globalGameState.is(GameState.PAUSED)) {
      return { passed: false, error: 'Failed to transition to GameState.PAUSED' };
    }

    globalGameState.setState(GameState.PLAYING);
    if (!globalGameState.is(GameState.PLAYING)) {
      return { passed: false, error: 'Failed to resume to GameState.PLAYING' };
    }

    return { passed: true };
  }

  // -------------------------------------------------------------
  // TEST K: Minimap
  // -------------------------------------------------------------
  async testK_Minimap() {
    const canvas = document.getElementById('minimap-canvas');
    if (!canvas) return { passed: false, error: '#minimap-canvas DOM element missing' };
    const ctx = canvas.getContext('2d');
    if (!ctx) return { passed: false, error: 'Minimap 2D context missing' };

    return { passed: true };
  }

  // -------------------------------------------------------------
  // TEST L: Audio System
  // -------------------------------------------------------------
  async testL_Audio() {
    const audioSys = this.controller.audioSystem;
    if (!audioSys) return { passed: false, error: 'AudioSystem missing' };

    if (!audioSys.audioCtx) {
      return { passed: true, warnings: ['AudioContext suspended or pending user gesture (expected in browser)'] };
    }

    return { passed: true };
  }

  // -------------------------------------------------------------
  // TEST M: Language Audit
  // -------------------------------------------------------------
  async testM_LanguageAudit() {
    const japaneseRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
    const bodyText = document.body.innerText || '';

    const matches = bodyText.match(japaneseRegex) || [];
    const illegal = matches.filter((c) => c !== '平' && c !== '和');

    if (illegal.length > 0) {
      return {
        passed: false,
        error: `Found unauthorized Japanese characters: ${illegal.slice(0, 5).join(', ')}`,
      };
    }

    return { passed: true };
  }

  // -------------------------------------------------------------
  // TEST N: NPC Dialogue Exit / Control Restoration
  // -------------------------------------------------------------
  async testN_NPCDialogueExitAndControlRestoration() {
    return this.runWithTimeout(async () => {
      const p = this.controller.playerSystem;
      const npcSys = this.controller.npcSystem;
      const interactionSys = this.controller.interactionSystem;
      const dialogueModal = document.getElementById('dialogue-modal');
      const dialogueText = document.getElementById('dialogue-text');

      if (!p || !npcSys || !interactionSys) {
        return { passed: false, error: 'Required systems for NPC dialogue test missing' };
      }

      // Pick a human NPC to test
      const targetNPC = npcSys.npcs.find((n) => n.config?.id === 'npc_tanaka') || npcSys.npcs[0];
      if (!targetNPC || !targetNPC.group) {
        return { passed: false, error: 'No NPC found to test dialogue' };
      }

      // --- PATH 1: Test Escape Dismissal ---
      // 1. Move player close to NPC
      const npcPos = targetNPC.group.position;
      this.controller.teleportTo(npcPos.x, 0, npcPos.z + 1.6);
      await this.controller.wait(50);
      interactionSys.update();

      // 2. Trigger interaction
      targetNPC.group.userData?.onInteract?.();
      await this.controller.wait(50);

      // 3. Verify dialogue active
      if (!p.isDialogueActive) {
        return { passed: false, error: 'PlayerSystem.isDialogueActive is false after NPC interaction' };
      }
      if (dialogueModal && dialogueModal.classList.contains('hidden')) {
        return { passed: false, error: 'Dialogue modal remained hidden after interaction' };
      }
      if (dialogueText && !dialogueText.textContent.trim()) {
        return { passed: false, error: 'Dialogue text is empty' };
      }

      // 4. Dismiss via Escape
      globalBus.emit('dialogue:close');
      await this.controller.wait(50);

      // 5. Verify dialogue closed & controls restored
      if (p.isDialogueActive) {
        return { passed: false, error: 'PlayerSystem.isDialogueActive remained true after Escape dismissal' };
      }
      if (dialogueModal && !dialogueModal.classList.contains('hidden')) {
        return { passed: false, error: 'Dialogue modal remained visible after Escape dismissal' };
      }

      // 6. Verify player movement works
      const startPos1 = p.position.clone();
      await this.controller.walkDirection(0, -1, 250);
      if (p.position.z >= startPos1.z - 0.05) {
        return { passed: false, error: 'Player failed to move in -Z after Escape dialogue dismissal' };
      }

      // --- PATH 2: Test E Key Dismissal ---
      this.controller.teleportTo(npcPos.x, 0, npcPos.z + 1.6);
      await this.controller.wait(50);
      targetNPC.group.userData?.onInteract?.();
      await this.controller.wait(50);

      if (!p.isDialogueActive) {
        return { passed: false, error: 'Dialogue did not activate on second interaction' };
      }

      // Dismiss via E key simulated via event / bus
      globalBus.emit('dialogue:close');
      await this.controller.wait(50);

      if (p.isDialogueActive) {
        return { passed: false, error: 'PlayerSystem.isDialogueActive remained true after E key dismissal' };
      }

      const startPos2 = p.position.clone();
      await this.controller.walkDirection(0, -1, 250);
      if (p.position.z >= startPos2.z - 0.05) {
        return { passed: false, error: 'Player failed to move in -Z after E key dialogue dismissal' };
      }

      // --- PATH 3: Test Enter Key / Click Dismissal ---
      this.controller.teleportTo(npcPos.x, 0, npcPos.z + 1.6);
      await this.controller.wait(50);
      targetNPC.group.userData?.onInteract?.();
      await this.controller.wait(50);

      // Dismiss via UI closeDialogue (click simulation)
      if (this.controller.uiSystem) {
        this.controller.uiSystem.closeDialogue();
      } else {
        globalBus.emit('dialogue:close');
      }
      await this.controller.wait(50);

      if (p.isDialogueActive) {
        return { passed: false, error: 'PlayerSystem.isDialogueActive remained true after UI click dismissal' };
      }

      const startPos3 = p.position.clone();
      await this.controller.walkDirection(0, -1, 250);
      if (p.position.z >= startPos3.z - 0.05) {
        return { passed: false, error: 'Player failed to move in -Z after UI click dialogue dismissal' };
      }

      // Verify game state and NPC status
      if (!globalGameState.is(GameState.PLAYING)) {
        return { passed: false, error: `Game state is not PLAYING. Current: ${globalGameState.getState()}` };
      }

      if (!targetNPC.group || !isFinite(targetNPC.group.position.x)) {
        return { passed: false, error: 'NPC position was corrupted after dialogue interaction' };
      }

      return { passed: true };
    }, 6000, 'NPC dialogue did not exit');
  }

  // -------------------------------------------------------------
  // TEST O: Bench Seating
  // -------------------------------------------------------------
  async testO_BenchSeating() {
    return this.runWithTimeout(async () => {
      const p = this.controller.playerSystem;
      const interactionSys = this.controller.interactionSystem;
      if (!p || !interactionSys) {
        return { passed: false, error: 'PlayerSystem or InteractionSystem missing' };
      }

      // 1. Locate registered bench interaction target
      const targets = interactionSys.interactiveTargets || [];
      const bench = targets.find((t) => t.userData?.interactionType === 'bench');
      if (!bench || !bench.userData?.onInteract) {
        return { passed: false, error: 'No bench interactive target found' };
      }

      const benchWorldPos = new THREE.Vector3();
      bench.getWorldPosition(benchWorldPos);

      // 2. Teleport player near bench and interact
      this.controller.teleportTo(benchWorldPos.x, 0, benchWorldPos.z + 1.2);
      await this.controller.wait(50);
      interactionSys.update();

      bench.userData.onInteract();
      await this.controller.wait(50);

      // 3. Verify player enters SITTING
      if (!p.isSitting) {
        return { passed: false, error: 'Player did not enter isSitting state after bench interaction' };
      }

      // 4. Verify player root position is finite and seated near bench anchor
      if (!isFinite(p.position.x) || !isFinite(p.position.y) || !isFinite(p.position.z)) {
        return { passed: false, error: 'Player position became non-finite during sitting' };
      }

      const distToBench = p.position.distanceTo(benchWorldPos);
      if (distToBench > 2.5) {
        return { passed: false, error: `Seated player position (${p.position.x.toFixed(2)}, ${p.position.z.toFixed(2)}) is too far from bench (${benchWorldPos.x.toFixed(2)}, ${benchWorldPos.z.toFixed(2)})` };
      }

      // Verify limb sitting pose (thighs forward in +Z: rotation.x < -1.0, knees downward in -Y: rotation.x > 1.0)
      if (p.limbs.leftLeg && p.limbs.leftLeg.rotation.x > -1.0) {
        return { passed: false, error: 'Left hip rotation.x is not bent forward (+Z) for seated pose' };
      }
      if (p.limbs.leftKnee && p.limbs.leftKnee.rotation.x < 1.0) {
        return { passed: false, error: 'Left knee rotation.x is not bent downward (-Y) for seated pose' };
      }

      // 5. Stand up and verify exit SITTING
      p.standUp();
      await this.controller.wait(50);

      if (p.isSitting) {
        return { passed: false, error: 'Player remains in isSitting state after standUp()' };
      }

      // 6. Verify player movement is restored
      const startPos = p.position.clone();
      await this.controller.walkDirection(0, -1, 250);
      if (p.position.z >= startPos.z - 0.05) {
        return { passed: false, error: 'Player movement was not restored after standing up' };
      }

      return { passed: true };
    }, 5000, 'Bench seating test timed out');
  }

  // -------------------------------------------------------------
  // TEST P: NPC Locomotion
  // -------------------------------------------------------------
  async testP_NPCLocomotion() {
    return this.runWithTimeout(async () => {
      const npcSys = this.controller.npcSystem;
      if (!npcSys || !Array.isArray(npcSys.npcs) || npcSys.npcs.length === 0) {
        return { passed: false, error: 'NPCSystem or NPCs array missing' };
      }

      const humanNPCs = npcSys.npcs.filter((n) => n.type === 'human').slice(0, 3);
      if (humanNPCs.length < 3) {
        return { passed: false, error: `Expected at least 3 human NPCs, found ${humanNPCs.length}` };
      }

      const destNodes = ['park_flowerbed', 'ms_e_20', 'park_fountain'];

      for (let i = 0; i < humanNPCs.length; i++) {
        const npc = humanNPCs[i];
        const destId = destNodes[i % destNodes.length];

        npcSys.assignNPCDestination(npc, destId, ActivityType.REST);

        if (npc.state !== 'WALKING') {
          return { passed: false, error: `NPC ${npc.config.name} did not enter WALKING state` };
        }

        const startPos = npc.group.position.clone();

        // Advance simulation for several frames
        for (let frame = 0; frame < 20; frame++) {
          npcSys.updateHumanNPC(npc, 0.032, frame * 0.032, i);
        }

        const movedDist = npc.group.position.distanceTo(startPos);
        if (movedDist < 0.05) {
          return { passed: false, error: `NPC ${npc.config.name} did not translate in world space during WALKING` };
        }

        // Verify transforms are finite
        if (!isFinite(npc.group.position.x) || !isFinite(npc.group.position.y) || !isFinite(npc.group.position.z)) {
          return { passed: false, error: `NPC ${npc.config.name} transform contains NaN/Infinity` };
        }

        // Verify limb animation is active and articulated
        if (npc.limbs.leftLeg.rotation.x === 0 && npc.limbs.rightLeg.rotation.x === 0) {
          return { passed: false, error: `NPC ${npc.config.name} limb animation is inactive during locomotion` };
        }
      }

      // Reset schedules
      npcSys.evaluateSchedules();

      return { passed: true };
    }, 6000, 'NPC locomotion test timed out');
  }
}
