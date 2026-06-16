/**
 * @module FilesScreen
 * Main file list — tab "Files".
 * All AsyncStorage logic unchanged. Only visual layer updated.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Colors } from '../constants/Colors';

interface FileRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
  status: 'synced' | 'syncing' | 'conflict';
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extMeta(name: string): { label: string; color: string; bg: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'md': case 'markdown':
      return { label: 'MD',  color: '#4f7df8', bg: 'rgba(79,125,248,0.15)'  };
    case 'json':
      return { label: 'JS',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  };
    case 'txt': case 'text':
      return { label: 'TXT', color: '#7e8ba8', bg: 'rgba(126,139,168,0.10)' };
    case 'csv': case 'tsv':
      return { label: 'CSV', color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   };
    case 'docx': case 'doc':
      return { label: 'DOC', color: '#60a5fa', bg: 'rgba(59,130,246,0.15)'  };
    case 'xml': case 'html':
      return { label: 'XML', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  };
    default:
      return { label: ext.toUpperCase().slice(0, 3) || 'FILE', color: '#3d4a65', bg: 'rgba(61,74,101,0.15)' };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)    return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function statusMeta(status: string): { label: string; color: string; bg: string; border: string } {
  switch (status) {
    case 'synced':   return { label: '● Synced',  color: Colors.green, bg: Colors.greenLight, border: 'rgba(34,197,94,0.20)'  };
    case 'syncing':  return { label: '↻ Syncing', color: Colors.amber, bg: Colors.amberLight, border: 'rgba(245,158,11,0.20)' };
    case 'conflict': return { label: '⚠ Conflict', color: Colors.red,   bg: Colors.redLight,   border: 'rgba(239,68,68,0.20)'  };
    default:         return { label: status,        color: Colors.textMuted, bg: Colors.border, border: Colors.border };
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FilesScreen({ navigation }: any) {
  const [files, setFiles] = useState<FileRecord[]>([]);

  useEffect(() => { loadFiles(); }, []);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => loadFiles());
    return unsub;
  }, [navigation]);

  const loadFiles = async () => {
    const stored = await AsyncStorage.getItem('@docusync/files');
    if (stored) setFiles(JSON.parse(stored));
  };

  const saveFiles = async (newFiles: FileRecord[]) => {
    setFiles(newFiles);
    await AsyncStorage.setItem('@docusync/files', JSON.stringify(newFiles));
  };

  const openFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/json'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      let content = '';
      try { content = await FileSystem.readAsStringAsync(file.uri); }
      catch { content = `[File: ${file.name}]`; }
      const newFile: FileRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name, type: file.mimeType || 'text/plain',
        size: file.size || content.length, content,
        status: 'synced',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      await saveFiles([...files, newFile]);
    } catch { Alert.alert('Error', 'Failed to open file'); }
  };

  const deleteFile = async (id: string) => {
    Alert.alert('Delete File', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await saveFiles(files.filter(f => f.id !== id));
        await AsyncStorage.removeItem(`@docusync/events/${id}`);
      }},
    ]);
  };

  // ── File Card ──────────────────────────────────────────────────────────────

  const renderFile = ({ item }: { item: FileRecord }) => {
    const ext   = extMeta(item.name);
    const st    = statusMeta(item.status);
    const isConflict = item.status === 'conflict';

    return (
      <TouchableOpacity
        style={[
          styles.fileCard,
          isConflict && { borderColor: 'rgba(239,68,68,0.25)', borderLeftWidth: 3, borderLeftColor: Colors.red },
        ]}
        onPress={() => navigation.navigate('Editor', { fileId: item.id })}
        onLongPress={() => deleteFile(item.id)}
        activeOpacity={0.75}
      >
        {/* Extension icon */}
        <View style={[styles.extIcon, { backgroundColor: ext.bg }]}>
          <Text style={{ color: ext.color, fontSize: 10, fontWeight: '800', fontFamily: 'monospace' }}>
            {ext.label}
          </Text>
        </View>

        {/* File info */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.filePath} numberOfLines={1}>{formatBytes(item.size)} · {new Date(item.updatedAt).toLocaleDateString()}</Text>
          {/* Status tag */}
          <View style={[styles.statusTag, { backgroundColor: st.bg, borderColor: st.border }]}>
            <Text style={[styles.statusTagText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>

        {/* Chevron */}
        <Text style={{ color: Colors.textMuted, fontSize: 16, marginLeft: 4 }}>›</Text>
      </TouchableOpacity>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>DocuSync</Text>
          <Text style={styles.subtitle}>{files.length} file{files.length !== 1 ? 's' : ''} tracked</Text>
        </View>
        <TouchableOpacity style={styles.openBtn} onPress={openFile} activeOpacity={0.8}>
          <Text style={styles.openBtnText}>+ Open File</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {files.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📁</Text>
          <Text style={styles.emptyTitle}>No files yet</Text>
          <Text style={styles.emptySubtext}>Tap "Open File" to add documents</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={f => f.id}
          renderItem={renderFile}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgBase,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  openBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openBtnText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '600',
  },

  // File card
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 16,
  },
  extIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  filePath: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  statusTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // Empty
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
