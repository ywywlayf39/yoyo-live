const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const store = fs.readFileSync(path.join(root, 'FrameStoreScreen.js'), 'utf8');
const frames = fs.readFileSync(path.join(root, 'ProfileFrame.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
const gifts = fs.readFileSync(path.join(root, 'LiveGiftPanel.js'), 'utf8');
function check(ok, message) { if (!ok) throw new Error(message); }
check(store.includes('YOYO EXCLUSIVE') && store.includes('اقتناء وتفعيل'), 'Frame store must render premium collectible cards');
check(store.includes('FRAME_META') && store.includes('stageHalo') && store.includes('FILTERS'), 'Frame store must show distinct categorized previews');
check(frames.includes('crest:') && frames.includes('side:') && frames.includes('vip_fire') && frames.includes('vip_galaxy'), 'Profile frames must have distinct ornaments, not color-only rings');
check(app.includes('function MemberReportModal') && app.includes('إلغاء والرجوع'), 'Member report must use a visible custom cancel action');
check(app.includes('setReportingMember(member)'), 'Report action must open the custom report dialog');
check(!app.includes("Alert.alert('إبلاغ عن العضو', 'اختار سبب الإبلاغ:'"), 'Old Android report alert with four buttons must be removed');
check(!gifts.includes("Alert.alert('وصلت هديتك 🎁'"), 'Sending a gift must not open a blocking success alert');
check(gifts.includes('effectLayer: { position: \'absolute\', left: 12, right: 12, top: undefined, bottom: 178'), 'Gift animation must be a compact non-fullscreen overlay');
check(gifts.includes('displayDuration') && gifts.includes('sendNotice'), 'Gift send flow must use compact feedback and controlled animation duration');
console.log('YOYO LIVE premium store, report cancel, and live gift UI checks passed.');
