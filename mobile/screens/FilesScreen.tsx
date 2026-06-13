import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
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

export default function FilesScreen({ navigation }: any) {
  const [files, setFiles] = useState<FileRecord[]>([]);

  useEffect(() => {
    loadFiles();
  }, []);

  // Refresh when screen is focused
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => loadFiles());
    return unsubscribe;
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
      try {
        content = await FileSystem.readAsStringAsync(file.uri);
      } catch {
        content = `[File: ${file.name}]`;
      }

      const newFile: FileRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        type: file.mimeType || 'text/plain',
        size: file.size || content.length,
        content,
        status: 'synced',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveFiles([...files, newFile]);
    } catch (err) {
      Alert.alert('Error', 'Failed to open file');
    }
  };

  const deleteFile = async (id: string) => {
    Alert.alert('Delete File', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await saveFiles(files.filter(f => f.id !== id));
          await AsyncStorage.removeItem(`@docusync/events/${id}`);
        },
      },
    ]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'synced': return Colors.grn;
      case 'syncing': return Colors.amb;
      case 'conflict': return Colors.red;
      default: return Colors.t3;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const renderFile = ({ item }: { item: FileRecord }) => (
    <TouchableOpacity
      style={styles.fileCard}
      onPress={() => navigation.navigate('Editor', { fileId: item.id })}
      onLongPress={() => deleteFile(item.id)}
    >
      <View style={[styles.fileIcon, { borderColor: Colors.acc + '60' }]}>
        <Text style={{ color: Colors.acc, fontSize: 16, fontWeight: '700' }}>
          {item.name.split('.').pop()?.toUpperCase().slice(0, 3) || 'TXT'}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.fileMeta}>
          {formatBytes(item.size)} • {new Date(item.updatedAt).toLocaleDateString()}
        </Text>
      </View>
      <View style={[styles.statusBadge, { borderColor: getStatusColor(item.status) + '50' }]}>
        <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
        <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
          {item.status}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>DocuSync</Text>
          <Text style={styles.subtitle}>{files.length} files tracked</Text>
        </View>
        <TouchableOpacity style={styles.openBtn} onPress={openFile}>
          <Text style={styles.openBtnText}>+ Open File</Text>
        </TouchableOpacity>
      </View>

      {files.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📁</Text>
          <Text style={styles.emptyText}>No files yet</Text>
          <Text style={styles.emptySubtext}>Tap &quot;Open File&quot; to add documents</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={f => f.id}
          renderItem={renderFile}
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
    padding: 16, paddingTop: 12, borderBottomWidth: 1, borderBottomColor: Colors.b1,
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.t1 },
  subtitle: { fontSize: 13, color: Colors.t3, marginTop: 2 },
  openBtn: {
    backgroundColor: Colors.acc, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 8,
  },
  openBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  fileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.s1, borderWidth: 1, borderColor: Colors.b1,
    borderRadius: 10, padding: 14,
  },
  fileIcon: {
    width: 44, height: 44, borderRadius: 10, borderWidth: 1,
    backgroundColor: Colors.acc + '15', alignItems: 'center', justifyContent: 'center',
  },
  fileName: { fontSize: 14, fontWeight: '600', color: Colors.t1 },
  fileMeta: { fontSize: 11, color: Colors.t3, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: Colors.t3 },
  emptySubtext: { fontSize: 12, color: Colors.t3, marginTop: 4 },
});
