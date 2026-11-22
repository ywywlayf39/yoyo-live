import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { supabase } from './supabase';

export default function LiveMusicSync({ roomName, userId, isHost }) {
  const [sharedMusic, setSharedMusic] = useState(null);
  const [busy, setBusy] = useState(false);
  const [musicError, setMusicError] = useState('');
  const [muted, setMuted] = useState(false);
  const playerRef = useRef(null);
  const playerPathRef = useRef(null);
  const playerKeyRef = useRef(null);
  const processingRef = useRef(0);
  const finishSentRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!roomName || !userId) return;
    const { data, error } = await supabase.from('live_room_music')
      .select('room_name,host_id,storage_path,track_name,status,started_at,position_seconds,updated_at')
      .eq('room_name', roomName)
      .maybeSingle();
    if (error) {
      setMusicError('تعذر تحميل حالة الموسيقى المشتركة.');
      return;
    }
    setMusicError('');
    setSharedMusic(data || null);
  }, [roomName, userId]);

  const releasePlayer = useCallback(() => {
    try {
      playerRef.current?.pause();
      playerRef.current?.remove();
    } catch (error) {
      console.warn('YOYO shared music cleanup:', error?.message || error);
    }
    playerRef.current = null;
    playerPathRef.current = null;
    playerKeyRef.current = null;
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase.channel('yoyo-shared-music-' + roomName)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'live_room_music',
        filter: 'room_name=eq.' + roomName,
      }, refresh)
      .subscribe((status) => { if (status === 'SUBSCRIBED') refresh(); });
    const poll = setInterval(refresh, 5000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
      processingRef.current += 1;
      releasePlayer();
    };
  }, [roomName, refresh, releasePlayer]);

  useEffect(() => {
    if (!sharedMusic || sharedMusic.status === 'stopped') {
      processingRef.current += 1;
      releasePlayer();
      return undefined;
    }
    if (sharedMusic.status === 'paused') {
      processingRef.current += 1;
      const player = playerRef.current;
      if (player) {
        player.pause();
        player.seekTo(Number(sharedMusic.position_seconds || 0)).catch(() => {});
      }
      playerKeyRef.current = 'paused:' + sharedMusic.updated_at;
      return undefined;
    }
    if (sharedMusic.status !== 'playing' || !sharedMusic.storage_path || !sharedMusic.started_at) return undefined;

    const playbackKey = sharedMusic.storage_path + ':' + sharedMusic.started_at;
    if (playerKeyRef.current === playbackKey) return undefined;
    const operation = ++processingRef.current;
    const targetOffset = Number(sharedMusic.position_seconds || 0)
      + Math.max(0, (Date.now() - new Date(sharedMusic.started_at).getTime()) / 1000);

    const startExisting = async () => {
      const player = playerRef.current;
      if (!player || playerPathRef.current !== sharedMusic.storage_path) return false;
      const target = player.duration > 0 ? Math.min(targetOffset, Math.max(0, player.duration - 0.25)) : targetOffset;
      await player.seekTo(target);
      player.play();
      playerKeyRef.current = playbackKey;
      return true;
    };

    (async () => {
      try {
        if (await startExisting()) return;
        releasePlayer();
        const { data, error } = await supabase.storage.from('live-music')
          .createSignedUrl(sharedMusic.storage_path, 7200);
        if (error || !data?.signedUrl) throw error || new Error('signed_url_missing');
        if (processingRef.current !== operation) return;

        const player = createAudioPlayer(data.signedUrl, { updateInterval: 500 });
        player.muted = muted;
        playerRef.current = player;
        playerPathRef.current = sharedMusic.storage_path;
        playerKeyRef.current = playbackKey;
        finishSentRef.current = false;
        let started = false;
        const beginWhenLoaded = async (status) => {
          if (started || !status?.isLoaded || processingRef.current !== operation) return;
          started = true;
          const target = player.duration > 0 ? Math.min(targetOffset, Math.max(0, player.duration - 0.25)) : targetOffset;
          try {
            await player.seekTo(target);
            if (processingRef.current !== operation) return;
            player.play();
            playerKeyRef.current = playbackKey;
          } catch (seekError) {
            console.warn('YOYO shared music seek:', seekError?.message || seekError);
          }
        };
        player.addListener('playbackStatusUpdate', (status) => {
          beginWhenLoaded(status);
          if (isHost && status?.didJustFinish && !finishSentRef.current) {
            finishSentRef.current = true;
            supabase.rpc('yoyo_live_music_control', {
              p_room_name: roomName, p_action: 'stop',
            }).then(() => refresh());
          }
        });
        if (player.isLoaded) await beginWhenLoaded({ isLoaded: true });
      } catch (error) {
        if (processingRef.current === operation) {
          playerKeyRef.current = null;
          releasePlayer();
          setMusicError('تعذر تشغيل الموسيقى عند هذا الجهاز. تحقق من اتصال الإنترنت.');
        }
        console.warn('YOYO shared music playback:', error?.message || error);
      }
    })();

    return () => {
      if (processingRef.current === operation) processingRef.current += 1;
    };
  }, [sharedMusic, isHost, roomName, releasePlayer, refresh]);

  useEffect(() => {
    if (playerRef.current) playerRef.current.muted = muted;
  }, [muted]);

  const control = async (action) => {
    if (!isHost || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('yoyo_live_music_control', {
      p_room_name: roomName,
      p_action: action,
    });
    setBusy(false);
    if (error) {
      Alert.alert('تعذر التحكم في الموسيقى', 'حاول مرة أخرى.');
      return;
    }
    await refresh();
  };

  if (!sharedMusic || sharedMusic.status === 'stopped') {
    return musicError && isHost ? <Text style={styles.error}>{musicError}</Text> : null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <Text style={styles.icon}>🎵</Text>
        <View style={styles.nameWrap}>
          <Text style={styles.name} numberOfLines={1}>{sharedMusic.track_name}</Text>
          <Text style={styles.status}>{sharedMusic.status === 'playing' ? 'تعمل الآن عند جمهور البث' : 'متوقفة مؤقتًا'}</Text>
        </View>
      </View>
      <View style={styles.controls}>
        <TouchableOpacity onPress={() => setMuted((value) => !value)} style={styles.controlButton}>
          <Text style={styles.controlText}>{muted ? '🔊 تشغيل الصوت' : '🔇 كتم عندي'}</Text>
        </TouchableOpacity>
      </View>
      {isHost ? (
        <View style={styles.controls}>
          {sharedMusic.status === 'playing' ? (
            <TouchableOpacity disabled={busy} onPress={() => control('pause')} style={styles.controlButton}>
              <Text style={styles.controlText}>⏸ إيقاف مؤقت</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity disabled={busy} onPress={() => control('resume')} style={styles.controlButton}>
              <Text style={styles.controlText}>▶ استكمال</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity disabled={busy} onPress={() => control('stop')} style={[styles.controlButton, styles.stopButton]}>
            <Text style={styles.controlText}>■ إيقاف للجميع</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!!musicError && <Text style={styles.error}>{musicError}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 9, padding: 10, borderRadius: 12, backgroundColor: '#172C2A', borderWidth: 1, borderColor: '#3E806C' },
  info: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  icon: { fontSize: 22 },
  nameWrap: { flex: 1 },
  name: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold', textAlign: 'left' },
  status: { color: '#A7E2C8', fontSize: 11, marginTop: 3, textAlign: 'left' },
  controls: { flexDirection: 'row', gap: 8, marginTop: 9 },
  controlButton: { flex: 1, borderRadius: 9, backgroundColor: '#245A48', padding: 9, alignItems: 'center' },
  stopButton: { backgroundColor: '#612A39' },
  controlText: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' },
  error: { color: '#FF9EAD', fontSize: 11, marginTop: 7, textAlign: 'center' },
});
