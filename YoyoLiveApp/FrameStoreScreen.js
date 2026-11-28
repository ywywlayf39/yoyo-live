import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { supabase } from './supabase';
import ProfileFrame from './ProfileFrame';
import TitleBadge from './TitleBadge';

const C = { bg:'#090711', card:'#171222', card2:'#21182F', purple:'#8655F5', gold:'#F5C451', white:'#FFFFFF', muted:'#AAA1B8', pink:'#F34E9B' };
const fmt = n => Number(n || 0).toLocaleString('ar-EG');
const FILTERS = [
  { id:'all', label:'الكل' }, { id:'starter', label:'بداية' }, { id:'gold', label:'ذهبي' },
  { id:'diamond', label:'ماسي' }, { id:'legendary', label:'أسطوري' }, { id:'vip', label:'VIP' },
];
const FRAME_META = {
  classic: { icon:'◉', subtitle:'بسيط وأنيق', tone:'#8D829E', tag:'أساسي' },
  vip_gold: { icon:'👑', subtitle:'تاج ملكي ولمعة ذهبية', tone:'#F5C451', tag:'VIP' },
  vip_diamond: { icon:'💎', subtitle:'كريستال براق', tone:'#83DFFF', tag:'ماسي' },
  vip_rose: { icon:'🌹', subtitle:'ورود ولمسات ناعمة', tone:'#F47EB5', tag:'مميز' },
  vip_royal: { icon:'♛', subtitle:'هيبة ملكية', tone:'#B78BFF', tag:'أسطوري' },
  vip_fire: { icon:'🔥', subtitle:'هالة نارية', tone:'#FF704D', tag:'أسطوري' },
  vip_galaxy: { icon:'🌌', subtitle:'مجرة ونجوم', tone:'#A78BFA', tag:'أسطوري' },
  vip_ice: { icon:'❄️', subtitle:'كريستال جليدي', tone:'#72D8E8', tag:'ماسي' },
  vip_emerald: { icon:'🍀', subtitle:'زمرد أخضر', tone:'#51D6A2', tag:'ماسي' },
};
const tierName = tier => ({ starter:'بداية', gold:'ذهبي', diamond:'ماسي', legendary:'أسطوري' }[tier] || 'مميز');

export default function FrameStoreScreen({ userId, onBack, onOpenPackages, onFrameChanged, onTitleChanged }) {
  const [frames,setFrames] = useState([]);
  const [titles,setTitles] = useState([]);
  const [ownedTitles,setOwnedTitles] = useState([]);
  const [selectedTitle,setSelectedTitle] = useState(null);
  const [storeTab,setStoreTab] = useState('frames');
  const [owned,setOwned] = useState([]);
  const [selected,setSelected] = useState('classic');
  const [avatar,setAvatar] = useState(null);
  const [balance,setBalance] = useState(0);
  const [vip,setVip] = useState(false);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState('');
  const [filter,setFilter] = useState('all');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [f,p,o,w,v,t,ot] = await Promise.all([
        supabase.from('yoyo_profile_frames').select('code,name,tier,coin_cost,vip_only').eq('active',true).order('sort_order'),
        supabase.from('profiles').select('avatar_url,selected_frame_code,selected_title').eq('id',userId).maybeSingle(),
        supabase.from('yoyo_user_profile_frames').select('frame_code').eq('user_id',userId),
        supabase.from('wallets').select('purchased_coins').eq('user_id',userId).maybeSingle(),
        supabase.from('user_vip_subscriptions').select('status,expires_at').eq('user_id',userId).maybeSingle(),
        supabase.from('yoyo_store_items').select('id,item_code,name,description,emoji,coin_cost').eq('category','title').eq('active',true).order('sort_order'),
        supabase.from('yoyo_user_store_inventory').select('item_id').eq('user_id',userId),
      ]);
      const failed=[f,p,o,w,v,t,ot].find(x=>x.error); if(failed) throw failed.error;
      setFrames(f.data||[]); setTitles(t.data||[]); setOwnedTitles((ot.data||[]).map(x=>x.item_id)); setSelectedTitle(p.data?.selected_title||null); setAvatar(p.data?.avatar_url||null);
      setSelected(p.data?.selected_frame_code||'classic');
      setOwned((o.data||[]).map(x=>x.frame_code));
      setBalance(Number(w.data?.purchased_coins||0));
      setVip(v.data?.status==='active' && !!v.data?.expires_at && new Date(v.data.expires_at).getTime()>Date.now());
    } catch(e) { Alert.alert('تعذر تحميل المتجر',e?.message||'حاول مرة أخرى.'); }
    finally { setLoading(false); }
  },[userId]);
  useEffect(()=>{load();},[load]);

  const visibleFrames = useMemo(() => frames.filter(frame => {
    if (filter === 'all') return true;
    if (filter === 'vip') return frame.vip_only;
    return frame.tier === filter;
  }), [frames,filter]);

  const chooseTitle = title => {
    const hasIt=ownedTitles.includes(title.id);
    if(hasIt) {
      Alert.alert('تفعيل اللقب','هل تريد إظهار لقب '+title.name+' بجوار اسمك؟',[
        {text:'إلغاء',style:'cancel'},
        {text:'تفعيل',onPress:async()=>{
          setBusy('title:'+title.item_code);
          const {error}=await supabase.rpc('yoyo_equip_store_item',{p_item_id:title.id});
          if(error) Alert.alert('تعذر التفعيل',error.message);
          else { setSelectedTitle(title.item_code); onTitleChanged?.(title.item_code); Alert.alert('تم التفعيل','لقبك ظاهر الآن بجوار اسمك.'); }
          setBusy('');
        }}
      ]);
      return;
    }
    if(balance<Number(title.coin_cost)) {
      Alert.alert('رصيد غير كافٍ','اشحن الكوينز ثم ارجع لشراء اللقب.',[{text:'إلغاء',style:'cancel'},{text:'شحن الكوينز',onPress:onOpenPackages}]);
      return;
    }
    Alert.alert('تأكيد شراء اللقب','سيتم خصم '+fmt(title.coin_cost)+' كوينز لامتلاك لقب '+title.name+'. هل تريد المتابعة؟',[
      {text:'إلغاء',style:'cancel'},
      {text:'شراء وتفعيل',onPress:async()=>{
        setBusy('title:'+title.item_code);
        const {data,error}=await supabase.rpc('yoyo_purchase_store_item',{p_item_id:title.id});
        if(error) Alert.alert('فشل الشراء',error.message);
        else {
          setOwnedTitles(cur=>cur.includes(title.id)?cur:[...cur,title.id]);
          if(data?.balance!==undefined) setBalance(Number(data.balance));
          const {error: equipError}=await supabase.rpc('yoyo_equip_store_item',{p_item_id:title.id});
          if(equipError) Alert.alert('تم الشراء','تم حفظ اللقب في مقتنياتك، لكن تعذر تفعيله الآن. يمكنك تفعيله من المتجر لاحقًا.');
          else { setSelectedTitle(title.item_code); onTitleChanged?.(title.item_code); }
          if(!equipError) Alert.alert('مبروك! 🎉','اشتريت لقب '+title.name+' وأصبح ظاهرًا بجوار اسمك.');
        }
        setBusy('');
      }}
    ]);
  };

  const clearTitle = async () => {
    setBusy('title-clear');
    const {error}=await supabase.rpc('yoyo_clear_profile_title');
    if(error) Alert.alert('تعذر إخفاء اللقب',error.message);
    else { setSelectedTitle(null); onTitleChanged?.(null); }
    setBusy('');
  };

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
      <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backText}>‹ رجوع</Text></TouchableOpacity>
      <View style={{flex:1,alignItems:'flex-end'}}><Text style={s.title}>YOYO EXCLUSIVE</Text><Text style={s.sub}>متجر المظاهر والمقتنيات</Text></View>
    </View>
    <View style={s.balance}>
      <View><Text style={s.balanceLabel}>محفظتك</Text><Text style={s.balanceText}>🪙 {fmt(balance)} كوينز</Text></View>
      <TouchableOpacity onPress={onOpenPackages} style={s.charge}><Text style={s.chargeText}>＋ شحن الكوينز</Text></TouchableOpacity>
    </View>
    <View style={s.hero}>
      <View style={s.heroCopy}>
        <Text style={s.heroEyebrow}>YOUR STYLE • YOUR STATUS</Text>
        <Text style={s.heroTitle}>{storeTab==='frames'?'خلي حضورك مختلف':'اختار لقب يميزك'}</Text>
        <Text style={s.heroText}>{storeTab==='frames'?'إطارات بتصميمات وتأثيرات مختلفة، مش مجرد تغيير ألوان.':'ألقاب حصرية تظهر بجوار اسمك في الملف الشخصي والشات والبث المباشر.'}</Text>
        <Text style={s.heroCount}>{frames.length} مقتنيات متاحة الآن</Text>
      </View>
      <View style={s.heroAvatar}>
        <ProfileFrame frameCode={selected || 'vip_royal'} size={94}>
          {avatar?<Image source={{uri:avatar}} style={{width:'100%',height:'100%'}} resizeMode="cover"/>:<View style={s.avatarFallback}><Text style={{fontSize:34}}>👤</Text></View>}
        </ProfileFrame>
        <Text style={s.heroCaption}>معاينة ملفك</Text>
      </View>
      <Text style={s.heroSpark}>✦</Text>
    </View>
    <View style={s.storeTabs}>
      <TouchableOpacity onPress={()=>setStoreTab('frames')} style={[s.storeTab,storeTab==='frames'&&s.storeTabActive]}><Text style={[s.storeTabText,storeTab==='frames'&&s.storeTabTextActive]}>🖼️ إطارات الصور</Text></TouchableOpacity>
      <TouchableOpacity onPress={()=>setStoreTab('titles')} style={[s.storeTab,storeTab==='titles'&&s.storeTabActive]}><Text style={[s.storeTabText,storeTab==='titles'&&s.storeTabTextActive]}>🏅 الألقاب</Text></TouchableOpacity>
    </View>
    {loading ? <ActivityIndicator color={C.gold} size="large" style={{marginTop:40}}/> : storeTab==='frames' ? <>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>اختار مجموعتك</Text>
        <Text style={s.sectionHint}>اسحب للتصفح</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
        {FILTERS.map(item=><TouchableOpacity key={item.id} onPress={()=>setFilter(item.id)} style={[s.filter,filter===item.id&&s.filterActive]}><Text style={[s.filterText,filter===item.id&&s.filterTextActive]}>{item.label}</Text></TouchableOpacity>)}
      </ScrollView>
      <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        <View style={s.listHeading}><Text style={s.listHeadingTitle}>{filter==='all'?'كل المقتنيات':FILTERS.find(x=>x.id===filter)?.label}</Text><Text style={s.listHeadingCount}>{visibleFrames.length} عنصر</Text></View>
        <View style={s.grid}>
        {visibleFrames.map(frame=>{
          const meta=FRAME_META[frame.code]||{icon:'✦',subtitle:'تصميم حصري',tone:C.purple,tag:tierName(frame.tier)};
          const isOwned=owned.includes(frame.code), isVip=frame.vip_only&&vip, isSelected=selected===frame.code;
          const locked=frame.vip_only&&!isOwned&&!vip;
          const price=Number(frame.coin_cost||0)===0?'مجاني':frame.vip_only&&!isOwned&&!vip?'VIP حصري':isOwned?'مملوك لك':fmt(frame.coin_cost)+' كوينز';
          return <View key={frame.code} style={[s.card,{borderColor:isSelected?meta.tone:'#382C49'}]}>
            <View style={[s.cardTop,{backgroundColor:meta.tone+'18'}]}>
              <View style={[s.tierPill,{borderColor:meta.tone}]}><Text style={[s.tierText,{color:meta.tone}]}>{meta.tag}</Text></View>
              {isSelected&&<View style={s.activePill}><Text style={s.activePillText}>✓ مركب</Text></View>}
              <View style={s.frameStage}>
                <View style={[s.stageHalo,{borderColor:meta.tone+'66',shadowColor:meta.tone}]}/>
                <ProfileFrame frameCode={frame.code} size={104}>
                  {avatar?<Image source={{uri:avatar}} style={{width:'100%',height:'100%'}} resizeMode="cover"/>:<View style={s.avatarFallback}><Text style={{fontSize:38}}>👤</Text></View>}
                </ProfileFrame>
                <Text style={s.frameIcon}>{meta.icon}</Text>
              </View>
            </View>
            <View style={s.cardInfo}>
              <Text style={s.name}>{frame.name}</Text>
              <Text style={s.description}>{meta.subtitle}</Text>
              <View style={s.priceLine}><Text style={s.price}>{price}</Text><Text style={s.priceIcon}>{locked?'🔒':isOwned?'✓':'✦'}</Text></View>
              <TouchableOpacity disabled={!!busy||isSelected} onPress={()=>choose(frame)} style={[s.action,isSelected&&s.active,locked&&s.locked]}>
                {busy===frame.code?<ActivityIndicator color={C.white}/>:<Text style={s.actionText}>{isSelected?'مفعّل الآن':isOwned||isVip?'تفعيل المظهر':locked?'عضوية VIP':'اقتناء وتفعيل'}</Text>}
              </TouchableOpacity>
            </View>
          </View>;
        })}
        </View>
        {!visibleFrames.length&&<Text style={s.empty}>لا توجد مقتنيات في هذه المجموعة حاليًا.</Text>}
        <Text style={s.note}>جرّب المعاينة أولًا. الشراء لا يتم إلا بعد تأكيدك، والإطار الذي تملكه يمكنك تغييره مجانًا في أي وقت.</Text>
      </ScrollView>
    </> : <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
      <View style={s.listHeading}><Text style={s.listHeadingTitle}>ألقاب YOYO الحصرية</Text><Text style={s.listHeadingCount}>{titles.length} لقب</Text></View>
      <View style={s.grid}>
        {titles.map(title=>{
          const hasIt=ownedTitles.includes(title.id), active=selectedTitle===title.item_code;
          const tone=({title_star:'#A9B7C9',title_lion:'#D69A48',title_legend:'#E46B45',title_royal:'#F5C451',title_diamond:'#7DDCF5',title_emperor:'#C19BFF'}[title.item_code]||C.purple);
          return <View key={title.id} style={[s.titleCard,{borderColor:active?tone:'#382C49'}]}>
            <View style={[s.titleStage,{borderColor:tone+'66'}]}>
              <Text style={{fontSize:42}}>{title.emoji}</Text>
              <TitleBadge code={title.item_code} title={title.name} emoji={title.emoji}/>
              {active&&<Text style={{color:'#8EF0C4',fontSize:9,fontWeight:'900',marginTop:7}}>✓ لقبك الحالي</Text>}
            </View>
            <Text style={s.titleName}>{title.name}</Text>
            <Text style={s.description}>{(title.description || 'لقب حصري لأعضاء YOYO')}</Text>
            <Text style={s.titlePrice}>{hasIt?'مملوك لك':fmt(title.coin_cost)+' كوينز'}</Text>
            <TouchableOpacity disabled={!!busy||active} onPress={()=>chooseTitle(title)} style={[s.action,active&&s.active]}>
              {busy==='title:'+title.item_code?<ActivityIndicator color={C.white}/>:<Text style={s.actionText}>{active?'مفعّل الآن':hasIt?'تفعيل اللقب':'شراء وتفعيل'}</Text>}
            </TouchableOpacity>
          </View>;
        })}
      </View>
      {selectedTitle&&<TouchableOpacity disabled={!!busy} onPress={clearTitle} style={s.clearTitle}><Text style={s.clearTitleText}>إخفاء اللقب الحالي</Text></TouchableOpacity>}
      {!titles.length&&<Text style={s.empty}>الألقاب غير متاحة حاليًا.</Text>}
      <Text style={s.note}>كل لقب تشتريه يظل ملكك، ويمكنك تغييره أو إخفاؤه مجانًا. سيظهر بجوار اسمك في ملفك والشات والبث المباشر.</Text>
    </ScrollView>}
  </SafeAreaView>;
}

const s=StyleSheet.create({
 root:{flex:1,backgroundColor:C.bg,paddingTop:8},
 header:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:10,paddingBottom:14,gap:12},
 back:{paddingVertical:10,paddingHorizontal:12,backgroundColor:C.card,borderRadius:12,borderWidth:1,borderColor:'#3C3150'},backText:{color:C.white,fontWeight:'900'},
 title:{color:C.white,fontSize:17,fontWeight:'900',letterSpacing:1.2},sub:{color:C.muted,fontSize:12,marginTop:4},
 balance:{marginHorizontal:16,marginBottom:12,padding:14,borderRadius:16,backgroundColor:'#171222',borderWidth:1,borderColor:'#4A3A63',flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 balanceLabel:{color:C.muted,fontSize:10,fontWeight:'700'},balanceText:{color:C.gold,fontWeight:'900',fontSize:15,marginTop:3},
 charge:{backgroundColor:'#302044',paddingVertical:10,paddingHorizontal:13,borderRadius:11,borderWidth:1,borderColor:'#7950A5'},chargeText:{color:'#DCC7FF',fontWeight:'900',fontSize:11},
 hero:{marginHorizontal:16,marginBottom:17,minHeight:160,borderRadius:22,backgroundColor:'#1B1230',borderWidth:1,borderColor:'#69428D',padding:16,flexDirection:'row',alignItems:'center',overflow:'hidden'},
 heroCopy:{flex:1,alignItems:'flex-end',paddingLeft:8},heroEyebrow:{color:'#C6A5FF',fontSize:8,fontWeight:'900',letterSpacing:1.1},heroTitle:{color:C.white,fontSize:20,fontWeight:'900',marginTop:7},heroText:{color:'#C6BBD3',fontSize:10,lineHeight:17,textAlign:'right',marginTop:6},heroCount:{color:C.gold,fontSize:10,fontWeight:'900',marginTop:9},
 heroAvatar:{width:112,alignItems:'center',justifyContent:'center'},heroCaption:{color:'#D4C2F1',fontSize:9,fontWeight:'800',marginTop:8},heroSpark:{position:'absolute',top:8,left:14,color:C.gold,fontSize:24},
 sectionHead:{marginHorizontal:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},sectionTitle:{color:C.white,fontSize:15,fontWeight:'900'},sectionHint:{color:C.muted,fontSize:10},
 filters:{paddingHorizontal:16,paddingVertical:11,gap:8},filter:{paddingVertical:9,paddingHorizontal:16,borderRadius:14,backgroundColor:C.card2,borderWidth:1,borderColor:'#342943'},filterActive:{backgroundColor:'#4B2C68',borderColor:'#B58AF6'},filterText:{color:C.muted,fontWeight:'800',fontSize:11},filterTextActive:{color:C.white},
 storeTabs:{flexDirection:'row',marginHorizontal:16,marginBottom:12,padding:4,borderRadius:14,backgroundColor:C.card,borderWidth:1,borderColor:'#3C3150'},storeTab:{flex:1,paddingVertical:11,alignItems:'center',borderRadius:11},storeTabActive:{backgroundColor:'#4B2C68',borderWidth:1,borderColor:'#A77BE8'},storeTabText:{color:C.muted,fontSize:11,fontWeight:'900'},storeTabTextActive:{color:C.white},
 list:{paddingHorizontal:14,paddingBottom:30},listHeading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10},listHeadingTitle:{color:'#E9DDF8',fontSize:13,fontWeight:'900'},listHeadingCount:{color:C.muted,fontSize:10},
 grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:12},titleCard:{width:'48.5%',backgroundColor:C.card,borderRadius:18,borderWidth:1,padding:12,alignItems:'center'},titleStage:{width:'100%',minHeight:118,borderRadius:14,backgroundColor:'#21182F',borderWidth:1,alignItems:'center',justifyContent:'center',padding:10},titleName:{color:C.white,fontWeight:'900',fontSize:14,marginTop:10},titlePrice:{color:C.gold,fontSize:11,fontWeight:'900',marginTop:10},clearTitle:{alignSelf:'center',marginTop:18,padding:12,borderRadius:10,backgroundColor:'#33243D',borderWidth:1,borderColor:'#7950A5'},clearTitleText:{color:'#E7D4FF',fontWeight:'900',fontSize:11},card:{width:'48.5%',backgroundColor:C.card,borderRadius:18,borderWidth:1,overflow:'hidden'},cardTop:{height:160,alignItems:'center',justifyContent:'center',position:'relative'},tierPill:{position:'absolute',top:10,right:10,paddingHorizontal:8,paddingVertical:4,borderRadius:8,borderWidth:1,backgroundColor:'#120D1D'},tierText:{fontSize:9,fontWeight:'900'},activePill:{position:'absolute',top:10,left:10,paddingHorizontal:7,paddingVertical:4,borderRadius:8,backgroundColor:'#194C3D'},activePillText:{color:'#8EF0C4',fontSize:8,fontWeight:'900'},
 frameStage:{width:126,height:126,alignItems:'center',justifyContent:'center'},stageHalo:{position:'absolute',width:116,height:116,borderRadius:58,borderWidth:2,shadowOpacity:0.8,shadowRadius:18,elevation:8},frameIcon:{position:'absolute',right:0,bottom:4,fontSize:22,textShadowColor:'#000',textShadowRadius:8},
 cardInfo:{padding:11},name:{color:C.white,fontWeight:'900',fontSize:12,textAlign:'right'},description:{color:C.muted,fontSize:9,textAlign:'right',marginTop:4,minHeight:14},priceLine:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:10},price:{color:C.gold,fontSize:10,fontWeight:'900'},priceIcon:{color:'#C8A8FF',fontSize:13},
 action:{marginTop:10,paddingVertical:10,borderRadius:10,backgroundColor:C.purple,alignItems:'center'},active:{backgroundColor:'#194C3D'},locked:{backgroundColor:'#40334B'},actionText:{color:C.white,fontWeight:'900',fontSize:10},
 avatarFallback:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#241B35'},empty:{color:C.muted,textAlign:'center',padding:24},note:{width:'100%',color:C.muted,fontSize:10,textAlign:'center',padding:16,lineHeight:18}
});
