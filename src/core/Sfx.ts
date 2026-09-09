/**
 * Small synthesised sounds for the garden. Everything is made on the fly with Web Audio -
 * no files to load, nothing to license - and kept short and quiet: a cue that something
 * happened, never a jingle. Silent anywhere without an AudioContext (tests, old browsers).
 */

export type SfxName =
  | 'good'    // a pour landed right, a row weeded clean
  | 'prize'   // a prize crop brought in
  | 'dull'    // not enough water
  | 'splash'  // too much water
  | 'pull'    // a weed out by the root
  | 'snap'    // a stalk broken off
  | 'tear'    // a leaf torn from the crop
  | 'pluck'   // a piece picked clean
  | 'bruise'  // a piece grabbed too soon, or a root snapped
  | 'dig'     // soil turned over
  | 'sow'     // seed scattered
  | 'tick';   // a card or menu opening

const STORE_KEY = 'wildflower-ridge:sound';

class SoundBank {
  private on = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private pour: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  constructor() {
    try {
      this.on = localStorage.getItem(STORE_KEY) !== 'off';
    } catch {
      /* storage is optional */
    }
  }

  get enabled(): boolean {
    return this.on;
  }

  set enabled(value: boolean) {
    this.on = value;
    if (!value) this.stopPour();
    try {
      localStorage.setItem(STORE_KEY, value ? 'on' : 'off');
    } catch {
      /* storage is optional */
    }
  }

  play(name: SfxName): void {
    const a = this.audio();
    if (!a) return;
    const t = a.ctx.currentTime;
    switch (name) {
      case 'good':
        this.tone(660, t, 0.16, 0.35, 'sine');
        this.tone(880, t + 0.09, 0.2, 0.3, 'sine');
        break;
      case 'prize':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.11, 0.26, 0.28, 'triangle'));
        break;
      case 'dull':
        this.burst(t, 0.14, 'lowpass', 320, 0.4);
        this.tone(110, t, 0.16, 0.25, 'sine', 70);
        break;
      case 'splash':
        this.burst(t, 0.38, 'lowpass', 1800, 0.45, 380);
        this.burst(t + 0.05, 0.25, 'bandpass', 600, 0.25);
        break;
      case 'pull':
        this.burst(t, 0.16, 'bandpass', 900, 0.4);
        this.tone(170, t, 0.13, 0.3, 'triangle', 80);
        break;
      case 'snap':
        this.burst(t, 0.045, 'highpass', 2600, 0.5);
        break;
      case 'tear':
        this.burst(t, 0.22, 'bandpass', 1400, 0.32);
        this.tone(105, t, 0.2, 0.14, 'sawtooth', 85);
        break;
      case 'pluck':
        this.tone(560, t, 0.11, 0.42, 'sine', 320);
        break;
      case 'bruise':
        this.burst(t, 0.15, 'lowpass', 220, 0.4);
        this.tone(85, t, 0.2, 0.35, 'sine', 55);
        break;
      case 'dig':
        this.burst(t, 0.2, 'lowpass', 520, 0.5);
        this.tone(60, t, 0.14, 0.3, 'sine', 40);
        break;
      case 'sow':
        [0, 0.06, 0.13].forEach((d) => this.burst(t + d, 0.022, 'highpass', 4200, 0.28));
        break;
      case 'tick':
        this.burst(t, 0.016, 'highpass', 3200, 0.22);
        break;
    }
  }

  /** Water running from the bucket. Keeps going until stopPour(). */
  startPour(): void {
    const a = this.audio();
    if (!a || this.pour) return;
    const src = a.ctx.createBufferSource();
    src.buffer = this.noise!;
    src.loop = true;
    const filter = a.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 0.7;
    const gain = a.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, a.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, a.ctx.currentTime + 0.08);
    // A slow wobble so it sounds like water moving rather than a hiss held still.
    const lfo = a.ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lfoGain = a.ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();
    src.connect(filter).connect(gain).connect(a.master);
    src.start();
    this.pour = { src, gain };
  }

  stopPour(): void {
    if (!this.pour || !this.ctx) return;
    const { src, gain } = this.pour;
    this.pour = null;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.stop(t + 0.14);
  }

  // ---------------------------------------------------------------------------

  private audio(): { ctx: AudioContext; master: GainNode } | null {
    if (!this.on) return null;
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(this.ctx.destination);
      // One second of white noise, reused for every burst and for the pour.
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    // Browsers keep audio locked until the page has been interacted with; the game only
    // ever plays a sound after a key or click, so resuming here is allowed.
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return { ctx: this.ctx, master: this.master! };
  }

  /** A single note with a quick attack and an exponential tail; `slideTo` bends the pitch. */
  private tone(freq: number, at: number, dur: number, gain: number, type: OscillatorType, slideTo?: number): void {
    const { ctx, master } = this.audio()!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /** A puff of filtered noise; `sweepTo` slides the filter for a splash or a thud. */
  private burst(at: number, dur: number, type: BiquadFilterType, freq: number, gain: number, sweepTo?: number): void {
    const { ctx, master } = this.audio()!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, at);
    if (sweepTo !== undefined) filter.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  }
}

export const Sfx = new SoundBank();
