/**
 * @module PeersScreen
 * P2P connection manager — tab "Peers".
 * All WebSocket/AsyncStorage/connect/remove logic unchanged. Only visual layer updated.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import AnimatedButton from '../components/AnimatedButton';

interface PeerInfo {
  id: string; address: string; port: number;
  status: 'connected' | 'disconnected';
  latency: number; connectedAt: string;
}

// Gradient-like avatar colors per peer index
const AVATAR_COLORS = [
  '#4f7df8', '#8b5cf6', '#22c55e', '#f59e0b', '#14b8a6', '#ef4444',
];

function initials(address: string): string {
  const parts = address.replace(/\./g, ' ').trim().split(' ');
  return (parts[0]?.[0] ?? 'P').toUpperCase() + (parts[1]?.[0] ?? '2').toUpperCase();
}

export default function PeersScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [ip,   setIp]     = useState('');
  const [port, setPort]   = useState('8080');

  useEffect(() => { loadPeers(); }, []);

  const loadPeers = async () => {
    const stored = await AsyncStorage.getItem('@docusync/peers');
    if (stored) setPeers(JSON.parse(stored));
  };

  const savePeers = async (newPeers: PeerInfo[]) => {
    setPeers(newPeers);
    await AsyncStorage.setItem('@docusync/peers', JSON.stringify(newPeers));
  };

  const connect = async () => {
    if (!ip || !port) return;
    try {
      const ws = new WebSocket(`ws://${ip}:${port}`);
      const newPeer: PeerInfo = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        address: ip, port: parseInt(port),
        status: 'disconnected',
        latency: Math.floor(Math.random() * 20) + 1,
        connectedAt: new Date().toISOString(),
      };
      ws.onopen  = () => { newPeer.status = 'connected';    savePeers([...peers, newPeer]); };
      ws.onerror = () => { newPeer.status = 'disconnected'; savePeers([...peers, newPeer]); };
      setTimeout(() => {
        if (newPeer.status === 'disconnected') savePeers([...peers, newPeer]);
      }, 3000);
    } catch {
      const newPeer: PeerInfo = {
        id: `${Date.now()}`, address: ip, port: parseInt(port),
        status: 'disconnected', latency: 0, connectedAt: new Date().toISOString(),
      };
      await savePeers([...peers, newPeer]);
    }
    setIp('');
  };

  const removePeer = async (id: string) => {
    await savePeers(peers.filter(p => p.id !== id));
  };

  const connected = peers.filter(p => p.status === 'connected').length;
  const isOnline  = connected > 0;

  const renderPeer = ({ item, index }: { item: PeerInfo; index: number }) => {
    const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
    const isConn      = item.status === 'connected';

    return (
      <View style={styles.peerCard}>
        <View style={[styles.avatar, { backgroundColor: avatarColor + '25', borderColor: avatarColor + '50' }]}>
          <Text style={[styles.avatarText, { color: avatarColor }]}>{initials(item.address)}</Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.peerName}>{item.address}</Text>
          <Text style={styles.peerRole}>P2P Node</Text>
          <Text style={styles.peerAddr}>{item.address}:{item.port}</Text>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={[styles.statusBadge, isConn ? styles.statusBadgeOnline : styles.statusBadgeOffline]}>
            <Text style={[styles.statusBadgeText, { color: isConn ? colors.green : colors.textMuted }]}>
              {isConn ? `● ${item.latency}ms` : '● Offline'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => removePeer(item.id)} style={styles.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.removeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Peers</Text>
          <Text style={styles.subtitle}>{connected} connected · {peers.length} total</Text>
        </View>
        <View style={[styles.statusChip, isOnline ? styles.statusChipOnline : styles.statusChipOffline]}>
          <Text style={[styles.statusChipText, { color: isOnline ? colors.green : colors.red }]}>
            {isOnline ? '● Online' : '● Offline'}
          </Text>
        </View>
      </View>

      <View style={styles.connectCard}>
        <Text style={styles.connectLabel}>🌐 P2P Connection</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1, color: colors.textPrimary }]}
            placeholder="IP address"
            placeholderTextColor={colors.textMuted}
            value={ip}
            onChangeText={setIp}
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, { width: 80, color: colors.textPrimary }]}
            placeholder="Port"
            placeholderTextColor={colors.textMuted}
            value={port}
            onChangeText={setPort}
            keyboardType="numeric"
          />
        </View>
        <AnimatedButton onPress={connect} style={styles.connectBtn}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="link" size={16} color="#fff" />
            <Text style={styles.connectBtnText}>Connect</Text>
          </View>
        </AnimatedButton>
      </View>

      {peers.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="wifi-outline" size={64} color={colors.textMuted} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>No peers yet</Text>
          <Text style={styles.emptySubtext}>Enter an IP and port to connect to a node</Text>
        </View>
      ) : (
        <FlatList
          data={peers}
          keyExtractor={p => p.id}
          renderItem={renderPeer}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgBase,
  },
  title:    { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
  },
  statusChipOnline:  { backgroundColor: colors.greenLight, borderColor: 'rgba(34,197,94,0.25)' },
  statusChipOffline: { backgroundColor: colors.redLight,   borderColor: 'rgba(239,68,68,0.25)' },
  statusChipText: { fontSize: 12, fontWeight: '600' },
  connectCard: {
    margin: 16,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  connectLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    backgroundColor: colors.bgBase,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    height: 42,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  connectBtn: {
    backgroundColor: colors.accent,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  peerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '700' },
  peerName:   { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  peerRole:   { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  peerAddr:   { fontSize: 10, color: colors.textMuted, fontFamily: 'monospace', marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
  },
  statusBadgeOnline:  { backgroundColor: colors.greenLight, borderColor: 'rgba(34,197,94,0.25)' },
  statusBadgeOffline: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.border },
  statusBadgeText: { fontSize: 10, fontWeight: '600' },
  removeBtn:     { padding: 2 },
  removeBtnText: { color: colors.textMuted, fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon:    { fontSize: 56, marginBottom: 16 },
  emptyTitle:   { fontSize: 18, fontWeight: '500', color: colors.textSecondary, marginBottom: 8 },
  emptySubtext: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
