import React from 'react';
import { Text, View } from 'react-native';

export default function TitleBadge({ code, title, emoji, compact = false }) {
  if (!code && !title) return null;
  const label = title || ({title_star:'نجم YOYO',title_royal:'الملك',title_legend:'أسطورة YOYO',title_lion:'الليث',title_diamond:'الماسي',title_emperor:'الإمبراطور'}[code] || 'لقب YOYO');
  const mark = emoji || ({title_star:'🌟',title_royal:'👑',title_legend:'🏆',title_lion:'🦁',title_diamond:'💎',title_emperor:'🏆'}[code] || '✦');
  const tone = ({title_star:'#A9B7C9',title_royal:'#F5C451',title_legend:'#E46B45',title_lion:'#D69A48',title_diamond:'#7DDCF5',title_emperor:'#C19BFF'}[code] || '#C19BFF');
  return (
    <View style={{alignSelf:'flex-end',flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:compact?6:9,paddingVertical:compact?3:5,borderRadius:8,backgroundColor:tone+'18',borderWidth:1,borderColor:tone+'88',marginTop:compact?2:5}}>
      <Text style={{color:tone,fontSize:compact?9:11,fontWeight:'900'}}>{label}</Text>
      <Text style={{fontSize:compact?10:12}}>{mark}</Text>
    </View>
  );
}
