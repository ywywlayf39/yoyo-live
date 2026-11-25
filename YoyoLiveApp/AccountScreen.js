import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, TextInput, Image, Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { supabase } from './supabase';
import ProfileFrame from './ProfileFrame';

const countries = ['مصر','السعودية','الإمارات','الكويت','قطر','البحرين','عمان','الأردن','العراق','لبنان','المغرب','الجزائر','تونس','ليبيا','السودان','فلسطين','اليمن','سوريا','تركيا','ألمانيا','فرنسا','بريطانيا','أمريكا','كندا','أخرى'];

export default function AccountScreen({ userId, email, onBack, onAvatarChanged, onFrameChanged }) {
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
  const [frames, setFrames] = useState([]);
  const [selectedFrameCode, setSelectedFrameCode] = useState('classic');
  const [vipActive, setVipActive] = useState(false);
  const [ownedFrameCodes, setOwnedFrameCodes] = useState([]);
  const [coinBalance, setCoinBalance] = useState(0);
  const [frameBusy, setFrameBusy] = useState('');

  const loadProfile = async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase.from('profiles')
      .select('display_name,country,gender,birth_date,avatar_url,selected_frame_code')
      .eq('id', userId).maybeSingle();
    if (loadError) setError('تعذر تحميل بيانات الحساب: ' + loadError.message);
    else {
      setProfile(data);
      const [{ data: frameRows }, { data: vipRow }, { data: ownedRows }, { data: walletRow }] = await Promise.all([
        supabase.from('yoyo_profile_frames').select('code,name,tier,coin_cost,vip_only').eq('active', true).order('sort_order'),
        supabase.from('user_vip_subscriptions').select('status,expires_at').eq('user_id', userId).maybeSingle(),
        supabase.from('yoyo_user_profile_frames').select('frame_code').eq('user_id', userId),
        supabase.from('wallets').select('purchased_coins').eq('user_id', userId).maybeSingle(),
      ]);
      setFrames(frameRows || []);
      setOwnedFrameCodes((ownedRows || []).map((row) => row.frame_code));
      setCoinBalance(Number(walletRow?.purchased_coins || 0));
      const hasActiveVip = vipRow?.status === 'active' && !!vipRow.expires_at && new Date(vipRow.expires_at).getTime() > Date.now();
      setVipActive(hasActiveVip);
      const savedFrameCode = data?.selected_frame_code || 'classic';
      const savedFrame = (frameRows || []).find((frame) => frame.code === savedFrameCode);
      setSelectedFrameCode(savedFrame?.vip_only && !hasActiveVip ? 'classic' : savedFrameCode);
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
    const today = new Date();
    let age = today.getFullYear() - year;
    if (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)) age -= 1;
    if (age < 18) { setError('YOYO LIVE متاح لمن بلغوا 18 عامًا فقط.'); return; }
    if (!gender) { setError('اختار النوع من فضلك.'); return; }
    const formattedBirthDate = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    setSaving(true); setError(''); setSuccess('');
    const { data: savedProfile, error: saveError } = await supabase.from('profiles')
      .update({ display_name: name.trim(), country, gender, birth_date: formattedBirthDate, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('display_name,country,gender,birth_date,selected_frame_code')
      .maybeSingle();
    if (saveError) setError('تعذر حفظ التعديلات: ' + saveError.message);
    else if (!savedProfile) setError('لم يتم حفظ التعديلات. تأكد من تسجيل الدخول ثم حاول مرة أخرى.');
    else {
      setProfile(current => ({ ...current, ...savedProfile }));
      setSuccess('تم حفظ بيانات الحساب بنجاح ✓');
    }
    setSaving(false);
  };

  const chooseFrame = async (frame) => {
    const alreadyOwned = ownedFrameCodes.includes(frame.code);
    const hasVip = frame.vip_only && vipActive;
    if (frame.coin_cost > 0 && !alreadyOwned && !hasVip) {
      if (coinBalance < Number(frame.coin_cost)) {
        setError('رصيد العملات غير كافٍ لفتح هذا الإطار. اشحن محفظتك أولاً.');
        return;
      }
      Alert.alert('فتح إطار ' + frame.name, 'سيتم خصم ' + Number(frame.coin_cost).toLocaleString('ar-EG') + ' عملة من محفظتك. هل تريد المتابعة؟', [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'فتح الإطار', onPress: () => unlockFrame(frame.code) },
      ]);
      return;
    }
    if (frame.vip_only && !vipActive && !alreadyOwned) {
      setError('هذا الإطار متاح لأعضاء VIP فقط.');
      return;
    }
    await selectFrame(frame.code);
  };

  const unlockFrame = async (code) => {
    setFrameBusy(code); setError(''); setSuccess('');
    const { data, error: unlockError } = await supabase.rpc('yoyo_unlock_profile_frame', { p_frame_code: code });
    if (unlockError) setError('تعذر فتح الإطار: ' + unlockError.message);
    else {
      setOwnedFrameCodes(current => current.includes(code) ? current : [...current, code]);
      if (data?.balance !== undefined) setCoinBalance(Number(data.balance));
      setSelectedFrameCode(code);
      onFrameChanged?.(code);
      setSuccess('تم فتح الإطار وتفعيله بنجاح ✓');
    }
    setFrameBusy('');
  };

  const selectFrame = async (code) => {
    setFrameBusy(code); setError(''); setSuccess('');
    const { error: selectError } = await supabase.rpc('yoyo_select_profile_frame', { p_frame_code: code });
    if (selectError) setError('تعذر تفعيل الإطار: ' + selectError.message);
    else {
      setSelectedFrameCode(code);
      onFrameChanged?.(code);
      setSuccess('تم تفعيل الإطار بنجاح ✓');
    }
    setFrameBusy('');
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
      // Read the selected local file as binary bytes. fetch(uri).blob() can
      // return text/plain for Android content:// picker URIs on some devices.
      const imageFile = new File(asset.uri);
      const bytes = await imageFile.bytes();
      if (!bytes || bytes.byteLength === 0) throw new Error('الصورة المختارة فارغة أو تعذر قراءتها.');
      const fileBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const contentType = asset.mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType)
        ? asset.mimeType
        : safeExt === 'png' ? 'image/png' : safeExt === 'webp' ? 'image/webp' : 'image/jpeg';
      const { error: uploadError } = await supabase.storage.from('profile-avatars')
        .upload(path, fileBuffer, { contentType, upsert: false });
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
      onAvatarChanged?.(updatedProfile.avatar_url);
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
            <View style={styles.frameSection}>
              <Text style={styles.frameTitle}>إطار صورتك الشخصية</Text>
              <Text style={styles.frameHint}>اختار الإطار، وسيظهر للأعضاء الآخرين بعد الحفظ.</Text>
              <View style={styles.framePreview}>
                <ProfileFrame frameCode={selectedFrameCode} size={104}>
                  {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 42 }}>👤</Text></View>}
                </ProfileFrame>
              </View>
              <Text style={styles.frameBalance}>رصيدك: {coinBalance.toLocaleString('ar-EG')} عملة</Text>
              <View style={styles.frameChoices}>
                <TouchableOpacity onPress={() => selectFrame('classic')} style={[styles.frameOption, selectedFrameCode === 'classic' && styles.frameOptionActive]}>
                  <Text style={styles.frameOptionName}>الإطار الكلاسيكي</Text>
                  <Text style={styles.frameOptionMeta}>مجاني</Text>
                </TouchableOpacity>
                {frames.filter(frame => frame.code !== 'classic').map((frame) => {
                  const owned = ownedFrameCodes.includes(frame.code);
                  const vipUnlocked = frame.vip_only && vipActive;
                  const locked = !owned && !vipUnlocked && (Number(frame.coin_cost || 0) > 0 || frame.vip_only);
                  const label = owned ? 'تم فتحه' : vipUnlocked ? 'متاح مع VIP' : frame.coin_cost > 0 ? Number(frame.coin_cost).toLocaleString('ar-EG') + ' عملة' : frame.vip_only ? 'يتطلب VIP' : 'مجاني';
                  return <TouchableOpacity key={frame.code} disabled={frameBusy === frame.code} onPress={() => chooseFrame(frame)} style={[styles.frameOption, selectedFrameCode === frame.code && styles.frameOptionActive, locked && styles.frameOptionLocked]}>
                    <Text style={styles.frameOptionName}>{frame.name}</Text>
                    <Text style={styles.frameOptionMeta}>{frameBusy === frame.code ? 'جارٍ التنفيذ…' : label}</Text>
                    {selectedFrameCode === frame.code ? <Text style={styles.frameOptionMeta}>مفعّل الآن ✓</Text> : null}
                  </TouchableOpacity>;
                })}
              </View>
            </View>
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
            <TouchableOpacity onPress={() => Linking.openURL('https://ywywlayf39.github.io/yoyo-live/privacy-policy.html')} style={styles.externalDeleteLink}>
              <Text style={styles.externalDeleteText}>سياسة الخصوصية</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL('https://ywywlayf39.github.io/yoyo-live/terms.html')} style={styles.externalDeleteLink}>
              <Text style={styles.externalDeleteText}>شروط الاستخدام</Text>
            </TouchableOpacity>
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
  frameSection: { marginTop: 18, padding: 14, borderRadius: 15, backgroundColor: '#21192E', borderWidth: 1, borderColor: '#59476b' },
  frameTitle: { color: '#F5C451', fontSize: 16, fontWeight: '900', textAlign: 'right' },
  frameHint: { color: '#AAA1B8', fontSize: 12, textAlign: 'right', marginTop: 5 },
  framePreview: { alignItems: 'center', marginVertical: 18 },
  frameChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  frameBalance: { color: '#F5C451', fontSize: 12, textAlign: 'right', marginBottom: 10, fontWeight: '800' },
  frameOption: { minWidth: '46%', padding: 10, borderRadius: 11, borderWidth: 1, borderColor: '#59476b', backgroundColor: '#30243e' },
  frameOptionActive: { borderColor: '#F5C451', backgroundColor: '#49371D' },
  frameOptionLocked: { opacity: 0.48 },
  frameOptionName: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', textAlign: 'right' },
  frameOptionMeta: { color: '#F5C451', fontSize: 10, marginTop: 5, textAlign: 'right' },
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
