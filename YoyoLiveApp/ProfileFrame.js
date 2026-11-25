import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';

const FRAME_STYLES = {
  vip_gold: { edge: '#F5C451', glow: '#FFF0A8', label: 'VIP' },
  vip_diamond: { edge: '#82D9FF', glow: '#E4FAFF', label: 'VIP' },
  vip_rose: { edge: '#F47EB5', glow: '#FFD8EA', label: 'VIP' },
  vip_royal: { edge: '#B78BFF', glow: '#E9D8FF', label: 'VIP' },
  vip_fire: { edge: '#FF704D', glow: '#FFD0A8', label: 'VIP' },
  vip_galaxy: { edge: '#A78BFA', glow: '#E3D7FF', label: 'VIP' },
  vip_ice: { edge: '#72D8E8', glow: '#D8FFFF', label: 'VIP' },
  vip_emerald: { edge: '#51D6A2', glow: '#D1FFEA', label: 'VIP' },
};

export default function ProfileFrame({ frameCode, size = 112, children }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1250, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1250, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const frame = FRAME_STYLES[frameCode];
  if (!frame) return <View style={{ width: size, height: size }}>{children}</View>;
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  return (
    <Animated.View style={{
      width: size, height: size, borderRadius: size / 2, padding: Math.max(3, size * 0.035),
      borderWidth: 3, borderColor: frame.edge, backgroundColor: '#171020',
      shadowColor: frame.glow, shadowOpacity: 0.95, shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 }, elevation: 12,
      transform: [{ scale }],
    }}>
      <View style={{
        flex: 1, borderRadius: size / 2, overflow: 'hidden',
        borderWidth: 1.5, borderColor: frame.glow, backgroundColor: '#21172D',
      }}>
        {children}
      </View>
      <View style={{
        position: 'absolute', top: -5, alignSelf: 'center', minWidth: 42,
        paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9,
        backgroundColor: frame.edge, borderWidth: 1, borderColor: '#FFF4D0',
      }}>
        <Text style={{ color: '#21172D', fontSize: Math.max(8, size * 0.085), fontWeight: '900', textAlign: 'center', letterSpacing: 1 }}>VIP</Text>
      </View>
    </Animated.View>
  );
}
