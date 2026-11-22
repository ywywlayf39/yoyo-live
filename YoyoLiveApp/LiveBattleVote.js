import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';

const OPTIONS = [5, 10, 15, 20, 30];

export default function LiveBattleVote({ roomName, userId }) {
  const [battle, setBattle] = useState(null);
  const [myVote, setMyVote] = useState(null);
  const [tally, setTally] = useState({});
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!roomName || !userId) return;
    const { data, error } = await supabase.from('yoyo_battles')
      .select('id,status,room_a,room_b,duration_minutes,starts_at,ends_at,host_a_name,host_b_name')
      .or('room_a.eq.' + roomName + ',room_b.eq.' + roomName)
      .in('status', ['pending', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) { setBattle(null); return; }
    setBattle(data);
  }, [roomName, userId]);

  useEffect(() => {
    refresh();
    const channel = supabase.channel('battle-vote-' + roomName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yoyo_battles' }, refresh)
      .subscribe();
    const timer = setInterval(refresh, 5000);
    return () => { clearInterval(timer); supabase.removeChannel(channel); };
  }, [roomName, refresh]);

  const vote = async (minutes) => {
    if (!battle || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('yoyo_battle_vote_duration', {
      p_battle_id: battle.id,
      p_duration_minutes: minutes,
    });
    setBusy(false);
    if (error) {
      Alert.alert('تعذر تسجيل التصويت', error.message || 'حاول مرة أخرى.');
      return;
    }
    setMyVote(minutes);
    setTally(data?.tally || {});
    Alert.alert('تم تسجيل صوتك', 'اخترت مدة ' + minutes + ' دقيقة. يمكنك تغيير تصويتك قبل بدء التحدي.');
  };

  if (!battle) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>🗳️ تصويت مدة التحدي</Text>
      {battle.status === 'pending' ? (
        <>
          <Text style={styles.hint}>اختاروا مدة الجولة. كل مشاهد في البثين له صوت واحد ويمكنه تغييره قبل قبول التحدي.</Text>
          <View style={styles.options}>
            {OPTIONS.map((minutes) => (
              <TouchableOpacity key={minutes} disabled={busy} onPress={() => vote(minutes)} style={[styles.option, myVote === minutes && styles.selected]}>
                <Text style={styles.optionText}>{minutes} د</Text>
                {tally[String(minutes)] ? <Text style={styles.count}>{tally[String(minutes)]} صوت</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>لو مفيش تصويت، المدة الافتراضية 30 دقيقة. عند التعادل تُختار المدة الأطول.</Text>
        </>
      ) : (
        <Text style={styles.active}>مدة الجولة الحالية: {battle.duration_minutes || 30} دقيقة</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: '#191424', borderWidth: 1, borderColor: '#765A36' },
  title: { color: '#F5C451', fontSize: 14, fontWeight: 'bold' },
  hint: { color: '#AAA1B8', fontSize: 11, lineHeight: 18, marginTop: 7 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  option: { minWidth: 48, alignItems: 'center', backgroundColor: '#30263F', borderRadius: 9, paddingVertical: 8, paddingHorizontal: 9 },
  selected: { backgroundColor: '#67334F', borderWidth: 1, borderColor: '#F34E9B' },
  optionText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  count: { color: '#F5C451', fontSize: 9, marginTop: 3 },
  active: { color: '#FFFFFF', marginTop: 8, fontWeight: 'bold' },
});
