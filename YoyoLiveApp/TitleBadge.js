import React from 'react';
import { Text, View } from 'react-native';

export default function TitleBadge({ code, title, emoji, compact = false }) {
  if (!code && !title) return null;
  const label = title || ({star:'النجم',lion:'الليث',legend:'الأسطورة',king:'ملك YOYO',diamond:'الماسي',emperor:'الإمبراطور'}[code] || 'لقب YOYO');
  const mark = emoji || ({star:'⭐',lion:'🦁',legend:'🔥',king:'👑',diamond:'💎',emperor:'🏆'}[code] || '✦');
  const tone = ({star:'#A9B7C9',lion:'#D69A48',legend:'#E46B45',king:'#F5C451',diamond:'#7DDCF5',emperor:'#C19BFF'}[code] || '#C19BFF');
  return (
    <View style={{alignSelf:'flex-end',flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:compact?6:9,paddingVertical:compact?3:5,borderRadius:8,backgroundColor:tone+'18',borderWidth:1,borderColor:tone+'88',marginTop:compact?2:5}}>
      <Text style={{color:tone,fontSize:compact?9:11,fontWeight:'900'}}>{label}</Text>
      <Text style={{fontSize:compact?10:12}}>{mark}</Text>
    </View>
  );
}
