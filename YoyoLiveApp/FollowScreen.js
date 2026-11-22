import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';

const C = { bg: '#0B0912', card: '#191424', card2: '#241B35', pink: '#F34E9B', white: '#FFFFFF', muted: '#AAA1B8', border: '#30263F' };

export default function FollowScreen({ userId, initialTab = 'followers', onBack, onOpenMember }) {
  const [tab, setTab] = useState(initialTab);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true); setError('');
    const column = tab === 'followers' ? 'following_id' : 'follower_id';
    const profileColumn = tab === 'followers' ? 'follower_id' : 'following_id';
    const { data: rows, error: rowsError } = await supabase.from('user_follows').select('follower_id,following_id,created_at').eq(column, userId).order('created_at', { ascending: false }).limit(300);
    if (rowsError) { setError('تعذر تحميل قائمة المتابعة.'); setItems([]); setLoading(false); return; }
    const ids = (rows || []).map((row) => row[profileColumn]).filter(Boolean);
    if (!ids.length) { setItems([]); setLoading(false); return; }
    const { data: profiles, error: profileError } = await supabase.from('member_public_profiles').select('id,display_name,avatar_url,country').in('id', ids);
    if (profileError) { setError('تعذر تحميل بيانات الأعضاء.'); setItems([]); }
    else {
      const map = new Map((profiles || []).map((p) => [p.id, p]));
      setItems(ids.map((id) => map.get(id)).filter(Boolean));
    }
    setLoading(false);
  }, [userId, tab]);

  useEffect(() => {
    load();
    const channel = supabase.channel('follow-list-' + userId + '-' + tab)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_follows' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [load, userId, tab]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>رجوع ←</Text></TouchableOpacity>
        <Text style={styles.title}>مجتمع المتابعة</Text>
      </View>
      <View style={styles.tabs}>
        <TouchableOpacity onPress={() => setTab('followers')} style={[styles.tab, tab === 'followers' && styles.active]}><Text style={styles.tabText}>المتابعون</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setTab('following')} style={[styles.tab, tab === 'following' && styles.active]}><Text style={styles.tabText}>أتابعهم</Text></TouchableOpacity>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={C.pink} /><Text style={styles.muted}>جارٍ التحميل...</Text></View> :
       error ? <View style={styles.center}><Text style={styles.error}>{error}</Text><TouchableOpacity onPress={load}><Text style={styles.back}>إعادة المحاولة</Text></TouchableOpacity></View> :
       <FlatList data={items} keyExtractor={(item) => item.id} contentContainerStyle={items.length ? styles.list : styles.empty}
         ListEmptyComponent={<View style={styles.center}><Text style={styles.emptyTitle}>القائمة لسه فاضية</Text><Text style={styles.muted}>ابدأ متابعة الأعضاء وسيظهروا هنا.</Text></View>}
         renderItem={({item}) => <TouchableOpacity style={styles.row} onPress={() => onOpenMember?.(item)}>
           {item.avatar_url ? <Image source={{uri:item.avatar_url}} style={styles.avatar}/> : <View style={styles.avatarFallback}><Text>👤</Text></View>}
           <View style={{flex:1,alignItems:'flex-end'}}><Text style={styles.name}>{item.display_name || 'عضو YOYO LIVE'}</Text><Text style={styles.muted}>{item.country || ''}</Text></View>
           <Text style={styles.chevron}>‹</Text>
         </TouchableOpacity>}
       />}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
 safe:{flex:1,backgroundColor:C.bg},header:{padding:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderColor:C.border},
 back:{color:C.pink,fontWeight:'bold'},title:{color:C.white,fontSize:20,fontWeight:'bold'},tabs:{flexDirection:'row',padding:12,gap:10},
 tab:{flex:1,padding:13,borderRadius:12,backgroundColor:C.card,alignItems:'center'},active:{backgroundColor:'#642044',borderWidth:1,borderColor:C.pink},
 tabText:{color:C.white,fontWeight:'bold'},list:{padding:12},empty:{flexGrow:1,justifyContent:'center'},row:{flexDirection:'row',alignItems:'center',backgroundColor:C.card,borderRadius:14,padding:12,marginBottom:9,gap:12},
 avatar:{width:48,height:48,borderRadius:24,backgroundColor:C.card2},avatarFallback:{width:48,height:48,borderRadius:24,backgroundColor:C.card2,alignItems:'center',justifyContent:'center'},
 name:{color:C.white,fontWeight:'bold'},muted:{color:C.muted,fontSize:12,marginTop:4},chevron:{color:C.pink,fontSize:26},center:{flex:1,alignItems:'center',justifyContent:'center',padding:24},emptyTitle:{color:C.white,fontWeight:'bold',fontSize:18},error:{color:'#ff8585'}
});
