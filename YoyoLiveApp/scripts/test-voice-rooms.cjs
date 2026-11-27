const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const screen = fs.readFileSync(path.join(root, 'VoiceRoomsScreen.js'), 'utf8');
const musicSync = fs.readFileSync(path.join(root, 'LiveMusicSync.js'), 'utf8');
const lib = fs.readFileSync(path.join(root, 'LiveMusicLibrary.js'), 'utf8');
const gifts = fs.readFileSync(path.join(root, 'LiveGiftPanel.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
const token = fs.readFileSync(path.join(root, '..', 'supabase', 'functions', 'livekit-token', 'index.ts'), 'utf8');
const migrations = fs.readdirSync(path.join(root, '..', 'supabase', 'migrations')).sort();
const seatsMigration = fs.readFileSync(path.join(root, '..', 'supabase', 'migrations', '20261126190000_secure_voice_room_seats.sql'), 'utf8');
const giftsMigration = fs.readFileSync(path.join(root, '..', 'supabase', 'migrations', '20261126191000_voice_room_gifts_to_seat_holders.sql'), 'utf8');
const membershipMigration = fs.readFileSync(path.join(root, '..', 'supabase', 'migrations', '20261126192000_secure_voice_room_membership.sql'), 'utf8');

assert.ok(app.includes("import VoiceRoomsScreen from './VoiceRoomsScreen'"), 'App must import voice rooms');
assert.ok(app.includes('onOpenPackages={() => setShowPackages(true)}'), 'Voice room gift recharge must open the existing packages screen');
assert.ok(screen.includes('AudioSession.startAudioSession()') && screen.includes('video={false}') && !screen.includes('connect audio video={false}'), 'Voice rooms must remain audio-only and microphones must be manually enabled after approval');
const connectBlock = screen.slice(screen.indexOf('const connect = async (room) => {'), screen.indexOf('const createRoom = async () => {'));
assert.ok(connectBlock.indexOf("rpc('join_voice_room'") < connectBlock.indexOf("functions.invoke('livekit-token'"), 'Membership must be confirmed before a LiveKit token is issued');
assert.ok(screen.includes("rpc('join_voice_room'") && screen.includes("rpc('leave_voice_room'"), 'Room membership must use server-authorized RPCs');
assert.ok(screen.includes('Array.from({ length: 8 }'), 'The room must render exactly eight seat slots');
assert.ok(screen.includes('request_voice_room_seat') && screen.includes('manage_voice_room_seat'), 'Members must request seats and hosts must approve/control them');
assert.ok(screen.includes('chairBack') && screen.includes('chairBase') && screen.includes('chairLegs'), 'Voice room seats must render as recognizable chair shapes');
assert.ok(screen.includes('source={{ uri: seatAvatar }}') && screen.includes('seatAvatar = occupied ? avatars[seat.user_id]'), 'Occupied chairs must display the seated member real profile avatar');
assert.ok(screen.includes('onPress={requestSeat}') && screen.includes('seatTapReady'), 'Members must be able to tap an available chair to request sitting');
assert.ok(screen.includes("seatIsOpen ? 'close' : 'open'") && screen.includes("seat?.is_open"), 'Hosts must be able to open and close seats using the current seat state');
assert.ok(screen.includes('seat_permissions') && token.includes('updateParticipant'), 'LiveKit permissions must change server-side when a speaker is approved or removed');
assert.ok(token.includes('targetUserId !== user.id'), 'A speaker may revoke only their own mic permission; only the host may change another member');
assert.ok(token.includes('canPublish: isCall || isHost || (isVoiceRoom && voiceSeatHolder)'), 'Only hosts and approved seat holders may publish in voice rooms');
assert.ok(screen.includes('LiveGiftPanel') && gifts.includes('p_receiver_id: receiverId'), 'Voice room gifts must support a selected recipient');
assert.ok(gifts.includes('isHost && !voiceRoomId'), 'Hosts may send gifts in voice rooms while retaining the host-only live-stream behavior');
assert.ok(gifts.includes('voice_room_gift_events'), 'Voice room gift animations must use realtime gift events');
assert.ok(seatsMigration.includes('generate_series(1, 8)') && seatsMigration.includes('revoke insert, update, delete on public.voice_room_seats'), 'Eight seats must be initialized and direct client seat writes must be blocked');
assert.ok(giftsMigration.includes('v_receiver_id <> v_room.host_id') && giftsMigration.includes('voice_room_seats s'), 'Gift recipients must be limited to the host or an approved speaker');
assert.ok(giftsMigration.includes('round(v_gross_points * 0.70)'), 'Voice room gifts must preserve the 70/30 revenue split');
assert.ok(giftsMigration.includes('voice_room_gift_events_sender_request_uidx') && giftsMigration.includes('e.request_id = v_request_id'), 'Voice room gift retries must not charge the sender twice');
assert.ok(gifts.includes('p_request_id: voiceGiftRequestId.current'), 'Voice gift UI must reuse the same idempotency key after an uncertain response');
assert.ok(screen.includes('manageAllSeats') && screen.includes('فتح المقاعد المغلقة') && screen.includes('قفل المقاعد الفارغة') && screen.includes("seats.some((seat) => !seat.is_open && !seat.user_id)"), 'The bulk seat control must match the current seat state instead of showing contradictory actions');
assert.ok(screen.includes("paddingTop:40") && screen.includes("roomTop"), 'Voice room header must be below the Android status bar');
assert.ok(screen.includes("select('id,display_name,avatar_url')") && screen.includes('participantAvatar'), 'Voice room participants must show real profile names and avatars');
assert.ok(screen.includes("{participants.length} متصل"), 'The connected-member count must use one consistent label');
assert.ok(screen.includes('infoIcon') && screen.includes('flexDirection:\'row-reverse\''), 'The listening icon must sit beside, not over, the text');
assert.ok(screen.includes('paddingBottom:48') && screen.includes('paddingBottom:340'), 'Voice room controls and the full scroll content must clear Android system navigation');
assert.ok(screen.includes('height:56') && screen.includes('minWidth:132') && screen.includes('direction:\'rtl\''), 'Voice controls must be compact and the eight-seat grid must follow RTL order');
assert.ok(gifts.includes('voiceLiveSoundToggle: { top: 112 }') && gifts.includes('voiceOpenButton: { bottom: 184 }') && gifts.includes('voiceRoomId && styles.voiceOpenButton'), 'Voice gift controls must not cover the room controls or seat card, without changing video rooms');
assert.ok(screen.includes('chairAvatarFallback') && screen.includes('chairAvatarGlyph') && screen.includes("seatIsOpen ? '＋'") && screen.includes('chairBaseLocked') && screen.includes('chairLegLocked'), 'Open and locked chairs must have distinct visible colors and labels');

assert.ok(membershipMigration.includes('revoke insert, update, delete on public.voice_room_members') && membershipMigration.includes('public.join_voice_room'), 'Members must not forge room membership through direct table writes');
const singleRoomMigration = fs.readFileSync(path.join(root, '..', 'supabase', 'migrations', '20261126193000_one_live_voice_room_per_host.sql'), 'utf8');
assert.ok(singleRoomMigration.includes('create unique index if not exists voice_rooms_one_live_room_per_host_uidx') && singleRoomMigration.includes("where status = 'live'"), 'A member must be limited to one active hosted voice room at database level');
assert.ok(screen.includes(".eq('host_id', userId).eq('status', 'live')") && screen.includes('لديك غرفة صوتية مفتوحة بالفعل'), 'The app must detect an existing live room and offer to re-enter it instead of creating another');

assert.ok(migrations.includes('20261126190000_secure_voice_room_seats.sql') && migrations.includes('20261126191000_voice_room_gifts_to_seat_holders.sql') && migrations.includes('20261126192000_secure_voice_room_membership.sql'), 'Voice room migrations must be present');

const musicMigration = fs.readFileSync(path.join(root, '..', 'supabase', 'migrations', '20261126223000_enable_shared_music_in_voice_rooms.sql'), 'utf8');
assert.ok(screen.includes("import LiveMusicLibrary from './LiveMusicLibrary'") && screen.includes("import LiveMusicSync from './LiveMusicSync'"), 'Voice rooms must load the shared music library and synchronized player');
assert.ok(screen.includes('shareLabel="مشاركة الأغنية مع أعضاء الغرفة الصوتية"') && screen.includes('audienceLabel="أعضاء الغرفة الصوتية"'), 'Voice room hosts must share music and all members must hear synchronized playback');
assert.ok(lib.includes('`📡 ${shareLabel}`'), 'The shared music button must show the context-specific audience label');
assert.ok(musicSync.includes('audienceLabel = \'جمهور البث\'') && musicSync.includes('تعمل الآن عند ${audienceLabel}'), 'Shared music status must use the correct audience label');
assert.ok(musicMigration.includes('public.voice_rooms') && musicMigration.includes('public.voice_room_members') && musicMigration.includes('private.yoyo_live_music_control_impl'), 'Shared music permissions must support active voice-room hosts and members');

console.log('YOYO LIVE voice room seats, gifts, and shared music regression checks passed.');

assert.ok(screen.includes('roomHeading') && !screen.includes('hostIdentity'), 'The room name and connected count must share one clear header line');
assert.ok(screen.includes('participantAvatar:{width:36,height:36') && screen.includes('participant:{minWidth:68'), 'Connected member cards and avatars must fit compactly above the footer');
assert.ok(g.includes('voiceLiveSoundToggle: { top: 112, left: undefined, right: 16') && g.includes('voiceOpenButton: { bottom: 168, left: 16, right: undefined'), 'Voice gift sound and gift buttons must be inset and separated from the connected count');
