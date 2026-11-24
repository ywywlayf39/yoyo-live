import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { supabase } from './supabase';
import * as ImagePicker from 'expo-image-picker';

const C = {
  bg:'#0B0912', card:'#191424', card2:'#241B35',
  pink:'#F34E9B', gold:'#F5C451', white:'#FFFFFF',
  muted:'#AAA1B8', border:'#3B304B',
};
const statusText = {
  pending:'طلبك قيد المراجعة',
  reviewing:'الأدمن بيراجع طلبك',
  approved:'تم تفعيل VIP',
  rejected:'تم رفض الطلب',
};

export default function VIPScreen({ userId, onBack }) {
  const [plan,setPlan] = useState(null);
  const [settings,setSettings] = useState(null);
  const [subscription,setSubscription] = useState(null);
  const [request,setRequest] = useState(null);
  const [method,setMethod] = useState('vodafone_cash');
  const [proof,setProof] = useState(null);
  const [loading,setLoading] = useState(true);
  const [sending,setSending] = useState(false);
  const [error,setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [planResult,settingsResult,subscriptionResult,requestResult] = await Promise.all([
        supabase.from('vip_plans').select('id,code,name,price_egp,duration_days,benefits').eq('code','vip_monthly').eq('active',true).maybeSingle(),
        supabase.from('yoyo_payment_settings').select('vodafone_cash_number,instapay_identifier,bank_name,bank_account_name,bank_account_number').eq('id',true).maybeSingle(),
        supabase.from('user_vip_subscriptions').select('status,starts_at,expires_at').eq('user_id',userId).maybeSingle(),
        supabase.from('vip_subscription_requests').select('id,status,amount_egp,created_at,admin_note').eq('user_id',userId).in('status',['pending','reviewing','rejected','approved']).order('created_at',{ascending:false}).limit(1).maybeSingle(),
      ]);
      if (planResult.error) throw planResult.error;
      if (settingsResult.error) console.warn('VIP payment settings:', settingsResult.error.message);
      if (subscriptionResult.error) console.warn('VIP subscription:', subscriptionResult.error.message);
      if (requestResult.error) console.warn('VIP request:', requestResult.error.message);
      setPlan(planResult.data || null);
      setSettings(settingsResult.data || null);
      setSubscription(subscriptionResult.data || null);
      setRequest(requestResult.data || null);
    } catch(e) {
      setError(e?.message || 'تعذر تحميل باقة VIP. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  },[userId]);

  useEffect(()=>{load();},[load]);

  const paymentValue = method==='vodafone_cash'
    ? settings?.vodafone_cash_number : settings?.instapay_identifier;

  const chooseProof = async () => {
    try {
      const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
      if(!permission.granted) return Alert.alert('إذن الصور مطلوب','اسمح للتطبيق بالوصول إلى الصور لاختيار إيصال التحويل.');
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:false,quality:0.85});
      if(!result.canceled && result.assets?.[0]){
        const asset=result.assets[0];
        if(asset.fileSize && asset.fileSize>5*1024*1024) return Alert.alert('الصورة كبيرة','اختر صورة لا يزيد حجمها عن 5 ميجابايت.');
        setProof(asset);
      }
    } catch(e) {
      Alert.alert('تعذر اختيار الصورة',e?.message||'حاول مرة أخرى.');
    }
  };

  const submit = () => {
    if (!plan || !userId || sending) return;
    if (!proof?.uri) return Alert.alert('صورة التحويل مطلوبة','اختار سكرين شوت التحويل أولًا.');
    if (!paymentValue) return Alert.alert('بيانات الدفع غير متاحة','الأدمن لم يضف بيانات وسيلة الدفع المختارة بعد.');
    Alert.alert('تأكيد طلب VIP','ارفع صورة إيصال التحويل. لن يتفعل VIP إلا بعد مراجعة الأدمن والتحقق من التحويل.',[
      {text:'رجوع',style:'cancel'},
      {text:'إرسال للمراجعة',onPress:async()=>{
        setSending(true);
        let path=null;
        try {
          const ext=(proof.fileName||proof.uri.split('.').pop()||'jpg').split('.').pop().toLowerCase();
          const mime=proof.mimeType || (ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg');
          path=userId+'/'+Date.now()+'.'+(mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg');
          const response=await fetch(proof.uri);
          if(!response.ok) throw new Error('تعذر قراءة صورة الإيصال من الهاتف.');
          const bytes=await response.arrayBuffer();
          const imageBlob=new Blob([bytes],{type:mime});
          const {error:uploadError}=await supabase.storage.from('payment-proofs').upload(path,imageBlob,{contentType:mime,upsert:false});
          if(uploadError) throw uploadError;
          const {data,error:requestError}=await supabase.rpc('yoyo_create_vip_subscription_request',{
            p_plan_id:plan.id,p_payment_method:method,p_transfer_reference:'proof-upload',p_proof_storage_path:path,
          });
          if(requestError || !data) throw requestError || new Error('تعذر إنشاء طلب VIP.');
          setProof(null);
          await load();
          Alert.alert('تم استلام الطلب','وصلت صورة التحويل للأدمن. لن يتفعل VIP قبل اعتماد الدفع.');
        } catch(e) {
          if(path) await supabase.storage.from('payment-proofs').remove([path]);
          Alert.alert('تعذر إرسال الطلب',e?.message||'حاول مرة أخرى.');
        } finally {setSending(false);}
      }},
    ]);
  };

  const benefits = Array.isArray(plan?.benefits)
    ? plan.benefits
    : typeof plan?.benefits === 'string'
      ? plan.benefits.split(/[\n,،]/).map(x=>x.trim()).filter(Boolean)
      : [];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>رجوع ←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>عضوية VIP 👑</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.pink}/>
          <Text style={styles.muted}>جارٍ تحميل تفاصيل VIP...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <TouchableOpacity style={styles.refreshButton} onPress={load} disabled={sending}>
            <Text style={styles.refreshText}>تحديث البيانات ↻</Text>
          </TouchableOpacity>

          {!!error && <View style={styles.noticeCard}><Text style={styles.error}>{error}</Text></View>}

          <View style={styles.hero}>
            <Text style={styles.crown}>👑</Text>
            <Text style={styles.heroTitle}>{plan?.name || 'عضوية YOYO VIP'}</Text>
            {plan ? (
              <>
                <Text style={styles.price}>{Number(plan.price_egp).toLocaleString('ar-EG')} جنيه</Text>
                <Text style={styles.muted}>لمدة {Number(plan.duration_days || 30).toLocaleString('ar-EG')} يوم</Text>
              </>
            ) : (
              <Text style={styles.muted}>باقة VIP غير متاحة حاليًا. يرجى مراجعة الأدمن.</Text>
            )}
          </View>

          {benefits.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>مميزات العضوية</Text>
              {benefits.map((item,index)=>(
                <Text key={index} style={styles.benefit}>✓ {String(item)}</Text>
              ))}
            </View>
          )}

          {subscription?.status === 'active' && (
            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>👑 عضويتك مفعّلة</Text>
              <Text style={styles.muted}>تنتهي في: {subscription.expires_at ? new Date(subscription.expires_at).toLocaleDateString('ar-EG') : 'غير محدد'}</Text>
            </View>
          )}

          {request && (
            <View style={styles.statusCard}>
              <Text style={styles.sectionTitle}>آخر طلب اشتراك</Text>
              <Text style={styles.statusTitle}>{statusText[request.status] || request.status}</Text>
              {!!request.admin_note && <Text style={styles.muted}>ملاحظة الأدمن: {request.admin_note}</Text>}
              <Text style={styles.muted}>تاريخ الطلب: {request.created_at ? new Date(request.created_at).toLocaleDateString('ar-EG') : '—'}</Text>
            </View>
          )}

          {!!plan && subscription?.status !== 'active' && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>طريقة الدفع</Text>
              <View style={styles.methodRow}>
                {[
                  ['vodafone_cash','فودافون كاش'],
                  ['instapay','InstaPay'],
                ].map(([value,label])=>(
                  <TouchableOpacity key={value} onPress={()=>setMethod(value)}
                    style={[styles.methodChip,method===value && styles.methodChipActive]}>
                    <Text style={styles.methodText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>حوّل إلى:</Text>
              <View style={styles.paymentDetails}>
                <Text style={styles.paymentValue}>{paymentValue || 'بيانات الدفع لم يضفها الأدمن بعد'}</Text>
              </View>
              <Text style={styles.label}>صورة إيصال التحويل</Text>
              <TouchableOpacity style={styles.uploadButton} onPress={chooseProof} disabled={sending}>
                <Text style={styles.uploadText}>{proof ? 'اختيار صورة أخرى' : '📷 اختيار صورة الإيصال'}</Text>
              </TouchableOpacity>
              {proof?.uri ? (
                <View style={styles.proofBox}>
                  <Image source={{uri:proof.uri}} style={styles.proofImage} resizeMode="contain"/>
                  <Text style={styles.muted}>{proof.fileName || 'صورة الإيصال جاهزة'}</Text>
                  <TouchableOpacity onPress={()=>setProof(null)}><Text style={styles.removeProof}>إزالة الصورة</Text></TouchableOpacity>
                </View>
              ) : <Text style={styles.muted}>صورة JPG أو PNG أو WebP، بحد أقصى 5 ميجابايت.</Text>}
              <TouchableOpacity style={[styles.primaryButton,(!paymentValue || !proof || sending) && styles.disabledButton]}
                onPress={submit} disabled={!paymentValue || !proof || sending}>
                {sending ? <ActivityIndicator color={C.white}/> : <Text style={styles.buttonText}>إرسال طلب VIP للمراجعة</Text>}
              </TouchableOpacity>
              <Text style={styles.disclaimer}>لن يتم تفعيل VIP قبل تأكيد وصول المبلغ واعتماد الأدمن للطلب.</Text>
            </View>
          )}

          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>تنبيه</Text>
            <Text style={styles.muted}>لا ترسل صورة إيصال غير صحيحة أو تستخدم نفس التحويل لأكثر من طلب. احتفظ بالإيصال حتى انتهاء المراجعة.</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},
  header:{paddingHorizontal:18,paddingVertical:15,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:C.border},
  title:{color:C.white,fontSize:21,fontWeight:'900'},
  backButton:{padding:8},
  backText:{color:C.pink,fontWeight:'bold'},
  content:{padding:16,paddingBottom:36,gap:13},
  center:{flex:1,alignItems:'center',justifyContent:'center',gap:12},
  muted:{color:C.muted,fontSize:13,lineHeight:21,textAlign:'right'},
  refreshButton:{alignSelf:'flex-start',backgroundColor:C.card2,paddingHorizontal:14,paddingVertical:9,borderRadius:12},
  refreshText:{color:C.white,fontWeight:'bold'},
  hero:{backgroundColor:'#35233F',borderRadius:20,padding:22,alignItems:'center',gap:7,borderWidth:1,borderColor:C.gold},
  crown:{fontSize:42},
  heroTitle:{color:C.white,fontSize:23,fontWeight:'900'},
  price:{color:C.gold,fontSize:29,fontWeight:'900'},
  card:{backgroundColor:C.card,borderRadius:17,padding:16,borderWidth:1,borderColor:C.border,gap:12},
  sectionTitle:{color:C.white,fontSize:17,fontWeight:'900',textAlign:'right'},
  benefit:{color:'#E9E1F1',fontSize:14,textAlign:'right',lineHeight:23},
  statusCard:{backgroundColor:C.card,borderRadius:16,padding:16,borderWidth:1,borderColor:C.gold,gap:8},
  statusTitle:{color:C.gold,fontSize:16,fontWeight:'900',textAlign:'right'},
  methodRow:{flexDirection:'row',justifyContent:'flex-end',flexWrap:'wrap',gap:8},
  methodChip:{paddingHorizontal:14,paddingVertical:11,borderRadius:12,backgroundColor:C.card2,borderWidth:1,borderColor:C.border},
  methodChipActive:{borderColor:C.gold,backgroundColor:'#4B3B1D'},
  methodText:{color:C.white,fontWeight:'800'},
  label:{color:'#D6CBE5',fontSize:13,fontWeight:'700',textAlign:'right'},
  paymentDetails:{backgroundColor:C.card2,borderRadius:12,padding:13,borderWidth:1,borderColor:C.border},
  paymentValue:{color:C.white,fontSize:16,fontWeight:'800',textAlign:'right'},
  uploadButton:{backgroundColor:C.card2,borderRadius:12,padding:14,alignItems:'center',borderWidth:1,borderColor:C.pink},
  uploadText:{color:C.white,fontWeight:'900'},
  proofBox:{alignItems:'center',gap:7},
  proofImage:{width:'100%',height:190,borderRadius:12,backgroundColor:C.card2},
  removeProof:{color:'#FF8585',fontWeight:'800',padding:5},
  primaryButton:{backgroundColor:C.pink,borderRadius:12,padding:14,alignItems:'center',minHeight:48,justifyContent:'center'},
  buttonText:{color:C.white,fontWeight:'900',fontSize:15},
  disabledButton:{opacity:0.45},
  disclaimer:{color:C.muted,fontSize:12,textAlign:'center',lineHeight:19},
  noticeCard:{backgroundColor:C.card,borderRadius:16,padding:16,borderWidth:1,borderColor:C.border,gap:8},
  noticeTitle:{color:C.gold,fontWeight:'900',textAlign:'right'},
  error:{color:'#FF8585',textAlign:'right',lineHeight:21},
});
