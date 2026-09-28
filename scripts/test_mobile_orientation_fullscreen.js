/**
 * test_mobile_orientation_fullscreen.js
 * Verification of CHUNK 58: Actual Mobile Fullscreen Fix & User Activation Flow
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('🧪 Starting HEIWA Mobile Fullscreen & Orientation Flow Deep Verification...');

// 1. Static Source Code Audits
const fsMgrSrc = fs.readFileSync('src/utils/FullscreenManager.js', 'utf8');
assert(fsMgrSrc.includes('isFullscreenSupported'), 'FullscreenManager must define isFullscreenSupported');
assert(fsMgrSrc.includes('isGameFullscreen'), 'FullscreenManager must define isGameFullscreen');
assert(fsMgrSrc.includes('requestGameFullscreen'), 'FullscreenManager must define requestGameFullscreen');
assert(fsMgrSrc.includes('exitGameFullscreen'), 'FullscreenManager must define exitGameFullscreen');
assert(fsMgrSrc.includes('addChangeListener'), 'FullscreenManager must define addChangeListener');

const touchControlsSrc = fs.readFileSync('src/engine/TouchControls.js', 'utf8');
assert(touchControlsSrc.includes('FullscreenManager'), 'TouchControls must import FullscreenManager');
assert(touchControlsSrc.includes('btnEnterFullscreen'), 'TouchControls must cache btnEnterFullscreen');
assert(touchControlsSrc.includes('btnSkipFullscreen'), 'TouchControls must cache btnSkipFullscreen');
assert(touchControlsSrc.includes('orientationActionBox'), 'TouchControls must manage orientationActionBox');

const htmlSrc = fs.readFileSync('index.html', 'utf8');
assert(htmlSrc.includes('id="orientation-screen"'), 'index.html must contain #orientation-screen');
assert(htmlSrc.includes('id="btn-enter-fullscreen"'), 'index.html must contain #btn-enter-fullscreen');
assert(htmlSrc.includes('id="btn-skip-fullscreen"'), 'index.html must contain #btn-skip-fullscreen');
assert(htmlSrc.includes('id="game-container"'), 'index.html must contain #game-container');
assert(htmlSrc.includes('viewport-fit=cover'), 'index.html must include viewport-fit=cover');

const cssSrc = fs.readFileSync('src/style.css', 'utf8');
assert(cssSrc.includes('.orientation-action-box'), 'style.css must style .orientation-action-box');
assert(cssSrc.includes('.orientation-btn-fullscreen'), 'style.css must style .orientation-btn-fullscreen');
assert(cssSrc.includes('#game-container:fullscreen'), 'style.css must handle #game-container:fullscreen');

console.log('  ✓ 1. Static source audit passed');

// 2. Behavioral Simulation Matrix
const listeners = {};
let mockFullscreenElement = null;
let fullscreenRequestCount = 0;
let fullscreenShouldReject = false;
let mockFullscreenEnabled = true;

global.window = {
  innerWidth: 390,
  innerHeight: 844, // Portrait
  addEventListener: (evt, fn) => {
    listeners[evt] = listeners[evt] || [];
    listeners[evt].push(fn);
  },
  removeEventListener: () => {},
  screen: {
    orientation: {
      type: 'portrait-primary',
      addEventListener: (evt, fn) => {
        listeners[`screen.orientation.${evt}`] = listeners[`screen.orientation.${evt}`] || [];
        listeners[`screen.orientation.${evt}`].push(fn);
      },
    },
  },
  matchMedia: (query) => {
    if (query.includes('portrait')) {
      return { matches: global.window.innerHeight > global.window.innerWidth, addEventListener: () => {} };
    }
    if (query.includes('landscape')) {
      return { matches: global.window.innerWidth > global.window.innerHeight, addEventListener: () => {} };
    }
    if (query.includes('pointer: coarse')) {
      return { matches: true, addEventListener: () => {} };
    }
    return { matches: false, addEventListener: () => {} };
  },
};

try {
  Object.defineProperty(global, 'navigator', {
    value: {
      maxTouchPoints: 5,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
    },
    configurable: true,
    writable: true,
  });
} catch (e) {
  global.navigator.maxTouchPoints = 5;
}

const domElements = {};
function createMockElement(id) {
  const classes = new Set(['hidden']);
  const el = {
    id,
    textContent: '',
    classList: {
      contains: (c) => classes.has(c),
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
    },
    style: {},
    addEventListener: (evt, fn) => {
      listeners[`${id}.${evt}`] = listeners[`${id}.${evt}`] || [];
      listeners[`${id}.${evt}`].push(fn);
    },
    getBoundingClientRect: () => ({ left: 20, top: 400, width: 110, height: 110 }),
    requestFullscreen: async () => {
      fullscreenRequestCount++;
      if (fullscreenShouldReject) {
        throw new Error('NotAllowedError: requestFullscreen can only be called from within a user gesture');
      }
      mockFullscreenElement = el;
      // Trigger fullscreenchange listeners
      (listeners['fullscreenchange'] || []).forEach((fn) => fn());
      return Promise.resolve();
    },
  };
  domElements[id] = el;
  return el;
}

global.document = {
  get fullscreenEnabled() {
    return mockFullscreenEnabled;
  },
  get fullscreenElement() {
    return mockFullscreenElement;
  },
  documentElement: createMockElement('html'),
  getElementById: (id) => domElements[id] || createMockElement(id),
  addEventListener: (evt, fn) => {
    listeners[evt] = listeners[evt] || [];
    listeners[evt].push(fn);
  },
  exitFullscreen: async () => {
    mockFullscreenElement = null;
    (listeners['fullscreenchange'] || []).forEach((fn) => fn());
    return Promise.resolve();
  },
};

async function runBehavioralTests() {
  const { FullscreenManager } = await import('../src/utils/FullscreenManager.js');
  const { TouchControls } = await import('../src/engine/TouchControls.js');
  const { globalGameState, GameState } = await import('../src/engine/GameStateManager.js');

  createMockElement('orientation-screen');
  createMockElement('orientation-icon-rotate');
  createMockElement('orientation-title');
  createMockElement('orientation-message');
  createMockElement('orientation-action-box');
  createMockElement('btn-enter-fullscreen');
  createMockElement('btn-skip-fullscreen');
  createMockElement('touch-controls-root');
  createMockElement('game-container');

  // Test A: Mobile Startup in Portrait
  global.window.innerWidth = 390;
  global.window.innerHeight = 844;
  global.window.screen.orientation.type = 'portrait-primary';
  mockFullscreenEnabled = true;
  mockFullscreenElement = null;

  const touchControls = new TouchControls();
  assert(touchControls.isTouch === true, 'Mobile touch capability recognized');
  assert(touchControls.isPortraitMode() === true, 'Portrait mode accurately detected');
  assert(!domElements['orientation-screen'].classList.contains('hidden'), 'Orientation screen overlay must be visible in portrait');
  assert(!domElements['orientation-icon-rotate'].classList.contains('hidden'), 'Rotate icon visible in portrait');
  assert(domElements['orientation-action-box'].classList.contains('hidden'), 'Action box hidden in portrait');
  assert(domElements['touch-controls-root'].classList.contains('hidden'), 'Touch controls hidden in portrait');

  console.log('  ✓ 2. Test A: Portrait startup shows rotate alert and blocks gameplay');

  // Test B: Rotate to landscape where Fullscreen is supported & requires user activation (Android Chrome)
  global.window.innerWidth = 844;
  global.window.innerHeight = 390;
  global.window.screen.orientation.type = 'landscape-primary';
  globalGameState.setState(GameState.PLAYING);

  touchControls.checkOrientation();

  assert(touchControls.isPortraitMode() === false, 'Landscape mode accurately detected');
  assert(!domElements['orientation-screen'].classList.contains('hidden'), 'Orientation screen stays in transition state awaiting user tap');
  assert(domElements['orientation-icon-rotate'].classList.contains('hidden'), 'Rotate icon hidden in landscape transition');
  assert(!domElements['orientation-action-box'].classList.contains('hidden'), 'Enter Fullscreen action box shown');
  assert(domElements['orientation-title'].textContent === 'Landscape Detected', 'Title updated to Landscape Detected');

  // Simulate User Tap on "ENTER FULLSCREEN" button
  const enterFsHandlers = listeners['btn-enter-fullscreen.click'] || [];
  assert(enterFsHandlers.length > 0, 'Enter Fullscreen button has click handler');

  await enterFsHandlers[0]({ preventDefault: () => {}, stopPropagation: () => {} });

  assert(FullscreenManager.isGameFullscreen() === true, 'document.fullscreenElement confirms active fullscreen state');
  assert(domElements['orientation-screen'].classList.contains('hidden'), 'Orientation screen overlay hidden after successful fullscreen');
  assert(!domElements['touch-controls-root'].classList.contains('hidden'), 'Touch controls active in playing landscape');

  console.log('  ✓ 3. Test B: Landscape detected -> 1-tap user activation enters verified browser fullscreen');

  // Test C: Rotate landscape -> portrait during active gameplay
  global.window.innerWidth = 390;
  global.window.innerHeight = 844;
  global.window.screen.orientation.type = 'portrait-primary';
  mockFullscreenElement = null; // Browser exits fullscreen on portrait rotation

  touchControls.checkOrientation();

  assert(!domElements['orientation-screen'].classList.contains('hidden'), 'Orientation screen reappears on portrait');
  assert(!domElements['orientation-icon-rotate'].classList.contains('hidden'), 'Rotate icon restored on portrait');
  assert(domElements['orientation-action-box'].classList.contains('hidden'), 'Action box hidden on portrait');
  assert(domElements['touch-controls-root'].classList.contains('hidden'), 'Touch controls hidden on portrait');
  assert(globalGameState.is(GameState.PAUSED), 'Active gameplay paused when rotated to portrait');
  assert(touchControls.wasPlayingBeforePortrait === true, 'Remembers playing state for resume');

  console.log('  ✓ 4. Test C: Rotate landscape -> portrait cleanly pauses gameplay and re-shows orientation alert');

  // Test D: Rotate portrait -> landscape on iOS Safari (where document.fullscreenEnabled is false)
  global.window.innerWidth = 844;
  global.window.innerHeight = 390;
  global.window.screen.orientation.type = 'landscape-primary';
  mockFullscreenEnabled = false; // Simulates iPhone iOS Safari
  mockFullscreenElement = null;

  touchControls.checkOrientation();

  assert(FullscreenManager.isFullscreenSupported() === false, 'Detects fullscreen is unsupported on iOS Safari iPhone');
  assert(domElements['orientation-screen'].classList.contains('hidden'), 'Automatically hides orientation blocker on unsupported browsers');
  assert(globalGameState.is(GameState.PLAYING), 'Gameplay automatically resumed in full landscape viewport');
  assert(!domElements['touch-controls-root'].classList.contains('hidden'), 'Touch controls visible');

  console.log('  ✓ 5. Test D: iOS Safari unsupported fullscreen fallback activates landscape viewport smoothly');

  // Test E: Manual Fullscreen Exit while remaining in landscape
  mockFullscreenEnabled = true;
  mockFullscreenElement = null; // User manually exits fullscreen
  const fsReqCountBefore = fullscreenRequestCount;

  touchControls.checkOrientation();

  assert(fullscreenRequestCount === fsReqCountBefore, 'Does NOT spam fullscreen request loops on manual exit');
  assert(domElements['orientation-screen'].classList.contains('hidden'), 'Remains fully playable in landscape');

  console.log('  ✓ 6. Test E: Manual fullscreen exit preserves landscape gameplay without loop spam');

  // Test F: Desktop browser unchanged
  touchControls.isTouch = false;
  global.window.innerWidth = 600;
  global.window.innerHeight = 900;
  touchControls.checkOrientation();

  assert(domElements['orientation-screen'].classList.contains('hidden'), 'Desktop browser never shows orientation blocker');
  console.log('  ✓ 7. Test F: Desktop window completely unaffected');
}

// 3. Japanese Language Audit
const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g;
const filesToCheck = [
  'src/utils/FullscreenManager.js',
  'src/engine/TouchControls.js',
  'src/engine/Engine.js',
  'src/style.css',
  'index.html',
];

for (const relPath of filesToCheck) {
  const content = fs.readFileSync(path.resolve(relPath), 'utf8');
  const matches = content.match(japaneseRegex) || [];
  for (const char of matches) {
    if (char !== '平' && char !== '和') {
      console.error(`Forbidden Japanese character found in ${relPath}: ${char}`);
      process.exit(1);
    }
  }
}
console.log('  ✓ 8. Language audit passed: strictly "平和" only across all modified files');

runBehavioralTests()
  .then(() => {
    console.log('\n🎉 ALL MOBILE FULLSCREEN FLOW TESTS PASSED SUCCESSFULLY!\n');
  })
  .catch((err) => {
    console.error('Test failed with error:', err);
    process.exit(1);
  });
