import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { supabase } from './supabase';

const COLORS = {
  bg: '#0B0912', card: '#191424', card2: '#241B35',
  pink: '#F34E9B', gold: '#F5C451', white: '#FFFFFF', muted: '#AAA1B8',
};
const CATEGORIES = [
  { id: 'starter', label: 'اقتصادية' },
  { id: 'popular', label: 'مميزة' },
  { id: 'premium', label: 'فخمة' },
  { id: 'legendary', label: 'أسطورية' },
  { id: 'animals', label: '🐾 حيوانات' },
];

export default function LiveGiftPanel({ userId, receiverId, isHost = false }) {
  const [visible, setVisible] = useState(false);
  const [gifts, setGifts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('starter');
  const [selectedGift, setSelectedGift] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [incoming, setIncoming] = useState(null);
  const pulse = useRef(new Animated.Value(0.86)).current;

  const refreshBalance = async () => {
    if (!userId) return;
    const { data } = await supabase.from('wallets').select('purchased_coins')
      .eq('user_id', userId).maybeSingle();
    setBalance(Number(data?.purchased_coins || 0));
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [{ data, error }] = await Promise.all([
        supabase.from('gift_catalog')
          .select('id,name,coin_cost,gross_points,category,emoji,description,animation_key,sound_key,sort_order')
          .eq('active', true).order('sort_order', { ascending: true }),
      ]);
      if (!active) return;
      if (error) console.error('YOYO gift catalog:', error);
      setGifts(data || []);
      setSelectedGift((data || [])[0] || null);
      setLoading(false);
      await refreshBalance();
    };
    load();
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!isHost || !userId) return;
    const channel = supabase.channel('yoyo-gifts-in-' + userId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'gift_transfers',
        filter: 'receiver_id=eq.' + userId,
      }, async (payload) => {
        const row = payload.new;
        const gift = gifts.find((item) => item.id === row.gift_id);
        const { data: sender } = await supabase.from('member_public_profiles')
          .select('display_name').eq('id', row.sender_id).maybeSingle();
        setIncoming({
          id: row.id,
          emoji: gift?.emoji || '🎁',
          name: gift?.name || 'هدية جديدة',
          sender: sender?.display_name || 'أحد المتابعين',
          quantity: row.quantity || 1,
        });
        setTimeout(() => setIncoming((current) => current?.id === row.id ? null : current), 4500);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isHost, userId, gifts]);

  useEffect(() => {
    if (!incoming) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.08, duration: 420, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.96, duration: 420, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [incoming, pulse]);

  const visibleGifts = useMemo(
    () => gifts.filter((gift) => gift.category === selectedCategory),
    [gifts, selectedCategory],
  );

  const sendGift = async () => {
    if (!selectedGift || !receiverId || sending) return;
    const total = Number(selectedGift.coin_cost) * quantity;
    if (balance < total) {
      Alert.alert('رصيدك غير كافٍ', 'اشحن عملاتك أولاً من المحفظة.');
      return;
    }
    setSending(true);
    const { data, error } = await supabase.rpc('send_live_gift', {
      p_receiver_id: receiverId,
      p_gift_id: selectedGift.id,
      p_quantity: quantity,
    });
    setSending(false);
    if (error) {
      Alert.alert('تعذر إرسال الهدية', error.message || 'حاول مرة أخرى.');
      return;
    }
    await refreshBalance();
    setVisible(false);
    Alert.alert('وصلت هديتك 🎁', 'تم إرسال ' + selectedGift.name + ' بنجاح.');
  };

  if (isHost) {
    return incoming ? (
      <Animated.View pointerEvents="none" style={[styles.overlay, { transform: [{ scale: pulse }] }]}>
        <Text style={styles.overlayEmoji}>{incoming.emoji}</Text>
        <Text style={styles.overlayTitle}>{incoming.name}</Text>
        <Text style={styles.overlaySubtitle}>
          {incoming.sender} أرسل الهدية {incoming.quantity > 1 ? '× ' + incoming.quantity : ''}
        </Text>
      </Animated.View>
    ) : null;
  }

  return (
    <>
      <TouchableOpacity style={styles.openButton} onPress={() => setVisible(true)}>
        <Text style={styles.openButtonText}>🎁 الهدايا</Text>
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>هدايا YOYO LIVE ✨</Text>
              <TouchableOpacity onPress={() => setVisible(false)}><Text style={styles.close}>إغلاق ✕</Text></TouchableOpacity>
            </View>
            <Text style={styles.balance}>رصيدك: 🪙 {balance.toLocaleString('ar-EG')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {CATEGORIES.map((item) => (
                <TouchableOpacity key={item.id}
                  style={[styles.tab, selectedCategory === item.id && styles.tabActive]}
                  onPress={() => { setSelectedCategory(item.id); setSelectedGift(null); }}>
                  <Text style={[styles.tabText, selectedCategory === item.id && styles.tabTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {loading ? <ActivityIndicator color={COLORS.pink} /> : (
              <ScrollView style={styles.giftScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.grid}>
                {visibleGifts.map((gift) => (
                  <TouchableOpacity key={gift.id}
                    style={[styles.gift, selectedGift?.id === gift.id && styles.giftSelected]}
                    onPress={() => setSelectedGift(gift)}>
                    <Text style={styles.giftEmoji}>{gift.emoji}</Text>
                    <Text style={styles.giftName} numberOfLines={1}>{gift.name}</Text>
                    <Text style={styles.giftPrice}>🪙 {Number(gift.coin_cost).toLocaleString('ar-EG')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              </ScrollView>
            )}
            {!!selectedGift && (
              <View style={styles.footer}>
                <View style={styles.quantityRow}>
                  {[1, 5, 10].map((value) => (
                    <TouchableOpacity key={value} style={[styles.quantity, quantity === value && styles.quantityActive]}
                      onPress={() => setQuantity(value)}>
                      <Text style={styles.quantityText}>×{value}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={[styles.sendButton, sending && { opacity: 0.6 }]}
                  onPress={sendGift} disabled={sending}>
                  {sending ? <ActivityIndicator color="#fff" /> :
                    <Text style={styles.sendText}>إرسال {selectedGift.emoji} — {Number(selectedGift.coin_cost) * quantity} عملة</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  openButton: { position: 'absolute', right: 16, bottom: 88, backgroundColor: COLORS.pink, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 18, zIndex: 20, elevation: 8 },
  openButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '76%', borderWidth: 1, borderColor: '#45375B' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { color: COLORS.white, fontSize: 18, fontWeight: '900' },
  close: { color: COLORS.muted, fontSize: 13 },
  balance: { color: COLORS.gold, textAlign: 'right', marginBottom: 12, fontWeight: 'bold' },
  tabs: { gap: 8, paddingBottom: 12 },
  tab: { backgroundColor: COLORS.card2, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 9 },
  tabActive: { backgroundColor: COLORS.pink },
  tabText: { color: COLORS.muted, fontWeight: 'bold' },
  tabTextActive: { color: '#fff' },
  giftScroll: { maxHeight: 300 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  gift: { width: '31%', backgroundColor: COLORS.card, borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.card2, marginBottom: 2 },
  giftSelected: { borderColor: COLORS.gold, backgroundColor: '#30243A' },
  giftEmoji: { fontSize: 32, marginBottom: 4 },
  giftName: { color: COLORS.white, fontSize: 11, fontWeight: 'bold' },
  giftPrice: { color: COLORS.gold, fontSize: 11, marginTop: 4 },
  footer: { marginTop: 12, gap: 10 },
  quantityRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  quantity: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 10, backgroundColor: COLORS.card2 },
  quantityActive: { backgroundColor: '#704078' },
  quantityText: { color: '#fff', fontWeight: 'bold' },
  sendButton: { backgroundColor: COLORS.pink, borderRadius: 14, padding: 14, alignItems: 'center' },
  sendText: { color: '#fff', fontWeight: '900' },
  overlay: { position: 'absolute', zIndex: 50, top: '22%', alignSelf: 'center', alignItems: 'center', backgroundColor: 'rgba(16,10,25,0.92)', borderWidth: 1, borderColor: COLORS.gold, borderRadius: 22, padding: 22, minWidth: 210 },
  overlayEmoji: { fontSize: 76 },
  overlayTitle: { color: COLORS.gold, fontSize: 21, fontWeight: '900', marginTop: 5 },
  overlaySubtitle: { color: '#fff', fontSize: 14, marginTop: 6 },
});
