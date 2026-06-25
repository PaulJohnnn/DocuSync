import React from 'react';
import { View, Image } from 'react-native';

export default function LogoIcon({ size = 28 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.22, overflow: 'hidden' }}>
      <Image 
        source={require('../assets/icon.png')} 
        style={{ width: '100%', height: '100%', resizeMode: 'cover' }} 
      />
    </View>
  );
}
