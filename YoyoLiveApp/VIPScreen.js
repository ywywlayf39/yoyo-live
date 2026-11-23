import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';

const C = { bg:'#0B0912', card:'#191424', card2:'#241B35', pink:'#F34E9B', gold:'#F5C451', white:'#FFFFFF', muted:'#AAA1B8', border:'#3B304B' };
const statusText = { pending:'طلبك قيد المراجعة', reviewing:'الأدمن بيراجع طلبك', approved:'تم تفعيل VIP', rejected:'تم رفض الطلب' };

export default function VIPScreen({ userId, onBack }) {
  const [plan,setPlan] = useState(null);
  const [settings,setSettings] = useState(null);
  const [subscription,setSubscription] = useState(null);
  const [request,setRequest] = useState(null);
  const [method,setMethod] = useState('vodafone_cash');
  const [reference,setReference] = useState('');
  const [loading,setLoading] = useState(true);
  const [sending,setSending] = useState(false);
  const [error,setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [planResult,settingsResult,subscriptionResult,requestResult] = await Promise.all([
      supabase.from('vip_plans').select('id,code,name,price_egp,duration_days,benefits').eq('code','vip_monthly').eq('active',true).maybeSingle(),
      supabase.from('yoyo_payment_settings').select('vodafone_cash_number,instapay_identifier,bank_name,bank_account_name,bank_account_number').eq('id',true).maybeSingle(),
      supabase.from('user_vip_subscriptions').select('status,starts_at,expires_at').eq('user_id',userId).maybeSingle(),
      supabase.from('vip_subscription_requests').select('id,status,amount_egp,created_at,admin_note').eq('user_id',userId).in('status',['pending','reviewing','rejected','approved']).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    ]);
    if (planResult.error) setError('تعذر تحميل باقة VIP. حاول مرة أخرى.');
    setPlan(planResult.data || null);
    setSettings(settingsResult.data || null);
    setSubscription(subscriptionResult.data || null);
    setRequest(requestResult.data || null);
    setLoading(false);
  },[userId]);

  useEffect(()=>{load();},[load]);

  const paymentValue = method==='vodafone_cash' ? settings?.vodafone_cash_number :
    method==='instapay' ? settings?.instapay_identifier :
    [settings?.bank_name,settings?.bank_account_name,settings?.bank_account_number].filter(Boolean).join('\n');

  const submit = () => {
    if (!plan || sending) return;
    if (reference.trim().length < 4) return Alert.alert('رقم التحويل مطلوب','اكتب الرقم المرجعي بعد إتمام التحويل.');
    if (!paymentValue) return Alert.alert('بيانات الدفع غير متاحة','الأدمن لم يضف بيانات وسيلة الدفع المختارة بعد.');
    Alert.alert('تأكيد طلب VIP','حوّل 200 جنيه فقط إلى بيانات الدفع الظاهرة. لن يتفعل VIP إلا بعد مراجعة الأدمن والتحقق من التحويل.',[
      {text:'رجوع',style:'cancel'},
      {text:'إرسال للمراجعة',onPress:async()=>{
        setSending(true);
        const {data,error:requestError}=await supabase.rpc('yoyo_create_vip_subscription_request',{
          p_plan_id:plan.id,p_payment_method:method,p_transfer_reference:reference.trim(),
        });
        setSending(false);
        if(requestError || !data) return Alert.alert('تعذر إرسال الطلب',requestError?.message || 'حاول مرة أخرى.');
        setReference('');
        await load();
        Alert.alert('تم استلام الطلب','طلب VIP وصل للأدمن للمراجعة. لن يتم التفعيل قبل اعتماد الدفع.');
      }},
    ]);
  };

  const active = subscription?.status==='active' && new Date(subscription.expires_at).getTime()>Date.now();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>رجوع ←</Text></TouchableOpacity>
        <Text style={styles.title}>عضوية VIP 👑</Text>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={C.gold} size="large"/><Text style={styles.muted}>جارٍ تحميل العضوية...</Text></View> : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {!!error && <Text style={styles.error}>{error}</Text>}
          {plan ? <View style={styles.hero}>
            <Text style={styles.crown}>👑</Text>
            <Text style={styles.planName}>VIP شهري</Text>
            <Text style={styles.price}>200 جنيه / 30 يوم</Text>
            {(plan.benefits || []).map((benefit,index)=><Text key={index} style={styles.benefit}>✦ {benefit}</Text>)}
          </View> : <View style={styles.card}><Text style={styles.empty}>باقة VIP غير متاحة حاليًا.</Text></View>}
          {active && <View style={styles.activeBox}>
            <Text style={styles.activeTitle}>عضويتك مفعّلة 👑</Text>
            <Text style={styles.muted}>تنتهي في: {new Date(subscription.expires_at).toLocaleDateString('ar-EG')}</Text>
          </View>}
          {!active && request && ['pending','reviewing'].includes(request.status) && <View style={styles.pendingBox}>
            <Text style={styles.pendingTitle}>{statusText[request.status]}</Text>
            <Text style={styles.muted}>تاريخ الطلب: {new Date(request.created_at).toLocaleString('ar-EG')}</Text>
            <Text style={styles.muted}>لا ترسل تحويلًا ثانيًا أثناء مراجعة الطلب.</Text>
          </View>}
          {plan && !active && !(request && ['pending','reviewing'].includes(request.status)) && <>
            <Text style={styles.heading}>طريقة الدفع اليدوي</Text>
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
              <Text style={styles.hint}>حوّل 200 جنيه فقط واحتفظ بإيصال التحويل حتى انتهاء المراجعة.</Text>
            </View>
            <Text style={styles.heading}>الرقم المرجعي للتحويل</Text>
            <TextInput value={reference} onChangeText={setReference} placeholder="اكتب رقم العملية" placeholderTextColor="#8F849F" style={styles.input} autoCapitalize="none"/>
            <TouchableOpacity disabled={sending} onPress={submit} style={[styles.submit,sending&&{opacity:0.6}]}><Text style={styles.submitText}>{sending?'جارٍ إرسال الطلب...':'إرسال طلب اشتراك VIP'}</Text></TouchableOpacity>
          </>}
          <Text style={styles.footer}>الاشتراك لا يتفعل تلقائيًا. يبدأ بعد مراجعة الأدمن واعتماد التحويل فقط.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:C.bg},header:{padding:17,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:C.border},
 title:{color:C.white,fontSize:21,fontWeight:'900'},back:{color:C.pink,fontWeight:'bold'},content:{padding:16,paddingBottom:52},center:{flex:1,alignItems:'center',justifyContent:'center',gap:12},
 hero:{backgroundColor:'#241B31',borderRadius:18,borderWidth:1,borderColor:C.gold,padding:20,alignItems:'center',marginTop:12},crown:{fontSize:42},planName:{color:C.gold,fontSize:24,fontWeight:'900',marginTop:8},price:{color:C.white,fontSize:20,fontWeight:'900',marginVertical:12},
 benefit:{color:'#E9E1F0',textAlign:'right',alignSelf:'stretch',marginTop:9,fontSize:13},heading:{color:C.white,fontSize:18,fontWeight:'900',textAlign:'right',marginTop:20,marginBottom:9},
 muted:{color:C.muted,textAlign:'right',fontSize:12,lineHeight:20},methods:{flexDirection:'row',gap:8,flexWrap:'wrap',justifyContent:'flex-end'},method:{padding:11,borderRadius:12,backgroundColor:C.card2,borderWidth:1,borderColor:C.border},methodActive:{borderColor:C.gold,backgroundColor:'#3A2B44'},methodText:{color:C.white,fontWeight:'bold'},
 card:{backgroundColor:C.card,borderRadius:14,padding:15,marginTop:12,borderWidth:1,borderColor:C.border},cardTitle:{color:C.gold,fontWeight:'900',textAlign:'right',marginBottom:9},paymentValue:{color:C.white,fontWeight:'bold',textAlign:'right',fontSize:16,lineHeight:26},hint:{color:C.muted,textAlign:'right',fontSize:11,lineHeight:18,marginTop:9},
 input:{backgroundColor:C.card,color:C.white,borderWidth:1,borderColor:C.border,borderRadius:12,padding:13,textAlign:'right'},submit:{backgroundColor:C.pink,borderRadius:13,padding:15,alignItems:'center',marginTop:15},submitText:{color:C.white,fontWeight:'900'},
 pendingBox:{backgroundColor:'#302719',borderWidth:1,borderColor:C.gold,borderRadius:13,padding:14,marginTop:16},pendingTitle:{color:C.gold,fontWeight:'900',textAlign:'right',marginBottom:7},activeBox:{backgroundColor:'#173B2A',borderRadius:13,padding:14,marginTop:16},activeTitle:{color:'#8FE0B0',fontWeight:'900',textAlign:'right',marginBottom:7},
 footer:{color:C.muted,textAlign:'center',fontSize:11,lineHeight:19,marginTop:18},empty:{color:C.white,textAlign:'center',fontWeight:'bold'},error:{color:'#FF8585',textAlign:'right'}
});
