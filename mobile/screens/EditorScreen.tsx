/**
 * @module EditorScreen
 * Text editor — route "Editor".
 * All AsyncStorage/auto-save/delta logic unchanged. Only visual layer updated.
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity, SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

  useEffect(() => { loadFile(); }, [fileId]);

  const loadFile = async () => {
    const stored = await AsyncStorage.getItem('@docusync/files');
    if (!stored) return;
    const files: FileRecord[] = JSON.parse(stored);
    const found = files.find(f => f.id === fileId);
    if (found) { setFile(found); setContent(found.content); lastSave.current = found.content; }
  };

  // Auto-save every 500ms — unchanged logic
  useEffect(() => {
    if (!file) return;
    const iv = setInterval(async () => {
      if (content !== lastSave.current) {
        const stored = await AsyncStorage.getItem('@docusync/files');
        if (!stored) return;
        const files: FileRecord[] = JSON.parse(stored);
        const idx = files.findIndex(f => f.id === fileId);
        if (idx >= 0) {
          files[idx].content = content;
          files[idx].updatedAt = new Date().toISOString();
          files[idx].size = content.length;
          await AsyncStorage.setItem('@docusync/files', JSON.stringify(files));

          const delta = Math.abs(content.length - lastSave.current.length);
          setDeltaSize(delta);
          setVcState(v => { const n = [...v]; n[0] = n[0] + 1; return n; });

          const evStr = await AsyncStorage.getItem(`@docusync/events/${fileId}`);
          const events = evStr ? JSON.parse(evStr) : [];
          events.push({
            id: events.length + 1,
            eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            fileId, nodeId: 'mobile-node', eventType: 'edit',
            logicalTimestamp: events.length + 1,
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
    <SafeAreaView style={styles.root}>
      {/* Sub-header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backBtnText}>← Files</Text>
        </TouchableOpacity>
        <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
        <View style={[styles.saveStatus, saved ? styles.saveStatusSaved : styles.saveStatusUnsaved]}>
          <Text style={[styles.saveStatusText, { color: saved ? colors.green : colors.amber }]}>
            {saved ? '✓' : '●'}
          </Text>
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
            placeholderTextColor="#a1a1aa"
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
    backgroundColor: '#ffffff',
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
    color: '#1a1a2e',
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
