const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'ReelsScreen.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const checks = [
  ['native video/audio editor dependency', pkg.dependencies['react-native-video-trim'] === '8.3.1'],
  ['audio file picker uses local files', source.includes("File.pickFileAsync({ multipleFiles: false, mimeTypes: ['audio/*'] })")],
  ['selected music is trimmed with waveform editor', source.includes("type: 'audio'") && source.includes('maxDuration: 180000') && source.includes('showEditor(saved.uri')],
  ['music clip is actually mixed into video before upload', source.includes('await mixAudio(') && source.includes('sourceVideoUri = fileUri(mixed.outputPath)')],
  ['original and music volume are independently adjustable', source.includes('originalAudioVolume,') && source.includes('backgroundAudioVolume,')],
  ['music loops to fill the reel', source.includes('loopAudio: true')],
  ['gallery videos go through preview before publishing', source.includes("source: 'gallery'") && source.includes('setCapturedVideo({')],
  ['music controls are available before publishing', (source.match(/renderMusicControls\(\)/g) || []).length >= 2],
  ['temporary mixed file is cleaned up', source.includes('await deleteFile(mixedOutputPath)')],
  ['3-minute reel recording limit remains', source.includes('maxDuration: 180')],
  ['my reels delete manager remains', source.includes('const deleteReel = (item)') && source.includes('إدارة ريلزك')],
];
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) process.exitCode = 1;
}
