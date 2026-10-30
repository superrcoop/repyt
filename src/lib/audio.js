// Web Audio API Synthesizer for tactile in-game sound effects (zero external asset overhead)

class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  setMuted(muted) {
    this.muted = muted;
  }

  playTone(freq, type = 'sine', duration = 0.12, gain = 0.1, delay = 0) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    setTimeout(() => {
      try {
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gainNode.gain.setValueAtTime(gain, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {
        // Audio error silently ignored
      }
    }, delay * 1000);
  }

  correct(combo = 1) {
    // Upward pitch that gets higher with combo
    const base = 440 + Math.min(combo * 40, 400);
    this.playTone(base, 'sine', 0.1, 0.12, 0);
    this.playTone(base * 1.25, 'sine', 0.15, 0.1, 0.08);
  }

  streak() {
    // Multi-note fan-fare
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.playTone(f, 'triangle', 0.18, 0.12, i * 0.07);
    });
  }

  tick() {
    this.playTone(800, 'triangle', 0.04, 0.04);
  }

  error() {
    this.playTone(220, 'sawtooth', 0.18, 0.08, 0);
    this.playTone(180, 'sawtooth', 0.22, 0.08, 0.09);
  }

  gameOver() {
    this.playTone(330, 'sine', 0.2, 0.1, 0);
    this.playTone(293.66, 'sine', 0.2, 0.1, 0.15);
    this.playTone(261.63, 'sine', 0.4, 0.1, 0.3);
  }
}

export const sound = new SoundFX();
