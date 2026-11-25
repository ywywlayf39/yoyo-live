import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';
import ProfileFrame from './ProfileFrame';

const COLORS = { panel: '#191424', panel2: '#241B35', pink: '#F34E9B', gold: '#F5C451', white: '#FFFFFF', muted: '#AAA1B8' };

export default function LiveRoomChat({ roomName, userId }) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [canManageComments, setCanManageComments] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const decorateMessages = useCallback(async (rows) => {
    const ids = [...new Set((rows || []).map((row) => row.user_id).filter(Boolean))];
    if (!ids.length) return rows || [];
    const { data: profiles } = await supabase.from('member_public_profiles')
      .select('id,avatar_url,selected_frame_code').in('id', ids);
    const map = new Map((profiles || []).map((profile) => [profile.id, profile]));
    return (rows || []).map((row) => ({ ...row, ...(map.get(row.user_id) || {}) }));
  }, []);

  const load = useCallback(async () => {
    if (!roomName || !userId) return;
    const [roomResult, messageResult] = await Promise.all([
      supabase.from('live_rooms').select('comments_enabled,host_id').eq('room_name', roomName).eq('status', 'live').maybeSingle(),
      supabase.from('live_room_comments').select('id,user_id,display_name,body,created_at').eq('room_name', roomName).order('created_at', { ascending: false }).limit(30),
    ]);
    if (!roomResult.error && roomResult.data) {
      setEnabled(roomResult.data.comments_enabled !== false);
      // The database room owner is the source of truth; never trust a stale UI isHost prop.
      setCanManageComments(roomResult.data.host_id === userId);
    } else {
      setCanManageComments(false);
    }
    if (!messageResult.error) setMessages(await decorateMessages((messageResult.data || []).reverse()));
  }, [roomName, userId, decorateMessages]);

  useEffect(() => {
    load();
    const channel = supabase.channel('live-comments-' + roomName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_room_comments', filter: 'room_name=eq.' + roomName }, async (payload) => {
        const [decorated] = await decorateMessages([payload.new]);
        setMessages((current) => [...current.filter((item) => item.id !== decorated.id), decorated].slice(-30));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_rooms', filter: 'room_name=eq.' + roomName }, (payload) => {
        setEnabled(payload.new?.comments_enabled !== false);
        setCanManageComments(payload.new?.host_id === userId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomName, load, decorateMessages]);

  useEffect(() => {
    if (messages.length) listRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const send = async () => {
    const value = body.trim();
    if (!value || sending || !enabled) return;
    setSending(true);
    const { error } = await supabase.rpc('yoyo_send_live_comment', { p_room_name: roomName, p_body: value });
    setSending(false);
    if (error) {
      Alert.alert('لم يتم إرسال التعليق', error.message || 'حاول مرة أخرى.');
      return;
    }
    setBody('');
  };

  const toggle = async () => {
    if (!canManageComments) return;
    const next = !enabled;
    const { error } = await supabase.rpc('yoyo_set_live_comments', { p_room_name: roomName, p_enabled: next });
    if (error) {
      Alert.alert('تعذر تغيير التعليقات', error.message || 'حاول مرة أخرى.');
      return;
    }
    setEnabled(next);
  };

  if (!roomName || !userId) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>💬 تعليقات البث</Text>
        {canManageComments ? (
          <TouchableOpacity onPress={toggle} style={[styles.toggle, enabled ? styles.open : styles.closed]}>
            <Text style={styles.toggleText}>{enabled ? 'إغلاق التعليقات' : 'فتح التعليقات'}</Text>
          </TouchableOpacity>
        ) : <Text style={styles.state}>{enabled ? 'التعليقات مفتوحة' : 'التعليقات مغلقة'}</Text>}
      </View>
      <ScrollView ref={listRef} style={styles.list} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {messages.length ? messages.slice(-12).map((item) => (
          <View key={item.id} style={styles.message}>
            <ProfileFrame frameCode={item.selected_frame_code} size={36}>
              {item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={{ width: '100%', height: '100%' }} /> : <View style={styles.miniAvatarFallback}><Text style={{ fontSize: 17 }}>👤</Text></View>}
            </ProfileFrame>
            <View style={styles.messageContent}>
              <Text style={styles.name}>{item.display_name}{item.selected_frame_code ? '  VIP' : ''}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>
          </View>
        )) : <Text style={styles.empty}>كن أول من يكتب تعليقًا 👋</Text>}
      </ScrollView>
      {enabled ? (
        <View style={styles.composer}>
          <TextInput value={body} onChangeText={setBody} placeholder="اكتب تعليقك..." placeholderTextColor={COLORS.muted} maxLength={240} style={styles.input} editable={!sending} returnKeyType="send" onSubmitEditing={send} />
          <TouchableOpacity onPress={send} disabled={!body.trim() || sending} style={styles.send}><Text style={styles.sendText}>{sending ? '...' : 'إرسال'}</Text></TouchableOpacity>
        </View>
      ) : <Text style={styles.closedHint}>صاحب البث أغلق التعليقات مؤقتًا.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, right: 94, bottom: 124, zIndex: 70, elevation: 22, backgroundColor: 'transparent', borderRadius: 0, borderWidth: 0, padding: 0, maxWidth: '74%' },
  header: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5, backgroundColor: 'rgba(12,9,20,0.48)', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5 },
  title: { color: COLORS.gold, fontSize: 12, fontWeight: 'bold' },
  state: { color: COLORS.muted, fontSize: 11 },
  toggle: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  open: { backgroundColor: '#67334F' },
  closed: { backgroundColor: '#287B5B' },
  toggleText: { color: COLORS.white, fontSize: 11, fontWeight: 'bold' },
  list: { maxHeight: 142, minHeight: 24 },
  message: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, marginBottom: 4, gap: 7, backgroundColor: 'rgba(12,9,20,0.48)', borderRadius: 12 },
  messageContent: { flex: 1, minWidth: 0 },
  miniAvatarFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#30243E' },
  name: { color: COLORS.gold, fontSize: 11, fontWeight: 'bold' },
  body: { color: COLORS.white, fontSize: 12, flex: 1, lineHeight: 17, textShadowColor: 'rgba(0,0,0,0.65)', textShadowRadius: 3 },
  empty: { color: COLORS.white, fontSize: 11, textAlign: 'left', paddingHorizontal: 9, paddingVertical: 7, backgroundColor: 'rgba(12,9,20,0.42)', borderRadius: 12, overflow: 'hidden' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, padding: 4, backgroundColor: 'rgba(12,9,20,0.42)', borderRadius: 18 },
  input: { flex: 1, color: COLORS.white, backgroundColor: 'rgba(36,27,53,0.52)', borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8, textAlign: 'right', fontSize: 12, minWidth: 0 },
  send: { backgroundColor: 'rgba(243,78,155,0.88)', borderRadius: 15, paddingHorizontal: 11, paddingVertical: 9 },
  sendText: { color: COLORS.white, fontWeight: 'bold', fontSize: 12 },
  closedHint: { color: COLORS.muted, fontSize: 11, textAlign: 'center', paddingVertical: 8 },
});
