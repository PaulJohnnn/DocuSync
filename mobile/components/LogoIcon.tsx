import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function LogoIcon({ size = 28 }: { size?: number }) {
  // A stylized approximation of the SVG logo using pure Views
  const s = size;
  return (
    <View style={[styles.container, { width: s, height: s, borderRadius: s * 0.25 }]}>
      <View style={[styles.arrowBlue, { 
        width: s * 0.45, height: s * 0.12, borderRadius: s * 0.06,
        top: s * 0.35, left: s * 0.2
      }]} />
      <View style={[styles.arrowGreen, { 
        width: s * 0.45, height: s * 0.12, borderRadius: s * 0.06,
        top: s * 0.55, left: s * 0.35
      }]} />
      {/* Tiny arrow heads */}
      <View style={[styles.arrowBlue, {
        width: s * 0.25, height: s * 0.12, borderRadius: s * 0.06,
        top: s * 0.28, left: s * 0.45, transform: [{ rotate: '45deg' }]
      }]} />
      <View style={[styles.arrowGreen, {
        width: s * 0.25, height: s * 0.12, borderRadius: s * 0.06,
        top: s * 0.62, left: s * 0.3, transform: [{ rotate: '45deg' }]
      }]} />
    </View>
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
