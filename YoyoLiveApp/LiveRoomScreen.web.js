import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function LiveRoomScreen({ onClose }) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0912" />
      <View style={styles.content}>
        <Text style={styles.icon}>📱</Text>
        <Text style={styles.title}>البث المباشر</Text>
        <Text style={styles.description}>
          البث بالكاميرا والميكروفون يحتاج نسخة Android التطويرية من YOYO LIVE، وليس معاينة الويب.
        </Text>
        <TouchableOpacity style={styles.button} onPress={onClose}>
          <Text style={styles.buttonText}>رجوع</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0912' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  icon: { fontSize: 52, marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
  description: { color: '#AAA1B8', fontSize: 15, textAlign: 'center', lineHeight: 25 },
  button: { backgroundColor: '#F34E9B', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 48, marginTop: 28 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});
