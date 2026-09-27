/**
 * KeyBindings - Centralized key binding configuration, validation, formatters, and storage
 */

export const KEYBINDINGS_STORAGE_KEY = 'heiwa_keybindings_v1';

export const DEFAULT_KEY_BINDINGS = Object.freeze({
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  interact: 'KeyE',
  jog: 'ShiftLeft',
  pause: 'Escape',
  minimap: 'KeyM',
  advanceTime: 'KeyT',
});

export const ACTION_DEFINITIONS = [
  { id: 'moveForward', label: 'Move Forward' },
  { id: 'moveBackward', label: 'Move Backward' },
  { id: 'moveLeft', label: 'Move Left' },
  { id: 'moveRight', label: 'Move Right' },
  { id: 'jump', label: 'Jump' },
  { id: 'interact', label: 'Interact' },
  { id: 'jog', label: 'Jog' },
  { id: 'pause', label: 'Pause' },
  { id: 'minimap', label: 'Minimap' },
  { id: 'advanceTime', label: 'Advance Time' },
];

export const RESERVED_KEY_CODES = new Set([
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'ContextMenu',
]);

const KEY_DISPLAY_NAMES = {
  KeyW: 'W',
  KeyS: 'S',
  KeyA: 'A',
  KeyD: 'D',
  KeyE: 'E',
  KeyM: 'M',
  KeyT: 'T',
  KeyQ: 'Q',
  KeyR: 'R',
  KeyF: 'F',
  KeyC: 'C',
  KeyV: 'V',
  KeyB: 'B',
  KeyX: 'X',
  KeyZ: 'Z',
  KeyI: 'I',
  KeyJ: 'J',
  KeyK: 'K',
  KeyL: 'L',
  KeyO: 'O',
  KeyP: 'P',
  KeyU: 'U',
  KeyY: 'Y',
  KeyH: 'H',
  KeyN: 'N',
  KeyG: 'G',
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'Right Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Right Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Right Alt',
  Escape: 'Escape',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  ArrowUp: 'Arrow Up',
  ArrowDown: 'Arrow Down',
  ArrowLeft: 'Arrow Left',
  ArrowRight: 'Arrow Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/**
 * Friendly English representation of a browser key code
 */
export function formatKeyDisplay(code) {
  if (!code || typeof code !== 'string') return 'None';
  if (KEY_DISPLAY_NAMES[code]) return KEY_DISPLAY_NAMES[code];

  if (code.startsWith('Key')) {
    return code.slice(3).toUpperCase();
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  if (code.startsWith('Numpad')) {
    return `Num ${code.slice(6)}`;
  }

  // PascalCase / CamelCase to spaced words
  return code.replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Check whether a key is reserved by browser/OS
 */
export function isReservedKey(code) {
  return RESERVED_KEY_CODES.has(code);
}

/**
 * Load stored key bindings from localStorage with fallback to defaults
 */
export function loadStoredKeyBindings() {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_KEY_BINDINGS };
    const raw = localStorage.getItem(KEYBINDINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_KEY_BINDINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_KEY_BINDINGS };

    const validated = { ...DEFAULT_KEY_BINDINGS };
    for (const key of Object.keys(DEFAULT_KEY_BINDINGS)) {
      if (typeof parsed[key] === 'string' && parsed[key].length > 0) {
        validated[key] = parsed[key];
      }
    }
    return validated;
  } catch {
    return { ...DEFAULT_KEY_BINDINGS };
  }
}

/**
 * Persist key bindings to localStorage
 */
export function saveStoredKeyBindings(bindings) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(bindings));
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear stored key bindings
 */
export function clearStoredKeyBindings() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(KEYBINDINGS_STORAGE_KEY);
    }
  } catch {}
}
