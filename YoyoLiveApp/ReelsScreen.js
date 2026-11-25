import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, FlatList, KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Video } from 'react-native-compressor';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Directory, File, Paths } from 'expo-file-system';
import VideoTrim, { showEditor, mixAudio, deleteFile } from 'react-native-video-trim';
import { supabase } from './supabase';

const BG = '#0B0912', CARD = '#1A1423', PINK = '#F34E9B', GOLD = '#C5A15C';
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_ORIGINAL_BYTES = 200 * 1024 * 1024;
const REEL_MUSIC_FOLDER = new Directory(Paths.document, 'yoyo-reel-music');
const localFilePath = (uri) => decodeURIComponent(String(uri || '').replace(/^file:\/\//, ''));
const fileUri = (path) => String(path || '').startsWith('file://') ? path : `file://${path}`;

function ReelPreviewPlayer({ uri }) {
  const player = useVideoPlayer(uri, (instance) => { instance.loop = true; });
  useEffect(() => { player.play(); return () => { try { player.pause(); } catch (_) {} }; }, [player]);
  return <VideoView player={player} style={{ flex: 1, width: '100%', backgroundColor: '#000' }} contentFit="contain" nativeControls allowsFullscreen={false} allowsPictureInPicture={false} />;
}

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
  const [sideActionsOpen, setSideActionsOpen] = useState(true);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [myReelsOpen, setMyReelsOpen] = useState(false);
  const [commentsReel, setCommentsReel] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentBody, setCommentBody] = useState('');
  const [commentCounts, setCommentCounts] = useState({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentSending, setCommentSending] = useState(false);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;
  const cameraRef = useRef(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('back');
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [capturedVideo, setCapturedVideo] = useState(null);
  const [musicTrack, setMusicTrack] = useState(null);
  const [musicImporting, setMusicImporting] = useState(false);
  const [originalAudioVolume, setOriginalAudioVolume] = useState(0.75);
  const [backgroundAudioVolume, setBackgroundAudioVolume] = useState(0.8);
  const pendingMusicNameRef = useRef(null);
  const pendingEditorKindRef = useRef(null);

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
          .select('id,display_name,avatar_url').in('id', ids);
        if (profileError) throw profileError;
        profiles = rows || [];
      }
      const profileMap = new Map(profiles.map((row) => [row.id, row]));
      const reelIds = (data || []).map((item) => item.id);
      const [likesResult, followsResult, commentsResult] = await Promise.all([
        reelIds.length ? supabase.from('reel_likes').select('reel_id,user_id').in('reel_id', reelIds) : Promise.resolve({ data: [], error: null }),
        (userId && ids.length) ? supabase.from('user_follows').select('following_id').eq('follower_id', userId).in('following_id', ids) : Promise.resolve({ data: [], error: null }),
        reelIds.length ? supabase.from('reel_comments').select('id,reel_id').in('reel_id', reelIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (likesResult.error) throw likesResult.error;
      if (followsResult.error) throw followsResult.error;
      if (commentsResult.error) throw commentsResult.error;
      const likeCounts = new Map();
      const likedByMe = new Set();
      (likesResult.data || []).forEach((like) => {
        likeCounts.set(like.reel_id, (likeCounts.get(like.reel_id) || 0) + 1);
        if (like.user_id === userId) likedByMe.add(like.reel_id);
      });
      const followingIds = new Set((followsResult.data || []).map((row) => row.following_id));
      const counts = {};
      (commentsResult.data || []).forEach((row) => { counts[row.reel_id] = (counts[row.reel_id] || 0) + 1; });
      setCommentCounts(counts);
      const mapped = (data || []).map((item) => ({
        ...item,
        author: profileMap.get(item.user_id)?.display_name || 'عضو YOYO LIVE',
        authorAvatar: profileMap.get(item.user_id)?.avatar_url || null,
        likesCount: likeCounts.get(item.id) || 0,
        likedByMe: likedByMe.has(item.id),
        commentsCount: counts[item.id] || 0,
        isFollowing: followingIds.has(item.user_id),
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


  const loadComments = useCallback(async (reel) => {
    setCommentsReel(reel);
    setCommentsLoading(true);
    setCommentBody('');
    const { data, error } = await supabase.from('reel_comments')
      .select('id,reel_id,user_id,body,created_at')
      .eq('reel_id', reel.id).order('created_at', { ascending: true }).limit(100);
    if (error) {
      Alert.alert('تعذر تحميل التعليقات', error.message || 'حاول مرة أخرى.');
      setComments([]);
      setCommentsLoading(false);
      return;
    }
    const ids = [...new Set((data || []).map((row) => row.user_id))];
    const { data: profiles } = ids.length
      ? await supabase.from('profiles').select('id,display_name').in('id', ids)
      : { data: [] };
    const names = new Map((profiles || []).map((row) => [row.id, row.display_name]));
    setComments((data || []).map((row) => ({ ...row, author: names.get(row.user_id) || 'عضو YOYO LIVE' })));
    setCommentsLoading(false);
  }, []);

  useEffect(() => {
    if (!commentsReel?.id) return undefined;
    const channel = supabase.channel('reel-comments-' + commentsReel.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reel_comments', filter: 'reel_id=eq.' + commentsReel.id }, async (payload) => {
        const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', payload.new.user_id).maybeSingle();
        setComments((current) => current.some((row) => row.id === payload.new.id) ? current : [...current, { ...payload.new, author: profile?.display_name || 'عضو YOYO LIVE' }].slice(-100));
        setCommentCounts((current) => ({ ...current, [commentsReel.id]: (current[commentsReel.id] || 0) + 1 }));
        setReels((current) => current.map((item) => item.id === commentsReel.id
          ? { ...item, commentsCount: (item.commentsCount || 0) + 1 }
          : item));
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [commentsReel?.id]);

  const sendComment = async () => {
    const body = commentBody.trim();
    if (!body || !commentsReel || commentSending) return;
    setCommentSending(true);
    const { error } = await supabase.from('reel_comments').insert({ reel_id: commentsReel.id, user_id: userId, body });
    setCommentSending(false);
    if (error) { Alert.alert('تعذر إرسال التعليق', error.message || 'حاول مرة أخرى.'); return; }
    setCommentBody('');
  };

  const openReelCamera = async () => {
    try {
      const camera = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
      if (!camera?.granted) { Alert.alert('إذن الكاميرا مطلوب', 'اسمح ليويو لايف باستخدام الكاميرا لتصوير الريلز.'); return; }
      const microphone = microphonePermission?.granted ? microphonePermission : await requestMicrophonePermission();
      if (!microphone?.granted) { Alert.alert('إذن الميكروفون مطلوب', 'اسمح بالميكروفون لتسجيل صوت الفيديو.'); return; }
      setCameraReady(false);
      setRecordingSeconds(0);
      setCameraOpen(true);
    } catch (error) {
      Alert.alert('تعذر فتح الكاميرا', error?.message || 'حاول مرة أخرى.');
    }
  };

  const startCameraRecording = async () => {
    if (!cameraRef.current || !cameraReady || recording) return;
    setRecording(true);
    setRecordingSeconds(0);
    try {
      const result = await cameraRef.current.recordAsync({
        maxDuration: 180,
        maxFileSize: MAX_ORIGINAL_BYTES,
        progressUpdateInterval: 0.5,
      });
      if (result?.uri) {
        setCapturedVideo({
          uri: result.uri,
          durationSeconds: Math.max(1, Math.min(180, Math.ceil(recordingSeconds || 1))),
        });
        setCameraOpen(false);
      }
    } catch (error) {
      Alert.alert('تعذر تسجيل الفيديو', error?.message || 'حاول مرة أخرى.');
    } finally {
      setRecording(false);
    }
  };

  const stopCameraRecording = () => {
    if (recording) cameraRef.current?.stopRecording();
  };


  useEffect(() => {
    const finishSub = VideoTrim.onFinishTrimming(({ outputPath, duration }) => {
      const kind = pendingEditorKindRef.current || 'music';
      pendingEditorKindRef.current = null;
      if (kind === 'video') {
        setCapturedVideo((current) => current ? {
          ...current,
          uri: fileUri(outputPath),
          durationSeconds: Math.max(1, Math.ceil(Number(duration || 1000) / 1000)),
        } : current);
        Alert.alert('تم تعديل الفيديو 🎬', 'اتحفظت تعديلات القص والتدوير والسرعة على نسخة المعاينة.');
        return;
      }
      const name = pendingMusicNameRef.current || 'مقطع موسيقي';
      pendingMusicNameRef.current = null;
      setMusicTrack({ uri: fileUri(outputPath), name, durationMs: Number(duration || 0) });
      setMusicImporting(false);
      Alert.alert('تم اختيار المقطع 🎵', 'الموسيقى هتتركب داخل ملف الريل قبل النشر.');
    });
    const cancelSub = VideoTrim.onCancel(() => {
      pendingMusicNameRef.current = null;
      pendingEditorKindRef.current = null;
      setMusicImporting(false);
    });
    const errorSub = VideoTrim.onError(({ message }) => {
      pendingMusicNameRef.current = null;
      pendingEditorKindRef.current = null;
      setMusicImporting(false);
      Alert.alert('تعذر تجهيز الوسائط', message || 'حاول مرة أخرى.');
    });
    return () => {
      finishSub?.remove?.();
      cancelSub?.remove?.();
      errorSub?.remove?.();
    };
  }, []);

  const chooseReelMusic = async () => {
    if (musicImporting || uploading) return;
    setMusicImporting(true);
    try {
      const picked = await File.pickFileAsync({ multipleFiles: false, mimeTypes: ['audio/*'] });
      if (picked.canceled || !picked.result) {
        setMusicImporting(false);
        return;
      }
      const source = picked.result;
      if (Number(source.size || 0) > 50 * 1024 * 1024) {
        throw new Error('حجم ملف الموسيقى لازم يكون أقل من 50 ميجابايت.');
      }
      if (!REEL_MUSIC_FOLDER.exists) REEL_MUSIC_FOLDER.create({ idempotent: true, intermediates: true });
      const safeName = String(source.name || 'music-audio').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-90);
      const saved = new File(REEL_MUSIC_FOLDER, Date.now() + '-' + safeName);
      await source.copy(saved);
      pendingMusicNameRef.current = source.name || 'مقطع موسيقي';
      pendingEditorKindRef.current = 'music';
      showEditor(saved.uri, {
        type: 'audio',
        outputExt: 'm4a',
        maxDuration: 180000,
        headerText: 'اختار مقطع الأغنية',
        saveButtonText: 'استخدام المقطع',
        cancelButtonText: 'إلغاء',
        theme: 'dark',
      });
    } catch (error) {
      pendingMusicNameRef.current = null;
      setMusicImporting(false);
      Alert.alert('تعذر اختيار الموسيقى', error?.message || 'اختار ملف MP3 أو M4A أو WAV من هاتفك.');
    }
  };


  const editReelVideo = () => {
    if (!capturedVideo?.uri || uploading) return;
    pendingEditorKindRef.current = 'video';
    showEditor(capturedVideo.uri, {
      type: 'video',
      maxDuration: 180000,
      headerText: 'تعديل الريل',
      saveButtonText: 'حفظ التعديلات',
      cancelButtonText: 'إلغاء',
      theme: 'dark',
    });
  };

  const clearReelMusic = async () => {
    const old = musicTrack;
    setMusicTrack(null);
    if (old?.uri) {
      try { await deleteFile(localFilePath(old.uri)); } catch (_) {}
    }
  };

  const renderMusicControls = () => (
    <View style={styles.musicEditorBox}>
      <TouchableOpacity onPress={chooseReelMusic} disabled={musicImporting || uploading} style={styles.musicChooseButton}>
        <Text style={styles.musicChooseText}>{musicImporting ? 'جارٍ فتح محرر الأغنية…' : musicTrack ? '🎵 تغيير مقطع الأغنية' : '🎵 إضافة أغنية وتركيبها على الريل'}</Text>
      </TouchableOpacity>
      {musicTrack ? (
        <>
          <Text numberOfLines={1} style={styles.musicTrackName}>المقطع المختار: {musicTrack.name}</Text>
          <View style={styles.volumeRow}>
            <Text style={styles.volumeLabel}>صوت الفيديو</Text>
            {[0, 0.5, 1].map((value) => (
              <TouchableOpacity key={'original-' + value} onPress={() => setOriginalAudioVolume(value)} style={[styles.volumeChip, originalAudioVolume === value && styles.volumeChipActive]}>
                <Text style={styles.volumeChipText}>{Math.round(value * 100)}٪</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.volumeRow}>
            <Text style={styles.volumeLabel}>صوت الأغنية</Text>
            {[0.35, 0.65, 1].map((value) => (
              <TouchableOpacity key={'music-' + value} onPress={() => setBackgroundAudioVolume(value)} style={[styles.volumeChip, backgroundAudioVolume === value && styles.volumeChipActive]}>
                <Text style={styles.volumeChipText}>{Math.round(value * 100)}٪</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={clearReelMusic} style={styles.musicRemoveButton}>
            <Text style={styles.musicRemoveText}>إزالة الأغنية من الريل</Text>
          </TouchableOpacity>
        </>
      ) : <Text style={styles.musicHint}>اختار أغنية من هاتفك، وحدد الجزء اللي يعجبك، وهنركّبها داخل الفيديو نفسه.</Text>}
    </View>
  );

  const uploadReelAsset = async (asset, knownDurationSeconds = null) => {
    if (uploading) return false;
    if (!userId) { Alert.alert('سجل الدخول أولًا', 'لازم تسجل الدخول قبل نشر فيديو.'); return false; }
    let mixedOutputPath = null;
    try {
      const durationSeconds = Math.ceil(knownDurationSeconds || ((asset.duration || 0) / 1000));
      if (!durationSeconds || durationSeconds > 180) {
        Alert.alert('مدة الفيديو', 'اختار فيديو مدته من ثانية إلى 3 دقائق كحد أقصى.'); return false;
      }
      if (asset.fileSize && asset.fileSize > MAX_ORIGINAL_BYTES) {
        Alert.alert('حجم الفيديو كبير', 'اختار فيديو أصلي أقل من 200 ميجابايت عشان الموبايل يقدر يضغطه بأمان.'); return false;
      }
      setUploading(true); setProgress(0);
      let sourceVideoUri = asset.uri;
      if (musicTrack?.uri) {
        setProgress(5);
        const mixed = await mixAudio(
          localFilePath(asset.uri),
          localFilePath(musicTrack.uri),
          {
            originalAudioVolume,
            backgroundAudioVolume,
            loopAudio: true,
            outputExt: 'mp4',
          }
        );
        mixedOutputPath = mixed.outputPath;
        sourceVideoUri = fileUri(mixed.outputPath);
        setProgress(12);
      }
      const compressedUri = await Video.compress(sourceVideoUri, {
        compressionMethod: 'manual', maxSize: 720, bitrate: 900000,
        minimumFileSizeForCompress: 0, preserveMetadata: false,
      }, (value) => setProgress(Math.max(0, Math.min(100, Math.round(value * 100)))));
      if (mixedOutputPath) {
        try { await deleteFile(mixedOutputPath); } catch (cleanupError) { console.warn('YOYO reel music temp cleanup:', cleanupError?.message || cleanupError); }
        mixedOutputPath = null;
      }
      const compressedFile = new File(compressedUri);
      if (!compressedFile.exists || !compressedFile.size) throw new Error('تعذر تجهيز الفيديو بعد الضغط.');
      if (compressedFile.size > MAX_VIDEO_BYTES) throw new Error('حجم الفيديو بعد الضغط أكبر من 50 ميجابايت. جرّب جودة أو مدة أقل.');
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
      return true;
    } catch (error) {
      if (mixedOutputPath) { try { await deleteFile(mixedOutputPath); } catch (_) {} }
      console.error('YOYO reel upload failed:', error);
      Alert.alert('تعذر نشر الفيديو', error?.message || 'حصلت مشكلة أثناء ضغط الفيديو أو رفعه.');
      return false;
    } finally { setUploading(false); setProgress(0); }
  };

  const publishReel = async () => {
    if (uploading) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('إذن المعرض مطلوب', 'اسمح ليويو لايف بالوصول للفيديوهات.'); return; }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'], allowsEditing: false, videoMaxDuration: 180, quality: 1,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      const durationSeconds = Math.ceil((asset.duration || 0) / 1000);
      if (!durationSeconds || durationSeconds > 180) {
        Alert.alert('مدة الفيديو', 'اختار فيديو مدته من ثانية إلى 3 دقائق كحد أقصى.');
        return;
      }
      setCapturedVideo({
        uri: asset.uri,
        durationSeconds,
        fileSize: asset.fileSize || 0,
        source: 'gallery',
      });
    } catch (error) {
      Alert.alert('تعذر اختيار الفيديو', error?.message || 'حاول مرة أخرى.');
    }
  };

  const publishCapturedReel = async () => {
    if (!capturedVideo || uploading) return;
    const published = await uploadReelAsset({ uri: capturedVideo.uri, fileSize: capturedVideo.fileSize || 0 }, capturedVideo.durationSeconds);
    if (published) setCapturedVideo(null);
  };

  const toggleLike = async (item) => {
    if (!userId) { Alert.alert('سجل الدخول أولًا', 'سجل الدخول للإعجاب بالريلز.'); return; }
    const alreadyLiked = !!item.likedByMe;
    setReels((current) => current.map((row) => row.id === item.id
      ? { ...row, likedByMe: !alreadyLiked, likesCount: Math.max(0, (row.likesCount || 0) + (alreadyLiked ? -1 : 1)) }
      : row));
    const result = alreadyLiked
      ? await supabase.from('reel_likes').delete().eq('reel_id', item.id).eq('user_id', userId)
      : await supabase.from('reel_likes').insert({ reel_id: item.id, user_id: userId });
    if (result.error) {
      setReels((current) => current.map((row) => row.id === item.id
        ? { ...row, likedByMe: alreadyLiked, likesCount: Math.max(0, (row.likesCount || 0) + (alreadyLiked ? 1 : -1)) }
        : row));
      Alert.alert('تعذر تسجيل الإعجاب', result.error.message || 'حاول مرة أخرى.');
    }
  };

  const toggleFollow = async (item) => {
    if (!userId) { Alert.alert('سجل الدخول أولًا', 'سجل الدخول لمتابعة صاحب الريل.'); return; }
    if (item.user_id === userId) return;
    const alreadyFollowing = !!item.isFollowing;
    setReels((current) => current.map((row) => row.user_id === item.user_id ? { ...row, isFollowing: !alreadyFollowing } : row));
    const result = alreadyFollowing
      ? await supabase.from('user_follows').delete().eq('follower_id', userId).eq('following_id', item.user_id)
      : await supabase.from('user_follows').insert({ follower_id: userId, following_id: item.user_id });
    if (result.error) {
      setReels((current) => current.map((row) => row.user_id === item.user_id ? { ...row, isFollowing: alreadyFollowing } : row));
      Alert.alert('تعذرت المتابعة', result.error.message || 'حاول مرة أخرى.');
    }
  };

  const deleteReel = (item) => {
    if (item.user_id !== userId) return;
    Alert.alert('حذف الريل', 'متأكد إنك عايز تحذف الفيديو؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        try {
          const { error } = await supabase.from('reels').delete().eq('id', item.id).eq('user_id', userId);
          if (error) throw error;
          const { error: storageError } = await supabase.storage.from('reels').remove([item.video_path]);
          if (storageError) console.warn('YOYO reel storage cleanup:', storageError.message);
          setReels((current) => current.filter((row) => row.id !== item.id));
          setMyReelsOpen(false);
          Alert.alert('تم الحذف', 'اتحذف الريل من حسابك.');
        } catch (error) { Alert.alert('تعذر الحذف', error?.message || 'حاول مرة أخرى.'); }
      }},
    ]);
  };

  const renderReel = ({ item }) => (
    <View style={[styles.reelCard, { height: reelHeight }]}>
      <ReelPlayer uri={item.videoUrl} active={item.id === activeId} height={reelHeight} />
      <View style={styles.reelOverlay}>
        <View style={{ flex: 1 }}>
          <View style={styles.authorRow}>
            {item.authorAvatar ? <Image source={{ uri: item.authorAvatar }} style={styles.authorAvatar} /> : <View style={styles.authorAvatarFallback}><Text style={{ color: '#fff', fontWeight: 'bold' }}>☺</Text></View>}
            <Text numberOfLines={1} style={styles.author}>@{item.author}</Text>
          </View>
          {!!item.caption && <Text numberOfLines={2} style={styles.caption}>{item.caption}</Text>}
        </View>
        {item.user_id === userId && <TouchableOpacity onPress={() => deleteReel(item)} style={styles.deleteButton}><Text style={styles.deleteText}>حذف</Text></TouchableOpacity>}
      </View>
      <View style={styles.sideActions}>
        <TouchableOpacity onPress={() => setSideActionsOpen((value) => !value)} style={styles.sideArrow}>
          <Text style={styles.sideArrowText}>{sideActionsOpen ? '›' : '‹'}</Text>
        </TouchableOpacity>
        {sideActionsOpen && <>
          <TouchableOpacity onPress={() => toggleLike(item)} style={[styles.sideActionButton, item.likedByMe && styles.actionActive]}>
            <Text style={[styles.sideActionIcon, item.likedByMe && styles.actionTextActive]}>{item.likedByMe ? '♥' : '♡'}</Text>
            <Text style={styles.sideActionCount}>{item.likesCount || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => loadComments(item)} style={styles.sideActionButton}>
            <Text style={styles.sideActionIcon}>💬</Text>
            <Text style={styles.sideActionCount}>{item.commentsCount ?? commentCounts[item.id] ?? 0}</Text>
          </TouchableOpacity>
          {item.user_id !== userId && <TouchableOpacity onPress={() => toggleFollow(item)} style={[styles.sideActionButton, item.isFollowing && styles.actionFollowing]}>
            <Text style={styles.sideActionIcon}>{item.isFollowing ? '✓' : '+'}</Text>
            <Text style={styles.sideActionCount}>{item.isFollowing ? 'متابَع' : 'متابعة'}</Text>
          </TouchableOpacity>}
        </>}
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
          <Text style={styles.subtitle}>فيديوهات قصيرة</Text>
        </View>
        <TouchableOpacity onPress={() => setMyReelsOpen(true)} style={styles.headerAction}>
          <Text style={styles.headerActionText}>ريلزك</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCreatePanelOpen(true)} style={styles.createArrow}>
          <Text style={styles.createArrowText}>＋</Text>
          <Text style={styles.createArrowLabel}>ريل</Text>
        </TouchableOpacity>
      </View>
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

      <Modal visible={createPanelOpen} transparent animationType="fade" onRequestClose={() => setCreatePanelOpen(false)}>
        <View style={styles.panelBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.panelWrap}>
            <View style={styles.createPanel}>
              <View style={styles.panelHeading}>
                <TouchableOpacity onPress={() => setCreatePanelOpen(false)}><Text style={styles.panelClose}>إغلاق ✕</Text></TouchableOpacity>
                <Text style={styles.panelTitle}>إنشاء ريل جديد</Text>
              </View>
              {renderMusicControls()}
              <TextInput value={caption} onChangeText={setCaption} placeholder="اكتب وصف الريل (اختياري)" placeholderTextColor="#9B91A5" maxLength={300} textAlign="right" style={styles.captionInput} />
              <TouchableOpacity onPress={() => { setCreatePanelOpen(false); openReelCamera(); }} disabled={uploading} style={[styles.publishButton, uploading && { opacity: 0.65 }]}>
                <Text style={styles.publishText}>● صوّر ريل بالكاميرا · حتى 3 دقائق</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setCreatePanelOpen(false); publishReel(); }} disabled={uploading} style={[styles.galleryButton, uploading && { opacity: 0.65 }]}>
                {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishText}>اختار فيديو من المعرض</Text>}
              </TouchableOpacity>
              {uploading && <Text style={styles.progressText}>جارٍ ضغط الفيديو وتجهيزه للرفع… {progress}%</Text>}
              <Text style={styles.limits}>تصوير مباشر أو من المعرض · حتى 3 دقائق · ضغط 720p · أقصى حجم 50MB</Text>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={myReelsOpen} transparent animationType="slide" onRequestClose={() => setMyReelsOpen(false)}>
        <View style={styles.panelBackdrop}>
          <View style={styles.myReelsPanel}>
            <View style={styles.panelHeading}>
              <TouchableOpacity onPress={() => setMyReelsOpen(false)}><Text style={styles.panelClose}>إغلاق ✕</Text></TouchableOpacity>
              <Text style={styles.panelTitle}>إدارة ريلزك</Text>
            </View>
            <Text style={styles.myReelsHint}>هنا هتلاقي كل الريلز المنشورة من حسابك، وتقدر تحذف أي ريل.</Text>
            <FlatList
              data={reels.filter((item) => item.user_id === userId)}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={<Text style={styles.emptyText}>لسه منزلتش أي ريلز.</Text>}
              renderItem={({ item }) => (
                <View style={styles.myReelRow}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.myReelCaption}>{item.caption?.trim() || 'ريل بدون وصف'}</Text>
                    <Text style={styles.myReelDate}>{new Date(item.created_at).toLocaleDateString('ar-EG')}</Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteReel(item)} style={styles.myReelDelete}>
                    <Text style={styles.myReelDeleteText}>حذف</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={cameraOpen} animationType="slide" onRequestClose={() => { if (!recording) setCameraOpen(false); }}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView ref={cameraRef} style={{ flex: 1 }} facing={cameraFacing} mode="video" videoQuality="720p" videoBitrate={1800000}
            onCameraReady={() => setCameraReady(true)}
            onMountError={(event) => Alert.alert('الكاميرا غير متاحة', event.message || 'تعذر تشغيل الكاميرا.')}
            onRecordingProgress={(event) => setRecordingSeconds(Math.min(180, event.duration || 0))} />
          <View style={{ position: 'absolute', top: 42, left: 18, right: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <TouchableOpacity disabled={recording} onPress={() => setCameraOpen(false)} style={styles.cameraControl}><Text style={styles.cameraControlText}>إغلاق ✕</Text></TouchableOpacity>
            <TouchableOpacity disabled={recording} onPress={() => setCameraFacing((value) => value === 'back' ? 'front' : 'back')} style={styles.cameraControl}><Text style={styles.cameraControlText}>تبديل الكاميرا ↻</Text></TouchableOpacity>
          </View>
          <View style={{ position: 'absolute', bottom: 42, left: 0, right: 0, alignItems: 'center', gap: 14 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>{recording ? `● ${Math.floor(recordingSeconds / 60)}:${String(Math.floor(recordingSeconds % 60)).padStart(2, '0')} / 3:00` : 'جاهز لتصوير ريل'}</Text>
            <TouchableOpacity disabled={!cameraReady} onPress={recording ? stopCameraRecording : startCameraRecording}
              style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: '#fff', backgroundColor: recording ? '#E33D55' : PINK, alignItems: 'center', justifyContent: 'center', opacity: cameraReady ? 1 : 0.45 }}>
              <View style={{ width: recording ? 25 : 48, height: recording ? 25 : 48, borderRadius: recording ? 6 : 24, backgroundColor: '#fff' }} />
            </TouchableOpacity>
            <Text style={{ color: '#fff', fontSize: 12 }}>الحد الأقصى 3 دقائق · التسجيل بالصوت والصورة</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={!!capturedVideo} animationType="slide" onRequestClose={() => setCapturedVideo(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setCapturedVideo(null)}><Text style={{ color: PINK, fontWeight: 'bold' }}>إلغاء</Text></TouchableOpacity>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>معاينة الريل</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {capturedVideo?.uri ? <ReelPreviewPlayer uri={capturedVideo.uri} /> : null}
          </View>
          <View style={{ padding: 16, gap: 10 }}>
            <TouchableOpacity onPress={editReelVideo} style={styles.videoEditButton}>
              <Text style={styles.videoEditText}>🎬 قص وتدوير وتغيير سرعة الفيديو</Text>
            </TouchableOpacity>
            {renderMusicControls()}
            <Text style={{ color: GOLD, textAlign: 'center' }}>مدة الفيديو: {Math.floor((capturedVideo?.durationSeconds || 0) / 60)}:{String((capturedVideo?.durationSeconds || 0) % 60).padStart(2, '0')}</Text>
            <TouchableOpacity onPress={publishCapturedReel} disabled={uploading} style={styles.publishButton}>
              {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishText}>انشر الريل الآن</Text>}
            </TouchableOpacity>
            {uploading && <Text style={styles.progressText}>جارٍ تجهيز ورفع الفيديو… {progress}%</Text>}
            <TouchableOpacity onPress={() => { setCapturedVideo(null); openReelCamera(); }} disabled={uploading} style={styles.galleryButton}>
              <Text style={styles.publishText}>إعادة التصوير</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!commentsReel} transparent animationType="slide" onRequestClose={() => setCommentsReel(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}><View style={{ height: '72%', backgroundColor: CARD, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: Platform.OS === 'android' ? 30 : 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <TouchableOpacity onPress={() => setCommentsReel(null)}><Text style={{ color: PINK, fontWeight: 'bold' }}>إغلاق</Text></TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {commentsReel?.authorAvatar ? <Image source={{ uri: commentsReel.authorAvatar }} style={{ width: 32, height: 32, borderRadius: 16 }} /> : <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#49334F', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff' }}>☺</Text></View>}
                <View><Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'right' }}>تعليقات الريل 💬</Text><Text style={{ color: GOLD, fontSize: 12, textAlign: 'right' }}>@{commentsReel?.author || 'عضو YOYO LIVE'}</Text></View>
              </View>
            </View>
            {commentsLoading ? <ActivityIndicator color={PINK} /> : (
              <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                {comments.length ? comments.map((row) => (
                  <View key={row.id} style={{ padding: 10, marginBottom: 7, borderRadius: 12, backgroundColor: '#2A2035' }}>
                    <Text style={{ color: GOLD, fontWeight: 'bold', textAlign: 'right' }}>{row.author}</Text>
                    <Text style={{ color: '#fff', textAlign: 'right', marginTop: 4 }}>{row.body}</Text>
                  </View>
                )) : <Text style={{ color: '#BDB3C7', textAlign: 'center', marginTop: 30 }}>لسه مفيش تعليقات. اكتب أول تعليق 👋</Text>}
              </ScrollView>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 }}>
              <TouchableOpacity onPress={sendComment} disabled={!commentBody.trim() || commentSending} style={{ backgroundColor: PINK, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>{commentSending ? '...' : 'إرسال'}</Text>
              </TouchableOpacity>
              <TextInput value={commentBody} onChangeText={setCommentBody} placeholder="اكتب تعليقك على الريل..." placeholderTextColor="#9B91A5" maxLength={240} multiline style={{ flex: 1, minHeight: 44, maxHeight: 90, backgroundColor: '#120E19', borderRadius: 13, paddingHorizontal: 12, color: '#fff', textAlign: 'right' }} />
            </View>
          </View></KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: { minHeight: 52, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#302537', gap: 5 },
  headerAction: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#2B2033', borderWidth: 1, borderColor: '#68445F' },
  headerActionText: { color: '#F4D9EA', fontSize: 12, fontWeight: 'bold' },
  createArrow: { minWidth: 48, minHeight: 42, paddingHorizontal: 8, borderRadius: 13, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  createArrowText: { color: '#fff', fontSize: 19, fontWeight: '900', lineHeight: 21 },
  createArrowLabel: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  backButton: { padding: 10 }, backText: { color: PINK, fontWeight: 'bold', fontSize: 15 },
  title: { color: '#fff', fontSize: 21, fontWeight: '900' }, subtitle: { color: '#A99EAE', fontSize: 11, marginTop: 3 },
  panelBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  panelWrap: { width: '100%' },
  createPanel: { backgroundColor: CARD, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28, borderWidth: 1, borderColor: '#59364F' },
  myReelsPanel: { height: '72%', backgroundColor: CARD, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, borderWidth: 1, borderColor: '#59364F' },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  panelTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  panelClose: { color: PINK, fontWeight: 'bold', padding: 5 },
  myReelsHint: { color: '#BDB3C7', textAlign: 'right', fontSize: 12, marginBottom: 12 },
  myReelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#392B43' },
  myReelCaption: { color: '#fff', textAlign: 'right', fontWeight: 'bold' },
  myReelDate: { color: '#A99EAE', textAlign: 'right', fontSize: 11, marginTop: 4 },
  myReelDelete: { backgroundColor: '#592538', borderColor: '#C94B69', borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
  myReelDeleteText: { color: '#FF9EAD', fontWeight: 'bold' },
  captionInput: { minHeight: 42, backgroundColor: CARD, borderRadius: 11, paddingHorizontal: 12, color: '#fff', marginBottom: 8 },
  publishButton: { backgroundColor: PINK, minHeight: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  galleryButton: { backgroundColor: '#38283F', minHeight: 43, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderWidth: 1, borderColor: '#65465F' },
  cameraControl: { backgroundColor: 'rgba(20,14,25,0.82)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#A46B91' },
  cameraControlText: { color: '#fff', fontWeight: 'bold' },
  publishText: { color: '#fff', fontWeight: 'bold', fontSize: 15 }, progressText: { color: GOLD, textAlign: 'center', marginTop: 7, fontSize: 12 },
  videoEditButton: { minHeight: 42, borderRadius: 10, backgroundColor: '#27364B', borderWidth: 1, borderColor: '#58749B', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  videoEditText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  musicEditorBox: { backgroundColor: '#120E19', borderRadius: 13, padding: 11, marginBottom: 10, borderWidth: 1, borderColor: '#49344F' },
  musicChooseButton: { minHeight: 42, borderRadius: 10, backgroundColor: '#61305C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  musicChooseText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  musicTrackName: { color: '#F5C451', textAlign: 'right', fontSize: 12, marginTop: 8 },
  musicHint: { color: '#BDB3C7', textAlign: 'right', fontSize: 11, lineHeight: 18, marginTop: 7 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginTop: 8 },
  volumeLabel: { color: '#E9DCEB', fontSize: 11, flex: 1, textAlign: 'right' },
  volumeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#30243A', borderWidth: 1, borderColor: '#594565' },
  volumeChipActive: { backgroundColor: '#8C285B', borderColor: PINK },
  volumeChipText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  musicRemoveButton: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 6, marginTop: 7 },
  musicRemoveText: { color: '#FF9EAD', fontSize: 11, fontWeight: 'bold' },
  limits: { color: '#9B91A5', textAlign: 'center', fontSize: 10, marginTop: 7 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyIcon: { fontSize: 52, marginBottom: 12 }, emptyTitle: { color: '#fff', fontWeight: 'bold', fontSize: 19 },
  emptyText: { color: '#A99EAE', textAlign: 'center', marginTop: 9, lineHeight: 22 },
  reelCard: { backgroundColor: '#000', marginBottom: 0, position: 'relative' },
  sideActions: { position: 'absolute', zIndex: 20, right: 9, top: '34%', alignItems: 'center', gap: 12 },
  sideArrow: { width: 30, height: 42, borderRadius: 16, backgroundColor: 'rgba(20,14,25,0.88)', borderWidth: 1, borderColor: '#76506A', alignItems: 'center', justifyContent: 'center' },
  sideArrowText: { color: '#fff', fontSize: 25, fontWeight: 'bold', lineHeight: 28 },
  sideActionButton: { minWidth: 48, minHeight: 52, paddingHorizontal: 7, paddingVertical: 7, borderRadius: 22, backgroundColor: 'rgba(20,14,25,0.88)', borderWidth: 1, borderColor: '#6C4260', alignItems: 'center', justifyContent: 'center' },
  sideActionIcon: { color: '#fff', fontSize: 25, fontWeight: '900' },
  sideActionCount: { color: '#fff', fontSize: 10, fontWeight: 'bold', marginTop: 1 },
  reelOverlay: { position: 'absolute', top: 12, left: 12, right: 68, minHeight: 62, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(11,9,18,0.78)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(243,78,155,0.55)', zIndex: 15 },
  authorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, minHeight: 42 },
  authorAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: PINK },
  authorAvatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#49334F', alignItems: 'center', justifyContent: 'center' },
  author: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'right', flexShrink: 1 },
  caption: { color: '#eee', textAlign: 'right', marginTop: 5, lineHeight: 20 },
  meta: { color: '#A99EAE', textAlign: 'right', fontSize: 11, marginTop: 5 },
  deleteButton: { borderWidth: 1, borderColor: '#C94B69', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7, marginLeft: 12 },
  actionButton: { borderWidth: 1, borderColor: '#6C4260', backgroundColor: '#241629', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 7 },
  actionActive: { borderColor: PINK, backgroundColor: '#4A1835' },
  actionFollowing: { borderColor: GOLD, backgroundColor: '#302719' },
  actionText: { color: '#F4EAF2', fontWeight: 'bold', fontSize: 12 },
  actionTextActive: { color: '#FF78B6' },
  deleteText: { color: '#FF8FA8', fontWeight: 'bold' },
});
