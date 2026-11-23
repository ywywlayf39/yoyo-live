import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'react-native-compressor';
import { VideoView, useVideoPlayer } from 'expo-video';
import { File } from 'expo-file-system';
import { supabase } from './supabase';

const BG = '#0B0912', CARD = '#1A1423', PINK = '#F34E9B', GOLD = '#C5A15C';
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const MAX_ORIGINAL_BYTES = 200 * 1024 * 1024;

function ReelPlayer({ uri, active, height }) {
  const player = useVideoPlayer(uri, (instance) => { instance.loop = true; });
  useEffect(() => {
    if (active) player.play(); else player.pause();
    return () => { try { player.pause(); } catch (_) {} };
  }, [active, player]);
  return <VideoView player={player} style={{ width: '100%', height, backgroundColor: '#000' }} contentFit="contain" nativeControls={false} allowsFullscreen={false} allowsPictureInPicture={false} />;
}

export default function ReelsScreen({ userId, onBack }) {
  const { height: windowHeight } = useWindowDimensions();
  const reelHeight = Math.max(420, windowHeight - 190);
  const [reels, setReels] = useState([]);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;

  const loadReels = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('reels')
        .select('id,user_id,video_path,caption,duration_seconds,file_size_bytes,created_at')
        .eq('status', 'published').order('created_at', { ascending: false }).limit(60);
      if (error) throw error;
      const ids = [...new Set((data || []).map((item) => item.user_id))];
      let profiles = [];
      if (ids.length) {
        const { data: rows, error: profileError } = await supabase.from('profiles')
          .select('id,display_name').in('id', ids);
        if (profileError) throw profileError;
        profiles = rows || [];
      }
      const names = new Map(profiles.map((row) => [row.id, row.display_name]));
      const mapped = (data || []).map((item) => ({
        ...item,
        author: names.get(item.user_id) || 'عضو YOYO LIVE',
        videoUrl: supabase.storage.from('reels').getPublicUrl(item.video_path).data.publicUrl,
      }));
      setReels(mapped);
      setActiveId(mapped[0]?.id || null);
    } catch (error) {
      console.error('YOYO reels load failed:', error);
      Alert.alert('تعذر تحميل الريلز', error?.message || 'حاول مرة أخرى بعد قليل.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadReels(); }, [loadReels]);
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const first = viewableItems?.find((entry) => entry.isViewable)?.item;
    if (first?.id) setActiveId(first.id);
  }).current;

  const publishReel = async () => {
    if (uploading) return;
    if (!userId) { Alert.alert('سجل الدخول أولًا', 'لازم تسجل الدخول قبل نشر فيديو.'); return; }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('إذن المعرض مطلوب', 'اسمح ليويو لايف بالوصول للفيديوهات.'); return; }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'], allowsEditing: false, videoMaxDuration: 60, quality: 1,
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      if (asset.width && asset.height && asset.height <= asset.width) {
        Alert.alert('ريلز عمودية فقط', 'اختار فيديو بالطول عشان يظهر بشكل Reels ويملى الشاشة.');
        return;
      }
      const durationSeconds = Math.ceil((asset.duration || 0) / 1000);
      if (!durationSeconds || durationSeconds > 60) {
        Alert.alert('مدة الفيديو', 'اختار فيديو مدته من ثانية إلى 60 ثانية.'); return;
      }
      if (asset.fileSize && asset.fileSize > MAX_ORIGINAL_BYTES) {
        Alert.alert('حجم الفيديو كبير', 'اختار فيديو أصلي أقل من 200 ميجابايت عشان الموبايل يقدر يضغطه بأمان.'); return;
      }
      setUploading(true); setProgress(0);
      const compressedUri = await Video.compress(asset.uri, {
        compressionMethod: 'manual', maxSize: 720, bitrate: 1200000,
        minimumFileSizeForCompress: 0, preserveMetadata: false,
      }, (value) => setProgress(Math.max(0, Math.min(100, Math.round(value * 100)))));
      const compressedFile = new File(compressedUri);
      if (!compressedFile.exists || !compressedFile.size) throw new Error('تعذر تجهيز الفيديو بعد الضغط.');
      if (compressedFile.size > MAX_VIDEO_BYTES) throw new Error('حجم الفيديو بعد الضغط أكبر من 30 ميجابايت. اختار فيديو أقصر.');
      const bytes = await compressedFile.arrayBuffer();
      const storagePath = `${userId}/${Date.now()}.mp4`;
      const { error: uploadError } = await supabase.storage.from('reels').upload(storagePath, bytes, {
        contentType: 'video/mp4', cacheControl: '31536000', upsert: false,
      });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from('reels').insert({
        user_id: userId, video_path: storagePath, caption: caption.trim(),
        duration_seconds: durationSeconds, file_size_bytes: compressedFile.size, status: 'published',
      });
      if (insertError) {
        await supabase.storage.from('reels').remove([storagePath]);
        throw insertError;
      }
      setCaption('');
      Alert.alert('تم النشر 🎉', 'الريل اتنشر بنجاح.');
      await loadReels();
    } catch (error) {
      console.error('YOYO reel upload failed:', error);
      Alert.alert('تعذر نشر الفيديو', error?.message || 'حصلت مشكلة أثناء ضغط الفيديو أو رفعه.');
    } finally { setUploading(false); setProgress(0); }
  };

  const deleteReel = (item) => {
    if (item.user_id !== userId) return;
    Alert.alert('حذف الريل', 'متأكد إنك عايز تحذف الفيديو؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        try {
          const { error } = await supabase.from('reels').delete().eq('id', item.id).eq('user_id', userId);
          if (error) throw error;
          await supabase.storage.from('reels').remove([item.video_path]);
          setReels((current) => current.filter((row) => row.id !== item.id));
        } catch (error) { Alert.alert('تعذر الحذف', error?.message || 'حاول مرة أخرى.'); }
      }},
    ]);
  };

  const renderReel = ({ item }) => (
    <View style={[styles.reelCard, { height: reelHeight }]}>
      <ReelPlayer uri={item.videoUrl} active={item.id === activeId} height={reelHeight - 90} />
      <View style={styles.reelOverlay}>
        <View style={{ flex: 1 }}>
          <Text style={styles.author}>@{item.author}</Text>
          {!!item.caption && <Text style={styles.caption}>{item.caption}</Text>}
          <Text style={styles.meta}>{(item.file_size_bytes / 1024 / 1024).toFixed(1)} MB · {Math.round(item.duration_seconds)} ثانية</Text>
        </View>
        {item.user_id === userId && <TouchableOpacity onPress={() => deleteReel(item)} style={styles.deleteButton}><Text style={styles.deleteText}>حذف</Text></TouchableOpacity>}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}><Text style={styles.backText}>رجوع ←</Text></TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={styles.title}>YOYO REELS ✨</Text>
          <Text style={styles.subtitle}>فيديوهات قصيرة من أعضاء يويو لايف</Text>
        </View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.publishBox}>
          <TextInput value={caption} onChangeText={setCaption} placeholder="اكتب وصف الريل (اختياري)" placeholderTextColor="#9B91A5" maxLength={300} textAlign="right" style={styles.captionInput} />
          <TouchableOpacity onPress={publishReel} disabled={uploading} style={[styles.publishButton, uploading && { opacity: 0.65 }]}>
            {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishText}>＋ اختار فيديو وانشر ريل</Text>}
          </TouchableOpacity>
          {uploading && <Text style={styles.progressText}>جارٍ ضغط الفيديو وتجهيزه للرفع… {progress}%</Text>}
          <Text style={styles.limits}>عمودي 9:16 · حتى 60 ثانية · ضغط 720p · أقصى حجم بعد الضغط 30MB</Text>
        </View>
      </KeyboardAvoidingView>
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={PINK} /><Text style={styles.emptyText}>بنحمّل الريلز…</Text></View>
      ) : reels.length === 0 ? (
        <View style={styles.center}><Text style={styles.emptyIcon}>🎬</Text><Text style={styles.emptyTitle}>لسه مفيش ريلز</Text><Text style={styles.emptyText}>انشر أول فيديو قصير وخلي أعضاء YOYO LIVE يشوفوه.</Text></View>
      ) : (
        <FlatList data={reels} keyExtractor={(item) => item.id} renderItem={renderReel}
          pagingEnabled showsVerticalScrollIndicator={false} viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged} initialNumToRender={1}
          maxToRenderPerBatch={2} windowSize={3}
          getItemLayout={(_, index) => ({ length: reelHeight, offset: reelHeight * index, index })} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: { minHeight: 62, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#302537' },
  backButton: { padding: 10 }, backText: { color: PINK, fontWeight: 'bold', fontSize: 15 },
  title: { color: '#fff', fontSize: 21, fontWeight: '900' }, subtitle: { color: '#A99EAE', fontSize: 11, marginTop: 3 },
  publishBox: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#302537' },
  captionInput: { minHeight: 42, backgroundColor: CARD, borderRadius: 11, paddingHorizontal: 12, color: '#fff', marginBottom: 8 },
  publishButton: { backgroundColor: PINK, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  publishText: { color: '#fff', fontWeight: 'bold', fontSize: 15 }, progressText: { color: GOLD, textAlign: 'center', marginTop: 7, fontSize: 12 },
  limits: { color: '#9B91A5', textAlign: 'center', fontSize: 10, marginTop: 7 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyIcon: { fontSize: 52, marginBottom: 12 }, emptyTitle: { color: '#fff', fontWeight: 'bold', fontSize: 19 },
  emptyText: { color: '#A99EAE', textAlign: 'center', marginTop: 9, lineHeight: 22 },
  reelCard: { backgroundColor: '#000', marginBottom: 0 },
  reelOverlay: { minHeight: 90, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: BG },
  author: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'right' },
  caption: { color: '#eee', textAlign: 'right', marginTop: 5, lineHeight: 20 },
  meta: { color: '#A99EAE', textAlign: 'right', fontSize: 11, marginTop: 5 },
  deleteButton: { borderWidth: 1, borderColor: '#C94B69', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7, marginLeft: 12 },
  deleteText: { color: '#FF8FA8', fontWeight: 'bold' },
});
