const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
const room = fs.readFileSync(path.join(root, 'LiveRoomScreen.native.js'), 'utf8');
const library = fs.readFileSync(path.join(root, 'LiveMusicLibrary.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'LiveMusicSync.js'), 'utf8');

const liveRoute = app.indexOf('if (selectedLive)');
const packagesRoute = app.indexOf('if (showPackages)');
assert.ok(liveRoute >= 0 && packagesRoute > liveRoute,
  'Live route must take priority over the standalone packages route');
const liveBlock = app.slice(liveRoute, app.indexOf('if (showReferrals)', liveRoute));
assert.ok(liveBlock.includes('<Modal') && liveBlock.includes('<PackagesScreen'),
  'Coin packages must open as a modal above the mounted LiveKit room');
assert.ok(app.includes("setInterval(refreshLiveRooms, 8000)"),
  'Live room discovery must poll as a fallback when Realtime events are missed');
assert.ok(app.includes("AppState.addEventListener('change'"),
  'Live room discovery must refresh when the app returns to the foreground');
assert.ok(app.includes("last_heartbeat_at: new Date().toISOString()"),
  'A newly created live room must be immediately eligible for the active live feed');

assert.ok(!sync.includes('if (!visible) return null'),
  'Music playback must not stop merely because the tools panel is closed');
assert.ok(library.includes('upload(storagePath, file, {'),
  'Audio upload must pass the Expo File Blob directly');
assert.ok(!library.includes('await file.bytes()'),
  'Audio upload must not allocate a full JS copy of the selected song');

const failureGuard = room.indexOf('if (endFailure)');
const closeCall = room.indexOf('onClose?.()', room.indexOf('const leaveRoom'));
assert.ok(failureGuard >= 0 && closeCall > failureGuard,
  'The live room must remain mounted when server-side end fails');
const failureSection = room.slice(failureGuard, closeCall);
assert.ok(failureSection.includes('setIsLeaving(false)'),
  'Failed room shutdown must reset the leaving overlay so the host can retry');
assert.ok(room.indexOf('await waitForRoomDisconnect()') < closeCall,
  'Host shutdown must wait for the native LiveKit disconnect before unmounting the room');
assert.ok(room.includes('markRoomDisconnected();'),
  'LiveKit disconnect callback must release the host shutdown wait');

console.log('YOYO LIVE room navigation, music memory, playback, and exit regression checks passed.');
