import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from './supabase';

const C = {
  bg: '#0B0912',
  card: '#191424',
  card2: '#241B35',
  pink: '#F34E9B',
  white: '#FFFFFF',
  muted: '#AAA1B8',
  border: '#30263F',
};

export default function ChatScreen({ userId, member, onBack, onStartCall }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [calling, setCalling] = useState(false);
  const listRef = useRef(null);

  const loadMessages = useCallback(async () => {
    if (!userId || !member?.id) return;
    setError('');
    const filter = [
      `and(sender_id.eq.${userId},recipient_id.eq.${member.id})`,
      `and(sender_id.eq.${member.id},recipient_id.eq.${userId})`,
    ].join(',');
    const { data, error: loadError } = await supabase
      .from('direct_messages')
      .select('id,sender_id,recipient_id,body,created_at,read_at')
      .or(filter)
      .order('created_at', { ascending: true })
      .limit(300);
    if (loadError) {
      setError('تعذر تحميل المحادثة. حاول مرة أخرى.');
    } else {
      setMessages(data || []);
    }
    setLoading(false);
  }, [userId, member?.id]);

  const markIncomingRead = useCallback(async () => {
    if (!userId || !member?.id) return;
    const { error: readError } = await supabase
      .from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', member.id)
      .eq('recipient_id', userId)
      .is('read_at', null);
    if (readError) {
      console.error('YOYO LIVE mark messages read failed:', readError);
    }
  }, [userId, member?.id]);

  useEffect(() => {
    loadMessages();
    markIncomingRead();
    const channel = supabase
      .channel(`direct-chat-${userId}-${member.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        (payload) => {
          const row = payload.new;
          const belongsToChat =
            (row.sender_id === userId && row.recipient_id === member.id) ||
            (row.sender_id === member.id && row.recipient_id === userId);
          if (belongsToChat) {
            if (row.recipient_id === userId) markIncomingRead();
            setMessages((current) =>
              current.some((item) => item.id === row.id) ? current : [...current, row]
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadMessages, markIncomingRead, userId, member.id]);

  const startCall = async (callType) => {
    if (calling || !userId || !member?.id || member.id === userId) return;
    setCalling(true);
    setError('');
    const roomName = `call_${userId.replace(/-/g, '').slice(0, 12)}_${Date.now()}`;
    const { data, error: callError } = await supabase
      .from('live_calls')
      .insert({
        room_name: roomName,
        caller_id: userId,
        receiver_id: member.id,
        call_type: callType,
        status: 'ringing',
      })
      .select('id, room_name, call_type')
      .single();

    if (callError) {
      console.error('YOYO LIVE start call failed:', callError);
      setError('العضو مشغول أو تعذر بدء المكالمة الآن. حاول مرة أخرى.');
    } else {
      setTimeout(() => {
        supabase.from('live_calls')
          .update({ status: 'ended' })
          .eq('id', data.id)
          .eq('caller_id', userId)
          .eq('status', 'ringing');
      }, 45000);

      onStartCall?.({
        roomName: data.room_name,
        callType: data.call_type,
        name: member.display_name || 'عضو YOYO LIVE',
        isCall: true,
      });
    }
    setCalling(false);
  };

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || sending || body.length > 2000) return;
    setSending(true);
    setError('');
    const { data, error: sendError } = await supabase
      .from('direct_messages')
      .insert({
        sender_id: userId,
        recipient_id: member.id,
        body,
      })
      .select('id,sender_id,recipient_id,body,created_at')
      .single();

    if (sendError) {
      setError('لم تُرسل الرسالة. تأكد من اتصال الإنترنت وحاول مرة أخرى.');
    } else {
      setMessages((current) =>
        current.some((item) => item.id === data.id) ? current : [...current, data]
      );
      setDraft('');
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    }
    setSending(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>رجوع ←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{member.display_name || 'عضو YOYO LIVE'}</Text>
          <Text style={styles.subtitle}>محادثة خاصة 🔒</Text>
        </View>
        <View style={styles.callActions}>
          <TouchableOpacity onPress={() => startCall('audio')} style={styles.callButton} disabled={calling}>
            <Text style={styles.callButtonText}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => startCall('video')} style={styles.callButton} disabled={calling}>
            <Text style={styles.callButtonText}>🎥</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.pink} size="large" />
          <Text style={styles.muted}>جارٍ تحميل الرسائل...</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={messages}
          keyExtractor={(item) => item.id}
          onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
          ListEmptyComponent={
            <Text style={styles.empty}>ابدأ المحادثة برسالة لطيفة 💗</Text>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === userId;
            return (
              <View style={[styles.messageRow, mine ? styles.myRow : styles.theirRow]}>
                <View style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}>
                  <Text style={styles.messageText}>{item.body}</Text>
                  <Text style={styles.time}>
                    {item.created_at
                      ? new Date(item.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.composer}>
          <TouchableOpacity
            style={[styles.sendButton, (!draft.trim() || sending) && styles.disabled]}
            onPress={sendMessage}
            disabled={!draft.trim() || sending}
          >
            <Text style={styles.sendText}>{sending ? '...' : 'إرسال'}</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="اكتب رسالتك..."
            placeholderTextColor={C.muted}
            multiline
            maxLength={2000}
            textAlign="right"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backButton: { padding: 8 },
  backText: { color: C.pink, fontWeight: 'bold' },
  headerInfo: { alignItems: 'flex-end', flex: 1 },
  callActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  callButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
  callButtonText: { fontSize: 18 },
  name: { color: C.white, fontSize: 18, fontWeight: 'bold' },
  subtitle: { color: C.muted, fontSize: 12, marginTop: 3 },
  list: { flex: 1 },
  listContent: { padding: 14, flexGrow: 1, justifyContent: 'flex-end' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: C.muted },
  empty: { color: C.muted, textAlign: 'center', marginVertical: 28 },
  messageRow: { width: '100%', marginVertical: 5, flexDirection: 'row' },
  myRow: { justifyContent: 'flex-start' },
  theirRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '84%', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 16 },
  myBubble: { backgroundColor: '#57306F', borderBottomLeftRadius: 4 },
  theirBubble: { backgroundColor: C.card2, borderBottomRightRadius: 4 },
  messageText: { color: C.white, fontSize: 15, lineHeight: 22, textAlign: 'right' },
  time: { color: '#C9BBD5', fontSize: 10, marginTop: 5, textAlign: 'left' },
  error: { color: '#FF8585', textAlign: 'center', paddingHorizontal: 12, paddingBottom: 8 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.card,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 44,
    color: C.white,
    backgroundColor: C.card2,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  sendButton: {
    backgroundColor: C.pink,
    borderRadius: 13,
    paddingHorizontal: 17,
    paddingVertical: 13,
  },
  disabled: { opacity: 0.45 },
  sendText: { color: C.white, fontWeight: 'bold' },
});
