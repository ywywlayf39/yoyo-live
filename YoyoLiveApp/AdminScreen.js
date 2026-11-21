import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    const [summaryResult, reportsResult, membersResult] = await Promise.all([
      supabase.rpc('yoyo_admin_summary'),
      supabase.rpc('yoyo_admin_list_reports', { p_limit: 100 }),
      supabase.from('profiles')
        .select('id, display_name, country, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (summaryResult.error || reportsResult.error || membersResult.error) {
      console.error('YOYO admin dashboard failed:', summaryResult.error || reportsResult.error || membersResult.error);
      setError('تعذر تحميل بعض بيانات الإدارة. تأكد من تحديث تسجيل الدخول ثم حاول مرة أخرى.');
    }
    setSummary(summaryResult.error ? null : (summaryResult.data || {}));
    setReports(reportsResult.error ? [] : (reportsResult.data || []));
    setMembers(membersResult.error ? [] : (membersResult.data || []));
    setLoading(false);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLocaleLowerCase();
    if (!q) return members;
    return members.filter(member =>
      (member.display_name || '').toLocaleLowerCase().includes(q) ||
      (member.country || '').toLocaleLowerCase().includes(q) ||
      member.id.toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

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
      <Text style={styles.subtitle}>إدارة الأعضاء ومتابعة البلاغات ونشاط المنصة</Text>

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
            <Text style={styles.sectionTitle}>👥 إدارة الأعضاء</Text>
            <TouchableOpacity onPress={loadDashboard}><Text style={styles.refresh}>تحديث ↻</Text></TouchableOpacity>
          </View>
          <TextInput
            value={memberSearch}
            onChangeText={setMemberSearch}
            placeholder="ابحث بالاسم أو البلد أو رقم العضو"
            placeholderTextColor="#8F849F"
            style={styles.searchInput}
            autoCapitalize="none"
          />
          <Text style={styles.memberHint}>عرض أحدث {members.length} عضو. لا يتم عرض البريد الإلكتروني أو تاريخ الميلاد في هذه القائمة.</Text>
          {filteredMembers.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>لا يوجد أعضاء مطابقون للبحث.</Text></View>
          ) : filteredMembers.map(member => (
            <View key={member.id} style={styles.memberCard}>
              <Text style={styles.memberName}>{member.display_name || 'عضو بدون اسم'}</Text>
              <Text style={styles.person}>البلد: {member.country || 'غير محدد'}</Text>
              <Text style={styles.date}>تاريخ الانضمام: {member.created_at ? new Date(member.created_at).toLocaleDateString('ar-EG') : 'غير متاح'}</Text>
              <Text style={styles.memberId}>رقم العضو: {member.id}</Text>
            </View>
          ))}
          <Text style={styles.notice}>الإيقاف الإداري الشامل غير مفعّل بعد؛ لن يتم حظر أو تعطيل أي حساب من هذه الشاشة حاليًا.</Text>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🚩 بلاغات الأعضاء</Text>
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
                    <Text style={styles.actionText}>تسجيل اتخاذ إجراء</Text>
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
      <Text style={styles.footer}>صلاحيات عرض بيانات الأعضاء والبلاغات محمية بسياسات قاعدة البيانات المعتمدة على app_metadata.</Text>
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
  searchInput: { backgroundColor: '#191424', borderColor: '#3B304B', borderWidth: 1, borderRadius: 10, color: '#fff', paddingHorizontal: 13, paddingVertical: 12, textAlign: 'right' },
  memberHint: { color: '#8F849F', fontSize: 11, textAlign: 'right', marginVertical: 9 },
  memberCard: { backgroundColor: '#191424', borderRadius: 12, padding: 14, marginBottom: 9, borderWidth: 1, borderColor: '#3B304B' },
  memberName: { color: '#F5C451', fontSize: 16, fontWeight: 'bold', textAlign: 'right', marginBottom: 5 },
  memberId: { color: '#756A83', fontSize: 10, textAlign: 'left', marginTop: 8 },
  notice: { color: '#E9C77A', backgroundColor: '#302719', padding: 12, borderRadius: 9, textAlign: 'right', fontSize: 12, lineHeight: 19, marginTop: 4 },
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
