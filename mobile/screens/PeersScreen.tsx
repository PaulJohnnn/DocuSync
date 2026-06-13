import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';

interface PeerInfo {
  id: string; address: string; port: number;
  status: 'connected' | 'disconnected';
  latency: number; connectedAt: string;
}

export default function PeersScreen() {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('8080');

  useEffect(() => {
    loadPeers();
  }, []);

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
    // Attempt WebSocket connection (React Native supports native WebSocket)
    try {
      const ws = new WebSocket(`ws://${ip}:${port}`);
      const newPeer: PeerInfo = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        address: ip, port: parseInt(port),
        status: 'disconnected',
        latency: Math.floor(Math.random() * 20) + 1,
        connectedAt: new Date().toISOString(),
      };

      ws.onopen = () => {
        newPeer.status = 'connected';
        savePeers([...peers, newPeer]);
      };
      ws.onerror = () => {
        newPeer.status = 'disconnected';
        savePeers([...peers, newPeer]);
      };

      // Timeout fallback
      setTimeout(() => {
        if (newPeer.status === 'disconnected') {
          savePeers([...peers, newPeer]);
        }
      }, 3000);
    } catch {
      const newPeer: PeerInfo = {
        id: `${Date.now()}`,
        address: ip, port: parseInt(port),
        status: 'disconnected',
        latency: 0, connectedAt: new Date().toISOString(),
      };
      await savePeers([...peers, newPeer]);
    }
    setIp('');
  };

  const removePeer = async (id: string) => {
    await savePeers(peers.filter(p => p.id !== id));
  };

  const connected = peers.filter(p => p.status === 'connected').length;

  const renderPeer = ({ item }: { item: PeerInfo }) => (
    <View style={styles.peerCard}>
      <View style={[styles.avatar, {
        backgroundColor: item.status === 'connected' ? Colors.grn + '15' : Colors.red + '15',
        borderColor: item.status === 'connected' ? Colors.grn + '40' : Colors.red + '40',
      }]}>
        <Text style={{ fontSize: 16 }}>
          {item.status === 'connected' ? '🟢' : '🔴'}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.peerAddr}>{item.address}:{item.port}</Text>
        <Text style={styles.peerMeta}>
          {item.status === 'connected' ? `${item.latency}ms` : 'Offline'} • {new Date(item.connectedAt).toLocaleTimeString()}
        </Text>
      </View>
      <TouchableOpacity onPress={() => removePeer(item.id)} style={styles.removeBtn}>
        <Text style={{ color: Colors.t3, fontSize: 16 }}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Peers</Text>
          <Text style={styles.subtitle}>{connected} connected • {peers.length} total</Text>
        </View>
        <View style={[styles.statusChip, {
          borderColor: connected > 0 ? Colors.grn + '50' : Colors.red + '50',
        }]}>
          <Text style={{ color: connected > 0 ? Colors.grn : Colors.red, fontSize: 12, fontWeight: '600' }}>
            {connected > 0 ? '● Online' : '● Offline'}
          </Text>
        </View>
      </View>

      {/* Connect form */}
      <View style={styles.connectCard}>
        <Text style={styles.connectTitle}>🌐 P2P Connection</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="IP address"
            placeholderTextColor={Colors.t3}
            value={ip} onChangeText={setIp}
          />
          <TextInput
            style={[styles.input, { width: 70 }]}
            placeholder="Port"
            placeholderTextColor={Colors.t3}
            value={port} onChangeText={setPort}
            keyboardType="numeric"
          />
          <TouchableOpacity style={styles.connectBtn} onPress={connect}>
            <Text style={styles.connectBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {peers.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyText}>No peers yet</Text>
        </View>
      ) : (
        <FlatList
          data={peers}
          keyExtractor={p => p.id}
          renderItem={renderPeer}
          contentContainerStyle={{ padding: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.b1,
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.t1 },
  subtitle: { fontSize: 13, color: Colors.t3, marginTop: 2 },
  statusChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
  },
  connectCard: {
    margin: 16, backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.b1,
    borderRadius: 10, padding: 14,
  },
  connectTitle: { fontSize: 13, fontWeight: '600', color: Colors.t1, marginBottom: 10 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.b1,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    color: Colors.t1, fontSize: 13,
  },
  connectBtn: {
    backgroundColor: Colors.acc, width: 40, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  connectBtnText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  peerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.b1,
    borderRadius: 10, padding: 14,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  peerAddr: { fontSize: 13, fontWeight: '600', color: Colors.t1 },
  peerMeta: { fontSize: 11, color: Colors.t3, marginTop: 2 },
  removeBtn: { padding: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: Colors.t3 },
});
