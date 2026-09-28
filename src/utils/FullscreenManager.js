/**
 * FullscreenManager.js - Centralized, browser-standards-compliant Fullscreen Helper for HEIWA
 */

export class FullscreenManager {
  /**
   * Check whether the Fullscreen API is supported and enabled in the current browser.
   */
  static isFullscreenSupported() {
    if (typeof document === 'undefined') return false;

    const doc = document;
    const docEnabled = Boolean(
      doc.fullscreenEnabled ||
      doc.webkitFullscreenEnabled ||
      doc.mozFullScreenEnabled ||
      doc.msFullscreenEnabled
    );

    if (!docEnabled) return false;

    const el = doc.getElementById('game-container') || doc.documentElement;
    if (!el) return false;

    return typeof (
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.webkitRequestFullScreen ||
      el.mozRequestFullScreen ||
      el.msRequestFullscreen
    ) === 'function';
  }

  /**
   * Check if the document or game container is currently in full-screen mode.
   */
  static isGameFullscreen() {
    if (typeof document === 'undefined') return false;
    const doc = document;
    return Boolean(
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    );
  }

  /**
   * Request full-screen for the main gameplay container directly inside a trusted user gesture.
   * @param {HTMLElement} [element] Optional target element, defaults to #game-container or documentElement
   * @returns {Promise<boolean>} Resolves true if fullscreen was entered, false otherwise
   */
  static async requestGameFullscreen(element) {
    if (typeof document === 'undefined') return false;

    if (this.isGameFullscreen()) {
      return true;
    }

    const target =
      element ||
      document.getElementById('game-container') ||
      document.documentElement;

    if (!target) return false;

    const requestMethod =
      target.requestFullscreen ||
      target.webkitRequestFullscreen ||
      target.webkitRequestFullScreen ||
      target.mozRequestFullScreen ||
      target.msRequestFullscreen;

    if (typeof requestMethod !== 'function') {
      return false;
    }

    try {
      const promise = requestMethod.call(target, { navigationUI: 'hide' });
      if (promise && typeof promise.then === 'function') {
        await promise;
      }
      return this.isGameFullscreen();
    } catch (err) {
      // Gracefully handled: e.g. User gesture missing or browser rejected request
      return false;
    }
  }

  /**
   * Exit fullscreen mode safely.
   */
  static async exitGameFullscreen() {
    if (typeof document === 'undefined') return false;
    if (!this.isGameFullscreen()) return true;

    const doc = document;
    const exitMethod =
      doc.exitFullscreen ||
      doc.webkitExitFullscreen ||
      doc.mozCancelFullScreen ||
      doc.msExitFullscreen;

    if (typeof exitMethod !== 'function') return false;

    try {
      const promise = exitMethod.call(doc);
      if (promise && typeof promise.then === 'function') {
        await promise;
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Subscribe to fullscreen state change events.
   * @param {Function} callback
   * @returns {Function} Unsubscribe cleanup function
   */
  static addChangeListener(callback) {
    if (typeof document === 'undefined' || typeof callback !== 'function') {
      return () => {};
    }

    const events = [
      'fullscreenchange',
      'webkitfullscreenchange',
      'mozfullscreenchange',
      'MSFullscreenChange',
    ];

    const handler = () => {
      callback(this.isGameFullscreen());
    };

    events.forEach((evt) => document.addEventListener(evt, handler));

    return () => {
      events.forEach((evt) => document.removeEventListener(evt, handler));
    };
  }
}
