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

console.log('YOYO LIVE room navigation, music memory, playback, and exit regression checks passed.');
