/**
 * @module ConflictsScreen
 * Conflict resolution — tab "Conflicts".
 * All AsyncStorage/resolve logic unchanged. Only visual layer updated.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView,
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

  // ── Conflict Card ─────────────────────────────────────────────────────────

  const renderConflict = ({ item }: { item: ConflictRecord }) => {
    const isPending = item.status === 'pending';

    return (
      <View style={[styles.card, !isPending && styles.cardResolved]}>
        {/* Card header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.conflictBadge}>
              <Text style={styles.conflictBadgeText}>CONFLICT</Text>
            </View>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.fileName || `File #${item.fileId.slice(0, 6)}`}
            </Text>
          </View>
          <Text style={styles.timestamp}>{new Date(item.detectedAt).toLocaleDateString()}</Text>
        </View>

        <View style={{ padding: 12 }}>
          {/* Status row */}
          <View style={[
            styles.statusRow,
            isPending
              ? { backgroundColor: Colors.amberLight, borderColor: 'rgba(245,158,11,0.20)' }
              : { backgroundColor: Colors.greenLight, borderColor: 'rgba(34,197,94,0.20)' },
          ]}>
            <Text style={{ fontSize: 11, color: isPending ? Colors.amber : Colors.green, fontWeight: '600' }}>
              {isPending ? '⚠ Pending resolution' : `✓ Resolved — Winner: ${item.winner}`}
            </Text>
          </View>

          {/* Side A — red */}
          <View style={{ marginTop: 10 }}>
            <Text style={styles.sideLabel}>
              <Text style={{ color: Colors.red }}>Original · </Text>
              <Text style={{ fontFamily: 'monospace' }}>{item.nodeIdA.slice(0, 10)}</Text>
            </Text>
            <View style={styles.sideBoxA}>
              <Text style={styles.sidePrefix} accessibilityLabel="deleted">
                <Text style={{ color: Colors.red }}>− </Text>
              </Text>
              <Text style={styles.sideContent} numberOfLines={4}>
                {item.payloadA || '(empty)'}
              </Text>
            </View>
          </View>

          {/* Side B — green */}
          <View style={{ marginTop: 8 }}>
            <Text style={styles.sideLabel}>
              <Text style={{ color: Colors.green }}>Incoming · </Text>
              <Text style={{ fontFamily: 'monospace' }}>{item.nodeIdB.slice(0, 10)}</Text>
            </Text>
            <View style={styles.sideBoxB}>
              <Text style={styles.sidePrefix}>
                <Text style={{ color: Colors.green }}>+ </Text>
              </Text>
              <Text style={styles.sideContent} numberOfLines={4}>
                {item.payloadB || '(empty)'}
              </Text>
            </View>
          </View>

          {/* Action buttons — stacked, full width */}
          {isPending && (
            <View style={styles.btnStack}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnGhost]}
                onPress={() => resolve(item.id, 'A')}
                activeOpacity={0.75}
              >
                <Text style={[styles.actionBtnText, { color: Colors.textSecondary }]}>Keep Original</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnAccent]}
                onPress={() => resolve(item.id, 'A')}
                activeOpacity={0.75}
              >
                <Text style={[styles.actionBtnText, { color: Colors.accent }]}>⚡ LWW Auto-Merge</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={() => resolve(item.id, 'B')}
                activeOpacity={0.75}
              >
                <Text style={[styles.actionBtnText, { color: Colors.white }]}>Accept Change</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Conflicts</Text>
        <Text style={styles.subtitle}>{pending.length} pending</Text>
      </View>

      {/* Warning banner */}
      {pending.length > 0 && (
        <View style={styles.warningBanner}>
          <Text style={{ fontSize: 16 }}>⚠</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.warningTitle}>
              {pending.length} conflict{pending.length !== 1 ? 's' : ''} need resolution
            </Text>
            <Text style={styles.warningSubtext}>Resolve before changes propagate to peers.</Text>
          </View>
        </View>
      )}

      {/* List or empty state */}
      {conflicts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🛡️</Text>
          <Text style={styles.emptyTitle}>No conflicts</Text>
          <Text style={styles.emptySubtext}>All files are in sync</Text>
        </View>
      ) : (
        <FlatList
          data={conflicts}
          keyExtractor={c => c.id}
          renderItem={renderConflict}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgBase,
  },
  title:    { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  // Warning banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 16,
    marginBottom: 0,
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.amberLight,
    borderLeftWidth: 3,
    borderLeftColor: Colors.amber,
    borderRadius: 10,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.amber,
  },
  warningSubtext: {
    fontSize: 11,
    color: Colors.amber,
    opacity: 0.75,
    marginTop: 2,
  },

  // Conflict card
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardResolved: {
    borderColor: Colors.border,
    opacity: 0.75,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239,68,68,0.12)',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  conflictBadge: {
    backgroundColor: Colors.redLight,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.30)',
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  conflictBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.red,
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    flex: 1,
  },
  timestamp: {
    fontSize: 10,
    color: Colors.textMuted,
    marginLeft: 8,
    flexShrink: 0,
  },

  // Status row
  statusRow: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },

  // Side boxes
  sideLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sideBoxA: {
    flexDirection: 'row',
    backgroundColor: Colors.redLight,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.15)',
    borderRadius: 8,
    padding: 10,
    paddingHorizontal: 12,
  },
  sideBoxB: {
    flexDirection: 'row',
    backgroundColor: Colors.greenLight,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.15)',
    borderRadius: 8,
    padding: 10,
    paddingHorizontal: 12,
  },
  sidePrefix: {
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '700',
    marginRight: 4,
    marginTop: 1,
  },
  sideContent: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
    lineHeight: 18,
  },

  // Action buttons
  btnStack: { marginTop: 12, gap: 8 },
  actionBtn: {
    width: '100%',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionBtnGhost: {
    backgroundColor: 'transparent',
    borderColor: Colors.border,
  },
  actionBtnAccent: {
    backgroundColor: Colors.accentLight,
    borderColor: Colors.borderAccent,
  },
  actionBtnPrimary: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Empty
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon:    { fontSize: 56, marginBottom: 16 },
  emptyTitle:   { fontSize: 18, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  emptySubtext: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
});
