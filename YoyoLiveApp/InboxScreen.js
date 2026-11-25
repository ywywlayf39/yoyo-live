import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from './supabase';
import ProfileFrame from './ProfileFrame';

const C = {
  bg: '#0B0912',
  card: '#191424',
  card2: '#241B35',
  pink: '#F34E9B',
  white: '#FFFFFF',
  muted: '#AAA1B8',
  border: '#30263F',
};

export default function InboxScreen({ userId, onBack, onOpenChat }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [unreadTotal, setUnreadTotal] = useState(0);

  const loadInbox = useCallback(async (isRefresh = false) => {
    if (!userId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    const { data: rows, error: messagesError } = await supabase
      .from('direct_messages')
      .select('id,sender_id,recipient_id,body,created_at')
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(500);

    if (messagesError) {
      console.error('YOYO LIVE inbox load failed:', messagesError);
      setError('تعذر تحميل الرسائل الآن. اسحب الشاشة للتحديث.');
      setConversations([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: unreadRows, error: unreadError } = await supabase
      .from('direct_messages')
      .select('sender_id')
      .eq('recipient_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (unreadError) {
      console.error('YOYO LIVE unread count failed:', unreadError);
    }
    const unreadByMember = new Map();
    (unreadRows || []).forEach((message) => {
      unreadByMember.set(message.sender_id, (unreadByMember.get(message.sender_id) || 0) + 1);
    });
    setUnreadTotal((unreadRows || []).length);

    const latestByMember = new Map();
    (rows || []).forEach((message) => {
      const memberId = message.sender_id === userId
        ? message.recipient_id
        : message.sender_id;
      if (memberId && !latestByMember.has(memberId)) {
        latestByMember.set(memberId, message);
      }
    });

    const memberIds = Array.from(latestByMember.keys());
    if (memberIds.length === 0) {
      setConversations([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('member_public_profiles')
      .select('id,display_name,avatar_url,country,selected_frame_code')
      .in('id', memberIds);

    if (profilesError) {
      console.error('YOYO LIVE inbox profiles failed:', profilesError);
    }

    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const items = memberIds.map((id) => ({
      member: profileMap.get(id) || { id, display_name: 'عضو YOYO LIVE' },
      lastMessage: latestByMember.get(id),
      unreadCount: unreadByMember.get(id) || 0,
    }));
    items.sort((a, b) =>
      new Date(b.lastMessage.created_at).getTime() -
      new Date(a.lastMessage.created_at).getTime()
    );
    setConversations(items);
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    loadInbox();
    const channel = supabase
      .channel(`direct-inbox-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        (payload) => {
          const message = payload.new;
          if (message.sender_id === userId || message.recipient_id === userId) {
            loadInbox(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadInbox, userId]);

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    return sameDay
      ? date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>رجوع ←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>الرسائل الخاصة 💬</Text>
          <Text style={styles.subtitle}>كل محادثاتك في مكان واحد 🔒</Text>
          {unreadTotal > 0 && <View style={styles.totalBadge}><Text style={styles.totalBadgeText}>{unreadTotal > 99 ? '99+' : unreadTotal} رسالة غير مقروءة</Text></View>}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.pink} size="large" />
          <Text style={styles.muted}>جارٍ تحميل المحادثات...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => loadInbox()}>
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.member.id}
          contentContainerStyle={conversations.length ? styles.list : styles.emptyList}
          refreshing={refreshing}
          onRefresh={() => loadInbox(true)}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>💌</Text>
              <Text style={styles.emptyTitle}>لسه مفيش محادثات</Text>
              <Text style={styles.muted}>افتح صفحة أي عضو واضغط «إرسال رسالة خاصة» لبدء محادثة.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.lastMessage.sender_id === userId;
            return (
              <TouchableOpacity
                style={styles.conversation}
                activeOpacity={0.8}
                onPress={() => onOpenChat(item.member)}
              >
                <ProfileFrame frameCode={item.member.selected_frame_code} size={54}>
                  {item.member.avatar_url ? (
                    <Image source={{ uri: item.member.avatar_url }} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <View style={[styles.avatarFallback, { flex: 1 }]}>
                      <Text style={styles.avatarEmoji}>👤</Text>
                    </View>
                  )}
                </ProfileFrame>
                <View style={styles.conversationBody}>
                  <View style={styles.nameLine}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.member.display_name || 'عضو YOYO LIVE'}
                    </Text>
                    <Text style={styles.date}>{formatDate(item.lastMessage.created_at)}</Text>
                  </View>
                  <Text style={styles.preview} numberOfLines={1}>
                    {mine ? 'أنت: ' : ''}{item.lastMessage.body}
                  </Text>
                </View>
                {item.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
                  </View>
                )}
                <Text style={styles.chevron}>‹</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
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
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backButton: { padding: 8 },
  backText: { color: C.pink, fontWeight: 'bold' },
  headerInfo: { alignItems: 'flex-end', flex: 1 },
  title: { color: C.white, fontSize: 20, fontWeight: 'bold' },
  subtitle: { color: C.muted, fontSize: 12, marginTop: 4 },
  totalBadge: { backgroundColor: C.pink, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, marginTop: 7 },
  totalBadgeText: { color: C.white, fontSize: 11, fontWeight: 'bold' },
  list: { padding: 12 },
  emptyList: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  conversation: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.card2 },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 25 },
  conversationBody: { flex: 1, marginHorizontal: 11 },
  nameLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { color: C.white, fontSize: 15, fontWeight: 'bold', flex: 1, textAlign: 'right' },
  date: { color: C.muted, fontSize: 10, marginLeft: 8 },
  preview: { color: C.muted, fontSize: 13, marginTop: 7, textAlign: 'right' },
  chevron: { color: C.pink, fontSize: 26, marginLeft: 2 },
  unreadBadge: { minWidth: 23, height: 23, borderRadius: 12, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadBadgeText: { color: C.white, fontSize: 11, fontWeight: 'bold' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: C.muted, textAlign: 'center', marginTop: 9, lineHeight: 21 },
  emptyIcon: { fontSize: 48, marginBottom: 14 },
  emptyTitle: { color: C.white, fontSize: 18, fontWeight: 'bold' },
  error: { color: '#FF8585', textAlign: 'center', lineHeight: 22 },
  retry: { backgroundColor: C.pink, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, marginTop: 14 },
  retryText: { color: C.white, fontWeight: 'bold' },
});
