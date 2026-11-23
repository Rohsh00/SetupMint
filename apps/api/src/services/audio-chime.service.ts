/**
 * Audio Chime Synthesizer
 * Generates crisp, institutional 16-bit PCM WAV audio chimes entirely in memory
 * with zero external dependencies, ffmpeg, or native binaries.
 */
export class AudioChimeService {
  /**
   * Generates a RIFF WAV buffer for a given sequence of harmonic tones with smooth exponential decay.
   * @param notes Array of frequencies in Hz with start times and durations
   * @param totalDurationMs Duration of audio clip in milliseconds
   * @param sampleRate Default 22050 Hz (lightweight ~25-45KB)
   */
  static generateWav(
    notes: { freq: number; startMs: number; durationMs: number; volume?: number }[],
    totalDurationMs: number = 1400,
    sampleRate: number = 22050
  ): Buffer {
    const totalSamples = Math.floor((totalDurationMs / 1000) * sampleRate);
    const dataSize = totalSamples * 2; // 16-bit mono = 2 bytes per sample
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // fmt subchunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // subchunk1 size = 16 for PCM
    buffer.writeUInt16LE(1, 20); // audio format = 1 (PCM)
    buffer.writeUInt16LE(1, 22); // num channels = 1 (Mono)
    buffer.writeUInt32LE(sampleRate, 24); // sample rate
    buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate (sampleRate * numChannels * bitsPerSample / 8)
    buffer.writeUInt16LE(2, 32); // block align (numChannels * bitsPerSample / 8)
    buffer.writeUInt16LE(16, 34); // bits per sample = 16

    // data subchunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Synthesize samples
    for (let i = 0; i < totalSamples; i++) {
      const timeMs = (i / sampleRate) * 1000;
      let sampleVal = 0;

      for (const note of notes) {
        if (timeMs >= note.startMs && timeMs <= note.startMs + note.durationMs) {
          const noteTimeSec = (timeMs - note.startMs) / 1000;
          const noteDurationSec = note.durationMs / 1000;
          const decay = Math.exp(-3.5 * (noteTimeSec / noteDurationSec)); // Smooth exponential bell decay
          const amplitude = (note.volume ?? 0.8) * decay;
          // Sine wave with gentle 2nd harmonic overtone for institutional warmth
          const fundamental = Math.sin(2 * Math.PI * note.freq * noteTimeSec);
          const overtone = 0.25 * Math.sin(4 * Math.PI * note.freq * noteTimeSec);
          sampleVal += (fundamental + overtone) * amplitude;
        }
      }

      // Clamp to 16-bit signed integer range (-32768 to 32767)
      const clamped = Math.max(-1, Math.min(1, sampleVal));
      const int16 = Math.floor(clamped * 32767);
      buffer.writeInt16LE(int16, 44 + i * 2);
    }

    return buffer;
  }

  /**
   * Ascending Major Triad chime for Milestone Hits (+1.0R, +1.5R, +2.0R, +3.0R, +5.0R)
   */
  static getMilestoneChime(tierR: number): Buffer {
    if (tierR >= 3.0) {
      // Golden Victory chime for +3.0R and +5.0R (C5 -> E5 -> G5 -> C6 -> E6)
      return this.generateWav([
        { freq: 523.25, startMs: 0, durationMs: 350, volume: 0.6 },
        { freq: 659.25, startMs: 140, durationMs: 350, volume: 0.6 },
        { freq: 783.99, startMs: 280, durationMs: 400, volume: 0.7 },
        { freq: 1046.50, startMs: 420, durationMs: 700, volume: 0.9 },
        { freq: 1318.51, startMs: 560, durationMs: 800, volume: 0.9 },
      ], 1500);
    }

    // Classic Institutional chime for +1.0R, +1.5R, +2.0R (G5 -> C6 -> E6)
    return this.generateWav([
      { freq: 783.99, startMs: 0, durationMs: 350, volume: 0.6 },
      { freq: 1046.50, startMs: 140, durationMs: 400, volume: 0.7 },
      { freq: 1318.51, startMs: 280, durationMs: 700, volume: 0.8 },
    ], 1100);
  }

  /**
   * Price Alert Triggered: High crystal dual radar ping (C6 -> E6)
   */
  static getPriceAlertChime(): Buffer {
    return this.generateWav([
      { freq: 1046.50, startMs: 0, durationMs: 250, volume: 0.8 },
      { freq: 1318.51, startMs: 100, durationMs: 450, volume: 0.9 },
    ], 650);
  }

  /**
   * Order Execution / Scale-in: Quick electric double confirmation click
   */
  static getOrderExecutedChime(): Buffer {
    return this.generateWav([
      { freq: 800.0, startMs: 0, durationMs: 100, volume: 0.7 },
      { freq: 1200.0, startMs: 70, durationMs: 140, volume: 0.8 },
    ], 300);
  }

  /**
   * Trade Closed / Exit Receipt: Warm fifth chord resolution bell (F5 -> C6)
   */
  static getTradeClosedChime(): Buffer {
    return this.generateWav([
      { freq: 698.46, startMs: 0, durationMs: 350, volume: 0.7 },
      { freq: 1046.50, startMs: 120, durationMs: 650, volume: 0.85 },
    ], 900);
  }

  /**
   * Stop Loss Threat Alert: Urgent dual-tone siren pulse (220Hz <-> 440Hz)
   */
  static getStopThreatChime(): Buffer {
    return this.generateWav([
      { freq: 220.0, startMs: 0, durationMs: 160, volume: 0.85 },
      { freq: 440.0, startMs: 140, durationMs: 180, volume: 0.9 },
      { freq: 220.0, startMs: 300, durationMs: 160, volume: 0.85 },
      { freq: 440.0, startMs: 440, durationMs: 250, volume: 0.9 },
    ], 800);
  }

  /**
   * Profit Giveback Alert: Descending minor caution triad (A4 -> F4 -> D4)
   */
  static getGivebackChime(): Buffer {
    return this.generateWav([
      { freq: 440.0, startMs: 0, durationMs: 200, volume: 0.75 },
      { freq: 349.23, startMs: 120, durationMs: 220, volume: 0.8 },
      { freq: 293.66, startMs: 240, durationMs: 400, volume: 0.85 },
    ], 750);
  }

  /**
   * High-Impact News Flash / Macro Alert: Triple staccato brass pulse (D5 -> F#5 -> A5)
   */
  static getNewsAlertChime(): Buffer {
    return this.generateWav([
      { freq: 587.33, startMs: 0, durationMs: 150, volume: 0.75 },
      { freq: 739.99, startMs: 110, durationMs: 150, volume: 0.8 },
      { freq: 880.00, startMs: 220, durationMs: 350, volume: 0.85 },
    ], 700);
  }
}
