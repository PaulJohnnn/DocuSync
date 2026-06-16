/**
 * @module PeersScreen
 * P2P connection manager — tab "Peers".
 * All WebSocket/AsyncStorage/connect/remove logic unchanged. Only visual layer updated.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';

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

  // ── Peer Card ─────────────────────────────────────────────────────────────

  const renderPeer = ({ item, index }: { item: PeerInfo; index: number }) => {
    const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
    const isConn      = item.status === 'connected';

    return (
      <View style={styles.peerCard}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: avatarColor + '25', borderColor: avatarColor + '50' }]}>
          <Text style={[styles.avatarText, { color: avatarColor }]}>{initials(item.address)}</Text>
        </View>

        {/* Info */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.peerName} numberOfLines={1}>
            {item.address}
          </Text>
          <Text style={styles.peerRole}>P2P Node</Text>
          <Text style={styles.peerAddr} numberOfLines={1}>
            {item.address}:{item.port}
          </Text>
        </View>

        {/* Status badge + remove */}
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={[styles.statusBadge, isConn ? styles.statusBadgeOnline : styles.statusBadgeOffline]}>
            <Text style={[styles.statusBadgeText, { color: isConn ? Colors.green : Colors.textMuted }]}>
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Peers</Text>
          <Text style={styles.subtitle}>{connected} connected · {peers.length} total</Text>
        </View>
        <View style={[styles.statusChip, isOnline ? styles.statusChipOnline : styles.statusChipOffline]}>
          <Text style={[styles.statusChipText, { color: isOnline ? Colors.green : Colors.red }]}>
            {isOnline ? '● Online' : '● Offline'}
          </Text>
        </View>
      </View>

      {/* Connect form card */}
      <View style={styles.connectCard}>
        <Text style={styles.connectLabel}>🌐 P2P Connection</Text>

        {/* IP + Port row */}
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="IP address"
            placeholderTextColor={Colors.textMuted}
            value={ip}
            onChangeText={setIp}
            keyboardType="default"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, { width: 80 }]}
            placeholder="Port"
            placeholderTextColor={Colors.textMuted}
            value={port}
            onChangeText={setPort}
            keyboardType="numeric"
          />
        </View>

        {/* Connect button — full width */}
        <TouchableOpacity style={styles.connectBtn} onPress={connect} activeOpacity={0.8}>
          <Text style={styles.connectBtnText}>Connect +</Text>
        </TouchableOpacity>
      </View>

      {/* Peers list or empty */}
      {peers.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>👥</Text>
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

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgBase },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgBase,
  },
  title:    { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
  },
  statusChipOnline:  { backgroundColor: Colors.greenLight, borderColor: 'rgba(34,197,94,0.25)' },
  statusChipOffline: { backgroundColor: Colors.redLight,   borderColor: 'rgba(239,68,68,0.25)' },
  statusChipText: { fontSize: 12, fontWeight: '600' },

  // Connect form card
  connectCard: {
    margin: 16,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  connectLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    height: 42,
    paddingHorizontal: 12,
    color: Colors.textPrimary,
    fontSize: 13,
  },
  connectBtn: {
    backgroundColor: Colors.accent,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },

  // Peer card
  peerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 13, fontWeight: '700' },
  peerName:   { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  peerRole:   { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  peerAddr:   { fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace', marginTop: 2 },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
  },
  statusBadgeOnline:  { backgroundColor: Colors.greenLight, borderColor: 'rgba(34,197,94,0.25)' },
  statusBadgeOffline: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: Colors.border },
  statusBadgeText: { fontSize: 10, fontWeight: '600' },

  removeBtn:     { padding: 2 },
  removeBtnText: { color: Colors.textMuted, fontSize: 14 },

  // Empty
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon:    { fontSize: 56, marginBottom: 16 },
  emptyTitle:   { fontSize: 18, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  emptySubtext: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
