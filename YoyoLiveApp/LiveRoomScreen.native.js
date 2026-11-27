import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
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
  useLocalParticipant,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { supabase } from './supabase';
import LiveGiftPanel from './LiveGiftPanel';
import LiveBattlePanel from './LiveBattlePanel';
import LiveMusicLibrary from './LiveMusicLibrary';
import LiveMusicSync from './LiveMusicSync';
import LiveRoomChat from './LiveRoomChat';
import LiveBattleVote from './LiveBattleVote';
import ProfileFrame from './ProfileFrame';

function formatBroadcastDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':');
}

function RoomContent({ isHost, isCall, callType, hostName, onLeave, error, userId, receiverId, roomName, broadcastDuration, isStandby, onStandbyChange, onOpenPackages, viewerPresenceReady }) {
  const tracks = useTracks([Track.Source.Camera]);
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [micBusy, setMicBusy] = useState(false);
  const [roomStandby, setRoomStandby] = useState(false);
  const [hostAvatar, setHostAvatar] = useState(null);
  const [hostFrameCode, setHostFrameCode] = useState(null);
  const [toolsVisible, setToolsVisible] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [selectedVideoFilter, setSelectedVideoFilter] = useState('none');
  const showStandby = isHost ? isStandby : roomStandby;

  useEffect(() => {
    if (isCall || !roomName) return undefined;
    let active = true;
    const loadRoomHost = async () => {
      const { data: room } = await supabase.from('live_rooms')
        .select('is_standby,host_id').eq('room_name', roomName).eq('status', 'live').maybeSingle();
      if (!active || !room) return;
      setRoomStandby(room.is_standby === true);
      if (isHost) onStandbyChange?.(room.is_standby === true);
      if (room.host_id) {
        const { data: profile } = await supabase.from('member_public_profiles')
          .select('avatar_url,selected_frame_code').eq('id', room.host_id).maybeSingle();
        if (active && profile) {
          setHostAvatar(profile.avatar_url || null);
          setHostFrameCode(profile.selected_frame_code || null);
        }
      }
    };
    loadRoomHost();
    const channel = supabase.channel('live-standby-' + roomName)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_rooms', filter: 'room_name=eq.' + roomName },
        (payload) => setRoomStandby(payload.new?.is_standby === true))
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [roomName, isCall, isHost, onStandbyChange]);
  const videoTracks = tracks.filter(isTrackReference);

  useEffect(() => {
    if (!isHost || isCall) return;
    const publication = localParticipant?.getTrackPublication?.(Track.Source.Camera);
    const mediaTrack = publication?.track?.mediaStreamTrack;
    if (!mediaTrack || typeof mediaTrack._setVideoEffects !== 'function') return;
    try {
      if (selectedVideoFilter === 'none') mediaTrack._setVideoEffects([]);
      else mediaTrack._setVideoEffect('yoyo_' + selectedVideoFilter);
    } catch (filterError) {
      console.warn('YOYO LIVE camera filter failed:', filterError?.message || filterError);
      Alert.alert('تعذر تطبيق الفلتر', 'حاول مرة أخرى بعد إعادة تشغيل البث.');
    }
  }, [isHost, isCall, localParticipant, selectedVideoFilter, tracks.length]);


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
        <View style={styles.headerLeft}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="رجوع" style={styles.backButton} onPress={() => onLeave?.()} activeOpacity={0.85}>
            <Text style={styles.backButtonText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.livePill}><Text style={styles.livePillText}>LIVE</Text></View>
        </View>
        <View style={styles.headerInfo}>
          <Text numberOfLines={1} style={styles.hostName}>{hostName || 'بث YOYO LIVE'}</Text>
          <Text style={styles.roomStatus}>{isCall ? (callType === 'audio' ? 'مكالمة صوتية' : 'مكالمة فيديو') : isHost ? 'أنت تبث الآن' : 'أنت تشاهد البث المباشر'}</Text>
        </View>
      </View>
      {!isCall ? (
        <View style={styles.durationBadge}>
          <Text style={styles.durationLabel}>مدة البث</Text>
          <Text style={styles.durationText}>{broadcastDuration || '00:00:00'}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isHost && !isCall && toolsVisible ? (
        <View style={styles.hostControls}>
          <TouchableOpacity
            style={[styles.standbyButton, showStandby && styles.standbyButtonActive]}
            onPress={async () => {
              const next = !showStandby;
              const { error: standbyError } = await supabase.rpc('yoyo_set_live_standby', {
                p_room_name: roomName, p_enabled: next,
              });
              if (standbyError) {
                Alert.alert('تعذر تغيير وضع البث', standbyError.message || 'حاول مرة أخرى.');
                return;
              }
              onStandbyChange?.(next);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.standbyButtonText}>{showStandby ? '▶ الكاميرا' : '⏸ انتظار'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={micBusy}
            style={[styles.micButton, !isMicrophoneEnabled && styles.micButtonMuted, micBusy && { opacity: 0.6 }]}
            onPress={async () => {
              if (micBusy) return;
              setMicBusy(true);
              try {
                await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
              } catch (micError) {
                Alert.alert('تعذر تغيير الميكروفون', micError?.message || 'تأكد من صلاحية الميكروفون ثم حاول مرة أخرى.');
              } finally {
                setMicBusy(false);
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.standbyButtonText}>{micBusy ? '...' : isMicrophoneEnabled ? '🎙️ الميكروفون مفتوح' : '🔇 الميكروفون مكتوم'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.filterMenuButton}
            onPress={() => { setToolsVisible(false); setFiltersVisible(true); }}
            activeOpacity={0.85}
          >
            <Text style={styles.standbyButtonText}>✨ الفلاتر</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View pointerEvents="none" style={styles.videoStage}>
        {showStandby && !isCall ? (
          <View style={styles.standbyView}>
            <ProfileFrame frameCode={hostFrameCode} size={136}>
              {hostAvatar ? <Image source={{ uri: hostAvatar }} style={{ width: '100%', height: '100%' }} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#34263F' }}><Text style={styles.standbyAvatarEmoji}>👤</Text></View>}
            </ProfileFrame>
            <Text style={styles.standbyTitle}>{hostName || 'صاحب البث'}</Text>
            <Text style={styles.standbyText}>في وضع الانتظار</Text>
            <Text style={styles.standbySubtext}>الصوت مستمر ويمكنك الاستماع للبث</Text>
          </View>
        ) : videoTracks.length > 0 ? videoTracks.map((track, index) => (
          <VideoTrack
            key={track.publication.trackSid || `${track.participant.identity}-${index}`}
            trackRef={track}
            objectFit="contain"
            style={styles.video}
          />
        )) : (
          <View style={styles.waiting}>
            <Text style={styles.waitingEmoji}>{isCall && callType === 'audio' ? '📞' : '📹'}</Text>
            <Text style={styles.waitingText}>{isCall && callType === 'audio' ? 'المكالمة الصوتية جاهزة. يمكنك التحدث الآن.' : 'جاري الاتصال بالبث واستقبال الصورة...'}</Text>
          </View>
        )}
      </View>

      {toolsVisible ? (
      <ScrollView
        style={styles.overlayPanelsScroll}
        contentContainerStyle={styles.overlayPanelsContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {!isCall && isHost && userId ? <LiveMusicLibrary roomName={roomName} userId={userId} /> : null}
        
        {!isCall && isHost && userId ? <LiveBattlePanel userId={userId} roomName={roomName} isHost={isHost} /> : null}
        {!isCall && userId ? <LiveBattleVote roomName={roomName} userId={userId} /> : null}
        {!isCall && !isHost && userId ? (
          <TouchableOpacity style={styles.reportButton} onPress={reportLiveRoom} activeOpacity={0.85}>
            <Text style={styles.reportButtonText}>🚩 إبلاغ عن البث</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      ) : null}


      {isHost && !isCall && filtersVisible ? (
        <View style={styles.filterPanel}>
          <View style={styles.filterPanelHeader}>
            <Text style={styles.filterPanelTitle}>اختار فلتر البث</Text>
            <TouchableOpacity onPress={() => setFiltersVisible(false)} style={styles.filterPanelClose}>
              <Text style={styles.filterPanelCloseText}>إغلاق ✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChoices}>
            {[
              { id: 'none', label: 'بدون', emoji: '🚫' },
              { id: 'warm', label: 'دافئ', emoji: '🌅' },
              { id: 'cool', label: 'بارد', emoji: '❄️' },
              { id: 'mono', label: 'أبيض وأسود', emoji: '⚫' },
              { id: 'vintage', label: 'كلاسيك', emoji: '📷' },
              { id: 'vivid', label: 'ألوان زاهية', emoji: '🌈' },
              { id: 'bright', label: 'إضاءة', emoji: '☀️' },
            ].map((item) => (
              <TouchableOpacity key={item.id} style={[styles.filterChoice, selectedVideoFilter === item.id && styles.filterChoiceActive]} onPress={() => setSelectedVideoFilter(item.id)} activeOpacity={0.8}>
                <Text style={styles.filterChoiceEmoji}>{item.emoji}</Text>
                <Text style={styles.filterChoiceLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.filterHint}>الفلاتر تُطبّق على فيديو البث الذي يشاهده الجمهور.</Text>
        </View>
      ) : null}

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={toolsVisible ? 'إخفاء أدوات البث' : 'إظهار أدوات البث'}
        style={styles.toolsToggle}
        onPress={() => { setFiltersVisible(false); setToolsVisible((visible) => !visible); }}
        activeOpacity={0.85}
      >
        <Text style={styles.toolsToggleText}>{toolsVisible ? '‹' : '›'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.leaveButton} onPress={() => Alert.alert(
        isCall ? 'إنهاء المكالمة' : isHost ? 'إنهاء البث المباشر' : 'مغادرة البث',
        isCall ? 'هل أنت متأكد أنك تريد إنهاء المكالمة؟' : isHost ? 'هل تريد إنهاء البث المباشر وفصل جميع المشاهدين؟' : 'هل تريد مغادرة البث؟',
        [
          { text: 'استمرار', style: 'cancel' },
          { text: isHost ? 'إنهاء البث' : isCall ? 'إنهاء المكالمة' : 'مغادرة', style: 'destructive', onPress: () => onLeave?.() },
        ],
      )} activeOpacity={0.85}>
        <Text style={styles.leaveButtonText}>{isCall ? 'إنهاء المكالمة' : isHost ? 'إنهاء البث' : 'مغادرة البث'}</Text>
      </TouchableOpacity>

      {!isCall && userId && (isHost || viewerPresenceReady) ? <LiveMusicSync roomName={roomName} userId={userId} isHost={isHost} /> : null}
      {!isCall && userId ? <LiveRoomChat roomName={roomName} userId={userId} isHost={isHost} /> : null}
      {!isCall && userId ? <LiveGiftPanel userId={userId} receiverId={receiverId} isHost={isHost} roomName={roomName} onOpenPackages={onOpenPackages} /> : null}

    </View>
  );
}

export default function LiveRoomScreen({ roomName, isHost, isCall = false, callType = 'video', hostName, onClose, userId, receiverId, onOpenPackages }) {
  // Keep the display awake for the entire live room / call; release it on exit.
  useKeepAwake();
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState('');
  const [broadcastStartedAt, setBroadcastStartedAt] = useState(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [isStandby, setIsStandby] = useState(false);
  const [viewerPresenceReady, setViewerPresenceReady] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const roomDisconnectedRef = useRef(false);
  const roomDisconnectWaitersRef = useRef([]);

  const markRoomDisconnected = () => {
    roomDisconnectedRef.current = true;
    const waiters = roomDisconnectWaitersRef.current.splice(0);
    waiters.forEach((finish) => finish());
  };

  const waitForRoomDisconnect = () => new Promise((resolve) => {
    if (roomDisconnectedRef.current) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      roomDisconnectWaitersRef.current = roomDisconnectWaitersRef.current.filter((item) => item !== finish);
      resolve();
    };
    const timeout = setTimeout(finish, 2500);
    roomDisconnectWaitersRef.current.push(finish);
  });

  useEffect(() => {
    roomDisconnectedRef.current = false;
    return () => {
      const waiters = roomDisconnectWaitersRef.current.splice(0);
      waiters.forEach((finish) => finish());
    };
  }, [roomName]);

  useEffect(() => {
    if (isCall || !isHost || !roomName || !userId) return undefined;
    let active = true;
    const sendHeartbeat = async () => {
      const { data, error: heartbeatError } = await supabase.rpc('yoyo_touch_live_room', {
        p_room_name: roomName,
      });
      if (heartbeatError && active) {
        console.warn('YOYO LIVE host heartbeat failed:', heartbeatError.message);
      } else if (data !== true && active) {
        console.warn('YOYO LIVE host heartbeat did not match an active room.');
      }
    };
    sendHeartbeat();
    const timer = setInterval(sendHeartbeat, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [roomName, userId, isHost, isCall]);

  useEffect(() => {
    if (isCall || !roomName || !userId) {
      setViewerPresenceReady(true);
      return undefined;
    }
    // The broadcaster is not a viewer and must never inflate the audience count.
    if (isHost) {
      setViewerPresenceReady(true);
      return undefined;
    }
    setViewerPresenceReady(false);
    let active = true;
    const sendViewerHeartbeat = async () => {
      const { error: heartbeatError } = await supabase.rpc('yoyo_live_viewer_heartbeat', {
        p_room_name: roomName,
      });
      if (!active) return;
      if (heartbeatError) {
        console.warn('YOYO LIVE viewer heartbeat failed:', heartbeatError.message);
        setViewerPresenceReady(false);
        return;
      }
      setViewerPresenceReady(true);
    };
    sendViewerHeartbeat();
    const timer = setInterval(sendViewerHeartbeat, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      // Best-effort immediate leave; the 45-second heartbeat expiry is the
      // fallback when Android kills the app or the network disappears.
      supabase.rpc('yoyo_live_viewer_leave', { p_room_name: roomName }).then(() => {});
    };
  }, [roomName, userId, isHost, isCall]);


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
    if (isLeaving) return;
    setIsLeaving(true);

    // Stop room-scoped features while the live room is still valid.
    // Cleanup failures are isolated so they cannot prevent ending the broadcast.
    if (isHost && !isCall) {
      await Promise.allSettled([
        (async () => {
          const { data: sharedMusic, error: lookupError } = await supabase
            .from('live_room_music')
            .select('storage_path')
            .eq('room_name', roomName)
            .maybeSingle();
          if (lookupError) throw lookupError;
          const { error: stopError } = await supabase.rpc('yoyo_live_music_control', {
            p_room_name: roomName,
            p_action: 'stop',
          });
          if (stopError) throw stopError;
          if (sharedMusic?.storage_path) {
            const { error: removeError } = await supabase.storage
              .from('live-music')
              .remove([sharedMusic.storage_path]);
            if (removeError) throw removeError;
          }
        })(),
        (async () => {
          const { error: battleError } = await supabase.rpc(
            'yoyo_battle_interrupt_for_host',
            { p_room_name: roomName },
          );
          if (battleError) throw battleError;
        })(),
      ]);
    }

    let endFailure = null;
    if (isHost || isCall) {
      try {
        const { data, error: endError } = await supabase.functions.invoke(
          'livekit-token',
          { body: { roomName, action: 'end' } },
        );
        if (endError || data?.ended !== true) {
          endFailure = endError?.message || data?.error || 'لم نتأكد من إغلاق البث على الخادم.';
        }
      } catch (reason) {
        endFailure = reason?.message || 'حصل خطأ أثناء إغلاق البث على الخادم.';
      }
    }

    // Do not unmount LiveKit or return home when the server could not confirm
    // the shutdown. Keep the room visible and let the host retry safely.
    if (endFailure) {
      setIsLeaving(false);
      setError('تعذر تأكيد إنهاء البث: ' + endFailure);
      Alert.alert('تعذر تأكيد إنهاء البث', endFailure);
      return;
    }

    if (isHost || isCall) {
      // Wait for LiveKit's native disconnect callback before unmounting its
      // Android view, then allow the native renderer a short teardown grace.
      await waitForRoomDisconnect();
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    onClose?.();
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
      <StatusBar style="light" hidden />
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
          video={connection.isCall ? connection.callType === 'video' : !!isHost && !isStandby}
          options={{ adaptiveStream: { pixelDensity: 'screen' } }}
          onDisconnected={() => { markRoomDisconnected(); if (!isLeaving) setError('انقطع اتصال غرفة البث. لم نغلق الشاشة تلقائيًا حتى تتمكن من رؤية الخطأ ومحاولة التشخيص.'); }}
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
            isStandby={isStandby}
            onStandbyChange={setIsStandby}
            onOpenPackages={onOpenPackages}
            viewerPresenceReady={viewerPresenceReady}
          />
        </LiveKitRoom>
      )}
      {isLeaving ? (
        <View style={styles.leavingOverlay}>
          <ActivityIndicator size="large" color="#F34E9B" />
          <Text style={styles.loadingText}>جارٍ إنهاء البث والعودة للرئيسية...</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0912' },
  room: { flex: 1, padding: 0, backgroundColor: '#05040A' },
  roomHeader: { position: 'absolute', top: 20, left: 14, right: 14, zIndex: 60, elevation: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  backButton: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(20,14,30,0.88)', alignItems: 'center', justifyContent: 'center' },
  backButtonText: { color: '#FFFFFF', fontSize: 25, lineHeight: 28, fontWeight: '600', marginTop: -3 },
  headerInfo: { flex: 1, flexShrink: 1, alignItems: 'flex-end', marginLeft: 10, paddingRight: 2, maxWidth: '62%' },
  hostName: { color: '#FFFFFF', fontSize: 17, fontWeight: 'bold', textAlign: 'right', lineHeight: 22 },
  roomStatus: { color: '#D4CADD', fontSize: 11, marginTop: 2, textAlign: 'right' },
  durationBadge: { position: 'absolute', top: 106, left: 62, zIndex: 125, elevation: 40, minWidth: 92, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,9,20,0.97)', borderWidth: 1, borderColor: '#F5C451', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 11 },
  durationLabel: { color: '#F2DDFB', fontSize: 10, fontWeight: '700', marginBottom: 2 },
  durationText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', textAlign: 'center', fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  livePill: { backgroundColor: '#E53965', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  livePillText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  videoStage: { ...StyleSheet.absoluteFillObject, backgroundColor: '#05040A', zIndex: 0, elevation: 0 },
  video: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', backgroundColor: '#05040A', borderRadius: 0 },
  overlayPanelsScroll: { position: 'absolute', top: 210, left: 10, right: 10, bottom: 190, zIndex: 35, elevation: 8 },
  filterPanel: { position: 'absolute', top: 210, left: 14, right: 14, zIndex: 118, elevation: 36, backgroundColor: 'rgba(15,11,25,0.97)', borderWidth: 1, borderColor: '#8655F5', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 10 },
  filterPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  filterPanelTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', textAlign: 'right' },
  filterPanelClose: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, backgroundColor: '#34263F' },
  filterPanelCloseText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  filterChoices: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  filterChoice: { minWidth: 76, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#251D31', borderWidth: 1, borderColor: '#44364F', alignItems: 'center' },
  filterChoiceActive: { backgroundColor: '#493078', borderColor: '#8655F5' },
  filterChoiceEmoji: { fontSize: 21, marginBottom: 4 },
  filterChoiceLabel: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  filterHint: { color: '#BFB3C8', fontSize: 10, textAlign: 'center', marginTop: 8 },
  toolsToggle: { position: 'absolute', left: 14, top: 106, zIndex: 110, elevation: 30, width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: '#8655F5', backgroundColor: 'rgba(25,20,36,0.94)', alignItems: 'center', justifyContent: 'center' },
  toolsToggleText: { color: '#FFFFFF', fontSize: 22, lineHeight: 25, fontWeight: '700' }, 
  overlayPanelsContent: { paddingBottom: 12, gap: 10 },
  hostControls: { position: 'absolute', top: 158, left: 14, right: 14, zIndex: 55, elevation: 18, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 },
  standbyButton: { flex: 1, backgroundColor: '#34263F', borderWidth: 1, borderColor: '#8A5578', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  micButton: { flex: 1, backgroundColor: '#245A48', borderWidth: 1, borderColor: '#3E9B78', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  micButtonMuted: { backgroundColor: '#733347', borderColor: '#C45C78' },
  filterMenuButton: { flex: 0.72, backgroundColor: '#493078', borderWidth: 1, borderColor: '#8655F5', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  standbyButtonActive: { backgroundColor: '#245A48', borderColor: '#3E9B78' },
  standbyButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
  standbyView: { ...StyleSheet.absoluteFillObject, minHeight: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#191424', borderRadius: 16, padding: 20 },
  standbyAvatar: { width: 126, height: 126, borderRadius: 63, borderWidth: 3, borderColor: '#F5C451', marginBottom: 14 },
  standbyAvatarFallback: { width: 126, height: 126, borderRadius: 63, backgroundColor: '#34263F', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  standbyAvatarEmoji: { fontSize: 58 },
  standbyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  standbyText: { color: '#F5C451', fontSize: 15, fontWeight: 'bold', marginTop: 7 },
  standbySubtext: { color: '#AAA1B8', fontSize: 12, marginTop: 8 },
  waiting: { ...StyleSheet.absoluteFillObject, minHeight: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#191424', borderRadius: 16, padding: 20 },
  waitingEmoji: { fontSize: 44, marginBottom: 12 },
  waitingText: { color: '#FFFFFF', fontSize: 15, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 },
  leavingOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 500, elevation: 500, backgroundColor: '#0B0912', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 },
  loadingText: { color: '#FFFFFF', fontSize: 15 },
  error: { color: '#FF9EAD', textAlign: 'center', marginVertical: 12, lineHeight: 22 },
  reportButton: { backgroundColor: '#34263F', borderWidth: 1, borderColor: '#8A5578', borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 12 },
  reportButtonText: { color: '#F4C5D8', fontSize: 14, fontWeight: 'bold' },
  leaveButton: { position: 'absolute', top: 112, right: 14, minWidth: 142, minHeight: 46, zIndex: 300, elevation: 50, backgroundColor: '#D91F4B', borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 14, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  leaveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' },
});
