import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, View, Dimensions, StatusBar, StyleSheet } from 'react-native';
import LiveRoomScreen from './LiveRoomScreen';

const PAGE_HEIGHT = Dimensions.get('window').height;

export default function LiveSwipeFeed({ rooms = [], initialRoomId, userId, onClose, onOpenPackages }) {
  const activeRooms = useMemo(() => (rooms || []).filter((room) => room?.room_name && room?.host_id), [rooms]);
  const initialIndex = Math.max(0, activeRooms.findIndex((room) => room.id === initialRoomId));
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  useEffect(() => {
    if (activeIndex >= activeRooms.length) setActiveIndex(Math.max(0, activeRooms.length - 1));
  }, [activeRooms.length, activeIndex]);

  const onPageChanged = (event) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.y / PAGE_HEIGHT);
    if (nextIndex >= 0 && nextIndex < activeRooms.length) setActiveIndex(nextIndex);
  };

  if (!activeRooms.length) {
    return (
      <View style={styles.empty}>
        <StatusBar hidden />
        <Text style={styles.emptyTitle}>انتهت البثوث المتاحة الآن</Text>
        <Text style={styles.emptyText}>اسحب للتحديث لاحقًا أو ارجع للرئيسية.</Text>
        <Text onPress={onClose} style={styles.back}>رجوع</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <FlatList
        data={activeRooms}
        keyExtractor={(item) => item.id}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({ length: PAGE_HEIGHT, offset: PAGE_HEIGHT * index, index })}
        pagingEnabled
        snapToInterval={PAGE_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        windowSize={3}
        onMomentumScrollEnd={onPageChanged}
        renderItem={({ item, index }) => (
          <View style={styles.page}>
            {index === activeIndex ? (
              <LiveRoomScreen
                key={item.room_name}
                roomName={item.room_name}
                isHost={item.host_id === userId}
                hostName={item.host_name || 'مذيع YOYO LIVE'}
                userId={userId}
                receiverId={item.host_id}
                onOpenPackages={onOpenPackages}
                onClose={onClose}
              />
            ) : (
              <View style={styles.preview}>
                <Text style={styles.live}>● LIVE الآن</Text>
                <Text style={styles.host}>{item.host_name || 'مذيع YOYO LIVE'}</Text>
                <Text style={styles.title}>{item.title || 'بث مباشر'}</Text>
                <Text style={styles.hint}>اسحب لأعلى أو لأسفل لمشاهدة البث</Text>
              </View>
            )}
          </View>
        )}
      />
      <View pointerEvents="none" style={styles.swipeHint}>
        <Text style={styles.swipeHintText}>{activeIndex + 1} / {activeRooms.length}  •  اسحب للتنقل بين البثوث</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05040A' },
  page: { height: PAGE_HEIGHT, width: '100%', backgroundColor: '#05040A' },
  preview: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#100B19' },
  live: { color: '#FF718B', fontSize: 15, fontWeight: '900', marginBottom: 14 },
  host: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  title: { color: '#D7CDE0', fontSize: 16, marginTop: 10 },
  hint: { color: '#F34E9B', fontSize: 14, fontWeight: '700', marginTop: 26 },
  swipeHint: { position: 'absolute', bottom: 16, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: 'rgba(10,7,16,0.72)' },
  swipeHintText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0B0912' },
  emptyTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: '#AAA1B8', marginTop: 12, textAlign: 'center' },
  back: { color: '#F34E9B', fontWeight: '900', fontSize: 16, marginTop: 24, padding: 12 },
});
