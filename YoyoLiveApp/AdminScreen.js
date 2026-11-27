import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';
import { calculateGiftEconomics } from './financialCalculator';

const statusLabels = {
  pending: 'جديد',
  reviewing: 'قيد المراجعة',
  actioned: 'تم اتخاذ إجراء',
  dismissed: 'مرفوض',
};
const reasonLabels = {
  harassment: 'تحرش أو إساءة',
  hate: 'خطاب كراهية',
  sexual_content: 'محتوى جنسي',
  violence: 'عنف',
  spam: 'رسائل مزعجة أو احتيال',
  impersonation: 'انتحال شخصية',
  underage: 'اشتباه قاصر',
  other: 'سبب آخر',
};

export default function AdminScreen({ onBack }) {
  const [summary, setSummary] = useState(null);
  const [reports, setReports] = useState([]);
  const [liveRooms, setLiveRooms] = useState([]);
  const [liveActionReason, setLiveActionReason] = useState('');
  const [liveActionBusyId, setLiveActionBusyId] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [auditActions, setAuditActions] = useState([]);
  const [suspensions, setSuspensions] = useState([]);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [suspensionDuration, setSuspensionDuration] = useState('24h');
  const [suspensionBusyId, setSuspensionBusyId] = useState(null);
  const [coinPurchaseRequests, setCoinPurchaseRequests] = useState([]);
  const [vipRequests, setVipRequests] = useState([]);
  const [referralVipRewards, setReferralVipRewards] = useState([]);
  const [referralRewardBusyId, setReferralRewardBusyId] = useState(null);
  const [vipReviewNote, setVipReviewNote] = useState('');
  const [vipReviewBusyId, setVipReviewBusyId] = useState(null);
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
  const [withdrawalReviewNote, setWithdrawalReviewNote] = useState('');
  const [withdrawalBusyId, setWithdrawalBusyId] = useState(null);
  const [giftCatalog, setGiftCatalog] = useState([]);
  const [coinReviewNote, setCoinReviewNote] = useState('');
  const [coinReviewBusyId, setCoinReviewBusyId] = useState(null);
  const [coinDeleteBusyId, setCoinDeleteBusyId] = useState(null);
  const scrollRef = useRef(null);
  const [sectionPositions, setSectionPositions] = useState({});
  const rememberSection = key => event => setSectionPositions(previous => ({ ...previous, [key]: event.nativeEvent.layout.y }));
  const jumpToSection = key => { const y = sectionPositions[key]; if (Number.isFinite(y)) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }); };
  const [financialInputs, setFinancialInputs] = useState({
    packagePriceEgp: '', packageCoins: '', giftCoinsSpent: '', hostRedeemablePoints: '',
    egpPerHostPoint: '', paymentFeePercent: '', storeFeePercent: '', taxPercent: '',
    refundReservePercent: '', payoutFeePercent: '', paymentFixedFeeEgp: '',
    payoutFixedFeeEgp: '', allocatedOperatingCostEgp: '', targetMarginPercent: '',
  });
  const [financialResult, setFinancialResult] = useState(null);
  const [financialError, setFinancialError] = useState('');
  const [paymentSettings, setPaymentSettings] = useState({
    vodafone_cash_number: '', instapay_identifier: '', bank_name: '',
    bank_account_name: '', bank_account_number: '',
  });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [packageRows, setPackageRows] = useState([]);
  const [packageForm, setPackageForm] = useState({
    id: null, name: '', price_egp: '', coins: '', bonus_coins: '0', active: false, sort_order: '0',
  });
  const [packageSaving, setPackageSaving] = useState(false);
  const [paymentSettingsError, setPaymentSettingsError] = useState('');


  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    const [summaryResult, reportsResult, membersResult, suspensionsResult, auditResult, liveRoomsResult, coinRequestsResult, giftCatalogResult, withdrawalsResult, vipRequestsResult, referralRewardsResult] = await Promise.all([
      supabase.rpc('yoyo_admin_summary'),
      supabase.rpc('yoyo_admin_list_reports_with_live', { p_limit: 100 }),
      supabase.from('profiles')
        .select('id, display_name, country, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('user_suspensions')
        .select('user_id, reason, suspended_at, suspended_until, revoked_at')
        .is('revoked_at', null),
      supabase.from('admin_user_actions')
        .select('id, admin_id, target_user_id, action, reason, duration, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('live_rooms')
        .select('id, host_id, host_name, title, status, created_at')
        .eq('status', 'live')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('coin_purchase_requests')
        .select('id,user_id,requested_amount_egp,requested_coins,payment_method,transfer_reference,proof_storage_path,status,admin_note,created_at')
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('gift_catalog').select('id,name,coin_cost,gross_points,active').order('coin_cost', { ascending: true }),
      supabase.rpc('yoyo_admin_list_withdrawal_requests', { p_limit: 100 }),
      supabase.from('vip_subscription_requests')
        .select('id,user_id,amount_egp,payment_method,transfer_reference,proof_storage_path,status,admin_note,created_at,plan:vip_plans(name,duration_days)')
        .order('created_at', { ascending: false }).limit(100),
      supabase.rpc('yoyo_admin_list_referral_vip_rewards', { p_limit: 100 }),
    ]);

    if (summaryResult.error || reportsResult.error || membersResult.error) {
      console.error('YOYO admin dashboard failed:', summaryResult.error || reportsResult.error || membersResult.error);
      setError('تعذر تحميل بعض بيانات الإدارة. تأكد من تحديث تسجيل الدخول ثم حاول مرة أخرى.');
    }
    setSummary(summaryResult.error ? null : (summaryResult.data || {}));
    setReports(reportsResult.error ? [] : (reportsResult.data || []));
    setMembers(membersResult.error ? [] : (membersResult.data || []));
    setLiveRooms(liveRoomsResult.error ? [] : (liveRoomsResult.data || []));
    const coinRows = coinRequestsResult.error ? [] : (coinRequestsResult.data || []);
    const vipRows = vipRequestsResult.error ? [] : (vipRequestsResult.data || []);
    const withProofUrls = async rows => Promise.all(rows.map(async row => {
      if (!row.proof_storage_path) return row;
      const { data } = await supabase.storage.from('payment-proofs').createSignedUrl(row.proof_storage_path, 900);
      return { ...row, proofUrl: data?.signedUrl || null };
    }));
    const [coinRowsWithProof, vipRowsWithProof] = await Promise.all([withProofUrls(coinRows), withProofUrls(vipRows)]);
    setCoinPurchaseRequests(coinRowsWithProof);
    setVipRequests(vipRowsWithProof);
    setReferralVipRewards(referralRewardsResult.error ? [] : (referralRewardsResult.data || []));
    if (referralRewardsResult.error) console.error('YOYO referral VIP rewards failed:', referralRewardsResult.error);
    setWithdrawalRequests(withdrawalsResult.error ? [] : (withdrawalsResult.data || []));
    if (vipRequestsResult.error) console.error('YOYO VIP requests failed:', vipRequestsResult.error);
    if (withdrawalsResult.error) console.error('YOYO admin withdrawal requests failed:', withdrawalsResult.error);
    setGiftCatalog(giftCatalogResult.error ? [] : (giftCatalogResult.data || []));
    if (giftCatalogResult.error) console.error('YOYO gift catalog audit failed:', giftCatalogResult.error);
    if (coinRequestsResult.error) console.error('YOYO coin purchase requests failed:', coinRequestsResult.error);
    if (liveRoomsResult.error) console.error('YOYO admin live rooms failed:', liveRoomsResult.error);
    setSuspensions(suspensionsResult.error ? [] : (suspensionsResult.data || []));
    if (suspensionsResult.error) console.error('YOYO admin suspensions failed:', suspensionsResult.error);
    if (auditResult.error) {
      console.error('YOYO admin audit log failed:', auditResult.error);
      setAuditActions([]);
    } else {
      const rows = auditResult.data || [];
      const userIds = [...new Set(rows.flatMap(row => [row.admin_id, row.target_user_id]).filter(Boolean))];
      let nameMap = {};
      if (userIds.length) {
        const { data: nameRows, error: namesError } = await supabase
          .from('profiles').select('id, display_name').in('id', userIds);
        if (namesError) console.error('YOYO admin audit names failed:', namesError);
        else nameMap = Object.fromEntries((nameRows || []).map(row => [row.id, row.display_name || 'عضو بدون اسم']));
      }
      setAuditActions(rows.map(row => ({
        ...row,
        admin_name: nameMap[row.admin_id] || 'حساب إداري غير متاح',
        target_name: nameMap[row.target_user_id] || 'حساب غير متاح',
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    let active = true;
    const loadFinancialSettings = async () => {
      const [{ data, error: settingsError }, { data: rows, error: packagesError }] = await Promise.all([
        supabase.from('yoyo_payment_settings')
          .select('vodafone_cash_number,instapay_identifier,bank_name,bank_account_name,bank_account_number')
          .eq('id', true).maybeSingle(),
        supabase.rpc('yoyo_admin_list_coin_packages'),
      ]);
      if (!active) return;
      if (settingsError) setPaymentSettingsError('تعذر تحميل بيانات وسائل الدفع.');
      else if (data) setPaymentSettings(data);
      if (packagesError) console.error('YOYO admin packages:', packagesError);
      else setPackageRows(rows || []);
    };
    loadFinancialSettings();
    return () => { active = false; };
  }, []);

  const savePaymentSettings = async () => {
    if (paymentSaving) return;
    setPaymentSaving(true);
    setPaymentSettingsError('');
    const { data, error: saveError } = await supabase.rpc('yoyo_admin_update_payment_settings', {
      p_vodafone_cash_number: paymentSettings.vodafone_cash_number.trim(),
      p_instapay_identifier: paymentSettings.instapay_identifier.trim(),
      p_bank_name: paymentSettings.bank_name.trim(),
      p_bank_account_name: paymentSettings.bank_account_name.trim(),
      p_bank_account_number: paymentSettings.bank_account_number.trim(),
    });
    setPaymentSaving(false);
    if (saveError || data !== true) {
      setPaymentSettingsError(saveError?.message || 'تعذر حفظ بيانات الدفع.');
      return;
    }
    Alert.alert('تم الحفظ', 'تم تحديث وسائل الدفع التي تظهر للأعضاء.');
  };

  const savePackage = async () => {
    if (packageSaving) return;
    const price = Number(packageForm.price_egp);
    const coins = Number(packageForm.coins);
    const bonus = Number(packageForm.bonus_coins || 0);
    if (packageForm.name.trim().length < 2 || !Number.isFinite(price) || price <= 0 ||
        !Number.isInteger(coins) || coins <= 0 || !Number.isInteger(bonus) || bonus < 0) {
      Alert.alert('راجع بيانات الباقة', 'اكتب اسمًا وسعرًا صحيحًا وعدد عملات صحيحًا.');
      return;
    }
    setPackageSaving(true);
    const { data, error: saveError } = await supabase.rpc('yoyo_admin_save_coin_package', {
      p_id: packageForm.id,
      p_name: packageForm.name.trim(),
      p_price_egp: price,
      p_coins: coins,
      p_bonus_coins: bonus,
      p_active: !!packageForm.active,
      p_sort_order: Number(packageForm.sort_order) || 0,
    });
    setPackageSaving(false);
    if (saveError || !data) {
      Alert.alert('تعذر حفظ الباقة', saveError?.message || 'حاول مرة أخرى.');
      return;
    }
    const { data: rows, error: listError } = await supabase.rpc('yoyo_admin_list_coin_packages');
    if (!listError) setPackageRows(rows || []);
    setPackageForm({ id: null, name: '', price_egp: '', coins: '', bonus_coins: '0', active: false, sort_order: '0' });
    Alert.alert('تم', 'تم حفظ الباقة. لن تظهر للأعضاء إلا إذا فعّلتها.');
  };

  const editPackage = (item) => setPackageForm({
    id: item.id, name: item.name, price_egp: String(item.price_egp),
    coins: String(item.coins), bonus_coins: String(item.bonus_coins || 0),
    active: !!item.active, sort_order: String(item.sort_order || 0),
  });


  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLocaleLowerCase();
    if (!q) return members;
    return members.filter(member =>
      (member.display_name || '').toLocaleLowerCase().includes(q) ||
      (member.country || '').toLocaleLowerCase().includes(q) ||
      member.id.toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  const applySuspension = async (member, action, duration = suspensionDuration) => {
    const reason = suspensionReason.trim();
    if (reason.length < 5) {
      Alert.alert('اكتب سبب الإجراء', 'سبب الإيقاف أو رفعه يجب ألا يقل عن 5 أحرف.');
      return;
    }
    const title = action === 'suspend' ? 'تأكيد إيقاف الحساب' : 'تأكيد رفع الإيقاف';
    const message = action === 'suspend'
      ? `سيتم إيقاف حساب ${member.display_name} لمدة ${duration === 'permanent' ? 'دائمة' : duration}.`
      : `سيتم السماح لـ ${member.display_name} بتسجيل الدخول واستخدام التطبيق مجددًا.`;
    Alert.alert(title, message, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', style: 'destructive', onPress: async () => {
        setSuspensionBusyId(member.id);
        const { data, error: actionError } = await supabase.functions.invoke('admin-user-suspension', {
          body: { action, targetUserId: member.id, duration, reason },
        });
        if (actionError || !data?.success) {
          Alert.alert('تعذر تنفيذ الإجراء', data?.error || actionError?.message || 'حاول مرة أخرى.');
        } else {
          setSuspensionReason('');
          await loadDashboard();
          Alert.alert(
            'تم',
            action === 'suspend'
              ? [
                  'تم إيقاف الحساب ومنع الخدمات الجديدة.',
                  data.liveDisconnectWarning ? 'تعذر تأكيد فصل جلسات LiveKit الحالية؛ راجع سجلات الخدمة.' : 'تم فصل جلسات البث والمكالمات النشطة.',
                  data.auditWarning ? 'تنبيه: تعذر حفظ سجل التدقيق لهذه العملية.' : 'تم حفظ سجل الإجراء الإداري.',
                ].join(' ')
              : 'تم رفع الإيقاف وتسجيل العملية.'
          );
        }
        setSuspensionBusyId(null);
      }},
    ]);
  };

  const endLiveRoom = (room) => {
    const reason = liveActionReason.trim();
    if (reason.length < 5) {
      Alert.alert('اكتب سبب الإجراء', 'سبب إنهاء البث يجب ألا يقل عن 5 أحرف.');
      return;
    }
    Alert.alert('تأكيد إنهاء البث', `سيتم فصل المشاهدين وإنهاء بث ${room.host_name || 'العضو'} نهائيًا. لا يمكن التراجع عن هذا الإجراء.`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إنهاء البث', style: 'destructive', onPress: async () => {
        setLiveActionBusyId(room.id);
        const { data, error: actionError } = await supabase.functions.invoke('admin-live-room-action', {
          body: { roomId: room.id, reason },
        });
        if (actionError || !data?.success) {
          Alert.alert('تعذر إنهاء البث', data?.error || actionError?.message || 'حاول مرة أخرى.');
        } else {
          setLiveActionReason('');
          await loadDashboard();
          Alert.alert('تم إنهاء البث', data.auditWarning
            ? 'تم إنهاء البث، لكن تعذر حفظ سجل التدقيق. راجع سجلات الخدمة.'
            : 'تم فصل غرفة البث وتحديث حالتها وحفظ الإجراء في سجل الإدارة.');
        }
        setLiveActionBusyId(null);
      }},
    ]);
  };

  const reviewCoinPurchase = (request, decision) => {
    const label = decision === 'approved' ? 'اعتماد الطلب وإضافة العملات إلى محفظة العضو' : decision === 'rejected' ? 'رفض طلب شراء العملات' : 'نقل الطلب إلى قيد المراجعة';
    Alert.alert('تأكيد مراجعة طلب الشراء', label, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setCoinReviewBusyId(request.id);
        const { data, error: reviewError } = await supabase.rpc('yoyo_admin_review_coin_purchase', {
          p_request_id: request.id, p_decision: decision, p_admin_note: coinReviewNote.trim() || null,
        });
        if (reviewError || data !== true) Alert.alert('تعذر تحديث الطلب', reviewError?.message || 'لم يتم العثور على الطلب.');
        else { setCoinReviewNote(''); await loadDashboard(); Alert.alert('تم', decision === 'approved' ? 'تم اعتماد الطلب وإضافة العملات وتسجيل الحركة.' : 'تم تحديث حالة الطلب.'); }
        setCoinReviewBusyId(null);
      }},
    ]);
  };


  const deleteCoinPurchaseRequest = request => {
    if (request.status === 'approved') {
      Alert.alert('لا يمكن الحذف', 'الطلب المعتمد مرتبط بإضافة عملات وسجل مالي، ويجب أن يظل محفوظًا.');
      return;
    }
    Alert.alert('حذف طلب الشراء والإيصال؟', 'سيتم حذف الطلب وصورة الإيصال نهائيًا. لن يتم حذف أي سجل مالي لطلب معتمد.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف نهائي', style: 'destructive', onPress: async () => {
        setCoinDeleteBusyId(request.id);
        const { data, error: deleteError } = await supabase.functions.invoke('admin-delete-coin-purchase', { body: { requestId: request.id } });
        setCoinDeleteBusyId(null);
        if (deleteError || !data?.success) {
          Alert.alert('تعذر الحذف', data?.error || deleteError?.message || 'حاول مرة أخرى.');
          return;
        }
        await loadDashboard();
        Alert.alert('تم الحذف', data.receiptDeleted ? 'تم حذف طلب الشراء وصورة الإيصال.' : 'تم حذف الطلب، لكن تعذر حذف صورة الإيصال من التخزين.');
      }},
    ]);
  };

  const reviewVipRequest = (request, decision) => {
    const labels = {
      reviewing: 'نقل طلب VIP إلى قيد المراجعة',
      approved: 'اعتماد التحويل وتفعيل عضوية VIP لمدة 30 يومًا',
      rejected: 'رفض طلب VIP دون تفعيل العضوية',
    };
    Alert.alert('مراجعة طلب VIP', labels[decision], [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setVipReviewBusyId(request.id);
        const { error: reviewError } = await supabase.rpc('yoyo_admin_review_vip_request', {
          p_request_id: request.id,
          p_decision: decision,
          p_admin_note: vipReviewNote.trim() || null,
        });
        if (reviewError) {
          Alert.alert('تعذر تحديث طلب VIP', reviewError.message || 'حاول مرة أخرى.');
        } else {
          setVipReviewNote('');
          await loadDashboard();
          Alert.alert('تم', decision === 'approved'
            ? 'تم اعتماد الطلب وتفعيل عضوية VIP للعضو لمدة 30 يومًا.'
            : decision === 'rejected' ? 'تم رفض الطلب ولم يتم تفعيل العضوية.' : 'تم نقل الطلب إلى قيد المراجعة.');
        }
        setVipReviewBusyId(null);
      }},
    ]);
  };

  const reviewReferralVipReward = (reward, decision) => {
    const labels = {
      reviewing: 'نقل مكافأة VIP إلى قيد المراجعة',
      approved: 'اعتماد مكافأة VIP المجانية للعضو',
      rejected: 'رفض مكافأة VIP دون تفعيل أي مدة',
    };
    Alert.alert('مراجعة مكافأة الدعوات', labels[decision], [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setReferralRewardBusyId(reward.id);
        const { data, error: reviewError } = await supabase.rpc('yoyo_admin_review_referral_vip_reward', {
          p_reward_id: reward.id,
          p_decision: decision,
        });
        if (reviewError) {
          Alert.alert('تعذر تحديث المكافأة', reviewError.message || 'حاول مرة أخرى.');
        } else {
          await loadDashboard();
          Alert.alert('تم', decision === 'approved'
            ? (Number(data || 0) > 0
              ? 'تم اعتماد المكافأة وإضافة ' + Number(data).toLocaleString('ar-EG') + ' يوم VIP مجاني.'
              : 'تم اعتماد المرحلة؛ العضو حصل بالفعل على إجمالي أيام هذه المرحلة من مكافأة سابقة.')
            : decision === 'rejected' ? 'تم رفض المكافأة ولم يتم تفعيل VIP.' : 'تم نقل المكافأة إلى قيد المراجعة.');
        }
        setReferralRewardBusyId(null);
      }},
    ]);
  };

  const reviewWithdrawal = (request, decision) => {
    const labels = {
      reviewing: 'نقل الطلب إلى قيد المراجعة',
      approved: 'اعتماد الطلب بعد التحقق من بيانات الاستلام',
      rejected: 'رفض الطلب وإعادة النقاط إلى رصيد العضو',
      paid: 'تسجيل أن التحويل النقدي تم بالفعل',
    };
    Alert.alert('مراجعة طلب السحب', labels[decision], [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', style: decision === 'rejected' ? 'destructive' : 'default', onPress: async () => {
        setWithdrawalBusyId(request.id);
        const { data, error: reviewError } = await supabase.rpc('yoyo_admin_review_withdrawal', {
          p_request_id: request.id,
          p_decision: decision,
          p_admin_note: withdrawalReviewNote.trim() || null,
        });
        if (reviewError || data !== true) {
          Alert.alert('تعذر تحديث طلب السحب', reviewError?.message || 'لم يتم العثور على الطلب.');
        } else {
          setWithdrawalReviewNote('');
          await loadDashboard();
          Alert.alert('تم', decision === 'paid'
            ? 'تم تسجيل الصرف وإنهاء الطلب.'
            : decision === 'rejected'
              ? 'تم رفض الطلب وإعادة النقاط إلى رصيد العضو.'
              : 'تم تحديث حالة طلب السحب.');
        }
        setWithdrawalBusyId(null);
      }},
    ]);
  };

  const runFinancialSimulation = () => {
    setFinancialError('');
    setFinancialResult(null);
    const required = ['packagePriceEgp', 'packageCoins', 'giftCoinsSpent', 'hostRedeemablePoints', 'egpPerHostPoint'];
    if (required.some(key => String(financialInputs[key]).trim() === '')) {
      setFinancialError('أدخل سعر الباقة وعدد العملات والعملات المستهلكة ونقاط المضيف وقيمة النقطة بالجنيه.');
      return;
    }
    try {
      const result = calculateGiftEconomics(Object.fromEntries(
        Object.entries(financialInputs).map(([key, value]) => [key, value === '' ? 0 : Number(value)])
      ));
      setFinancialResult(result);
    } catch (e) {
      setFinancialError(e?.message || 'راجع القيم المدخلة وحاول مرة أخرى.');
    }
  };

  const updateFinancialInput = (key, value) => {
    setFinancialInputs(current => ({ ...current, [key]: value }));
    setFinancialResult(null);
    setFinancialError('');
  };

  const updateStatus = async (report, status) => {
    setBusyId(report.id);
    const { data, error: updateError } = await supabase.rpc('yoyo_admin_update_report', {
      p_report_id: report.id,
      p_status: status,
    });
    if (updateError || data !== true) {
      Alert.alert('تعذر تحديث البلاغ', updateError?.message || 'لم يتم العثور على البلاغ.');
    } else {
      await loadDashboard();
    }
    setBusyId(null);
  };

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.back}><Text style={styles.backText}>رجوع ←</Text></TouchableOpacity>
      <Text style={styles.logo}>YOYO LIVE 💗</Text>
      <Text style={styles.title}>لوحة الإدارة</Text>
      <Text style={styles.subtitle}>إدارة الأعضاء والمدفوعات والبثوث والبلاغات من مكان واحد</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickNav}>
        {[
          ['payments','💳 الدفع'],['packages','🪙 الباقات'],['members','👥 الأعضاء'],['live','🔴 البثوث'],
          ['coins','🧾 شراء العملات'],['withdrawals','💸 السحب'],['vip','👑 VIP'],['reports','🚩 البلاغات'],['audit','📋 السجل'],['finance','📊 الأرباح'],
        ].map(([key,label]) => (
          <TouchableOpacity key={key} style={styles.quickNavButton} onPress={() => jumpToSection(key)}>
            <Text style={styles.quickNavText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.financialPanel}>
        <Text style={styles.sectionTitle}>💳 إعدادات وسائل الدفع</Text>
        <Text style={styles.memberHint}>حدّث الأرقام وبيانات الحساب هنا. التغييرات تظهر للأعضاء في صفحة الباقات بعد الحفظ.</Text>
        {[
          ['vodafone_cash_number','رقم فودافون كاش'],
          ['instapay_identifier','عنوان أو رقم InstaPay'],
          ['bank_name','اسم البنك'],
          ['bank_account_name','اسم صاحب الحساب البنكي'],
          ['bank_account_number','رقم الحساب البنكي أو IBAN'],
        ].map(([key,label]) => (
          <View key={key} style={styles.financialField}>
            <Text style={styles.financialLabel}>{label}</Text>
            <TextInput value={paymentSettings[key]} onChangeText={value => setPaymentSettings(current => ({...current,[key]:value}))}
              placeholder={label} placeholderTextColor="#8F849F" style={styles.financialInput}
              autoCapitalize="none" />
          </View>
        ))}
        {!!paymentSettingsError && <Text style={styles.financialError}>{paymentSettingsError}</Text>}
        <TouchableOpacity style={styles.calculateButton} onPress={savePaymentSettings} disabled={paymentSaving}>
          <Text style={styles.actionText}>{paymentSaving ? 'جارٍ الحفظ...' : 'حفظ بيانات وسائل الدفع'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.financialPanel,{marginTop:18}]}>
        <Text style={styles.sectionTitle}>🪙 إدارة باقات العملات</Text>
        <Text style={styles.memberHint}>أدخل الأسعار والعملات التي تعتمدها بنفسك. الباقة غير النشطة لا تظهر للمستخدمين.</Text>
        <TextInput value={packageForm.name} onChangeText={value => setPackageForm(current => ({...current,name:value}))}
          placeholder="اسم الباقة" placeholderTextColor="#8F849F" style={styles.financialInput} />
        {[
          ['price_egp','السعر بالجنيه'],['coins','عدد العملات'],['bonus_coins','عملات إضافية مجانية'],['sort_order','ترتيب العرض'],
        ].map(([key,label]) => (
          <View key={key} style={styles.financialField}>
            <Text style={styles.financialLabel}>{label}</Text>
            <TextInput value={packageForm[key]} onChangeText={value => setPackageForm(current => ({...current,[key]:value}))}
              keyboardType="decimal-pad" placeholder={label} placeholderTextColor="#8F849F" style={styles.financialInput} />
          </View>
        ))}
        <TouchableOpacity onPress={() => setPackageForm(current => ({...current,active:!current.active}))}
          style={[styles.durationChip,{alignSelf:'flex-end',backgroundColor:packageForm.active?'#276B4A':'#30263F'}]}>
          <Text style={styles.durationText}>{packageForm.active ? '✓ الباقة مفعّلة' : 'الباقة متوقفة'}</Text>
        </TouchableOpacity>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.calculateButton} onPress={savePackage} disabled={packageSaving}>
            <Text style={styles.actionText}>{packageSaving ? 'جارٍ الحفظ...' : packageForm.id ? 'حفظ تعديل الباقة' : 'إضافة باقة جديدة'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reviewButton} onPress={() => setPackageForm({id:null,name:'',price_egp:'',coins:'',bonus_coins:'0',active:false,sort_order:'0'})}>
            <Text style={styles.actionText}>باقة جديدة</Text>
          </TouchableOpacity>
        </View>
        {packageRows.map(item => (
          <TouchableOpacity key={item.id} onPress={() => editPackage(item)} style={styles.auditCard}>
            <Text style={styles.memberName}>{item.name} {item.active ? '🟢' : '⚪'}</Text>
            <Text style={styles.person}>{Number(item.price_egp).toLocaleString('ar-EG')} جنيه · {Number(item.coins).toLocaleString('ar-EG')} عملة + {Number(item.bonus_coins||0).toLocaleString('ar-EG')} إضافية</Text>
            <Text style={styles.refresh}>اضغط للتعديل</Text>
          </TouchableOpacity>
        ))}
        {packageRows.length === 0 && <Text style={styles.memberHint}>لم تتم إضافة باقات بعد. أضف الأسعار المعتمدة لعرضها للأعضاء.</Text>}
      </View>

      {loading ? <ActivityIndicator color="#F5C451" size="large" style={{ marginTop: 30 }} /> : (
        <>
          {!!error && <Text style={styles.error}>{error}</Text>}
          {summary && (
            <View style={styles.stats}>
              {[
                ['👥', 'إجمالي الأعضاء', summary.members_total],
                ['🔴', 'بث مباشر الآن', summary.live_now],
                ['🚩', 'بلاغات جديدة', summary.reports_pending],
                ['🎁', 'الهدايا المرسلة', summary.gifts_sent],
              ].map(([emoji, label, value]) => (
                <View key={label} style={styles.statCard}>
                  <Text style={styles.statEmoji}>{emoji}</Text>
                  <Text style={styles.statValue}>{Number(value || 0).toLocaleString('en-US')}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.sectionHeader} onLayout={rememberSection('members')}>
            <Text style={styles.sectionTitle}>👥 إدارة الأعضاء</Text>
            <TouchableOpacity onPress={loadDashboard}><Text style={styles.refresh}>تحديث ↻</Text></TouchableOpacity>
          </View>
          <TextInput
            value={memberSearch}
            onChangeText={setMemberSearch}
            placeholder="ابحث بالاسم أو البلد أو رقم العضو"
            placeholderTextColor="#8F849F"
            style={styles.searchInput}
            autoCapitalize="none"
          />
          <Text style={styles.memberHint}>عرض أحدث {members.length} عضو. لا يتم عرض البريد الإلكتروني أو تاريخ الميلاد في هذه القائمة.</Text>
          {filteredMembers.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>لا يوجد أعضاء مطابقون للبحث.</Text></View>
          ) : filteredMembers.map(member => (
            <View key={member.id} style={styles.memberCard}>
              <Text style={styles.memberName}>{member.display_name || 'عضو بدون اسم'}</Text>
              <Text style={styles.person}>البلد: {member.country || 'غير محدد'}</Text>
              <Text style={styles.date}>تاريخ الانضمام: {member.created_at ? new Date(member.created_at).toLocaleDateString('ar-EG') : 'غير متاح'}</Text>
              <Text style={styles.memberId}>رقم العضو: {member.id}</Text>
              {(() => {
                const suspension = suspensions.find(item => item.user_id === member.id &&
                  (!item.suspended_until || new Date(item.suspended_until).getTime() > Date.now()));
                return suspension ? (
                  <View style={styles.suspendedBox}>
                    <Text style={styles.suspendedText}>⛔ الحساب موقوف {suspension.suspended_until ? 'حتى ' + new Date(suspension.suspended_until).toLocaleString('ar-EG') : 'بشكل دائم'}</Text>
                    <Text style={styles.suspensionReason}>السبب: {suspension.reason}</Text>
                    <TouchableOpacity disabled={!!suspensionBusyId} style={styles.unsuspendButton}
                      onPress={() => applySuspension(member, 'unsuspend')}>
                      <Text style={styles.actionText}>{suspensionBusyId === member.id ? '...' : 'رفع الإيقاف'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.suspendButtons}>
                    <TouchableOpacity disabled={!!suspensionBusyId} style={styles.suspendButton}
                      onPress={() => applySuspension(member, 'suspend')}>
                      <Text style={styles.actionText}>{suspensionBusyId === member.id ? '...' : 'إيقاف الحساب بالمدة المحددة'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}
            </View>
          ))}
          <View style={styles.suspensionPanel}>
            <Text style={styles.suspensionTitle}>سبب الإجراء والمدة</Text>
            <TextInput
              value={suspensionReason}
              onChangeText={setSuspensionReason}
              placeholder="اكتب سبب الإيقاف أو رفعه (5 أحرف على الأقل)"
              placeholderTextColor="#8F849F"
              style={styles.searchInput}
              multiline
              maxLength={500}
            />
            <View style={styles.durationRow}>
              {[
                ['24h', '24 ساعة'],
                ['72h', '3 أيام'],
                ['168h', '7 أيام'],
                ['720h', '30 يومًا'],
                ['permanent', 'دائم'],
              ].map(([value, label]) => (
                <TouchableOpacity key={value} onPress={() => setSuspensionDuration(value)}
                  style={[styles.durationChip, suspensionDuration === value && styles.durationChipActive]}>
                  <Text style={styles.durationText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.sectionHeader} onLayout={rememberSection('audit')}>
            <Text style={styles.sectionTitle}>🧾 سجل الإجراءات الإدارية</Text>
            <TouchableOpacity onPress={loadDashboard}><Text style={styles.refresh}>تحديث ↻</Text></TouchableOpacity>
          </View>
          <Text style={styles.memberHint}>آخر 100 إجراء إداري. السجل للمتابعة والتدقيق ولا يعرض بيانات الاتصال الخاصة.</Text>
          {auditActions.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>لا توجد إجراءات إدارية مسجلة حتى الآن.</Text></View>
          ) : auditActions.map(item => (
            <View key={item.id} style={styles.auditCard}>
              <View style={styles.reportTop}>
                <Text style={[styles.auditAction, item.action === 'suspend' ? styles.auditSuspend : item.action === 'end_live_room' ? styles.auditLiveEnd : styles.auditUnsuspend]}>
                  {item.action === 'suspend' ? '⛔ إيقاف حساب' : item.action === 'unsuspend' ? '✅ رفع الإيقاف' : '🔴 إنهاء بث مباشر'}
                </Text>
                <Text style={styles.auditDate}>{new Date(item.created_at).toLocaleString('ar-EG')}</Text>
              </View>
              <Text style={styles.person}>العضو: {item.target_name}</Text>
              <Text style={styles.person}>بواسطة: {item.admin_name}</Text>
              {!!item.duration && <Text style={styles.auditMeta}>المدة: {({
                '24h': '24 ساعة', '72h': '3 أيام', '168h': '7 أيام',
                '720h': '30 يومًا', permanent: 'دائم',
              })[item.duration] || item.duration}</Text>}
              <Text style={styles.auditReason}>السبب: {item.reason}</Text>
            </View>
          ))}

          <View style={styles.sectionHeader} onLayout={rememberSection('live')}>
            <Text style={styles.sectionTitle}>🔴 متابعة البثوث النشطة</Text>
            <TouchableOpacity onPress={loadDashboard}><Text style={styles.refresh}>تحديث ↻</Text></TouchableOpacity>
          </View>
          <Text style={styles.memberHint}>يمكن للأدمن إنهاء بث بعد مراجعة البلاغ وكتابة سبب واضح. يتطلب الإجراء تأكيدًا ويسجل في سجل الإدارة.</Text>
          <TextInput value={liveActionReason} onChangeText={setLiveActionReason}
            placeholder="سبب إنهاء البث المرتبط بالبلاغ (5 أحرف على الأقل)" placeholderTextColor="#8F849F"
            style={styles.searchInput} multiline maxLength={500} />
          {liveRooms.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>لا توجد بثوث نشطة حاليًا.</Text></View>
          ) : liveRooms.map(room => (
            <View key={room.id} style={styles.memberCard}>
              <Text style={styles.memberName}>{room.title || 'بث مباشر'}</Text>
              <Text style={styles.person}>صاحب البث: {room.host_name || 'عضو'}</Text>
              <Text style={styles.person}>الحالة: مباشر الآن</Text>
              <Text style={styles.date}>بدأ: {room.created_at ? new Date(room.created_at).toLocaleString('ar-EG') : 'غير متاح'}</Text>
              <Text style={styles.memberId}>معرّف البث: {room.id}</Text>
              <TouchableOpacity disabled={!!liveActionBusyId} style={styles.dismissButton} onPress={() => endLiveRoom(room)}>
                <Text style={styles.actionText}>{liveActionBusyId === room.id ? 'جارٍ إنهاء البث...' : 'إنهاء البث بعد المراجعة'}</Text>
              </TouchableOpacity>
            </View>
          ))}


          <View style={styles.sectionHeader} onLayout={rememberSection('vip')}>
            <Text style={styles.sectionTitle}>👑 طلبات عضوية VIP</Text>
            <TouchableOpacity onPress={loadDashboard}><Text style={styles.refresh}>تحديث ↻</Text></TouchableOpacity>
          </View>
          <Text style={styles.memberHint}>لا تعتمد الطلب إلا بعد التأكد من وصول 200 جنيه فعليًا. اعتماد الطلب يفعّل عضوية VIP لمدة 30 يومًا.</Text>
          <TextInput value={vipReviewNote} onChangeText={setVipReviewNote}
            placeholder="ملاحظة مراجعة VIP (اختياري)" placeholderTextColor="#8F849F" style={styles.searchInput} multiline maxLength={1000} />
          {vipRequests.filter(request => ['pending','reviewing'].includes(request.status)).length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>لا توجد طلبات VIP تنتظر المراجعة.</Text></View>
          ) : vipRequests.filter(request => ['pending','reviewing'].includes(request.status)).map(request => (
            <View key={request.id} style={styles.reportCard}>
              <View style={styles.reportTop}>
                <Text style={styles.status}>{request.status === 'reviewing' ? 'قيد المراجعة' : 'جديد'}</Text>
                <Text style={styles.reason}>{request.payment_method === 'vodafone_cash' ? 'فودافون كاش' : request.payment_method === 'bank_transfer' ? 'تحويل بنكي' : 'InstaPay'}</Text>
              </View>
              <Text style={styles.person}>الباقة: {request.plan?.name || 'VIP شهري'}</Text>
              <Text style={styles.person}>المبلغ: {Number(request.amount_egp || 0).toLocaleString('ar-EG')} جنيه</Text>
              {!!request.proofUrl && <Image source={{uri:request.proofUrl}} style={{width:'100%',height:260,resizeMode:'contain',marginVertical:10,backgroundColor:'#100D18',borderRadius:10}} />}
              <Text style={styles.person}>{request.proof_storage_path ? 'صورة إيصال التحويل مرفقة' : 'لا توجد صورة مرفقة لهذا الطلب القديم'}</Text>
              <Text style={styles.memberId}>معرّف العضو: {request.user_id}</Text>
              <Text style={styles.date}>{request.created_at ? new Date(request.created_at).toLocaleString('ar-EG') : ''}</Text>
              <View style={styles.actions}>
                <TouchableOpacity disabled={!!vipReviewBusyId} style={styles.reviewButton} onPress={() => reviewVipRequest(request,'reviewing')}><Text style={styles.actionText}>قيد المراجعة</Text></TouchableOpacity>
                <TouchableOpacity disabled={!!vipReviewBusyId} style={styles.doneButton} onPress={() => reviewVipRequest(request,'approved')}><Text style={styles.actionText}>{vipReviewBusyId === request.id ? 'جارٍ...' : 'اعتماد وتفعيل VIP'}</Text></TouchableOpacity>
                <TouchableOpacity disabled={!!vipReviewBusyId} style={styles.dismissButton} onPress={() => reviewVipRequest(request,'rejected')}><Text style={styles.actionText}>رفض الطلب</Text></TouchableOpacity>
              </View>
            </View>
          ))}

          <View style={styles.sectionHeader} onLayout={rememberSection('vip')}>
            <Text style={styles.sectionTitle}>🎁 مكافآت دعوات VIP</Text>
            <TouchableOpacity onPress={loadDashboard}><Text style={styles.refresh}>تحديث ↻</Text></TouchableOpacity>
          </View>
          <Text style={styles.memberHint}>هذه مزايا مجانية وليست أموالًا أو عملات. راجع الدعوات قبل الاعتماد. النظام يمنح فقط الفرق اللازم للوصول إلى إجمالي 7 أو 15 أو 30 يوم VIP خلال الشهر، وبحد أقصى 30 يومًا.</Text>
          {referralVipRewards.filter(item => ['pending','reviewing'].includes(item.status)).length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>لا توجد مكافآت دعوات تنتظر المراجعة.</Text></View>
          ) : referralVipRewards.filter(item => ['pending','reviewing'].includes(item.status)).map(reward => (
            <View key={reward.id} style={styles.reportCard}>
              <View style={styles.reportTop}>
                <Text style={styles.status}>{reward.status === 'reviewing' ? 'قيد المراجعة' : 'جديدة'}</Text>
                <Text style={styles.reason}>{reward.milestone_invites} دعوات ناجحة</Text>
              </View>
              <Text style={styles.person}>العضو: {reward.display_name || 'عضو'}</Text>
              <Text style={styles.person}>الهدف: {reward.target_vip_days} يوم VIP إجماليًا</Text>
              <Text style={styles.person}>الفترة: {reward.period_start}</Text>
              <Text style={styles.memberId}>معرّف العضو: {reward.user_id}</Text>
              <View style={styles.actions}>
                <TouchableOpacity disabled={!!referralRewardBusyId} style={styles.reviewButton} onPress={() => reviewReferralVipReward(reward,'reviewing')}><Text style={styles.actionText}>قيد المراجعة</Text></TouchableOpacity>
                <TouchableOpacity disabled={!!referralRewardBusyId} style={styles.doneButton} onPress={() => reviewReferralVipReward(reward,'approved')}><Text style={styles.actionText}>{referralRewardBusyId === reward.id ? 'جارٍ...' : 'اعتماد VIP المجاني'}</Text></TouchableOpacity>
                <TouchableOpacity disabled={!!referralRewardBusyId} style={styles.dismissButton} onPress={() => reviewReferralVipReward(reward,'rejected')}><Text style={styles.actionText}>رفض</Text></TouchableOpacity>
              </View>
            </View>
          ))}

          <View style={styles.sectionHeader} onLayout={rememberSection('coins')}>
            <Text style={styles.sectionTitle}>🪙 طلبات شراء العملات</Text>
            <TouchableOpacity onPress={loadDashboard}><Text style={styles.refresh}>تحديث ↻</Text></TouchableOpacity>
          </View>
          <Text style={styles.memberHint}>لا تعتمد أي طلب إلا بعد التحقق من وصول التحويل فعليًا. الاعتماد يضيف العملات مرة واحدة ويسجل الحركة.</Text>
          <TextInput value={coinReviewNote} onChangeText={setCoinReviewNote}
            placeholder="ملاحظة للأدمن (اختياري)" placeholderTextColor="#8F849F" style={styles.searchInput} multiline maxLength={1000} />
          {coinPurchaseRequests.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>لا توجد طلبات شراء عملات حتى الآن.</Text></View>
          ) : coinPurchaseRequests.map(request => (
            <View key={request.id} style={styles.reportCard}>
              <View style={styles.reportTop}>
                <Text style={styles.status}>{({pending:'جديد',reviewing:'قيد المراجعة',approved:'معتمد',rejected:'مرفوض'})[request.status] || request.status}</Text>
                <Text style={styles.reason}>{request.payment_method === 'vodafone_cash' ? 'فودافون كاش' : request.payment_method === 'bank_transfer' ? 'تحويل بنكي' : 'إنستاباي'}</Text>
              </View>
              <Text style={styles.person}>المبلغ: {Number(request.requested_amount_egp || 0).toLocaleString('ar-EG')} جنيه</Text>
              <Text style={styles.person}>العملات المطلوبة: {Number(request.requested_coins || 0).toLocaleString('ar-EG')}</Text>
              {!!request.proofUrl && <Image source={{uri:request.proofUrl}} style={{width:'100%',height:260,resizeMode:'contain',marginVertical:10,backgroundColor:'#100D18',borderRadius:10}} />}
              <Text style={styles.person}>{request.proof_storage_path ? 'صورة إيصال التحويل مرفقة' : 'لا توجد صورة مرفقة لهذا الطلب القديم'}</Text>
              <Text style={styles.memberId}>معرّف العضو: {request.user_id}</Text>
              <Text style={styles.date}>{new Date(request.created_at).toLocaleString('ar-EG')}</Text>
              {request.status !== 'approved' && request.status !== 'rejected' && (
                <View style={styles.actions}>
                  <TouchableOpacity disabled={!!coinReviewBusyId} style={styles.reviewButton} onPress={() => reviewCoinPurchase(request,'reviewing')}><Text style={styles.actionText}>قيد المراجعة</Text></TouchableOpacity>
                  <TouchableOpacity disabled={!!coinReviewBusyId} style={styles.doneButton} onPress={() => reviewCoinPurchase(request,'approved')}><Text style={styles.actionText}>{coinReviewBusyId === request.id ? 'جارٍ...' : 'اعتماد وإضافة العملات'}</Text></TouchableOpacity>
                  <TouchableOpacity disabled={!!coinReviewBusyId} style={styles.dismissButton} onPress={() => reviewCoinPurchase(request,'rejected')}><Text style={styles.actionText}>رفض الطلب</Text></TouchableOpacity>
                </View>
              )}
              {request.status !== 'approved' && (
                <TouchableOpacity
                  disabled={!!coinDeleteBusyId}
                  style={[styles.deleteRequestButton, coinDeleteBusyId === request.id && { opacity: 0.55 }]}
                  onPress={() => deleteCoinPurchaseRequest(request)}
                >
                  <Text style={styles.actionText}>{coinDeleteBusyId === request.id ? 'جارٍ الحذف...' : '🗑 حذف الطلب والإيصال'}</Text>
                </TouchableOpacity>
              )}
              {!!request.admin_note && <Text style={styles.details}>ملاحظة الإدارة: {request.admin_note}</Text>}
            </View>
          ))}


          <View style={styles.sectionHeader} onLayout={rememberSection('withdrawals')}>
            <Text style={styles.sectionTitle}>💸 طلبات سحب الأرباح</Text>
            <TouchableOpacity onPress={loadDashboard}><Text style={styles.refresh}>تحديث ↻</Text></TouchableOpacity>
          </View>
          <Text style={styles.memberHint}>كل 100,000 نقطة = 500 جنيه. تحقق يدويًا من بيانات الاستلام، ولا تسجل «تم الصرف» إلا بعد تنفيذ التحويل فعليًا. رفض الطلب يعيد النقاط تلقائيًا للعضو.</Text>
          <TextInput value={withdrawalReviewNote} onChangeText={setWithdrawalReviewNote}
            placeholder="ملاحظة مراجعة السحب (اختياري)" placeholderTextColor="#8F849F"
            style={styles.searchInput} multiline maxLength={1000} />
          {withdrawalRequests.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>لا توجد طلبات سحب حتى الآن.</Text></View>
          ) : withdrawalRequests.map(request => (
            <View key={request.id} style={styles.reportCard}>
              <View style={styles.reportTop}>
                <Text style={styles.status}>{({pending:'جديد',reviewing:'قيد المراجعة',approved:'معتمد - بانتظار التحويل',rejected:'مرفوض',paid:'تم الصرف'})[request.status] || request.status}</Text>
                <Text style={styles.reason}>{request.payout_method === 'vodafone_cash' ? 'فودافون كاش' : request.payout_method === 'bank_transfer' ? 'تحويل بنكي' : 'إنستاباي'}</Text>
              </View>
              <Text style={styles.person}>العضو: {request.display_name || 'عضو بدون اسم'}</Text>
              <Text style={styles.person}>النقاط: {Number(request.points_requested || 0).toLocaleString('ar-EG')}</Text>
              <Text style={styles.person}>المبلغ: {Number(request.amount_egp || 0).toLocaleString('ar-EG')} جنيه</Text>
              <Text style={styles.person}>بيانات الاستلام: {request.payout_details || 'غير متاحة'}</Text>
              <Text style={styles.memberId}>معرّف العضو: {request.user_id}</Text>
              <Text style={styles.date}>{request.created_at ? new Date(request.created_at).toLocaleString('ar-EG') : ''}</Text>
              {request.status === 'pending' && (
                <View style={styles.actions}>
                  <TouchableOpacity disabled={!!withdrawalBusyId} style={styles.reviewButton} onPress={() => reviewWithdrawal(request,'reviewing')}><Text style={styles.actionText}>قيد المراجعة</Text></TouchableOpacity>
                  <TouchableOpacity disabled={!!withdrawalBusyId} style={styles.doneButton} onPress={() => reviewWithdrawal(request,'approved')}><Text style={styles.actionText}>اعتماد الطلب</Text></TouchableOpacity>
                  <TouchableOpacity disabled={!!withdrawalBusyId} style={styles.dismissButton} onPress={() => reviewWithdrawal(request,'rejected')}><Text style={styles.actionText}>رفض وإعادة النقاط</Text></TouchableOpacity>
                </View>
              )}
              {request.status === 'reviewing' && (
                <View style={styles.actions}>
                  <TouchableOpacity disabled={!!withdrawalBusyId} style={styles.doneButton} onPress={() => reviewWithdrawal(request,'approved')}><Text style={styles.actionText}>اعتماد الطلب</Text></TouchableOpacity>
                  <TouchableOpacity disabled={!!withdrawalBusyId} style={styles.dismissButton} onPress={() => reviewWithdrawal(request,'rejected')}><Text style={styles.actionText}>رفض وإعادة النقاط</Text></TouchableOpacity>
                </View>
              )}
              {request.status === 'approved' && (
                <TouchableOpacity disabled={!!withdrawalBusyId} style={styles.doneButton} onPress={() => reviewWithdrawal(request,'paid')}>
                  <Text style={styles.actionText}>{withdrawalBusyId === request.id ? 'جارٍ...' : 'تسجيل التحويل بعد صرفه فعليًا'}</Text>
                </TouchableOpacity>
              )}
              {!!request.admin_note && <Text style={styles.details}>ملاحظة الإدارة: {request.admin_note}</Text>}
            </View>
          ))}

          <View style={styles.sectionHeader} onLayout={rememberSection('finance')}>
            <Text style={styles.sectionTitle}>📊 مراجعة نسب الهدايا</Text>
          </View>
          <View style={styles.financialPanel}>
            <Text style={styles.financialMargin}>الهدايا النشطة: {giftCatalog.filter(item => item.active).length} من {giftCatalog.length}</Text>
            <Text style={styles.memberHint}>تقسيم 70/30 يُقرب إلى نقاط صحيحة في كل عملية إرسال؛ لذلك قد تختلف النسبة في الهدية الصغيرة الواحدة.</Text>
            {giftCatalog.filter(item => item.active && Number(item.gross_points) > 0)
              .filter(item => {
                const hostPoints = Math.round(Number(item.gross_points) * 0.70);
                const share = hostPoints / Number(item.gross_points);
                return share < 0.69 || share > 0.71;
              }).map(item => {
                const hostPoints = Math.round(Number(item.gross_points) * 0.70);
                const platformPoints = Number(item.gross_points) - hostPoints;
                return (
                  <View key={item.id} style={styles.financialLine}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.financialLabel}>{item.name} — {Number(item.coin_cost).toLocaleString('en-US')} عملة</Text>
                      <Text style={styles.memberHint}>المضيف {hostPoints} نقطة / المنصة {platformPoints} نقطة</Text>
                    </View>
                    <Text style={styles.financialValue}>{(hostPoints / Number(item.gross_points) * 100).toFixed(0)}%</Text>
                  </View>
                );
              })}
            {giftCatalog.length === 0 && <Text style={styles.memberHint}>تعذر تحميل قائمة الهدايا للمراجعة.</Text>}
          </View>

          <View style={styles.sectionHeader} onLayout={rememberSection('finance')}>
            <Text style={styles.sectionTitle}>📊 محاكاة ربحية الباقات والهدايا</Text>
          </View>
          <Text style={styles.memberHint}>أداة حساب داخلية فقط. أدخل الرسوم والقيم من عقود موثقة. لا تغيّر أرصدة ولا تعتمد أسعارًا أو مدفوعات.</Text>
          <View style={styles.financialPanel}>
            <Text style={styles.financialHeading}>بيانات الباقة والاستهلاك</Text>
            {[
              ['packagePriceEgp', 'سعر الباقة بالجنيه'],
              ['packageCoins', 'إجمالي العملات في الباقة'],
              ['giftCoinsSpent', 'العملات المستهلكة في الهدايا'],
              ['hostRedeemablePoints', 'نقاط المضيف القابلة للتحويل'],
              ['egpPerHostPoint', 'قيمة نقطة المضيف بالجنيه'],
            ].map(([key, label]) => (
              <View key={key} style={styles.financialField}>
                <Text style={styles.financialLabel}>{label}</Text>
                <TextInput keyboardType="decimal-pad" value={financialInputs[key]}
                  onChangeText={value => updateFinancialInput(key, value)}
                  placeholder="أدخل قيمة موثقة" placeholderTextColor="#8F849F" style={styles.financialInput} />
              </View>
            ))}
            <Text style={styles.financialHeading}>الرسوم والتكاليف والنسبة المستهدفة</Text>
            {[
              ['paymentFeePercent', 'عمولة الدفع %'],
              ['storeFeePercent', 'عمولة المتجر %'],
              ['taxPercent', 'الضرائب %'],
              ['refundReservePercent', 'احتياطي الاسترداد %'],
              ['payoutFeePercent', 'عمولة صرف أرباح المضيف %'],
              ['paymentFixedFeeEgp', 'رسوم دفع ثابتة بالجنيه'],
              ['payoutFixedFeeEgp', 'رسوم صرف ثابتة بالجنيه'],
              ['allocatedOperatingCostEgp', 'التكلفة التشغيلية المخصصة للباقة بالجنيه'],
              ['targetMarginPercent', 'هامش الربح المستهدف %'],
            ].map(([key, label]) => (
              <View key={key} style={styles.financialField}>
                <Text style={styles.financialLabel}>{label}</Text>
                <TextInput keyboardType="decimal-pad" value={financialInputs[key]}
                  onChangeText={value => updateFinancialInput(key, value)}
                  placeholder="0" placeholderTextColor="#8F849F" style={styles.financialInput} />
              </View>
            ))}
            <TouchableOpacity style={styles.calculateButton} onPress={runFinancialSimulation}>
              <Text style={styles.actionText}>احسب الربحية الآن</Text>
            </TouchableOpacity>
            {!!financialError && <Text style={styles.financialError}>{financialError}</Text>}
            {financialResult && (
              <View style={styles.financialResult}>
                <Text style={styles.financialHeading}>نتيجة المحاكاة</Text>
                <Text style={[styles.financialStatus, financialResult.status === 'LOSS' ? styles.financialLoss : financialResult.status === 'PASS' ? styles.financialPass : styles.financialWarning]}>
                  {financialResult.status === 'LOSS' ? 'خسارة' : financialResult.status === 'PASS' ? 'اجتاز هامش الربح المستهدف' : 'ربح أقل من الهامش المستهدف'}
                </Text>
                {[
                  ['قيمة العملات المستهلكة', financialResult.allocatedGrossEgp],
                  ['عمولة الدفع', financialResult.paymentFeesEgp],
                  ['عمولة المتجر', financialResult.storeFeesEgp],
                  ['الضرائب', financialResult.taxesEgp],
                  ['احتياطي الاسترداد', financialResult.refundReserveEgp],
                  ['التكلفة التشغيلية', financialResult.operatingCostEgp],
                  ['التزام المضيف النقدي', financialResult.hostLiabilityEgp],
                  ['رسوم صرف المضيف', financialResult.payoutFeesEgp],
                  ['صافي مساهمة المنصة', financialResult.platformContributionEgp],
                ].map(([label, value]) => (
                  <View key={label} style={styles.financialLine}>
                    <Text style={styles.financialLabel}>{label}</Text>
                    <Text style={styles.financialValue}>{Number(value).toFixed(2)} ج.م</Text>
                  </View>
                ))}
                <Text style={styles.financialMargin}>هامش المساهمة: {financialResult.contributionMarginPercent.toFixed(2)}%</Text>
                <Text style={styles.memberHint}>قيمة العملة المحسوبة: {financialResult.coinValueEgp.toFixed(6)} ج.م. النتيجة تقديرية وتعتمد على صحة القيم المدخلة.</Text>
              </View>
            )}
          </View>

          <View style={styles.sectionHeader} onLayout={rememberSection('reports')}>
            <Text style={styles.sectionTitle}>🚩 بلاغات الأعضاء</Text>
            <TouchableOpacity onPress={loadDashboard}><Text style={styles.refresh}>تحديث ↻</Text></TouchableOpacity>
          </View>

          {reports.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyText}>لا توجد بلاغات مسجلة حاليًا.</Text></View>
          ) : reports.map(report => (
            <View key={report.id} style={styles.reportCard}>
              <View style={styles.reportTop}>
                <Text style={styles.status}>{statusLabels[report.status] || report.status}</Text>
                <Text style={styles.reason}>{reasonLabels[report.reason] || report.reason}</Text>
              </View>
              <Text style={styles.person}>المبلّغ: {report.reporter_name}</Text>
              <Text style={styles.person}>العضو المُبلّغ عنه: {report.reported_name}</Text>
              {report.live_room_id ? (
                <View style={styles.linkedLiveBox}>
                  <Text style={styles.linkedLiveTitle}>📺 بيانات البث المرتبط بالبلاغ أو بالعضو</Text>
                  <Text style={styles.person}>عنوان البث: {report.live_room_title || 'بث مباشر'}</Text>
                  <Text style={styles.person}>حالة البث: {report.live_room_status === 'live' ? 'مباشر الآن' : 'انتهى'}</Text>
                  <Text style={styles.date}>بدأ: {report.live_room_started_at ? new Date(report.live_room_started_at).toLocaleString('ar-EG') : 'غير متاح'}</Text>
                  {!!report.live_room_ended_at && <Text style={styles.date}>انتهى: {new Date(report.live_room_ended_at).toLocaleString('ar-EG')}</Text>}
                  {report.live_room_status === 'live' && (
                    <TouchableOpacity disabled={!!liveActionBusyId} style={styles.dismissButton}
                      onPress={() => endLiveRoom({ id: report.live_room_id, room_name: report.live_room_name, host_name: report.reported_name, title: report.live_room_title })}>
                      <Text style={styles.actionText}>{liveActionBusyId === report.live_room_id ? 'جارٍ إنهاء البث...' : 'مراجعة وإنهاء البث المرتبط'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <Text style={styles.memberHint}>لا يوجد بث محفوظ مرتبط بهذا العضو.</Text>
              )}
              {!!report.details && <Text style={styles.details}>{report.details}</Text>}
              <Text style={styles.date}>{new Date(report.created_at).toLocaleString('ar-EG')}</Text>
              <View style={styles.actions}>
                {report.status !== 'reviewing' && report.status !== 'actioned' && report.status !== 'dismissed' && (
                  <TouchableOpacity disabled={!!busyId} style={styles.reviewButton} onPress={() => updateStatus(report, 'reviewing')}>
                    <Text style={styles.actionText}>قيد المراجعة</Text>
                  </TouchableOpacity>
                )}
                {report.status !== 'actioned' && (
                  <TouchableOpacity disabled={!!busyId} style={styles.doneButton} onPress={() => updateStatus(report, 'actioned')}>
                    <Text style={styles.actionText}>تسجيل اتخاذ إجراء</Text>
                  </TouchableOpacity>
                )}
                {report.status !== 'dismissed' && (
                  <TouchableOpacity disabled={!!busyId} style={styles.dismissButton} onPress={() => updateStatus(report, 'dismissed')}>
                    <Text style={styles.actionText}>رفض البلاغ</Text>
                  </TouchableOpacity>
                )}
              </View>
              {busyId === report.id && <ActivityIndicator color="#F5C451" style={{ marginTop: 10 }} />}
            </View>
          ))}
        </>
      )}
      <Text style={styles.footer}>صلاحيات عرض بيانات الأعضاء والبلاغات محمية بسياسات قاعدة البيانات المعتمدة على app_metadata.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#0B0912', padding: 20, paddingTop: 42 },
  back: { alignSelf: 'flex-start', padding: 9 },
  backText: { color: '#F5C451', fontSize: 16, fontWeight: 'bold' },
  logo: { color: '#F5C451', fontSize: 25, fontWeight: 'bold', textAlign: 'center', marginTop: 12 },
  title: { color: '#fff', fontSize: 25, fontWeight: 'bold', textAlign: 'center', marginTop: 22 },
  subtitle: { color: '#AAA1B8', textAlign: 'center', marginTop: 8, marginBottom: 22 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48%', flexGrow: 1, backgroundColor: '#191424', borderRadius: 13, padding: 14, alignItems: 'center' },
  statEmoji: { fontSize: 23 },
  statValue: { color: '#F5C451', fontSize: 23, fontWeight: 'bold', marginTop: 5 },
  statLabel: { color: '#DDD6E7', fontSize: 12, marginTop: 4 },
  quickNav: { flexDirection: 'row', gap: 8, paddingVertical: 12, paddingBottom: 18 },
  quickNavButton: { backgroundColor: '#241B31', borderColor: '#5B477B', borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9 },
  quickNavText: { color: '#F5C451', fontSize: 12, fontWeight: 'bold' },
  deleteRequestButton: { backgroundColor: '#8A263D', borderRadius: 9, padding: 12, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#D75C70' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 12 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  refresh: { color: '#F5C451', fontWeight: 'bold' },
  searchInput: { backgroundColor: '#191424', borderColor: '#3B304B', borderWidth: 1, borderRadius: 10, color: '#fff', paddingHorizontal: 13, paddingVertical: 12, textAlign: 'right' },
  memberHint: { color: '#8F849F', fontSize: 11, textAlign: 'right', marginVertical: 9 },
  memberCard: { backgroundColor: '#191424', borderRadius: 12, padding: 14, marginBottom: 9, borderWidth: 1, borderColor: '#3B304B' },
  memberName: { color: '#F5C451', fontSize: 16, fontWeight: 'bold', textAlign: 'right', marginBottom: 5 },
  memberId: { color: '#756A83', fontSize: 10, textAlign: 'left', marginTop: 8 },
  notice: { color: '#E9C77A', backgroundColor: '#302719', padding: 12, borderRadius: 9, textAlign: 'right', fontSize: 12, lineHeight: 19, marginTop: 4 },
  suspensionPanel: { backgroundColor: '#191424', borderRadius: 12, padding: 13, marginTop: 10, borderWidth: 1, borderColor: '#5B477B' },
  suspensionTitle: { color: '#F5C451', fontWeight: 'bold', textAlign: 'right', marginBottom: 10 },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10, justifyContent: 'flex-end' },
  durationChip: { borderWidth: 1, borderColor: '#5B477B', borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7 },
  durationChipActive: { backgroundColor: '#5B477B' },
  durationText: { color: '#fff', fontSize: 11 },
  suspendButtons: { alignItems: 'flex-end', marginTop: 12 },
  suspendButton: { backgroundColor: '#8A3147', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 },
  suspendedBox: { backgroundColor: '#351B27', borderRadius: 9, padding: 10, marginTop: 10 },
  suspendedText: { color: '#FF9EAA', fontWeight: 'bold', textAlign: 'right' },
  suspensionReason: { color: '#E5D7E1', textAlign: 'right', fontSize: 12, marginTop: 5 },
  unsuspendButton: { backgroundColor: '#276B4A', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, alignSelf: 'flex-end', marginTop: 10 },

  auditCard: { backgroundColor: '#191424', borderRadius: 12, padding: 14, marginBottom: 9, borderWidth: 1, borderColor: '#5B477B' },
  auditAction: { fontSize: 13, fontWeight: 'bold' },
  auditSuspend: { color: '#FF9EAA' },
  auditUnsuspend: { color: '#83D7A8' },
  auditLiveEnd: { color: '#FF9EAA' },
  auditDate: { color: '#8F849F', fontSize: 10, textAlign: 'left', flexShrink: 1 },
  auditMeta: { color: '#C8B9DC', textAlign: 'right', fontSize: 12, marginTop: 7 },
  auditReason: { color: '#F5C451', textAlign: 'right', marginTop: 8, lineHeight: 20 },
  financialPanel: { backgroundColor: '#191424', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#5B477B' },
  financialHeading: { color: '#F5C451', fontWeight: 'bold', textAlign: 'right', marginTop: 10, marginBottom: 8 },
  financialField: { marginBottom: 9 },
  financialLabel: { color: '#DDD6E7', textAlign: 'right', fontSize: 12, marginBottom: 5 },
  financialInput: { backgroundColor: '#0B0912', borderColor: '#3B304B', borderWidth: 1, borderRadius: 9, color: '#fff', paddingHorizontal: 12, paddingVertical: 10, textAlign: 'right' },
  calculateButton: { backgroundColor: '#5B477B', borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 12 },
  financialError: { color: '#FF9EAA', textAlign: 'right', marginTop: 10 },
  financialResult: { backgroundColor: '#241B31', borderRadius: 10, padding: 12, marginTop: 14 },
  financialStatus: { textAlign: 'center', fontWeight: 'bold', fontSize: 16, marginVertical: 8 },
  financialLoss: { color: '#FF8585' },
  financialPass: { color: '#83D7A8' },
  financialWarning: { color: '#E9C77A' },
  financialLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#3B304B' },
  financialValue: { color: '#fff', fontWeight: 'bold' },
  financialMargin: { color: '#F5C451', textAlign: 'center', fontWeight: 'bold', marginTop: 10 },
  reportCard: { backgroundColor: '#191424', borderRadius: 14, padding: 15, marginBottom: 12, borderWidth: 1, borderColor: '#3B304B' },
  linkedLiveBox: { backgroundColor: '#241B31', borderRadius: 10, borderWidth: 1, borderColor: '#5B477B', padding: 11, marginTop: 10 },
  linkedLiveTitle: { color: '#F5C451', fontWeight: 'bold', textAlign: 'right', marginBottom: 5 },
  reportTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 },
  reason: { color: '#F5C451', fontWeight: 'bold', flex: 1, textAlign: 'right' },
  status: { color: '#C8B9DC', fontSize: 12 },
  person: { color: '#fff', textAlign: 'right', marginTop: 5 },
  details: { color: '#DDD6E7', textAlign: 'right', marginTop: 10, lineHeight: 21 },
  date: { color: '#8F849F', textAlign: 'right', fontSize: 11, marginTop: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 },
  reviewButton: { backgroundColor: '#5B477B', padding: 10, borderRadius: 9 },
  doneButton: { backgroundColor: '#276B4A', padding: 10, borderRadius: 9 },
  dismissButton: { backgroundColor: '#733347', padding: 10, borderRadius: 9 },
  actionText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  empty: { backgroundColor: '#191424', padding: 20, borderRadius: 12 },
  emptyText: { color: '#AAA1B8', textAlign: 'center' },
  error: { color: '#FF8585', textAlign: 'center', marginVertical: 12 },
  footer: { color: '#8F849F', textAlign: 'center', fontSize: 11, marginTop: 24, lineHeight: 18 },
});
