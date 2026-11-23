import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';
import * as ImagePicker from 'expo-image-picker';

const C = { bg:'#0B0912', card:'#191424', card2:'#241B35', pink:'#F34E9B', gold:'#F5C451', white:'#FFFFFF', muted:'#AAA1B8', border:'#3B304B' };
const statusText = { pending:'طلبك قيد المراجعة', reviewing:'الأدمن بيراجع طلبك', approved:'تم تفعيل VIP', rejected:'تم رفض الطلب' };

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

  const chooseProof = async () => {
    const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(!permission.granted) return Alert.alert('إذن الصور مطلوب','اسمح للتطبيق بالوصول إلى الصور لاختيار إيصال التحويل.');
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:false,quality:0.85});
    if(!result.canceled && result.assets?.[0]){
      const asset=result.assets[0];
      if(asset.fileSize && asset.fileSize>5*1024*1024) return Alert.alert('الصورة كبيرة','اختر صورة لا يزيد حجمها عن 5 ميجابايت.');
      setProof(asset);
    }
  };

  const submit = () => {
    if (!plan || sending) return;
    if (!proof?.uri) return Alert.alert('صورة التحويل مطلوبة','اختار سكرين شوت التحويل أولًا.');
    if (!paymentValue) return Alert.alert('بيانات الدفع غير متاحة','الأدمن لم يضف بيانات وسيلة الدفع المختارة بعد.');
    Alert.alert('تأكيد طلب VIP','ارفع صورة إيصال تحويل 200 جنيه. لن يتفعل VIP إلا بعد مراجعة الأدمن والتحقق من التحويل.',[
      {text:'رجوع',style:'cancel'},
      {text:'إرسال للمراجعة',onPress:async()=>{
        setSending(true);
        try {
          const ext=(proof.fileName||proof.uri.split('.').pop()||'jpg').split('.').pop().toLowerCase();
          const mime=proof.mimeType || (ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg');
          const path=userId+'/'+Date.now()+'.'+(mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg');
          const response=await fetch(proof.uri);
          const blob=await response.blob();
          const {error:uploadError}=await supabase.storage.from('payment-proofs').upload(path,blob,{contentType:mime,upsert:false});
          if(uploadError) throw uploadError;
          const {data,error:requestError}=await supabase.rpc('yoyo_create_vip_subscription_request',{
            p_plan_id:plan.id,p_payment_method:method,p_transfer_reference:'proof-upload',p_proof_storage_path:path,
          });
          if(requestError || !data){
            await supabase.storage.from('payment-proofs').remove([path]);
            throw requestError || new Error('تعذر إنشاء طلب VIP.');
          }
          setProof(null);
          await load();
          Alert.alert('تم استلام الطلب','وصلت صورة التحويل للأدمن. لن يتفعل VIP قبل اعتماد الدفع.');
        } catch(e){ Alert.alert('تعذر إرسال الطلب',e?.message||'حاول مرة أخرى.'); }
        finally{setSending(false);}
      }},
    ]);
  };

