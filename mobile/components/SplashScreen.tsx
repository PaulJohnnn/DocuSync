import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet, Dimensions } from 'react-native';
import LogoIcon from './LogoIcon';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_WIDTH = 200;

export default function SplashScreen() {
  const barAnim    = useRef(new Animated.Value(0)).current;
  const fadeAnim   = useRef(new Animated.Value(1)).current;
  const logoScale  = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Logo pop-in
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 12,
        bounciness: 8,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Loading bar 0 → 100% in 1.8s
    Animated.timing(barAnim, {
      toValue: 1,
      duration: 1800,
      useNativeDriver: false,
    }).start();

    // Fade out at 2.0s
    const fadeTimer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, 2000);

    return () => clearTimeout(fadeTimer);
  }, []);

  const barWidth = barAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, BAR_WIDTH],
  });

  return (
    <Animated.View style={[styles.root, { opacity: fadeAnim }]}>
      {/* Logo */}
      <Animated.View style={{
        transform: [{ scale: logoScale }],
        opacity: logoOpacity,
        alignItems: 'center',
        marginBottom: 20,
      }}>
        <LogoIcon size={80} />
      </Animated.View>

      {/* Title */}
      <Text style={styles.title}>DocuSync</Text>
      <Text style={styles.subtitle}>Hybrid P2P Engine</Text>

      {/* Loading bar */}
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width: barWidth }]} />
      </View>
      <Text style={styles.loadingText}>Loading...</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0e18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#eef0f8',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#7e8ba8',
    marginBottom: 40,
    letterSpacing: 0.5,
  },
  barTrack: {
    width: 200,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 99,
    overflow: 'hidden',
    marginBottom: 12,
  },
  barFill: {
    height: 3,
    backgroundColor: '#4f7df8',
    borderRadius: 99,
  },
  loadingText: {
    fontSize: 10,
    color: '#3d4a65',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
