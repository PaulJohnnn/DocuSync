/**
 * @module PeersScreen
 * P2P connection manager — tab "Peers".
 * - Matchmaker URL read from AsyncStorage (configurable, no hardcoded IPs).
 * - Real WebSocket RTT measured via PING/PONG timing (no Math.random() fake latency).
 * - Peer list persisted across sessions.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { useTheme } from '../context/ThemeContext';
import ConfirmModal from '../components/ConfirmModal';

// ── Constants ──────────────────────────────────────────────────────────────────
const PEERS_KEY   = '@docusync/peers';
const ROOM_KEY    = '@docusync/current_room';
const MATCHMAKER_KEY = '@docusync/matchmaker_url';
const DEFAULT_MATCHMAKER = 'https://docusync-pnc.vercel.app';

// ── Types ──────────────────────────────────────────────────────────────────────
interface PeerInfo {
  id: string; address: string; port: number;
  status: 'connected' | 'disconnected';
  latency: number | null;
  connectedAt: string;
}

interface RoomInfo {
  id: string;
  name: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#4f7df8', '#8b5cf6', '#22c55e', '#f59e0b', '#14b8a6', '#ef4444'];

function initials(address: string): string {
  const parts = address.replace(/\./g, ' ').trim().split(' ');
  return (parts[0]?.[0] ?? 'P').toUpperCase() + (parts[1]?.[0] ?? '2').toUpperCase();
}

async function measureRTT(address: string, port: number): Promise<number | null> {
  return new Promise(resolve => {
    const timeoutId = setTimeout(() => resolve(null), 3000);
    try {
      const ws = new WebSocket(`ws://${address}:${port}`);
      ws.onopen = () => {
        const t0 = Date.now();
        ws.send(JSON.stringify({ type: 'PING', timestamp: t0 }));
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'PONG') {
              clearTimeout(timeoutId);
              resolve(Date.now() - t0);
            }
          } catch { /* ignore parse errors */ }
        };
      };
      ws.onerror = () => { clearTimeout(timeoutId); resolve(null); ws.close(); };
    } catch { clearTimeout(timeoutId); resolve(null); }
  });
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function PeersScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [joinOtp, setJoinOtp] = useState('');
  const [joining, setJoining] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<RoomInfo | null>(null);
  const [matchmakerUrl, setMatchmakerUrl] = useState(DEFAULT_MATCHMAKER);
  const [confirmModal, setConfirmModal] = useState<{ visible: boolean, id: string | null }>({ visible: false, id: null });
  const netInfo = useNetInfo();
  const hasInternet = netInfo.isConnected !== false;

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(PEERS_KEY);
      if (stored) setPeers(JSON.parse(stored));

      const room = await AsyncStorage.getItem(ROOM_KEY);
      if (room) setCurrentRoom(JSON.parse(room));

      const url = await AsyncStorage.getItem(MATCHMAKER_KEY);
      if (url) setMatchmakerUrl(url);
    })();
  }, []);

  useEffect(() => {
    const pollRTT = async () => {
      setPeers(prev => prev);
      const updated = await Promise.all(
        peers.map(async (p) => {
          if (p.status !== 'connected') return p;
          const rtt = await measureRTT(p.address, p.port);
          return { ...p, latency: rtt };
        })
      );
      setPeers(updated);
      await AsyncStorage.setItem(PEERS_KEY, JSON.stringify(updated));
    };

    if (peers.some(p => p.status === 'connected')) {
      pollRTT();
      const iv = setInterval(pollRTT, 10_000);
      return () => clearInterval(iv);
    }
  }, [peers.length]);

  const savePeers = async (newPeers: PeerInfo[]) => {
    setPeers(newPeers);
    await AsyncStorage.setItem(PEERS_KEY, JSON.stringify(newPeers));
  };

  const connectWithArgs = async (targetIp: string, targetPort: string): Promise<boolean> => {
    return new Promise(resolve => {
      try {
        const ws = new WebSocket(`ws://${targetIp}:${targetPort}`);
        const t0 = Date.now();

        const newPeer: PeerInfo = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          address: targetIp, port: parseInt(targetPort, 10),
          status: 'disconnected',
          latency: null,
          connectedAt: new Date().toISOString(),
        };

        ws.onopen = async () => {
          newPeer.status = 'connected';
          newPeer.latency = Date.now() - t0;
          ws.send(JSON.stringify({
            type: 'PEER_HELLO',
            nodeId: newPeer.id,
            displayName: 'DocuSync Mobile',
          }));
          await savePeers([...peers, newPeer]);
          resolve(true);
        };
        const handleDisconnect = () => {
          setPeers(prev => {
            const next = prev.map(p => p.id === newPeer.id ? { ...p, status: 'disconnected' as const } : p);
            AsyncStorage.setItem(PEERS_KEY, JSON.stringify(next));
            return next;
          });
        };

        ws.onerror = () => {
          handleDisconnect();
          resolve(false);
        };
        ws.onclose = () => {
          handleDisconnect();
        };
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            handleDisconnect();
            resolve(false);
          }
        }, 5000);
      } catch {
        resolve(false);
      }
    });
  };

  const handleJoinOtp = async () => {
    if (!joinOtp || joinOtp.length !== 5) return;
    setJoining(true);
    try {
      const res = await fetch(`${matchmakerUrl}/api/lobby/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: joinOtp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join session');

      const { ip: lobbyIp, port: lobbyPort, roomName } = data;

      const connected = await connectWithArgs(lobbyIp, lobbyPort.toString());
      if (!connected) {
        Alert.alert('Warning', `Could not connect WebSocket to ${lobbyIp}:${lobbyPort}. Peer saved as offline.`);
      }

      const room: RoomInfo = { id: joinOtp, name: roomName || 'OTP Session' };
      await AsyncStorage.setItem(ROOM_KEY, JSON.stringify(room));
      setCurrentRoom(room);
      setJoinOtp('');

      if (connected) {
        Alert.alert('Connected', `Joined session at ${lobbyIp}:${lobbyPort}.`);
        navigation.navigate('Files');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setJoining(false);
    }
  };

  const removePeer = async (id: string) => {
    await savePeers(peers.filter(p => p.id !== id));
    await AsyncStorage.removeItem(ROOM_KEY);
    setCurrentRoom(null);
  };

  const connected = peers.filter(p => p.status === 'connected').length;

  const renderPeer = ({ item, index }: { item: PeerInfo; index: number }) => {
    const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
    const isConn = item.status === 'connected';
    const latMs = item.latency;

    let latencyLabel = '● Offline';
    let latencyColor = colors.textMuted;
    if (isConn) {
      if (latMs === null) {
        latencyLabel = '● Measuring…';
        latencyColor = colors.textMuted;
      } else if (latMs < 20) {
        latencyLabel = `● ${latMs}ms`;
        latencyColor = colors.green;
      } else if (latMs < 100) {
        latencyLabel = `● ${latMs}ms`;
        latencyColor = colors.amber;
      } else {
        latencyLabel = `● ${latMs}ms`;
        latencyColor = colors.red;
      }
    }

    return (
      <View style={styles.peerCard} key={item.id}>
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
            <Text style={[styles.statusBadgeText, { color: latencyColor }]}>
              {latencyLabel}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setConfirmModal({ visible: true, id: item.id })}
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
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Peers</Text>
          <Text style={styles.subtitle}>{connected} connected · {peers.length} total</Text>
        </View>
        <View style={[styles.statusChip, hasInternet ? styles.statusChipOnline : styles.statusChipOffline]}>
          <Text style={[styles.statusChipText, { color: hasInternet ? colors.green : colors.textMuted }]}>
            {hasInternet ? '● Online' : '● Offline'}
          </Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {currentRoom && (
          <View style={styles.roomCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.greenDot} />
              <Text style={styles.roomTitle}>Room: {currentRoom.name}</Text>
            </View>
            <Text style={styles.roomSubtitle}>
              OTP: {currentRoom.id} · {connected} peer{connected !== 1 ? 's' : ''} connected
            </Text>
          </View>
        )}

        <View style={styles.connectCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Ionicons name="link" size={20} color={colors.green} />
            <Text style={[styles.connectLabel, { marginBottom: 0 }]}>Join Peer via OTP</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16, lineHeight: 20 }}>
            Enter the 5-digit OTP provided by the Desktop host to join the live session.
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <TextInput
              style={[styles.input, {
                flex: 1, height: 48,
                color: colors.textPrimary,
                fontFamily: 'monospace',
                letterSpacing: 4, fontSize: 16,
              }]}
              placeholder="e.g. 88412"
              placeholderTextColor={colors.textMuted}
              value={joinOtp}
              onChangeText={(text) => setJoinOtp(text.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
              editable={!joining}
            />
            <TouchableOpacity
              onPress={handleJoinOtp}
              disabled={joining || joinOtp.length !== 5}
              style={[styles.joinBtn, { opacity: (joining || joinOtp.length !== 5) ? 0.5 : 1 }]}
            >
              <Text style={styles.joinBtnText}>{joining ? '...' : 'Join'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 11, color: colors.textMuted }}>
            Matchmaker: {matchmakerUrl}
          </Text>
        </View>

        <View style={styles.connectCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Ionicons name="people" size={20} color={colors.accent} />
            <Text style={[styles.connectLabel, { marginBottom: 0 }]}>Host a Live Session</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
            Mobile clients cannot host WebSocket servers directly. Use the Desktop App to generate an OTP, then join from this device.
          </Text>
        </View>

        {peers.length > 0 && (
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.bgBase,
  },
  title:    { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statusChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 99, borderWidth: 1,
  },
  statusChipOnline:  { backgroundColor: colors.greenLight, borderColor: 'rgba(34,197,94,0.25)' },
  statusChipOffline: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.border },
  statusChipText: { fontSize: 12, fontWeight: '600' },

  roomCard: {
    margin: 16, marginBottom: 0,
    backgroundColor: 'rgba(79,125,248,0.10)',
    borderWidth: 1, borderColor: 'rgba(79,125,248,0.28)',
    borderRadius: 12, padding: 14, gap: 6,
  },
  greenDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' },
  roomTitle:    { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  roomSubtitle: { fontSize: 12, color: colors.textMuted, marginLeft: 18 },

  connectCard: {
    margin: 16, backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 16, gap: 10,
  },
  connectLabel: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  input: {
    backgroundColor: colors.bgBase,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, paddingHorizontal: 12,
  },
  joinBtn: {
    width: 80, height: 48, backgroundColor: colors.accent,
    borderRadius: 10, justifyContent: 'center', alignItems: 'center',
  },
  joinBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  peerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 14, marginBottom: 8,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '700' },
  peerName:   { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  peerRole:   { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  peerAddr:   { fontSize: 10, color: colors.textMuted, fontFamily: 'monospace', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, borderWidth: 1 },
  statusBadgeOnline:  { backgroundColor: colors.greenLight, borderColor: 'rgba(34,197,94,0.25)' },
  statusBadgeOffline: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.border },
  statusBadgeText: { fontSize: 10, fontWeight: '600' },
  removeBtn:     { padding: 2 },
  removeBtnText: { color: colors.textMuted, fontSize: 14 },
});
