import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  registerGlobals,
  useTracks,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { supabase } from './supabase';

registerGlobals();

function RoomContent({ isHost, hostName, onLeave, error }) {
  const tracks = useTracks([Track.Source.Camera]);
  const videoTracks = tracks.filter(isTrackReference);

  return (
    <View style={styles.room}>
      <View style={styles.roomHeader}>
        <View>
          <Text style={styles.hostName}>{hostName || 'بث YOYO LIVE'}</Text>
          <Text style={styles.roomStatus}>{isHost ? 'أنت تبث الآن' : 'أنت تشاهد البث المباشر'} 🔴</Text>
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
            <Text style={styles.waitingEmoji}>📹</Text>
            <Text style={styles.waitingText}>جاري الاتصال بالبث واستقبال الصورة...</Text>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.leaveButton} onPress={onLeave} activeOpacity={0.85}>
        <Text style={styles.leaveButtonText}>{isHost ? 'إنهاء البث' : 'مغادرة البث'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function LiveRoomScreen({ roomName, isHost, hostName, onClose }) {
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

      if (active) setConnection({ token: data.token, serverUrl: data.serverUrl });
    };

    getToken().catch((reason) => {
      if (active) setError(reason?.message || 'تعذر الاتصال بخدمة البث.');
    });

    return () => {
      active = false;
      AudioSession.stopAudioSession().catch(() => {});
    };
  }, [roomName]);

  const leaveRoom = async () => {
    if (isHost) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
        return;
      }

      const { data, error: updateError } = await supabase
        .from('live_rooms')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('room_name', roomName)
        .eq('host_id', user.id)
        .eq('status', 'live')
        .select('id')
        .maybeSingle();

      if (updateError || !data) {
        setError('لم نتمكن من إنهاء البث في قاعدة البيانات. حاول مرة أخرى.');
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
              <TouchableOpacity style={styles.leaveButton} onPress={onClose}>
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
          audio={!!isHost}
          video={!!isHost}
          options={{ adaptiveStream: { pixelDensity: 'screen' } }}
        >
          <RoomContent
            isHost={isHost}
            hostName={hostName}
            onLeave={leaveRoom}
            error={error}
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
  leaveButton: { backgroundColor: '#E53965', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  leaveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});
