import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AudioSession, LiveKitRoom, useLocalParticipant, useParticipants } from '@livekit/react-native';
import { supabase } from './supabase';
import LiveGiftPanel from './LiveGiftPanel';

const C = { bg: '#0B0912', card: '#191424', card2: '#241B35', pink: '#F34E9B', purple: '#8655F5', white: '#FFFFFF', muted: '#AAA1B8', gold: '#F5C451', green: '#62D6A4' };

function VoiceStage({ room, userId, isHost, onLeave, onOpenPackages }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const [seats, setSeats] = useState([]);
  const [requests, setRequests] = useState([]);
  const [names, setNames] = useState({});
  const [busy, setBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [giftTarget, setGiftTarget] = useState(isHost ? null : room.host_id);
  const currentSeat = seats.find((seat) => seat.user_id === userId);
  const canSpeak = isHost || !!currentSeat;
  const ownRequest = requests.find((request) => request.user_id === userId && request.status === 'pending');
  const seatedUsers = seats.filter((seat) => !!seat.user_id);

  const loadRoomState = useCallback(async () => {
    const [{ data: seatRows, error: seatError }, { data: requestRows, error: requestError }] = await Promise.all([
      supabase.from('voice_room_seats').select('id,seat_number,user_id,is_open').eq('room_id', room.id).order('seat_number'),
      supabase.from('voice_room_seat_requests').select('id,user_id,status,created_at').eq('room_id', room.id).eq('status', 'pending').order('created_at'),
    ]);
    if (seatError) console.warn('Voice seats:', seatError.message);
    if (requestError) console.warn('Voice seat requests:', requestError.message);
    const nextSeats = seatRows || [];
    const nextRequests = requestRows || [];
    setSeats(nextSeats);
    setRequests(nextRequests);
    const ids = [...new Set([room.host_id, ...nextSeats.map((seat) => seat.user_id), ...nextRequests.map((request) => request.user_id)].filter(Boolean))];
    if (ids.length) {
      const { data: profiles } = await supabase.from('member_public_profiles').select('id,display_name').in('id', ids);
      const map = {};
      (profiles || []).forEach((profile) => { map[profile.id] = profile.display_name || 'عضو'; });
      setNames(map);
    }
  }, [room.id, room.host_id]);

  useEffect(() => {
    loadRoomState();
    const channel = supabase.channel('yoyo-voice-seat-state-' + room.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_room_seats', filter: 'room_id=eq.' + room.id }, loadRoomState)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_room_seat_requests', filter: 'room_id=eq.' + room.id }, loadRoomState)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadRoomState, room.id]);

  useEffect(() => {
    if (isHost) {
      const firstSpeaker = seatedUsers[0]?.user_id || null;
      if (firstSpeaker && (!giftTarget || giftTarget === room.host_id)) setGiftTarget(firstSpeaker);
    }
  }, [isHost, seatedUsers, giftTarget, room.host_id]);

  const updateLiveKitPermission = async (targetUserId) => {
    if (!participants.some((participant) => participant.identity === targetUserId)) return;
    const { error } = await supabase.functions.invoke('livekit-token', {
      body: { action: 'seat_permissions', roomName: room.room_name, targetUserId },
    });
    if (error) throw error;
  };

  const manageSeat = async (seatNumber, action, targetUserId = null) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('manage_voice_room_seat', {
        p_room_id: room.id, p_seat_number: seatNumber, p_action: action, p_user_id: targetUserId,
      });
      if (error) throw error;
      if (action === 'remove' && targetUserId) await updateLiveKitPermission(targetUserId);
      await loadRoomState();
    } catch (error) {
      Alert.alert('تعذر تحديث المقعد', error?.message || 'حاول مرة أخرى');
    } finally { setBusy(false); }
  };

  const manageAllSeats = async (action) => {
    if (!isHost || busy) return;
    setBusy(true);
    let failures = 0;
    try {
      for (const seat of seats) {
        if (action === 'close' && seat.user_id) continue;
        const { error } = await supabase.rpc('manage_voice_room_seat', {
          p_room_id: room.id,
          p_seat_number: seat.seat_number,
          p_action: action,
          p_user_id: null,
        });
        if (error) failures += 1;
      }
      await loadRoomState();
      if (failures) Alert.alert('تم التحديث جزئيًا', 'تعذر تحديث ' + failures + ' مقاعد. حاول مرة أخرى.');
    } finally { setBusy(false); }
  };

  const approveRequest = async (request) => {
    const freeSeat = seats.find((seat) => seat.is_open && !seat.user_id);
    if (!freeSeat) { Alert.alert('لا توجد مقاعد مفتوحة', 'افتح مقعدًا أو أخرج عضوًا أولاً.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('manage_voice_room_seat', {
        p_room_id: room.id, p_seat_number: freeSeat.seat_number, p_action: 'approve', p_user_id: request.user_id,
      });
      if (error) throw error;
      await updateLiveKitPermission(request.user_id);
      await loadRoomState();
      Alert.alert('تم قبول العضو', 'أصبح بإمكانه تشغيل المايك.');
    } catch (error) {
      Alert.alert('تعذر قبول الطلب', error?.message || 'حاول مرة أخرى');
    } finally { setBusy(false); }
  };

  const rejectRequest = async (request) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('reject_voice_room_seat_request', { p_room_id: room.id, p_user_id: request.user_id });
      if (error) throw error;
      await loadRoomState();
    } catch (error) { Alert.alert('تعذر رفض الطلب', error?.message || 'حاول مرة أخرى'); }
    finally { setBusy(false); }
  };

  const requestSeat = async () => {
    if (requestBusy) return;
    setRequestBusy(true);
    try {
      const { error } = await supabase.rpc('request_voice_room_seat', { p_room_id: room.id });
      if (error) throw error;
      await loadRoomState();
      Alert.alert('تم إرسال الطلب', 'سيظهر طلبك لمضيف الغرفة.');
    } catch (error) { Alert.alert('تعذر طلب المايك', error?.message || 'حاول مرة أخرى'); }
    finally { setRequestBusy(false); }
  };

  const toggleMic = async () => {
    if (busy) return;
    if (!canSpeak) {
      Alert.alert('اطلب مقعدًا أولاً', 'لا يمكن تشغيل المايك قبل موافقة مضيف الغرفة.');
      return;
    }
    setBusy(true);
    try { await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); }
    catch (error) { Alert.alert('تعذر تغيير المايك', error?.message || 'حاول مرة أخرى'); }
    finally { setBusy(false); }
  };

  const leaveSeat = async () => {
    if (!currentSeat) return;
    try {
      const { error } = await supabase.rpc('leave_voice_room_seat', { p_room_id: room.id });
      if (error) throw error;
      await updateLiveKitPermission(userId);
      await loadRoomState();
    } catch (error) { Alert.alert('تعذر مغادرة المقعد', error?.message || 'حاول مرة أخرى'); }
  };

  const giftTargets = useMemo(() => [
    { id: room.host_id, label: 'المضيف' },
    ...seatedUsers.map((seat) => ({ id: seat.user_id, label: names[seat.user_id] || 'عضو على مقعد ' + seat.seat_number })),
  ].filter((target) => target.id !== userId), [room.host_id, seatedUsers, names, userId]);

  useEffect(() => {
    if (!giftTargets.some((target) => target.id === giftTarget)) setGiftTarget(giftTargets[0]?.id || null);
  }, [giftTargets, giftTarget]);

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.top}>
        <TouchableOpacity onPress={onLeave}><Text style={s.back}>رجوع ←</Text></TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={s.title}>🎙️ {room.title}</Text>
          <Text style={s.sub}>غرفة صوتية • {participants.length} متصل</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={s.stageScroll}>
        <View style={s.stageHeader}>
          <Text style={s.section}>مقاعد المتحدثين · 8</Text>
          <Text style={s.sub}>{isHost ? 'أنت تتحكم في المقاعد وطلبات التحدث' : 'اطلب مقعدًا للتحدث مع الجميع'}</Text>
        </View>
        {isHost ? (
          <View style={s.bulkSeatActions}>
            <TouchableOpacity disabled={busy} onPress={() => manageAllSeats('open')} style={s.bulkOpen}>
              <Text style={s.bulkText}>فتح كل المقاعد</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={() => manageAllSeats('close')} style={s.bulkClose}>
              <Text style={s.bulkText}>قفل المقاعد الفارغة</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={s.seatGrid}>
          {Array.from({ length: 8 }, (_, index) => {
            const seat = seats.find((item) => item.seat_number === index + 1);
            const occupied = !!seat?.user_id;
            const mine = seat?.user_id === userId;
            return (
              <View key={index + 1} style={[s.seatCard, occupied && s.seatOccupied, seat && !seat.is_open && s.seatLocked]}>
                <Text style={s.seatNumber}>مقعد {index + 1}</Text>
                <Text style={s.seatEmoji}>{occupied ? (mine ? '🎤' : '🗣️') : seat?.is_open ? '＋' : '🔒'}</Text>
                <Text numberOfLines={1} style={s.seatName}>{occupied ? (mine ? 'أنت' : names[seat.user_id] || 'متحدث') : seat?.is_open ? 'متاح' : 'مقفل'}</Text>
                {isHost ? (
                  <View style={s.seatActions}>
                    {occupied ? (
                      <TouchableOpacity disabled={busy} onPress={() => manageSeat(seat.seat_number, 'remove', seat.user_id)} style={s.smallAction}>
                        <Text style={s.smallActionText}>إخراج</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity disabled={busy} onPress={() => manageSeat(index + 1, seat?.is_open ? 'close' : 'open')} style={s.smallAction}>
                        <Text style={s.smallActionText}>{seat?.is_open ? 'قفل' : 'فتح'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {isHost && requests.length > 0 ? (
          <View style={s.requestCard}>
            <Text style={s.section}>طلبات التحدث ({requests.length})</Text>
            {requests.map((request) => (
              <View key={request.id} style={s.requestRow}>
                <Text style={s.requestName}>{names[request.user_id] || 'عضو'}</Text>
                <TouchableOpacity disabled={busy} onPress={() => approveRequest(request)} style={s.acceptButton}><Text style={s.acceptText}>قبول</Text></TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={() => rejectRequest(request)} style={s.rejectButton}><Text style={s.rejectText}>رفض</Text></TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        {!isHost && !canSpeak ? (
          <TouchableOpacity disabled={requestBusy || !!ownRequest} onPress={requestSeat} style={[s.primary, ownRequest && s.pendingButton]}>
            {requestBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>{ownRequest ? '⏳ طلبك في انتظار المضيف' : '🎤 اطلب التحدث'}</Text>}
          </TouchableOpacity>
        ) : null}
        {currentSeat ? <TouchableOpacity onPress={leaveSeat} style={s.leaveSeat}><Text style={s.leaveSeatText}>مغادرة مقعد التحدث</Text></TouchableOpacity> : null}

        <View style={s.participantHeader}><Text style={s.section}>المتصلون الآن</Text><Text style={s.sub}>{participants.length} عضو</Text></View>
        <View style={s.participants}>
          {participants.map((participant) => (
            <View key={participant.identity} style={s.participant}>
              <Text style={s.participantEmoji}>{participant.identity === userId ? '🎧' : '👤'}</Text>
              <Text numberOfLines={1} style={s.seatName}>{participant.identity === userId ? 'أنت' : names[participant.identity] || 'عضو'}</Text>
            </View>
          ))}
        </View>

        <View style={s.audioInfo}><Text style={s.infoText}>🔊 يمكنك الاستماع للجميع، والمايك متاح للمضيف والمتحدثين المقبولين فقط.</Text></View>

        <View style={s.giftTargetCard}>
          <Text style={s.giftTargetTitle}>إرسال هدية إلى</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.giftTargetRow}>
            {giftTargets.map((target) => (
              <TouchableOpacity key={target.id} onPress={() => setGiftTarget(target.id)} style={[s.targetChip, giftTarget === target.id && s.targetChipActive]}>
                <Text style={s.targetChipText}>{target.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {giftTargets.length === 0 ? <Text style={s.sub}>لا يوجد مستلم متاح حاليًا.</Text> : null}
        </View>
      </ScrollView>

      <View style={s.bottomControls}>
        <TouchableOpacity disabled={busy || !canSpeak} onPress={toggleMic} style={[s.control, isMicrophoneEnabled ? s.controlOn : s.controlOff, !canSpeak && s.disabledControl]}>
          <Text style={s.controlEmoji}>{isMicrophoneEnabled ? '🔇' : '🎙️'}</Text>
          <Text style={s.controlText}>{isMicrophoneEnabled ? 'كتم المايك' : canSpeak ? 'فتح المايك' : 'مطلوب مقعد'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onLeave} style={[s.control, s.leave]}>
          <Text style={s.controlEmoji}>📞</Text><Text style={s.controlText}>مغادرة الغرفة</Text>
        </TouchableOpacity>
      </View>
      <LiveGiftPanel userId={userId} receiverId={giftTarget} isHost={false} voiceRoomId={room.id} onOpenPackages={onOpenPackages} />
    </SafeAreaView>
  );
}

export default function VoiceRoomsScreen({ userId, onBack, onOpenPackages }) {
  const [rooms, setRooms] = useState([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(null);
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState('');

  const loadRooms = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('voice_rooms')
      .select('id,room_name,title,host_id,created_at').eq('status', 'live')
      .order('created_at', { ascending: false });
    if (loadError) setError(loadError.message);
    else setRooms(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRooms();
    const channel = supabase.channel('yoyo-voice-rooms-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_rooms' }, loadRooms).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadRooms]);

  const connect = async (room) => {
    setBusy(true); setError('');
    try {
      await AudioSession.startAudioSession();
      const { error: memberError } = await supabase.rpc('join_voice_room', { p_room_id: room.id });
      if (memberError) throw memberError;
      const { data, error: tokenError } = await supabase.functions.invoke('livekit-token', { body: { roomName: room.room_name } });
      if (tokenError || !data?.token || !data?.serverUrl) {
        await supabase.rpc('leave_voice_room', { p_room_id: room.id });
        throw tokenError || new Error(data?.error || 'تعذر الحصول على تصريح دخول الغرفة');
      }
      setActive(room);
      setConnection({ token: data.token, serverUrl: data.serverUrl });
    } catch (error) {
      setError(error?.message || 'تعذر الاتصال بالغرفة الصوتية');
      Alert.alert('تعذر دخول الغرفة', error?.message || 'حاول مرة أخرى');
      AudioSession.stopAudioSession().catch(() => {});
    } finally { setBusy(false); }
  };

  const createRoom = async () => {
    const cleanTitle = title.trim();
    if (cleanTitle.length < 2) { Alert.alert('اسم الغرفة', 'اكتب اسمًا من حرفين على الأقل.'); return; }
    setBusy(true);
    try {
      const roomName = 'voice_' + userId.replace(/-/g, '').slice(0, 10) + '_' + Date.now().toString(36);
      const { data, error: createError } = await supabase.from('voice_rooms')
        .insert({ room_name: roomName, title: cleanTitle, host_id: userId }).select('id,room_name,title,host_id,created_at').single();
      if (createError) throw createError;
      setTitle('');
      await loadRooms();
      await connect(data);
    } catch (error) { Alert.alert('تعذر إنشاء الغرفة', error?.message || 'حاول مرة أخرى'); }
    finally { setBusy(false); }
  };

  const leave = async () => {
    const room = active;
    setConnection(null); setActive(null);
    await supabase.rpc('leave_voice_room', { p_room_id: room.id });
    if (room?.host_id === userId) {
      const { error } = await supabase.functions.invoke('livekit-token', { body: { action: 'end', roomName: room.room_name } });
      if (error) Alert.alert('تنبيه', 'غادرت الشاشة لكن تعذر إنهاء الغرفة على الخادم.');
    } else {
      const { error: permissionError } = await supabase.functions.invoke('livekit-token', {
        body: { action: 'seat_permissions', roomName: room.room_name, targetUserId: userId },
      });
      if (permissionError) console.warn('Voice seat permission reset:', permissionError.message);
    }
    AudioSession.stopAudioSession().catch(() => {});
    loadRooms();
  };

  if (active && connection) return (
    <LiveKitRoom serverUrl={connection.serverUrl} token={connection.token} connect video={false}
      options={{ adaptiveStream: true }} onDisconnected={() => {}}>
      <VoiceStage room={active} userId={userId} isHost={active.host_id === userId} onLeave={leave} onOpenPackages={onOpenPackages} />
    </LiveKitRoom>
  );

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.top}>
        <TouchableOpacity onPress={onBack}><Text style={s.back}>رجوع ←</Text></TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'flex-end' }}><Text style={s.title}>🎙️ غرف YOYO الصوتية</Text><Text style={s.sub}>غرف نقاش مباشرة بمقاعد للمتحدثين</Text></View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={s.createCard}>
          <Text style={s.section}>افتح غرفتك الصوتية</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="اسم الغرفة أو موضوع النقاش" placeholderTextColor={C.muted} style={s.input} maxLength={80} />
          <TouchableOpacity disabled={busy} onPress={createRoom} style={s.primary}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>＋ إنشاء غرفة صوتية</Text>}
          </TouchableOpacity>
        </View>
        <Text style={[s.section, { marginTop: 22, marginBottom: 10 }]}>الغرف المباشرة الآن</Text>
        {loading ? <ActivityIndicator color={C.pink} /> : rooms.length === 0 ?
          <Text style={s.empty}>مفيش غرف صوتية مفتوحة حاليًا. ابدأ أول غرفة ودع أصحابك ينضموا ليك.</Text> :
          rooms.map((room) => (
            <TouchableOpacity key={room.id} disabled={busy} onPress={() => connect(room)} style={s.roomCard}>
              <View style={s.liveDot} /><View style={{ flex: 1 }}>
                <Text style={s.roomTitle}>{room.title}</Text><Text style={s.sub}>غرفة صوتية مباشرة</Text>
              </View><Text style={s.join}>دخول ←</Text>
            </TouchableOpacity>
          ))}
        {!!error ? <Text style={s.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg},top:{padding:18,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#2C233A'},
  back:{color:C.pink,fontWeight:'bold',fontSize:15},title:{color:C.white,fontWeight:'bold',fontSize:20},sub:{color:C.muted,fontSize:12,marginTop:5},
  createCard:{backgroundColor:C.card,borderRadius:18,padding:16,borderWidth:1,borderColor:'#4A326A'},section:{color:C.white,fontWeight:'bold',fontSize:17},
  input:{backgroundColor:C.card2,color:C.white,borderRadius:12,padding:13,marginTop:14,textAlign:'right'},
  primary:{backgroundColor:C.pink,borderRadius:12,padding:14,alignItems:'center',marginTop:12},primaryText:{color:C.white,fontWeight:'bold',fontSize:15},
  roomCard:{backgroundColor:C.card,borderRadius:15,padding:15,marginBottom:10,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:'#302640'},
  liveDot:{width:10,height:10,borderRadius:5,backgroundColor:C.pink},roomTitle:{color:C.white,fontWeight:'bold',fontSize:16},join:{color:C.pink,fontWeight:'bold'},
  empty:{color:C.muted,textAlign:'center',lineHeight:24,backgroundColor:C.card,padding:20,borderRadius:14},error:{color:'#FF8A9C',marginTop:12},
  stageScroll:{padding:14,paddingBottom:150},stageHeader:{alignItems:'center',marginTop:12,marginBottom:14,gap:6},
  bulkSeatActions:{flexDirection:'row',gap:8,marginBottom:12},bulkOpen:{flex:1,backgroundColor:'#245A48',padding:11,borderRadius:10,alignItems:'center'},bulkClose:{flex:1,backgroundColor:'#55283D',padding:11,borderRadius:10,alignItems:'center'},bulkText:{color:C.white,fontWeight:'900',fontSize:11},
  seatGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:8},
  seatCard:{width:'23.5%',minHeight:128,backgroundColor:C.card,borderRadius:15,alignItems:'center',justifyContent:'center',padding:8,borderWidth:1,borderColor:'#382A4B'},
  seatOccupied:{borderColor:C.green,backgroundColor:'#172A29'},seatLocked:{borderColor:'#594B69',backgroundColor:'#17131F'},
  seatNumber:{color:C.muted,fontSize:10,fontWeight:'800'},seatEmoji:{fontSize:26,marginTop:6},seatName:{color:C.white,fontSize:11,fontWeight:'700',marginTop:5,maxWidth:'100%'},
  seatActions:{marginTop:7},smallAction:{paddingHorizontal:10,paddingVertical:5,backgroundColor:C.card2,borderRadius:9},smallActionText:{color:C.pink,fontSize:10,fontWeight:'900'},
  requestCard:{marginTop:16,padding:13,backgroundColor:C.card,borderRadius:14,borderWidth:1,borderColor:'#4A326A'},
  requestRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:10},requestName:{flex:1,color:C.white,fontWeight:'700'},
  acceptButton:{backgroundColor:'#245A48',paddingHorizontal:12,paddingVertical:7,borderRadius:9},acceptText:{color:'#9AF0C7',fontWeight:'900'},
  rejectButton:{backgroundColor:'#55283D',paddingHorizontal:12,paddingVertical:7,borderRadius:9},rejectText:{color:'#FFB2C6',fontWeight:'900'},
  pendingButton:{backgroundColor:'#66522D'},leaveSeat:{alignSelf:'center',marginTop:10,padding:10},leaveSeatText:{color:C.gold,fontWeight:'800'},
  participantHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:22,marginBottom:8},
  participants:{flexDirection:'row',flexWrap:'wrap',gap:8},participant:{minWidth:76,backgroundColor:C.card,borderRadius:12,alignItems:'center',padding:10,borderWidth:1,borderColor:'#382A4B'},
  participantEmoji:{fontSize:20},audioInfo:{marginTop:14,backgroundColor:C.card,borderRadius:12,padding:12,alignItems:'center'},infoText:{color:C.muted,fontSize:12,textAlign:'center',lineHeight:19},
  giftTargetCard:{marginTop:14,backgroundColor:C.card,borderRadius:12,padding:12},giftTargetTitle:{color:C.white,fontWeight:'900',marginBottom:8,textAlign:'right'},
  giftTargetRow:{gap:8},targetChip:{paddingVertical:8,paddingHorizontal:12,backgroundColor:C.card2,borderRadius:18},targetChipActive:{backgroundColor:C.pink},targetChipText:{color:C.white,fontSize:12,fontWeight:'800'},
  bottomControls:{position:'absolute',left:0,right:0,bottom:0,padding:14,paddingBottom:22,backgroundColor:'rgba(11,9,18,0.96)',borderTopWidth:1,borderTopColor:'#302640',flexDirection:'row',justifyContent:'center',gap:14},
  control:{alignItems:'center',padding:12,borderRadius:15,minWidth:132},controlOn:{backgroundColor:'#382A4B'},controlOff:{backgroundColor:'#5A2D43'},leave:{backgroundColor:'#A52D4C'},disabledControl:{opacity:0.45},
  controlEmoji:{fontSize:22},controlText:{color:C.white,fontWeight:'bold',marginTop:5,fontSize:12},
});
