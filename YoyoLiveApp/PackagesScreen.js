import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';

const C = { bg:'#0B0912', card:'#191424', card2:'#241B35', pink:'#F34E9B', gold:'#F5C451', white:'#FFFFFF', muted:'#AAA1B8', border:'#3B304B' };

export default function PackagesScreen({ userId, onBack }) {
  const [packages,setPackages] = useState([]);
  const [settings,setSettings] = useState(null);
  const [selected,setSelected] = useState(null);
  const [method,setMethod] = useState('vodafone_cash');
  const [reference,setReference] = useState('');
  const [loading,setLoading] = useState(true);
  const [sending,setSending] = useState(false);
  const [error,setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [{data: packageRows,error: packageError},{data: paymentData,error: paymentError}] = await Promise.all([
      supabase.from('coin_packages').select('id,name,price_egp,coins,bonus_coins').eq('active',true).order('sort_order',{ascending:true}),
      supabase.from('yoyo_payment_settings').select('vodafone_cash_number,instapay_identifier,bank_name,bank_account_name,bank_account_number').eq('id',true).maybeSingle(),
    ]);
    if (packageError) setError('تعذر تحميل الباقات. حاول تحديث الصفحة.');
    else { setPackages(packageRows || []); setSelected(current => current && (packageRows || []).some(item=>item.id===current.id) ? current : (packageRows || [])[0] || null); }
    if (paymentError) console.warn('YOYO payment settings:',paymentError.message);
    setSettings(paymentData || null);
    setLoading(false);
  },[]);

  useEffect(()=>{load();},[load]);

  const submitRequest = async () => {
    if (!selected || !userId || sending) return;
    if (reference.trim().length < 4) {
      Alert.alert('رقم التحويل مطلوب','اكتب الرقم المرجعي للتحويل بعد إتمام الدفع.');
      return;
    }
    const methodValue = method;
    if (methodValue === 'vodafone_cash' && !settings?.vodafone_cash_number) return Alert.alert('وسيلة الدفع غير متاحة','الأدمن لم يضف رقم فودافون كاش بعد.');
    if (methodValue === 'instapay' && !settings?.instapay_identifier) return Alert.alert('وسيلة الدفع غير متاحة','الأدمن لم يضف بيانات InstaPay بعد.');
    if (methodValue === 'bank_transfer' && !settings?.bank_account_number) return Alert.alert('وسيلة الدفع غير متاحة','الأدمن لم يضف الحساب البنكي بعد.');
    Alert.alert('تأكيد طلب الشحن','تأكد أنك حولت المبلغ إلى بيانات الحساب الظاهرة، ثم أرسل الطلب للمراجعة. لن تضاف العملات إلا بعد مراجعة الأدمن.',[
      {text:'رجوع',style:'cancel'},
      {text:'إرسال للمراجعة',onPress:async()=>{
        setSending(true);
        const {error: insertError}=await supabase.from('coin_purchase_requests').insert({
          user_id:userId,
          requested_amount_egp:Number(selected.price_egp),
          requested_coins:Number(selected.coins)+Number(selected.bonus_coins||0),
          payment_method:methodValue,
          transfer_reference:reference.trim(),
          status:'pending',
        });
        setSending(false);
        if(insertError){Alert.alert('تعذر إرسال الطلب',insertError.message || 'حاول مرة أخرى.');return;}
        setReference('');
        Alert.alert('تم استلام الطلب','طلبك قيد المراجعة. ستضاف العملات بعد التحقق من وصول التحويل.');
      }},
    ]);
  };

  const paymentValue = method==='vodafone_cash' ? settings?.vodafone_cash_number :
    method==='instapay' ? settings?.instapay_identifier :
    [settings?.bank_name,settings?.bank_account_name,settings?.bank_account_number].filter(Boolean).join('\n');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>رجوع ←</Text></TouchableOpacity>
        <Text style={styles.title}>باقات YOYO 🪙</Text>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={C.gold} size="large"/><Text style={styles.muted}>جارٍ تحميل الباقات...</Text></View> : (
        <ScrollView contentContainerStyle={styles.content}>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Text style={styles.heading}>اختار باقتك</Text>
          <Text style={styles.muted}>العملات تُضاف بعد مراجعة التحويل واعتماد الطلب من الإدارة.</Text>
          {packages.length===0 ? <View style={styles.card}><Text style={styles.empty}>لا توجد باقات مفعّلة حاليًا.</Text><Text style={styles.muted}>سيتم عرض الباقات هنا بمجرد أن يضيف الأدمن الأسعار المعتمدة ويفعّلها.</Text></View> :
            packages.map(item=>(
              <TouchableOpacity key={item.id} onPress={()=>setSelected(item)} style={[styles.packageCard,selected?.id===item.id&&styles.packageSelected]}>
                <View style={styles.packageTop}><Text style={styles.price}>{Number(item.price_egp).toLocaleString('ar-EG')} ج.م</Text><Text style={styles.packageName}>{item.name}</Text></View>
                <Text style={styles.coins}>🪙 {(Number(item.coins)+Number(item.bonus_coins||0)).toLocaleString('ar-EG')} عملة</Text>
                {Number(item.bonus_coins)>0&&<Text style={styles.bonus}>تشمل {Number(item.bonus_coins).toLocaleString('ar-EG')} عملة إضافية</Text>}
                {selected?.id===item.id&&<Text style={styles.selected}>✓ الباقة المختارة</Text>}
              </TouchableOpacity>
            ))
          }
          {packages.length>0&&<>
            <Text style={styles.heading}>طريقة الدفع</Text>
            <View style={styles.methods}>
              {[
                ['vodafone_cash','فودافون كاش'],
                ['instapay','InstaPay'],
                ['bank_transfer','تحويل بنكي'],
              ].map(([id,label])=><TouchableOpacity key={id} onPress={()=>setMethod(id)} style={[styles.method,method===id&&styles.methodActive]}><Text style={styles.methodText}>{label}</Text></TouchableOpacity>)}
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>بيانات التحويل</Text>
              <Text selectable style={styles.paymentValue}>{paymentValue || 'بيانات وسيلة الدفع لم يضفها الأدمن بعد.'}</Text>
              <Text style={styles.hint}>حوّل قيمة الباقة المختارة فقط، واحتفظ بإيصال التحويل حتى تنتهي المراجعة.</Text>
            </View>
            <Text style={styles.heading}>رقم العملية</Text>
            <TextInput value={reference} onChangeText={setReference} placeholder="اكتب الرقم المرجعي للتحويل" placeholderTextColor="#8F849F" style={styles.input} autoCapitalize="none"/>
            <TouchableOpacity disabled={sending||!selected} onPress={submitRequest} style={[styles.submit,(sending||!selected)&&{opacity:0.6}]}><Text style={styles.submitText}>{sending?'جارٍ إرسال الطلب...':'تم التحويل — إرسال طلب الشحن'}</Text></TouchableOpacity>
          </>}
          <Text style={styles.footer}>لا يتم إضافة العملات تلقائيًا. كل طلب يراجعه الأدمن ويتحقق من وصول المبلغ أولًا.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:C.bg},header:{padding:17,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:C.border},
 title:{color:C.white,fontSize:21,fontWeight:'900'},back:{color:C.pink,fontWeight:'bold'},content:{padding:16,paddingBottom:36},center:{flex:1,alignItems:'center',justifyContent:'center',gap:12},
 heading:{color:C.white,fontSize:18,fontWeight:'900',textAlign:'right',marginTop:18,marginBottom:8},muted:{color:C.muted,textAlign:'right',fontSize:12,lineHeight:20},
 packageCard:{backgroundColor:C.card,borderRadius:16,borderWidth:1,borderColor:C.border,padding:15,marginTop:10},packageSelected:{borderColor:C.gold,backgroundColor:'#241B31'},
 packageTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},packageName:{color:C.white,fontWeight:'bold',fontSize:16},price:{color:C.gold,fontWeight:'900',fontSize:18},
 coins:{color:C.white,fontSize:18,fontWeight:'900',textAlign:'right',marginTop:10},bonus:{color:'#8FE0B0',textAlign:'right',marginTop:5},selected:{color:C.gold,textAlign:'right',fontWeight:'bold',marginTop:8},
 methods:{flexDirection:'row',gap:8,flexWrap:'wrap',justifyContent:'flex-end'},method:{padding:11,borderRadius:12,backgroundColor:C.card2,borderWidth:1,borderColor:C.border},methodActive:{borderColor:C.gold,backgroundColor:'#3A2B44'},methodText:{color:C.white,fontWeight:'bold'},
 card:{backgroundColor:C.card,borderRadius:14,padding:15,marginTop:12,borderWidth:1,borderColor:C.border},cardTitle:{color:C.gold,fontWeight:'900',textAlign:'right',marginBottom:9},paymentValue:{color:C.white,fontWeight:'bold',textAlign:'right',fontSize:16,lineHeight:26},hint:{color:C.muted,textAlign:'right',fontSize:11,lineHeight:18,marginTop:9},
 input:{backgroundColor:C.card,color:C.white,borderWidth:1,borderColor:C.border,borderRadius:12,padding:13,textAlign:'right'},submit:{backgroundColor:C.pink,borderRadius:13,padding:15,alignItems:'center',marginTop:15},submitText:{color:C.white,fontWeight:'900'},footer:{color:C.muted,textAlign:'center',fontSize:11,lineHeight:19,marginTop:18},empty:{color:C.white,textAlign:'center',fontWeight:'bold',marginBottom:8},error:{color:'#FF8585',textAlign:'right'}
});
