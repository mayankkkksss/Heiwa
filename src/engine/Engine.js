import * as THREE from 'three';
import { globalBus } from './EventBus.js';

/**
 * Engine - Core 3D Rendering & Game Loop Orchestrator
 */
export class Engine {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.systems = [];
    this.clock = new THREE.Clock();
    this.isRunning = false;
    this.frameCount = 0;
    this.ready = false;

    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initEventListeners();
  }

  initRenderer() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
      });

      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.1;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } catch (err) {
      console.error('WebGL initialization failed:', err);
      throw new Error('WebGL is not supported or was disabled in your browser. Please enable hardware acceleration or try a modern WebGL-compatible browser.');
    }
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#93c5fd');
    this.scene.fog = new THREE.FogExp2('#bfdbfe', 0.008);
  }

  initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 3, 7);
  }

  initEventListeners() {
    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.handleResize(), 50);
    });
    if (window.screen && window.screen.orientation) {
      window.screen.orientation.addEventListener('change', () => {
        setTimeout(() => this.handleResize(), 50);
      });
    }
  }

  handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const maxDpr = isMobile ? 1.5 : 2.0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));

    globalBus.emit('viewport:resize', { width, height });
  }

  registerSystem(system) {
    this.systems.push(system);
    if (typeof system.init === 'function') {
      system.init(this);
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.ready = true;
    this.clock.start();
    this.animate();
  }

  stop() {
    this.isRunning = false;
    this.clock.stop();
  }

  animate = () => {
    if (!this.isRunning) return;
    requestAnimationFrame(this.animate);
    this.frameCount++;

    // Delta time clamped to avoid huge physics spikes when tab inactive
    const rawDelta = this.clock.getDelta();
    const delta = Math.min(rawDelta, 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    // Update all systems
    for (let i = 0; i < this.systems.length; i++) {
      if (typeof this.systems[i].update === 'function') {
        this.systems[i].update(delta, elapsedTime);
      }
    }

    // Render Scene
    this.renderer.render(this.scene, this.camera);
  };
}
