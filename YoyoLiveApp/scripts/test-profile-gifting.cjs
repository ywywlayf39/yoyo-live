const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
const panel = fs.readFileSync(path.join(root, 'LiveGiftPanel.js'), 'utf8');
const migration = fs.readFileSync(path.resolve(root, '..', '..', 'supabase/migrations/20261126140000_add_profile_gifting.sql'), 'utf8');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(app.includes("import LiveGiftPanel from './LiveGiftPanel';"), 'App must import the gift panel');
check(app.includes('receiverId={selectedMember.id}'), 'Profile must target the selected member');
check(app.includes('profileMode'), 'Profile gift panel must use profile mode');
check(app.includes("notification?.notification_type === 'gift_received'"), 'Recipient must see realtime gift notifications');
check(panel.includes("supabase.rpc('send_profile_gift'"), 'Profile mode must call the secure profile gift RPC');
check(panel.includes("!profileMode && !giftFeedReady"), 'Profile gifts must not require a live-room feed');
check(migration.includes('public.send_profile_gift'), 'Migration must define the secure profile gift RPC');
check(migration.includes('public.user_notifications'), 'Gift transfer must create a recipient notification');
check(migration.includes('public.wallet_transactions'), 'Gift transfer must record wallet transactions');
check(migration.includes('v_host_points := round(v_gross_points * 0.70)'), 'Gift payout must preserve the 70/30 split');
console.log('YOYO LIVE profile gifting regression checks passed.');
