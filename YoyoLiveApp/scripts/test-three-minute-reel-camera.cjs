const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'ReelsScreen.js'), 'utf8');
const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const migration = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261125170000_allow_three_minute_reels.sql'), 'utf8');
const checks = [
  ['Expo camera dependency', pkg.dependencies['expo-camera'] === '~58.0.14'],
  ['Camera module configured', app.expo.plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-camera')],
  ['Camera preview and recording', source.includes('CameraView') && source.includes('recordAsync')],
  ['Three minute hard recording cap', source.includes('maxDuration: 180')],
  ['Front/back camera switch', source.includes("setCameraFacing((value) => value === 'back' ? 'front' : 'back')")],
  ['Recorded video preview before publishing', source.includes('معاينة الريل') && source.includes('publishCapturedReel')],
  ['Gallery upload accepts 180 seconds', source.includes('videoMaxDuration: 180')],
  ['Upload size guard is 50 MB', source.includes('MAX_VIDEO_BYTES = 50 * 1024 * 1024')],
  ['Database accepts 180 seconds', migration.includes('duration_seconds <= 180')],
  ['Storage and database accept 50 MB', migration.includes('52428800')],
  ['Compact reels header create action', source.includes('styles.createArrow') && source.includes('setCreatePanelOpen(true)')],
  ['My reels manager exists', source.includes('إدارة ريلزك') && source.includes('reels.filter((item) => item.user_id === userId)')],
  ['Delete action is confirmed', source.includes("Alert.alert('حذف الريل'") && source.includes("style: 'destructive'")],
];
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) process.exitCode = 1;
}
