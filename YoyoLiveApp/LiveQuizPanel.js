import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from './supabase';

const C = {
  panel: '#191424',
  panel2: '#241B35',
  border: '#4B3154',
  pink: '#F34E9B',
  gold: '#F5C451',
  white: '#FFFFFF',
  muted: '#B8AFC2',
  green: '#2C8B68',
  red: '#8D344E',
};

const CATEGORIES = [
  { id: 'all', label: 'منوع' },
  { id: 'general', label: 'ثقافة' },
  { id: 'science', label: 'علوم' },
  { id: 'sports', label: 'رياضة' },
  { id: 'history', label: 'تاريخ' },
];

function getErrorMessage(error) {
  const message = String(error?.message || '');
  if (message.includes('quiz_already_active')) return 'فيه مسابقة شغالة بالفعل في البث ده.';
  if (message.includes('not_enough_quiz_questions')) return 'الأسئلة في التصنيف ده لسه مش كفاية. اختار منوع.';
  if (message.includes('host_only')) return 'التحكم في المسابقة متاح لصاحب البث فقط.';
  if (message.includes('already_answered')) return 'إجابتك اتسجلت بالفعل في السؤال ده.';
  if (message.includes('answer_window_closed')) return 'وقت الإجابة انتهى.';
  if (message.includes('join_live_room_first')) return 'ادخل البث الأول وبعدها شارك في المسابقة.';
  return 'حصلت مشكلة. حاول مرة تانية.';
}

export default function LiveQuizPanel({ roomName, userId, isHost }) {
  const [quizState, setQuizState] = useState(null);
  const [category, setCategory] = useState('all');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [clockNow, setClockNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    if (!roomName || !userId) return;
    const { data, error } = await supabase.rpc('yoyo_quiz_get_state', {
      p_room_name: roomName,
    });
    if (error) {
      setLoadError(getErrorMessage(error));
      return;
    }
    setLoadError('');
    setQuizState(data || null);
  }, [roomName, userId]);

  useEffect(() => {
    refresh();
    const channel = supabase.channel('yoyo-quiz-room-' + roomName)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'yoyo_quiz_sessions',
        filter: 'room_name=eq.' + roomName,
      }, refresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'yoyo_quiz_rounds',
      }, refresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'yoyo_quiz_participants',
      }, refresh)
      .subscribe((status) => { if (status === 'SUBSCRIBED') refresh(); });
    const clock = setInterval(() => setClockNow(Date.now()), 500);
    const refreshTimer = setInterval(refresh, 5000);
    return () => {
      clearInterval(clock);
      clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [roomName, refresh]);

  const session = quizState?.session || null;
  const question = quizState?.question || null;
  const leaderboard = quizState?.leaderboard || [];
  const secondsLeft = useMemo(() => {
    if (!question?.closes_at) return 0;
    return Math.max(0, Math.ceil((new Date(question.closes_at).getTime() - clockNow) / 1000));
  }, [question?.closes_at, clockNow]);
  const answered = !!question?.my_answer;
  const revealed = question?.correct_index !== null && question?.correct_index !== undefined;

  const startQuiz = async () => {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('yoyo_quiz_start', {
      p_room_name: roomName,
      p_category: category,
    });
    setBusy(false);
    if (error) {
      Alert.alert('تعذر بدء YOYO QUIZ', getErrorMessage(error));
      return;
    }
    await refresh();
  };

  const answer = async (index) => {
    if (busy || answered || secondsLeft <= 0 || !question?.id || !session?.id) return;
    setBusy(true);
    const { error } = await supabase.rpc('yoyo_quiz_answer', {
      p_session_id: session.id,
      p_round_id: question.id,
      p_answer_index: index,
    });
    setBusy(false);
    if (error) {
      Alert.alert('لم تُسجل الإجابة', getErrorMessage(error));
    } else {
      await refresh();
    }
  };

  const nextQuestion = async () => {
    if (busy || !session?.id) return;
    setBusy(true);
    const { error } = await supabase.rpc('yoyo_quiz_next', {
      p_session_id: session.id,
    });
    setBusy(false);
    if (error) {
      Alert.alert('تعذر الانتقال للسؤال التالي', getErrorMessage(error));
    } else {
      await refresh();
    }
  };

  if (!session) {
    if (!isHost) return null;
    return (
      <View style={styles.panel}>
        <View style={styles.headingRow}>
          <Text style={styles.title}>🎮 YOYO QUIZ</Text>
          <Text style={styles.tag}>لعبة مباشرة</Text>
        </View>
        <Text style={styles.description}>10 أسئلة سريعة · 15 ثانية لكل سؤال · نقاط وتحدي بين الجمهور</Text>
        <View style={styles.categories}>
          {CATEGORIES.map((item) => (
            <TouchableOpacity key={item.id}
              onPress={() => setCategory(item.id)}
              style={[styles.category, category === item.id && styles.categoryActive]}>
              <Text style={[styles.categoryText, category === item.id && styles.categoryTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.startButton} onPress={startQuiz} disabled={busy}>
          <Text style={styles.startText}>{busy ? 'جارٍ التجهيز...' : '▶ ابدأ المسابقة'}</Text>
        </TouchableOpacity>
        {!!loadError && <Text style={styles.error}>{loadError}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <Text style={styles.title}>🎮 YOYO QUIZ</Text>
        <Text style={styles.tag}>{session.status === 'active' ? 'مباشر' : 'انتهت المسابقة'}</Text>
      </View>
      {session.status !== 'active' ? (
        <View style={styles.finished}>
          <Text style={styles.finishedTitle}>🏆 انتهت المسابقة!</Text>
          <Text style={styles.description}>أبطال YOYO QUIZ النهارده</Text>
          {isHost ? <TouchableOpacity style={styles.startButton} onPress={startQuiz} disabled={busy}>
            <Text style={styles.startText}>{busy ? 'جارٍ التجهيز...' : '↻ ابدأ مسابقة جديدة'}</Text>
          </TouchableOpacity> : null}
        </View>
      ) : question ? (
        <>
          <View style={styles.questionMeta}>
            <Text style={styles.questionCount}>السؤال {question.position} من 10</Text>
            <Text style={[styles.timer, secondsLeft <= 5 && styles.timerUrgent]}>{secondsLeft} ثانية</Text>
          </View>
          <View style={styles.timerTrack}>
            <View style={[styles.timerFill, { width: (secondsLeft / 15 * 100) + '%' }]} />
          </View>
          <Text style={styles.questionText}>{question.question_text}</Text>
          <View style={styles.answers}>
            {(question.options || []).map((option, index) => {
              const isCorrect = revealed && question.correct_index === index;
              const isSelected = question.my_answer?.answer_index === index;
              return (
                <TouchableOpacity key={index}
                  disabled={isHost || answered || secondsLeft <= 0 || revealed || busy}
                  onPress={() => answer(index)}
                  style={[styles.answerOption, isSelected && styles.answerSelected, isCorrect && styles.answerCorrect]}>
                  <Text style={[styles.answerLetter, isCorrect && styles.answerCorrectText]}>{['أ','ب','ج','د'][index]}</Text>
                  <Text style={[styles.answerText, isCorrect && styles.answerCorrectText]}>{option}</Text>
                  {isSelected ? <Text style={styles.answerMark}>✓</Text> : null}
                  {isCorrect ? <Text style={styles.answerMark}>🏆</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
          {isHost ? (
            <TouchableOpacity style={styles.nextButton} onPress={nextQuestion} disabled={busy}>
              <Text style={styles.nextText}>{busy ? 'لحظة...' : question.position === 10 ? '🏁 إعلان النتيجة النهائية' : revealed || secondsLeft === 0 ? 'السؤال التالي ←' : 'إنهاء السؤال وكشف الإجابة ←'}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.viewerStatus}>
              {answered ? '✅ إجابتك اتسجلت! استنى النتيجة.' : secondsLeft === 0 ? '⏱️ انتهى وقت الإجابة.' : 'اختار إجابة واحدة بسرعة!'}
            </Text>
          )}
          {revealed ? <Text style={styles.reveal}>الإجابة الصحيحة: {question.options[question.correct_index]}</Text> : null}
        </>
      ) : (
        <Text style={styles.description}>جارٍ تحميل السؤال الحالي...</Text>
      )}
      <View style={styles.leaderboard}>
        <Text style={styles.leaderboardTitle}>🏆 لوحة المتصدرين</Text>
        {leaderboard.length ? leaderboard.slice(0, 5).map((player, index) => (
          <View key={player.display_name + '-' + index} style={styles.playerRow}>
            <Text style={styles.playerRank}>{index + 1}</Text>
            <Text style={styles.playerName} numberOfLines={1}>{player.display_name}</Text>
            <Text style={styles.playerScore}>{player.score} نقطة</Text>
          </View>
        )) : <Text style={styles.description}>أول إجابة هتظهر هنا. شارك وخليك في الصدارة!</Text>}
      </View>
      {!!loadError && <Text style={styles.error}>{loadError}</Text>}
      <Text style={styles.disclaimer}>النقاط للترتيب والتحدي فقط، وليست عملات أو رصيدًا قابلًا للسحب.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 12, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.panel },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: C.white, fontSize: 16, fontWeight: '900' },
  tag: { color: C.gold, fontSize: 11, fontWeight: 'bold', backgroundColor: '#3A2D2A', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  description: { color: C.muted, fontSize: 12, lineHeight: 19, marginTop: 8, textAlign: 'right' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  category: { borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.panel2 },
  categoryActive: { backgroundColor: C.pink, borderColor: C.pink },
  categoryText: { color: C.muted, fontSize: 12, fontWeight: 'bold' },
  categoryTextActive: { color: C.white },
  startButton: { backgroundColor: C.pink, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 12 },
  startText: { color: C.white, fontWeight: '900', fontSize: 14 },
  questionMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  questionCount: { color: C.muted, fontSize: 12, fontWeight: 'bold' },
  timer: { color: C.gold, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  timerUrgent: { color: '#FF6B7D' },
  timerTrack: { height: 5, borderRadius: 4, backgroundColor: C.panel2, overflow: 'hidden', marginTop: 7 },
  timerFill: { height: 5, backgroundColor: C.pink, borderRadius: 4 },
  questionText: { color: C.white, fontSize: 17, lineHeight: 25, fontWeight: 'bold', textAlign: 'right', marginTop: 14 },
  answers: { gap: 8, marginTop: 12 },
  answerOption: { minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: C.border, backgroundColor: C.panel2, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  answerSelected: { borderColor: C.pink, backgroundColor: '#4A2440' },
  answerCorrect: { borderColor: C.green, backgroundColor: '#1E493B' },
  answerLetter: { color: C.gold, fontSize: 13, fontWeight: '900', width: 22, textAlign: 'center' },
  answerText: { flex: 1, color: C.white, fontSize: 13, textAlign: 'right' },
  answerCorrectText: { color: '#A7F0C8', fontWeight: 'bold' },
  answerMark: { color: C.white, fontWeight: '900' },
  nextButton: { backgroundColor: '#3D3153', borderRadius: 11, padding: 12, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: '#765C92' },
  nextText: { color: C.white, fontWeight: 'bold', fontSize: 13 },
  viewerStatus: { color: C.gold, textAlign: 'center', fontSize: 12, fontWeight: 'bold', marginTop: 12 },
  reveal: { color: '#A7F0C8', textAlign: 'center', fontSize: 12, fontWeight: 'bold', marginTop: 9 },
  leaderboard: { borderTopWidth: 1, borderTopColor: '#382B44', marginTop: 14, paddingTop: 11 },
  leaderboardTitle: { color: C.gold, fontSize: 13, fontWeight: '900', marginBottom: 6 },
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#2D2338', gap: 9 },
  playerRank: { color: C.gold, width: 20, fontWeight: '900', textAlign: 'center' },
  playerName: { color: C.white, flex: 1, fontSize: 12, textAlign: 'right' },
  playerScore: { color: C.pink, fontSize: 12, fontWeight: 'bold' },
  finished: { alignItems: 'center', paddingVertical: 10 },
  finishedTitle: { color: C.gold, fontSize: 18, fontWeight: '900' },
  error: { color: '#FF9EAD', fontSize: 11, marginTop: 8, textAlign: 'center' },
  disclaimer: { color: '#8F8799', fontSize: 10, marginTop: 10, textAlign: 'center' },
});
