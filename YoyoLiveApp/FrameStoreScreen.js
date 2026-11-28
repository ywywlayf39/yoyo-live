import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { supabase } from './supabase';
import ProfileFrame from './ProfileFrame';

const C = { bg:'#0B0912', card:'#191424', purple:'#8655F5', gold:'#F5C451', white:'#FFFFFF', muted:'#AAA1B8', pink:'#F34E9B' };
const fmt = n => Number(n || 0).toLocaleString('ar-EG');

export default function FrameStoreScreen({ userId, onBack, onOpenPackages, onFrameChanged }) {
  const [frames,setFrames] = useState([]);
  const [owned,setOwned] = useState([]);
  const [selected,setSelected] = useState('classic');
  const [avatar,setAvatar] = useState(null);
  const [balance,setBalance] = useState(0);
  const [vip,setVip] = useState(false);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [f,p,o,w,v] = await Promise.all([
        supabase.from('yoyo_profile_frames').select('code,name,tier,coin_cost,vip_only').eq('active',true).order('sort_order'),
        supabase.from('profiles').select('avatar_url,selected_frame_code').eq('id',userId).maybeSingle(),
        supabase.from('yoyo_user_profile_frames').select('frame_code').eq('user_id',userId),
        supabase.from('wallets').select('purchased_coins').eq('user_id',userId).maybeSingle(),
        supabase.from('user_vip_subscriptions').select('status,expires_at').eq('user_id',userId).maybeSingle(),
      ]);
      const failed=[f,p,o,w,v].find(x=>x.error); if(failed) throw failed.error;
      setFrames(f.data||[]); setAvatar(p.data?.avatar_url||null);
      setSelected(p.data?.selected_frame_code||'classic');
      setOwned((o.data||[]).map(x=>x.frame_code));
      setBalance(Number(w.data?.purchased_coins||0));
      setVip(v.data?.status==='active' && !!v.data?.expires_at && new Date(v.data.expires_at).getTime()>Date.now());
    } catch(e) { Alert.alert('تعذر تحميل الإطارات',e?.message||'حاول مرة أخرى.'); }
    finally { setLoading(false); }
  },[userId]);
  useEffect(()=>{load();},[load]);

  const activate = async code => {
    setBusy(code);
    const {error}=await supabase.rpc('yoyo_select_profile_frame',{p_frame_code:code});
    if(error) Alert.alert('تعذر التفعيل',error.message);
    else { setSelected(code); onFrameChanged?.(code); Alert.alert('تم التفعيل','الإطار ظاهر الآن على صورتك الشخصية.'); }
    setBusy('');
  };
  const choose = frame => {
    const hasIt=owned.includes(frame.code);
    const vipAllowed=frame.vip_only && vip;
    if(frame.vip_only && !hasIt && !vipAllowed) { Alert.alert('إطار VIP','هذا الإطار متاح لأعضاء VIP فقط.'); return; }
    if(hasIt || vipAllowed || Number(frame.coin_cost)===0) { activate(frame.code); return; }
    if(balance<Number(frame.coin_cost)) {
      Alert.alert('رصيد غير كافٍ','اشحن الكوينز ثم ارجع لشراء الإطار.',[{text:'إلغاء',style:'cancel'},{text:'شحن الكوينز',onPress:onOpenPackages}]); return;
    }
    Alert.alert('تأكيد شراء الإطار','سيتم خصم '+fmt(frame.coin_cost)+' كوينز. هل تريد الشراء وتفعيله؟',[{text:'إلغاء',style:'cancel'},{text:'شراء وتفعيل',onPress:async()=>{
      setBusy(frame.code);
      const {data,error}=await supabase.rpc('yoyo_unlock_profile_frame',{p_frame_code:frame.code});
      if(error) Alert.alert('فشل الشراء',error.message);
      else {
        setOwned(cur=>cur.includes(frame.code)?cur:[...cur,frame.code]);
        if(data?.balance!==undefined) setBalance(Number(data.balance));
        setSelected(frame.code); onFrameChanged?.(frame.code);
        Alert.alert('تم الشراء','تم فتح الإطار وتفعيله بنجاح.');
      }
      setBusy('');
    }}]);
  };

  return <SafeAreaView style={s.root}>
    <View style={s.header}>
      <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backText}>رجوع</Text></TouchableOpacity>
      <View style={{flex:1,alignItems:'flex-end'}}><Text style={s.title}>متجر إطارات 3D</Text><Text style={s.sub}>إطارات متحركة ومضيئة لصورتك</Text></View>
    </View>
    <View style={s.balance}><Text style={s.balanceText}>رصيدك: {fmt(balance)} كوينز</Text><TouchableOpacity onPress={onOpenPackages}><Text style={s.charge}>＋ شحن</Text></TouchableOpacity></View>
    {loading ? <ActivityIndicator color={C.gold} size="large" style={{marginTop:40}}/> :
    <ScrollView contentContainerStyle={s.list}>
      {frames.map(frame=>{
        const isOwned=owned.includes(frame.code), isVip=frame.vip_only&&vip, isSelected=selected===frame.code;
        const locked=frame.vip_only&&!isOwned&&!vip;
        const price=Number(frame.coin_cost||0)===0?'مجاني':frame.vip_only&&!isOwned&&!vip?'VIP':isOwned?'مملوك':fmt(frame.coin_cost)+' كوينز';
        return <View key={frame.code} style={s.card}>
          <View style={s.preview}><ProfileFrame frameCode={frame.code} size={112}>
            {avatar?<Image source={{uri:avatar}} style={{width:'100%',height:'100%'}} resizeMode="cover"/>:<View style={s.avatarFallback}><Text style={{fontSize:40}}>👤</Text></View>}
          </ProfileFrame></View>
          <Text style={s.name}>{frame.name}</Text>
          <Text style={s.price}>{price}</Text>
          <TouchableOpacity disabled={!!busy} onPress={()=>choose(frame)} style={[s.action,isSelected&&s.active,locked&&s.locked]}>
            {busy===frame.code?<ActivityIndicator color={C.white}/>:<Text style={s.actionText}>{isSelected?'مفعّل الآن ✓':isOwned||isVip?'تفعيل الإطار':locked?'يتطلب VIP':Number(frame.coin_cost)===0?'تفعيل مجانًا':'شراء وتفعيل'}</Text>}
          </TouchableOpacity>
        </View>;
      })}
      <Text style={s.note}>المعاينة لا تخصم أي كوينز. الخصم يتم فقط بعد تأكيد الشراء، والإطار المملوك يمكنك تفعيله مرة أخرى مجانًا.</Text>
    </ScrollView>}
  </SafeAreaView>;
}
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:C.bg,paddingTop:8},header:{flexDirection:'row',alignItems:'center',padding:16,gap:12},back:{padding:10,backgroundColor:C.card,borderRadius:10},backText:{color:C.white,fontWeight:'800'},title:{color:C.white,fontSize:21,fontWeight:'900'},sub:{color:C.muted,fontSize:12,marginTop:4},balance:{marginHorizontal:16,marginBottom:8,padding:13,borderRadius:12,backgroundColor:C.card,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},balanceText:{color:C.gold,fontWeight:'900'},charge:{color:'#B99AFF',fontWeight:'900'},list:{padding:12,flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:10},card:{width:'48%',minHeight:220,alignItems:'center',padding:12,backgroundColor:C.card,borderRadius:16,borderWidth:1,borderColor:'#382C49'},preview:{height:132,alignItems:'center',justifyContent:'center',width:'100%'},avatarFallback:{flex:1,alignItems:'center',justifyContent:'center'},name:{color:C.white,fontWeight:'900',marginTop:4,textAlign:'center'},price:{color:C.gold,fontSize:12,marginTop:5,fontWeight:'800'},action:{marginTop:10,width:'100%',padding:10,borderRadius:10,backgroundColor:C.purple,alignItems:'center'},active:{backgroundColor:'#246B55'},locked:{backgroundColor:'#55445F'},actionText:{color:C.white,fontWeight:'900',fontSize:12},note:{width:'100%',color:C.muted,fontSize:12,textAlign:'center',padding:12,lineHeight:20}
});
