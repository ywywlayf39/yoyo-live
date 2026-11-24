import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { supabase } from './supabase';
import * as ImagePicker from 'expo-image-picker';

const C = {
  bg: '#0B0912', card: '#191424', card2: '#241B35',
  pink: '#F34E9B', gold: '#F5C451', white: '#FFFFFF',
  muted: '#AAA1B8', border: '#3B304B',
};
const money = value => Number(value || 0).toLocaleString('ar-EG');
const coins = value => Number(value || 0).toLocaleString('ar-EG');

export default function PackagesScreen({ userId, onBack }) {
  const [packages, setPackages] = useState([]);
  const [settings, setSettings] = useState(null);
  const [selected, setSelected] = useState(null);
  const [method, setMethod] = useState('vodafone_cash');
  const [proof, setProof] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [{ data: packageRows, error: packageError }, { data: paymentData, error: paymentError }] = await Promise.all([
        supabase.from('coin_packages')
          .select('id,name,price_egp,coins,bonus_coins,active')
          .eq('active', true)
          .order('sort_order', { ascending: true }),
        supabase.from('yoyo_payment_settings')
          .select('vodafone_cash_number,instapay_identifier')
          .eq('id', true).maybeSingle(),
      ]);
      if (packageError) throw packageError;
      setPackages(packageRows || []);
      setSelected(current => current && (packageRows || []).some(item => item.id === current.id)
        ? (packageRows || []).find(item => item.id === current.id) : (packageRows || [])[0] || null);
      setSettings(paymentData || null);
      if (paymentError) console.warn('YOYO payment settings:', paymentError.message);
    } catch (e) {
      setError(e?.message || 'تعذر تحميل الباقات. حاول مرة أخرى.');
      setPackages([]);
      setSelected(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const chooseProof = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('إذن الصور مطلوب', 'اسمح للتطبيق بالوصول إلى الصور لاختيار إيصال التحويل.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: false, quality: 0.85,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
          Alert.alert('الصورة كبيرة', 'اختر صورة لا يزيد حجمها عن 5 ميجابايت.');
          return;
        }
        setProof(asset);
      }
    } catch (e) {
      Alert.alert('تعذر اختيار الصورة', e?.message || 'حاول مرة أخرى.');
    }
  };

  const paymentValue = method === 'vodafone_cash'
    ? settings?.vodafone_cash_number : settings?.instapay_identifier;

  const submitRequest = () => {
    if (!selected || !userId || sending) return;
    if (!proof?.uri) {
      Alert.alert('صورة التحويل مطلوبة', 'اختار سكرين شوت التحويل أولًا.');
      return;
    }
    if (!paymentValue) {
      Alert.alert('وسيلة الدفع غير متاحة', 'الأدمن لم يضف بيانات وسيلة الدفع المختارة بعد.');
      return;
    }
    Alert.alert(
      'تأكيد طلب الشحن',
      'تأكد من تحويل مبلغ الباقة إلى البيانات الموضحة، ثم أرسل صورة الإيصال. لن تضاف العملات إلا بعد مراجعة الأدمن والتحقق من التحويل.',
      [
        { text: 'رجوع', style: 'cancel' },
        { text: 'إرسال للمراجعة', onPress: async () => {
          setSending(true);
          let uploadedPath = null;
          try {
            const ext = (proof.fileName || proof.uri.split('.').pop() || 'jpg').split('.').pop().toLowerCase();
            const mime = proof.mimeType || (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
            uploadedPath = userId + '/' + Date.now() + '.' + (mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg');
            const response = await fetch(proof.uri);
            if (!response.ok) throw new Error('تعذر قراءة صورة الإيصال من الهاتف.');
            const bytes = await response.arrayBuffer();
            // React Native's Blob implementation cannot wrap ArrayBuffer reliably.
            // Supabase Storage accepts Uint8Array directly; avoid constructing Blob.
            const fileBytes = new Uint8Array(bytes);
            const { error: uploadError } = await supabase.storage.from('payment-proofs')
              .upload(uploadedPath, fileBytes, { contentType: mime, upsert: false });
            if (uploadError) throw uploadError;
            const { data: requestId, error: insertError } = await supabase.rpc('yoyo_create_coin_purchase_request', {
              p_package_id: selected.id,
              p_payment_method: method,
              p_transfer_reference: 'proof-upload',
              p_proof_storage_path: uploadedPath,
            });
            if (insertError || !requestId) throw insertError || new Error('تعذر إنشاء طلب الشحن.');
            setProof(null);
            Alert.alert('تم استلام الطلب', 'وصلت صورة التحويل للأدمن. ستضاف العملات بعد التحقق من وصول المبلغ.');
            await load(true);
          } catch (e) {
            if (uploadedPath) {
              await supabase.storage.from('payment-proofs').remove([uploadedPath]);
            }
            Alert.alert('تعذر إرسال الطلب', e?.message || 'حاول مرة أخرى.');
          } finally {
            setSending(false);
          }
        }},
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>رجوع ←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>باقات العملات 🪙</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.pink} />
          <Text style={styles.muted}>جارٍ تحميل الباقات...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <TouchableOpacity style={styles.refreshButton} onPress={() => load(true)} disabled={refreshing}>
            <Text style={styles.refreshText}>{refreshing ? 'جارٍ التحديث...' : 'تحديث الباقات ↻'}</Text>
          </TouchableOpacity>

          {!!error && (
            <View style={styles.noticeCard}>
              <Text style={styles.error}>{error}</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => load()}>
                <Text style={styles.buttonText}>إعادة المحاولة</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.introCard}>
            <Text style={styles.introTitle}>اختار باقة العملات المناسبة لك</Text>
            <Text style={styles.muted}>اختار الباقة، حوّل المبلغ، وارفع صورة الإيصال. العملات تضاف بعد مراجعة الأدمن فقط.</Text>
          </View>

          {packages.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🎁</Text>
              <Text style={styles.cardTitle}>لا توجد باقات مفعّلة حاليًا</Text>
              <Text style={styles.muted}>الأدمن يقدر يضيف الباقات ويفعّلها من لوحة الإدارة.</Text>
            </View>
          ) : packages.map(item => {
            const active = selected?.id === item.id;
            return (
              <TouchableOpacity key={item.id} onPress={() => setSelected(item)}
                style={[styles.packageCard, active && styles.packageSelected]}>
                <View style={styles.packageTop}>
                  <Text style={styles.packagePrice}>{money(item.price_egp)} جنيه</Text>
                  <Text style={styles.packageName}>{item.name}</Text>
                </View>
                <Text style={styles.coinValue}>🪙 {coins(Number(item.coins || 0) + Number(item.bonus_coins || 0))} عملة</Text>
                <Text style={styles.muted}>الأساسية {coins(item.coins)} {Number(item.bonus_coins || 0) > 0 ? ' + ' + coins(item.bonus_coins) + ' هدية إضافية' : ''}</Text>
                {active && <Text style={styles.selectedText}>✓ الباقة المختارة</Text>}
              </TouchableOpacity>
            );
          })}

          {!!selected && (
            <View style={styles.paymentCard}>
              <Text style={styles.sectionTitle}>طريقة الدفع</Text>
              <View style={styles.methodRow}>
                {[
                  ['vodafone_cash', 'فودافون كاش'],
                  ['instapay', 'InstaPay'],
                ].map(([value, label]) => (
                  <TouchableOpacity key={value} onPress={() => setMethod(value)}
                    style={[styles.methodChip, method === value && styles.methodChipActive]}>
                    <Text style={styles.methodText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.financialLabel}>حوّل إلى البيانات التالية:</Text>
              <View style={styles.paymentDetails}>
                <Text style={styles.paymentValue}>{paymentValue || 'بيانات الدفع لم يضفها الأدمن بعد'}</Text>
              </View>
              <Text style={styles.financialLabel}>المبلغ المطلوب</Text>
              <Text style={styles.amount}>{money(selected.price_egp)} جنيه مصري</Text>

              <Text style={styles.sectionTitle}>صورة إيصال التحويل</Text>
              <TouchableOpacity style={styles.uploadButton} onPress={chooseProof} disabled={sending}>
                <Text style={styles.uploadText}>{proof ? 'اختيار صورة أخرى' : '📷 اختيار صورة الإيصال'}</Text>
              </TouchableOpacity>
              {proof?.uri ? (
                <View style={styles.proofBox}>
                  <Image source={{ uri: proof.uri }} style={styles.proofImage} resizeMode="contain" />
                  <Text style={styles.muted}>{proof.fileName || 'صورة الإيصال جاهزة للإرسال'}</Text>
                  <TouchableOpacity onPress={() => setProof(null)}>
                    <Text style={styles.removeProof}>إزالة الصورة</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.muted}>الصورة JPG أو PNG أو WebP وبحد أقصى 5 ميجابايت.</Text>
              )}
              <TouchableOpacity style={[styles.primaryButton, (sending || !paymentValue || !proof) && styles.disabledButton]}
                onPress={submitRequest} disabled={sending || !paymentValue || !proof}>
                {sending ? <ActivityIndicator color={C.white} /> : <Text style={styles.buttonText}>إرسال طلب الشحن للأدمن</Text>}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.noticeCard}>
            <Text style={styles.cardTitle}>مهم قبل الشحن</Text>
            <Text style={styles.muted}>لا ترسل أكثر من طلب لنفس التحويل. احتفظ بالإيصال حتى تنتهي المراجعة. رفع الصورة لا يعني اعتماد الدفع، ولن يتم إضافة أي عملات قبل تأكيد الأدمن استلام المبلغ.</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 18, paddingVertical: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.border },
  title: { color: C.white, fontSize: 21, fontWeight: '900' },
  backButton: { padding: 8 },
  backText: { color: C.pink, fontWeight: 'bold' },
  content: { padding: 16, paddingBottom: 36, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: C.muted, fontSize: 13, lineHeight: 21, textAlign: 'right' },
  refreshButton: { alignSelf: 'flex-start', backgroundColor: C.card2, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  refreshText: { color: C.white, fontWeight: 'bold' },
  introCard: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, gap: 7 },
  introTitle: { color: C.gold, fontSize: 18, fontWeight: '900', textAlign: 'right' },
  emptyCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 22, alignItems: 'center', gap: 10 },
  emptyIcon: { fontSize: 38 },
  cardTitle: { color: C.white, fontWeight: 'bold', textAlign: 'right' },
  packageCard: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, gap: 7 },
  packageSelected: { borderColor: C.gold, backgroundColor: '#282035' },
  packageTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  packageName: { color: C.white, fontSize: 16, fontWeight: '900', flex: 1, textAlign: 'right' },
  packagePrice: { color: C.gold, fontSize: 17, fontWeight: '900' },
  coinValue: { color: C.white, fontSize: 23, fontWeight: '900', textAlign: 'right' },
  selectedText: { color: C.gold, textAlign: 'right', fontWeight: '800' },
  paymentCard: { backgroundColor: C.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, gap: 12 },
  sectionTitle: { color: C.white, fontSize: 16, fontWeight: '900', textAlign: 'right' },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  methodChip: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border },
  methodChipActive: { borderColor: C.gold, backgroundColor: '#4B3B1D' },
  methodText: { color: C.white, fontWeight: '800' },
  financialLabel: { color: '#D6CBE5', fontSize: 13, textAlign: 'right', fontWeight: '700' },
  paymentDetails: { backgroundColor: C.card2, borderRadius: 12, padding: 13, borderWidth: 1, borderColor: C.border },
  paymentValue: { color: C.white, textAlign: 'right', fontSize: 16, fontWeight: '800' },
  amount: { color: C.gold, fontSize: 24, fontWeight: '900', textAlign: 'right' },
  uploadButton: { backgroundColor: C.card2, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.pink },
  uploadText: { color: C.white, fontWeight: '900' },
  proofBox: { alignItems: 'center', gap: 7 },
  proofImage: { width: '100%', height: 190, borderRadius: 12, backgroundColor: C.card2 },
  removeProof: { color: '#FF8585', fontWeight: '800', padding: 5 },
  primaryButton: { backgroundColor: C.pink, borderRadius: 12, padding: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  buttonText: { color: C.white, fontWeight: '900', fontSize: 15 },
  disabledButton: { opacity: 0.45 },
  noticeCard: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, gap: 8 },
  error: { color: '#FF8585', textAlign: 'right', lineHeight: 21 },
});
