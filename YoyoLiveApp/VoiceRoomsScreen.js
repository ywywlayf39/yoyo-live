import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import LiveGiftPanel from './LiveGiftPanel';
import { AudioSession, LiveKitRoom, useLocalParticipant, useParticipants } from '@livekit/react-native';
import { supabase } from './supabase';

const C = { bg: '#0B0912', card: '#191424', card2: '#241B35', pink: '#F34E9B', purple: '#8655F5', white: '#FFFFFF', muted: '#AAA1B8', gold: '#F5C451' };

function VoiceStage({ room, userId, isHost, onLeave, onRefreshConnection }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const [busy, setBusy] = useState(false);
  const [seatRows, setSeatRows] = useState([]);
  const [seatProfiles, setSeatProfiles] = useState({});
  const [seatsOpen, setSeatsOpen] = useState(room.seats_open !== false);
  const [requests, setRequests] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const mySeat = seatRows.find((x) => x.user_id === userId);
  const refreshedForSeat = useRef(false);
  useEffect(() => {
    if (mySeat && !isHost && !refreshedForSeat.current) {
      refreshedForSeat.current = true;
      Alert.alert('تم قبول طلب المايك', 'هنعيد الاتصال لتفعيل صلاحية التحدث.');
      onRefreshConnection(room);
    }
    if (!mySeat) refreshedForSeat.current = false;
  }, [mySeat, isHost, onRefreshConnection, room]);
  const refreshRoomData = useCallback(async () => {
    const [seatResult, requestResult, messageResult] = await Promise.all([
      supabase.from('voice_room_seats').select('id,user_id,seat_number').eq('room_id', room.id).order('seat_number'),
      supabase.from('voice_room_seat_requests').select('id,user_id,status,created_at').eq('room_id', room.id).eq('status', 'pending').order('created_at'),
      supabase.from('voice_room_messages').select('id,user_id,body,created_at').eq('room_id', room.id).order('created_at', { ascending: false }).limit(40),
      supabase.from('voice_rooms').select('seats_open').eq('id', room.id).maybeSingle(),
    ]);
    if (!seatResult.error) {
      const rows = seatResult.data || [];
      setSeatRows(rows);
      const ids = rows.map((x) => x.user_id);
      if (ids.length) {
        const { data: profileRows } = await supabase.from('member_public_profiles').select('id,display_name,avatar_url').in('id', ids);
        setSeatProfiles(Object.fromEntries((profileRows || []).map((p) => [p.id, p])));
      } else setSeatProfiles({});
    }
    if (!requestResult.error) {
      setRequests(requestResult.data || []);
      setRequestSent((requestResult.data || []).some((x) => x.user_id === userId));
    }
    if (!messageResult.error) setMessages((messageResult.data || []).reverse());
    const { data: roomState } = await supabase.from('voice_rooms').select('seats_open').eq('id', room.id).maybeSingle();
    if (roomState) setSeatsOpen(roomState.seats_open !== false);
  }, [room.id]);
  useEffect(() => {
    refreshRoomData();
    const channel = supabase.channel('voice-room-' + room.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_room_seats', filter: 'room_id=eq.' + room.id }, refreshRoomData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_room_seat_requests', filter: 'room_id=eq.' + room.id }, refreshRoomData)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'voice_room_messages', filter: 'room_id=eq.' + room.id }, refreshRoomData)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'voice_rooms', filter: 'id=eq.' + room.id }, refreshRoomData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room.id, refreshRoomData]);
  const requestSeat = async () => {
    if (!seatsOpen) { Alert.alert('المقاعد مغلقة', 'المضيف أغلق المقاعد حاليًا.'); return; }
    const { error } = await supabase.from('voice_room_seat_requests')
      .upsert({ room_id: room.id, user_id: userId, status: 'pending' }, { onConflict: 'room_id,user_id' });
    if (error) Alert.alert('تعذر طلب المايك', error.message);
    else { setRequestSent(true); Alert.alert('تم إرسال الطلب', 'استنى موافقة مضيف الغرفة.'); refreshRoomData(); }
  };
  const decideRequest = async (request, approve) => {
    if (!isHost) return;
    if (approve) {
      const occupied = new Set(seatRows.map((x) => x.seat_number));
      const seatNumber = Array.from({ length: 20 }, (_, i) => i + 1).find((n) => !occupied.has(n));
      if (!seatsOpen) { Alert.alert('المقاعد مغلقة', 'مضيف الغرفة أغلق استقبال المتحدثين.'); return; }
      if (!seatNumber) { Alert.alert('المقاعد مكتملة', 'لا يوجد مقعد متاح حاليًا.'); return; }
      const { error: seatError } = await supabase.from('voice_room_seats')
        .insert({ room_id: room.id, user_id: request.user_id, seat_number: seatNumber });
      if (seatError) { Alert.alert('تعذر إضافة المتحدث', seatError.message); return; }
    }
    const { error } = await supabase.from('voice_room_seat_requests')
      .update({ status: approve ? 'approved' : 'rejected' }).eq('id', request.id);
    if (error) Alert.alert('تعذر تحديث الطلب', error.message);
    refreshRoomData();
  };
  const leaveSeat = async () => {
    const { error } = await supabase.from('voice_room_seats').delete().eq('room_id', room.id).eq('user_id', userId);
    if (error) Alert.alert('تعذر مغادرة المقعد', error.message);
    else { setRequestSent(false); refreshRoomData(); }
  };
  const removeSpeaker = async (seat) => {
    if (!isHost) return;
    const { error } = await supabase.from('voice_room_seats').delete().eq('id', seat.id);
    if (error) Alert.alert('تعذر إنزال المتحدث', error.message);
    else refreshRoomData();
  };
  const sendMessage = async () => {
    const body = messageText.trim();
    if (!body) return;
    setMessageText('');
    const { error } = await supabase.from('voice_room_messages').insert({ room_id: room.id, user_id: userId, body });
    if (error) { setMessageText(body); Alert.alert('تعذر إرسال الرسالة', error.message); }
    else refreshRoomData();
  };
  const toggleMic = async () => {
    if (busy) return;
    setBusy(true);
    try { await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); }
    catch (e) { Alert.alert('تعذر تغيير المايك', e?.message || 'حاول مرة أخرى'); }
    finally { setBusy(false); }
  };
  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.top}>
        <TouchableOpacity onPress={onLeave}><Text style={s.back}>رجوع ←</Text></TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={s.title}>🎙️ {room.title}</Text>
          <Text style={s.sub}>غرفة صوتية جماعية • {participants.length} متصل</Text>
        </View>
      </View>
      <View style={s.stageHeader}><Text style={s.section}>مقاعد المتحدثين</Text><Text style={s.sub}>الصوت مباشر بين أعضاء الغرفة</Text></View>
      <View style={s.seats}>
        {Array.from({ length: 20 }).map((_, i) => {
          const seat = seatRows.find((x) => x.seat_number === i + 1);
          const p = seat && participants.find((x) => x.identity === seat.user_id);
          return <View key={'seat-' + (i + 1)} style={[s.seat, seat ? s.seatActive : null]}>
            {seat && seatProfiles[seat.user_id]?.avatar_url ? <Image source={{ uri: seatProfiles[seat.user_id].avatar_url }} style={s.seatAvatar} /> : <Text style={s.seatEmoji}>{seat ? (p?.isMicrophoneEnabled ? '🎙️' : '🔇') : '＋'}</Text>}
            <Text numberOfLines={1} style={s.seatName}>{seat ? (seat.user_id === userId ? 'أنت' : seatProfiles[seat.user_id]?.display_name || p?.name || 'متحدث') : 'مقعد فارغ'}</Text>
            {seat ? <Text style={s.seatState}>مقعد {i + 1}</Text> : null}
            {seat && isHost && seat.user_id !== userId ? <TouchableOpacity onPress={() => removeSpeaker(seat)}><Text style={{ color: '#FF8A9C', fontSize: 10 }}>إنزال</Text></TouchableOpacity> : null}
          </View>;
        })}
      </View>
      {isHost ? <TouchableOpacity onPress={async () => { const next = !seatsOpen; const { error } = await supabase.from('voice_rooms').update({ seats_open: next }).eq('id', room.id).eq('host_id', userId); if (error) Alert.alert('تعذر تغيير المقاعد', error.message); else setSeatsOpen(next); }} style={s.seatToggle}><Text style={s.controlText}>{seatsOpen ? '🔒 غلق المقاعد' : '🔓 فتح المقاعد'}</Text></TouchableOpacity> : null}
      {!isHost && !mySeat && seatsOpen ? <TouchableOpacity onPress={requestSeat} disabled={requestSent} style={s.primary}>
        <Text style={s.primaryText}>{requestSent ? 'تم إرسال طلب المايك' : '🎤 طلب الصعود للمايك'}</Text>
      </TouchableOpacity> : null}
      {!isHost && !seatsOpen && !mySeat ? <Text style={s.seatsClosed}>المقاعد مغلقة حاليًا بواسطة المضيف</Text> : null}
      {mySeat && !isHost ? <TouchableOpacity onPress={leaveSeat} style={s.reject}><Text style={s.controlText}>مغادرة مقعد المتحدث</Text></TouchableOpacity> : null}
      {isHost && requests.length > 0 ? <View style={s.requestBox}>
        <Text style={s.section}>طلبات الصعود للمايك</Text>
        {requests.map((request) => <View key={request.id} style={s.requestRow}>
          <Text style={s.seatName}>{request.user_id.slice(0, 8)}</Text>
          <TouchableOpacity onPress={() => decideRequest(request, true)} style={s.approve}><Text style={s.controlText}>قبول</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => decideRequest(request, false)} style={s.reject}><Text style={s.controlText}>رفض</Text></TouchableOpacity>
        </View>)}
      </View> : null}
      <View style={s.chatBox}>
        <Text style={s.section}>دردشة الغرفة</Text>
        {messages.slice(-8).map((m) => <Text key={m.id} style={s.chatLine}>{m.user_id === userId ? 'أنت' : m.user_id.slice(0, 6)}: {m.body}</Text>)}
        <View style={s.chatInputRow}>
          <TextInput value={messageText} onChangeText={setMessageText} placeholder="اكتب رسالة..." placeholderTextColor={C.muted} style={[s.input, { flex: 1, marginTop: 0 }]} maxLength={500} />
          <TouchableOpacity onPress={sendMessage} style={s.sendChat}><Text style={s.controlText}>إرسال</Text></TouchableOpacity>
        </View>
      </View>
      <View style={s.audioInfo}><Text style={s.infoText}>🔊 خلي صوت الموبايل مفتوحًا لسماع المشاركين</Text></View>
      <View style={s.controls}>
        <TouchableOpacity disabled={busy} onPress={toggleMic} style={[s.control, isMicrophoneEnabled ? s.controlOn : s.controlOff]}>
          <Text style={s.controlEmoji}>{isMicrophoneEnabled ? '🎙️' : '🔇'}</Text>
          <Text style={s.controlText}>{isMicrophoneEnabled ? 'كتم المايك' : 'فتح المايك'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onLeave} style={[s.control, s.leave]}>
          <Text style={s.controlEmoji}>📞</Text><Text style={s.controlText}>مغادرة الغرفة</Text>
        </TouchableOpacity>
      </View>
      {isHost ? <Text style={s.hostTag}>أنت مضيف الغرفة</Text> : null}
      <LiveGiftPanel userId={userId} receiverId={room.host_id} isHost={isHost} voiceRoomId={room.id} onOpenPackages={() => Alert.alert('باقات العملات', 'افتح صفحة المحفظة لشراء العملات.')} />
    </SafeAreaView>
  );
}

export default function VoiceRoomsScreen({ userId, onBack }) {
  const [rooms, setRooms] = useState([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(null);
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState('');

  const loadRooms = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('voice_rooms')
      .select('id,room_name,title,host_id,created_at,seats_open').eq('status', 'live')
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
      const { error: memberError } = await supabase.from('voice_room_members').upsert({ room_id: room.id, user_id: userId }, { onConflict: 'room_id,user_id' });
      if (memberError) throw memberError;
      await AudioSession.startAudioSession();
      const { data, error: tokenError } = await supabase.functions.invoke('livekit-token', { body: { roomName: room.room_name } });
      if (tokenError) throw tokenError;
      if (!data?.token || !data?.serverUrl) throw new Error(data?.error || 'تعذر الحصول على تصريح دخول الغرفة');
      setActive(room);
      setConnection({ token: data.token, serverUrl: data.serverUrl });
    } catch (e) {
      await supabase.from('voice_room_members').delete().eq('room_id', room.id).eq('user_id', userId);
      setError(e?.message || 'تعذر الاتصال بالغرفة الصوتية');
      Alert.alert('تعذر دخول الغرفة', e?.message || 'حاول مرة أخرى');
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
        .insert({ room_name: roomName, title: cleanTitle, host_id: userId }).select('id,room_name,title,host_id,created_at,seats_open').single();
      if (createError) throw createError;
      setTitle('');
      await loadRooms();
      await connect(data);
    } catch (e) { Alert.alert('تعذر إنشاء الغرفة', e?.message || 'حاول مرة أخرى'); }
    finally { setBusy(false); }
  };

  const refreshConnection = async (room) => {
    setConnection(null);
    setActive(null);
    await AudioSession.stopAudioSession().catch(() => {});
    await connect(room);
  };

  const leave = async () => {
    const room = active;
    setConnection(null); setActive(null);
    if (room?.id) await supabase.from('voice_room_members').delete().eq('room_id', room.id).eq('user_id', userId);
    AudioSession.stopAudioSession().catch(() => {});
    if (room?.host_id === userId) {
      const { data, error: endError } = await supabase.functions.invoke('livekit-token', {
        body: { roomName: room.room_name, action: 'end' },
      });
      if (endError || data?.ended !== true) {
        Alert.alert('تعذر إنهاء الغرفة', endError?.message || data?.error || 'حاول مرة أخرى');
      }
      loadRooms();
    }
  };

  if (active && connection) return <LiveKitRoom serverUrl={connection.serverUrl} token={connection.token} connect audio video={false}
    options={{ adaptiveStream: true }} onDisconnected={() => {}}>
    <VoiceStage room={active} userId={userId} isHost={active.host_id === userId} onLeave={leave} onRefreshConnection={refreshConnection} />
  </LiveKitRoom>;

  return <SafeAreaView style={s.root}>
    <StatusBar barStyle="light-content" backgroundColor={C.bg} />
    <View style={s.top}>
      <TouchableOpacity onPress={onBack}><Text style={s.back}>رجوع ←</Text></TouchableOpacity>
      <View style={{ flex: 1, alignItems: 'flex-end' }}><Text style={s.title}>🎙️ غرف YOYO الصوتية</Text><Text style={s.sub}>اتكلموا سوا بصوت مباشر</Text></View>
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
        rooms.map(room => <TouchableOpacity key={room.id} disabled={busy} onPress={() => connect(room)} style={s.roomCard}>
          <View style={s.liveDot} /><View style={{ flex: 1 }}>
            <Text style={s.roomTitle}>{room.title}</Text>
            <Text style={s.sub}>غرفة صوتية مباشرة</Text>
          </View><Text style={s.join}>دخول ←</Text>
        </TouchableOpacity>)}
      {!!error ? <Text style={s.error}>{error}</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg},top:{padding:18,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#2C233A'},
  back:{color:C.pink,fontWeight:'bold',fontSize:15},title:{color:C.white,fontWeight:'bold',fontSize:20},sub:{color:C.muted,fontSize:12,marginTop:5},
  createCard:{backgroundColor:C.card,borderRadius:18,padding:16,borderWidth:1,borderColor:'#4A326A'},section:{color:C.white,fontWeight:'bold',fontSize:17},
  input:{backgroundColor:C.card2,color:C.white,borderRadius:12,padding:13,marginTop:14,textAlign:'right'},
  primary:{backgroundColor:C.pink,borderRadius:12,padding:14,alignItems:'center',marginTop:12},primaryText:{color:C.white,fontWeight:'bold',fontSize:15},
  roomCard:{backgroundColor:C.card,borderRadius:15,padding:15,marginBottom:10,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:'#302640'},
  liveDot:{width:10,height:10,borderRadius:5,backgroundColor:'#F34E9B'},roomTitle:{color:C.white,fontWeight:'bold',fontSize:16},join:{color:C.pink,fontWeight:'bold'},
  empty:{color:C.muted,textAlign:'center',lineHeight:24,backgroundColor:C.card,padding:20,borderRadius:14},error:{color:'#FF8A9C',marginTop:12},
  stageHeader:{alignItems:'center',marginTop:30,gap:6},seats:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',padding:16,gap:12},
  seat:{width:'21%',minWidth:58,aspectRatio:0.92,backgroundColor:C.card,borderRadius:16,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#382A4B',padding:6},
  seatActive:{borderColor:C.purple,backgroundColor:C.card2},seatEmoji:{fontSize:27},seatAvatar:{width:38,height:38,borderRadius:19,backgroundColor:C.card2},seatsClosed:{color:C.gold,textAlign:'center',margin:10},seatToggle:{alignSelf:'center',backgroundColor:C.card2,paddingVertical:10,paddingHorizontal:18,borderRadius:12,marginTop:8},seatName:{color:C.white,fontSize:11,marginTop:5},seatState:{color:'#62D6A4',fontSize:10,marginTop:3},
  audioInfo:{marginHorizontal:20,backgroundColor:C.card,borderRadius:12,padding:13,alignItems:'center'},infoText:{color:C.muted,fontSize:12},
  controls:{flexDirection:'row',justifyContent:'center',gap:14,marginTop:'auto',padding:20},control:{alignItems:'center',padding:16,borderRadius:16,minWidth:125},
  controlOn:{backgroundColor:'#382A4B'},controlOff:{backgroundColor:'#5A2D43'},leave:{backgroundColor:'#A52D4C'},controlEmoji:{fontSize:24},controlText:{color:C.white,fontWeight:'bold',marginTop:6},
  hostTag:{color:C.gold,textAlign:'center',marginBottom:18,fontWeight:'bold'},
  requestBox:{marginHorizontal:16,marginTop:14,backgroundColor:C.card,borderRadius:14,padding:12,gap:8},
  requestRow:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:5},
  approve:{backgroundColor:'#247A5B',padding:9,borderRadius:9},reject:{backgroundColor:'#8A3150',padding:9,borderRadius:9},
  chatBox:{margin:16,backgroundColor:C.card,borderRadius:14,padding:12,gap:8},
  chatLine:{color:C.white,textAlign:'right',fontSize:13},chatInputRow:{flexDirection:'row',gap:8,alignItems:'center'},
  sendChat:{backgroundColor:C.pink,padding:12,borderRadius:10}
});
