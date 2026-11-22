import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from './supabase';

const MIN_WITHDRAWAL_POINTS = 100000;
const EGP_PER_100K_POINTS = 500;
const EGP_PER_POINT = EGP_PER_100K_POINTS / MIN_WITHDRAWAL_POINTS;

const C = {
  bg: '#0B0912',
  card: '#191424',
  card2: '#241B35',
  purple: '#8655F5',
  pink: '#F34E9B',
  gold: '#F5C451',
  white: '#FFFFFF',
  muted: '#AAA1B8',
  border: '#30263F',
};

const money = (value) =>
  Number(value || 0).toLocaleString('ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const coins = (value) => Number(value || 0).toLocaleString('ar-EG');

const transactionLabel = (type) => ({
  coin_purchase: 'شراء عملات',
  gift_sent: 'إرسال هدية',
  gift_received: 'استلام هدية',
  withdrawal_request: 'طلب سحب',
  withdrawal_paid: 'صرف أرباح',
  refund: 'استرداد',
  admin_adjustment: 'تسوية رصيد',
}[type] || 'حركة رصيد');

const statusLabel = (status) => ({
  pending: 'قيد المراجعة',
  reviewing: 'قيد المراجعة',
  approved: 'تمت الموافقة - بانتظار التحويل',
  rejected: 'مرفوض',
  paid: 'تم الصرف',
}[status] || status || '—');

export default function WalletScreen({ userId, onBack, onOpenPackages }) {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('vodafone_cash');
  const [payoutDetails, setPayoutDetails] = useState('');
  const [withdrawalBusy, setWithdrawalBusy] = useState(false);

  const loadWallet = useCallback(async (isRefresh = false) => {
    if (!userId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const [walletResult, transactionsResult, withdrawalsResult] = await Promise.all([
        supabase
          .from('wallets')
          .select('user_id,purchased_coins,earned_balance_egp,pending_balance_egp,earned_points,pending_points,lifetime_points')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('wallet_transactions')
          .select('id,transaction_type,coins,amount_egp,description,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('withdrawal_requests')
          .select('id,amount_egp,points_requested,status,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      if (walletResult.error) throw walletResult.error;
      if (transactionsResult.error) throw transactionsResult.error;
      if (withdrawalsResult.error) throw withdrawalsResult.error;

      setWallet(walletResult.data || null);
      setTransactions(transactionsResult.data || []);
      setWithdrawals(withdrawalsResult.data || []);
    } catch (loadError) {
      setError(loadError?.message || 'تعذر تحميل المحفظة. حاول مرة أخرى.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const submitWithdrawal = () => {
    const available = Number(wallet?.earned_points || 0);
    const points = Math.floor(available / MIN_WITHDRAWAL_POINTS) * MIN_WITHDRAWAL_POINTS;
    if (points < MIN_WITHDRAWAL_POINTS) {
      Alert.alert('النقاط غير كافية', 'يمكنك طلب السحب عند الوصول إلى 100,000 نقطة مكتسبة على الأقل.');
      return;
    }
    if (payoutDetails.trim().length < 6) {
      Alert.alert('بيانات الاستلام ناقصة', 'اكتب رقم المحفظة أو معرف InstaPay أو بيانات الحساب بشكل صحيح.');
      return;
    }
    const amount = (points / MIN_WITHDRAWAL_POINTS) * EGP_PER_100K_POINTS;
    Alert.alert(
      'تأكيد طلب السحب',
      'سيتم حجز ' + coins(points) + ' نقطة من رصيدك وتحويلها إلى نقاط معلّقة لحين مراجعة الأدمن. القيمة التقديرية ' + money(amount) + ' جنيه.',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'إرسال الطلب', onPress: async () => {
          setWithdrawalBusy(true);
          const { data, error: requestError } = await supabase.rpc('yoyo_create_withdrawal_request', {
            p_points: points,
            p_payout_method: payoutMethod,
            p_payout_details: payoutDetails.trim(),
          });
          setWithdrawalBusy(false);
          if (requestError || !data) {
            Alert.alert('تعذر إرسال طلب السحب', requestError?.message || 'حاول مرة أخرى.');
            return;
          }
          setPayoutDetails('');
          await loadWallet(true);
          Alert.alert('تم إرسال الطلب', 'تم حجز النقاط وإرسال الطلب إلى مراجعة الإدارة. لن يتم الصرف إلا بعد مراجعة الأدمن والتحويل الفعلي.');
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
        <Text style={styles.title}>محفظتي 🪙</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.pink} />
          <Text style={styles.muted}>جارٍ تحميل المحفظة...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => loadWallet(true)}
            disabled={refreshing}
          >
            <Text style={styles.refreshText}>
              {refreshing ? 'جارٍ التحديث...' : 'تحديث الرصيد ↻'}
            </Text>
          </TouchableOpacity>
          {!!onOpenPackages && (
            <TouchableOpacity style={[styles.refreshButton,{backgroundColor:C.pink,alignSelf:'stretch',alignItems:'center',marginTop:2}]}
              onPress={onOpenPackages}>
              <Text style={[styles.refreshText,{color:C.white,fontSize:15}]}>🎁 افتح باقات العملات</Text>
            </TouchableOpacity>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {!wallet ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🪙</Text>
              <Text style={styles.cardTitle}>المحفظة لم تُفعّل لهذا الحساب بعد</Text>
              <Text style={styles.muted}>
                لن نعرض رصيدًا تجريبيًا أو نضيف عملات تلقائيًا. ستظهر بياناتك هنا عندما يتم إنشاء محفظتك بأمان.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>عملات الشراء المتاحة</Text>
                <Text style={styles.balanceValue}>🪙 {coins(wallet.purchased_coins)}</Text>
                <View style={styles.balanceDivider} />
                <Text style={styles.balanceLabel}>نقاطك القابلة للسحب</Text>
                <Text style={styles.withdrawPoints}>{coins(wallet.earned_points)} نقطة</Text>
                <Text style={styles.balanceLabel}>الحد الأدنى للسحب: {coins(MIN_WITHDRAWAL_POINTS)} نقطة = {money(EGP_PER_100K_POINTS)} جنيه</Text>
                <Text style={styles.estimatedValue}>
                  القيمة التقديرية لرصيدك: {money(Number(wallet.earned_points || 0) * EGP_PER_POINT)} جنيه
                </Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: Math.min(100, (Number(wallet.earned_points || 0) / MIN_WITHDRAWAL_POINTS) * 100) + '%' }]} />
                </View>
                <Text style={styles.progressCaption}>
                  {Number(wallet.earned_points || 0) >= MIN_WITHDRAWAL_POINTS
                    ? 'وصلت للحد الأدنى للنقاط.'
                    : 'متبقي ' + coins(MIN_WITHDRAWAL_POINTS - Number(wallet.earned_points || 0)) + ' نقطة للوصول إلى الحد الأدنى.'}
                </Text>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{coins(wallet.pending_points)}</Text>
                  <Text style={styles.muted}>نقاط قيد التسوية</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{coins(wallet.lifetime_points)}</Text>
                  <Text style={styles.muted}>إجمالي النقاط</Text>
                </View>
              </View>

              <View style={styles.withdrawPanel}>
                <Text style={styles.cardTitle}>💸 طلب سحب النقاط</Text>
                <Text style={styles.muted}>يتم طلب السحب بمضاعفات 100,000 نقطة. سيتم طلب أكبر عدد من المضاعفات المتاح في رصيدك المكتسب، وتظل النقاط محجوزة لحين مراجعة الإدارة.</Text>
                <Text style={styles.financialLabel}>طريقة استلام الأرباح</Text>
                <View style={styles.methodRow}>
                  {[
                    ['vodafone_cash','فودافون كاش'],
                    ['instapay','InstaPay'],
                    ['bank_transfer','تحويل بنكي'],
                  ].map(([value,label]) => (
                    <TouchableOpacity key={value} onPress={() => setPayoutMethod(value)}
                      style={[styles.methodChip,payoutMethod===value && styles.methodChipActive]}>
                      <Text style={styles.methodText}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.financialLabel}>رقم المحفظة أو بيانات الحساب</Text>
                <TextInput
                  value={payoutDetails}
                  onChangeText={setPayoutDetails}
                  placeholder="أدخل بيانات الاستلام بدقة"
                  placeholderTextColor="#8F849F"
                  style={styles.payoutInput}
                  autoCapitalize="none"
                  maxLength={300}
                />
                <Text style={styles.payoutPrivacy}>بيانات الاستلام تظهر للأدمن المصرح له فقط لمراجعة طلبك.</Text>
                <TouchableOpacity
                  style={[styles.withdrawSubmit, (withdrawalBusy || Number(wallet.earned_points || 0) < MIN_WITHDRAWAL_POINTS) && styles.withdrawDisabled]}
                  onPress={submitWithdrawal}
                  disabled={withdrawalBusy || Number(wallet.earned_points || 0) < MIN_WITHDRAWAL_POINTS}
                >
                  <Text style={styles.actionText}>{withdrawalBusy ? 'جارٍ إرسال الطلب...' : 'إرسال طلب السحب'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={styles.noticeCard}>
            <Text style={styles.cardTitle}>معلومات مهمة</Text>
            <Text style={styles.muted}>
              سعر التحويل المعتمد داخل التطبيق: كل 100,000 نقطة مكتسبة = 500 جنيه (0.005 جنيه للنقطة). الحد الأدنى للسحب 100,000 نقطة. المبلغ المعروض تقديري، وطلب السحب والصرف الفعلي ما زالا متوقفين حتى تجهيز مراجعة الأدمن ومسار صرف آمن. شراء العملات متاح بطلب تحويل يدوي، ولا تُضاف العملات إلا بعد مراجعة الأدمن.
            </Text>
            <Text style={styles.noticeFoot}>نسبة توزيع الهدايا المعتمدة: 70٪ للمضيف و30٪ للمنصة.</Text>
          </View>

          <Text style={styles.sectionTitle}>آخر حركات المحفظة</Text>
          {transactions.length === 0 ? (
            <Text style={styles.emptyLine}>لا توجد حركات مسجلة حتى الآن.</Text>
          ) : transactions.map((item) => (
            <View key={item.id} style={styles.listCard}>
              <View style={styles.listText}>
                <Text style={styles.cardTitle}>{transactionLabel(item.transaction_type)}</Text>
                {!!item.description && <Text style={styles.muted}>{item.description}</Text>}
                <Text style={styles.dateText}>
                  {item.created_at ? new Date(item.created_at).toLocaleDateString('ar-EG') : ''}
                </Text>
              </View>
              <Text style={styles.transactionValue}>
                {Number(item.coins || 0) > 0 ? `🪙 ${coins(item.coins)}` : `${money(item.amount_egp)} ج.م`}
              </Text>
            </View>
          ))}

          <Text style={styles.sectionTitle}>طلبات السحب</Text>
          {withdrawals.length === 0 ? (
            <Text style={styles.emptyLine}>لا توجد طلبات سحب حتى الآن.</Text>
          ) : withdrawals.map((item) => (
            <View key={item.id} style={styles.listCard}>
              <View style={styles.listText}>
                <Text style={styles.cardTitle}>طلب سحب — {coins(item.points_requested)} نقطة</Text>
                <Text style={styles.muted}>{statusLabel(item.status)}</Text>
                <Text style={styles.dateText}>
                  {item.created_at ? new Date(item.created_at).toLocaleDateString('ar-EG') : ''}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: { color: C.white, fontSize: 21, fontWeight: '900' },
  backButton: { padding: 8 },
  backText: { color: C.pink, fontWeight: 'bold' },
  content: { padding: 16, paddingBottom: 35 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: C.muted, fontSize: 13, lineHeight: 21, textAlign: 'right' },
  refreshButton: {
    alignSelf: 'flex-start',
    backgroundColor: C.card2,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    marginBottom: 14,
  },
  refreshText: { color: C.white, fontWeight: 'bold' },
  error: { color: '#FF8585', textAlign: 'right', marginBottom: 12 },
  emptyCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  emptyIcon: { fontSize: 40 },
  cardTitle: { color: C.white, fontWeight: 'bold', textAlign: 'right', marginBottom: 4 },
  balanceCard: {
    backgroundColor: C.card2,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#65419A',
  },
  balanceLabel: { color: '#D6CBE5', fontSize: 13, textAlign: 'right' },
  balanceValue: { color: C.gold, fontSize: 30, fontWeight: '900', textAlign: 'right', marginTop: 8 },
  balanceDivider: { height: 1, backgroundColor: '#FFFFFF22', marginVertical: 17 },
  withdrawPoints: { color: C.gold, fontSize: 27, fontWeight: '900', textAlign: 'right', marginVertical: 8 },
  progressTrack: { height: 9, borderRadius: 9, backgroundColor: '#FFFFFF20', overflow: 'hidden', marginTop: 10 },
  progressFill: { height: 9, borderRadius: 9, backgroundColor: '#8FE0B0' },
  progressCaption: { color: C.muted, fontSize: 12, textAlign: 'right', marginTop: 7 },
  estimatedValue: { color: '#8FE0B0', fontSize: 15, fontWeight: '800', textAlign: 'right', marginTop: 10 },
  withdrawPanel: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginTop: 14, borderWidth: 1, borderColor: C.border, gap: 10 },
  financialLabel: { color: '#D6CBE5', fontSize: 13, textAlign: 'right', fontWeight: '700' },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 7 },
  methodChip: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border },
  methodChipActive: { borderColor: C.gold, backgroundColor: '#4B3B1D' },
  methodText: { color: C.white, fontSize: 12, fontWeight: '700' },
  payoutInput: { backgroundColor: C.card2, color: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, textAlign: 'right', minHeight: 46 },
  payoutPrivacy: { color: C.muted, fontSize: 11, textAlign: 'right' },
  withdrawSubmit: { backgroundColor: C.purple, padding: 13, borderRadius: 12, alignItems: 'center' },
  withdrawDisabled: { opacity: 0.45 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  balanceItem: { flex: 1 },
  moneyValue: { color: '#8FE0B0', fontSize: 19, fontWeight: 'bold', textAlign: 'right', marginTop: 7 },
  pendingValue: { color: C.gold, fontSize: 19, fontWeight: 'bold', textAlign: 'right', marginTop: 7 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    gap: 5,
  },
  statValue: { color: C.white, fontWeight: '900', fontSize: 16 },
  noticeCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 15,
    borderWidth: 1,
    borderColor: C.border,
    gap: 8,
  },
  noticeFoot: { color: C.gold, textAlign: 'right', fontSize: 12, fontWeight: 'bold' },
  sectionTitle: { color: C.white, fontSize: 17, fontWeight: 'bold', textAlign: 'right', marginTop: 22, marginBottom: 10 },
  emptyLine: { color: C.muted, textAlign: 'right', padding: 13, backgroundColor: C.card, borderRadius: 12 },
  listCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  listText: { flex: 1 },
  dateText: { color: '#81788D', fontSize: 11, marginTop: 5, textAlign: 'right' },
  transactionValue: { color: C.gold, fontWeight: 'bold' },
});
