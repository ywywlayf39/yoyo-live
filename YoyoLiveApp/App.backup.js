import React, { useState } from 'react';
import {
  View,
    Text,
      StyleSheet,
        ScrollView,
          TouchableOpacity,
            SafeAreaView,
              StatusBar,
              } from 'react-native';
  bg: '#0B0912',
  card: '#191424',
  card2: '#241B35',
  purple: '#8655F5',
  pink: '#F34E9B',
  gold: '#F5C66A',
  white: '#FFFFFF',
  muted: '#A49AAF',
  border: '#30263F',
};

export default function App() {
  const [tab, setTab] = useState('الرئيسية');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.container}>
        <Text style={styles.logo}>
          YOYO <Text style={{ color: C.pink }}>LIVE</Text>
        </Text>
        <Text style={styles.subtitle}>عالمك.. لحظتك.. جمهورك</Text>
        <View style={styles.header}>
          <Text style={styles.coins}>🪙 250</Text>
          <Text style={styles.notification}>🔔</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.sectionHeader}>
            <Text style={styles.more}>عرض الكل ←</Text>
            <Text style={styles.sectionTitle}>المباشر الآن 🔴</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {['👩🏻', '🧔🏻', '👩🏼', '👨🏻', '👩🏽'].map((emoji, i) => (
              <View key={i} style={styles.story}>
                <View style={styles.storyCircle}>
                  <Text style={styles.storyEmoji}>{emoji}</Text>
                </View>
                <Text style={styles.storyName}>
                  {['سارة', 'أحمد', 'نور', 'محمد', 'ليلى'][i]}
                </Text>
                <Text style={styles.live}>LIVE</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.arena}>
            <Text style={styles.arenaEmoji}>🏆</Text>
            <Text style={styles.arenaTitle}>YOYO ARENA</Text>
            <Text style={styles.arenaDesc}>
              التحدي بدأ.. مين نجم الساحة النهارده؟
            </Text>
            <Text style={styles.arenaButton}>ادخل التحدي ←</Text>
          </TouchableOpacity>

          <View style={styles.sectionHeader}>
            <Text style={styles.more}>المزيد ←</Text>
            <Text style={styles.sectionTitle}>اكتشف الفيديوهات ✨</Text>
          </View>

          {[
            ['💃', 'ياسمين', 'أجمل لحظات اليوم ✨', '12.5K'],
            ['🎤', 'عمر', 'مين صاحي معانا؟ 🔥', '8.2K'],
            ['🌸', 'نور', 'يوم جميل مع YOYO', '5.7K'],
          ].map((v, i) => (
            <View key={i} style={styles.videoCard}>
              <View style={styles.videoCover}>
                <Text style={styles.videoEmoji}>{v[0]}</Text>
                <Text style={styles.play}>▶</Text>
              </View>
              <View style={styles.videoInfo}>
                <Text style={styles.likes}>♥ {v[3]}</Text>
                <View>
                  <Text style={styles.videoUser}>{v[1]}</Text>
                  <Text style={styles.videoTitle}>{v[2]}</Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.bottomNav}>
          {[
            ['⌂', 'الرئيسية'],
            ['⌕', 'اكتشف'],
            ['◎', 'البث'],
            ['✉', 'الرسائل'],
            ['♙', 'حسابي'],
          ].map(([icon, name]) => (
            <TouchableOpacity
              key={name}
              style={styles.navItem}
              onPress={() => setTab(name)}
            >
              <Text style={[
                styles.navIcon,
                tab === name && styles.navActive
              ]}>{icon}</Text>
              <Text style={[
                styles.navText,
                tab === name && styles.navActive
              ]}>{name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
  container: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  logo: {
    color: C.white,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'right',
  },
  subtitle: {
    color: C.muted,
    textAlign: 'right',
    fontSize: 12,
    marginTop: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 20,
  },
  coins: {
    color: C.gold,
    backgroundColor: C.card2,
    padding: 10,
    borderRadius: 15,
    fontWeight: 'bold',
  },
  notification: {
    color: C.white,
    backgroundColor: C.card,
    padding: 9,
    borderRadius: 13,
    fontSize: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 15,
  },
  sectionTitle: {
    color: C.white,
    fontSize: 17,
    fontWeight: 'bold',
  },
  more: {
    color: C.purple,
    fontSize: 12,
  },
  story: {
    alignItems: 'center',
    marginRight: 15,
    marginBottom: 20,
  },
  storyCircle: {
    width: 65,
    height: 65,
    borderRadius: 33,
    backgroundColor: C.card2,
    borderWidth: 2,
    borderColor: C.pink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyEmoji: {
    fontSize: 30,
  },
  storyName: {
    color: C.white,
    fontSize: 11,
    marginTop: 7,
  },
  live: {
    color: C.white,
    backgroundColor: C.pink,
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 3,
  },
  arena: {
    backgroundColor: '#291747',
    borderRadius: 22,
    padding: 18,
    marginVertical: 15,
    borderWidth: 1,
    borderColor: '#7544A8',
    alignItems: 'center',
  },
  arenaEmoji: {
    fontSize: 35,
  },
  arenaTitle: {
    color: C.white,
    fontSize: 27,
    fontWeight: '900',
    marginTop: 5,
  },
  arenaDesc: {
    color: '#D7C7EA',
    fontSize: 13,
    marginTop: 7,
  },
  arenaButton: {
    color: C.white,
    backgroundColor: C.purple,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 15,
    overflow: 'hidden',
    fontWeight: 'bold',
  },
  videoCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  videoCover: {
    height: 175,
    backgroundColor: '#302044',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoEmoji: {
    fontSize: 75,
  },
  play: {
    position: 'absolute',
    color: C.white,
    fontSize: 25,
    backgroundColor: '#FFFFFF33',
    padding: 10,
    overflow: 'hidden',
    borderRadius: 30,
  },
  videoInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 13,
  },
  videoUser: {
    color: C.white,
    textAlign: 'right',
    fontWeight: 'bold',
  },
  videoTitle: {
    color: C.muted,
    textAlign: 'right',
    fontSize: 11,
    marginTop: 4,
  },
  likes: {
    color: C.pink,
    fontWeight: 'bold',
    fontSize: 12,
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
  },
  navItem: {
    alignItems: 'center',
    minWidth: 55,
  },
  navIcon: {
    color: C.muted,
    fontSize: 24,
  },
  navText: {
    color: C.muted,
    fontSize: 10,
    marginTop: 4,
  },
  navActive: {
    color: C.pink,
    fontWeight: 'bold',
  },
});

