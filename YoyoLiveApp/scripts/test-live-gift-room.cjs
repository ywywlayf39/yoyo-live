const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const panel = fs.readFileSync(path.join(root, 'LiveGiftPanel.js'), 'utf8');
const room = fs.readFileSync(path.join(root, 'LiveRoomScreen.native.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, '..', 'supabase', 'migrations', '20261121234500_broadcast_live_gifts_to_room_viewers.sql'), 'utf8');
const privacyMigration = fs.readFileSync(path.join(root, '..', 'supabase', 'migrations', '20261121235000_publish_safe_live_gift_events.sql'), 'utf8');

assert.ok(panel.includes("from('live_room_viewers')"), 'Gift panel must register room viewers');
assert.ok(panel.includes(".insert({ room_name: roomName, user_id: userId })"), 'Gift panel must join the exact room');
assert.ok(panel.includes("table: 'live_gift_events'"), 'Gift feed must use the safe public event table');
assert.ok(panel.includes("filter: 'room_name=eq.' + roomName"), 'Gift feed must be filtered to the current room');
assert.ok(panel.includes("p_room_name: roomName"), 'Gift RPC must receive the current room');
assert.ok(panel.includes("status === 'SUBSCRIBED'"), 'Gift sending must wait for Realtime subscription');
assert.ok(panel.includes('liveSoundToggle'), 'Hosts and viewers must have a live mute control');
assert.ok(panel.includes(".delete().eq('room_name', roomName).eq('user_id', userId)"), 'Viewer presence must be cleaned up');
assert.ok(room.includes("roomName={roomName}"), 'Live room must pass its room identity to the gift panel');
assert.ok(migration.includes('create policy "View gifts in joined live rooms"'), 'Migration must scope viewer presence to joined rooms');
assert.ok(migration.includes('drop function if exists public.send_live_gift(uuid, uuid, integer)'), 'Old unscoped gift RPC must be removed');
assert.ok(migration.includes('public.send_live_gift(uuid, uuid, integer, text)'), 'Room-scoped gift RPC must be granted');
assert.ok(privacyMigration.includes('create table if not exists public.live_gift_events'), 'Safe gift event table must exist');
assert.ok(privacyMigration.includes('create trigger yoyo_publish_live_gift_event'), 'Gift transfers must publish sanitized event rows');
assert.ok(privacyMigration.includes('grant select on public.live_gift_events to authenticated'), 'Room viewers must be allowed to read event rows');
assert.ok(!privacyMigration.includes('coins_spent') && !privacyMigration.includes('platform_points'), 'Public event table must not expose financial amounts');

console.log('Live gift room checks passed (room scope, viewer RLS, safe event payload, and RPC binding).');
