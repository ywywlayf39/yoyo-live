import React from 'react';
import { Text, View } from 'react-native';

export default function Gift3DModel({ emoji = '🎁', size = 148, style }) {
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ fontSize: Math.round(size * 0.52) }}>{emoji}</Text>
      <Text style={{ color: '#BDA7E8', fontSize: 10, fontWeight: '800' }}>معاينة 3D متاحة على التطبيق</Text>
    </View>
  );
}
