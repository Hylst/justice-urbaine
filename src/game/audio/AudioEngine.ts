import type { MusicConfig } from '../constants';

type DrumStep = { kick: boolean; snare: boolean; hat: boolean; openHat: boolean };

/**
 * Procedural audio engine: synthesizes all SFX and a looping
 * synthwave soundtrack using the Web Audio API (no external files).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuffer!: AudioBuffer;

  private musicEnabled = true;
  private sfxEnabled = true;

  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private cfg: MusicConfig = { tempo: 112, root: 45, scale: [0, 2, 3, 5, 7, 8, 10] };

  // Precomputed 4-bar (64 sixteenth) sequences
  private bassSeq: (number | null)[] = [];
  private leadSeq: (number | null)[] = [];
  private padSeq: (number[] | null)[] = [];
  private drumSeq: DrumStep[] = [];
  private stepDur = 0.125; // seconds per 16th

  private started = false;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicEnabled ? 0.5 : 0;
      this.musicBus.connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxEnabled ? 0.9 : 0;
      this.sfxBus.connect(this.master);

      // White-noise buffer for drums & impacts
      const len = this.ctx.sampleRate * 1;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      this.ctx = null;
    }
  }

  get isReady() {
    return !!this.ctx;
  }

  // ---------- MUSIC ----------
  setMusic(cfg: MusicConfig) {
    this.cfg = cfg;
    this.buildSequences();
    if (this.started && !this.musicTimer) this.startScheduler();
  }

  private buildSequences() {
    const { scale, root } = this.cfg;
    const scaleLen = scale.length;
    const degToMidi = (deg: number, octave: number) =>
      root + scale[((deg % scaleLen) + scaleLen) % scaleLen] + 12 * octave;

    // 4-bar chord roots (scale degrees) — a moody i - VI - III - VII-ish movement
    const progression = [0, 5, 2, 6];
    // syncopated bass hits within a bar (16 steps)
    const bassHits = [0, 3, 6, 8, 11, 14];

    this.bassSeq = [];
    this.drumSeq = [];
    this.padSeq = new Array(64).fill(null);
    for (let bar = 0; bar < 4; bar++) {
      const chordRoot = progression[bar];
      // chord tones for the pad (root, third-ish, fifth-ish) in the current octave
      const chordTones = [degToMidi(chordRoot, 0), degToMidi(chordRoot + 2, 0), degToMidi(chordRoot + 4, 0)];
      for (let s = 0; s < 16; s++) {
        const gi = bar * 16 + s;
        this.bassSeq[gi] = bassHits.includes(s) ? degToMidi(chordRoot, -1) : null;

        // Groovier drum pattern with open-hat accents & ghost kicks
        const kick = s === 0 || s === 6 || s === 8 || s === 10 || (bar % 2 === 1 && s === 14);
        const snare = s === 4 || s === 12;
        const hat = s % 2 === 0;
        const openHat = (s === 2 || s === 10) && bar % 2 === 1;
        this.drumSeq[gi] = { kick, snare, hat, openHat };
        // Pad sustains from the start of each bar
        if (s === 0) this.padSeq[gi] = chordTones;
      }
    }

    // Lead arpeggio over 4 bars (32 eighth notes = 64 sixteenths, hit on every 2nd)
    const leadDegrees = [
      0, 4, 7, 4, 2, 4, 7, 9, 0, 4, 7, 4, 5, 4, 2, 0,
      5, 9, 12, 9, 7, 9, 12, 14, 6, 9, 12, 9, 7, 5, 4, 2,
    ];
    this.leadSeq = new Array(64).fill(null);
    for (let i = 0; i < leadDegrees.length; i++) {
      this.leadSeq[i * 2] = degToMidi(leadDegrees[i], 1);
    }

    this.stepDur = 60 / this.cfg.tempo / 4; // 16th note duration
  }

  startMusic() {
    if (!this.ctx || this.started) return;
    this.started = true;
    this.buildSequences();
    this.startScheduler();
  }

  stopMusic() {
    this.started = false;
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private startScheduler() {
    if (!this.ctx) return;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    this.step = 0;
    this.scheduler();
  }

  private scheduler = () => {
    if (!this.ctx || !this.started) return;
    const lookahead = 0.12;
    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      this.scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += this.stepDur;
      this.step = (this.step + 1) % 64;
    }
    this.musicTimer = window.setTimeout(this.scheduler, 25);
  };

  private scheduleStep(step: number, time: number) {
    const drum = this.drumSeq[step];
    if (drum.kick) this.synthKick(time);
    if (drum.snare) this.synthSnare(time);
    if (drum.openHat) this.synthOpenHat(time);
    else if (drum.hat) this.synthHat(time, step % 4 === 2 ? 0.18 : 0.1);

    const bass = this.bassSeq[step];
    if (bass !== null) this.synthBass(midiToFreq(bass), time, this.stepDur * 1.6);

    // Sustained pad chord — one whole bar long
    const pad = this.padSeq[step];
    if (pad !== null) this.synthPad(pad.map(midiToFreq), time, this.stepDur * 15);

    const lead = this.leadSeq[step];
    if (lead !== null) this.synthLead(midiToFreq(lead), time, this.stepDur * 1.8);
  }

  private midiToFreqCached = midiToFreq;

  // ---------- SYNTH VOICES ----------
  private synthKick(t: number) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.2);
  }

  private synthSnare(t: number) {
    if (!this.ctx) return;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    n.connect(hp).connect(g).connect(this.musicBus);
    n.start(t);
    n.stop(t + 0.16);
  }

  private synthHat(t: number, vol: number) {
    if (!this.ctx) return;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(hp).connect(g).connect(this.musicBus);
    n.start(t);
    n.stop(t + 0.06);
  }

  private synthOpenHat(t: number) {
    if (!this.ctx) return;
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    n.connect(hp).connect(g).connect(this.musicBus);
    n.start(t);
    n.stop(t + 0.2);
  }

  // Sustained evolving pad chord for atmosphere.
  private synthPad(freqs: number[], t: number, dur: number) {
    if (!this.ctx) return;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    // Slow filter sweep gives the pad a breathing, evolving quality.
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(1600, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(600, t + dur);
    lp.Q.value = 3;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + dur * 0.25);
    g.gain.setValueAtTime(0.09, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // Subtle slow detune LFO via two slightly detuned saws per note
    for (const f of freqs) {
      for (const det of [-7, 7]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
    lp.connect(g).connect(this.musicBus);
  }

  private synthBass(freq: number, t: number, dur: number) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o2.type = 'square';
    o.frequency.value = freq;
    o2.frequency.value = freq / 2;
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    lp.Q.value = 6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(this.musicBus);
    o.start(t); o2.start(t);
    o.stop(t + dur); o2.stop(t + dur);
  }

  private synthLead(freq: number, t: number, dur: number) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const dly = this.ctx.createDelay();
    const fb = this.ctx.createGain();
    o.type = 'square';
    o2.type = 'triangle';
    o.frequency.value = freq;
    o2.frequency.value = freq * 1.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    dly.delayTime.value = this.stepDur;
    fb.gain.value = 0.28;
    o.connect(g);
    o2.connect(g);
    g.connect(this.musicBus);
    g.connect(dly);
    dly.connect(fb).connect(dly);
    dly.connect(this.musicBus);
    o.start(t); o2.start(t);
    o.stop(t + dur); o2.stop(t + dur);
  }

  // ---------- SFX ----------
  private now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private burst(opts: {
    type: OscillatorType; freq: number; freqEnd: number; dur: number; vol: number;
    filter?: 'lowpass' | 'highpass' | 'bandpass'; filterFreq?: number; bus?: GainNode;
  }) {
    if (!this.ctx) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = opts.type;
    o.frequency.setValueAtTime(opts.freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t + opts.dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    let node: AudioNode = o;
    if (opts.filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = opts.filter;
      f.frequency.value = opts.filterFreq ?? 1000;
      node.connect(f);
      node = f;
    }
    node.connect(g).connect(opts.bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + opts.dur + 0.02);
  }

  private noiseBurst(opts: { dur: number; vol: number; type: 'lowpass' | 'highpass' | 'bandpass'; freq: number; q?: number; sweepTo?: number }) {
    if (!this.ctx) return;
    const t = this.now();
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = opts.type;
    f.frequency.setValueAtTime(opts.freq, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + opts.dur);
    f.Q.value = opts.q ?? 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(opts.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    n.connect(f).connect(g).connect(this.sfxBus);
    n.start(t);
    n.stop(t + opts.dur + 0.02);
  }

  sfxSwing() {
    this.noiseBurst({ dur: 0.14, vol: 0.25, type: 'bandpass', freq: 1800, q: 0.8, sweepTo: 600 });
  }

  sfxHeavySwing() {
    this.noiseBurst({ dur: 0.24, vol: 0.38, type: 'bandpass', freq: 1200, q: 0.6, sweepTo: 400 });
    this.burst({ type: 'sine', freq: 140, freqEnd: 60, dur: 0.1, vol: 0.2 });
  }

  sfxUppercut() {
    this.noiseBurst({ dur: 0.18, vol: 0.32, type: 'bandpass', freq: 900, q: 1.2, sweepTo: 1600 });
    this.burst({ type: 'square', freq: 200, freqEnd: 400, dur: 0.12, vol: 0.2 });
  }

  sfxShoot(type: 'pistol' | 'grenade' | 'knife') {
    if (type === 'pistol') {
      this.burst({ type: 'square', freq: 680, freqEnd: 120, dur: 0.1, vol: 0.45 });
      this.noiseBurst({ dur: 0.08, vol: 0.35, type: 'lowpass', freq: 3200 });
    } else if (type === 'grenade') {
      this.burst({ type: 'triangle', freq: 200, freqEnd: 80, dur: 0.18, vol: 0.35 });
      this.noiseBurst({ dur: 0.14, vol: 0.3, type: 'bandpass', freq: 800, q: 0.8 });
    } else {
      this.burst({ type: 'sine', freq: 1800, freqEnd: 800, dur: 0.12, vol: 0.25 });
      this.noiseBurst({ dur: 0.08, vol: 0.2, type: 'highpass', freq: 4000 });
    }
  }

  sfxSwitch() {
    this.burst({ type: 'triangle', freq: 500, freqEnd: 800, dur: 0.08, vol: 0.2 });
  }

  sfxExplosion() {
    // Big boom: sub drop + noise crash + ringing
    this.burst({ type: 'sine', freq: 160, freqEnd: 36, dur: 0.55, vol: 0.7 });
    this.burst({ type: 'triangle', freq: 90, freqEnd: 30, dur: 0.5, vol: 0.4 });
    this.noiseBurst({ dur: 0.5, vol: 0.6, type: 'lowpass', freq: 1800, sweepTo: 300, q: 1.2 });
    this.noiseBurst({ dur: 0.18, vol: 0.4, type: 'bandpass', freq: 2200, q: 0.6 });
  }

  sfxGrenadeThrow() {
    this.burst({ type: 'triangle', freq: 300, freqEnd: 520, dur: 0.1, vol: 0.2 });
  }

  sfxGrenadeBounce() {
    this.noiseBurst({ dur: 0.05, vol: 0.15, type: 'bandpass', freq: 600, q: 2 });
  }

  sfxHit(strength = 1) {
    // thump + impact crunch
    this.burst({ type: 'sine', freq: 220, freqEnd: 60, dur: 0.16, vol: 0.5 * strength });
    this.noiseBurst({ dur: 0.1, vol: 0.4 * strength, type: 'lowpass', freq: 2600 });
  }

  sfxBlock() {
    this.burst({ type: 'square', freq: 320, freqEnd: 180, dur: 0.08, vol: 0.25 });
  }

  sfxEnemyHurt() {
    this.burst({ type: 'square', freq: 420, freqEnd: 160, dur: 0.12, vol: 0.28 });
  }

  sfxEnemyDeath() {
    this.burst({ type: 'sawtooth', freq: 380, freqEnd: 50, dur: 0.4, vol: 0.35 });
    this.noiseBurst({ dur: 0.3, vol: 0.3, type: 'lowpass', freq: 1800 });
  }

  sfxPlayerHurt() {
    this.burst({ type: 'sawtooth', freq: 200, freqEnd: 70, dur: 0.3, vol: 0.4 });
  }

  sfxPickup() {
    const base = this.now();
    [0, 0.07, 0.14].forEach((d, i) => {
      if (!this.ctx) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 440 * Math.pow(1.26, i);
      g.gain.setValueAtTime(0.0001, base + d);
      g.gain.exponentialRampToValueAtTime(0.3, base + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, base + d + 0.12);
      o.connect(g).connect(this.sfxBus);
      o.start(base + d);
      o.stop(base + d + 0.14);
    });
  }

  sfxCombo(n: number) {
    const f = 500 + Math.min(n, 12) * 60;
    this.burst({ type: 'square', freq: f, freqEnd: f * 1.4, dur: 0.07, vol: 0.18 });
  }

  sfxLevelClear() {
    const base = this.now();
    [0, 5, 7, 12].forEach((deg, i) => {
      if (!this.ctx) return;
      const midi = 60 + [0, 4, 7, 12][i];
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = midiToFreq(midi);
      g.gain.setValueAtTime(0.0001, base + deg * 0.09);
      g.gain.exponentialRampToValueAtTime(0.32, base + deg * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, base + deg * 0.09 + 0.4);
      o.connect(g).connect(this.sfxBus);
      o.start(base + deg * 0.09);
      o.stop(base + deg * 0.09 + 0.42);
    });
    void this.midiToFreqCached;
  }

  sfxGameOver() {
    const base = this.now();
    [0, 3, 7, 12].forEach((i, idx) => {
      if (!this.ctx) return;
      const midi = 50 - idx * 2;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = midiToFreq(midi);
      g.gain.setValueAtTime(0.0001, base + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.3, base + i * 0.18 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, base + i * 0.18 + 0.5);
      o.connect(g).connect(this.sfxBus);
      o.start(base + i * 0.18);
      o.stop(base + i * 0.18 + 0.52);
    });
  }

  sfxVictory() {
    const base = this.now();
    const seq = [0, 4, 7, 12, 16, 12, 7, 16];
    seq.forEach((midi, i) => {
      if (!this.ctx) return;
      const o = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o2.type = 'triangle';
      o.frequency.value = midiToFreq(60 + midi);
      o2.frequency.value = midiToFreq(60 + midi) * 1.005;
      g.gain.setValueAtTime(0.0001, base + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.26, base + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, base + i * 0.12 + 0.3);
      o.connect(g); o2.connect(g);
      g.connect(this.sfxBus);
      o.start(base + i * 0.12); o2.start(base + i * 0.12);
      o.stop(base + i * 0.12 + 0.32); o2.stop(base + i * 0.12 + 0.32);
    });
  }

  // ---------- TOGGLES ----------
  setMusicEnabled(on: boolean) {
    this.musicEnabled = on;
    if (this.musicBus) this.musicBus.gain.value = on ? 0.5 : 0;
  }
  setSfxEnabled(on: boolean) {
    this.sfxEnabled = on;
    if (this.sfxBus) this.sfxBus.gain.value = on ? 0.9 : 0;
  }
  get musicOn() { return this.musicEnabled; }
  get sfxOn() { return this.sfxEnabled; }

  destroy() {
    this.stopMusic();
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  }
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
