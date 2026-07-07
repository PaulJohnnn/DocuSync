/**
 * @module HistoryScreen
 * Version History — tab "History".
 * Displays immutable EventLog audit trail across all local documents.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { uGet } from '../utils/userStorage';

interface EventRecord {
  id: number;
  eventId: string;
  fileId: string;
  fileName?: string;
  nodeId: string;
  eventType: string;
  logicalTimestamp: number;
  payload: string;
  createdAt: string;
}

export default function HistoryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const filesStr = await uGet('files');
      if (!filesStr) {
        setEvents([]);
        return;
      }
      const files = JSON.parse(filesStr);
      const allEvents: EventRecord[] = [];

      for (const f of files) {
        const evStr = await AsyncStorage.getItem(`@docusync/events_${f.id}`);
        if (evStr) {
          const evts = JSON.parse(evStr);
          allEvents.push(...evts.map((e: any) => ({ ...e, fileName: f.name })));
        }
      }

      allEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setEvents(allEvents);
    } catch (e) {
      console.error('[HistoryScreen] Failed to load history:', e);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const getEventMeta = (type: string) => {
    switch (type) {
      case 'edit':
        return { icon: 'document-text-outline' as const, label: 'Edit', color: colors.accent };
      case 'merge':
        return { icon: 'git-merge-outline' as const, label: 'Merge', color: colors.green };
      case 'conflict-resolve':
        return { icon: 'shield-checkmark-outline' as const, label: 'Conflict Resolved', color: colors.amber };
      case 'restore':
        return { icon: 'refresh-outline' as const, label: 'Restore', color: '#8b5cf6' };
      default:
        return { icon: 'time-outline' as const, label: type, color: colors.textSecondary };
    }
  };

  const renderItem = ({ item }: { item: EventRecord }) => {
    const meta = getEventMeta(item.eventType);
    const timeStr = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return (
      <View style={styles.card}>
        <View style={[styles.iconBox, { backgroundColor: `${meta.color}15`, borderColor: `${meta.color}40` }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        <View style={styles.contentBox}>
          <View style={styles.topRow}>
            <Text style={[styles.typeLabel, { color: meta.color }]}>{meta.label}</Text>
            <Text style={styles.timeText}>{timeStr}</Text>
          </View>
          <Text style={styles.fileName}>{item.fileName || `File #${item.fileId.slice(0, 6)}`}</Text>
          <Text style={styles.metaText}>Node: {item.nodeId.slice(0, 8)} • vc[{item.logicalTimestamp}]</Text>
          {item.payload ? (
            <View style={styles.payloadBox}>
              <Text style={styles.payloadText} numberOfLines={2}>{item.payload.trim()}</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        <Text style={styles.subtitle}>{events.length} audit trail event{events.length !== 1 ? 's' : ''}</Text>
      </View>

      {events.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={64} color={colors.border} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>No history yet</Text>
          <Text style={styles.emptySubtext}>Edits, merges, and resolutions will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item, idx) => `${item.eventId || idx}-${item.createdAt}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
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
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentBox: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  typeLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  timeText: { fontSize: 11, color: colors.textMuted },
  fileName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  metaText: { fontSize: 11, color: colors.textMuted, fontFamily: 'monospace', marginBottom: 6 },
  payloadBox: { backgroundColor: colors.bgBase, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  payloadText: { fontSize: 12, color: colors.textSecondary, fontFamily: 'monospace' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  emptySubtext: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
