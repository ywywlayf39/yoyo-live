const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const reels = read('ReelsScreen.js');
const music = read('LiveMusicLibrary.js');
const packages = read('PackagesScreen.js');

const checks = [
  ['creator identity is positioned as an absolute overlay above the reel', /reelOverlay:\s*\{[^}]*position:\s*'absolute'[^}]*top:\s*12/s.test(reels)],
  ['creator name is prominent', /author:\s*\{[^}]*fontSize:\s*20[^}]*fontWeight:\s*'900'/s.test(reels)],
  ['reel video fills the card without a separate identity footer', /<ReelPlayer[^>]*height=\{reelHeight\}\s*\/>/.test(reels)],
  ['audio import stores provider MIME type', /mimeType:\s*source\.mimeType\s*\|\|\s*source\.type/.test(music)],
  ['audio sharing detects MIME type and file extension', /declaredMime[\s\S]*mimeByExtension[\s\S]*supportedMimes/.test(music)],
  ['coin proof requests do not reuse a fixed transfer reference', /p_transfer_reference:\s*null/.test(packages) && !/p_transfer_reference:\s*'proof-upload'/.test(packages)],
];

for (const [name, passed] of checks) {
  console.log((passed ? 'PASS' : 'FAIL') + ' ' + name);
}
if (checks.some(([, passed]) => !passed)) process.exit(1);
