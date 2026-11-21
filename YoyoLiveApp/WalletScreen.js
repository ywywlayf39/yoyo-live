import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
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
  approved: 'تمت الموافقة',
  rejected: 'مرفوض',
  paid: 'تم الصرف',
}[status] || status || '—');

export default function WalletScreen({ userId, onBack }) {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

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
          .select('id,amount_egp,status,created_at')
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
                <Text style={styles.balanceLabel}>العملات المتاحة</Text>
                <Text style={styles.balanceValue}>🪙 {coins(wallet.purchased_coins)}</Text>
                <View style={styles.balanceDivider} />
                <View style={styles.balanceRow}>
                  <View style={styles.balanceItem}>
                    <Text style={styles.balanceLabel}>الأرباح المتاحة</Text>
                    <Text style={styles.moneyValue}>{money(wallet.earned_balance_egp)} ج.م</Text>
                  </View>
                  <View style={styles.balanceItem}>
                    <Text style={styles.balanceLabel}>أرباح قيد التسوية</Text>
                    <Text style={styles.pendingValue}>{money(wallet.pending_balance_egp)} ج.م</Text>
                  </View>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{coins(wallet.earned_points)}</Text>
                  <Text style={styles.muted}>نقاط مكتسبة</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{coins(wallet.pending_points)}</Text>
                  <Text style={styles.muted}>نقاط معلّقة</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{coins(wallet.lifetime_points)}</Text>
                  <Text style={styles.muted}>إجمالي النقاط</Text>
                </View>
              </View>
            </>
          )}

          <View style={styles.noticeCard}>
            <Text style={styles.cardTitle}>معلومات مهمة</Text>
            <Text style={styles.muted}>
              الحد الأدنى المخطط لطلب السحب هو 500 جنيه. شراء العملات وصرف الأرباح لن يتم تفعيله قبل ربط وسيلة دفع ومراجعة آمنة.
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
                <Text style={styles.cardTitle}>طلب سحب — {money(item.amount_egp)} ج.م</Text>
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
