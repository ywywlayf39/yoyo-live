import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, Modal, StyleSheet, ActivityIndicator
} from 'react-native';
import { supabase } from './supabase';
import DateTimePicker from '@react-native-community/datetimepicker'

const countries = [
  'مصر', 'السعودية', 'الإمارات', 'الكويت', 'قطر',
  'البحرين', 'عمان', 'الأردن', 'العراق', 'لبنان',
  'المغرب', 'الجزائر', 'تونس', 'ليبيا', 'السودان',
  'فلسطين', 'اليمن', 'سوريا', 'تركيا', 'ألمانيا',
  'فرنسا', 'بريطانيا', 'أمريكا', 'كندا', 'أخرى'
];

export default function ProfileScreen({ userId, onComplete }) {
  const [name, setName] = useState('');
  const [country, setCountry] = useState('مصر');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [showCountries, setShowCountries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const saveProfile = async () => {
    setError('');

    if (!name.trim()) {
      setError('اكتب اسمك من فضلك');
      return;
    }

    if (!gender) {
      setError('اختار النوع: ذكر أو أنثى');
      return;
    }

    const match = birthDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
      setError('اكتب تاريخ الميلاد بالشكل يوم/شهر/سنة');
      return;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date > new Date()
    ) {
      setError('تاريخ الميلاد غير صحيح');
      return;
    }

    setSaving(true);

    try {
      const { error: saveError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          display_name: name.trim(),
          country,
          gender,
          birth_date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        });

      if (saveError) throw saveError;

      onComplete?.();
    } catch (saveError) {
      setError('تعذر حفظ البيانات: ' + (saveError?.message || 'حاول مرة أخرى'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.logo}>YOYO LIVE 💗</Text>
      <Text style={styles.title}>أهلاً بيك في عائلة يويو لايف</Text>
      <Text style={styles.subtitle}>خلينا نتعرف عليك</Text>

      <Text style={styles.label}>اسمك</Text>
      <TextInput
        style={styles.input}
        placeholder="اكتب اسمك"
        placeholderTextColor="#999"
        value={name}
        onChangeText={setName}
        textAlign="right"
      />

      <Text style={styles.label}>النوع</Text>
      <View style={styles.genderRow}>
        {['ذكر', 'أنثى'].map(item => (
          <TouchableOpacity
            key={item}
            style={[styles.genderOption, gender === item && styles.genderOptionSelected]}
            onPress={() => setGender(item)}
            accessibilityRole="radio"
            accessibilityState={{ selected: gender === item }}
          >
            <Text style={[styles.genderText, gender === item && styles.genderTextSelected]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>بلدك</Text>
      <TouchableOpacity
        style={styles.input}
        onPress={() => setShowCountries(true)}
      >
        <Text style={styles.value}>{country}   ▼</Text>
      </TouchableOpacity>

      <Text style={styles.label}>تاريخ ميلادك</Text>
      <TextInput
        style={styles.input}
        placeholder="يوم/شهر/سنة مثال 15/08/2000"
        placeholderTextColor="#999"
        value={birthDate}
        onChangeText={(value) => {
          const digits = value.replace(/\D/g, '').slice(0, 8);
          const formatted = digits.length <= 2
            ? digits
            : digits.length <= 4
              ? digits.slice(0, 2) + '/' + digits.slice(2)
              : digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
          setBirthDate(formatted);
        }}
        keyboardType="numeric"
        textAlign="right"
      />
      <Text style={styles.note}>تاريخ ميلادك لن يظهر للأعضاء الآخرين.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, saving && styles.disabled]}
        onPress={saveProfile}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>حفظ ومتابعة</Text>}
      </TouchableOpacity>

      <Modal
        visible={showCountries}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountries(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
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
                  <Text style={styles.value}>{item}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setShowCountries(false)}>
              <Text style={styles.close}>إغلاق</Text>
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
    backgroundColor: '#160d1c',
    justifyContent: 'center',
    padding: 24
  },
  logo: {
    color: '#e8b85c',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 25
  },
  title: {
    color: '#fff',
    fontSize: 23,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  subtitle: {
    color: '#d8cbdc',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 30
  },
  label: {
    color: '#fff',
    fontSize: 15,
    marginBottom: 8,
    marginTop: 14,
    textAlign: 'right'
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    color: '#24152b'
  },
  genderRow: {
    flexDirection: 'row',
    gap: 12
  },
  genderOption: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d9cbdc',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center'
  },
  genderOptionSelected: {
    backgroundColor: '#8c2456',
    borderColor: '#e8b85c'
  },
  genderText: {
    color: '#24152b',
    fontSize: 16,
    fontWeight: '600'
  },
  genderTextSelected: {
    color: '#fff'
  },
  value: {
    color: '#24152b',
    fontSize: 16,
    textAlign: 'right'
  },
  note: {
    color: '#cbbdce',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 8
  },
  error: {
    color: '#ff8585',
    textAlign: 'center',
    marginTop: 16
  },
  button: {
    backgroundColor: '#8c2456',
    padding: 16,
    borderRadius: 12,
    marginTop: 25,
    alignItems: 'center'
  },
  disabled: {
    opacity: 0.6
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold'
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 25
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    maxHeight: '75%'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    color: '#24152b'
  },
  countryItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  close: {
    color: '#8c2456',
    fontWeight: 'bold',
    textAlign: 'center',
    padding: 15
  }
});
