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
const animationKeys = ["balloon-rise","black-cat-moon","black-king-throne","black-panther-smoke","bunny-hop","butterfly-flight","clap-burst","cosmic-eclipse","crystal-castle","cute-cat-bounce","diamond-fall","diamond-galaxy-tiger","double-heart","dream-car","emperor-throne","galaxy-gate","galaxy-rocket","golden-horse","golden-throne-dragon","golden-yoyo-planet","heart-pulse","jungle-emperor-throne","legendary-tiger-storm","light-dragon","lion-king-roar","magic-cat-aura","mega-galaxy-dragon","meteor-trail","moon-drift","pearl-yacht","playful-cat-yarn","rose-bloom","royal-castle","royal-crown","royal-throne","royal-tiger-leap","ruby-yacht","star-sparkle","storm-lion-royal-entry","tiger-family-entrance","white-tiger-leap","yoyo-eternal-galaxy","yoyo-legendary-galaxy"];
const giftPanel = fs.readFileSync(path.join(__dirname, '..', 'LiveGiftPanel.js'), 'utf8');
for (const key of animationKeys) {
  assert.ok(giftPanel.includes("'" + key + "': {"), 'Missing gift animation preset: ' + key);
}
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
console.log('Gift audio/effect checks passed (' + keys.length + ' sound keys, ' + animationKeys.length + ' animation keys).');
