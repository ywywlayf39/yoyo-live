import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';
import * as ImagePicker from 'expo-image-picker';

const C = { bg:'#0B0912', card:'#191424', card2:'#241B35', pink:'#F34E9B', gold:'#F5C451', white:'#FFFFFF', muted:'#AAA1B8', border:'#3B304B' };

export default function PackagesScreen({ userId, onBack }) {
  const [packages,setPackages] = useState([]);
  const [settings,setSettings] = useState(null);
  const [selected,setSelected] = useState(null);
  const [method,setMethod] = useState('vodafone_cash');
  const [proof,setProof] = useState(null);
  const [loading,setLoading] = useState(true);
  const [sending,setSending] = useState(false);
  const [error,setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [{data: packageRows,error: packageError},{data: paymentData,error: paymentError}] = await Promise.all([
      supabase.from('coin_packages').select('id,name,price_egp,coins,bonus_coins,active').order('sort_order',{ascending:true}),
      supabase.from('yoyo_payment_settings').select('vodafone_cash_number,instapay_identifier,bank_name,bank_account_name,bank_account_number').eq('id',true).maybeSingle(),
    ]);
    if (packageError) setError('تعذر تحميل الباقات. حاول تحديث الصفحة.');
    else { setPackages(packageRows || []); setSelected(current => current && (packageRows || []).some(item=>item.id===current.id && item.active) ? current : (packageRows || []).find(item=>item.active) || null); }
    if (paymentError) console.warn('YOYO payment settings:',paymentError.message);
    setSettings(paymentData || null);
    setLoading(false);
  },[]);

  useEffect(()=>{load();},[load]);

  const chooseProof = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('إذن الصور مطلوب','اسمح للتطبيق بالوصول إلى الصور لاختيار إيصال التحويل.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes:['images'], allowsEditing:false, quality:0.85 });
    if (!result.canceled && result.assets?.[0]) {
      const asset=result.assets[0];
      if (asset.fileSize && asset.fileSize>5*1024*1024) return Alert.alert('الصورة كبيرة','اختر صورة لا يزيد حجمها عن 5 ميجابايت.');
      setProof(asset);
    }
  };

  const submitRequest = async () => {
    if (!selected || !userId || sending) return;
    if (!proof?.uri) return Alert.alert('صورة التحويل مطلوبة','اختار سكرين شوت التحويل أولًا.');
    const methodValue = method;
    if (methodValue === 'vodafone_cash' && !settings?.vodafone_cash_number) return Alert.alert('وسيلة الدفع غير متاحة','الأدمن لم يضف رقم فودافون كاش بعد.');
    if (methodValue === 'instapay' && !settings?.instapay_identifier) return Alert.alert('وسيلة الدفع غير متاحة','الأدمن لم يضف بيانات InstaPay بعد.');
    if (methodValue === 'bank_transfer' && !settings?.bank_account_number) return Alert.alert('وسيلة الدفع غير متاحة','الأدمن لم يضف الحساب البنكي بعد.');
    Alert.alert('تأكيد طلب الشحن','ارفع صورة إيصال التحويل الواضحة. لن تضاف العملات إلا بعد مراجعة الأدمن.',[
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
          const {data:requestId,error:insertError}=await supabase.rpc('yoyo_create_coin_purchase_request',{
            p_package_id:selected.id,p_payment_method:methodValue,p_transfer_reference:'proof-upload',p_proof_storage_path:path,
          });
          if(insertError || !requestId) {
            await supabase.storage.from('payment-proofs').remove([path]);
            throw insertError || new Error('تعذر إنشاء طلب الشحن.');
          }
          setProof(null);
          Alert.alert('تم استلام الطلب','وصلت صورة التحويل للأدمن. ستضاف العملات بعد التحقق من وصول المبلغ.');
        } catch(e) { Alert.alert('تعذر إرسال الطلب',e?.message||'حاول مرة أخرى.'); }
        finally { setSending(false); }
      }},
    ]);
  };

