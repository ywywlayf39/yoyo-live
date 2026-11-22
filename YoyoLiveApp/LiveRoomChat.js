import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';

const COLORS = { panel: '#191424', panel2: '#241B35', pink: '#F34E9B', gold: '#F5C451', white: '#FFFFFF', muted: '#AAA1B8' };

export default function LiveRoomChat({ roomName, userId, isHost }) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!roomName || !userId) return;
    const [roomResult, messageResult] = await Promise.all([
      supabase.from('live_rooms').select('comments_enabled').eq('room_name', roomName).eq('status', 'live').maybeSingle(),
      supabase.from('live_room_comments').select('id,display_name,body,created_at').eq('room_name', roomName).order('created_at', { ascending: false }).limit(30),
    ]);
    if (!roomResult.error && roomResult.data) setEnabled(roomResult.data.comments_enabled !== false);
    if (!messageResult.error) setMessages((messageResult.data || []).reverse());
  }, [roomName, userId]);

  useEffect(() => {
    load();
    const channel = supabase.channel('live-comments-' + roomName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_room_comments', filter: 'room_name=eq.' + roomName }, (payload) => {
        setMessages((current) => [...current.filter((item) => item.id !== payload.new.id), payload.new].slice(-30));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_rooms', filter: 'room_name=eq.' + roomName }, (payload) => {
        setEnabled(payload.new?.comments_enabled !== false);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomName, load]);

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
        {isHost ? (
          <TouchableOpacity onPress={toggle} style={[styles.toggle, enabled ? styles.open : styles.closed]}>
            <Text style={styles.toggleText}>{enabled ? 'إغلاق التعليقات' : 'فتح التعليقات'}</Text>
          </TouchableOpacity>
        ) : <Text style={styles.state}>{enabled ? 'التعليقات مفتوحة' : 'التعليقات مغلقة'}</Text>}
      </View>
      <ScrollView style={styles.list} nestedScrollEnabled>
        {messages.length ? messages.slice(-12).map((item) => (
          <View key={item.id} style={styles.message}>
            <Text style={styles.name}>{item.display_name}</Text>
            <Text style={styles.body}>{item.body}</Text>
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
  wrap: { position: 'absolute', left: 10, right: 104, bottom: 92, zIndex: 70, elevation: 22, backgroundColor: 'rgba(15,10,25,0.92)', borderRadius: 14, borderWidth: 1, borderColor: '#6A4A70', padding: 8, maxWidth: '76%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { color: COLORS.gold, fontSize: 14, fontWeight: 'bold' },
  state: { color: COLORS.muted, fontSize: 11 },
  toggle: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  open: { backgroundColor: '#67334F' },
  closed: { backgroundColor: '#287B5B' },
  toggleText: { color: COLORS.white, fontSize: 11, fontWeight: 'bold' },
  list: { maxHeight: 150, minHeight: 38 },
  message: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 2, gap: 6 },
  name: { color: COLORS.gold, fontSize: 12, fontWeight: 'bold' },
  body: { color: COLORS.white, fontSize: 12, flex: 1, lineHeight: 18 },
  empty: { color: COLORS.muted, fontSize: 12, textAlign: 'center', paddingVertical: 12 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  input: { flex: 1, color: COLORS.white, backgroundColor: 'rgba(36,27,53,0.95)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, textAlign: 'right', fontSize: 12, minWidth: 0 },
  send: { backgroundColor: COLORS.pink, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  sendText: { color: COLORS.white, fontWeight: 'bold', fontSize: 12 },
  closedHint: { color: COLORS.muted, fontSize: 11, textAlign: 'center', paddingVertical: 8 },
});
