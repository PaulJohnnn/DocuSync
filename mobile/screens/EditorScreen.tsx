/**
 * @module EditorScreen
 * Text editor — route "Editor".
 * Uses user-scoped storage so each account edits their own files.
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uGet, uSet } from '../utils/userStorage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';

interface FileRecord {
  id: string; name: string; type: string; size: number;
  content: string; status: string; createdAt: string; updatedAt: string;
}

export default function EditorScreen({ route, navigation }: any) {
  const { fileId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [file, setFile]           = useState<FileRecord | null>(null);
  const [content, setContent]     = useState('');
  const [saved, setSaved]         = useState(true);
  const [vcState, setVcState]     = useState([0, 0, 0]);
  const [deltaSize, setDeltaSize] = useState(0);
  const lastSave = useRef('');

  const lastSyncedAt = useRef(0);

  useEffect(() => { loadFile(); }, [fileId]);

  const loadFile = async () => {
    const stored = await uGet('files');
    if (!stored) return;
    const files: FileRecord[] = JSON.parse(stored);
    const found = files.find(f => f.id === fileId);
    if (found) { setFile(found); setContent(found.content); lastSave.current = found.content; }
  };

  // Poll Matchmaker /doc
  useEffect(() => {
    let iv: NodeJS.Timeout;
    const pollDoc = async () => {
      try {
        const storedRoomStr = await uGet('current_room');
        if (!storedRoomStr) return;
        const room = JSON.parse(storedRoomStr);
        if (!room) return;
        const roomOtp = room.otp || room.id;
        
        const url = `http://192.168.68.100:3000/api/lobby/doc?otp=${roomOtp}&fileId=${fileId}&since=${lastSyncedAt.current || 0}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (data.unchanged || !data.snapshot) return;
        
        const snap = data.snapshot;
        if (snap.committedAt > (lastSyncedAt.current || 0) && snap.authorNodeId !== 'mobile-node') {
          lastSyncedAt.current = snap.committedAt;
          setContent(snap.content);
          lastSave.current = snap.content;
          setSaved(true);
        }
      } catch {}
    };
    pollDoc();
    iv = setInterval(pollDoc, 1500);
    return () => clearInterval(iv);
  }, [fileId]);

  // Auto-save every 500ms — unchanged logic
  useEffect(() => {
    if (!file) return;
    const iv = setInterval(async () => {
      if (content !== lastSave.current) {
        const stored = await uGet('files');
        if (!stored) return;
        const files: FileRecord[] = JSON.parse(stored);
        const idx = files.findIndex(f => f.id === fileId);
        if (idx >= 0) {
          files[idx].content = content;
          files[idx].updatedAt = new Date().toISOString();
          files[idx].size = content.length;
          await uSet('files', JSON.stringify(files));

          const delta = Math.abs(content.length - lastSave.current.length);
          setDeltaSize(delta);
          
          let currentVc = [0, 0, 0];
          setVcState(v => { const n = [...v]; n[0] = n[0] + 1; currentVc = n; return n; });

          // Push to Matchmaker
          try {
            const storedRoomStr = await uGet('current_room');
            if (storedRoomStr) {
              const room = JSON.parse(storedRoomStr);
              const roomOtp = room.otp || room.id;
              const now = Date.now();
              lastSyncedAt.current = now;
              await fetch('http://192.168.68.100:3000/api/lobby/doc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  otp: roomOtp,
                  fileId,
                  authorNodeId: 'mobile-node',
                  authorName: 'Mobile',
                  content,
                  vectorClock: { nodeCount: 3, nodeIndex: 2, root: { children: [] }, counters: currentVc },
                  deltaSize: delta,
                }),
              });
            }
          } catch (e) {
            console.error('[Mobile Sync] Push failed:', e);
          }

          const evStr = await AsyncStorage.getItem(`@docusync/events/${fileId}`);
          const events = evStr ? JSON.parse(evStr) : [];
          events.push({
            id: events.length + 1,
            eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            fileId, nodeId: 'mobile-node', eventType: 'edit',
            logicalTimestamp: currentVc[0],
            payload: content.slice(0, 200),
            createdAt: new Date().toISOString(),
          });
          await AsyncStorage.setItem(`@docusync/events/${fileId}`, JSON.stringify(events));
          lastSave.current = content;
          setSaved(true);
        }
      }
    }, 500);
    return () => clearInterval(iv);
  }, [content, file, fileId]);

  if (!file) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>File not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Sub-header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="arrow-back" size={16} color={colors.accent} />
            <Text style={styles.backBtnText}>Files</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
        <View style={[styles.saveStatus, saved ? styles.saveStatusSaved : styles.saveStatusUnsaved]}>
          <Ionicons
            name={saved ? 'save' : 'ellipse'}
            size={14}
            color={saved ? colors.green : colors.amber}
          />
        </View>
      </View>

      {/* White document editor */}
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
            placeholder="Start typing…"
            placeholderTextColor={colors.textMuted}
            textAlignVertical="top"
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      </ScrollView>

      {/* Footer metrics bar */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>vc [{vcState.join(', ')}]</Text>
        <Text style={styles.footerText}>Δ {deltaSize} B</Text>
        <Text style={styles.footerText}>0 peers</Text>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (themeColors: typeof Colors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: themeColors.bgBase,
  },

  // Header
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
  saveStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Editor
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
    fontFamily: undefined, // use system serif via lineHeight/fontSize
    textAlignVertical: 'top',
  },

  // Footer
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
