import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Modal, ScrollView, StyleSheet, Text,
  TouchableOpacity, Vibration, View,
} from 'react-native';
import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer } from 'expo-audio';
import { GIFT_SOUND_ASSETS } from './giftSoundPlayers';

const giftSoundPlayers = {};

function playGiftSound(soundKey) {
  const key = GIFT_SOUND_ASSETS[soundKey] ? soundKey : 'soft-chime';
  try {
    if (!giftSoundPlayers[key]) {
      giftSoundPlayers[key] = createAudioPlayer(GIFT_SOUND_ASSETS[key]);
    }
    const player = giftSoundPlayers[key];
    Object.values(giftSoundPlayers).forEach((item) => { if (item !== player) item.pause(); });
    player.seekTo(0);
    player.play();
  } catch (error) { console.warn('Gift audio:', error?.message || error); }
}


const COLORS = {
  bg: '#0B0912', card: '#191424', card2: '#241B35',
  pink: '#F34E9B', gold: '#F5C451', white: '#FFFFFF', muted: '#AAA1B8',
};
const CATEGORIES = [
  { id: 'starter', label: 'اقتصادية' },
  { id: 'popular', label: 'مميزة' },
  { id: 'premium', label: 'فخمة' },
  { id: 'legendary', label: 'أسطورية' },
  { id: 'animals', label: '🐾 عالم الحيوانات' },
];

const GIFT_ANIMATION_EFFECTS = {
  'heart-pulse': { particles: ["💗","💕","✨"], tint: '#F34E9B', duration: 5200, shake: false },
  'rose-bloom': { particles: ["🌹","🌸","✨"], tint: '#F08BAA', duration: 5200, shake: false },
  'clap-burst': { particles: ["👏","🎉","✨"], tint: '#F5C451', duration: 5200, shake: false },
  'cute-cat-bounce': { particles: ["🐱","🐾","💗"], tint: '#E6A6D7', duration: 5200, shake: false },
  'star-sparkle': { particles: ["⭐","✨","🌟"], tint: '#F5C451', duration: 5200, shake: false },
  'butterfly-flight': { particles: ["🦋","🌸","✨"], tint: '#8BC8F5', duration: 5200, shake: false },
  'playful-cat-yarn': { particles: ["🐈","🧶","🐾"], tint: '#D6A6FF', duration: 5200, shake: false },
  'moon-drift': { particles: ["🌙","⭐","✨"], tint: '#A9B5F5', duration: 5200, shake: false },
  'bunny-hop': { particles: ["🐰","🥕","✨"], tint: '#F3B5D2', duration: 5200, shake: false },
  'black-cat-moon': { particles: ["🐈‍⬛","🌙","✨"], tint: '#9B8ABF', duration: 5200, shake: false },
  'meteor-trail': { particles: ["☄️","🌠","✨"], tint: '#FF9B70', duration: 5200, shake: false },
  'white-tiger-leap': { particles: ["🐅","⚡","✨"], tint: '#DDE6F2', duration: 5200, shake: false },
  'balloon-rise': { particles: ["🎈","🎈","✨"], tint: '#FF9FBA', duration: 5200, shake: false },
  'double-heart': { particles: ["💞","💗","💕"], tint: '#F34E9B', duration: 5200, shake: false },
  'royal-tiger-leap': { particles: ["🐅","👑","🔥"], tint: '#E5B45B', duration: 5200, shake: false },
  'black-panther-smoke': { particles: ["🐆","🌫️","✨"], tint: '#8B83A8', duration: 5200, shake: false },
  'golden-horse': { particles: ["🐎","🌟","✨"], tint: '#D6B15D', duration: 5200, shake: false },
  'dream-car': { particles: ["🏎️","💨","✨"], tint: '#7DD7F2', duration: 5200, shake: false },
  'tiger-family-entrance': { particles: ["🐅","🐯","🐾"], tint: '#D89B52', duration: 5200, shake: false },
  'pearl-yacht': { particles: ["🛥️","🌊","💎"], tint: '#63D7F2', duration: 5200, shake: false },
  'magic-cat-aura': { particles: ["🐈","🔮","✨"], tint: '#C39BFF', duration: 5200, shake: false },
  'crystal-castle': { particles: ["🏰","💎","✨"], tint: '#9AD7F5', duration: 5200, shake: false },
  'light-dragon': { particles: ["🐉","💡","✨"], tint: '#8DE0D0', duration: 7500, shake: false },
  'diamond-fall': { particles: ["💎","💠","✨"], tint: '#8BD8F5', duration: 5200, shake: false },
  'lion-king-roar': { particles: ["🦁","👑","🔥"], tint: '#F5A84C', duration: 5200, shake: true },
  'legendary-tiger-storm': { particles: ["🐅","🌪️","⚡"], tint: '#E7A85B', duration: 5200, shake: true },
  'galaxy-gate': { particles: ["🌌","🌀","✨"], tint: '#A88AF2', duration: 7500, shake: true },
  'cosmic-eclipse': { particles: ["🌑","🌞","✨"], tint: '#9A8CF2', duration: 5200, shake: false },
  'black-king-throne': { particles: ["🦁","🖤","👑"], tint: '#8F86A8', duration: 7500, shake: true },
  'royal-throne': { particles: ["👑","🪑","💫"], tint: '#F5C451', duration: 7500, shake: true },
  'storm-lion-royal-entry': { particles: ["🦁","⛈️","👑"], tint: '#E5A64D', duration: 5200, shake: true },
  'diamond-galaxy-tiger': { particles: ["🐅","💎","🌌"], tint: '#A78BFA', duration: 7500, shake: true },
  'golden-throne-dragon': { particles: ["🐉","👑","✨"], tint: '#F5C451', duration: 7500, shake: true },
  'jungle-emperor-throne': { particles: ["🦁","🌴","👑"], tint: '#D6A45B', duration: 7500, shake: true },
  'yoyo-eternal-galaxy': { particles: ["🌌","🌠","💜"], tint: '#C39BFF', duration: 7500, shake: true },
  'royal-crown': { particles: ["👑","✨","💎"], tint: '#F5C451', duration: 5200, shake: false },
  'royal-king-crown': { particles: ["👑","🦁","✨"], tint: '#D7B15D', duration: 6500, shake: true },
  'ruby-yacht': { particles: ["🛥️","🌊","💎"], tint: '#63D7F2', duration: 5200, shake: false },
  'royal-castle': { particles: ["🏰","✨","🌟"], tint: '#D7A6FF', duration: 5200, shake: false },
  'galaxy-rocket': { particles: ["🚀","☄️","⭐"], tint: '#FF8C62', duration: 7500, shake: true },
  'mega-galaxy-dragon': { particles: ["🐉","🔥","✨"], tint: '#FF6B6B', duration: 7500, shake: true },
  'emperor-throne': { particles: ["🪑","👑","💫"], tint: '#F5C451', duration: 7500, shake: true },
  'golden-yoyo-planet': { particles: ["🌍","🪐","✨"], tint: '#7BE0C3', duration: 5200, shake: false },
  'yoyo-legendary-galaxy': { particles: ["🌌","🌠","💜"], tint: '#C39BFF', duration: 7500, shake: true },
  'yoyo-balloon-rise': { particles: ["🎈","💗","✨"], tint: '#FF9FBA', duration: 4200, shake: false },
  'love-wave-burst': { particles: ["💝","💞","💗"], tint: '#F34E9B', duration: 4800, shake: false },
  'yoyo-race-entry': { particles: ["🏎️","💨","⚡"], tint: '#7DD7F2', duration: 5200, shake: true },
  'golden-horse-gallop': { particles: ["🐎","🌟","👑"], tint: '#D6B15D', duration: 5200, shake: true },
  'crystal-castle-rise': { particles: ["🏰","💎","✨"], tint: '#9AD7F5', duration: 5600, shake: false },
  'fire-dragon-arrival': { particles: ["🐉","🔥","✨"], tint: '#FF6B6B', duration: 7500, shake: true },
  'yoyo-planet-impact': { particles: ["🪐","🌍","🌌"], tint: '#7BE0C3', duration: 6500, shake: true },
  'yoyo-epic-celebration': { particles: ["🎆","🎇","👑"], tint: '#F5C451', duration: 7500, shake: true },
};

function effectFor(gift) {
  if (!gift) return null;
  return GIFT_ANIMATION_EFFECTS[gift.animation_key] || null;
}

export default function LiveGiftPanel({ userId, receiverId, isHost = false, roomName, onOpenPackages }) {
  const [visible, setVisible] = useState(false);
  const [gifts, setGifts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('starter');
  const [selectedGift, setSelectedGift] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [giftFeedReady, setGiftFeedReady] = useState(false);
  const [incoming, setIncoming] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  const pulse = useRef(new Animated.Value(0.86)).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.35)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;


  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('yoyo_gift_sounds_enabled').then((value) => {
      const enabled = value !== 'false';
      if (active) { soundEnabledRef.current = enabled; setSoundEnabled(enabled); }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const toggleGiftSounds = async () => {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    try { await AsyncStorage.setItem('yoyo_gift_sounds_enabled', String(next)); } catch (error) {}
  };

  const refreshBalance = async () => {
    if (!userId) return;
    const { data } = await supabase.from('wallets').select('purchased_coins')
      .eq('user_id', userId).maybeSingle();
    setBalance(Number(data?.purchased_coins || 0));
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.from('gift_catalog')
        .select('id,name,coin_cost,gross_points,category,emoji,description,animation_key,sound_key,sort_order')
        .eq('active', true).order('sort_order', { ascending: true });
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
    if (!userId || !roomName) return undefined;
    let active = true;
    let channel = null;

    const joinAndListen = async () => {
      await supabase.from('live_room_viewers')
        .delete().eq('room_name', roomName).eq('user_id', userId);
      const { error: joinError } = await supabase.from('live_room_viewers')
        .insert({ room_name: roomName, user_id: userId });
      if (joinError) {
        console.warn('YOYO live gift room join:', joinError.message);
        return;
      }
      if (!active) {
        await supabase.from('live_room_viewers')
          .delete().eq('room_name', roomName).eq('user_id', userId);
        return;
      }

      channel = supabase.channel('yoyo-room-gifts-' + roomName)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'live_gift_events',
          filter: 'room_name=eq.' + roomName,
        }, async (payload) => {
          const row = payload.new;
          const [{ data: gift }, { data: sender }] = await Promise.all([
            supabase.from('gift_catalog')
              .select('name,emoji,coin_cost,animation_key,sound_key')
              .eq('id', row.gift_id).maybeSingle(),
            supabase.from('member_public_profiles')
              .select('display_name').eq('id', row.sender_id).maybeSingle(),
          ]);
          const receivedGift = {
            id: row.id,
            emoji: gift?.emoji || '🎁',
            name: gift?.name || 'هدية جديدة',
            sender: sender?.display_name || 'أحد المتابعين',
            quantity: row.quantity || 1,
            coinCost: Number(gift?.coin_cost || 0),
            animationKey: gift?.animation_key || '',
            soundKey: gift?.sound_key || 'soft-chime',
          };
          setIncoming(receivedGift);
          if (soundEnabledRef.current) playGiftSound(receivedGift.soundKey);
          Vibration.vibrate(receivedGift.coinCost >= 100000 ? [0, 220, 90, 220, 90, 320] : [0, 100, 70, 100]);
          const effect = effectFor({ animation_key: receivedGift.animationKey });
          setTimeout(() => setIncoming((current) => current?.id === row.id ? null : current),
            effect?.duration || 4500);
        })
        .subscribe((status) => {
          if (active) setGiftFeedReady(status === 'SUBSCRIBED');
        });
    };

    joinAndListen().catch((error) => console.warn('YOYO gift realtime:', error?.message || error));
    return () => {
      active = false;
      setGiftFeedReady(false);
      if (channel) supabase.removeChannel(channel);
      supabase.from('live_room_viewers')
        .delete().eq('room_name', roomName).eq('user_id', userId)
        .then(() => {});
    };
  }, [userId, roomName]);

  useEffect(() => {
    if (!incoming) return undefined;
    entrance.setValue(0);
    glow.setValue(0.25);
    drift.setValue(0);
    shake.setValue(0);
    const effect = effectFor({ animation_key: incoming.animationKey });
    const animations = [
      Animated.spring(entrance, { toValue: 1, friction: 5, tension: 55, useNativeDriver: true }),
      Animated.loop(Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])),
    ];
    if (effect?.shake) {
      animations.push(Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 65, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 65, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 65, useNativeDriver: true }),
      ]));
    }
    const runner = Animated.parallel(animations);
    runner.start();
    return () => runner.stop();
  }, [incoming, entrance, glow, drift, shake]);

  const visibleGifts = useMemo(
    () => gifts.filter((gift) => gift.category === selectedCategory),
    [gifts, selectedCategory],
  );

  const sendGift = async () => {
    if (!selectedGift || !receiverId || !roomName || sending) return;
    if (!giftFeedReady) {
      Alert.alert('جارٍ الاتصال', 'انتظر لحظة حتى يكتمل الاتصال بغرفة الهدايا.');
      return;
    }
    const total = Number(selectedGift.coin_cost) * quantity;
    if (balance < total) {
      Alert.alert('رصيدك غير كافٍ', 'افتح باقات العملات واختر الباقة المناسبة.', [
        { text: 'لاحقًا', style: 'cancel' },
        ...(onOpenPackages ? [{ text: 'عرض الباقات', onPress: onOpenPackages }] : []),
      ]);
      return;
    }
    setSending(true);
    const { error } = await supabase.rpc('send_live_gift', {
      p_receiver_id: receiverId,
      p_gift_id: selectedGift.id,
      p_quantity: quantity,
      p_room_name: roomName,
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

  const effect = incoming ? effectFor({ animation_key: incoming.animationKey }) : null;
  const tint = effect?.tint || COLORS.gold;
  const particles = effect?.particles || (incoming ? [incoming.emoji, '✨', '💗'] : []);
  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [8, -14] });
  const shakeX = shake.interpolate({ inputRange: [-1, 0, 1], outputRange: [-5, 0, 5] });
  const liveSoundToggle = (
    <TouchableOpacity style={styles.liveSoundToggle} onPress={toggleGiftSounds}>
      <Text style={styles.soundToggleText}>{soundEnabled ? '🔊 صوت الهدايا' : '🔇 صامت'}</Text>
    </TouchableOpacity>
  );
  const incomingEffect = incoming ? (
    <View pointerEvents="none" style={styles.effectLayer}>
      <Animated.View style={[styles.effectGlow, {
        borderColor: tint, opacity: glow,
        transform: [{ scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.18] }) }],
      }]} />
      <Animated.View style={[styles.effectCard, {
        borderColor: tint,
        opacity: entrance,
        transform: [{ scale: entrance }, { translateY }, { translateX: shakeX }],
        shadowColor: tint,
      }]}>
        <View style={styles.particleRow}>
          {particles.map((particle, index) => (
            <Text key={index} style={[styles.particle, { transform: [{ translateY: index % 2 ? -12 : 8 }] }]}>{particle}</Text>
          ))}
        </View>
        <Text style={styles.megaLabel}>{incoming.coinCost >= 100000 ? 'هدية أسطورية وصلت!' : 'هدية وصلت!'}</Text>
        <Text style={[styles.effectEmoji, incoming.coinCost >= 100000 && styles.megaEmoji]}>{incoming.emoji}</Text>
        <Text style={[styles.effectTitle, { color: tint }]}>{incoming.name}</Text>
        <Text style={styles.effectSubtitle}>
          {incoming.sender} أرسل الهدية {incoming.quantity > 1 ? '× ' + incoming.quantity : ''}
        </Text>
        {incoming.coinCost >= 100000 ? (
          <Text style={[styles.valueLabel, { color: tint }]}> {incoming.coinCost.toLocaleString('ar-EG')} عملة </Text>
        ) : null}
      </Animated.View>
    </View>
  ) : null;

  if (isHost) return <>{liveSoundToggle}{incomingEffect}</>;

  return (
    <>
      {liveSoundToggle}
      {incomingEffect}
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
            <TouchableOpacity style={styles.soundSetting} onPress={toggleGiftSounds}><Text style={styles.soundToggleText}>{soundEnabled ? '🔊 كتم أصوات الهدايا' : '🔇 تشغيل أصوات الهدايا'}</Text></TouchableOpacity>
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
                      style={[styles.gift, selectedGift?.id === gift.id && styles.giftSelected,
                        Number(gift.coin_cost) >= 100000 && styles.megaGift]}
                      onPress={() => setSelectedGift(gift)}>
                      <Text style={styles.giftEmoji}>{gift.emoji}</Text>
                      <Text style={styles.giftName} numberOfLines={1}>{gift.name}</Text>
                      <Text style={styles.giftPrice}>🪙 {Number(gift.coin_cost).toLocaleString('ar-EG')}</Text>
                      {Number(gift.coin_cost) >= 100000 ? <Text style={styles.megaTag}>فائقة الندرة</Text> : null}
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
                <TouchableOpacity style={[styles.sendButton, (sending || !giftFeedReady) && { opacity: 0.6 }]}
                  onPress={sendGift} disabled={sending || !giftFeedReady}>
                  {sending ? <ActivityIndicator color="#fff" /> : !giftFeedReady ?
                    <Text style={styles.sendText}>جاري الاتصال بغرفة الهدايا...</Text> :
                    <Text style={styles.sendText}>إرسال {selectedGift.emoji} — {(Number(selectedGift.coin_cost) * quantity).toLocaleString('ar-EG')} عملة</Text>}
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
  hostSoundToggle: { position: 'absolute', top: 12, right: 12, zIndex: 100, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(20,14,30,0.92)', borderWidth: 1, borderColor: '#6C557D' },
  liveSoundToggle: { position: 'absolute', left: 16, bottom: 88, zIndex: 25, elevation: 8, paddingVertical: 10, paddingHorizontal: 13, borderRadius: 18, backgroundColor: COLORS.card2, borderWidth: 1, borderColor: '#6C557D' },
  soundSetting: { alignSelf: 'flex-end', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 12, backgroundColor: COLORS.card2, marginBottom: 8 },
  soundToggleText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
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
  megaGift: { borderColor: '#A783D5', backgroundColor: '#211832' },
  megaTag: { color: '#D6B4FF', fontSize: 9, fontWeight: '900', marginTop: 4 },
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
  effectLayer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 80, alignItems: 'center', justifyContent: 'center' },
  effectGlow: { position: 'absolute', width: 300, height: 300, borderWidth: 5, borderRadius: 150, backgroundColor: 'rgba(170,120,255,0.08)' },
  effectCard: { width: '88%', maxWidth: 360, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(13,8,23,0.94)', borderWidth: 2, borderRadius: 28, paddingVertical: 22, paddingHorizontal: 16, elevation: 18, shadowOpacity: 0.65, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } },
  particleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 4 },
  particle: { fontSize: 27 },
  megaLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  effectEmoji: { fontSize: 72 },
  megaEmoji: { fontSize: 104 },
  effectTitle: { fontSize: 24, fontWeight: '900', marginTop: 8, textAlign: 'center' },
  effectSubtitle: { color: '#FFFFFF', fontSize: 14, marginTop: 8, textAlign: 'center' },
  valueLabel: { fontSize: 17, fontWeight: '900', marginTop: 10 },
});
