import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Main: undefined;
};

type WelcomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Welcome'>;

export default function WelcomeScreen() {
  const navigation = useNavigation<WelcomeScreenNavigationProp>();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      {/* Background orbs can be simple circles in React Native */}
      <View style={[styles.orb, { top: -50, left: -50, backgroundColor: 'rgba(79,125,248,0.1)' }]} />
      <View style={[styles.orb, { bottom: -50, right: -50, backgroundColor: 'rgba(99,76,230,0.1)' }]} />

      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Ionicons name="document-text" size={60} color="#4f7df8" />
        </View>

        <Text style={styles.title}>Welcome to DocuSync</Text>
        <Text style={styles.description}>
          The ultimate decentralized workspace. Experience seamless, peer-to-peer file synchronization with zero cloud reliance. Secure, lightning-fast, and entirely yours.
        </Text>

        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Ionicons name="shield-checkmark" size={24} color="#8b5cf6" style={styles.icon} />
            <View>
              <Text style={styles.featureTitle}>Local Encryption</Text>
              <Text style={styles.featureText}>Your vault is secured with a local PIN. Your files never leave your trusted devices.</Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Ionicons name="git-network" size={24} color="#22c55e" style={styles.icon} />
            <View>
              <Text style={styles.featureTitle}>Peer-to-Peer</Text>
              <Text style={styles.featureText}>Sync directly with your other computers on the local network using WebSockets.</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.button}
          onPress={async () => {
            await AsyncStorage.setItem('docusync_has_seen_welcome', 'true');
            navigation.navigate('Login');
          }}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070b14', // Matches desktop vault background
    justifyContent: 'center',
    padding: 24,
  },
  orb: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  logoContainer: {
    width: 90,
    height: 90,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(79,125,248,0.2)',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
    paddingHorizontal: 10,
  },
  features: {
    width: '100%',
    marginBottom: 40,
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: 24,
    paddingRight: 20,
  },
  icon: {
    marginRight: 16,
    marginTop: 2,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  featureText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 20,
  },
  button: {
    width: '100%',
    height: 54,
    backgroundColor: '#4f7df8',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4f7df8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
