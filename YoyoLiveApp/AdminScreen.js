import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';

const statusLabels = {
  pending: 'جديد',
  reviewing: 'قيد المراجعة',
  actioned: 'تم اتخاذ إجراء',
  dismissed: 'مرفوض',
};
const reasonLabels = {
  harassment: 'تحرش أو إساءة',
  hate: 'خطاب كراهية',
  sexual_content: 'محتوى جنسي',
  violence: 'عنف',
  spam: 'رسائل مزعجة أو احتيال',
  impersonation: 'انتحال شخصية',
  underage: 'اشتباه قاصر',
  other: 'سبب آخر',
};

export default function AdminScreen({ onBack }) {
  const [summary, setSummary] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    const [summaryResult, reportsResult] = await Promise.all([
      supabase.rpc('yoyo_admin_summary'),
      supabase.rpc('yoyo_admin_list_reports', { p_limit: 100 }),
    ]);
    if (summaryResult.error || reportsResult.error) {
      console.error('YOYO admin dashboard failed:', summaryResult.error || reportsResult.error);
      setError('تعذر تحميل لوحة الإدارة. تأكد من تحديث تسجيل الدخول ثم حاول مرة أخرى.');
      setSummary(null);
      setReports([]);
    } else {
      setSummary(summaryResult.data || {});
      setReports(reportsResult.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const updateStatus = async (report, status) => {
    setBusyId(report.id);
    const { data, error: updateError } = await supabase.rpc('yoyo_admin_update_report', {
      p_report_id: report.id,
      p_status: status,
    });
    if (updateError || data !== true) {
      Alert.alert('تعذر تحديث البلاغ', updateError?.message || 'لم يتم العثور على البلاغ.');
    } else {
      await loadDashboard();
    }
    setBusyId(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.back}><Text style={styles.backText}>رجوع ←</Text></TouchableOpacity>
      <Text style={styles.logo}>YOYO LIVE 💗</Text>
      <Text style={styles.title}>لوحة الإدارة</Text>
      <Text style={styles.subtitle}>إدارة البلاغات ومتابعة نشاط المنصة</Text>

      {loading ? <ActivityIndicator color="#F5C451" size="large" style={{ marginTop: 30 }} /> : (
        <>
          {!!error && <Text style={styles.error}>{error}</Text>}
          {summary && (
            <View style={styles.stats}>
              {[
                ['👥', 'إجمالي الأعضاء', summary.members_total],
                ['🔴', 'بث مباشر الآن', summary.live_now],
                ['🚩', 'بلاغات جديدة', summary.reports_pending],
                ['🎁', 'الهدايا المرسلة', summary.gifts_sent],
              ].map(([emoji, label, value]) => (
                <View key={label} style={styles.statCard}>
                  <Text style={styles.statEmoji}>{emoji}</Text>
                  <Text style={styles.statValue}>{Number(value || 0).toLocaleString('en-US')}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>بلاغات الأعضاء</Text>
            <TouchableOpacity onPress={loadDashboard}><Text style={styles.refresh}>تحديث ↻</Text></TouchableOpacity>
          </View>

          {reports.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>لا توجد بلاغات مسجلة حاليًا.</Text></View>
          ) : reports.map(report => (
            <View key={report.id} style={styles.reportCard}>
              <View style={styles.reportTop}>
                <Text style={styles.status}>{statusLabels[report.status] || report.status}</Text>
                <Text style={styles.reason}>{reasonLabels[report.reason] || report.reason}</Text>
              </View>
              <Text style={styles.person}>المبلّغ: {report.reporter_name}</Text>
              <Text style={styles.person}>العضو المُبلّغ عنه: {report.reported_name}</Text>
              {!!report.details && <Text style={styles.details}>{report.details}</Text>}
              <Text style={styles.date}>{new Date(report.created_at).toLocaleString('ar-EG')}</Text>
              <View style={styles.actions}>
                {report.status !== 'reviewing' && report.status !== 'actioned' && report.status !== 'dismissed' && (
                  <TouchableOpacity disabled={!!busyId} style={styles.reviewButton} onPress={() => updateStatus(report, 'reviewing')}>
                    <Text style={styles.actionText}>قيد المراجعة</Text>
                  </TouchableOpacity>
                )}
                {report.status !== 'actioned' && (
                  <TouchableOpacity disabled={!!busyId} style={styles.doneButton} onPress={() => updateStatus(report, 'actioned')}>
                    <Text style={styles.actionText}>اتخاذ إجراء</Text>
                  </TouchableOpacity>
                )}
                {report.status !== 'dismissed' && (
                  <TouchableOpacity disabled={!!busyId} style={styles.dismissButton} onPress={() => updateStatus(report, 'dismissed')}>
                    <Text style={styles.actionText}>رفض البلاغ</Text>
                  </TouchableOpacity>
                )}
              </View>
              {busyId === report.id && <ActivityIndicator color="#F5C451" style={{ marginTop: 10 }} />}
            </View>
          ))}
        </>
      )}
      <Text style={styles.footer}>صلاحيات الإدارة محمية من قاعدة البيانات، وليست مجرد زر ظاهر في التطبيق.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#0B0912', padding: 20, paddingTop: 42 },
  back: { alignSelf: 'flex-start', padding: 9 },
  backText: { color: '#F5C451', fontSize: 16, fontWeight: 'bold' },
  logo: { color: '#F5C451', fontSize: 25, fontWeight: 'bold', textAlign: 'center', marginTop: 12 },
  title: { color: '#fff', fontSize: 25, fontWeight: 'bold', textAlign: 'center', marginTop: 22 },
  subtitle: { color: '#AAA1B8', textAlign: 'center', marginTop: 8, marginBottom: 22 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48%', flexGrow: 1, backgroundColor: '#191424', borderRadius: 13, padding: 14, alignItems: 'center' },
  statEmoji: { fontSize: 23 },
  statValue: { color: '#F5C451', fontSize: 23, fontWeight: 'bold', marginTop: 5 },
  statLabel: { color: '#DDD6E7', fontSize: 12, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 12 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  refresh: { color: '#F5C451', fontWeight: 'bold' },
  reportCard: { backgroundColor: '#191424', borderRadius: 14, padding: 15, marginBottom: 12, borderWidth: 1, borderColor: '#3B304B' },
  reportTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 },
  reason: { color: '#F5C451', fontWeight: 'bold', flex: 1, textAlign: 'right' },
  status: { color: '#C8B9DC', fontSize: 12 },
  person: { color: '#fff', textAlign: 'right', marginTop: 5 },
  details: { color: '#DDD6E7', textAlign: 'right', marginTop: 10, lineHeight: 21 },
  date: { color: '#8F849F', textAlign: 'right', fontSize: 11, marginTop: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 },
  reviewButton: { backgroundColor: '#5B477B', padding: 10, borderRadius: 9 },
  doneButton: { backgroundColor: '#276B4A', padding: 10, borderRadius: 9 },
  dismissButton: { backgroundColor: '#733347', padding: 10, borderRadius: 9 },
  actionText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  empty: { backgroundColor: '#191424', padding: 20, borderRadius: 12 },
  emptyText: { color: '#AAA1B8', textAlign: 'center' },
  error: { color: '#FF8585', textAlign: 'center', marginVertical: 12 },
  footer: { color: '#8F849F', textAlign: 'center', fontSize: 11, marginTop: 24, lineHeight: 18 },
});
