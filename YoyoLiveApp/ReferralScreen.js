import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
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
  pink: '#F34E9B',
  purple: '#8655F5',
  white: '#FFFFFF',
  muted: '#AAA1B8',
  gold: '#F5C451',
};

export default function ReferralScreen({ userId, onBack }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('yoyo_get_referral_summary');
    if (error) {
      console.error('YOYO LIVE referral summary failed:', error);
      Alert.alert('تعذر تحميل الدعوات', 'تأكد من اتصال الإنترنت وحاول مرة أخرى.');
      setSummary(null);
    } else {
      const row = Array.isArray(data) ? data[0] : data;
      setSummary(row || null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const shareInvite = async () => {
    if (!summary?.referral_code || sharing) return;
    setSharing(true);
    try {
      await Share.share({
        message:
          'انضم إلى عائلة YOYO LIVE 💗\n' +
          'افتح إنشاء حساب جديد واكتب كود دعوتي:\n' +
          summary.referral_code +
          '\nمستنيك تنورنا في البثوث والفعاليات!',
      });
    } catch (error) {
      Alert.alert('تعذر فتح المشاركة', 'يمكنك نسخ كود الدعوة وإرساله لصديقك.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>رجوع ←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>دعوة الأصدقاء 🎉</Text>
          <Text style={styles.subtitle}>كبر عائلة YOYO LIVE مع أصحابك</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>💗</Text>
          <Text style={styles.heroTitle}>كل صاحب جديد يبدأ بكودك</Text>
          <Text style={styles.heroText}>
            ابعت كودك لصاحبك. عند إنشاء حساب جديد، يكتب الكود في خانة دعوة صديق.
          </Text>
        </View>

        <View style={styles.codeCard}>
          <Text style={styles.label}>كود دعوتك الخاص</Text>
          {loading ? (
            <ActivityIndicator color={C.pink} size="large" />
          ) : summary?.referral_code ? (
            <Text selectable style={styles.code}>{summary.referral_code}</Text>
          ) : (
            <Text style={styles.error}>لم نتمكن من تحميل كود الدعوة.</Text>
          )}
          <TouchableOpacity
            onPress={shareInvite}
            disabled={!summary?.referral_code || loading || sharing}
            style={[styles.shareButton, (!summary?.referral_code || loading || sharing) && styles.disabled]}
          >
            <Text style={styles.shareText}>{sharing ? 'جارٍ فتح المشاركة...' : '📲 مشاركة كود الدعوة'}</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>تقدر تضغط مطولًا على الكود لنسخه، أو تشاركه مباشرة.</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{loading ? '—' : summary?.total_invites ?? 0}</Text>
            <Text style={styles.statLabel}>أصدقاء سجلوا بكودك</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{loading ? '—' : summary?.qualified_invites ?? 0}</Text>
            <Text style={styles.statLabel}>دعوات مؤهلة</Text>
          </View>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>إزاي الدعوة بتتحسب؟</Text>
          <Text style={styles.noteText}>
            بنسجل الدعوة بعد ما العضو الجديد يكمل ملفه الشخصي. المكافآت مش مفعلة حاليًا، ومفيش أي تغيير في العملات أو المحفظة أو السحب.
          </Text>
        </View>

        <TouchableOpacity onPress={loadSummary} disabled={loading} style={styles.refreshButton}>
          <Text style={styles.refreshText}>تحديث الإحصائيات ↻</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#49344F',
  },
  backButton: { paddingVertical: 10, paddingRight: 12 },
  backText: { color: C.pink, fontWeight: 'bold', fontSize: 14 },
  headerTitle: { flex: 1, alignItems: 'flex-end' },
  title: { color: C.white, fontSize: 21, fontWeight: 'bold' },
  subtitle: { color: C.muted, marginTop: 4, fontSize: 12 },
  content: { padding: 16, paddingBottom: 30 },
  hero: {
    backgroundColor: C.card2,
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
  },
  heroEmoji: { fontSize: 34 },
  heroTitle: { color: C.white, fontWeight: 'bold', fontSize: 18, marginTop: 8 },
  heroText: { color: C.muted, textAlign: 'center', lineHeight: 23, marginTop: 8 },
  codeCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#7653A8',
    padding: 20,
    alignItems: 'center',
  },
  label: { color: C.muted, fontSize: 14, marginBottom: 12 },
  code: { color: C.gold, fontSize: 30, fontWeight: '900', letterSpacing: 4, marginVertical: 8 },
  error: { color: '#FF8DA8', textAlign: 'center' },
  shareButton: {
    backgroundColor: C.pink,
    borderRadius: 13,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
    marginTop: 14,
  },
  shareText: { color: C.white, fontWeight: 'bold', fontSize: 15 },
  disabled: { opacity: 0.5 },
  hint: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 10, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 15,
    padding: 17,
    alignItems: 'center',
  },
  statNumber: { color: C.gold, fontSize: 26, fontWeight: '900' },
  statLabel: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 7 },
  noteCard: { backgroundColor: C.card2, borderRadius: 15, padding: 16, marginTop: 14 },
  noteTitle: { color: C.white, fontWeight: 'bold', fontSize: 15, textAlign: 'right' },
  noteText: { color: C.muted, textAlign: 'right', lineHeight: 22, marginTop: 8, fontSize: 13 },
  refreshButton: { alignItems: 'center', padding: 15, marginTop: 8 },
  refreshText: { color: C.pink, fontWeight: 'bold' },
});
