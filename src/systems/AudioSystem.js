import { globalBus } from '../engine/EventBus.js';
import { globalGameState, GameState } from '../engine/GameStateManager.js';

/**
 * AudioSystem - Zone-based procedural ambient soundscape using Web Audio API.
 * Delivers a calm, spacious, immersive Japanese neighborhood atmosphere.
 */
export class AudioSystem {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
    this.isInitialized = false;

    // Master & Sub-Gain nodes
    this.masterGain = null;
    this.windGain = null;
    this.windFilter = null;
    this.cityHumGain = null;
    this.storeHumGain = null;

    // Atmosphere tracking
    this.currentZone = 'residential';
    this.nextBirdTime = 3.0;
    this.nextChimeTime = 18.0;
  }

  init(engine) {
    this.engine = engine;

    const unlockAudio = () => {
      this.initAudioContext();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    globalBus.on('player:footstep', (data) => this.playFootstep(data));
    globalBus.on('player:jump', () => this.playJumpSound());
    globalBus.on('player:land', () => this.playLandSound());
    globalBus.on('interaction:success', (data) => this.playInteractionSound(data));
    globalBus.on('dialogue:open', () => this.playDialogueChime());
    globalBus.on('audio:toggle', () => this.toggleMute());

    // Zone detection based on player position
    globalBus.on('player:moved', (data) => {
      if (data && data.position) {
        this.updatePlayerZone(data.position);
      }
    });

    // Pause / Resume audio management
    globalBus.on('state:changed', (data) => {
      if (this.masterGain && this.audioCtx) {
        const now = this.audioCtx.currentTime;
        if (data.to === GameState.PAUSED) {
          this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.25, now, 0.4);
        } else if (data.to === GameState.PLAYING) {
          this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.85, now, 0.4);
        }
      }
    });
  }

  initAudioContext() {
    if (this.isInitialized) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.audioCtx = new AudioContextClass();
      this.isInitialized = true;
      this.startAmbientSoundscape();
    } catch (e) {
      console.warn('Web Audio API not supported or blocked:', e);
    }
  }

  startAmbientSoundscape() {
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;

    // Master Output Gain
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.85, now);
    this.masterGain.connect(this.audioCtx.destination);

    // 1. Procedural Gentle Breeze (Filtered White/Pink Noise with slow breathing modulation)
    const bufferSize = this.audioCtx.sampleRate * 3;
    const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Soft 1-pole pinking filter for warm, natural air texture
      lastOut = (lastOut * 0.94) + (white * 0.06);
      output[i] = lastOut * 3.5;
    }

    const windSource = this.audioCtx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    this.windFilter = this.audioCtx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.setValueAtTime(280, now);
    this.windFilter.Q.setValueAtTime(1.2, now);

    this.windGain = this.audioCtx.createGain();
    this.windGain.gain.setValueAtTime(0.022, now);

    windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    windSource.start(0);

    // 2. Distant Neighborhood / Main Street Hum
    const humOsc = this.audioCtx.createOscillator();
    humOsc.type = 'triangle';
    humOsc.frequency.setValueAtTime(52, now);

    const humFilter = this.audioCtx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.setValueAtTime(110, now);

    this.cityHumGain = this.audioCtx.createGain();
    this.cityHumGain.gain.setValueAtTime(0.0015, now);

    humOsc.connect(humFilter);
    humFilter.connect(this.cityHumGain);
    this.cityHumGain.connect(this.masterGain);
    humOsc.start(0);

    // 3. Convenience Store Ambient Hum (HIKARI MART)
    const storeOsc = this.audioCtx.createOscillator();
    storeOsc.type = 'sine';
    storeOsc.frequency.setValueAtTime(115, now);

    const storeFilter = this.audioCtx.createBiquadFilter();
    storeFilter.type = 'lowpass';
    storeFilter.frequency.setValueAtTime(160, now);

    this.storeHumGain = this.audioCtx.createGain();
    this.storeHumGain.gain.setValueAtTime(0.0, now);

    storeOsc.connect(storeFilter);
    storeFilter.connect(this.storeHumGain);
    this.storeHumGain.connect(this.masterGain);
    storeOsc.start(0);
  }

  updatePlayerZone(pos) {
    if (!this.audioCtx || this.isMuted) return;

    let newZone = 'residential';
    let locationName = 'Residential District';

    // Hikari Mart interior
    if (pos.x > 17 && pos.x < 31 && pos.z > 36 && pos.z < 48) {
      newZone = 'store';
      locationName = 'HIKARI MART';
    } else if (pos.x < -10 && pos.x > -48 && pos.z > -10 && pos.z < 30) {
      newZone = 'park';
      locationName = 'Sakuragaoka Park';
    } else if (Math.abs(pos.x) < 8.5) {
      newZone = 'main_street';
      locationName = 'Sakuragaoka Main Street';
    } else if (pos.x < -15 && pos.z < -25) {
      newZone = 'apartments';
      locationName = 'Sakura Heights';
    }

    if (newZone !== this.currentZone) {
      const prevZone = this.currentZone;
      this.currentZone = newZone;
      globalBus.emit('zone:changed', { zone: newZone, locationName });

      // If entered convenience store from outside, play greeting chime
      if (newZone === 'store' && prevZone !== 'store') {
        this.playStoreChime();
      }

      // Smooth crossfade transitions between atmospheric zones (time constant: 1.2s)
      const now = this.audioCtx.currentTime;
      if (this.windGain) {
        let targetWind = 0.022;
        if (newZone === 'park') targetWind = 0.032;
        else if (newZone === 'store') targetWind = 0.003;
        else if (newZone === 'main_street') targetWind = 0.016;
        else if (newZone === 'apartments') targetWind = 0.024;
        this.windGain.gain.setTargetAtTime(targetWind, now, 1.2);
      }

      if (this.cityHumGain) {
        let targetHum = 0.0015;
        if (newZone === 'main_street') targetHum = 0.012;
        else if (newZone === 'park') targetHum = 0.0004;
        else if (newZone === 'store') targetHum = 0.001;
        this.cityHumGain.gain.setTargetAtTime(targetHum, now, 1.2);
      }

      if (this.storeHumGain) {
        this.storeHumGain.gain.setTargetAtTime(newZone === 'store' ? 0.022 : 0.0, now, 1.2);
      }
    }
  }

  /**
   * Iconic Japanese Konbini greeting chime (F#5 -> D#5 -> B4 -> F#4 -> B4 -> D#5)
   * Rendered in soft, warm sine tones.
   */
  playStoreChime() {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    const now = this.audioCtx.currentTime;

    const melody = [739.99, 622.25, 493.88, 369.99, 493.88, 622.25];
    melody.forEach((freq, idx) => {
      const startTime = now + idx * 0.11;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.0, startTime);
      gain.gain.linearRampToValueAtTime(0.028, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.4);
    });
  }

  /**
   * Procedural Japanese garden birdsong (peaceful bush warbler / sparrow notes)
   */
  playProceduralBird() {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    const now = this.audioCtx.currentTime;

    const isDoubleNote = Math.random() > 0.45;
    const baseFreq = 2400 + Math.random() * 600;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';

    if (isDoubleNote) {
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq + 450, now + 0.07);
      osc.frequency.exponentialRampToValueAtTime(baseFreq + 200, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(baseFreq + 700, now + 0.22);

      gain.gain.setValueAtTime(0.0, now);
      gain.gain.linearRampToValueAtTime(0.022, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      osc.frequency.setValueAtTime(baseFreq + 300, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq - 150, now + 0.14);

      gain.gain.setValueAtTime(0.0, now);
      gain.gain.linearRampToValueAtTime(0.018, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.2);
    }
  }

  /**
   * Subtle Japanese Furin (Wind Chime) crystal tone in gentle breeze
   */
  playOccasionalWindChime() {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    const now = this.audioCtx.currentTime;

    const chimeFreqs = [2093.0, 2637.0, 3135.96]; // C7, E7, G7
    const freq = chimeFreqs[Math.floor(Math.random() * chimeFreqs.length)];

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.012, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 1.25);
  }

  /**
   * Footsteps - Grounded, soft shoe-on-pavement audio.
   * Modulated by walk/jog speed, silent while paused or airborne.
   */
  playFootstep(data) {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    if (globalGameState.is(GameState.PAUSED) || !globalGameState.is(GameState.PLAYING)) return;

    const isJogging = data?.isJogging || false;
    const now = this.audioCtx.currentTime;

    // 1. Soft sole contact (bandpassed low noise burst)
    const noiseLen = 0.035;
    const noiseBuffer = this.audioCtx.createBuffer(1, Math.floor(this.audioCtx.sampleRate * noiseLen), this.audioCtx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.4;
    }

    const noiseSrc = this.audioCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    const bandFilter = this.audioCtx.createBiquadFilter();
    bandFilter.type = 'bandpass';
    bandFilter.frequency.setValueAtTime(isJogging ? 1400 : 1100, now);
    bandFilter.Q.setValueAtTime(1.4, now);

    const noiseGain = this.audioCtx.createGain();
    const stepVolume = isJogging ? 0.026 : 0.018;
    noiseGain.gain.setValueAtTime(stepVolume, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseLen);

    noiseSrc.connect(bandFilter);
    bandFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noiseSrc.start(now);
    noiseSrc.stop(now + noiseLen + 0.01);

    // 2. Subtle low body weight thump
    const thump = this.audioCtx.createOscillator();
    const thumpGain = this.audioCtx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(isJogging ? 75 : 62, now);
    thump.frequency.exponentialRampToValueAtTime(32, now + 0.04);

    thumpGain.gain.setValueAtTime(0.014, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

    thump.connect(thumpGain);
    thumpGain.connect(this.masterGain);

    thump.start(now);
    thump.stop(now + 0.045);
  }

  playJumpSound() {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    if (globalGameState.is(GameState.PAUSED)) return;
    const now = this.audioCtx.currentTime;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);

    gain.gain.setValueAtTime(0.018, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  playLandSound() {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    if (globalGameState.is(GameState.PAUSED)) return;
    const now = this.audioCtx.currentTime;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(70, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.07);

    gain.gain.setValueAtTime(0.024, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  playDialogueChime() {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    const now = this.audioCtx.currentTime;

    const notes = [523.25, 659.25]; // C5, E5
    notes.forEach((freq, idx) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);

      gain.gain.setValueAtTime(0.0, now + idx * 0.05);
      gain.gain.linearRampToValueAtTime(0.025, now + idx * 0.05 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.05 + 0.32);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.35);
    });
  }

  playInteractionSound(data) {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;

    const type = data?.type || '';
    if (type === 'vending') {
      this.playVendingSound();
    } else if (type === 'postbox' || type === 'mailbox') {
      this.playMailboxSound();
    } else if (type === 'fountain') {
      this.playWaterSound();
    } else if (type === 'cat') {
      this.playPurrSound();
    } else if (type === 'bench') {
      this.playBenchSitSound();
    } else if (type === 'bicycle') {
      this.playBicycleBell();
    } else if (type === 'notice' || type === 'sign') {
      this.playNoticeSound();
    } else {
      this.playGenericInteractionChime();
    }
  }

  playVendingSound() {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    const now = this.audioCtx.currentTime;

    // 1. Soft coin clink
    const osc1 = this.audioCtx.createOscillator();
    const gain1 = this.audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(2200, now);
    osc1.frequency.exponentialRampToValueAtTime(1700, now + 0.07);
    gain1.gain.setValueAtTime(0.028, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc1.connect(gain1);
    gain1.connect(this.masterGain);
    osc1.start(now);
    osc1.stop(now + 0.09);

    // 2. Soft drink drop thud
    const osc2 = this.audioCtx.createOscillator();
    const gain2 = this.audioCtx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(140, now + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(55, now + 0.24);
    gain2.gain.setValueAtTime(0.0, now);
    gain2.gain.setValueAtTime(0.045, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc2.connect(gain2);
    gain2.connect(this.masterGain);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.3);
  }

  playMailboxSound() {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    const now = this.audioCtx.currentTime;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.07);
    gain.gain.setValueAtTime(0.028, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playWaterSound() {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    const now = this.audioCtx.currentTime;

    const freqs = [784.0, 987.77, 1174.66]; // G5, B5, D6
    freqs.forEach((freq, idx) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.1, now + idx * 0.06 + 0.08);
      gain.gain.setValueAtTime(0.0, now + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.022, now + idx * 0.06 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 0.18);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.2);
    });
  }

  playPurrSound() {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    const now = this.audioCtx.currentTime;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(70, now);
    osc.frequency.linearRampToValueAtTime(88, now + 0.2);
    osc.frequency.linearRampToValueAtTime(65, now + 0.45);

    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.026, now + 0.08);
    gain.gain.linearRampToValueAtTime(0.0001, now + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.52);
  }

  playBenchSitSound() {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    const now = this.audioCtx.currentTime;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
    gain.gain.setValueAtTime(0.022, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playBicycleBell() {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    const now = this.audioCtx.currentTime;

    // Delicate Japanese bicycle bell ping (C7 2093Hz + overtone)
    [2093.0, 4186.0].forEach((freq, idx) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.0, now);
      gain.gain.linearRampToValueAtTime(idx === 0 ? 0.025 : 0.008, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.5);
    });
  }

  playNoticeSound() {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    const now = this.audioCtx.currentTime;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5 -> G5
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.09);
    gain.gain.setValueAtTime(0.018, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playGenericInteractionChime() {
    if (!this.audioCtx || this.isMuted || !this.masterGain) return;
    const now = this.audioCtx.currentTime;

    const chords = [587.33, 880.0]; // D5, A5
    chords.forEach((freq, i) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.035);
      gain.gain.setValueAtTime(0.0, now + i * 0.035);
      gain.gain.linearRampToValueAtTime(0.03 / (i + 1), now + i * 0.035 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.035 + 0.45);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.035);
      osc.stop(now + i * 0.035 + 0.5);
    });
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setTargetAtTime(
        this.isMuted ? 0 : 0.85,
        this.audioCtx.currentTime,
        0.1
      );
    }
    globalBus.emit('audio:statusChanged', { isMuted: this.isMuted });
    return this.isMuted;
  }

  update(delta, elapsedTime) {
    if (this.isMuted || !this.isInitialized || !this.audioCtx) return;

    // Gentle slow breathing modulation on wind filter (cycles over ~14s)
    if (this.windFilter) {
      const breathingCutoff = 240 + Math.sin(elapsedTime * 0.45) * 50;
      this.windFilter.frequency.setTargetAtTime(breathingCutoff, this.audioCtx.currentTime, 0.5);
    }

    // Occasional birds in natural exterior zones
    if (elapsedTime > this.nextBirdTime && this.currentZone !== 'store') {
      this.playProceduralBird();
      let nextDelay = 7.0 + Math.random() * 8.0;
      if (this.currentZone === 'park') nextDelay = 3.2 + Math.random() * 4.0;
      else if (this.currentZone === 'main_street') nextDelay = 13.0 + Math.random() * 10.0;
      this.nextBirdTime = elapsedTime + nextDelay;
    }

    // Occasional subtle Japanese wind chime in quiet residential/park breeze
    if (elapsedTime > this.nextChimeTime && (this.currentZone === 'park' || this.currentZone === 'residential' || this.currentZone === 'apartments')) {
      this.playOccasionalWindChime();
      this.nextChimeTime = elapsedTime + 25.0 + Math.random() * 30.0;
    }
  }
}
