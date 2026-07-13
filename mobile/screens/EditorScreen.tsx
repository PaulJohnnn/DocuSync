/**
 * @module EditorScreen
 * Text editor — route "Editor".
 * Syncs via Matchmaker/Redis backend (same as Desktop and Web).
 * Saves locally to AsyncStorage on every keystroke (500ms debounce),
 * pushes to Redis every 2s. Polls Redis every 3s for remote updates.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { uGet, uSet } from '../utils/userStorage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';
import { useMobileSync } from '../context/MobileSyncContext';

// ── Matchmaker URL ─────────────────────────────────────────────────────────
const MATCHMAKER_URL = 'http://192.168.68.100:3000/api/lobby';

interface FileRecord {
  id: string; name: string; type: string; size: number;
  content: string; status: string; createdAt: string; updatedAt: string;
}

export default function EditorScreen({ route, navigation }: any) {
  const { fileId } = route.params;
  const { colors } = useTheme();
  const { peers, pushCursor } = useMobileSync();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [file, setFile]               = useState<FileRecord | null>(null);
  const [content, setContent]         = useState('');
  const [saved, setSaved]             = useState(true);
  const [syncing, setSyncing]         = useState(false);
  const [isOnline, setIsOnline]       = useState(true);
  const [syncStatusMsg, setSyncStatusMsg] = useState('Ready');
  const [escalated, setEscalated]     = useState(false);
  const [offlineQueue, setOfflineQueue] = useState(false);

  const lastSave         = useRef('');
  const lastSyncedAt     = useRef(0);
  const localNodeIdRef   = useRef(`mobile-${Math.floor(Math.random() * 10000)}`);
  const syncDebounce     = useRef<NodeJS.Timeout | null>(null);
  const pollInterval     = useRef<NodeJS.Timeout | null>(null);
  const typingTimeout    = useRef<NodeJS.Timeout | null>(null);
  const cursorThrottle   = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef      = useRef(false);

  // ── Online/Offline detection ────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = !!(state.isConnected && state.isInternetReachable);
      setIsOnline(online);
      if (online && offlineQueue) {
        pushToRedis(content, true);
        setOfflineQueue(false);
      } else if (!online) {
        setSyncStatusMsg('Offline — edits saved locally');
      }
    });
    NetInfo.fetch().then(state => {
      setIsOnline(!!(state.isConnected && state.isInternetReachable));
    });
    return () => unsubscribe();
  }, [offlineQueue, content]);

  // ── Load file ────────────────────────────────────────────────────────────
  useEffect(() => { loadFile(); }, [fileId]);

  const loadFile = async () => {
    const stored = await uGet('files');
    if (!stored) return;
    const files: FileRecord[] = JSON.parse(stored);
    const found = files.find(f => String(f.id) === String(fileId));
    if (found) {
      setFile(found);
      setContent(found.content ?? '');
      lastSave.current = found.content ?? '';
    }
    // Load node ID
    const nid = await AsyncStorage.getItem('docusync_node_id');
    if (nid) localNodeIdRef.current = nid;
  };

  // ── Get room OTP ─────────────────────────────────────────────────────────
  const getRoomOtp = useCallback(async (): Promise<string | null> => {
    try {
      const storedRoomStr = await uGet('current_room');
      if (!storedRoomStr) return null;
      const room = JSON.parse(storedRoomStr);
      return room?.otp || room?.id || null;
    } catch { return null; }
  }, []);

  // ── Push to Redis ─────────────────────────────────────────────────────────
  const pushToRedis = useCallback(async (contentToSave: string, explicit = false) => {
    const otp = await getRoomOtp();
    if (!otp) return;

    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      setSyncStatusMsg('Offline — queued for sync');
      setOfflineQueue(true);
      return;
    }

    setSyncing(true);
    setSyncStatusMsg('Syncing...');

    try {
      const deltaSize = contentToSave.length;
      const now = Date.now();
      lastSyncedAt.current = now;

      const res = await fetch(`${MATCHMAKER_URL}/doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otp,
          fileId,
          authorNodeId: localNodeIdRef.current,
          authorName: localNodeIdRef.current.slice(0, 8),
          content: contentToSave,
          vectorClock: {},
          deltaSize,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.conflict) {
          setEscalated(true);
          setSyncStatusMsg('Conflict — sent to owner for review');
          setTimeout(() => setEscalated(false), 5000);
        } else {
          const time = new Date().toLocaleTimeString();
          setSyncStatusMsg(`Synced ✓ (v${data.seq || '?'}) at ${time}`);
          setOfflineQueue(false);
        }
      } else {
        setSyncStatusMsg('Host unavailable — edits saving locally');
        setOfflineQueue(true);
      }
    } catch (e) {
      console.error('[Mobile Sync] Push failed:', e);
      setSyncStatusMsg('Host unavailable — edits saving locally');
      setOfflineQueue(true);
    } finally {
      setSyncing(false);
    }
  }, [fileId, getRoomOtp]);

  // ── Poll Redis for remote updates ─────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) return;

      const otp = await getRoomOtp();
      if (!otp) return;

      try {
        const url = `${MATCHMAKER_URL}/doc?otp=${otp}&fileId=${fileId}&since=${lastSyncedAt.current}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        if (data.unchanged || !data.snapshot) {
          if (lastSyncedAt.current > 0) {
            setSyncStatusMsg(`Last synced ${new Date().toLocaleTimeString()}`);
          }
          return;
        }

        const snap = data.snapshot;
        if (isTypingRef.current) return; // Skip if actively typing

        if (snap.committedAt > lastSyncedAt.current && snap.authorNodeId !== localNodeIdRef.current) {
          lastSyncedAt.current = snap.committedAt;
          setContent(snap.content);
          lastSave.current = snap.content;
          setSaved(true);
          setSyncStatusMsg(`↓ ${snap.authorName || 'peer'} at ${new Date().toLocaleTimeString()}`);

          // Update local storage
          try {
            const stored = await uGet('files');
            if (stored) {
              const files: FileRecord[] = JSON.parse(stored);
              const idx = files.findIndex(f => f.id === fileId);
              if (idx >= 0) {
                files[idx].content = snap.content;
                files[idx].updatedAt = new Date().toISOString();
                files[idx].size = snap.content.length;
                await uSet('files', JSON.stringify(files));
              }
            }
          } catch {}
        }
      } catch {
        // Fetch failed — host is unreachable or down
        setSyncStatusMsg('Host unavailable — edits saving locally');
      }
    };

    poll();
    pollInterval.current = setInterval(poll, 3000);
    return () => { if (pollInterval.current) clearInterval(pollInterval.current); };
  }, [fileId, getRoomOtp]);

  // ── Save locally + push to Redis ─────────────────────────────────────────
  const saveFile = useCallback(async (contentToSave: string, forcePush = false) => {
    if (contentToSave === lastSave.current && !forcePush) return;

    // Step 1: Save to AsyncStorage
    const stored = await uGet('files');
    if (!stored) return;
    const files: FileRecord[] = JSON.parse(stored);
    const idx = files.findIndex(f => f.id === fileId);
    if (idx >= 0) {
      files[idx].content = contentToSave;
      files[idx].updatedAt = new Date().toISOString();
      files[idx].size = contentToSave.length;
      await uSet('files', JSON.stringify(files));
    }

    // Log to local event history
    const evStr = await AsyncStorage.getItem(`@docusync/events/${fileId}`);
    const events = evStr ? JSON.parse(evStr) : [];
    events.push({
      id: events.length + 1,
      eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fileId, nodeId: localNodeIdRef.current, eventType: 'edit',
      logicalTimestamp: events.length + 1,
      payload: contentToSave.slice(0, 200),
      createdAt: new Date().toISOString(),
    });
    await AsyncStorage.setItem(`@docusync/events/${fileId}`, JSON.stringify(events));

    lastSave.current = contentToSave;
    setSaved(true);

    // Step 2: Push to Redis (debounced 2s, or immediate)
    if (syncDebounce.current) clearTimeout(syncDebounce.current);
    if (forcePush) {
      await pushToRedis(contentToSave, true);
    } else {
      syncDebounce.current = setTimeout(() => { pushToRedis(contentToSave); }, 2000);
    }
  }, [fileId, pushToRedis]);

  const handleContentChange = (text: string) => {
    setContent(text);
    setSaved(false);

    isTypingRef.current = true;
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 2000);

    if (syncDebounce.current) clearTimeout(syncDebounce.current);
    syncDebounce.current = setTimeout(() => {
      pushToRedis(text);
    }, 2000);
  };

  // ── Auto-save on content change (500ms debounce) ─────────────────────────
  useEffect(() => {
    if (!file) return;
    const iv = setTimeout(() => { saveFile(content); }, 500);
    return () => clearTimeout(iv);
  }, [content, file, fileId]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (syncDebounce.current) clearTimeout(syncDebounce.current);
    };
  }, []);

  // ── Not found ─────────────────────────────────────────────────────────────
  if (!file) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>File not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {escalated && (
        <View style={{ backgroundColor: colors.amber, padding: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>
            Change sent to room owner for conflict review.
          </Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="arrow-back" size={16} color={colors.accent} />
            <Text style={styles.backBtnText}>Room</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 16 }}>
          {/* Online/offline indicator */}
          <Ionicons
            name={isOnline ? 'wifi' : 'wifi-outline'}
            size={12}
            color={
              !isOnline ? colors.textMuted : 
              (offlineQueue || syncStatusMsg.includes('unavailable') || syncStatusMsg.includes('failed')) ? colors.amber : 
              colors.green
            }
          />
          <Text style={{ fontSize: 10, color: colors.textDim }} numberOfLines={1}>
            {syncStatusMsg}
          </Text>
          {/* Save/sync status icon */}
          <TouchableOpacity
            onPress={() => saveFile(content, true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[styles.saveStatus, saved ? styles.saveStatusSaved : styles.saveStatusUnsaved]}
          >
            <Ionicons
              name={syncing ? 'sync' : saved ? 'checkmark' : 'ellipse'}
              size={14}
              color={syncing ? colors.accent : saved ? colors.green : colors.amber}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Editor */}
      <ScrollView
        style={styles.editorWrap}
        contentContainerStyle={styles.editorContent}
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.editorSheet}>
          <TextInput
            style={styles.editor}
            multiline
            value={content}
            onChangeText={t => { setContent(t); setSaved(false); }}
            onSelectionChange={(e) => {
              if (cursorThrottle.current) return;
              cursorThrottle.current = setTimeout(() => { cursorThrottle.current = null; }, 200);
              const pos = e.nativeEvent.selection.start;
              pushCursor(fileId, pos, 2);
            }}
            placeholder="Start typing…"
            placeholderTextColor={colors.textMuted}
            textAlignVertical="top"
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {offlineQueue ? '⏳ Offline — queued' : `Δ ${content.length} chars`}
        </Text>
        <Text style={styles.footerText}>
          {peers.filter(p => p.status === 'connected').length} peers
        </Text>
        {/* Sync Now button */}
        <TouchableOpacity
          onPress={() => saveFile(content, true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: syncing ? 0.6 : 1 }}
          disabled={syncing}
        >
          <Ionicons name="sync" size={12} color={colors.accent} />
          <Text style={{ fontSize: 10, color: colors.accent, fontWeight: '600' }}>
            {syncing ? 'Syncing…' : 'Sync Now'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (themeColors: typeof Colors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: themeColors.bgBase,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    backgroundColor: themeColors.bgCard,
  },
  backBtn: {
    height: 32,
    justifyContent: 'center',
    paddingRight: 8,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: themeColors.accent,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.textPrimary,
    textAlign: 'center',
  },
  saveStatus: {
    width: 28,
    height: 28,
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveStatusSaved:   { backgroundColor: themeColors.greenLight },
  saveStatusUnsaved: { backgroundColor: themeColors.amberLight },

  editorWrap: {
    flex: 1,
    backgroundColor: themeColors.bgBase,
  },
  editorContent: {
    padding: 12,
    paddingBottom: 32,
  },
  editorSheet: {
    backgroundColor: themeColors.bgCard,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  editor: {
    fontSize: 15,
    lineHeight: 27,
    color: themeColors.textPrimary,
    minHeight: 420,
    padding: 24,
    textAlignVertical: 'top',
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
    backgroundColor: themeColors.bgCard,
  },
  footerText: {
    fontSize: 10,
    color: themeColors.textMuted,
    fontFamily: 'monospace',
  },

  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    fontSize: 14,
    color: themeColors.textMuted,
  },
});
