import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AudioSession, LiveKitRoom, useLocalParticipant, useParticipants } from '@livekit/react-native';
import { supabase } from './supabase';

const C = { bg: '#0B0912', card: '#191424', card2: '#241B35', pink: '#F34E9B', purple: '#8655F5', white: '#FFFFFF', muted: '#AAA1B8', gold: '#F5C451' };

function VoiceStage({ room, userId, isHost, onLeave }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const [busy, setBusy] = useState(false);
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
        {Array.from({ length: 8 }).map((_, i) => {
          const p = participants[i];
          const mine = p?.identity === userId;
          return <View key={p?.identity || 'empty-' + i} style={[s.seat, p ? s.seatActive : null]}>
            <Text style={s.seatEmoji}>{p ? (mine ? '🎤' : '🎧') : '＋'}</Text>
            <Text numberOfLines={1} style={s.seatName}>{p ? (mine ? 'أنت' : p.name || 'عضو') : 'مقعد فارغ'}</Text>
            {p ? <Text style={s.seatState}>متصل</Text> : null}
          </View>;
        })}
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
      const { data, error: tokenError } = await supabase.functions.invoke('livekit-token', { body: { roomName: room.room_name } });
      if (tokenError) throw tokenError;
      if (!data?.token || !data?.serverUrl) throw new Error(data?.error || 'تعذر الحصول على تصريح دخول الغرفة');
      setActive(room);
      setConnection({ token: data.token, serverUrl: data.serverUrl });
    } catch (e) {
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
        .insert({ room_name: roomName, title: cleanTitle, host_id: userId }).select('id,room_name,title,host_id,created_at').single();
      if (createError) throw createError;
      setTitle('');
      await loadRooms();
      await connect(data);
    } catch (e) { Alert.alert('تعذر إنشاء الغرفة', e?.message || 'حاول مرة أخرى'); }
    finally { setBusy(false); }
  };

  const leave = async () => {
    const room = active;
    setConnection(null); setActive(null);
    AudioSession.stopAudioSession().catch(() => {});
    if (room?.host_id === userId) {
      await supabase.from('voice_rooms').update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', room.id).eq('host_id', userId);
      loadRooms();
    }
  };

  if (active && connection) return <LiveKitRoom serverUrl={connection.serverUrl} token={connection.token} connect audio video={false}
    options={{ adaptiveStream: true }} onDisconnected={() => {}}>
    <VoiceStage room={active} userId={userId} isHost={active.host_id === userId} onLeave={leave} />
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
  seat:{width:'21%',minWidth:70,aspectRatio:0.9,backgroundColor:C.card,borderRadius:16,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#382A4B',padding:6},
  seatActive:{borderColor:C.purple,backgroundColor:C.card2},seatEmoji:{fontSize:27},seatName:{color:C.white,fontSize:11,marginTop:5},seatState:{color:'#62D6A4',fontSize:10,marginTop:3},
  audioInfo:{marginHorizontal:20,backgroundColor:C.card,borderRadius:12,padding:13,alignItems:'center'},infoText:{color:C.muted,fontSize:12},
  controls:{flexDirection:'row',justifyContent:'center',gap:14,marginTop:'auto',padding:20},control:{alignItems:'center',padding:16,borderRadius:16,minWidth:125},
  controlOn:{backgroundColor:'#382A4B'},controlOff:{backgroundColor:'#5A2D43'},leave:{backgroundColor:'#A52D4C'},controlEmoji:{fontSize:24},controlText:{color:C.white,fontWeight:'bold',marginTop:6},
  hostTag:{color:C.gold,textAlign:'center',marginBottom:18,fontWeight:'bold'}
});
