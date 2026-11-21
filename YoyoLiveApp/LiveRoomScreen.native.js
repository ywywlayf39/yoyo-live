import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

function RoomContent({ isHost, isCall, callType, hostName, onLeave, error, userId, receiverId, roomName }) {
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

      {!isCall && userId ? <LiveGiftPanel userId={userId} receiverId={receiverId} isHost={isHost} /> : null}

      {!isCall && !isHost && userId ? (
        <TouchableOpacity style={styles.reportButton} onPress={reportLiveRoom} activeOpacity={0.85}>
          <Text style={styles.reportButtonText}>🚩 إبلاغ عن البث</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={styles.leaveButton} onPress={onLeave} activeOpacity={0.85}>
        <Text style={styles.leaveButtonText}>{isCall ? 'إنهاء المكالمة' : isHost ? 'إنهاء البث' : 'مغادرة البث'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function LiveRoomScreen({ roomName, isHost, isCall = false, callType = 'video', hostName, onClose, userId, receiverId }) {
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState('');

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

  const exitAfterConnectionError = async () => {
    if (isCall) {
      await supabase.from('live_calls')
        .update({ status: 'ended' })
        .eq('room_name', roomName)
        .in('status', ['ringing', 'accepted']);
    } else if (isHost) {
      await supabase.from('live_rooms')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('room_name', roomName)
        .eq('status', 'live');
    }
    onClose?.();
  };

  const leaveRoom = async () => {
    if (isHost || isCall) {
      const { data, error: endError } = await supabase.functions.invoke('livekit-token', {
        body: { roomName, action: 'end' },
      });

      if (endError || !data?.ended) {
        setError(data?.error || endError?.message || 'لم نتمكن من إنهاء الجلسة وإخراج المشاركين.');
        return;
      }
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
          onDisconnected={() => onClose?.()}
          onError={(roomError) => setError(roomError?.message || 'انقطع الاتصال بغرفة LiveKit.')}
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
          />
        </LiveKitRoom>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0912' },
  room: { flex: 1, padding: 16 },
  roomHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  hostName: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold', textAlign: 'left' },
  roomStatus: { color: '#AAA1B8', fontSize: 13, marginTop: 5, textAlign: 'left' },
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
