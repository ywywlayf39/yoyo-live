import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';

const FRAME_STYLES = {
  vip_gold: { edge:'#F5C451', glow:'#FFF0A8', label:'VIP', crest:'♛', side:'✦', width:4, inner:'#9B6B22' },
  vip_diamond: { edge:'#82D9FF', glow:'#E4FAFF', label:'DIAMOND', crest:'💎', side:'✧', width:3, inner:'#347F9A' },
  vip_rose: { edge:'#F47EB5', glow:'#FFD8EA', label:'ROSE', crest:'🌹', side:'❀', width:4, inner:'#9A416B' },
  vip_royal: { edge:'#B78BFF', glow:'#E9D8FF', label:'ROYAL', crest:'♛', side:'◆', width:5, inner:'#7040A8' },
  vip_fire: { edge:'#FF704D', glow:'#FFD0A8', label:'FIRE', crest:'🔥', side:'✹', width:4, inner:'#9D3928' },
  vip_galaxy: { edge:'#A78BFA', glow:'#E3D7FF', label:'GALAXY', crest:'🌌', side:'✦', width:4, inner:'#49317F' },
  vip_ice: { edge:'#72D8E8', glow:'#D8FFFF', label:'ICE', crest:'❄', side:'✧', width:3, inner:'#397E91' },
  vip_emerald: { edge:'#51D6A2', glow:'#D1FFEA', label:'EMERALD', crest:'❈', side:'◆', width:3, inner:'#267A58' },
};

export default function ProfileFrame({ frameCode, size = 112, children }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!FRAME_STYLES[frameCode]) return undefined;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue:1, duration:1150, useNativeDriver:true }),
      Animated.timing(pulse, { toValue:0, duration:1150, useNativeDriver:true }),
    ]));
    const tiltAnimation = Animated.loop(Animated.sequence([
      Animated.timing(tilt, { toValue:1, duration:2200, useNativeDriver:true }),
      Animated.timing(tilt, { toValue:0, duration:2200, useNativeDriver:true }),
    ]));
    animation.start(); tiltAnimation.start();
    return () => { animation.stop(); tiltAnimation.stop(); };
  }, [pulse,tilt,frameCode]);

  const frame = FRAME_STYLES[frameCode];
  if (!frame) return <View style={{ width:size,height:size }}>{children}</View>;
  const scale = pulse.interpolate({ inputRange:[0,1], outputRange:[1,1.045] });
  const glowOpacity = pulse.interpolate({ inputRange:[0,1], outputRange:[0.55,1] });
  const rotateY = tilt.interpolate({ inputRange:[0,1], outputRange:['-4deg','4deg'] });
  const rotateX = tilt.interpolate({ inputRange:[0,1], outputRange:['2deg','-2deg'] });
  const ornamentSize = Math.max(10,size*0.15);
  return (
    <Animated.View style={{
      width:size,height:size,borderRadius:size/2,padding:Math.max(4,size*0.055),
      borderWidth:frame.width,borderColor:frame.edge,backgroundColor:frame.inner,
      shadowColor:frame.glow,shadowOpacity:0.95,shadowRadius:size*0.13,
      shadowOffset:{width:0,height:0},elevation:14,
      transform:[{perspective:700},{rotateY},{rotateX},{scale}],
    }}>
      <Animated.View style={{position:'absolute',top:-2,left:-2,right:-2,bottom:-2,borderRadius:size/2,borderWidth:1.5,borderColor:frame.glow,opacity:glowOpacity}}/>
      <View style={{flex:1,borderRadius:size/2,overflow:'hidden',borderWidth:1.5,borderColor:frame.glow,backgroundColor:'#21172D'}}>
        {children}
      </View>
      <View style={{position:'absolute',top:-size*0.025,alignSelf:'center',minWidth:size*0.32,paddingHorizontal:6,paddingVertical:1,borderRadius:9,backgroundColor:frame.edge,borderWidth:1,borderColor:'#FFF4D0',alignItems:'center'}}>
        <Text style={{color:'#21172D',fontSize:Math.max(7,size*0.065),fontWeight:'900',textAlign:'center',letterSpacing:0.5}}>{frame.label}</Text>
      </View>
      <Text style={{position:'absolute',left:size*0.02,top:size*0.37,color:frame.glow,fontSize:ornamentSize,textShadowColor:frame.edge,textShadowRadius:7}}>{frame.side}</Text>
      <Text style={{position:'absolute',right:size*0.02,top:size*0.37,color:frame.glow,fontSize:ornamentSize,textShadowColor:frame.edge,textShadowRadius:7}}>{frame.side}</Text>
      <View style={{position:'absolute',bottom:-size*0.025,alignSelf:'center',width:size*0.29,height:size*0.29,borderRadius:size,backgroundColor:frame.inner,borderWidth:1.5,borderColor:frame.edge,alignItems:'center',justifyContent:'center'}}>
        <Text style={{fontSize:size*0.14}}>{frame.crest}</Text>
      </View>
    </Animated.View>
  );
}
