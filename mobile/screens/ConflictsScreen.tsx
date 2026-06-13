import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';

interface ConflictRecord {
  id: string; fileId: string; fileName: string;
  payloadA: string; nodeIdA: string;
  payloadB: string; nodeIdB: string;
  status: 'pending' | 'resolved';
  winner: 'A' | 'B' | null;
  detectedAt: string; resolvedAt: string | null;
}

export default function ConflictsScreen() {
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);

  useEffect(() => {
    loadConflicts();
  }, []);

  const loadConflicts = async () => {
    const stored = await AsyncStorage.getItem('@docusync/conflicts');
    if (stored) setConflicts(JSON.parse(stored));
  };

  const resolve = async (conflictId: string, winner: 'A' | 'B') => {
    const updated = conflicts.map(c =>
      c.id === conflictId ? { ...c, status: 'resolved' as const, winner, resolvedAt: new Date().toISOString() } : c
    );
    setConflicts(updated);
    await AsyncStorage.setItem('@docusync/conflicts', JSON.stringify(updated));
  };

  const pending = conflicts.filter(c => c.status === 'pending');

  const renderConflict = ({ item }: { item: ConflictRecord }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>⚠️ {item.fileName}</Text>
        <View style={[styles.badge, {
          borderColor: item.status === 'pending' ? Colors.amb + '50' : Colors.grn + '50',
        }]}>
          <Text style={[styles.badgeText, {
            color: item.status === 'pending' ? Colors.amb : Colors.grn,
          }]}>
            {item.status === 'pending' ? 'Pending' : `Resolved (${item.winner})`}
          </Text>
        </View>
      </View>

      {/* Side A */}
      <View style={styles.sideBox}>
        <Text style={[styles.sideLabel, { color: Colors.acc }]}>SIDE A — {item.nodeIdA.slice(0, 8)}</Text>
        <Text style={styles.sideContent} numberOfLines={4}>{item.payloadA || 'Empty'}</Text>
      </View>

      {/* Side B */}
      <View style={styles.sideBox}>
        <Text style={[styles.sideLabel, { color: Colors.pur }]}>SIDE B — {item.nodeIdB.slice(0, 8)}</Text>
        <Text style={styles.sideContent} numberOfLines={4}>{item.payloadB || 'Empty'}</Text>
      </View>

      {item.status === 'pending' && (
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.resolveBtn} onPress={() => resolve(item.id, 'A')}>
            <Text style={[styles.resolveBtnText, { color: Colors.acc }]}>✓ Keep A</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resolveBtn} onPress={() => resolve(item.id, 'B')}>
            <Text style={[styles.resolveBtnText, { color: Colors.pur }]}>✓ Keep B</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resolveBtn} onPress={() => resolve(item.id, 'A')}>
            <Text style={[styles.resolveBtnText, { color: Colors.amb }]}>⚖ LWW</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.timestamp}>Detected: {new Date(item.detectedAt).toLocaleString()}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Conflicts</Text>
        <Text style={styles.subtitle}>{pending.length} pending</Text>
      </View>

      {conflicts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🛡️</Text>
          <Text style={styles.emptyText}>No conflicts</Text>
          <Text style={styles.emptySubtext}>All files are in sync</Text>
        </View>
      ) : (
        <FlatList
          data={conflicts}
          keyExtractor={c => c.id}
          renderItem={renderConflict}
          contentContainerStyle={{ padding: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.b1,
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.t1 },
  subtitle: { fontSize: 13, color: Colors.t3, marginTop: 2 },
  card: {
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.b1,
    borderRadius: 10, padding: 14,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: Colors.t1 },
  badge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  sideBox: {
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.b1,
    borderRadius: 8, padding: 10, marginBottom: 8,
  },
  sideLabel: { fontSize: 10, fontWeight: '600', marginBottom: 4 },
  sideContent: { fontSize: 12, color: Colors.t2, fontFamily: 'monospace' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  resolveBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    backgroundColor: Colors.s2, borderWidth: 1, borderColor: Colors.b1,
    alignItems: 'center',
  },
  resolveBtnText: { fontSize: 12, fontWeight: '600' },
  timestamp: { fontSize: 10, color: Colors.t3, marginTop: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: Colors.t3 },
  emptySubtext: { fontSize: 12, color: Colors.t3, marginTop: 4 },
});
