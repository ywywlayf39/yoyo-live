const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, '..', 'assets', 'gift-sounds');
fs.mkdirSync(out, { recursive: true });
const rate = 22050;
const soundKeys = [
  "heart-pop",
  "soft-chime",
  "clap",
  "cat-meow",
  "star-ding",
  "fairy-bell",
  "playful-meow",
  "moon-chime",
  "bunny-pop",
  "mystic-purr",
  "whoosh",
  "tiger-roar",
  "balloon-ping",
  "romantic-chime",
  "panther-growl",
  "horse-gallop",
  "engine-rev",
  "jungle-ambience",
  "ocean-swell",
  "magic-purr",
  "crystal-rise",
  "dragon-roar",
  "diamond-shimmer",
  "lion-roar",
  "epic-tiger-roar",
  "cosmic-portal",
  "eclipse-boom",
  "epic-lion-roar",
  "epic-fanfare",
  "thunder-lion-roar",
  "cosmic-tiger-roar",
  "golden-dragon-roar",
  "emperor-lion-roar",
  "yoyo-epic-stinger",
  "royal-fanfare",
  "yacht-horn",
  "castle-impact",
  "rocket-launch",
  "imperial-hit",
  "planet-boom",
  "galaxy-finale"
];
function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}
function makeWav(key) {
  const seed = hash(key);
  const base = 260 + (seed % 720);
  const interval = [1, 1.2, 1.25, 1.333, 1.5, 1.667, 1.8, 2][(seed >>> 8) % 8];
  const freqs = [base, Math.min(1500, Math.round(base * interval)), Math.min(1800, Math.round(base * (1 + ((seed >>> 16) % 7) / 10)))];
  const duration = key.includes('roar') || key.includes('launch') || key.includes('boom') ? 1.05 : 0.68;
  const count = Math.floor(rate * duration);
  const pcm = Buffer.alloc(count * 2);
  const segment = duration / freqs.length;
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const index = Math.min(freqs.length - 1, Math.floor(t / segment));
    const local = (t % segment) / segment;
    const env = Math.max(0, Math.min(1, local * 9, (1 - local) * 4, (duration - t) * 7));
    const f = freqs[index];
    const low = key.includes('roar') || key.includes('growl') || key.includes('purr') ? 0.45 * Math.sin(2 * Math.PI * f * 0.5 * t) : 0;
    const wave = Math.sin(2 * Math.PI * f * t) + 0.16 * Math.sin(2 * Math.PI * f * 2.01 * t) + low;
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(wave * env * 6200))), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
for (const key of soundKeys) {
  const filename = key + '.wav';
  fs.writeFileSync(path.join(out, filename), makeWav(key));
}
console.log('Generated ' + soundKeys.length + ' distinct original YOYO LIVE gift sounds.');
