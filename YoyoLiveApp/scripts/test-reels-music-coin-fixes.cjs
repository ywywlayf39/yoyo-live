const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const reels = read('ReelsScreen.js');
const music = read('LiveMusicLibrary.js');
const packages = read('PackagesScreen.js');

const checks = [
  ['creator identity card sits inside the reel at the bottom', /reelOverlay:\s*\{[^}]*position:\s*'absolute'[^}]*bottom:\s*18/s.test(reels)],
  ['each reel uses the measured full feed viewport height', /const \[feedHeight, setFeedHeight\] = useState\(0\)/.test(reels) && /onLayout=\{\(event\) =>/.test(reels)],
  ['like and comment actions stay above the Android navigation area', /sideActions:\s*\{[^}]*bottom:\s*38/s.test(reels)],
  ['progress bar is full width directly below the video', /progressTrack:\s*\{[^}]*width:\s*'100%'[^}]*height:\s*4/s.test(reels)],
  ['top header actions use fixed spacing', /header:\s*\{[^}]*justifyContent:\s*'space-between'[^}]*gap:\s*12/s.test(reels)],
  ['delete remains available from the three-dot menu and My Reels', /setDeleteMenuId\(\(current\) => current === item\.id/.test(reels) && /onPress=\{\(\) => deleteReel\(item\)\}/.test(reels)],
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
