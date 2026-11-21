import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, TextInput, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

const countries = ['مصر','السعودية','الإمارات','الكويت','قطر','البحرين','عمان','الأردن','العراق','لبنان','المغرب','الجزائر','تونس','ليبيا','السودان','فلسطين','اليمن','سوريا','تركيا','ألمانيا','فرنسا','بريطانيا','أمريكا','كندا','أخرى'];

export default function AccountScreen({ userId, email, onBack }) {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('مصر');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showCountries, setShowCountries] = useState(false);

  const loadProfile = async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase.from('profiles')
      .select('display_name,country,gender,birth_date,avatar_url')
      .eq('id', userId).maybeSingle();
    if (loadError) setError('تعذر تحميل بيانات الحساب: ' + loadError.message);
    else {
      setProfile(data);
      setName(data?.display_name || '');
      setCountry(data?.country || 'مصر');
      setError('');
    }
    setLoading(false);
  };

  useEffect(() => { loadProfile(); }, [userId]);

  const saveProfile = async () => {
    if (!name.trim()) { setError('اكتب اسمك الأول.'); return; }
    setSaving(true); setError('');
    const { error: saveError } = await supabase.from('profiles')
      .update({ display_name: name.trim(), country, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (saveError) setError('تعذر حفظ التعديلات: ' + saveError.message);
    else {
      setProfile(current => ({ ...current, display_name: name.trim(), country }));
      Alert.alert('تم الحفظ', 'تم تحديث بيانات حسابك بنجاح.');
    }
    setSaving(false);
  };

  const changeAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        setError('حجم الصورة أكبر من 5 ميجابايت. اختار صورة أصغر.');
        return;
      }
      setUploading(true); setError('');
      const ext = (asset.fileName?.split('.').pop() || asset.mimeType?.split('/').pop() || 'jpg').toLowerCase();
      const safeExt = ['jpg','jpeg','png','webp'].includes(ext) ? ext : 'jpg';
      const path = userId + '/' + Date.now() + '.' + safeExt;
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const contentType = asset.mimeType || (safeExt === 'png' ? 'image/png' : safeExt === 'webp' ? 'image/webp' : 'image/jpeg');
      const { error: uploadError } = await supabase.storage.from('profile-avatars')
        .upload(path, blob, { contentType, upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path);
      const { error: updateError } = await supabase.from('profiles')
        .update({ avatar_url: data.publicUrl, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (updateError) throw updateError;
      setProfile(current => ({ ...current, avatar_url: data.publicUrl }));
      Alert.alert('تم تغيير الصورة', 'صورتك الشخصية اتحدثت بنجاح.');
    } catch (e) {
      setError('تعذر تغيير الصورة: ' + (e?.message || 'حاول مرة أخرى'));
    } finally { setUploading(false); }
  };

  const birthDate = profile?.birth_date ? new Date(profile.birth_date + 'T00:00:00').toLocaleDateString('ar-EG') : 'غير مسجل';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.back}><Text style={styles.backText}>رجوع ←</Text></TouchableOpacity>
      <Text style={styles.logo}>YOYO LIVE 💗</Text>
      <Text style={styles.title}>حسابي</Text>
      {loading ? <ActivityIndicator color="#F5C451" size="large" /> : (
        <>
          <View style={styles.card}>
            <TouchableOpacity style={styles.avatarWrap} onPress={changeAvatar} disabled={uploading}>
              {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><Text style={styles.avatarEmoji}>👤</Text></View>}
              <Text style={styles.changePhoto}>{uploading ? 'جارٍ رفع الصورة...' : '📷 تغيير صورة البروفايل'}</Text>
            </TouchableOpacity>
            <Text style={styles.label}>الاسم</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="اكتب اسمك" placeholderTextColor="#8e8798" textAlign="right" />
            <Text style={styles.label}>البريد الإلكتروني</Text><Text style={styles.value}>{email || 'غير متاح'}</Text>
            <Text style={styles.label}>البلد</Text>
            <TouchableOpacity style={styles.input} onPress={() => setShowCountries(!showCountries)}><Text style={styles.value}>{country}　⌄</Text></TouchableOpacity>
            {showCountries && <View style={styles.countryList}>{countries.map(item => <TouchableOpacity key={item} style={styles.countryItem} onPress={() => { setCountry(item); setShowCountries(false); }}><Text style={styles.value}>{item}</Text></TouchableOpacity>)}</View>}
            <Text style={styles.label}>النوع</Text><Text style={styles.value}>{profile?.gender || 'غير مسجل'}</Text>
            <Text style={styles.label}>تاريخ الميلاد</Text><Text style={styles.value}>{birthDate}</Text>
            <Text style={styles.note}>تاريخ الميلاد لا يظهر للأعضاء الآخرين.</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity onPress={saveProfile} style={[styles.button, saving && styles.disabled]} disabled={saving || uploading}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>حفظ التعديلات</Text>}
          </TouchableOpacity>
          <Text style={styles.hint}>تغيير الصورة يتم فور رفعها، وتعديل الاسم والبلد يتم عند الضغط على حفظ التعديلات.</Text>
        </>
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#0B0912', padding: 22, paddingTop: 45 },
  back: { alignSelf: 'flex-start', padding: 10 }, backText: { color: '#F5C451', fontSize: 16, fontWeight: 'bold' },
  logo: { color: '#F5C451', fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginTop: 20 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginVertical: 25 },
  card: { backgroundColor: '#191424', borderRadius: 16, padding: 18 },
  avatarWrap: { alignItems: 'center', marginBottom: 12, padding: 12 },
  avatar: { width: 112, height: 112, borderRadius: 56, borderWidth: 3, borderColor: '#F5C451' },
  avatarPlaceholder: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#30243e', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#F5C451' },
  avatarEmoji: { fontSize: 48 },
  changePhoto: { color: '#F5C451', fontWeight: 'bold', marginTop: 12, fontSize: 15 },
  label: { color: '#AAA1B8', textAlign: 'right', marginTop: 14, fontSize: 13 },
  value: { color: '#fff', textAlign: 'right', fontSize: 16, marginTop: 5 },
  input: { backgroundColor: '#30243e', color: '#fff', borderRadius: 10, padding: 13, marginTop: 7, textAlign: 'right', fontSize: 16 },
  countryList: { backgroundColor: '#30243e', borderRadius: 10, marginTop: 5, maxHeight: 190 },
  countryItem: { padding: 11, borderBottomWidth: 1, borderBottomColor: '#493b58' },
  note: { color: '#AAA1B8', textAlign: 'right', marginTop: 22, fontSize: 12 },
  error: { color: '#ff8585', textAlign: 'center', marginTop: 16 },
  button: { backgroundColor: '#8655F5', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 24 },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  hint: { color: '#AAA1B8', textAlign: 'center', marginTop: 14, fontSize: 12 }
});
