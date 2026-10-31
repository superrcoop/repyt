// Web Audio API Synthesizer & Speech Synthesis Engine for Repyt × Saltwake

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

  // Word volley accepted
  correct(combo = 1) {
    const base = 440 + Math.min(combo * 35, 450);
    this.playTone(base, 'sine', 0.1, 0.12, 0);
    this.playTone(base * 1.25, 'sine', 0.14, 0.1, 0.07);
  }

  // Pirate gold doubloon collection chime
  coin() {
    this.playTone(1760, 'sine', 0.08, 0.14, 0);
    this.playTone(2637, 'triangle', 0.15, 0.12, 0.06);
  }

  // Milestone streak fanfare
  streak() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.playTone(f, 'triangle', 0.2, 0.14, i * 0.07);
    });
  }

  // Ship's bell toll for voyage start
  shipBell() {
    this.playTone(880, 'sine', 0.8, 0.18, 0);
    this.playTone(1760, 'sine', 0.5, 0.09, 0.02);
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

  // Speech Synthesis for pronunciation & teaching
  speakWord(text, onEnd) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel(); // cancel any active speech
      const clean = (text || '').trim();
      if (!clean) return;

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 0.9; // Clear, pedagogical pace
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      if (onEnd) {
        utterance.onend = onEnd;
        utterance.onerror = onEnd;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
      if (onEnd) onEnd();
    }
  }
}

export const sound = new SoundFX();
