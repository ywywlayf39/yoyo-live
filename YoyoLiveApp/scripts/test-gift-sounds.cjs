const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const keys = [
  "balloon-ping",
  "bunny-pop",
  "castle-impact",
  "cat-meow",
  "clap",
  "cosmic-portal",
  "cosmic-tiger-roar",
  "crystal-rise",
  "diamond-shimmer",
  "dragon-roar",
  "eclipse-boom",
  "emperor-lion-roar",
  "engine-rev",
  "epic-fanfare",
  "epic-lion-roar",
  "epic-tiger-roar",
  "fairy-bell",
  "galaxy-finale",
  "golden-dragon-roar",
  "heart-pop",
  "horse-gallop",
  "imperial-hit",
  "jungle-ambience",
  "lion-roar",
  "magic-purr",
  "moon-chime",
  "mystic-purr",
  "ocean-swell",
  "panther-growl",
  "planet-boom",
  "playful-meow",
  "rocket-launch",
  "romantic-chime",
  "royal-fanfare",
  "royal-hit",
  "soft-chime",
  "star-ding",
  "thunder-lion-roar",
  "tiger-roar",
  "whoosh",
  "yacht-horn",
  "yoyo-epic-stinger"
];
const directory = path.join(__dirname, '..', 'assets', 'gift-sounds');
const generator = fs.readFileSync(path.join(__dirname, 'generate-gift-sounds.cjs'), 'utf8');
const registry = fs.readFileSync(path.join(__dirname, '..', 'giftSoundPlayers.js'), 'utf8');

for (const key of keys) {
  assert.ok(generator.includes("'" + key + "'") || generator.includes('"' + key + '"'), 'Generator missing key: ' + key);
  assert.ok(registry.includes("'" + key + "'"), 'Static audio registry missing key: ' + key);
  const file = path.join(directory, key + '.wav');
  assert.ok(fs.existsSync(file), 'Missing generated gift sound: ' + key);
  const data = fs.readFileSync(file);
  assert.ok(data.length > 44, 'Gift sound is empty: ' + key);
  assert.equal(data.toString('ascii', 0, 4), 'RIFF', 'Invalid RIFF header: ' + key);
  assert.equal(data.toString('ascii', 8, 12), 'WAVE', 'Invalid WAV header: ' + key);
  assert.equal(data.readUInt16LE(20), 1, 'Gift sound must be PCM: ' + key);
  assert.equal(data.readUInt16LE(22), 1, 'Gift sound must be mono: ' + key);
  assert.equal(data.readUInt32LE(24), 22050, 'Unexpected sample rate: ' + key);
  assert.equal(data.readUInt32LE(40), data.length - 44, 'WAV data length mismatch: ' + key);
}
console.log('Gift audio checks passed (' + keys.length + ' unique sound keys).');
