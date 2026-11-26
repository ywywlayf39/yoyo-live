const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname + '/..';
const panel = fs.readFileSync(path.join(root, 'LiveBattlePanel.js'), 'utf8');
const room = fs.readFileSync(path.join(root, 'LiveRoomScreen.native.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, '../supabase/migrations/20261122100000_create_yoyo_battles_mvp.sql'), 'utf8');
const hardening = fs.readFileSync(path.join(root, '../supabase/migrations/20261122101000_harden_yoyo_battle_state_transitions.sql'), 'utf8');

for (const rpc of ['yoyo_battle_invite', 'yoyo_battle_respond', 'yoyo_battle_cancel', 'yoyo_battle_refresh']) {
  assert.ok(panel.includes("rpc('" + rpc + "'"), 'Missing battle RPC call: ' + rpc);
}
assert.ok(panel.includes("table: 'yoyo_battles'"), 'Battle panel must subscribe to realtime updates');
assert.ok(panel.includes('score_a') && panel.includes('score_b'), 'Battle panel must render both scores');
assert.ok(panel.includes('starts_at') && panel.includes('ends_at'), 'Battle panel must render countdown/timer');
assert.ok(room.includes("import LiveBattlePanel from './LiveBattlePanel'"), 'Native live room must import battle panel');
assert.ok(room.includes('<LiveBattlePanel') && room.includes('isHost={isHost}'), 'Battle panel must be host-only');

for (const token of [
  'create table if not exists public.yoyo_battles',
  'enable row level security',
  'Battle participants can view their battles',
  'create trigger yoyo_battle_score_from_live_gift',
  'new.host_points',
  'revoke all on function public.yoyo_battle_invite',
  'grant execute on function public.yoyo_battle_invite',
  'revoke all on function private.yoyo_battle_count_gift()'
]) {
  assert.ok(migration.toLowerCase().includes(token.toLowerCase()), 'Migration missing safety/feature clause: ' + token);
}
assert.ok(hardening.includes("status='expired'") && hardening.includes("status='completed'"), 'State transition hardening is incomplete');
assert.ok(!/wallets|wallet_transactions|purchased_coins/i.test(migration), 'Battle migration must not mutate wallet balances');
console.log('YOYO BATTLE static checks passed.');

assert.ok(panel.includes("last_heartbeat_at"), 'Challenge room list must filter out stale/offline broadcasts');
assert.ok(room.includes("rpc('yoyo_touch_live_room'"), 'Live host must publish an online heartbeat using the database clock');
assert.ok(!room.includes("update({ last_heartbeat_at:"), 'Live host must not write device-clock timestamps');
