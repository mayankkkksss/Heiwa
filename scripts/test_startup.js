import * as THREE from 'three';

global.requestAnimationFrame = (fn) => setTimeout(fn, 16);
global.window = {
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1,
  location: { search: '' },
  addEventListener: () => {},
  removeEventListener: () => {},
  requestAnimationFrame: global.requestAnimationFrame,
  AudioContext: class {
    constructor() {
      this.sampleRate = 44100;
      this.currentTime = 0;
      this.destination = {};
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(44100 * 2) };
    }
    createBufferSource() {
      return { buffer: null, loop: false, connect: () => {}, start: () => {}, stop: () => {} };
    }
    createBiquadFilter() {
      return { type: 'lowpass', frequency: { setValueAtTime: () => {} }, connect: () => {} };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: () => {},
          setTargetAtTime: () => {},
          linearRampToValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
      };
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
        start: () => {},
        stop: () => {},
      };
    }
  },
};

const domElements = new Map();
function createMockElement(id, tag = 'div') {
  const el = {
    id,
    tagName: tag.toUpperCase(),
    classList: {
      classes: new Set(),
      add: (c) => el.classList.classes.add(c),
      remove: (c) => el.classList.classes.delete(c),
      contains: (c) => el.classList.classes.has(c),
    },
    style: {},
    addEventListener: (evt, handler) => {
      el._listeners = el._listeners || {};
      el._listeners[evt] = el._listeners[evt] || [];
      el._listeners[evt].push(handler);
    },
    click: () => {
      if (el._listeners && el._listeners['click']) {
        el._listeners['click'].forEach(fn => fn({ stopPropagation: () => {} }));
      }
    },
    getContext: (type) => {
      if (type === 'webgl' || type === 'webgl2') {
        return {
          getExtension: () => ({ loseContext: () => {} }),
          getParameter: () => 16,
          createTexture: () => ({}),
          bindTexture: () => {},
          texParameteri: () => {},
          texImage2D: () => {},
          clearColor: () => {},
          clearDepth: () => {},
          clearStencil: () => {},
          enable: () => {},
          disable: () => {},
          depthFunc: () => {},
          frontFace: () => {},
          cullFace: () => {},
          viewport: () => {},
          scissor: () => {},
          canvas: el,
        };
      }
      return {
        clearRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        save: () => {},
        restore: () => {},
        fillRect: () => {},
        fillText: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        clip: () => {},
        ellipse: () => {},
        setLineDash: () => {},
        roundRect: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData: () => {},
        strokeRect: () => {},
      };
    },
    appendChild: () => {},
    remove: () => {},
  };
  domElements.set(id, el);
  return el;
}

global.document = {
  readyState: 'complete',
  activeElement: null,
  getElementById: (id) => domElements.get(id) || createMockElement(id),
  createElement: (tag) => createMockElement('created_' + Math.random(), tag),
  body: createMockElement('body', 'body'),
  addEventListener: () => {},
};

// Populate known DOM IDs from index.html
[
  'webgl-canvas',
  'ui-root',
  'title-screen',
  'loading-screen',
  'gameplay-hud',
  'pause-modal',
  'info-modal',
  'btn-begin',
  'btn-settings',
  'btn-about',
  'loading-bar-fill',
  'loading-stage-label',
  'hud-location-text',
  'minimap-canvas',
  'hud-time-icon',
  'hud-time-str',
  'hud-step-time-btn',
  'objective-card',
  'objective-title',
  'objective-desc',
  'startup-control-hint',
  'interaction-prompt',
  'interaction-text',
  'dialogue-modal',
  'dialogue-avatar',
  'dialogue-speaker',
  'dialogue-text',
  'btn-pause-resume',
  'btn-pause-audio',
  'btn-pause-controls',
  'btn-pause-quit',
  'info-modal-title',
  'info-modal-body',
  'btn-info-close',
  'toast-container',
].forEach(id => createMockElement(id));

// Mock WebGLRenderer prototype methods to avoid headless WebGL crashes
THREE.WebGLRenderer.prototype.setSize = () => {};
THREE.WebGLRenderer.prototype.setPixelRatio = () => {};
THREE.WebGLRenderer.prototype.render = () => {};
THREE.WebGLRenderer.prototype.initWebGLContext = () => {};

async function testFullStartupPipeline() {
  console.log('Testing full startup pipeline in mock runtime...');

  const { Engine } = await import('../src/engine/Engine.js');
  Engine.prototype.initRenderer = function() {
    this.renderer = {
      setSize: () => {},
      setPixelRatio: () => {},
      render: () => {},
      shadowMap: {},
    };
  };
  const { WorldSystem } = await import('../src/systems/WorldSystem.js');
  const { PlayerSystem } = await import('../src/systems/PlayerSystem.js');
  const { CameraSystem } = await import('../src/systems/CameraSystem.js');
  const { NPCSystem } = await import('../src/systems/NPCSystem.js');
  const { InteractionSystem } = await import('../src/systems/InteractionSystem.js');
  const { QuestSystem } = await import('../src/systems/QuestSystem.js');
  const { AudioSystem } = await import('../src/systems/AudioSystem.js');
  const { UISystem } = await import('../src/systems/UISystem.js');
  const { globalBus } = await import('../src/engine/EventBus.js');
  const { globalGameState, GameState } = await import('../src/engine/GameStateManager.js');
  const { globalInput } = await import('../src/engine/InputManager.js');

  const canvas = document.getElementById('webgl-canvas');
  globalInput.setCanvas(canvas);

  const engine = new Engine(canvas);
  const audioSystem = new AudioSystem();
  const worldSystem = new WorldSystem();
  const playerSystem = new PlayerSystem();
  const cameraSystem = new CameraSystem();
  const npcSystem = new NPCSystem();
  const interactionSystem = new InteractionSystem();
  const questSystem = new QuestSystem();
  const uiSystem = new UISystem();

  engine.registerSystem(audioSystem);
  engine.registerSystem(worldSystem);
  engine.registerSystem(npcSystem);
  engine.registerSystem(playerSystem);
  engine.registerSystem(cameraSystem);
  engine.registerSystem(interactionSystem);
  engine.registerSystem(questSystem);
  engine.registerSystem(uiSystem);

  interactionSystem.registerTargets(worldSystem.interactiveObjects);
  interactionSystem.registerTargets(npcSystem.getInteractiveObjects());

  console.log('Initial GameState:', globalGameState.getState());
  if (globalGameState.getState() !== GameState.TITLE) {
    throw new Error('Initial GameState should be TITLE, was: ' + globalGameState.getState());
  }

  // Verify Title Screen is visible
  const titleScreen = document.getElementById('title-screen');
  console.log('Title Screen hidden?:', titleScreen.classList.contains('hidden'));

  // Test 1: Click BEGIN
  console.log('\n--- Triggering Click on BEGIN Button ---');
  let beginTriggered = false;
  globalBus.on('ui:startBegin', () => {
    beginTriggered = true;
  });

  const btnBegin = document.getElementById('btn-begin');
  btnBegin.click();

  console.log('Was ui:startBegin event fired?:', beginTriggered);
  if (!beginTriggered) {
    throw new Error('Clicking btn-begin did NOT fire ui:startBegin event!');
  }

  // Simulate loading transition
  globalGameState.setState(GameState.LOADING);
  console.log('GameState after LOADING:', globalGameState.getState());
  console.log('Loading Screen hidden?:', document.getElementById('loading-screen').classList.contains('hidden'));

  // Simulate game start
  globalGameState.setState(GameState.PLAYING);
  console.log('GameState after PLAYING:', globalGameState.getState());
  console.log('Gameplay HUD hidden?:', document.getElementById('gameplay-hud').classList.contains('hidden'));
  console.log('Title Screen hidden?:', document.getElementById('title-screen').classList.contains('hidden'));

  // Test engine update loop for 5 frames
  for (let f = 0; f < 5; f++) {
    for (const sys of engine.systems) {
      if (typeof sys.update === 'function') {
        sys.update(0.016, f * 0.016);
      }
    }
  }
  console.log('Engine update executed successfully for 5 frames in PLAYING state.');
  console.log('Player Position:', playerSystem.position);

  // Test 2: AutoTestRunner Execution
  console.log('\n--- Testing AutoTestRunner Execution (?autotest=1) ---');
  const { AutoTestRunner } = await import('../src/testing/AutoTestRunner.js');
  engine.start();
  const runner = new AutoTestRunner(engine);
  const autotestResult = await runner.runAll();

  console.log('AutoTestRunner Result:', autotestResult);
  if (!autotestResult.passed) {
    throw new Error('AutoTestRunner failed with errors: ' + JSON.stringify(autotestResult.failures));
  }

  console.log('\n✅ Full Startup Pipeline & Autotest Verification Passed Successfully!');
}

testFullStartupPipeline().catch(err => {
  console.error('\n❌ STARTUP PIPELINE FAILED:', err);
  process.exit(1);
});
