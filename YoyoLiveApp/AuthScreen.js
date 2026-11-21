import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { supabase } from './supabase';

export default function AuthScreen({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      Alert.alert('تنبيه', 'اكتب البريد الإلكتروني وكلمة المرور');
      return;
    }

    if (password.length < 6) {
      Alert.alert('تنبيه', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    setLoading(true);
    try {
      const result = isLogin
        ? await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          })
        : await supabase.auth.signUp({
            email: email.trim(),
            password,
          });

      if (result.error) throw result.error;

      if (!isLogin && !result.data.session) {
        Alert.alert(
          'تم إنشاء الحساب',
          'راجع بريدك الإلكتروني واضغط رابط التأكيد، ثم سجّل الدخول.'
        );
      } else if (result.data.session) {
        onLogin?.(result.data.session);
      }
    } catch (error) {
      Alert.alert('تعذر إتمام العملية', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>YOYO <Text style={styles.pink}>LIVE</Text></Text>
      <Text style={styles.subtitle}>عالمك .. لحظتك .. جمهورك</Text>

      <Text style={styles.title}>
        {isLogin ? 'أهلاً بعودتك 💗' : 'انضم إلى YOYO LIVE 💗'}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="البريد الإلكتروني"
        placeholderTextColor="#AAA1B8"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="كلمة المرور"
        placeholderTextColor="#AAA1B8"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={submit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>
            {isLogin ? 'تسجيل الدخول' : 'إنشاء حساب'}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
        <Text style={styles.switchText}>
          {isLogin ? 'ليس لديك حساب؟ إنشاء حساب جديد' : 'لديك حساب بالفعل؟ تسجيل الدخول'}
        </Text>
      </TouchableOpacity>
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
  input: {
    backgroundColor: '#191424',
    color: '#FFFFFF',
    borderRadius: 13,
    padding: 16,
    marginBottom: 15,
    textAlign: 'right',
  },
  button: {
    backgroundColor: '#8655F5',
    padding: 16,
    borderRadius: 13,
    alignItems: 'center',
    marginTop: 8,
  },
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
