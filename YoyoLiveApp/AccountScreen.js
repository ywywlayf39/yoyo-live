import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, TextInput, Image, Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

const countries = ['مصر','السعودية','الإمارات','الكويت','قطر','البحرين','عمان','الأردن','العراق','لبنان','المغرب','الجزائر','تونس','ليبيا','السودان','فلسطين','اليمن','سوريا','تركيا','ألمانيا','فرنسا','بريطانيا','أمريكا','كندا','أخرى'];

export default function AccountScreen({ userId, email, onBack }) {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('مصر');
  const [gender, setGender] = useState('');
  const [birthDateInput, setBirthDateInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
      setGender(data?.gender || '');
      setBirthDateInput(data?.birth_date ? data.birth_date.split('-').reverse().join('/') : '');
      setError('');
    }
    setLoading(false);
  };

  useEffect(() => { loadProfile(); }, [userId]);

  const saveProfile = async () => {
    if (!name.trim()) { setError('اكتب اسمك الأول.'); return; }
    const match = birthDateInput.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) { setError('اكتب تاريخ الميلاد بالشكل يوم/شهر/سنة.'); return; }
    const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
    const parsedDate = new Date(year, month - 1, day);
    if (parsedDate.getFullYear() !== year || parsedDate.getMonth() !== month - 1 || parsedDate.getDate() !== day || parsedDate > new Date()) {
      setError('تاريخ الميلاد غير صحيح.'); return;
    }
    if (!gender) { setError('اختار النوع من فضلك.'); return; }
    const formattedBirthDate = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    setSaving(true); setError(''); setSuccess('');
    const { data: savedProfile, error: saveError } = await supabase.from('profiles')
      .update({ display_name: name.trim(), country, gender, birth_date: formattedBirthDate, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('display_name,country,gender,birth_date')
      .maybeSingle();
    if (saveError) setError('تعذر حفظ التعديلات: ' + saveError.message);
    else if (!savedProfile) setError('لم يتم حفظ التعديلات. تأكد من تسجيل الدخول ثم حاول مرة أخرى.');
    else {
      setProfile(current => ({ ...current, ...savedProfile }));
      setSuccess('تم الحفظ بنجاح ✓');
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
      setUploading(true); setError(''); setSuccess('');
      const ext = (asset.fileName?.split('.').pop() || asset.mimeType?.split('/').pop() || 'jpg').toLowerCase();
      const safeExt = ['jpg','jpeg','png','webp'].includes(ext) ? ext : 'jpg';
      const path = userId + '/' + Date.now() + '.' + safeExt;
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('تعذر قراءة الصورة من الهاتف.');
      const blob = await response.blob();
      const contentType = safeExt === 'png' ? 'image/png' : safeExt === 'webp' ? 'image/webp' : 'image/jpeg';
      const { error: uploadError } = await supabase.storage.from('profile-avatars')
        .upload(path, blob, { contentType, upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path);
      const { data: updatedProfile, error: updateError } = await supabase.from('profiles')
        .update({ avatar_url: data.publicUrl, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select('avatar_url')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updatedProfile?.avatar_url) throw new Error('تم رفع الصورة لكن لم يتم ربطها بحسابك. حاول مرة أخرى.');
      setProfile(current => ({ ...current, avatar_url: updatedProfile.avatar_url }));
      setSuccess('تم تحديث صورة البروفايل بنجاح ✓');
    } catch (e) {
      setError('تعذر تغيير الصورة: ' + (e?.message || 'حاول مرة أخرى'));
    } finally { setUploading(false); }
  };

  const deleteAccount = () => {
    Alert.alert(
      'حذف الحساب نهائيًا',
      'سيتم حذف ملفك الشخصي وصورك ورسائلك وبيانات المحفظة والاتصالات المرتبطة بالحساب. لا يمكن التراجع عن هذا الإجراء.',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف حسابي نهائيًا',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            setError('');
            const { data, error: deleteError } = await supabase.functions.invoke('delete-account', {
              body: { confirm: true },
            });
            if (deleteError || !data?.deleted) {
              setError(data?.error || deleteError?.message || 'تعذر حذف الحساب الآن. حاول مرة أخرى.');
              setDeleting(false);
              return;
            }
            await supabase.auth.signOut({ scope: 'local' });
            Alert.alert('تم حذف الحساب', 'تم حذف الحساب والبيانات المرتبطة به.');
            onBack?.();
          },
        },
      ],
      { cancelable: true },
    );
  };

  const openDeletionPage = async () => {
    try {
      await Linking.openURL('https://ywywlayf39.github.io/yoyo-live/delete-account.html');
    } catch {
      setError('تعذر فتح صفحة حذف الحساب. حاول مرة أخرى.');
    }
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
            <Text style={styles.label}>النوع</Text>
            <View style={styles.genderRow}>{['ذكر','أنثى'].map(item => <TouchableOpacity key={item} onPress={() => setGender(item)} style={[styles.genderOption, gender === item && styles.genderSelected]}><Text style={[styles.genderText, gender === item && styles.genderTextSelected]}>{item}</Text></TouchableOpacity>)}</View>
            <Text style={styles.label}>تاريخ الميلاد</Text>
            <TextInput style={styles.input} value={birthDateInput} onChangeText={value => { const digits = value.replace(/\D/g, '').slice(0, 8); setBirthDateInput(digits.length <= 2 ? digits : digits.length <= 4 ? digits.slice(0,2) + '/' + digits.slice(2) : digits.slice(0,2) + '/' + digits.slice(2,4) + '/' + digits.slice(4)); }} placeholder="يوم/شهر/سنة مثال 15/08/2000" placeholderTextColor="#8e8798" keyboardType="numeric" textAlign="right" />
            <Text style={styles.note}>تاريخ الميلاد لا يظهر للأعضاء الآخرين.</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}
          <TouchableOpacity onPress={saveProfile} style={[styles.button, saving && styles.disabled]} disabled={saving || uploading}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>حفظ التعديلات</Text>}
          </TouchableOpacity>
          <Text style={styles.hint}>تغيير الصورة يتم فور رفعها، وتعديل الاسم والبلد والنوع وتاريخ الميلاد يتم عند الضغط على حفظ التعديلات.</Text>
          <View style={styles.deleteSection}>
            <Text style={styles.deleteTitle}>إدارة الحساب</Text>
            <TouchableOpacity onPress={openDeletionPage} style={styles.externalDeleteLink}>
              <Text style={styles.externalDeleteText}>طلب حذف الحساب من خارج التطبيق</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={deleteAccount}
              style={[styles.deleteButton, deleting && styles.disabled]}
              disabled={deleting || saving || uploading}
            >
              {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteButtonText}>حذف الحساب نهائيًا</Text>}
            </TouchableOpacity>
            <Text style={styles.deleteHint}>حذف الحساب نهائي ولا يمكن استرجاعه.</Text>
          </View>
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
  genderRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  genderOption: { flex: 1, borderWidth: 1, borderColor: '#59476b', borderRadius: 10, padding: 12, alignItems: 'center', backgroundColor: '#30243e' },
  genderSelected: { backgroundColor: '#8655F5', borderColor: '#F5C451' },
  genderText: { color: '#ddd', fontWeight: '600' },
  genderTextSelected: { color: '#fff' },
  input: { backgroundColor: '#30243e', color: '#fff', borderRadius: 10, padding: 13, marginTop: 7, textAlign: 'right', fontSize: 16 },
  countryList: { backgroundColor: '#30243e', borderRadius: 10, marginTop: 5, maxHeight: 190 },
  countryItem: { padding: 11, borderBottomWidth: 1, borderBottomColor: '#493b58' },
  note: { color: '#AAA1B8', textAlign: 'right', marginTop: 22, fontSize: 12 },
  error: { color: '#ff8585', textAlign: 'center', marginTop: 16 },
  success: { color: '#65D69A', textAlign: 'center', marginTop: 16, fontSize: 16, fontWeight: 'bold' },
  button: { backgroundColor: '#8655F5', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 24 },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  hint: { color: '#AAA1B8', textAlign: 'center', marginTop: 14, fontSize: 12 },
  deleteSection: { marginTop: 28, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#63333D', backgroundColor: '#191424' },
  deleteTitle: { color: '#fff', textAlign: 'right', fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  externalDeleteLink: { paddingVertical: 10 },
  externalDeleteText: { color: '#F5C451', textAlign: 'center', textDecorationLine: 'underline' },
  deleteButton: { backgroundColor: '#9E293C', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  deleteButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  deleteHint: { color: '#AAA1B8', textAlign: 'center', fontSize: 11, marginTop: 10 }
});
