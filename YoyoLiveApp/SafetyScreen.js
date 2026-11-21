import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from './supabase';

const COLORS = {
  bg: '#0B0912',
  card: '#191424',
  card2: '#241B35',
  purple: '#8655F5',
  pink: '#F34E9B',
  white: '#FFFFFF',
  muted: '#AAA1B8',
  gold: '#F5C451',
  danger: '#F16B78',
};

const REASONS = [
  { value: 'harassment', label: 'مضايقة أو تنمر' },
  { value: 'hate', label: 'كراهية أو إساءة' },
  { value: 'sexual_content', label: 'محتوى جنسي غير مناسب' },
  { value: 'violence', label: 'عنف أو تهديد' },
  { value: 'spam', label: 'رسائل مزعجة أو احتيال' },
  { value: 'impersonation', label: 'انتحال شخصية' },
  { value: 'underage', label: 'اشتباه أن المستخدم أقل من 18 سنة' },
  { value: 'other', label: 'سبب آخر' },
];

export default function SafetyScreen({ userId, onBack }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('harassment');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadBlocked = async () => {
    const { data, error: loadError } = await supabase.rpc('get_my_blocked_users');
    if (loadError) {
      setError('تعذر تحميل قائمة المحظورين: ' + loadError.message);
      return;
    }
    setBlocked(data || []);
  };

  useEffect(() => {
    loadBlocked();
  }, []);

  const searchUsers = async () => {
    setError('');
    setMessage('');
    setSelected(null);
    if (query.trim().length < 2) {
      setError('اكتب حرفين على الأقل للبحث عن الحساب.');
      return;
    }
    setSearching(true);
    try {
      const { data, error: searchError } = await supabase.rpc('search_safety_targets', {
        p_query: query.trim(),
      });
      if (searchError) throw searchError;
      setResults(data || []);
      if (!data?.length) setMessage('لم نعثر على حساب بهذا الاسم. جرّب اسمًا آخر.');
    } catch (e) {
      setError('تعذر البحث عن الحسابات: ' + (e?.message || 'حاول مرة أخرى'));
    } finally {
      setSearching(false);
    }
  };

  const blockUser = async (target) => {
    if (!target?.user_id || target.user_id === userId) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { error: blockError } = await supabase.from('user_blocks').insert({
        blocker_id: userId,
        blocked_id: target.user_id,
      });
      if (blockError && blockError.code !== '23505') throw blockError;
      setMessage('تم حظر الحساب. لن يظهر في نتائج البحث داخل أدوات الأمان.');
      setResults((current) => current.filter((item) => item.user_id !== target.user_id));
      setSelected(null);
      await loadBlocked();
    } catch (e) {
      setError('تعذر حظر الحساب: ' + (e?.message || 'حاول مرة أخرى'));
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async () => {
    if (!selected?.user_id || selected.user_id === userId) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { error: reportError } = await supabase.from('user_reports').insert({
        reporter_id: userId,
        reported_user_id: selected.user_id,
        reason,
        details: details.trim() || null,
      });
      if (reportError) throw reportError;
      setMessage('وصل بلاغك وسنحتفظ به للمراجعة. شكرًا لمساعدتنا في حماية المجتمع.');
      setSelected(null);
      setDetails('');
    } catch (e) {
      setError('تعذر إرسال البلاغ: ' + (e?.message || 'حاول مرة أخرى'));
    } finally {
      setBusy(false);
    }
  };

  const unblockUser = async (targetId) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { error: unblockError } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', userId)
        .eq('blocked_id', targetId);
      if (unblockError) throw unblockError;
      await loadBlocked();
      setMessage('تم إلغاء الحظر.');
    } catch (e) {
      setError('تعذر إلغاء الحظر: ' + (e?.message || 'حاول مرة أخرى'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>رجوع ←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>الأمان والحماية 🛡️</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>ساعدنا نحافظ على مجتمع محترم وآمن. ابحث عن الحساب الذي تريد الإبلاغ عنه أو حظره.</Text>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>البحث عن حساب</Text>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="اكتب اسم العضو..."
            placeholderTextColor={COLORS.muted}
            textAlign="right"
            returnKeyType="search"
            onSubmitEditing={searchUsers}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={searchUsers} disabled={searching || busy}>
            {searching ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>بحث عن الحساب</Text>}
          </TouchableOpacity>

          {results.map((item) => (
            <TouchableOpacity
              key={item.user_id}
              style={[styles.userRow, selected?.user_id === item.user_id && styles.selectedRow]}
              onPress={() => setSelected(item)}
            >
              <Text style={styles.userName}>{item.display_name || 'عضو بدون اسم'}</Text>
              <Text style={styles.selectText}>{selected?.user_id === item.user_id ? 'تم الاختيار ✓' : 'اختيار'}</Text>
            </TouchableOpacity>
          ))}

          {selected ? (
            <View style={styles.reportBox}>
              <Text style={styles.sectionTitle}>إجراء بخصوص: {selected.display_name || 'الحساب المحدد'}</Text>
              <Text style={styles.label}>سبب البلاغ</Text>
              {REASONS.map((item) => (
                <TouchableOpacity key={item.value} style={styles.reasonRow} onPress={() => setReason(item.value)}>
                  <Text style={styles.reasonText}>{item.label}</Text>
                  <Text style={styles.radio}>{reason === item.value ? '🔘' : '⚪'}</Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.label}>تفاصيل إضافية (اختياري)</Text>
              <TextInput
                style={[styles.input, styles.details]}
                value={details}
                onChangeText={setDetails}
                placeholder="اكتب تفاصيل تساعد فريق المراجعة..."
                placeholderTextColor={COLORS.muted}
                textAlign="right"
                multiline
                maxLength={1000}
              />
              <TouchableOpacity style={styles.primaryButton} onPress={submitReport} disabled={busy}>
                <Text style={styles.buttonText}>{busy ? 'جارٍ الإرسال...' : 'إرسال البلاغ'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dangerButton} onPress={() => blockUser(selected)} disabled={busy}>
                <Text style={styles.buttonText}>حظر هذا الحساب</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>الحسابات المحظورة ({blocked.length})</Text>
          {blocked.length ? blocked.map((item) => (
            <View key={item.user_id} style={styles.userRow}>
              <View style={styles.blockedInfo}>
                <Text style={styles.userName}>{item.display_name || 'عضو'}</Text>
                <Text style={styles.muted}>محظور من حسابك</Text>
              </View>
              <TouchableOpacity style={styles.unblockButton} onPress={() => unblockUser(item.user_id)} disabled={busy}>
                <Text style={styles.unblockText}>إلغاء الحظر</Text>
              </TouchableOpacity>
            </View>
          )) : <Text style={styles.muted}>لا توجد حسابات محظورة حاليًا.</Text>}
        </View>

        <Text style={styles.footer}>البلاغ لا يعني إيقاف الحساب تلقائيًا؛ تتم مراجعته قبل اتخاذ إجراء.</Text>
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 18, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { paddingVertical: 8, paddingHorizontal: 10 },
  backText: { color: COLORS.gold, fontSize: 14, fontWeight: '700' },
  title: { color: COLORS.white, fontSize: 20, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 36 },
  intro: { color: COLORS.muted, textAlign: 'right', lineHeight: 23, marginBottom: 16 },
  panel: { backgroundColor: COLORS.card, borderRadius: 18, padding: 16, marginBottom: 16 },
  sectionTitle: { color: COLORS.white, textAlign: 'right', fontSize: 16, fontWeight: '800', marginBottom: 12 },
  input: { backgroundColor: COLORS.card2, borderWidth: 1, borderColor: '#3B304D', borderRadius: 12, padding: 13, color: COLORS.white, marginBottom: 10 },
  details: { minHeight: 90, textAlignVertical: 'top' },
  primaryButton: { backgroundColor: COLORS.purple, padding: 13, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  dangerButton: { backgroundColor: '#8C2639', padding: 13, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  buttonText: { color: COLORS.white, fontWeight: '800' },
  userRow: { backgroundColor: COLORS.card2, borderRadius: 12, padding: 12, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectedRow: { borderWidth: 1, borderColor: COLORS.gold },
  userName: { color: COLORS.white, fontSize: 15, fontWeight: '700', textAlign: 'right' },
  selectText: { color: COLORS.gold, fontWeight: '700' },
  reportBox: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#3B304D' },
  label: { color: COLORS.muted, textAlign: 'right', marginTop: 10, marginBottom: 6 },
  reasonRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#30263E' },
  reasonText: { color: COLORS.white, textAlign: 'right', flex: 1 },
  radio: { marginLeft: 12 },
  blockedInfo: { flex: 1 },
  muted: { color: COLORS.muted, textAlign: 'right', marginTop: 4 },
  unblockButton: { padding: 9, borderRadius: 10, borderWidth: 1, borderColor: COLORS.gold },
  unblockText: { color: COLORS.gold, fontWeight: '700' },
  footer: { color: COLORS.muted, fontSize: 12, textAlign: 'center', lineHeight: 19, marginTop: 2 },
  success: { color: '#7EE0A0', textAlign: 'center', marginTop: 14, lineHeight: 22 },
  error: { color: COLORS.danger, textAlign: 'right', marginTop: 12, lineHeight: 22 },
});
