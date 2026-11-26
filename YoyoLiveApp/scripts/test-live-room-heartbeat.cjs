const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
const live = fs.readFileSync(path.join(root, 'LiveRoomScreen.native.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, '..', 'supabase', 'migrations', '20261127010000_use_database_clock_for_live_heartbeat.sql'), 'utf8');

assert.ok(app.includes("status: 'live',") && !app.includes("last_heartbeat_at: new Date().toISOString()"), 'New live rooms must use the database timestamp default, not the phone clock');
assert.ok(live.includes("rpc('yoyo_touch_live_room'") && live.includes('p_room_name: roomName'), 'Host heartbeat must use the server-clock RPC');
assert.ok(!live.includes(".update({ last_heartbeat_at: new Date().toISOString() })"), 'Host heartbeat must never write the device clock');
assert.ok(migration.includes('set last_heartbeat_at = now()') && migration.includes('host_id = auth.uid()') && migration.includes("status = 'live'"), 'Heartbeat RPC must use database time and only touch the caller active room');

console.log('YOYO LIVE server-clock live heartbeat regression checks passed.');
