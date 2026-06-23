import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Main: undefined;
};

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const [status, setStatus] = useState<'loading' | 'genesis' | 'locked'>('loading');
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [generatedPin, setGeneratedPin] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    async function checkStatus() {
      try {
        const id = await AsyncStorage.getItem('docusync_node_id');
        const hash = await AsyncStorage.getItem('docusync_password_hash');
        
        setTimeout(() => {
          if (id && hash) {
            setStatus('locked');
            setNodeId(id);
          } else {
            setStatus('genesis');
            setGeneratedPin(Math.floor(10000000 + Math.random() * 90000000).toString());
          }
        }, 1000); // Small delay to show the nice background
      } catch (e) {
        setStatus('genesis');
        setGeneratedPin(Math.floor(10000000 + Math.random() * 90000000).toString());
      }
    }
    checkStatus();
  }, []);

  const handleGenesis = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const id = 'node-' + Math.random().toString(36).substring(2, 9);
      await AsyncStorage.setItem('docusync_node_id', id);
      await AsyncStorage.setItem('docusync_password_hash', generatedPin);
      await AsyncStorage.setItem('docusync_unlocked', 'true');
      
      Alert.alert('Account created!', `Your Node ID: ${id}`);
      navigation.replace('Main');
    } catch (err) {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const handleUnlock = async (pin: string) => {
    if (pin.length !== 8) return;
    try {
      const hash = await AsyncStorage.getItem('docusync_password_hash');
      if (pin === hash) {
        await AsyncStorage.setItem('docusync_unlocked', 'true');
        navigation.replace('Main');
      } else {
        setPinInput('');
        Alert.alert('Error', 'Incorrect PIN — please try again.');
        inputRef.current?.focus();
      }
    } catch (e) {
      Alert.alert('Error', 'Unlock failed.');
    }
  };

  if (status === 'loading') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4f7df8" />
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 16 }}>Starting DocuSync...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.orb, { top: -50, left: -50, backgroundColor: 'rgba(79,125,248,0.1)' }]} />
      <View style={[styles.orb, { bottom: -50, right: -50, backgroundColor: 'rgba(99,76,230,0.1)' }]} />

      <View style={styles.card}>
        
        {status === 'genesis' && (
          <View>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Create Your Account</Text>
            <Text style={styles.description}>
              DocuSync works directly between devices — no cloud sign-in needed. We've generated a secure PIN to protect your account.
            </Text>

            <View style={styles.pinCard}>
              <Text style={styles.pinLabel}>Your Security PIN</Text>
              <Text style={styles.pinText}>{generatedPin.slice(0, 4)}-{generatedPin.slice(4)}</Text>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>📌 Please save this PIN somewhere safe — you'll need it each time you sign in on this device.</Text>
            </View>

            <TouchableOpacity 
              style={[styles.button, creating && { opacity: 0.7 }]} 
              onPress={handleGenesis}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>✅ Create My Account</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {status === 'locked' && (
          <View>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.description}>Signed in as <Text style={{ color: '#818cf8', fontWeight: 'bold' }}>{nodeId}</Text></Text>

            <View style={styles.pinDotsContainer}>
              {Array.from({ length: 8 }).map((_, i) => (
                <View key={i} style={[
                  styles.pinDot,
                  i < pinInput.length ? styles.pinDotActive : {}
                ]} />
              ))}
            </View>

            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              keyboardType="number-pad"
              maxLength={8}
              value={pinInput}
              onChangeText={(v) => {
                const numeric = v.replace(/[^0-9]/g, '');
                setPinInput(numeric);
                if (numeric.length === 8) handleUnlock(numeric);
              }}
              autoFocus
            />

            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={() => inputRef.current?.focus()}
              style={styles.tapArea}
            >
              <Text style={styles.tapText}>
                {pinInput.length === 0 ? 'Tap here and enter your 8-digit PIN' :
                 pinInput.length < 8 ? `${8 - pinInput.length} more digit(s) to go` : 'Checking...'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, pinInput.length !== 8 && styles.buttonDisabled]} 
              onPress={() => handleUnlock(pinInput)}
              disabled={pinInput.length !== 8}
            >
              <Text style={[styles.buttonText, pinInput.length !== 8 && { color: 'rgba(255,255,255,0.4)' }]}>
                🔓 Sign In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={{ marginTop: 24, alignItems: 'center' }}
              onPress={() => {
                setStatus('genesis');
                setGeneratedPin(Math.floor(10000000 + Math.random() * 90000000).toString());
                setPinInput('');
              }}
            >
              <Text style={{ color: '#818cf8', textDecorationLine: 'underline', fontSize: 13 }}>Reset and Create New Account</Text>
            </TouchableOpacity>
          </View>
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070b14',
    padding: 20,
    justifyContent: 'center',
  },
  orb: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  card: {
    backgroundColor: 'rgba(11,17,32,0.92)',
    borderRadius: 24,
    padding: 30,
    borderColor: 'rgba(79,125,248,0.18)',
    borderWidth: 1,
  },
  backBtn: {
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  backText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  pinCard: {
    backgroundColor: 'rgba(79,125,248,0.07)',
    borderColor: 'rgba(79,125,248,0.22)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  pinLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: 'rgba(79,125,248,0.7)',
    marginBottom: 8,
  },
  pinText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 4,
  },
  infoBox: {
    backgroundColor: 'rgba(79,125,248,0.06)',
    borderColor: 'rgba(79,125,248,0.15)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
  },
  infoText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 18,
  },
  button: {
    height: 50,
    backgroundColor: '#4f7df8',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  pinDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  pinDotActive: {
    backgroundColor: '#4f7df8',
    borderColor: '#4f7df8',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  tapArea: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  tapText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
  },
});
