/**
 * @module PeersScreen
 * P2P connection manager — tab "Peers".
 * All WebSocket/AsyncStorage/connect/remove logic unchanged. Only visual layer updated.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView, Alert, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import AnimatedButton from '../components/AnimatedButton';
import ConfirmModal from '../components/ConfirmModal';

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

export default function PeersScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [ip,   setIp]     = useState('');
  const [port, setPort]   = useState('8080');
  const [joinOtp, setJoinOtp] = useState('');
  const [joining, setJoining] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ visible: boolean, id: string | null }>({ visible: false, id: null });

  useEffect(() => {
    loadPeers();
    const timer = setInterval(() => {
      setPeers(prev => prev.map(p => {
        if (p.status === 'connected') {
          const shift = (Math.random() - 0.5) * 5;
          let newLat = p.latency + shift;
          if (newLat < 1) newLat = 1;
          return { ...p, latency: Math.round(newLat * 100) / 100 };
        }
        return p;
      }));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const loadPeers = async () => {
    const stored = await AsyncStorage.getItem('@docusync/peers');
    if (stored) setPeers(JSON.parse(stored));
  };

  const savePeers = async (newPeers: PeerInfo[]) => {
    setPeers(newPeers);
    await AsyncStorage.setItem('@docusync/peers', JSON.stringify(newPeers));
  };

  const connectWithArgs = async (targetIp: string, targetPort: string) => {
    if (!targetIp || !targetPort) return;
    try {
      const ws = new WebSocket(`ws://${targetIp}:${targetPort}`);
      const newPeer: PeerInfo = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        address: targetIp, port: parseInt(targetPort),
        status: 'disconnected',
        latency: Math.floor(Math.random() * 20) + 1,
        connectedAt: new Date().toISOString(),
      };
      ws.onopen  = () => {
        newPeer.status = 'connected';
        savePeers([...peers, newPeer]);
        
        // Send handshake to authenticate with Desktop Host
        ws.send(JSON.stringify({
          type: 'PEER_HELLO',
          nodeId: newPeer.id,
          displayName: 'DocuSync Mobile'
        }));
      };
      ws.onerror = () => { newPeer.status = 'disconnected'; savePeers([...peers, newPeer]); };
      setTimeout(() => {
        if (newPeer.status === 'disconnected') savePeers([...peers, newPeer]);
      }, 3000);
    } catch {
      const newPeer: PeerInfo = {
        id: `${Date.now()}`, address: targetIp, port: parseInt(targetPort),
        status: 'disconnected', latency: 0, connectedAt: new Date().toISOString(),
      };
      await savePeers([...peers, newPeer]);
    }
  };

  const handleJoinOtp = async () => {
    if (!joinOtp || joinOtp.length !== 5) return;
    setJoining(true);
    try {
      const res = await fetch(`http://192.168.68.102:3000/api/lobby/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: joinOtp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join session');
      
      const { ip: lobbyIp, port: lobbyPort, roomName } = data;
      setIp(lobbyIp);
      setPort(lobbyPort.toString());
      
      await connectWithArgs(lobbyIp, lobbyPort.toString());
      await AsyncStorage.setItem('@docusync/current_room', JSON.stringify({ id: joinOtp, name: roomName || 'OTP Session' }));
      Alert.alert('Success', `Connected to Host at ${lobbyIp}:${lobbyPort}.`);
      navigation.navigate('Files');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setJoining(false);
    }
  };

  const connect = async () => {
    await connectWithArgs(ip, port);
    await AsyncStorage.setItem('@docusync/current_room', JSON.stringify({ id: `direct-${ip}`, name: `Direct Session - ${ip}` }));
    setIp('');
    navigation.navigate('Files');
  };

  const removePeer = async (id: string) => {
    await savePeers(peers.filter(p => p.id !== id));
    await AsyncStorage.removeItem('@docusync/current_room');
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
            <Text style={[styles.statusBadgeText, { color: !isConn ? colors.textMuted : item.latency < 20 ? colors.green : item.latency < 100 ? colors.amber : colors.red }]}>
              {isConn ? `● ${item.latency}ms` : '● Offline'}
            </Text>
          </View>
          <TouchableOpacity 
            onPress={() => {
              setConfirmModal({ visible: true, id: item.id });
            }}
            style={styles.removeBtn} 
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
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
          <Text style={[styles.statusChipText, { color: isOnline ? colors.green : colors.textMuted }]}>
            {isOnline ? '● Online' : '● Offline'}
          </Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {/* Card 1: Host a Live Session */}
        <View style={styles.connectCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Ionicons name="people" size={20} color={colors.accent} />
            <Text style={[styles.connectLabel, { marginBottom: 0 }]}>Host a Live Session</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16, lineHeight: 20 }}>
            Mobile clients cannot host WebSocket servers directly. Please use the Desktop App to generate a 5-digit code, then join from this device.
          </Text>
          <AnimatedButton
            onPress={() => {}}
            style={[{ backgroundColor: colors.bgCardHover, padding: 12, borderRadius: 8, alignItems: 'center' }]}
            disabled={true}
          >
            <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Desktop Only</Text>
          </AnimatedButton>
        </View>

        {/* Card 2: Join Peer via OTP */}
        <View style={styles.connectCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Ionicons name="link" size={20} color={colors.green} />
            <Text style={[styles.connectLabel, { marginBottom: 0 }]}>Join Peer via OTP</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16, lineHeight: 20 }}>
            Enter the 5-digit OTP provided by the host to join their live session.
          </Text>
          
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { flex: 1, color: colors.textPrimary, fontFamily: 'monospace', letterSpacing: 4, fontSize: 16 }]}
              placeholder="e.g. 88412"
              placeholderTextColor={colors.textMuted}
              value={joinOtp}
              onChangeText={(text) => setJoinOtp(text.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
              editable={!joining}
            />
            <AnimatedButton
              onPress={handleJoinOtp}
              style={[styles.connectBtn, { opacity: (joining || joinOtp.length !== 5) ? 0.5 : 1 }]}
              disabled={joining || joinOtp.length !== 5}
            >
              <Text style={styles.connectBtnText}>{joining ? 'Joining...' : 'Join'}</Text>
            </AnimatedButton>
          </View>

          <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>Or connect via Direct IP:</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { flex: 1, color: colors.textPrimary }]}
                placeholder="IP address"
                placeholderTextColor={colors.textMuted}
                value={ip}
                onChangeText={setIp}
              />
              <TextInput
                style={[styles.input, { width: 80, color: colors.textPrimary }]}
                placeholder="Port"
                placeholderTextColor={colors.textMuted}
                value={port}
                onChangeText={setPort}
                keyboardType="numeric"
              />
              <AnimatedButton
                onPress={connect}
                style={[styles.connectBtn, { paddingHorizontal: 12 }]}
              >
                <Text style={styles.connectBtnText}>Connect IP</Text>
              </AnimatedButton>
            </View>
          </View>
        </View>

        {/* Peer list */}
        {peers.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Ionicons name="people-outline" size={48} color={colors.textMuted} style={{ opacity: 0.5, marginBottom: 16 }} />
            <Text style={{ fontSize: 18, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 }}>No peers yet</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>Join via OTP or enter an IP and port to connect manually</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}>
            {peers.map((item, index) => renderPeer({ item, index }))}
          </View>
        )}
      </ScrollView>

      <ConfirmModal
        visible={confirmModal.visible}
        title="Disconnect Peer"
        message="Are you sure you want to leave this room/peer?"
        confirmText="Leave"
        cancelText="Cancel"
        onCancel={() => setConfirmModal({ visible: false, id: null })}
        onConfirm={() => {
          if (confirmModal.id) removePeer(confirmModal.id);
          setConfirmModal({ visible: false, id: null });
        }}
      />
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
  statusChipOffline: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.border },
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
