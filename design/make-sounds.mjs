// Generates the completion chimes. Run: node design/make-sounds.mjs
// Output: design/sounds/*.wav (and .mp3 via ffmpeg in the release step).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "sounds");
mkdirSync(OUT, { recursive: true });

const TAU = Math.PI * 2;
const DEFAULT_RATIOS = [1, 2.001, 3.004, 4.009];
const SOFT_PARTIALS = [1, 0.16, 0.05, 0.02];

function bell(samples, { freq, at, gain = 1, decay = 0.9, attack = 0.03, partials = SOFT_PARTIALS, ratios = DEFAULT_RATIOS }) {
  const start = Math.floor(at * RATE);
  const length = Math.floor(decay * 5 * RATE);
  for (let i = 0; i < length; i += 1) {
    const index = start + i;
    if (index >= samples.length) break;
    const t = i / RATE;
    const envelope = (1 - Math.exp(-t / attack)) * Math.exp(-t / decay);
    let value = 0;
    for (let p = 0; p < ratios.length; p += 1) {
      const fade = Math.exp(-t * p * 0.65);
      value += Math.sin(TAU * freq * ratios[p] * t) * partials[p] * fade;
    }
    samples[index] += value * envelope * gain;
  }
}

// Gentle one-pole low-pass, applied twice: removes metallic brightness.
function lowpass(samples, cutoff) {
  const alpha = 1 - Math.exp((-TAU * cutoff) / RATE);
  for (let pass = 0; pass < 2; pass += 1) {
    let state = 0;
    for (let i = 0; i < samples.length; i += 1) {
      state += alpha * (samples[i] - state);
      samples[i] = state;
    }
  }
}

function echo(samples, { delay = 0.2, gain = 0.18, taps = 2 } = {}) {
  const offset = Math.floor(delay * RATE);
  const source = samples.slice();
  for (let tap = 1; tap <= taps; tap += 1) {
    const shift = offset * tap;
    const level = Math.pow(gain, tap);
    for (let i = shift; i < samples.length; i += 1) samples[i] += source[i - shift] * level;
  }
}

function normalize(samples, peak = 0.55) {
  let max = 0;
  for (const value of samples) max = Math.max(max, Math.abs(value));
  const scale = max > 0 ? peak / max : 1;
  for (let i = 0; i < samples.length; i += 1) samples[i] *= scale;
  const tail = Math.min(Math.floor(0.05 * RATE), samples.length);
  for (let i = 0; i < tail; i += 1) samples[samples.length - 1 - i] *= i / tail;
}

function render(length, notes, { cutoff = 1400, peak = 0.55, echoOptions } = {}) {
  const samples = new Float64Array(Math.floor(length * RATE));
  for (const note of notes) bell(samples, note);
  lowpass(samples, cutoff);
  echo(samples, echoOptions || {});
  normalize(samples, peak);
  return samples;
}

function wav(samples) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + samples.length * 2, 4);
  data.write("WAVE", 8);
  data.write("fmt ", 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return data;
}

const variants = {
  // Two low notes a fifth apart: the softest "done" cue.
  "deep-fifth": render(2.6, [
    { freq: 220.0, at: 0.0, gain: 1.0, decay: 1.0, attack: 0.04 },
    { freq: 329.63, at: 0.16, gain: 0.8, decay: 1.05, attack: 0.04 },
  ], { cutoff: 1100, peak: 0.5, echoOptions: { delay: 0.22, gain: 0.16, taps: 2 } }),
  // Low major chord, rolled gently: warmer and a bit more noticeable.
  "deep-chord": render(3.2, [
    { freq: 261.63, at: 0.0, gain: 1.0, decay: 1.3, attack: 0.05 },
    { freq: 329.63, at: 0.09, gain: 0.85, decay: 1.25, attack: 0.05 },
    { freq: 392.0, at: 0.18, gain: 0.7, decay: 1.2, attack: 0.05 },
  ], { cutoff: 1000, peak: 0.52, echoOptions: { delay: 0.26, gain: 0.15, taps: 2 } }),
  // One quiet low hit with a sub octave.
  "deep-single": render(2.4, [
    { freq: 261.63, at: 0.0, gain: 0.9, decay: 1.4, attack: 0.06, ratios: [0.5, 1, 2.001, 3.004], partials: [0.28, 1, 0.14, 0.04] },
  ], { cutoff: 900, peak: 0.5, echoOptions: { delay: 0.24, gain: 0.14, taps: 2 } }),
};

for (const [name, samples] of Object.entries(variants)) writeFileSync(join(OUT, name + ".wav"), wav(samples));

// One preview: all three in order, separated by a short rest.
const gap = Math.floor(0.6 * RATE);
const total = Object.values(variants).reduce((sum, samples) => sum + samples.length + gap, 0) - gap;
const preview = new Float64Array(total);
let cursor = 0;
for (const samples of Object.values(variants)) {
  preview.set(samples, cursor);
  cursor += samples.length + gap;
}
writeFileSync(join(OUT, "preview.wav"), wav(preview));
console.log("Wrote", Object.keys(variants).join(", "), "and preview.wav to", OUT);