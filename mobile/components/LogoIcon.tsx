import React from 'react';
import { Image, StyleSheet } from 'react-native';

export default function LogoIcon({ size = 28 }: { size?: number }) {
  return (
    <Image 
      source={require('../assets/icon.png')} 
      style={{ width: size, height: size, borderRadius: size * 0.2 }} 
    />
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
    position: 'relative',
    overflow: 'hidden',
  },
  arrowBlue: {
    position: 'absolute',
    backgroundColor: '#3b82f6',
  },
  arrowGreen: {
    position: 'absolute',
    backgroundColor: '#10b981',
  }
});
