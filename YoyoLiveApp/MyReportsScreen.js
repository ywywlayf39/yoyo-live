import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';

const statusLabels = {
  pending: 'قيد المراجعة',
  reviewing: 'تحت الفحص',
  resolved: 'تمت المعالجة',
  rejected: 'مرفوض',
  cancelled: 'تم إلغاء الشكوى',
};

export default function MyReportsScreen({ userId, onBack }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const loadReports = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_reports')
      .select('id, reason, details, status, created_at')
      .eq('reporter_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      Alert.alert('تعذر تحميل الشكاوى', 'حاول مرة أخرى بعد قليل.');
    } else {
      setReports(data || []);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const cancelReport = (report) => {
    Alert.alert(
      'إلغاء الشكوى',
      'هل تريد إلغاء هذه الشكوى؟ ستظل محفوظة في سجل الإدارة بحالة «تم إلغاء الشكوى».',
      [
        { text: 'رجوع', style: 'cancel' },
        {
          text: 'إلغاء الشكوى',
          style: 'destructive',
          onPress: async () => {
            setBusyId(report.id);
            const { data, error } = await supabase.rpc('yoyo_cancel_own_report', { p_report_id: report.id });
            setBusyId('');
            if (error) {
              Alert.alert('تعذر إلغاء الشكوى', 'حاول مرة أخرى. إذا كانت الإدارة بدأت مراجعتها بالفعل فلن يمكن إلغاؤها.');
              return;
            }
            if (data !== true) {
              Alert.alert('لا يمكن إلغاء الشكوى', 'الشكوى لم تعد في حالة الانتظار.');
              await loadReports();
              return;
            }
            await loadReports();
            Alert.alert('تم الإلغاء', 'تم إلغاء الشكوى بنجاح.');
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack} style={styles.back}><Text style={styles.backText}>رجوع</Text></TouchableOpacity>
      <Text style={styles.title}>شكاواي وبلاغاتي</Text>
      <Text style={styles.subtitle}>تقدر تلغي الشكوى طالما حالتها «قيد المراجعة». بعد بدء المعالجة يظل سجلها محفوظًا.</Text>
      {loading ? <ActivityIndicator color="#F5C451" size="large" style={{ marginTop: 35 }} /> : reports.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyText}>لا توجد شكاوى مسجلة حتى الآن.</Text></View>
      ) : reports.map(report => {
        const canCancel = report.status === 'pending';
        return (
          <View key={report.id} style={styles.card}>
            <Text style={styles.reason}>{report.reason || 'بلاغ بدون سبب محدد'}</Text>
            {!!report.details && <Text style={styles.details}>{report.details}</Text>}
            <Text style={styles.meta}>الحالة: {statusLabels[report.status] || report.status || 'غير محدد'}</Text>
            <Text style={styles.date}>{new Date(report.created_at).toLocaleString('ar-EG')}</Text>
            {canCancel ? (
              <TouchableOpacity
                style={[styles.cancelButton, busyId === report.id && styles.disabled]}
                disabled={!!busyId}
                onPress={() => cancelReport(report)}
              >
                {busyId === report.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.cancelText}>إلغاء الشكوى</Text>}
              </TouchableOpacity>
            ) : (
              <Text style={styles.locked}>لا يمكن إلغاء هذه الشكوى بعد بدء معالجتها.</Text>
            )}
          </View>
        );
      })}
      <TouchableOpacity onPress={loadReports} style={styles.refresh}><Text style={styles.refreshText}>تحديث القائمة</Text></TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0912' },
  content: { padding: 20, paddingTop: 42, paddingBottom: 40 },
  back: { alignSelf: 'flex-start', padding: 10 },
  backText: { color: '#F5C451', fontWeight: '800', fontSize: 15 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 12 },
  subtitle: { color: '#AAA1B8', textAlign: 'right', lineHeight: 22, marginTop: 10, marginBottom: 18 },
  empty: { backgroundColor: '#191424', borderRadius: 14, padding: 24, marginTop: 15 },
  emptyText: { color: '#AAA1B8', textAlign: 'center' },
  card: { backgroundColor: '#191424', borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 1, borderColor: '#382B4B' },
  reason: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'right' },
  details: { color: '#DDD5E8', textAlign: 'right', marginTop: 8 },
  meta: { color: '#F5C451', textAlign: 'right', marginTop: 12, fontWeight: '700' },
  date: { color: '#AAA1B8', textAlign: 'right', marginTop: 5, fontSize: 12 },
  cancelButton: { backgroundColor: '#9E293C', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 14 },
  cancelText: { color: '#fff', fontWeight: '900' },
  locked: { color: '#AAA1B8', textAlign: 'center', marginTop: 14, fontSize: 12 },
  disabled: { opacity: 0.55 },
  refresh: { padding: 14, alignItems: 'center', marginTop: 12 },
  refreshText: { color: '#F5C451', fontWeight: '800' },
});
