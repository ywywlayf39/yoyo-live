const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname + '/..';
const library = fs.readFileSync(path.join(root, 'LiveMusicLibrary.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'LiveMusicSync.js'), 'utf8');
const room = fs.readFileSync(path.join(root, 'LiveRoomScreen.native.js'), 'utf8');

assert.ok(library.includes('await file.bytes()'), 'Native file bytes must be read through Expo FileSystem');
assert.ok(library.includes('bytes.buffer.slice'), 'Storage upload must use an ArrayBuffer in React Native');
assert.ok(library.includes("from('live-music').upload"), 'Host must upload shared audio to the private bucket');
assert.ok(library.includes("rpc('yoyo_live_music_control'"), 'Host must publish playback state through the server RPC');
assert.ok(library.includes('20 * 1024 * 1024'), 'Shared audio upload must enforce the 20 MB cap');
assert.ok(sync.includes("createSignedUrl(sharedMusic.storage_path, 7200)"), 'Viewers must receive time-limited signed URLs');
assert.ok(sync.includes('createAudioPlayer(data.signedUrl'), 'Viewers must play the shared audio source locally');
assert.ok(sync.includes('player.seekTo(target)'), 'Playback must seek to the server-clock offset for synchronization');
for (const action of ['pause', 'resume', 'stop']) {
  assert.ok(sync.includes("control('" + action + "')"), 'Missing host shared-music action: ' + action);
}
assert.ok(room.includes('<LiveMusicSync') && room.includes('isHost={isHost}'), 'Shared music sync must run for hosts and viewers');
assert.ok(room.includes('<LiveMusicLibrary roomName={roomName} userId={userId} />'), 'Host library must receive room and user context');
assert.ok(room.includes("p_action: 'stop'"), 'Shared music must stop when the host ends the room');

console.log('YOYO shared music static checks passed.');
