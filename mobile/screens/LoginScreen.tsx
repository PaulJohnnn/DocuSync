import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect, Circle } from 'react-native-svg';
import mockAuthService from '../services/mockAuthService';
import { uSet, uRemove } from '../utils/userStorage';

type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Main: undefined;
};

type LoginScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Login'>;

const DocuSyncLogo = ({ size = 80 }) => (
  <View style={{
    shadowColor: '#4f46e5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16,
    elevation: 10,
  }}>
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Rect width="100" height="100" rx="24" fill="#4f7df8" />
      <Rect x="22" y="28" width="56" height="12" rx="6" fill="white" />
      <Rect x="22" y="48" width="56" height="12" rx="6" fill="white" />
      <Rect x="22" y="68" width="32" height="12" rx="6" fill="white" />
      <Circle cx="70" cy="70" r="18" fill="#22c55e" />
    </Svg>
  </View>
);

export default function LoginScreen() {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const [pinFocused, setPinFocused] = useState(false);
  const [mode, setMode] = useState<'unlock' | 'signup'>('unlock');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);

  const inputRef = useRef<TextInput>(null);

  React.useEffect(() => {
    AsyncStorage.getItem('docusync_remembered_email').then(val => {
      if (val) { setEmail(val); setRemember(true); }
    });
  }, []);

  const handleUnlock = async () => {
    if (!email || pin.length < 5) {
      setErrorMsg('Please enter valid email and PIN.');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    try {
      const user = await mockAuthService.login(email, pin);
      if (user.isAdmin) {
        await uSet('is_admin', 'true');
      } else {
        await uRemove('is_admin');
      }
      if (remember) {
        await AsyncStorage.setItem('docusync_remembered_email', email);
      } else {
        await AsyncStorage.removeItem('docusync_remembered_email');
      }
      await AsyncStorage.setItem('docusync_unlocked', 'true');
      navigation.replace('Main');
    } catch (e: any) {
      setErrorMsg(e.message || 'Unlock failed.');
    } finally {
      setLoading(false);
    }
  };

  const [generatedPin, setGeneratedPin] = useState('');

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (signupSuccess && !generatedPin) {
      interval = setInterval(async () => {
        const pin = await mockAuthService.checkApprovalStatus(email);
        if (pin) setGeneratedPin(pin);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [signupSuccess, email, generatedPin]);

  const handleSignup = async () => {
    if (!email) { setErrorMsg('Please enter your email.'); return; }
    setErrorMsg('');
    setLoading(true);
    try {
      await mockAuthService.requestAccount(email);
      setSignupSuccess(true);
      setGeneratedPin('');
    } catch (e: any) {
      setErrorMsg(e.message || 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: '#e0e7ff' }} bounces={false}>
        
        {/* Top Header Section */}
        <SafeAreaView edges={['top']} style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
          <DocuSyncLogo size={70} />
          
          <Text style={{ fontSize: 26, fontWeight: '800', color: '#0f172a', marginTop: 20, textAlign: 'center' }}>
            Login to <Text style={{ color: '#4f46e5' }}>DocuSync</Text>
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 12, width: 120 }}>
            <View style={{ flex: 1, height: 1.5, backgroundColor: 'rgba(79,70,229,0.2)' }} />
            <Ionicons name="shield-checkmark" size={16} color="#6366f1" style={{ marginHorizontal: 8 }} />
            <View style={{ flex: 1, height: 1.5, backgroundColor: 'rgba(79,70,229,0.2)' }} />
          </View>

          <Text style={{ fontSize: 14, color: '#334155', textAlign: 'center', lineHeight: 22, fontWeight: '500', paddingHorizontal: 20 }}>
            A decentralized collaborative workspace powered by peer-to-peer synchronization.
          </Text>
        </SafeAreaView>

        {/* Bottom Card Section */}
        <View style={{ 
          flex: 1, backgroundColor: '#ffffff', borderTopLeftRadius: 32, borderTopRightRadius: 32,
          padding: 24, paddingBottom: 40,
          shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.05, shadowRadius: 20,
          elevation: 20
        }}>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#eef2ff', justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
              <Ionicons name={mode === 'signup' && !signupSuccess ? "person-add" : mode === 'unlock' ? "lock-closed" : "checkmark-circle"} size={20} color="#4f46e5" />
            </View>
            <View>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#0f172a' }}>
                {mode === 'signup' && !signupSuccess ? 'Create Local Profile' : mode === 'unlock' ? 'Unlock Workspace' : 'Profile Status'}
              </Text>
              <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {mode === 'signup' && !signupSuccess ? 'Request a profile from the administrator.' : mode === 'unlock' ? 'Access your local encrypted workspace.' : 'Your request status.'}
              </Text>
            </View>
          </View>

          {mode === 'unlock' && (
            <>
              {/* Email Input */}
              <Text style={styles.label}>Local Identifier (Email)</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail" size={18} color="#94a3b8" style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {/* PIN Input */}
              <Text style={[styles.label, { marginTop: 16 }]}>6-Digit Security PIN</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="keypad" size={18} color="#94a3b8" style={{ marginRight: 10 }} />
                
                <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
                  {Array.from({ length: 6 }).map((_, i) => {
                    const filled = i < pin.length;
                    return (
                      <View key={i} style={{
                        width: 30, height: 32, borderRadius: 6,
                        backgroundColor: filled ? 'rgba(79,70,229,0.07)' : 'rgba(0,0,0,0.03)',
                        borderWidth: 1.5, borderColor: (pinFocused && (pin.length === i || (pin.length === 6 && i === 5))) ? '#4f46e5' : filled ? 'rgba(79,70,229,0.3)' : 'rgba(0,0,0,0.05)',
                        justifyContent: 'center', alignItems: 'center'
                      }}>
                        {filled && (
                          showPin 
                          ? <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#3730a3' }}>{pin[i]}</Text>
                          : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3730a3' }} />
                        )}
                      </View>
                    );
                  })}
                </View>

                <TouchableOpacity onPress={() => setShowPin(!showPin)} style={{ padding: 4 }}>
                  <Ionicons name={showPin ? "eye-off" : "eye"} size={20} color="#94a3b8" />
                </TouchableOpacity>

                <TextInput
                  ref={inputRef}
                  style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
                  value={pin}
                  onChangeText={t => setPin(t.substring(0, 6))}
                  keyboardType="number-pad"
                  onFocus={() => setPinFocused(true)}
                  onBlur={() => setPinFocused(false)}
                />
                <TouchableOpacity 
                  style={StyleSheet.absoluteFillObject} 
                  onPress={() => inputRef.current?.focus()} 
                  activeOpacity={1} 
                />
              </View>
            </>
          )}

          {errorMsg && mode === 'unlock' ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          {mode === 'unlock' ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 20 }}>
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => setRemember(!remember)}>
                  <View style={{ width: 18, height: 18, borderWidth: 1.5, borderColor: remember ? '#4f46e5' : '#cbd5e1', borderRadius: 4, marginRight: 8, backgroundColor: remember ? '#4f46e5' : 'transparent', justifyContent: 'center', alignItems: 'center' }}>
                    {remember && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <Text style={{ fontSize: 13, color: '#475569' }}>Remember this device</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setErrorMsg('PIN reset requires admin contact in local-first mode.')}>
                  <Text style={{ fontSize: 13, color: '#4f46e5', fontWeight: '500' }}>Forgot PIN?</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={handleUnlock} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="lock-open-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryBtnText}>Unlock Workspace</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 16 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
                <Text style={{ marginHorizontal: 12, fontSize: 12, color: '#94a3b8', fontWeight: '500' }}>or</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
              </View>

              <TouchableOpacity style={styles.secondaryBtn} onPress={() => { setMode('signup'); setErrorMsg(''); }}>
                <Ionicons name="person-add" size={16} color="#1e293b" style={{ marginRight: 8 }} />
                <Text style={styles.secondaryBtnText}>Create Local Profile</Text>
              </TouchableOpacity>
            </>
          ) : signupSuccess ? (
            <View style={{ alignItems: 'center', padding: 24 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(34,197,94,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                <Ionicons name="checkmark-circle" size={32} color="#16a34a" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#166534', marginBottom: 8 }}>
                {generatedPin ? 'Request Approved!' : 'Request Sent!'}
              </Text>
              
              {generatedPin ? (
                <>
                  <Text style={{ fontSize: 13, color: '#4b5563', textAlign: 'center', lineHeight: 20 }}>
                    Your profile for <Text style={{ fontWeight: '700' }}>{email}</Text> has been approved. Use this PIN to unlock:
                  </Text>
                  <View style={{ marginTop: 16, backgroundColor: '#f0fdf4', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: '#bbf7d0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <Text style={{ fontSize: 28, fontWeight: '800', color: '#15803d', letterSpacing: 4 }}>{generatedPin}</Text>
                    <TouchableOpacity onPress={() => Clipboard.setStringAsync(generatedPin)} style={{ padding: 4 }}>
                      <Ionicons name="copy-outline" size={20} color="#15803d" />
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <Text style={{ fontSize: 13, color: '#4b5563', textAlign: 'center', lineHeight: 20 }}>
                  Your profile request for <Text style={{ fontWeight: '700' }}>{email}</Text> has been sent. Please contact your administrator to approve it.
                </Text>
              )}
              
              <TouchableOpacity
                onPress={() => { setMode('unlock'); setSignupSuccess(false); setGeneratedPin(''); setEmail(''); }}
                style={{ marginTop: 24, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#e2e8f0', paddingHorizontal: 28 }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#475569' }}>Back to Unlock</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail" size={18} color="#94a3b8" style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  value={email}
                  onChangeText={v => { setEmail(v); setErrorMsg(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 20 }]} onPress={handleSignup} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="person-add" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryBtnText}>Request Local Profile</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 10 }]} onPress={() => { setMode('unlock'); setErrorMsg(''); }}>
                <Text style={styles.secondaryBtnText}>Back to Unlock</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={{ marginTop: 24, alignItems: 'center' }}>
          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13, fontWeight: '600', color: '#1e293b', marginBottom: 6
  },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 12, backgroundColor: '#fff',
    paddingHorizontal: 14, height: 50
  },
  input: {
    flex: 1, fontSize: 14, color: '#0f172a'
  },
  errorText: {
    color: '#ef4444', fontSize: 12, marginTop: 8,
    backgroundColor: 'rgba(239,68,68,0.1)', padding: 10, borderRadius: 8,
    overflow: 'hidden'
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#4f46e5', padding: 16, borderRadius: 12,
    shadowColor: '#4f46e5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10,
    elevation: 8,
  },
  primaryBtnText: {
    color: '#fff', fontSize: 15, fontWeight: '700'
  },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0',
    padding: 14, borderRadius: 12
  },
  secondaryBtnText: {
    color: '#1e293b', fontSize: 15, fontWeight: '600'
  }
});
