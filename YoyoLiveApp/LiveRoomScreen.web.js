import React from 'react';
import { supabase } from './supabase';
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function LiveRoomScreen({ onClose, isCall = false, isHost = false, roomName }) {
  const closePreview = async () => {
    if (isCall) {
      await supabase.from('live_calls').update({ status: 'ended' }).eq('room_name', roomName).in('status', ['ringing', 'accepted']);
    } else if (isHost) {
      await supabase.from('live_rooms').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('room_name', roomName).eq('status', 'live');
    }
    onClose?.();
  };
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0912" />
      <View style={styles.content}>
        <Text style={styles.icon}>📱</Text>
        <Text style={styles.title}>{isCall ? 'المكالمات الصوتية والفيديو' : 'البث المباشر'}</Text>
        <Text style={styles.description}>
          البث والمكالمات بالكاميرا والميكروفون تحتاج نسخة Android التطويرية من YOYO LIVE، وليست معاينة الويب.
        </Text>
        <TouchableOpacity style={styles.button} onPress={closePreview}>
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
