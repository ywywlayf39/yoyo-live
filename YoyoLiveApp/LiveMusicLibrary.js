import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { createAudioPlayer } from 'expo-audio';
import { useRoomContext } from '@livekit/react-native';
import { supabase } from './supabase';

const STORAGE_KEY = '@yoyo_live_music_library_v1';
const MUSIC_FOLDER = new Directory(Paths.document, 'yoyo-music-library');
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function safeFileName(name) {
  return String(name || 'music.mp3').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'music.mp3';
}

export default function LiveMusicLibrary({ roomName, userId, shareLabel = 'مشاركة الأغنية مع جمهور البث' }) {
  const room = useRoomContext();
  const [songs, setSongs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedSongId, setSelectedSongId] = useState(null);
  const [playingSongId, setPlayingSongId] = useState(null);
  const [sharingSongId, setSharingSongId] = useState(null);
  const playerRef = useRef(null);

  const saveSongs = useCallback(async (nextSongs) => {
    setSongs(nextSongs);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextSongs));
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const saved = raw ? JSON.parse(raw) : [];
        const valid = Array.isArray(saved) ? saved.filter((song) => {
          try { return song?.uri && new File(song.uri).exists; } catch { return false; }
        }) : [];
        if (mounted) {
          setSongs(valid);
          if (valid.length !== saved.length) {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
          }
        }
      } catch (error) {
        console.warn('YOYO LIVE music library load:', error);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => () => {
    try {
      playerRef.current?.pause();
      playerRef.current?.remove();
    } catch (error) {
      console.warn('YOYO music player cleanup:', error?.message || error);
    }
    playerRef.current = null;
  }, []);

  const stopPlayback = async () => {
    try {
      if (playerRef.current) {
        playerRef.current.pause();
        await playerRef.current.seekTo(0);
      }
    } catch (error) {
      console.warn('YOYO music stop:', error?.message || error);
    }
    setPlayingSongId(null);
  };

  const togglePlayback = async (song) => {
    try {
      if (playingSongId === song.id && playerRef.current) {
        playerRef.current.pause();
        setPlayingSongId(null);
        return;
      }
      if (playerRef.current) {
        playerRef.current.pause();
        playerRef.current.remove();
        playerRef.current = null;
      }
      const player = createAudioPlayer(song.uri);
      playerRef.current = player;
      await player.seekTo(0);
      player.play();
      setSelectedSongId(song.id);
      setPlayingSongId(song.id);
    } catch (error) {
      setPlayingSongId(null);
      Alert.alert('تعذر تشغيل الأغنية', 'تأكد أن الملف الصوتي ما زال موجودًا وبصيغة مدعومة.');
      console.warn('YOYO music playback:', error?.message || error);
    }
  };

  const importSongs = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await File.pickFileAsync({
        multipleFiles: true,
        mimeTypes: ['audio/*'],
      });
      if (result.canceled) return;

      const pickedFiles = Array.isArray(result.result) ? result.result : [result.result];
      if (!MUSIC_FOLDER.exists) MUSIC_FOLDER.create({ idempotent: true, intermediates: true });

      const nextSongs = [...songs];
      let skipped = 0;
      for (let index = 0; index < pickedFiles.length; index += 1) {
        const source = pickedFiles[index];
        const name = source.name || `music-${Date.now()}-${index}.mp3`;
        const size = Number(source.size || 0);
        if (size > MAX_FILE_SIZE) {
          skipped += 1;
          continue;
        }
        const id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
        const destination = new File(MUSIC_FOLDER, `${id}-${safeFileName(name)}`);
        await source.copy(destination);
        nextSongs.push({ id, name, uri: destination.uri, size, mimeType: source.mimeType || source.type || null, addedAt: Date.now() });
      }
      await saveSongs(nextSongs);
      Alert.alert('مكتبتي الموسيقية', `تم حفظ ${pickedFiles.length - skipped} أغنية في مكتبة التطبيق.${skipped ? ` تم تخطي ${skipped} ملف لأن حجمه أكبر من 50 ميجابايت.` : ''}`);
    } catch (error) {
      console.warn('YOYO LIVE music import:', error);
      Alert.alert('تعذر إضافة الأغاني', 'لم نتمكن من قراءة الملفات المختارة. جرّب اختيار ملفات صوت MP3 أو M4A أو WAV.');
    } finally {
      setBusy(false);
    }
  };

  const shareSongWithRoom = async (song) => {
    if (!roomName || !userId || sharingSongId) return;
    const file = new File(song.uri);
    const maxShareSize = 20 * 1024 * 1024;
    if (!file.exists) {
      Alert.alert('ملف الأغنية غير موجود', 'أضف الأغنية مرة أخرى من هاتفك.');
      return;
    }
    if (file.size > maxShareSize) {
      Alert.alert('حجم الأغنية كبير', 'مشاركة الأغاني متاحة للملفات حتى 20 ميجابايت.');
      return;
    }
    const extension = String(song.name || file.name || '').split('?')[0].split('.').pop().toLowerCase();
    const declaredMime = String(song.mimeType || file.mimeType || file.type || '').toLowerCase().split(';')[0].trim();
    const mimeByExtension = {
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      mp4: 'audio/mp4',
      aac: 'audio/aac',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      oga: 'audio/ogg',
      opus: 'audio/opus',
      flac: 'audio/flac',
    };
    const supportedMimes = new Set(Object.values(mimeByExtension));
    const contentType = supportedMimes.has(declaredMime)
      ? declaredMime
      : (mimeByExtension[extension] || null);
    if (!contentType) {
      Alert.alert('صيغة غير مدعومة للمشاركة', 'نوع الملف الذي اختاره الهاتف غير واضح. جرّب MP3 أو M4A أو AAC أو WAV أو OGG.');
      return;
    }

    setSharingSongId(song.id);
    try {
      await stopPlayback();
      const { data: previousMusic } = await supabase.from('live_room_music')
        .select('storage_path').eq('room_name', roomName).maybeSingle();
      const storagePath = userId + '/' + Date.now() + '-' + safeFileName(song.name);
      // Expo SDK 58 File implements Blob; upload it directly to avoid buffering
      // the entire audio file in JS memory while LiveKit camera/audio are active.
      const { error: uploadError } = await supabase.storage.from('live-music').upload(storagePath, file, {
        contentType,
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { error: controlError } = await supabase.rpc('yoyo_live_music_control', {
        p_room_name: roomName,
        p_action: 'play',
        p_storage_path: storagePath,
        p_track_name: song.name.slice(0, 140),
      });
      if (controlError) {
        await supabase.storage.from('live-music').remove([storagePath]);
        throw controlError;
      }
      if (previousMusic?.storage_path && previousMusic.storage_path !== storagePath) {
        await supabase.storage.from('live-music').remove([previousMusic.storage_path]);
      }

      // Send the ready-to-play signed URL through LiveKit's reliable room data
      // channel so viewers do not wait for a separate Supabase realtime fetch.
      const { data: currentMusic, error: stateError } = await supabase.from('live_room_music')
        .select('room_name,host_id,storage_path,track_name,status,started_at,position_seconds,updated_at')
        .eq('room_name', roomName).maybeSingle();
      if (!stateError && currentMusic && room?.localParticipant) {
        const { data: signed } = await supabase.storage.from('live-music')
          .createSignedUrl(storagePath, 7200);
        try {
          await room.localParticipant.publishData(
            new TextEncoder().encode(JSON.stringify({
              type: 'yoyo_music_state',
              roomName,
              music: { ...currentMusic, signed_url: signed?.signedUrl || null },
            })),
            { reliable: true, topic: 'yoyo-live-music' },
          );
        } catch (broadcastError) {
          console.warn('YOYO music data channel publish:', broadcastError?.message || broadcastError);
        }
      }
      Alert.alert('الموسيقى بدأت مع الجمهور 🎵', 'تم إرسال أمر التشغيل عبر اتصال البث المباشر لتقليل تأخير بدء الموسيقى. شارك فقط ملفات تملك حق استخدامها.');
    } catch (error) {
      console.warn('YOYO shared music upload:', error?.message || error);
      Alert.alert('تعذر مشاركة الأغنية', 'راجع اتصال الإنترنت وصيغة الملف ثم حاول مرة أخرى.');
    } finally {
      setSharingSongId(null);
    }
  };

  const filteredSongs = songs.filter((song) => song.name.toLowerCase().includes(searchText.trim().toLowerCase()));

  const removeSong = (song) => {
    Alert.alert('حذف الأغنية', `هل تريد حذف "${song.name}" من مكتبتك؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try {
            const file = new File(song.uri);
            if (playingSongId === song.id) await stopPlayback();
            if (file.exists) file.delete();
            await saveSongs(songs.filter((item) => item.id !== song.id));
          } catch {
            Alert.alert('تعذر الحذف', 'حاول مرة أخرى.');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded((value) => !value)} activeOpacity={0.85}>
        <View style={styles.headerText}>
          <Text style={styles.title}>🎵 مكتبتي الموسيقية</Text>
          <Text style={styles.subtitle}>{songs.length} أغنية محفوظة على هذا الهاتف</Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text>
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          <TouchableOpacity style={styles.addButton} onPress={importSongs} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.addButtonText}>＋ إضافة أغاني من الهاتف</Text>}
          </TouchableOpacity>
          {songs.length ? (
            <>
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="ابحث باسم الأغنية..."
                placeholderTextColor="#9D91A8"
                style={styles.searchInput}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {filteredSongs.length ? filteredSongs.map((song) => (
                <View key={song.id} style={[styles.songRow, selectedSongId === song.id && styles.selectedSongRow]}>
                  <Text style={styles.songIcon}>♫</Text>
                  <View style={styles.songInfo}>
                    <Text numberOfLines={1} style={styles.songName}>{song.name}</Text>
                    <Text style={styles.songSize}>{song.size ? `${(song.size / (1024 * 1024)).toFixed(1)} ميجابايت` : 'ملف صوتي'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedSongId(song.id)} style={styles.chooseButton}>
                    <Text style={styles.chooseText}>{selectedSongId === song.id ? 'تم الاختيار' : 'اختيار'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => togglePlayback(song)} style={styles.playButton}>
                    <Text style={styles.playText}>{playingSongId === song.id ? 'إيقاف مؤقت' : '▶ تشغيل'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeSong(song)} style={styles.removeButton}>
                    <Text style={styles.removeText}>حذف</Text>
                  </TouchableOpacity>
                </View>
              )) : <Text style={styles.empty}>مفيش أغنية بالاسم ده. جرّب كلمة تانية.</Text>}
              {selectedSongId ? (
                <Text style={styles.selectedLabel}>الأغنية المحددة: {songs.find((song) => song.id === selectedSongId)?.name || ''}</Text>
              ) : null}
              {!!roomName && !!userId && selectedSongId && songs.some((song) => song.id === selectedSongId) ? (
                <TouchableOpacity
                  onPress={() => shareSongWithRoom(songs.find((song) => song.id === selectedSongId))}
                  disabled={!!sharingSongId}
                  style={[styles.shareButton, !!sharingSongId && { opacity: 0.6 }]}
                >
                  <Text style={styles.shareText}>{sharingSongId ? 'جارٍ رفع الأغنية...' : '📡 {shareLabel}'}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <Text style={styles.empty}>مكتبتك فارغة. أضف ملفات الأغاني من هاتفك لتظل محفوظة داخل التطبيق.</Text>
          )}
          {playingSongId ? (
            <TouchableOpacity onPress={stopPlayback} style={styles.stopButton}>
              <Text style={styles.stopText}>■ إيقاف الأغنية وإرجاعها للبداية</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.notice}>يتم تشغيل الأغنية بشكل متزامن عند أعضاء الغرفة بعد مشاركتها. استخدم فقط الملفات التي تملك حق استخدامها أو لديك إذن ببثها.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#191424', borderColor: '#4B3154', borderWidth: 1, borderRadius: 14, marginTop: 12, overflow: 'hidden' },
  header: { minHeight: 62, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerText: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold', textAlign: 'left' },
  subtitle: { color: '#B8AFC2', fontSize: 12, marginTop: 4, textAlign: 'left' },
  chevron: { color: '#F5C451', fontSize: 24, paddingHorizontal: 8 },
  body: { paddingHorizontal: 12, paddingBottom: 12 },
  addButton: { minHeight: 44, borderRadius: 10, backgroundColor: '#8C285B', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  addButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  searchInput: { minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: '#594565', color: '#FFFFFF', paddingHorizontal: 12, marginBottom: 8, textAlign: 'left', backgroundColor: '#241B2D' },
  selectedSongRow: { backgroundColor: '#30233A', borderRadius: 8, paddingHorizontal: 4 },
  chooseButton: { paddingHorizontal: 9, paddingVertical: 7, backgroundColor: '#3F704E', borderRadius: 8 },
  chooseText: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' },
  playButton: { paddingHorizontal: 9, paddingVertical: 7, backgroundColor: '#3E527B', borderRadius: 8, marginLeft: 6 },
  playText: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' },
  stopButton: { minHeight: 40, borderRadius: 10, backgroundColor: '#612A39', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  stopText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  shareButton: { minHeight: 44, borderRadius: 11, backgroundColor: '#245A48', borderWidth: 1, borderColor: '#3E9B78', alignItems: 'center', justifyContent: 'center', marginTop: 11, paddingHorizontal: 10 },
  shareText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  selectedLabel: { color: '#F5C451', fontSize: 12, marginTop: 8, textAlign: 'left' },
  songRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#35283D' },
  songIcon: { color: '#F5C451', fontSize: 22, width: 32, textAlign: 'center' },
  songInfo: { flex: 1, paddingHorizontal: 8 },
  songName: { color: '#FFFFFF', fontSize: 13, textAlign: 'left' },
  songSize: { color: '#A99FB2', fontSize: 11, marginTop: 3, textAlign: 'left' },
  removeButton: { paddingHorizontal: 10, paddingVertical: 7 },
  removeText: { color: '#FF9EAD', fontSize: 12, fontWeight: 'bold' },
  empty: { color: '#B8AFC2', fontSize: 13, textAlign: 'center', paddingVertical: 16, lineHeight: 21 },
  notice: { color: '#E7C77A', fontSize: 11, lineHeight: 18, marginTop: 10, textAlign: 'left' },
});
