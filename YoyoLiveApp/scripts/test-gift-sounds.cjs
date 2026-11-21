const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const directory = path.join(__dirname, '..', 'assets', 'gift-sounds');
const expected = ['common.wav', 'premium.wav', 'legendary.wav', 'animal.wav', 'mega.wav'];

for (const filename of expected) {
  const file = path.join(directory, filename);
  assert.ok(fs.existsSync(file), 'Missing generated gift sound: ' + filename);
  const data = fs.readFileSync(file);
  assert.ok(data.length > 44, 'Gift sound is empty: ' + filename);
  assert.equal(data.toString('ascii', 0, 4), 'RIFF', 'Invalid RIFF header: ' + filename);
  assert.equal(data.toString('ascii', 8, 12), 'WAVE', 'Invalid WAV header: ' + filename);
  assert.equal(data.toString('ascii', 12, 16), 'fmt ', 'Missing WAV format chunk: ' + filename);
  assert.equal(data.readUInt16LE(20), 1, 'Gift sound must be PCM: ' + filename);
  assert.equal(data.readUInt16LE(22), 1, 'Gift sound must be mono: ' + filename);
  assert.equal(data.readUInt32LE(24), 22050, 'Unexpected sample rate: ' + filename);
  assert.equal(data.readUInt32LE(40), data.length - 44, 'WAV data length mismatch: ' + filename);
}

console.log('Gift sound assets passed (5 valid WAV files).');
