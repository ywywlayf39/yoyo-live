import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from './supabase';

const C = {
  bg: '#0B0912',
  card: '#191424',
  card2: '#241B35',
  pink: '#F34E9B',
  gold: '#F5C451',
  white: '#FFFFFF',
  muted: '#AAA1B8',
  green: '#63D7A6',
};

function timeLabel(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return String(minutes).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}

export default function LiveBattlePanel({ userId, roomName, isHost = false }) {
  const [visible, setVisible] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [battle, setBattle] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [incoming, setIncoming] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    if (!userId || !roomName || !isHost) return;
    await supabase.rpc('yoyo_battle_refresh');

    const [battleResult, inviteResult, recentResult] = await Promise.all([
      supabase.from('yoyo_battles')
        .select('id,host_a_id,host_b_id,room_a,room_b,host_a_name,host_b_name,status,result,score_a,score_b,starts_at,ends_at,duration_minutes,created_at,expires_at')
        .or('host_a_id.eq.' + userId + ',host_b_id.eq.' + userId)
        .in('status', ['pending', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('yoyo_battles')
        .select('id,host_a_id,host_b_id,room_a,room_b,host_a_name,host_b_name,status,created_at,expires_at')
        .eq('host_b_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('yoyo_battles')
        .select('id,host_a_id,host_b_id,host_a_name,host_b_name,status,result,score_a,score_b,finished_at')
        .or('host_a_id.eq.' + userId + ',host_b_id.eq.' + userId)
        .in('status', ['completed', 'interrupted'])
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!battleResult.error) setBattle(battleResult.data || null);
    if (!inviteResult.error) setIncoming(inviteResult.data || []);
    if (!recentResult.error) setLastResult(recentResult.data || null);
  }, [userId, roomName, isHost]);

  useEffect(() => {
    if (!isHost || !userId || !roomName) return undefined;
    let active = true;
    setLoading(true);
    refresh().finally(() => { if (active) setLoading(false); });

    const channel = supabase.channel('yoyo-battle-' + userId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'yoyo_battles',
      }, () => {
        if (active) refresh();
      })
      .subscribe();

    const refreshTimer = setInterval(() => {
      if (active) refresh();
    }, 5000);
    const clockTimer = setInterval(() => {
      if (active) setNow(Date.now());
    }, 1000);

    return () => {
      active = false;
      clearInterval(refreshTimer);
      clearInterval(clockTimer);
      supabase.removeChannel(channel);
    };
  }, [isHost, userId, roomName, refresh]);

  const loadRooms = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('live_rooms')
      .select('room_name,host_id,host_name,title')
      .eq('status', 'live')
      .neq('host_id', userId)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      Alert.alert('التحديات', 'تعذر تحميل المضيفين المتاحين الآن.');
      return;
    }
    setRooms(data || []);
    setVisible(true);
  };

  const sendInvite = async (room) => {
    if (busyId) return;
    setBusyId(room.room_name);
    const { error } = await supabase.rpc('yoyo_battle_invite', {
      p_my_room_name: roomName,
      p_opponent_room_name: room.room_name,
    });
    setBusyId('');
    if (error) {
      Alert.alert('تعذر إرسال الدعوة', error.message || 'حاول مرة أخرى.');
      return;
    }
    setVisible(false);
    Alert.alert('تم إرسال التحدي 👑', 'أرسلنا دعوة للمضيف ' + room.host_name + '. انتظر رده.');
    refresh();
  };

  const respond = async (item, accept) => {
    if (busyId) return;
    setBusyId(item.id);
    const { data, error } = await supabase.rpc('yoyo_battle_respond', {
      p_battle_id: item.id,
      p_accept: accept,
    });
    setBusyId('');
    if (error) {
      Alert.alert('تعذر تنفيذ الطلب', error.message || 'حاول مرة أخرى.');
      refresh();
      return;
    }
    if (data?.status === 'expired') {
      Alert.alert('انتهت الدعوة', 'انتهت صلاحية دعوة التحدي.');
    } else if (data?.status === 'interrupted') {
      Alert.alert('تعذر بدء التحدي', 'أحد البثين لم يعد نشطًا.');
    } else if (accept) {
      Alert.alert('قبلت التحدي 🔥', 'يبدأ التحدي بعد عدّ تنازلي 10 ثوانٍ.');
    }
    refresh();
  };

  const cancelInvite = async (item) => {
    const { error } = await supabase.rpc('yoyo_battle_cancel', { p_battle_id: item.id });
    if (error) Alert.alert('تعذر إلغاء الدعوة', error.message || 'حاول مرة أخرى.');
    refresh();
  };

  const countdown = useMemo(() => {
    if (!battle?.starts_at) return null;
    const start = new Date(battle.starts_at).getTime();
    const end = new Date(battle.ends_at).getTime();
    if (now < start) return { label: 'يبدأ بعد', value: timeLabel(start - now) };
    if (now < end) return { label: 'الوقت المتبقي', value: timeLabel(end - now) };
    return { label: 'بانتظار تثبيت النتيجة', value: '00:00' };
  }, [battle, now]);

  if (!isHost) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.crown}>👑</Text>
          <View>
            <Text style={styles.title}>تحدي الملوك</Text>
            <Text style={styles.subtitle}>YOYO BATTLE · تحدي بين مضيفين</Text>
          </View>
        </View>
        {!battle ? (
          <TouchableOpacity style={styles.inviteButton} onPress={loadRooms} activeOpacity={0.85}>
            <Text style={styles.inviteText}>＋ تحدي</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading && !battle ? <ActivityIndicator color={C.gold} style={{ marginVertical: 12 }} /> : null}

      {!battle && lastResult ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>{lastResult.status === 'interrupted' ? 'انتهى التحدي دون نتيجة' : lastResult.result === 'draw' ? '🤝 تعادل في آخر تحدي' : '🏆 نتيجة آخر تحدي'}</Text>
          <Text style={styles.resultScore}>{lastResult.host_a_name}  {Number(lastResult.score_a || 0).toLocaleString('ar-EG')}  -  {Number(lastResult.score_b || 0).toLocaleString('ar-EG')}  {lastResult.host_b_name}</Text>
          {lastResult.status === 'completed' && lastResult.result !== 'draw' ? <Text style={styles.resultWinner}>الفائز: {lastResult.result === 'host_a' ? lastResult.host_a_name : lastResult.host_b_name} 👑</Text> : null}
        </View>
      ) : null}

      {incoming.map((item) => (
        <View key={item.id} style={styles.inviteCard}>
          <Text style={styles.inviteTitle}>🔥 دعوة تحدي جديدة</Text>
          <Text style={styles.inviteBody}>{item.host_a_name} يتحداك في جولة. المدة يحددها تصويت المشاهدين (والافتراضي 30 دقيقة).</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              disabled={!!busyId}
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => respond(item, true)}
            >
              <Text style={styles.actionText}>{busyId === item.id ? '...' : 'قبول التحدي'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!!busyId}
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => respond(item, false)}
            >
              <Text style={styles.actionText}>رفض</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {battle?.status === 'pending' && battle.host_a_id === userId ? (
        <View style={styles.waitingCard}>
          <Text style={styles.waitingTitle}>⏳ الدعوة مرسلة</Text>
          <Text style={styles.waitingBody}>بانتظار رد {battle.host_b_name}.</Text>
          <TouchableOpacity onPress={() => cancelInvite(battle)} style={styles.cancelButton}>
            <Text style={styles.cancelText}>إلغاء الدعوة</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {battle?.status === 'active' ? (
        <View style={styles.scoreCard}>
          <View style={styles.scoreRow}>
            <View style={styles.player}>
              <Text style={styles.playerName} numberOfLines={1}>{battle.host_a_name}</Text>
              <Text style={styles.score}>{Number(battle.score_a || 0).toLocaleString('ar-EG')}</Text>
            </View>
            <View style={styles.versus}>
              <Text style={styles.vs}>VS</Text>
              <Text style={styles.timerLabel}>{countdown?.label}</Text>
              <Text style={styles.timer}>{countdown?.value}</Text>
            </View>
            <View style={styles.player}>
              <Text style={styles.playerName} numberOfLines={1}>{battle.host_b_name}</Text>
              <Text style={styles.score}>{Number(battle.score_b || 0).toLocaleString('ar-EG')}</Text>
            </View>
          </View>
          <Text style={styles.scoreHint}>النقاط تُحسب تلقائيًا من الهدايا التي تصل أثناء الجولة فقط.</Text>
        </View>
      ) : null}

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>اختار منافسك 👑</Text>
              <TouchableOpacity onPress={() => setVisible(false)}><Text style={styles.close}>✕</Text></TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>تقدر تتحدى مضيفًا يبث الآن. لازم الطرفين يكونوا في بث مباشر.</Text>
            <ScrollView style={{ maxHeight: 330 }}>
              {rooms.length === 0 ? (
                <Text style={styles.empty}>لا يوجد مضيفون متاحون للتحدي الآن.</Text>
              ) : rooms.map((room) => (
                <View key={room.room_name} style={styles.roomRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roomName}>{room.host_name}</Text>
                    <Text style={styles.roomTitle} numberOfLines={1}>{room.title}</Text>
                  </View>
                  <TouchableOpacity
                    disabled={!!busyId}
                    style={styles.challengeButton}
                    onPress={() => sendInvite(room)}
                  >
                    <Text style={styles.challengeText}>{busyId === room.room_name ? '...' : 'تحدي'}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, backgroundColor: C.card, borderColor: '#765A36', borderWidth: 1, borderRadius: 16, padding: 13 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  crown: { fontSize: 28 },
  title: { color: C.gold, fontSize: 17, fontWeight: 'bold' },
  subtitle: { color: C.muted, fontSize: 11, marginTop: 3 },
  inviteButton: { backgroundColor: C.pink, borderRadius: 11, paddingHorizontal: 15, paddingVertical: 9 },
  inviteText: { color: C.white, fontWeight: 'bold' },
  inviteCard: { marginTop: 12, backgroundColor: C.card2, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.gold },
  resultCard: { marginTop: 12, backgroundColor: C.card2, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#765A36' },
  resultTitle: { color: C.gold, fontWeight: 'bold', textAlign: 'center' },
  resultScore: { color: C.white, textAlign: 'center', marginTop: 8, fontSize: 12 },
  resultWinner: { color: C.green, textAlign: 'center', marginTop: 6, fontWeight: 'bold' },
  inviteTitle: { color: C.gold, fontWeight: 'bold', fontSize: 15 },
  inviteBody: { color: C.white, marginTop: 6, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  actionButton: { flex: 1, padding: 11, borderRadius: 10, alignItems: 'center' },
  acceptButton: { backgroundColor: '#287B5B' },
  rejectButton: { backgroundColor: '#663044' },
  actionText: { color: C.white, fontWeight: 'bold' },
  waitingCard: { marginTop: 12, padding: 12, backgroundColor: C.card2, borderRadius: 12 },
  waitingTitle: { color: C.gold, fontWeight: 'bold' },
  waitingBody: { color: C.white, marginTop: 5 },
  cancelButton: { alignSelf: 'flex-start', marginTop: 9, padding: 8 },
  cancelText: { color: '#FF9EAD', fontWeight: 'bold' },
  scoreCard: { marginTop: 12, backgroundColor: '#241B35', borderRadius: 13, padding: 12, borderWidth: 1, borderColor: '#9B7840' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  player: { flex: 1, alignItems: 'center', minWidth: 0 },
  playerName: { color: C.white, fontWeight: 'bold', fontSize: 13, maxWidth: '100%' },
  score: { color: C.gold, fontSize: 25, fontWeight: 'bold', marginTop: 5 },
  versus: { alignItems: 'center', paddingHorizontal: 8 },
  vs: { color: C.pink, fontSize: 18, fontWeight: '900' },
  timerLabel: { color: C.muted, fontSize: 10, marginTop: 5 },
  timer: { color: C.white, fontSize: 16, fontWeight: 'bold', fontVariant: ['tabular-nums'] },
  scoreHint: { color: C.muted, fontSize: 10, textAlign: 'center', marginTop: 9 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modal: { backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: C.gold, fontSize: 18, fontWeight: 'bold' },
  close: { color: C.white, fontSize: 22, padding: 4 },
  modalHint: { color: C.muted, fontSize: 12, lineHeight: 19, marginTop: 8, marginBottom: 12 },
  empty: { color: C.muted, textAlign: 'center', padding: 22 },
  roomRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#30273E', gap: 12 },
  roomName: { color: C.white, fontWeight: 'bold' },
  roomTitle: { color: C.muted, fontSize: 11, marginTop: 3 },
  challengeButton: { backgroundColor: C.pink, paddingHorizontal: 17, paddingVertical: 9, borderRadius: 10 },
  challengeText: { color: C.white, fontWeight: 'bold' },
});
