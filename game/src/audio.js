// All sound is synthesized live with the Web Audio API: no audio files,
// no network, just oscillators and filtered noise shaped by envelopes.
// The context is created on the first user gesture (browsers require it);
// until then every call is a silent no-op.

function makeNoiseBuffer(ctx) {
  const length = ctx.sampleRate * 0.5;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let muted = false;
  let lastShot = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      noise = makeNoiseBuffer(ctx);
    } catch {
      return false;
    }
    return true;
  }

  function tone({ type = 'sine', from = 440, to = null, dur = 0.12, vol = 0.5, delay = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function burst({ dur = 0.25, vol = 0.5, freq = 1200, delay = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, t0);
    filter.frequency.exponentialRampToValueAtTime(80, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    /** Call from any user gesture so the context is allowed to start. */
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() { return muted; },
    shoot() {
      if (!ensure()) return;
      const now = performance.now();
      if (now - lastShot < 45) return; // keep rapid fire from clipping
      lastShot = now;
      tone({ type: 'square', from: 720 + Math.random() * 120, to: 240, dur: 0.07, vol: 0.16 });
    },
    hit() {
      if (!ensure()) return;
      burst({ dur: 0.06, vol: 0.18, freq: 3200 });
    },
    explode(big = false) {
      if (!ensure()) return;
      burst({ dur: big ? 0.5 : 0.28, vol: big ? 0.6 : 0.4, freq: big ? 900 : 1600 });
      tone({ type: 'sine', from: big ? 160 : 220, to: 38, dur: big ? 0.5 : 0.3, vol: 0.5 });
    },
    shard() {
      if (!ensure()) return;
      tone({ type: 'sine', from: 1180, to: 1760, dur: 0.09, vol: 0.16 });
    },
    playerHit() {
      if (!ensure()) return;
      tone({ type: 'sawtooth', from: 220, to: 70, dur: 0.25, vol: 0.4 });
      burst({ dur: 0.2, vol: 0.3, freq: 900 });
    },
    coreHit() {
      if (!ensure()) return;
      tone({ type: 'sawtooth', from: 110, to: 55, dur: 0.35, vol: 0.45 });
      tone({ type: 'square', from: 440, to: 330, dur: 0.12, vol: 0.12, delay: 0.02 });
    },
    waveStart() {
      if (!ensure()) return;
      [523, 659, 784].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.16, vol: 0.22, delay: i * 0.07 }));
    },
    upgrade() {
      if (!ensure()) return;
      [392, 523, 659, 880].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.14, vol: 0.2, delay: i * 0.05 }));
    },
    boss() {
      if (!ensure()) return;
      tone({ type: 'sawtooth', from: 70, to: 190, dur: 0.7, vol: 0.4 });
      tone({ type: 'sawtooth', from: 105, to: 55, dur: 0.7, vol: 0.3, delay: 0.1 });
    },
    victory() {
      if (!ensure()) return;
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.28, vol: 0.24, delay: i * 0.09 }));
    },
    defeat() {
      if (!ensure()) return;
      [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.3, vol: 0.22, delay: i * 0.14 }));
    },
  };
}
