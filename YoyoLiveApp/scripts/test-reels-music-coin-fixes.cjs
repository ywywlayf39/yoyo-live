const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const reels = read('ReelsScreen.js');
const music = read('LiveMusicLibrary.js');
const packages = read('PackagesScreen.js');

const checks = [
  ['creator identity card sits inside the reel above the Android navigation area', /reelOverlay:\s*\{[^}]*position:\s*'absolute'[^}]*bottom:\s*24/s.test(reels)],
  ['each reel uses the measured full feed viewport height', /const \[feedHeight, setFeedHeight\] = useState\(0\)/.test(reels) && /onLayout=\{\(event\) =>/.test(reels)],
  ['like and comment actions are spaced well above the identity card and Android navigation', /sideActions:\s*\{[^}]*bottom:\s*142/s.test(reels) && /reelOverlay:\s*\{[^}]*bottom:\s*24[^}]*right:\s*104/s.test(reels)],
  ['Android safe-area inset is reserved below the reels viewport', /useSafeAreaInsets/.test(reels) && /paddingBottom:\s*Math\.max\(insets\.bottom,\s*26\)/.test(reels)],
  ['playback and volume controls have full-size touch targets above the bottom card', /playerControls:\s*\{[^}]*bottom:\s*112/s.test(reels) && /playerControl:\s*\{[^}]*width:\s*46[^}]*height:\s*46/s.test(reels)],
  ['username and date are rendered left-to-right and readable', /metaHandle:[^\n]*writingDirection:\s*'ltr'/.test(reels) && /metaDate:[^\n]*toLocaleDateString/.test(reels) === false && /toLocaleDateString\('en-GB'\)/.test(reels)],
  ['reel video shows its complete frame without bottom cropping', /contentFit="contain"/.test(reels)],
  ['back arrow points in the expected navigation direction and header has no overlapping star', /→ رجوع/.test(reels) && /YOYO REELS<\/Text>/.test(reels)],
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
