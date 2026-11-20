import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, Modal, StyleSheet, ActivityIndicator
} from 'react-native';
import { supabase } from './supabase';

const countries = [
  'مصر', 'السعودية', 'الإمارات', 'الكويت', 'قطر',
  'البحرين', 'عمان', 'الأردن', 'العراق', 'لبنان',
  'المغرب', 'الجزائر', 'تونس', 'ليبيا', 'السودان',
  'فلسطين', 'اليمن', 'سوريا', 'تركيا', 'ألمانيا',
  'فرنسا', 'بريطانيا', 'أمريكا', 'كندا', 'دولة أخرى'
];

export default function ProfileScreen({ userId, onComplete }) {
  const [name, setName] = useState('');
  const [country, setCountry] = useState('مصر');
  const [birthDate, setBirthDate] = useState('');
  const [showCountries, setShowCountries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function saveProfile() {
    setError('');

    if (!name.trim()) {
      setError('اكتب اسمك من فضلك');
      return;
    }

    const match = birthDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
      setError('اكتب تاريخ الميلاد بالصيغة يوم/شهر/سنة');
      return;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    const today = new Date();

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day ||
      date > today
    ) {
      setError('تاريخ الميلاد غير صحيح');
      return;
    }

    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    setSaving(true);

    const { error: saveError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        display_name: name.trim(),
        country,
        birth_date: isoDate
      }, { onConflict: 'id' });

    setSaving(false);

    if (saveError) {
      setError('حصلت مشكلة أثناء الحفظ. حاول مرة أخرى.');
      console.log(saveError.message);
      return;
    }

    if (onComplete) onComplete();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.logo}>YOYO <Text style={styles.pink}>LIVE 💗</Text></Text>
      <Text style={styles.title}>أهلاً بيك في عائلة يويو لايف</Text>
      <Text style={styles.subtitle}>خلينا نتعرف عليك</Text>

      <Text style={styles.label}>اسمك</Text>
      <TextInput
        style={styles.input}
        placeholder="اكتب اسمك"
        placeholderTextColor="#aaa"
        value={name}
        onChangeText={setName}
        textAlign="right"
      />

      <Text style={styles.label}>البلد</Text>
      <TouchableOpacity
        style={styles.input}
        onPress={() => setShowCountries(true)}
      >
        <Text style={styles.fieldText}>🌍  {country}　⌄</Text>
      </TouchableOpacity>

      <Text style={styles.label}>تاريخ الميلاد</Text>
      <TextInput
        style={styles.input}
        placeholder="يوم/شهر/سنة مثال 21/05/2000"
        placeholderTextColor="#aaa"
        value={birthDate}
        onChangeText={setBirthDate}
        keyboardType="numbers-and-punctuation"
        textAlign="right"
      />
      <Text style={styles.note}>تاريخ ميلادك خاص ولن يظهر للأعضاء الآخرين.</Text>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, saving && styles.disabled]}
        onPress={saveProfile}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>حفظ والدخول ❤️</Text>
        }
      </TouchableOpacity>

      <Modal
        visible={showCountries}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountries(false)}
      >
        <View style={styles.modalBackground}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>اختار بلدك</Text>
            <ScrollView>
              {countries.map(item => (
                <TouchableOpacity
                  key={item}
                  style={styles.countryItem}
                  onPress={() => {
                    setCountry(item);
                    setShowCountries(false);
                  }}
                >
                  <Text style={styles.countryText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setShowCountries(false)}>
              <Text style={styles.closeText}>إغلاق</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#180b20',
    justifyContent: 'center',
    padding: 24
  },
  logo: {
    color: '#fff',
    fontSize: 30,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 28
  },
  pink: { color: '#ff4f9a' },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10
  },
  subtitle: {
    color: '#d8b6ca',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 28
  },
  label: {
    color: '#fff',
    textAlign: 'right',
    marginBottom: 8,
    marginTop: 12,
    fontSize: 15
  },
  input: {
    backgroundColor: '#32172f',
    borderWidth: 1,
    borderColor: '#75405f',
    borderRadius: 12,
    padding: 15,
    color: '#fff',
    fontSize: 16,
    minHeight: 52,
    justifyContent: 'center'
  },
  fieldText: { color: '#fff', textAlign: 'right', fontSize: 16 },
  note: {
    color: '#bdaaba',
    textAlign: 'right',
    fontSize: 12,
    marginTop: 8
  },
  button: {
    backgroundColor: '#b72d70',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 28
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 17 },
  error: {
    color: '#ff7777',
    textAlign: 'center',
    marginTop: 14
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 24
  },
  modalBox: {
    backgroundColor: '#241126',
    borderRadius: 16,
    padding: 18,
    maxHeight: '75%'
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12
  },
  countryItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#50304a'
  },
  countryText: { color: '#fff', textAlign: 'right', fontSize: 16 },
  closeText: {
    color: '#ff78b4',
    textAlign: 'center',
    padding: 14,
    fontSize: 16
  }
});
