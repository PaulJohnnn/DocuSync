/**
 * @module FilesScreen
 * Room workspace — shows files inside the currently joined room.
 * "My Files" tab removed. Navigate to Peers tab to enter a room.
 * Uses user-scoped storage so each account has isolated data.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';
import LogoIcon from '../components/LogoIcon';
import AnimatedButton from '../components/AnimatedButton';
import ConfirmModal from '../components/ConfirmModal';
import { uGet, uSet, uRemove } from '../utils/userStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MATCHMAKER_KEY = '@docusync/matchmaker_url';
const DEFAULT_MATCHMAKER = 'https://docusync-dusky.vercel.app/api/lobby';

/**
 * Extensions that DocuSync's delta engine can handle (text streams).
 * Anything NOT in this set is rejected before upload.
 * Mirrors desktop/electron/ipc-handlers.ts → ALLOWED_EXTENSIONS.
 */
const MOBILE_ALLOWED_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'csv', 'ts', 'tsx', 'js', 'jsx', 'css', 'html', 'docx', 'doc', ''
]);

async function getMatchmakerUrl(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(MATCHMAKER_KEY);
    return saved ? saved.replace(/\/$/, '') : DEFAULT_MATCHMAKER;
  } catch {
    return DEFAULT_MATCHMAKER;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extMeta(name: string, colors: any): { label: string; color: string; bg: string } {
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
      return { label: ext.toUpperCase().slice(0, 3) || 'FILE', color: colors.textSecondary, bg: colors.bgSelected };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)    return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FilesScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [currentRoom, setCurrentRoom] = useState<{ id: string; name: string; otp?: string; hostIp?: string; hostPort?: number } | null>(null);
  const [peerCount, setPeerCount] = useState<number>(0);
  const [roomFiles, setRoomFiles] = useState<any[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [leaveModal, setLeaveModal] = useState(false);

  // ── Load room + peers on mount and poll every 2s ─────────────────────────
  useEffect(() => {
    loadRoomAndPeers();
    const timer = setInterval(loadRoomAndPeers, 2000);
    return () => clearInterval(timer);
  }, []);

  const loadRoomAndPeers = async () => {
    try {
      const roomStored = await uGet('current_room');
      if (roomStored) {
        const parsedRoom = JSON.parse(roomStored);
        setCurrentRoom(parsedRoom);
        if (!parsedRoom.id.startsWith('direct-')) {
          try {
            const code = (parsedRoom as any).otp || parsedRoom.id;
            const mm = await getMatchmakerUrl();
            const res = await fetch(`${mm}/api/lobby/files?otp=${code}`);
            if (res.ok) {
              const data = await res.json();
              setRoomFiles(data.files || []);
            }
          } catch {}
        }
      } else {
        setCurrentRoom(null);
        setRoomFiles([]);
      }

      const peersStored = await uGet('peers');
      if (peersStored) {
        const peersData = JSON.parse(peersStored);
        setPeerCount(peersData.filter((p: any) => p.status === 'connected').length);
      } else {
        setPeerCount(0);
      }
    } catch { /* ignore */ }
  };

  // ── Share a file to the current room ─────────────────────────────────────
  const handleShareFile = async () => {
    if (!currentRoom) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/json', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];

      // ── Binary-file guard (mirrors desktop ALLOWED_EXTENSIONS) ──
      const pickedExt = (asset.name.split('.').pop() ?? '').toLowerCase();
      if (!MOBILE_ALLOWED_EXTENSIONS.has(pickedExt)) {
        Alert.alert(
          'Unsupported File Type',
          `Binary files (${asset.name}) are not supported. DocuSync's delta engine operates on text streams.`
        );
        return;
      }

      setIsSharing(true);
      let contentString = '';
      try {
        contentString = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: 'utf8' as any,
        });
      } catch {
        // binary file – skip content
      }

      const fileId = Date.now();
      const mm = await getMatchmakerUrl();
      const res = await fetch(`${mm}/api/lobby/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otp: (currentRoom as any).otp || currentRoom.id,
          file: {
            fileId,
            fileName: asset.name,
            contentLength: asset.size || contentString.length,
            content: contentString,
            sharedBy: 'Mobile Node',
            sharedAt: new Date().toISOString(),
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Server error');
      }

      // Save locally
      const stored = await uGet('files');
      const localFiles = stored ? JSON.parse(stored) : [];
      const newLocal = {
        id: String(fileId),
        name: asset.name,
        type: asset.mimeType || 'text/plain',
        size: asset.size || contentString.length,
        content: contentString,
        status: 'synced',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await uSet('files', JSON.stringify([...localFiles, newLocal]));

      Alert.alert('Success', `"${asset.name}" shared to the room!`);
      loadRoomAndPeers();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to share file.');
    } finally {
      setIsSharing(false);
    }
  };

  // ── Download / open a room file locally ──────────────────────────────────
  const handleOpenRoomFile = async (f: any) => {
    try {
      const fileName = f.fileName || f.name || 'SharedFile.txt';
      const fileUri = (FileSystem as any).cacheDirectory + fileName;
      let contentStr = typeof f.content === 'string' ? f.content : (f.content ? String(f.content) : '');

      // If content is empty, attempt to fetch latest snapshot from server
      if (!contentStr && currentRoom) {
        try {
          const code = (currentRoom as any).otp || currentRoom.id;
          const targetFileId = f.fileId || f.id;
          const mm = await getMatchmakerUrl();
          const res = await fetch(`${mm}/api/lobby/doc?otp=${code}&fileId=${targetFileId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.snapshot?.content) {
              contentStr = data.snapshot.content;
            }
          }
        } catch { /* ignore fetch error */ }
      }

      await FileSystem.writeAsStringAsync(fileUri, contentStr, {
        encoding: 'utf8' as any,
      });

      // Save locally so editor can open it
      const stored = await uGet('files');
      const localFiles = stored ? JSON.parse(stored) : [];
      const fileId = String(f.fileId ?? f.id ?? Date.now());
      const newLocal = {
        id: fileId,
        name: fileName,
        type: 'text/plain',
        size: f.contentLength || contentStr.length,
        content: contentStr,   // store text content for editor
        status: 'synced',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await uSet('files', JSON.stringify([
        ...localFiles.filter((ex: any) => String(ex.id) !== fileId),
        newLocal,
      ]));

      navigation.navigate('Editor', { fileId });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to open file.');
    }
  };

  const handleDownloadRoomFile = async (f: any) => {
    try {
      const fileName = f.fileName || f.name || 'SharedFile.txt';
      const fileUri = (FileSystem as any).cacheDirectory + fileName;
      let contentStr = typeof f.content === 'string' ? f.content : (f.content ? String(f.content) : '');

      if (!contentStr && currentRoom) {
        try {
          const code = (currentRoom as any).otp || currentRoom.id;
          const targetFileId = f.fileId || f.id;
          const mm = await getMatchmakerUrl();
          const res = await fetch(`${mm}/api/lobby/doc?otp=${code}&fileId=${targetFileId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.snapshot?.content) {
              contentStr = data.snapshot.content;
            }
          }
        } catch { /* ignore fetch error */ }
      }

      await FileSystem.writeAsStringAsync(fileUri, contentStr, {
        encoding: 'utf8' as any,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Saved', 'File saved to local storage.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to download file.');
    }
  };


  // ── No room joined ─────────────────────────────────────────────────────────
  if (!currentRoom) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bgBase }]} edges={['top', 'left', 'right']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bgBase }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <LogoIcon size={32} />
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>DocuSync</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>No room selected</Text>
            </View>
          </View>
        </View>

        {/* Empty state */}
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={64} color={colors.textMuted} style={{ marginBottom: 16, opacity: 0.4 }} />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No room selected</Text>
          <Text style={[styles.emptySubtext, { color: colors.textMuted, marginBottom: 24 }]}>
            Go to Peers and enter a room to view and collaborate in your workspace.
          </Text>
          <AnimatedButton
            onPress={() => navigation.navigate('Peers')}
            style={{ backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="people" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Go to Peers →</Text>
            </View>
          </AnimatedButton>
        </View>
      </SafeAreaView>
    );
  }

  // ── Room workspace ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bgBase }]} edges={['top', 'left', 'right']}>

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bgBase }]}>
        <TouchableOpacity
          onPress={() => navigation.navigate('Peers')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{currentRoom.name}</Text>
          <TouchableOpacity 
            onPress={async () => {
              const code = currentRoom.otp || currentRoom.id;
              await Clipboard.setStringAsync(code);
              Alert.alert('Copied', 'OTP copied to clipboard!');
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}
          >
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              OTP: {currentRoom.otp || (currentRoom.id.length > 16 ? currentRoom.id.slice(0, 16) + '…' : currentRoom.id)}
            </Text>
            <Ionicons name="copy-outline" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <AnimatedButton
          onPress={() => setLeaveModal(true)}
          style={{ backgroundColor: 'rgba(239,68,68,0.12)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="log-out-outline" size={16} color={colors.red} />
            <Text style={{ color: colors.red, fontWeight: '600', fontSize: 13 }}>Leave</Text>
          </View>
        </AnimatedButton>
      </View>

      <FlatList
        data={roomFiles}
        keyExtractor={(item, idx) => item.fileId?.toString() || idx.toString()}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}

        ListHeaderComponent={
          <View>
            {/* Active Peers row */}
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.8, marginBottom: 8 }}>
              ACTIVE PEERS ({peerCount + 1})
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              <View style={{
                backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
                borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
                flexDirection: 'row', alignItems: 'center', gap: 6,
              }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green }} />
                <Text style={{ fontSize: 13, color: colors.textPrimary, fontWeight: '600' }}>You</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>(Mobile)</Text>
              </View>
              {peerCount > 0 && (
                <View style={{
                  backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
                  borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green }} />
                  <Text style={{ fontSize: 13, color: colors.textPrimary }}>{peerCount} other{peerCount > 1 ? 's' : ''}</Text>
                </View>
              )}
            </View>

            {/* Room Files header + Share button */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.8 }}>
                ROOM FILES ({roomFiles.length})
              </Text>
              <AnimatedButton
                onPress={handleShareFile}
                style={{ backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {isSharing
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="share-outline" size={15} color="#fff" />}
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Share File</Text>
                </View>
              </AnimatedButton>
            </View>

            {roomFiles.length === 0 && (
              <View style={{
                backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0',
                borderRadius: 16, padding: 32, alignItems: 'center',
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2
              }}>
                <Ionicons name="folder-open" size={56} color="#94a3b8" style={{ marginBottom: 16, opacity: 0.7 }} />
                <Text style={{ fontSize: 17, fontWeight: '600', color: '#1e293b', marginBottom: 8 }}>
                  No files in this room yet
                </Text>
                <Text style={{ fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22 }}>
                  Share a file to make it available to all connected peers.
                </Text>
              </View>
            )}
          </View>
        }

        renderItem={({ item }) => {
          const ext = extMeta(item.fileName || item.name || '', colors);
          return (
            <View style={{
              backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
              borderRadius: 10, padding: 14, marginBottom: 10,
              flexDirection: 'row', alignItems: 'center', gap: 12,
            }}>
              <View style={[styles.extIcon, { backgroundColor: ext.bg }]}>
                <Text style={{ color: ext.color, fontSize: 10, fontWeight: '800', fontFamily: 'monospace' }}>
                  {ext.label}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.fileName} numberOfLines={1}>{item.fileName || item.name}</Text>
                <Text style={[styles.filePath, { color: colors.textMuted }]}>
                  {formatBytes(item.contentLength || item.content?.length || 0)}
                  {item.sharedBy ? ` • ${item.sharedBy}` : ''}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => handleOpenRoomFile(item)}
                  style={{ backgroundColor: colors.accent, paddingHorizontal: 14, height: 32, borderRadius: 7, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Open & Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDownloadRoomFile(item)}
                  style={{ backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, width: 32, height: 32, borderRadius: 7, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Ionicons name="download-outline" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => console.log('Delete not implemented yet')}
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', width: 32, height: 32, borderRadius: 7, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      {/* Leave Modal */}
      <ConfirmModal
        visible={leaveModal}
        title="Leave Room"
        message={`Are you sure you want to leave "${currentRoom.name}"? You will be disconnected from all peers.`}
        confirmText="Leave Room"
        cancelText="Cancel"
        onCancel={() => setLeaveModal(false)}
        onConfirm={async () => {
          await uRemove('files');
          await uRemove('current_room');
          setCurrentRoom(null);
          setLeaveModal(false);
          navigation.navigate('Peers');
        }}
      />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    backgroundColor: themeColors.bgBase,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: themeColors.textMuted,
    marginTop: 1,
    fontFamily: 'monospace',
  },
  extIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.textPrimary,
    marginBottom: 2,
  },
  filePath: {
    fontSize: 11,
    color: themeColors.textMuted,
    fontFamily: 'monospace',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: themeColors.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    color: themeColors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
