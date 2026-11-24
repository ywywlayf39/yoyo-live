import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';

export default function AuthScreen({ onLogin, recoveryMode = false, onPasswordUpdated }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackType, setFeedbackType] = useState('error');
  const [forgotMode, setForgotMode] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  function showFeedback(message, type = 'error') {
    setFeedback(message);
    setFeedbackType(type);
  }

  async function submit() {
    setFeedback('');

    if (recoveryMode) {
      if (password.length < 6) {
        showFeedback('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.');
        return;
      }
      if (password !== confirmPassword) {
        showFeedback('كلمتا المرور غير متطابقتين. اكتب كلمة المرور نفسها في الخانتين.');
        return;
      }
      setLoading(true);
      try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setPassword('');
        setConfirmPassword('');
        showFeedback('تم تغيير كلمة المرور بنجاح. يمكنك الآن استخدام كلمة المرور الجديدة.', 'success');
        onPasswordUpdated?.();
      } catch (error) {
        showFeedback(error?.message || 'تعذر تغيير كلمة المرور. افتح رابط الاستعادة مرة أخرى.');
      } finally {
        setLoading(false);
      }
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!isLogin && !acceptedTerms) {
      showFeedback('يجب الموافقة على شروط الاستخدام وسياسة الخصوصية قبل إنشاء الحساب.');
      return;
    }
    if (forgotMode) {
      if (!cleanEmail) {
        showFeedback('اكتب البريد الإلكتروني أولاً.');
        return;
      }
      setLoading(true);
      try {
        // Call the Supabase Auth recovery REST endpoint directly. This avoids
        // SDK method mismatches in previously published React Native bundles.
        const recoveryUrl = `${supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent('yoyolive://auth/callback?flow=recovery')}`;
        const response = await fetch(recoveryUrl, {
          method: 'POST',
          headers: {
            apikey: supabaseAnonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: cleanEmail }),
        });
        const responseText = await response.text();
        let responseBody = {};
        try { responseBody = responseText ? JSON.parse(responseText) : {}; } catch {}
        if (!response.ok) {
          throw new Error(responseBody.msg || responseBody.message || responseBody.error_description || `تعذر إرسال رابط الاستعادة (HTTP ${response.status}).`);
        }

        showFeedback('لو البريد مسجل عندنا، هتوصلك رسالة فيها رابط آمن لإعادة تعيين كلمة المرور. راجع الوارد والرسائل غير المرغوب فيها.', 'success');
      } catch (error) {
        console.error('YOYO LIVE password recovery request failed:', error?.stack || error);
        const raw = String(error?.message || error || '');
        showFeedback(/rate limit|too many requests|over_email_send_rate_limit|over_request_rate_limit/i.test(raw)
          ? 'طلبت روابط كثيرة في وقت قصير. انتظر قليلاً ثم حاول مرة أخرى.'
          : raw || 'تعذر إرسال رابط الاستعادة. حاول مرة أخرى.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!cleanEmail || !password) {
      showFeedback('اكتب البريد الإلكتروني وكلمة المرور أولاً.');
      return;
    }

    if (password.length < 6) {
      showFeedback('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
      return;
    }

    setLoading(true);
    try {
      const result = isLogin
        ? await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          })
        : await supabase.auth.signUp({
            email: cleanEmail,
            password,
          });

      if (result.error) throw result.error;

      if (!isLogin && !result.data.session) {
        showFeedback(
          'تم إرسال طلب إنشاء الحساب. افتح بريدك الإلكتروني واضغط رابط التأكيد، ثم ارجع وسجّل الدخول.',
          'success'
        );
      } else if (result.data.session) {
        onLogin?.(result.data.session);
      } else {
        showFeedback('لم يكتمل تسجيل الدخول. حاول مرة أخرى.');
      }
    } catch (error) {
      const rawMessage = String(error?.message || 'حدث خطأ غير معروف.');
      let message = rawMessage;

      if (/already registered|user already exists/i.test(rawMessage)) {
        message = 'هذا البريد مسجل بالفعل. ارجع إلى تسجيل الدخول أو استخدم استعادة كلمة المرور.';
      } else if (/invalid login credentials/i.test(rawMessage)) {
        message = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
      } else if (/email not confirmed/i.test(rawMessage)) {
        message = 'أكد بريدك الإلكتروني من الرسالة التي وصلتك، ثم حاول تسجيل الدخول.';
      } else if (/password.*(6|short|characters)/i.test(rawMessage)) {
        message = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.';
      } else if (/rate limit|too many requests/i.test(rawMessage)) {
        message = 'محاولات كثيرة في وقت قصير. انتظر قليلاً ثم حاول مرة أخرى.';
      } else if (/network|fetch failed|failed to fetch/i.test(rawMessage)) {
        message = 'تعذر الاتصال بالإنترنت أو بخدمة التسجيل. تأكد من الاتصال وحاول مرة أخرى.';
      }

      showFeedback(message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setIsLogin(!isLogin);
    setForgotMode(false);
    setFeedback('');
    setPassword('');
    setAcceptedTerms(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>YOYO <Text style={styles.pink}>LIVE</Text></Text>
      <Text style={styles.subtitle}>عالمك .. لحظتك .. جمهورك</Text>

      <Text style={styles.title}>
        {recoveryMode ? 'تعيين كلمة مرور جديدة 🔐' : forgotMode ? 'استعادة كلمة المرور' : isLogin ? 'أهلاً بعودتك 💗' : 'انضم إلى YOYO LIVE 💗'}
      </Text>

      {!recoveryMode && <TextInput
        style={styles.input}
        placeholder="البريد الإلكتروني"
        placeholderTextColor="#AAA1B8"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={(value) => { setEmail(value); setFeedback(''); }}
        editable={!loading}
      />}

      {(recoveryMode || !forgotMode) && <TextInput
        style={styles.input}
        placeholder={recoveryMode ? "اكتب كلمة المرور الجديدة (6 أحرف على الأقل)" : "كلمة المرور"}
        placeholderTextColor="#C7BED3"
        secureTextEntry
        autoFocus={recoveryMode}
        showSoftInputOnFocus={true}
        textContentType="newPassword"
        autoComplete="new-password"
        autoCapitalize="none"
        importantForAutofill="yes"
        value={password}
        onChangeText={(value) => { setPassword(value); setFeedback(''); }}
        editable={!loading}
      />}

      {recoveryMode && <TextInput
        style={styles.input}
        placeholder="أعد كتابة كلمة المرور الجديدة"
        placeholderTextColor="#C7BED3"
        secureTextEntry
        showSoftInputOnFocus={true}
        textContentType="newPassword"
        autoComplete="new-password"
        autoCapitalize="none"
        importantForAutofill="yes"
        value={confirmPassword}
        onChangeText={(value) => { setConfirmPassword(value); setFeedback(''); }}
        editable={!loading}
      />}

      {!recoveryMode && !isLogin && !forgotMode && (
        <View style={styles.termsRow}>
          <TouchableOpacity onPress={() => setAcceptedTerms(!acceptedTerms)} disabled={loading} accessibilityRole="checkbox" accessibilityState={{ checked: acceptedTerms }}>
            <Text style={styles.termsCheck}>{acceptedTerms ? '☑' : '☐'}</Text>
          </TouchableOpacity>
          <Text style={styles.termsText}>
            أوافق على{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL('https://ywywlayf39.github.io/yoyo-live/terms.html')}>شروط الاستخدام</Text>
            {' '}و{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL('https://ywywlayf39.github.io/yoyo-live/privacy-policy.html')}>سياسة الخصوصية</Text>
            {' '}وأؤكد أن عمري 18 عامًا أو أكثر.
          </Text>
        </View>
      )}

      {!!feedback && (
        <View style={[styles.feedback, feedbackType === 'success' ? styles.successBox : styles.errorBox]}>
          <Text style={styles.feedbackText}>{feedback}</Text>
        </View>
      )}

      <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={submit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>
            {recoveryMode ? 'حفظ كلمة المرور الجديدة' : forgotMode ? 'إرسال رابط الاستعادة' : isLogin ? 'تسجيل الدخول' : 'إنشاء حساب'}
          </Text>
        )}
      </TouchableOpacity>

      {!recoveryMode && isLogin && !forgotMode && (
        <TouchableOpacity onPress={() => { setForgotMode(true); setFeedback(''); setPassword(''); }} disabled={loading}>
          <Text style={styles.switchText}>نسيت كلمة المرور؟</Text>
        </TouchableOpacity>
      )}

      {!recoveryMode && (
        <TouchableOpacity onPress={() => { if (forgotMode) { setForgotMode(false); setFeedback(''); } else { switchMode(); } }} disabled={loading}>
          <Text style={styles.switchText}>
            {forgotMode ? 'العودة إلى تسجيل الدخول' : isLogin ? 'ليس لديك حساب؟ إنشاء حساب جديد' : 'لديك حساب بالفعل؟ تسجيل الدخول'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0912',
    justifyContent: 'center',
    padding: 25,
  },
  logo: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  pink: { color: '#F34E9B' },
  subtitle: {
    color: '#AAA1B8',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 45,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 25,
  },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  termsCheck: { color: '#F5C451', fontSize: 24, paddingHorizontal: 2 },
  termsText: { color: '#DDD6E7', flex: 1, textAlign: 'right', lineHeight: 22, fontSize: 13 },
  termsLink: { color: '#F5C451', textDecorationLine: 'underline', fontWeight: 'bold' },
  input: {
    backgroundColor: '#211A2D',
    color: '#FFFFFF',
    borderColor: '#7653A8',
    borderWidth: 1,
    height: 58,
    minHeight: 58,
    borderRadius: 13,
    padding: 16,
    marginBottom: 15,
    textAlign: 'right',
  },
  feedback: {
    borderRadius: 12,
    padding: 13,
    marginBottom: 12,
    borderWidth: 1,
  },
  errorBox: {
    backgroundColor: '#351820',
    borderColor: '#B94B68',
  },
  successBox: {
    backgroundColor: '#173126',
    borderColor: '#3C9B6A',
  },
  feedbackText: {
    color: '#FFFFFF',
    textAlign: 'right',
    lineHeight: 23,
    fontSize: 14,
  },
  button: {
    backgroundColor: '#8655F5',
    padding: 16,
    borderRadius: 13,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 54,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  switchText: {
    color: '#F34E9B',
    textAlign: 'center',
    marginTop: 25,
  },
});
