import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import LogoIcon from '../components/LogoIcon';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { theme, toggleTheme, colors } = useTheme();
  const [nodeId, setNodeId] = useState('Loading...');
  const [toggleAnim] = useState(new Animated.Value(theme === 'dark' ? 1 : 0));

  useEffect(() => {
    AsyncStorage.getItem('docusync_node_id').then(id => {
      if (id) setNodeId(id);
      else {
        const newId = `node-${Date.now().toString(36)}`;
        AsyncStorage.setItem('docusync_node_id', newId);
        setNodeId(newId);
      }
    });
  }, []);

  useEffect(() => {
    Animated.spring(toggleAnim, {
      toValue: theme === 'dark' ? 1 : 0,
      useNativeDriver: false,
      friction: 6,
      tension: 100,
    }).start();
  }, [theme]);

  const toggleInterpolation = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 22]
  });

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bgBase }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bgBase }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Settings</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Manage appearance and node parameters</Text>
      </View>

      <View style={styles.content}>
        {/* Appearance */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: colors.accentLight }]}>
              <Ionicons name="color-palette" size={20} color={colors.accent} />
            </View>
            <View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Appearance</Text>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>Customize your Mobile UI theme</Text>
            </View>
          </View>
          <View style={styles.cardBody}>
            <View style={[styles.toggleRow, { backgroundColor: theme === 'dark' ? colors.bgSelected : colors.bgBase, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name={theme === 'dark' ? 'moon' : 'sunny'} size={24} color={theme === 'dark' ? colors.blue : colors.amber} />
                <View>
                  <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</Text>
                  <Text style={[styles.toggleSubtitle, { color: colors.textMuted }]}>Toggle aesthetic</Text>
                </View>
              </View>
              
              <TouchableOpacity activeOpacity={0.8} onPress={toggleTheme}>
                <View style={[styles.toggleBg, { backgroundColor: theme === 'dark' ? colors.accent : colors.textSecondary }]}>
                  <Animated.View style={[styles.toggleKnob, { left: toggleInterpolation }]} />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Account */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: colors.redLight }]}>
              <Ionicons name="lock-closed" size={20} color={colors.red} />
            </View>
            <View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Account</Text>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>Manage your mobile session</Text>
            </View>
          </View>
          <View style={styles.cardBody}>
            <View style={[styles.toggleRow, { backgroundColor: colors.bgBase, borderColor: colors.border }]}>
              <View>
                <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>Logout / Reset</Text>
                <Text style={[styles.toggleSubtitle, { color: colors.textMuted }]}>Clear your ID and PIN</Text>
              </View>
              <TouchableOpacity
                onPress={async () => {
                  await AsyncStorage.removeItem('docusync_node_id');
                  await AsyncStorage.removeItem('docusync_password_hash');
                  await AsyncStorage.removeItem('docusync_unlocked');
                  // To navigate back to the auth flow
                  // @ts-ignore
                  navigation.getParent()?.navigate('Welcome');
                }}
                style={{ backgroundColor: colors.redLight, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' }}
              >
                <Text style={{ color: colors.red, fontWeight: '600', fontSize: 13 }}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* About */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: colors.accentLight }]}>
              <Ionicons name="information-circle" size={22} color={colors.accent} />
            </View>
            <View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>About DocuSync</Text>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>System and license details</Text>
            </View>
          </View>
          <View style={[styles.cardBody, { alignItems: 'center', paddingVertical: 32 }]}>
            <View style={{ marginBottom: 16 }}>
              <LogoIcon size={56} />
            </View>
            <Text style={[styles.aboutTitle, { color: colors.textPrimary }]}>DocuSync Mobile</Text>
            <Text style={[styles.aboutText, { color: colors.textSecondary }]}>
              A hybrid P2P collaborative document sync engine. This mobile client operates fully locally.
            </Text>
            
            <View style={[styles.nodeBadge, { backgroundColor: colors.bgSelected, borderColor: colors.border }]}>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>Local Node ID:</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', fontFamily: 'monospace', color: colors.accent, marginLeft: 6 }}>{nodeId}</Text>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4 },
  content: { padding: 16, gap: 16 },
  
  card: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardSubtitle: { fontSize: 13, marginTop: 2 },
  cardBody: { padding: 16 },
  
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderRadius: 12, borderWidth: 1,
  },
  toggleTitle: { fontSize: 14, fontWeight: '600' },
  toggleSubtitle: { fontSize: 12, marginTop: 2 },
  
  toggleBg: {
    width: 44, height: 24, borderRadius: 12,
    justifyContent: 'center',
  },
  toggleKnob: {
    position: 'absolute',
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },

  aboutTitle: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  aboutText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 20, lineHeight: 20, marginBottom: 20 },
  nodeBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  }
});
