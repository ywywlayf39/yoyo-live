import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from './supabase';
export default function AccountScreen({ userId, email, onBack }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error: loadError } = await supabase.from('profiles').select('display_name,country,gender,birth_date').eq('id', userId).maybeSingle();
      if (!active) return;
      if (loadError) setError('تعذر تحميل بيانات الحساب. حاول مرة أخرى.');
      else setProfile(data);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [userId]);
  const birthDate = profile?.birth_date ? new Date(profile.birth_date + 'T00:00:00').toLocaleDateString('ar-EG') : 'غير مسجل';
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.back}><Text style={styles.backText}>رجوع ←</Text></TouchableOpacity>
      <Text style={styles.logo}>YOYO LIVE 💗</Text><Text style={styles.title}>حسابي</Text>
      {loading ? <ActivityIndicator color="#F5C451" size="large" /> : error ? <Text style={styles.error}>{error}</Text> : (
        <View style={styles.card}>
          <Text style={styles.label}>الاسم</Text><Text style={styles.value}>{profile?.display_name || 'غير مسجل'}</Text>
          <Text style={styles.label}>البريد الإلكتروني</Text><Text style={styles.value}>{email || 'غير متاح'}</Text>
          <Text style={styles.label}>النوع</Text><Text style={styles.value}>{profile?.gender || 'غير مسجل'}</Text>
          <Text style={styles.label}>البلد</Text><Text style={styles.value}>{profile?.country || 'غير مسجل'}</Text>
          <Text style={styles.label}>تاريخ الميلاد</Text><Text style={styles.value}>{birthDate}</Text>
          <Text style={styles.note}>تاريخ الميلاد لا يظهر للأعضاء الآخرين.</Text>
        </View>
      )}
      <TouchableOpacity onPress={onBack} style={styles.button}><Text style={styles.buttonText}>العودة للرئيسية</Text></TouchableOpacity>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#0B0912', padding: 22, paddingTop: 45 },
  back: { alignSelf: 'flex-start', padding: 10 }, backText: { color: '#F5C451', fontSize: 16, fontWeight: 'bold' },
  logo: { color: '#F5C451', fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginTop: 20 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginVertical: 25 },
  card: { backgroundColor: '#191424', borderRadius: 16, padding: 18 },
  label: { color: '#AAA1B8', textAlign: 'right', marginTop: 14, fontSize: 13 },
  value: { color: '#fff', textAlign: 'right', fontSize: 17, marginTop: 5 },
  note: { color: '#AAA1B8', textAlign: 'right', marginTop: 22, fontSize: 12 },
  error: { color: '#ff8585', textAlign: 'center', marginTop: 20 },
  button: { backgroundColor: '#8655F5', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 24 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
