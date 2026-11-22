import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useTracks,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { supabase } from './supabase';
import LiveGiftPanel from './LiveGiftPanel';
import LiveBattlePanel from './LiveBattlePanel';
import LiveMusicLibrary from './LiveMusicLibrary';
import LiveRoomChat from './LiveRoomChat';

function formatBroadcastDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':');
}

function RoomContent({ isHost, isCall, callType, hostName, onLeave, error, userId, receiverId, roomName, broadcastDuration }) {
  const tracks = useTracks([Track.Source.Camera]);
  const videoTracks = tracks.filter(isTrackReference);

  const reportLiveRoom = () => {
    if (!userId || isHost || isCall) return;
    Alert.alert('الإبلاغ عن البث', 'اختار سبب الإبلاغ عن البث الحالي:', [
      { text: 'محتوى غير لائق', onPress: () => submitLiveReport('محتوى غير لائق') },
      { text: 'إساءة أو تحرش أثناء البث', onPress: () => submitLiveReport('إساءة أو تحرش أثناء البث') },
      { text: 'احتيال أو انتحال شخصية', onPress: () => submitLiveReport('احتيال أو انتحال شخصية') },
      { text: 'إلغاء', style: 'cancel' },
    ]);
  };

  const submitLiveReport = async (reason) => {
    const { data: room, error: roomError } = await supabase
      .from('live_rooms')
      .select('id,host_id')
      .eq('room_name', roomName)
      .eq('status', 'live')
      .maybeSingle();

    if (roomError || !room?.id || !room?.host_id || room.host_id === userId) {
      Alert.alert('تعذر إرسال البلاغ', 'لم نتمكن من التحقق من البث الحالي. حاول مرة أخرى.');
      return;
    }

    const { error: reportError } = await supabase.from('user_reports').insert({
      reporter_id: userId,
      reported_user_id: room.host_id,
      live_room_id: room.id,
      reason,
      status: 'pending',
    });

    if (reportError) {
      Alert.alert('تعذر إرسال البلاغ', 'حاول مرة أخرى لاحقًا.');
    } else {
      Alert.alert('تم استلام البلاغ', 'تم ربط البلاغ بالبث الحالي وإرساله للمراجعة.');
    }
  };

  return (
    <View style={styles.room}>
      <View style={styles.roomHeader}>
        <View>
          <Text style={styles.hostName}>{hostName || 'بث YOYO LIVE'}</Text>
          <Text style={styles.roomStatus}>{isCall ? (callType === 'audio' ? 'مكالمة صوتية' : 'مكالمة فيديو') : isHost ? 'أنت تبث الآن' : 'أنت تشاهد البث المباشر'} 🔴</Text>
          {!isCall ? <Text style={styles.durationText}>مدة البث: {broadcastDuration || '00:00:00'}</Text> : null}
        </View>
        <View style={styles.livePill}><Text style={styles.livePillText}>LIVE</Text></View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView contentContainerStyle={styles.videoList}>
        {videoTracks.length > 0 ? videoTracks.map((track, index) => (
          <VideoTrack
            key={track.publication.trackSid || `${track.participant.identity}-${index}`}
            trackRef={track}
            style={styles.video}
          />
        )) : (
          <View style={styles.waiting}>
            <Text style={styles.waitingEmoji}>{isCall && callType === 'audio' ? '📞' : '📹'}</Text>
            <Text style={styles.waitingText}>{isCall && callType === 'audio' ? 'المكالمة الصوتية جاهزة. يمكنك التحدث الآن.' : 'جاري الاتصال بالبث واستقبال الصورة...'}</Text>
          </View>
        )}
      </ScrollView>

      {!isCall && isHost && userId ? <LiveMusicLibrary /> : null}
      {!isCall && userId ? <LiveRoomChat roomName={roomName} userId={userId} isHost={isHost} /> : null}
      {!isCall && userId ? <LiveGiftPanel userId={userId} receiverId={receiverId} isHost={isHost} roomName={roomName} /> : null}
      {!isCall && isHost && userId ? <LiveBattlePanel userId={userId} roomName={roomName} isHost={isHost} /> : null}

      {!isCall && !isHost && userId ? (
        <TouchableOpacity style={styles.reportButton} onPress={reportLiveRoom} activeOpacity={0.85}>
          <Text style={styles.reportButtonText}>🚩 إبلاغ عن البث</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={styles.leaveButton} onPress={() => Alert.alert(
        isCall ? 'إنهاء المكالمة' : isHost ? 'إنهاء البث المباشر' : 'مغادرة البث',
        isCall ? 'هل أنت متأكد أنك تريد إنهاء المكالمة؟' : isHost ? 'هل أنت متأكد؟ سيتم إنهاء البث وفصل جميع المشاهدين، وإنهاء أي تحدٍ نشط دون إعلان فائز.' : 'هل تريد مغادرة البث؟',
        [
          { text: 'استمرار', style: 'cancel' },
          { text: isHost ? 'إنهاء البث' : isCall ? 'إنهاء المكالمة' : 'مغادرة', style: 'destructive', onPress: onLeave },
        ],
      )} activeOpacity={0.85}>
        <Text style={styles.leaveButtonText}>{isCall ? 'إنهاء المكالمة' : isHost ? 'إنهاء البث' : 'مغادرة البث'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function LiveRoomScreen({ roomName, isHost, isCall = false, callType = 'video', hostName, onClose, userId, receiverId }) {
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState('');
  const [broadcastStartedAt, setBroadcastStartedAt] = useState(null);
  const [clockNow, setClockNow] = useState(Date.now());

  useEffect(() => {
    if (isCall || !roomName) return undefined;
    let active = true;
    const loadBroadcastStart = async () => {
      const { data, error: startError } = await supabase
        .from('live_rooms')
        .select('created_at')
        .eq('room_name', roomName)
        .eq('status', 'live')
        .maybeSingle();
      if (!active) return;
      if (!startError && data?.created_at) {
        setBroadcastStartedAt(new Date(data.created_at).getTime());
      } else {
        // Fallback for older live-room rows without a readable start timestamp.
        setBroadcastStartedAt(Date.now());
      }
    };
    loadBroadcastStart().catch(() => {
      if (active) setBroadcastStartedAt(Date.now());
    });
    const clock = setInterval(() => setClockNow(Date.now()), 1000);
    return () => {
      active = false;
      clearInterval(clock);
    };
  }, [roomName, isCall]);

  const broadcastDuration = broadcastStartedAt
    ? formatBroadcastDuration((clockNow - broadcastStartedAt) / 1000)
    : '00:00:00';

  useEffect(() => {
    let active = true;
    AudioSession.startAudioSession().catch((reason) => {
      console.warn('YOYO LIVE audio session:', reason);
    });

    const getToken = async () => {
      setError('');
      const { data, error: invokeError } = await supabase.functions.invoke('livekit-token', {
        body: { roomName },
      });

      if (invokeError) throw invokeError;
      if (!data?.token || !data?.serverUrl) {
        throw new Error(data?.error || 'تعذر الحصول على تصريح دخول البث.');
      }

      if (active) setConnection({ token: data.token, serverUrl: data.serverUrl, isCall: !!data.isCall, callType: data.callType || callType });
    };

    getToken().catch((reason) => {
      if (active) setError(reason?.message || 'تعذر الاتصال بخدمة البث.');
    });

    return () => {
      active = false;
      AudioSession.stopAudioSession().catch(() => {});
    };
  }, [roomName]);


  useEffect(() => {
    if (!isCall) return;
    const channel = supabase
      .channel('call-status-' + roomName)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_calls',
        filter: 'room_name=eq.' + roomName,
      }, (payload) => {
        if (payload.new?.status === 'rejected') {
          Alert.alert('لم يتم قبول المكالمة', 'يمكنك المحاولة مرة أخرى لاحقًا.');
          onClose?.();
        } else if (payload.new?.status === 'ended') {
          onClose?.();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomName, isCall]);

  const leaveRoom = async () => {
    let cleanupWarning = '';

    if (isHost) {
      // Best-effort interruption: navigation must not be blocked by a server cleanup error.
      const { error: battleError } = await supabase.rpc('yoyo_battle_interrupt_for_host', {
        p_room_name: roomName,
      });
      if (battleError) {
        cleanupWarning = 'تعذر تأكيد إيقاف التحدي على الخادم.';
      }
    }

    if (isHost || isCall) {
      const { data, error: endError } = await supabase.functions.invoke('livekit-token', {
        body: { roomName, action: 'end' },
      });

      if (endError || !data?.ended) {
        cleanupWarning = [cleanupWarning, 'تعذر تأكيد إنهاء الغرفة على الخادم. قد تحتاج إعدادات LiveKit إلى مراجعة.']
          .filter(Boolean)
          .join(' ');
      }
    }

    // Always leave the live screen locally, even if server-side cleanup fails.
    // Unmounting LiveKitRoom disconnects this device; the warning explains any remote cleanup issue.
    onClose?.();

    if (cleanupWarning) {
      Alert.alert('تم الرجوع من شاشة البث', cleanupWarning + ' تأكد من إصلاح اتصال LiveKit قبل بدء بث جديد.');
    }
  };

  const exitAfterConnectionError = async () => {
    if (isHost || isCall) {
      await leaveRoom();
      return;
    }
    onClose?.();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0912" />
      {!connection ? (
        <View style={styles.loading}>
          {error ? (
            <>
              <Text style={styles.error}>{error}</Text>
              <TouchableOpacity style={styles.leaveButton} onPress={exitAfterConnectionError}>
                <Text style={styles.leaveButtonText}>رجوع</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color="#F34E9B" />
              <Text style={styles.loadingText}>جارٍ تجهيز البث المباشر...</Text>
            </>
          )}
        </View>
      ) : (
        <LiveKitRoom
          serverUrl={connection.serverUrl}
          token={connection.token}
          connect={true}
          audio={connection.isCall || !!isHost}
          video={connection.isCall ? connection.callType === 'video' : !!isHost}
          options={{ adaptiveStream: { pixelDensity: 'screen' } }}
          onDisconnected={() => setError('انقطع اتصال غرفة البث. لم نغلق الشاشة تلقائيًا حتى تتمكن من رؤية الخطأ ومحاولة التشخيص.')}
          onError={(roomError) => setError(roomError?.message || 'فشل الاتصال بغرفة LiveKit. ابقَ في الشاشة لعرض التشخيص.')}
        >
          <RoomContent
            isHost={isHost}
            isCall={connection.isCall}
            callType={connection.callType}
            hostName={hostName}
            onLeave={leaveRoom}
            error={error}
            userId={userId}
            receiverId={receiverId}
            roomName={roomName}
            broadcastDuration={broadcastDuration}
          />
        </LiveKitRoom>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0912', paddingBottom: Platform.OS === 'android' ? 28 : 0 },
  room: { flex: 1, padding: 16 },
  roomHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  hostName: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold', textAlign: 'left' },
  roomStatus: { color: '#AAA1B8', fontSize: 13, marginTop: 5, textAlign: 'left' },
  durationText: { color: '#F5C451', fontSize: 13, fontWeight: 'bold', marginTop: 6, textAlign: 'left', fontVariant: ['tabular-nums'] },
  livePill: { backgroundColor: '#E53965', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 },
  livePillText: { color: '#FFFFFF', fontWeight: 'bold' },
  videoList: { flexGrow: 1, justifyContent: 'center', gap: 12 },
  video: { width: '100%', height: 420, backgroundColor: '#191424', borderRadius: 16, overflow: 'hidden' },
  waiting: { minHeight: 260, alignItems: 'center', justifyContent: 'center', backgroundColor: '#191424', borderRadius: 16, padding: 20 },
  waitingEmoji: { fontSize: 44, marginBottom: 12 },
  waitingText: { color: '#FFFFFF', fontSize: 15, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 },
  loadingText: { color: '#FFFFFF', fontSize: 15 },
  error: { color: '#FF9EAD', textAlign: 'center', marginVertical: 12, lineHeight: 22 },
  reportButton: { backgroundColor: '#34263F', borderWidth: 1, borderColor: '#8A5578', borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 12 },
  reportButtonText: { color: '#F4C5D8', fontSize: 14, fontWeight: 'bold' },
  leaveButton: { backgroundColor: '#E53965', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  leaveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});
