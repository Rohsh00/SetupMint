/**
 * SetupMint Web Audio API Sound Engine
 * Synthesizes crisp, professional trading chimes and alert cues directly
 * using the HTML5 Web Audio API. 100% self-contained with zero external asset dependencies.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export const soundEngine = {
  isEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('tv_sound_enabled') !== 'false';
  },

  setEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('tv_sound_enabled', enabled ? 'true' : 'false');
  },

  /**
   * Target Hit Chime: Rising arpeggio (C5 -> E5 -> G5 -> C6)
   * High-energy positive chime signaling target reach.
   */
  playTargetHit(): void {
    if (!this.isEnabled()) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    const startTime = ctx.currentTime;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime + i * 0.08);

      gain.gain.setValueAtTime(0.001, startTime + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.18, startTime + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + i * 0.08 + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime + i * 0.08);
      osc.stop(startTime + i * 0.08 + 0.3);
    });
  },

  /**
   * Stop Loss Threat Alert: Urgent dual-tone pulse (440Hz -> 880Hz)
   */
  playStopThreat(): void {
    if (!this.isEnabled()) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const startTime = ctx.currentTime;
    [440, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime + idx * 0.12);

      gain.gain.setValueAtTime(0.001, startTime + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.22, startTime + idx * 0.12 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + idx * 0.12 + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime + idx * 0.12);
      osc.stop(startTime + idx * 0.12 + 0.22);
    });
  },

  /**
   * Giveback Threat Alert: Descending caution sequence (G4 -> E4 -> C4)
   */
  playGivebackAlert(): void {
    if (!this.isEnabled()) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [392.0, 329.63, 261.63]; // G4, E4, C4
    const startTime = ctx.currentTime;

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime + i * 0.1);

      gain.gain.setValueAtTime(0.001, startTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.12, startTime + i * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + i * 0.1 + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime + i * 0.1);
      osc.stop(startTime + i * 0.1 + 0.28);
    });
  },

  /**
   * Auto-Executed Notification: Quick electric double confirmation beep
   */
  playAutoExecuted(): void {
    if (!this.isEnabled()) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const startTime = ctx.currentTime;
    [800, 1200].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime + i * 0.07);

      gain.gain.setValueAtTime(0.001, startTime + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.2, startTime + i * 0.07 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + i * 0.07 + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime + i * 0.07);
      osc.stop(startTime + i * 0.07 + 0.15);
    });
  },

  /**
   * Kill Switch Activation: Heavy dual bass pulse
   */
  playKillSwitch(): void {
    if (!this.isEnabled()) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const startTime = ctx.currentTime;
    [180, 130].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, startTime + i * 0.15);

      gain.gain.setValueAtTime(0.001, startTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.25, startTime + i * 0.15 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + i * 0.15 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime + i * 0.15);
      osc.stop(startTime + i * 0.15 + 0.35);
    });
  },
};

