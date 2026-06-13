import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';

interface FileRecord {
  id: string; name: string; type: string; size: number;
  content: string; status: string; createdAt: string; updatedAt: string;
}

export default function EditorScreen({ route, navigation }: any) {
  const { fileId } = route.params;
  const [file, setFile] = useState<FileRecord | null>(null);
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(true);
  const [vcState, setVcState] = useState([0, 0, 0]);
  const [deltaSize, setDeltaSize] = useState(0);
  const lastSave = useRef('');

  useEffect(() => {
    loadFile();
  }, [fileId]);

  const loadFile = async () => {
    const stored = await AsyncStorage.getItem('@docusync/files');
    if (!stored) return;
    const files: FileRecord[] = JSON.parse(stored);
    const found = files.find(f => f.id === fileId);
    if (found) {
      setFile(found);
      setContent(found.content);
      lastSave.current = found.content;
    }
  };

  // Auto-save every 500ms
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
          setVcState(v => {
            const n = [...v];
            n[0] = n[0] + 1;
            return n;
          });

          // Log event
          const evStr = await AsyncStorage.getItem(`@docusync/events/${fileId}`);
          const events = evStr ? JSON.parse(evStr) : [];
          events.push({
            id: events.length + 1,
            eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            fileId, nodeId: 'mobile-node',
            eventType: 'edit',
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
      <View style={styles.container}>
        <Text style={styles.emptyText}>File not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
          <Text style={styles.saveStatus}>{saved ? '✓ Saved' : '● Unsaved'}</Text>
        </View>
        <TouchableOpacity style={styles.syncBtn}>
          <Text style={styles.syncBtnText}>Sync</Text>
        </TouchableOpacity>
      </View>

      {/* Editor */}
      <ScrollView style={styles.editorWrap}>
        <TextInput
          style={styles.editor}
          multiline
          value={content}
          onChangeText={t => { setContent(t); setSaved(false); }}
          placeholder="Start typing..."
          placeholderTextColor={Colors.t3}
          textAlignVertical="top"
        />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>vc [{vcState.join(', ')}]</Text>
        <Text style={styles.footerText}>Δ {deltaSize} B</Text>
        <Text style={styles.footerText}>0 peers</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.b1,
  },
  fileName: { fontSize: 16, fontWeight: '700', color: Colors.t1 },
  saveStatus: { fontSize: 11, color: Colors.t3, marginTop: 2 },
  syncBtn: {
    backgroundColor: Colors.acc, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 8,
  },
  syncBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  editorWrap: { flex: 1, padding: 16 },
  editor: {
    fontSize: 14, lineHeight: 22, color: Colors.t1, minHeight: 400,
    fontFamily: 'monospace',
  },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', padding: 10,
    borderTopWidth: 1, borderTopColor: Colors.b1,
    backgroundColor: Colors.bg2,
  },
  footerText: { fontSize: 11, color: Colors.t3, fontFamily: 'monospace' },
  emptyText: { fontSize: 14, color: Colors.t3, textAlign: 'center', marginTop: 40 },
});
