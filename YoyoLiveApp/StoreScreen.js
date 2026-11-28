import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { supabase } from './supabase';

const C = {
  bg: '#0B0912', card: '#191424', card2: '#241B35',
  purple: '#8655F5', pink: '#F34E9B', gold: '#F5C451',
  white: '#FFFFFF', muted: '#AAA1B8', border: '#382C49',
};
const TABS = [
  { id: 'all', label: 'الكل' },
  { id: 'frames', label: 'الإطارات' },
  { id: 'title', label: 'الألقاب' },
  { id: 'entry_effect', label: 'تأثيرات الدخول' },
  { id: 'profile_theme', label: 'الخلفيات' },
  { id: 'gifts', label: 'الهدايا' },
  { id: 'owned', label: 'مقتنياتي' },
];
const money = (value) => Number(value || 0).toLocaleString('ar-EG');

export default function StoreScreen({ userId, onBack, onOpenPackages }) {
  const [tab, setTab] = useState('all');
  const [items, setItems] = useState([]);
  const [frames, setFrames] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [ownedItems, setOwnedItems] = useState([]);
  const [ownedFrames, setOwnedFrames] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const [catalog, frameCatalog, giftCatalog, inventory, frameInventory, wallet] = await Promise.all([
        supabase.from('yoyo_store_items').select('id,item_code,name,category,description,emoji,coin_cost,sort_order').eq('active', true).order('sort_order'),
        supabase.from('yoyo_profile_frames').select('code,name,tier,coin_cost,vip_only,active,sort_order').eq('active', true).order('sort_order'),
        supabase.from('gift_catalog').select('id,name,coin_cost,category,emoji,description').eq('active', true).order('sort_order').limit(100),
        supabase.from('yoyo_user_store_inventory').select('item_id').eq('user_id', userId),
        supabase.from('yoyo_user_profile_frames').select('frame_code').eq('user_id', userId),
        supabase.from('wallets').select('purchased_coins').eq('user_id', userId).maybeSingle(),
      ]);
      const failed = [catalog, frameCatalog, giftCatalog, inventory, frameInventory, wallet].find((r) => r.error);
      if (failed?.error) throw failed.error;
      setItems(catalog.data || []);
      setFrames(frameCatalog.data || []);
      setGifts(giftCatalog.data || []);
      setOwnedItems((inventory.data || []).map((row) => row.item_id));
      setOwnedFrames((frameInventory.data || []).map((row) => row.frame_code));
      setBalance(wallet.data?.purchased_coins || 0);
    } catch (e) {
      setError(e?.message || 'تعذر تحميل المتجر. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const buyFrame = async (frame) => {
    if (busyId) return;
    const alreadyOwned = ownedFrames.includes(frame.code);
    const shouldSelect = alreadyOwned || frame.vip_only || Number(frame.coin_cost) === 0;
    if (!shouldSelect && Number(frame.coin_cost) > balance) {
      Alert.alert('رصيد غير كافٍ', 'اشحن محفظتك ثم ارجع لإكمال الشراء.', [
        { text: 'لاحقًا', style: 'cancel' },
        { text: 'شحن المحفظة', onPress: onOpenPackages },
      ]);
      return;
    }
    setBusyId(frame.code);
    try {
      const rpc = shouldSelect ? 'yoyo_select_profile_frame' : 'yoyo_unlock_profile_frame';
      const { error: purchaseError } = await supabase.rpc(rpc, { p_frame_code: frame.code });
      if (purchaseError) throw purchaseError;
      Alert.alert('تم بنجاح', 'تم تفعيل الإطار على ملفك الشخصي.');
      await load();
    } catch (e) {
      Alert.alert('تعذر إتمام العملية', e?.message || 'حاول مرة أخرى.');
    } finally {
      setBusyId(null);
    }
  };

  const buyItem = async (item) => {
    if (busyId) return;
    if (ownedItems.includes(item.id)) {
      const { error: equipError } = await supabase.rpc('yoyo_equip_store_item', { p_item_id: item.id });
      if (equipError) Alert.alert('تعذر التفعيل', equipError.message);
      else Alert.alert('تم التفعيل', 'تم تطبيق العنصر على ملفك.');
      return;
    }
    if (Number(item.coin_cost) > balance) {
      Alert.alert('رصيد غير كافٍ', 'اشحن محفظتك ثم ارجع لإكمال الشراء.', [
        { text: 'لاحقًا', style: 'cancel' },
        { text: 'شحن المحفظة', onPress: onOpenPackages },
      ]);
      return;
    }
    Alert.alert('تأكيد الشراء', 'سيتم خصم ' + money(item.coin_cost) + ' كوينز من محفظتك وإضافة العنصر إلى مقتنياتك.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'شراء', onPress: async () => {
        setBusyId(item.id);
        try {
          const { data, error: purchaseError } = await supabase.rpc('yoyo_purchase_store_item', { p_item_id: item.id });
          if (purchaseError) throw purchaseError;
          if (!data?.success) throw new Error('لم يتم تأكيد الشراء.');
          Alert.alert('تم الشراء', 'العنصر أصبح في مقتنياتك ويمكنك تفعيله.');
          await load();
        } catch (e) {
          Alert.alert('تعذر الشراء', e?.message || 'حاول مرة أخرى.');
        } finally {
          setBusyId(null);
        }
      }},
    ]);
  };

  const visibleItems = tab === 'all' || tab === 'owned'
    ? items.filter((item) => tab !== 'owned' || ownedItems.includes(item.id))
    : items.filter((item) => item.category === tab);
  const visibleFrames = tab === 'all' || tab === 'frames' || tab === 'owned'
    ? frames.filter((frame) => tab !== 'owned' || ownedFrames.includes(frame.code))
    : [];
  const visibleGifts = tab === 'all' || tab === 'gifts' ? gifts : [];

  const renderCard = (item, type) => {
    const isFrame = type === 'frame';
    const owned = isFrame ? ownedFrames.includes(item.code) : ownedItems.includes(item.id);
    const id = isFrame ? item.code : item.id;
    return (
      <View key={id} style={styles.itemCard}>
        <View style={styles.itemEmoji}><Text style={styles.emoji}>{isFrame ? '🖼️' : item.emoji || '✨'}</Text></View>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemDescription}>{isFrame ? (item.vip_only ? 'إطار خاص بأعضاء VIP' : 'إطار للصورة الشخصية') : item.description}</Text>
        <Text style={styles.price}>{type === 'gift' ? '🎁 ' : '🪙 '}{money(item.coin_cost)} {type === 'gift' ? 'كوينز / للإرسال' : 'كوينز'}</Text>
        {type === 'gift' ? (
          <Text style={styles.giftHint}>ترسل الهدية من داخل البث المباشر</Text>
        ) : (
          <TouchableOpacity disabled={busyId === id} onPress={() => isFrame ? buyFrame(item) : buyItem(item)} style={[styles.action, owned && styles.ownedAction]}>
            {busyId === id ? <ActivityIndicator color={C.white} /> : <Text style={styles.actionText}>{owned ? 'تفعيل' : 'شراء'}</Text>}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.back}><Text style={styles.backText}>رجوع</Text></TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={styles.title}>متجر YOYO LIVE</Text>
          <Text style={styles.subTitle}>مظهر مميز • ألقاب • تأثيرات</Text>
        </View>
      </View>
      <View style={styles.balanceRow}>
        <View><Text style={styles.balanceLabel}>رصيدك الحالي</Text><Text style={styles.balanceValue}>🪙 {money(balance)} كوينز</Text></View>
        <TouchableOpacity onPress={onOpenPackages} style={styles.charge}><Text style={styles.chargeText}>＋ شحن</Text></TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map((item) => (
          <TouchableOpacity key={item.id} onPress={() => setTab(item.id)} style={[styles.tab, tab === item.id && styles.activeTab]}>
            <Text style={[styles.tabText, tab === item.id && styles.activeTabText]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loading ? <View style={styles.center}><ActivityIndicator size="large" color={C.pink} /><Text style={styles.loadingText}>جارٍ تحميل المتجر...</Text></View> : error ? (
        <View style={styles.center}><Text style={styles.error}>{error}</Text><TouchableOpacity onPress={load} style={styles.action}><Text style={styles.actionText}>إعادة المحاولة</Text></TouchableOpacity></View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {visibleFrames.map((item) => renderCard(item, 'frame'))}
          {visibleItems.map((item) => renderCard(item, 'store'))}
          {visibleGifts.map((item) => renderCard(item, 'gift'))}
          {visibleFrames.length + visibleItems.length + visibleGifts.length === 0 && <Text style={styles.empty}>مفيش عناصر في القسم ده حاليًا.</Text>}
          {visibleGifts.length > 0 && <Text style={styles.footerHint}>الهدايا بتتخصم من رصيدك وقت إرسالها داخل البث، مش عند عرضها هنا.</Text>}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  back: { padding: 10, backgroundColor: C.card2, borderRadius: 10 },
  backText: { color: C.white, fontWeight: '800' },
  title: { color: C.white, fontSize: 21, fontWeight: '900' },
  subTitle: { color: C.muted, fontSize: 12, marginTop: 3 },
  balanceRow: { margin: 14, padding: 14, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { color: C.muted, fontSize: 12 },
  balanceValue: { color: C.gold, fontSize: 18, fontWeight: '900', marginTop: 5 },
  charge: { backgroundColor: C.pink, borderRadius: 11, paddingHorizontal: 16, paddingVertical: 11 },
  chargeText: { color: C.white, fontWeight: '900' },
  tabs: { paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  tab: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 },
  activeTab: { backgroundColor: C.purple, borderColor: C.purple },
  tabText: { color: C.muted, fontWeight: '700', fontSize: 12 },
  activeTabText: { color: C.white },
  grid: { padding: 12, paddingBottom: 30, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  itemCard: { width: '48%', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 12, marginBottom: 12, alignItems: 'center', minHeight: 220 },
  itemEmoji: { width: 62, height: 62, borderRadius: 18, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  emoji: { fontSize: 32 },
  itemName: { color: C.white, fontWeight: '900', textAlign: 'center', fontSize: 14 },
  itemDescription: { color: C.muted, fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 5, minHeight: 34 },
  price: { color: C.gold, fontWeight: '900', fontSize: 12, marginTop: 9 },
  action: { backgroundColor: C.pink, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18, minWidth: 92, alignItems: 'center', marginTop: 10 },
  ownedAction: { backgroundColor: '#315D4C' },
  actionText: { color: C.white, fontWeight: '900', fontSize: 12 },
  giftHint: { color: C.muted, fontSize: 10, marginTop: 12, textAlign: 'center' },
  footerHint: { width: '100%', color: C.muted, textAlign: 'center', padding: 12, lineHeight: 20 },
  empty: { width: '100%', color: C.muted, textAlign: 'center', padding: 30 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 25 },
  loadingText: { color: C.muted, marginTop: 10 },
  error: { color: '#FF8A9B', textAlign: 'center', marginBottom: 14 },
});
