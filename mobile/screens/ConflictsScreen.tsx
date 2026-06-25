/**
 * @module ConflictsScreen
 * Conflict resolution — tab "Conflicts".
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import AnimatedButton from '../components/AnimatedButton';

interface ConflictRecord {
  id: string; fileId: string; fileName: string;
  payloadA: string; nodeIdA: string;
  payloadB: string; nodeIdB: string;
  status: 'pending' | 'resolved';
  winner: 'A' | 'B' | null;
  detectedAt: string; resolvedAt: string | null;
}

export default function ConflictsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);

  useEffect(() => { loadConflicts(); }, []);

  const loadConflicts = async () => {
    const stored = await AsyncStorage.getItem('@docusync/conflicts');
    if (stored) setConflicts(JSON.parse(stored));
  };

  const resolve = async (conflictId: string, winner: 'A' | 'B') => {
    const updated = conflicts.map(c =>
      c.id === conflictId
        ? { ...c, status: 'resolved' as const, winner, resolvedAt: new Date().toISOString() }
        : c
    );
    setConflicts(updated);
    await AsyncStorage.setItem('@docusync/conflicts', JSON.stringify(updated));
  };

  const pending = conflicts.filter(c => c.status === 'pending');

  const renderConflict = ({ item }: { item: ConflictRecord }) => {
    const isPending = item.status === 'pending';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.fileName}>{item.fileName || `File #${item.fileId.slice(0, 6)}`}</Text>
            <Text style={styles.fileId}>{item.fileId}</Text>
          </View>
          <View style={[styles.statusIcon, isPending 
              ? { backgroundColor: colors.amberLight, borderColor: 'rgba(245,158,11,0.20)' }
              : { backgroundColor: colors.greenLight, borderColor: 'rgba(34,197,94,0.20)' }
          ]}>
            <Text style={{ fontSize: 11, color: isPending ? colors.amber : colors.green, fontWeight: '600' }}>
              {isPending ? '⚠ Conflict' : '✓ Resolved'}
            </Text>
          </View>
        </View>

        <View style={styles.diffContainer}>
          <View style={styles.diffCol}>
            <Text style={styles.diffLabel}>ORIGINAL</Text>
            <View style={styles.diffBoxDel}>
              <Text style={styles.diffTextDel} numberOfLines={4}>{item.payloadA || '(empty)'}</Text>
            </View>
          </View>
          <View style={styles.diffCol}>
            <Text style={styles.diffLabel}>INCOMING</Text>
            <View style={styles.diffBoxAdd}>
              <Text style={styles.diffTextAdd} numberOfLines={4}>{item.payloadB || '(empty)'}</Text>
            </View>
          </View>
        </View>

        {isPending && (
          <View style={styles.actionRow}>
            <AnimatedButton
              onPress={() => resolve(item.id, 'A')}
              style={[styles.actionBtn, styles.actionBtnGhost]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>Keep Original</Text>
              </View>
            </AnimatedButton>
            <AnimatedButton
              onPress={() => resolve(item.id, 'B')}
              style={[styles.actionBtn, styles.actionBtnPrimary]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={[styles.actionBtnText, { color: colors.white }]}>Accept Change</Text>
              </View>
            </AnimatedButton>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Conflicts</Text>
        <Text style={styles.subtitle}>{pending.length} pending</Text>
      </View>

      {pending.length > 0 && (
        <View style={styles.alertBar}>
          <Text style={{ fontSize: 16 }}>⚠</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>{pending.length} conflicts need resolution</Text>
            <Text style={styles.alertText}>Resolve before changes propagate to peers.</Text>
          </View>
        </View>
      )}

      {conflicts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="shield-checkmark" size={64} color="#22c55e" style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>No conflicts</Text>
          <Text style={styles.emptySubtext}>All files are in sync</Text>
        </View>
      ) : (
        <FlatList
          data={conflicts}
          keyExtractor={c => c.id}
          renderItem={renderConflict}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  alertBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12, margin: 16, padding: 16, borderRadius: 12,
    backgroundColor: colors.amberLight, borderWidth: 1, borderLeftWidth: 4, borderLeftColor: colors.amber, borderColor: 'rgba(245,158,11,0.20)',
  },
  alertTitle: { fontSize: 14, fontWeight: '600', color: colors.amber, marginBottom: 2 },
  alertText: { fontSize: 12, color: colors.amber, lineHeight: 18 },
  listContent: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  fileName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  fileId: { fontSize: 11, color: colors.textMuted, fontFamily: 'monospace' },
  statusIcon: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  diffContainer: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  diffCol: { flex: 1 },
  diffLabel: { fontSize: 11, fontWeight: '600', marginBottom: 6, color: colors.textMuted },
  diffBoxDel: { backgroundColor: colors.redLight, borderRadius: 8, padding: 10, minHeight: 60 },
  diffTextDel: { fontSize: 13, color: colors.red, lineHeight: 20 },
  diffBoxAdd: { backgroundColor: colors.greenLight, borderRadius: 8, padding: 10, minHeight: 60 },
  diffTextAdd: { fontSize: 13, color: colors.green, lineHeight: 20 },
  actionRow: { flexDirection: 'column', gap: 8 },
  actionBtn: { height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  actionBtnGhost: { backgroundColor: 'transparent' },
  actionBtnPrimary: { backgroundColor: colors.accent },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '500', color: colors.textSecondary, marginBottom: 8 },
  emptySubtext: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
