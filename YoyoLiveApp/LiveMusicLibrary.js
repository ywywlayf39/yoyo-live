import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

const STORAGE_KEY = '@yoyo_live_music_library_v1';
const MUSIC_FOLDER = new Directory(Paths.document, 'yoyo-music-library');
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function safeFileName(name) {
  return String(name || 'music.mp3').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'music.mp3';
}

export default function LiveMusicLibrary() {
  const [songs, setSongs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
        nextSongs.push({ id, name, uri: destination.uri, size, addedAt: Date.now() });
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

  const removeSong = (song) => {
    Alert.alert('حذف الأغنية', `هل تريد حذف "${song.name}" من مكتبتك؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try {
            const file = new File(song.uri);
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
          {songs.length ? songs.map((song) => (
            <View key={song.id} style={styles.songRow}>
              <Text style={styles.songIcon}>♫</Text>
              <View style={styles.songInfo}>
                <Text numberOfLines={1} style={styles.songName}>{song.name}</Text>
                <Text style={styles.songSize}>{song.size ? `${(song.size / (1024 * 1024)).toFixed(1)} ميجابايت` : 'ملف صوتي'}</Text>
              </View>
              <TouchableOpacity onPress={() => removeSong(song)} style={styles.removeButton}>
                <Text style={styles.removeText}>حذف</Text>
              </TouchableOpacity>
            </View>
          )) : (
            <Text style={styles.empty}>مكتبتك فارغة. أضف ملفات الأغاني من هاتفك لتظل محفوظة داخل التطبيق.</Text>
          )}
          <Text style={styles.notice}>الأغاني محفوظة محليًا على هاتفك. تشغيلها وإرسال صوتها للمشاهدين يحتاج استكمال مسار الصوت المباشر في LiveKit؛ هذه المكتبة وحدها لا تبث الموسيقى.</Text>
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
