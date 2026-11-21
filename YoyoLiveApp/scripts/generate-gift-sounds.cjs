const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, '..', 'assets', 'gift-sounds');
fs.mkdirSync(out, { recursive: true });
const rate = 22050;
const tones = {
  common: [660, 880],
  premium: [523, 659, 784],
  legendary: [392, 587, 784, 988],
  animal: [740, 554, 740],
  mega: [220, 330, 440, 660, 880],
};
function makeWav(freqs) {
  const duration = 0.72;
  const count = Math.floor(rate * duration);
  const pcm = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const segment = duration / freqs.length;
    const index = Math.min(freqs.length - 1, Math.floor(t / segment));
    const local = (t % segment) / segment;
    const env = Math.max(0, Math.min(1, local * 12, (1 - local) * 5));
    const wave = Math.sin(2 * Math.PI * freqs[index] * t) + 0.18 * Math.sin(2 * Math.PI * freqs[index] * 2.01 * t);
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(wave * env * 6500))), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
for (const [name, notes] of Object.entries(tones)) {
  fs.writeFileSync(path.join(out, name + '.wav'), makeWav(notes));
}
console.log('Generated five original YOYO LIVE gift sounds.');
