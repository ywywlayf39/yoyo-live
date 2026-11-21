import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';

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
  const [coinReviewNote, setCoinReviewNote] = useState('');
  const [coinReviewBusyId, setCoinReviewBusyId] = useState(null);


  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    const [summaryResult, reportsResult, membersResult, suspensionsResult, auditResult, liveRoomsResult, coinRequestsResult] = await Promise.all([
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
    ]);

    if (summaryResult.error || reportsResult.error || membersResult.error) {
      console.error('YOYO admin dashboard failed:', summaryResult.error || reportsResult.error || membersResult.error);
      setError('تعذر تحميل بعض بيانات الإدارة. تأكد من تحديث تسجيل الدخول ثم حاول مرة أخرى.');
    }
    setSummary(summaryResult.error ? null : (summaryResult.data || {}));
    setReports(reportsResult.error ? [] : (reportsResult.data || []));
    setMembers(membersResult.error ? [] : (membersResult.data || []));
    setLiveRooms(liveRoomsResult.error ? [] : (liveRoomsResult.data || []));
    setCoinPurchaseRequests(coinRequestsResult.error ? [] : (coinRequestsResult.data || []));
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
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.back}><Text style={styles.backText}>رجوع ←</Text></TouchableOpacity>
      <Text style={styles.logo}>YOYO LIVE 💗</Text>
      <Text style={styles.title}>لوحة الإدارة</Text>
      <Text style={styles.subtitle}>إدارة الأعضاء ومتابعة البلاغات ونشاط المنصة</Text>

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

          <View style={styles.sectionHeader}>
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

          <View style={styles.sectionHeader}>
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

          <View style={styles.sectionHeader}>
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

          <View style={styles.sectionHeader}>
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
                <Text style={styles.reason}>{request.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'إنستاباي'}</Text>
              </View>
              <Text style={styles.person}>المبلغ: {Number(request.requested_amount_egp || 0).toLocaleString('ar-EG')} جنيه</Text>
              <Text style={styles.person}>العملات المطلوبة: {Number(request.requested_coins || 0).toLocaleString('ar-EG')}</Text>
              <Text style={styles.person}>مرجع التحويل: {request.transfer_reference || 'غير مضاف'}</Text>
              <Text style={styles.memberId}>معرّف العضو: {request.user_id}</Text>
              <Text style={styles.date}>{new Date(request.created_at).toLocaleString('ar-EG')}</Text>
              {request.status !== 'approved' && request.status !== 'rejected' && (
                <View style={styles.actions}>
                  <TouchableOpacity disabled={!!coinReviewBusyId} style={styles.reviewButton} onPress={() => reviewCoinPurchase(request,'reviewing')}><Text style={styles.actionText}>قيد المراجعة</Text></TouchableOpacity>
                  <TouchableOpacity disabled={!!coinReviewBusyId} style={styles.doneButton} onPress={() => reviewCoinPurchase(request,'approved')}><Text style={styles.actionText}>{coinReviewBusyId === request.id ? 'جارٍ...' : 'اعتماد وإضافة العملات'}</Text></TouchableOpacity>
                  <TouchableOpacity disabled={!!coinReviewBusyId} style={styles.dismissButton} onPress={() => reviewCoinPurchase(request,'rejected')}><Text style={styles.actionText}>رفض الطلب</Text></TouchableOpacity>
                </View>
              )}
              {!!request.admin_note && <Text style={styles.details}>ملاحظة الإدارة: {request.admin_note}</Text>}
            </View>
          ))}

          <View style={styles.sectionHeader}>
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
