/**
 * @module FilesScreen
 * Main file list — tab "Files".
 * All AsyncStorage logic unchanged. Only visual layer updated.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, Platform,
  TextInput, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';
import LogoIcon from '../components/LogoIcon';
import AnimatedButton from '../components/AnimatedButton';
import ConfirmModal from '../components/ConfirmModal';

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

function statusMeta(status: string, colors: any): { label: string; color: string; bg: string; border: string } {
  switch (status) {
    case 'synced':   return { label: '● Synced',  color: colors.green, bg: colors.greenLight, border: 'rgba(34,197,94,0.20)'  };
    case 'syncing':  return { label: '↻ Syncing', color: colors.amber, bg: colors.amberLight, border: 'rgba(245,158,11,0.20)' };
    case 'conflict': return { label: '⚠ Conflict', color: colors.red,   bg: colors.redLight,   border: 'rgba(239,68,68,0.20)'  };
    default:         return { label: status,        color: colors.textMuted, bg: colors.border, border: colors.border };
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FilesScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'my_files' | 'peer_rooms'>('my_files');
  const [currentRoom, setCurrentRoom] = useState<{ id: string, name: string } | null>(null);
  const [peerCount, setPeerCount] = useState<number>(0);
  const [confirmModal, setConfirmModal] = useState(false);
  const [roomFiles, setRoomFiles] = useState<any[]>([]);
  const [showRoomList, setShowRoomList] = useState(false);
  const [publicRooms, setPublicRooms] = useState<any[]>([]);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);

  useEffect(() => {
    loadFiles();
    loadRoomAndPeers();
    
    // Poll for room updates since PeersScreen updates it
    const timer = setInterval(() => {
      loadRoomAndPeers();
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (route.params?.tab) {
      setActiveTab(route.params.tab);
    }
  }, [route.params?.tab]);

  const loadRoomAndPeers = async () => {
    try {
      const roomStored = await AsyncStorage.getItem('@docusync/current_room');
      if (roomStored) {
        const parsedRoom = JSON.parse(roomStored);
        setCurrentRoom(parsedRoom);
        if (!parsedRoom.id.startsWith('direct-')) {
          try {
            const res = await fetch(`https://docusync-pnc.vercel.app/api/lobby/files?otp=${parsedRoom.id}`);
            if (res.ok) {
              const data = await res.json();
              setRoomFiles(data.files || []);
            }
          } catch (e) {
            console.error(e);
          }
        }
      } else {
        setCurrentRoom(null);
        setRoomFiles([]);
      }
      
      const peersStored = await AsyncStorage.getItem('@docusync/peers');
      if (peersStored) {
        const peersData = JSON.parse(peersStored);
        const connected = peersData.filter((p: any) => p.status === 'connected').length;
        setPeerCount(connected);
      } else {
        setPeerCount(0);
      }
      
      if (activeTab === 'peer_rooms') {
        const resList = await fetch(`https://docusync-pnc.vercel.app/api/lobby/list`);
        if (resList.ok) {
          const listData = await resList.json();
          setPublicRooms(listData.rooms || []);
        }
      }
    } catch {
      // ignore
    }
  };

  const loadFiles = async () => {
    const stored = await AsyncStorage.getItem('@docusync/files');
    if (stored) setFiles(JSON.parse(stored));
    else {
      const demoFiles: FileRecord[] = [
        { id: '101', name: 'ProjectProposal.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1245000, content: '', status: 'synced', createdAt: '', updatedAt: '' },
        { id: '102', name: 'Notes.md', type: 'text/markdown', size: 14500, content: '', status: 'conflict', createdAt: '', updatedAt: '' },
        { id: '103', name: 'Data_Export.csv', type: 'text/csv', size: 890456, content: '', status: 'synced', createdAt: '', updatedAt: '' },
        { id: '104', name: 'package.json', type: 'application/json', size: 2048, content: '', status: 'syncing', createdAt: '', updatedAt: '' },
        { id: '105', name: 'index.tsx', type: 'text/typescript', size: 12048, content: '', status: 'synced', createdAt: '', updatedAt: '' },
      ];
      setFiles(demoFiles);
      await AsyncStorage.setItem('@docusync/files', JSON.stringify(demoFiles));
    }
  };

  const saveFiles = async (newFiles: FileRecord[]) => {
    setFiles(newFiles);
    await AsyncStorage.setItem('@docusync/files', JSON.stringify(newFiles));
  };

  const handleDownloadRoomFile = async (f: any) => {
    if (!f.content) {
      Alert.alert("Error", "This file was shared without content.");
      return;
    }
    
    try {
      const fileId = f.fileId?.toString() || Date.now().toString();
      const fileName = f.fileName || f.name || 'SharedFile.txt';
      const fileUri = FileSystem.cacheDirectory + fileName;
      
      await FileSystem.writeAsStringAsync(fileUri, f.content, { encoding: FileSystem.EncodingType.UTF8 });

      const newFile: FileRecord = {
        id: fileId,
        name: fileName,
        type: 'text/plain',
        size: f.contentLength || f.content.length,
        content: fileUri,
        status: 'synced',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      
      await saveFiles([...files.filter(ex => ex.id !== newFile.id), newFile]);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Saved', 'File downloaded to local app storage.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to download file.');
      console.error(e);
    }
  };

  const openFile = async (isRoomShare: boolean = false) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/json', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      
      const fileId = Date.now().toString();
      const newFile: FileRecord = {
        id: fileId,
        name: result.assets[0].name,
        type: result.assets[0].mimeType || 'text/plain',
        size: result.assets[0].size || 0,
        content: result.assets[0].uri,
        status: 'synced',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      
      if (isRoomShare && currentRoom && !currentRoom.id.startsWith('direct-')) {
        try {
          let contentString = '';
          try {
            contentString = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
          } catch (e) {
            console.error('Failed to read file content', e);
          }

          await fetch(`https://docusync-pnc.vercel.app/api/lobby/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp: currentRoom.id, file: {
              fileId: parseInt(fileId),
              fileName: newFile.name,
              filePath: newFile.content,
              contentLength: newFile.size,
              content: contentString
            }})
          });
          Alert.alert('Success', 'File shared to room!');
        } catch (e) {
          Alert.alert('Error', 'Failed to share file to room');
        }
      } else {
        await saveFiles([...files, newFile]);
      }
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

  const renderFile = ({ item }: { item: FileRecord }) => {
    const ext   = extMeta(item.name, colors);
    const isConflict = item.status === 'conflict';

    return (
      <TouchableOpacity
        style={[
          styles.fileCard,
          { borderBottomColor: colors.border },
          isConflict && { borderLeftWidth: 3, borderLeftColor: colors.red },
        ]}
        onPress={() => navigation.navigate('Editor', { fileId: item.id })}
        onLongPress={() => deleteFile(item.id)}
        activeOpacity={0.75}
      >
        <View style={[styles.extIcon, { backgroundColor: ext.bg }]}>
          <Text style={{ color: ext.color, fontSize: 10, fontWeight: '800', fontFamily: 'monospace' }}>
            {ext.label}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.filePath} numberOfLines={1}>{formatBytes(item.size)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {item.status === 'synced' && (
              <Ionicons name="checkmark-circle" size={18} color={colors.green} />
            )}
            {item.status === 'syncing' && (
              <Ionicons name="sync" size={18} color={colors.amber} />
            )}
            {item.status === 'conflict' && (
              <Ionicons name="alert-circle" size={18} color={colors.red} />
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 8 }} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bgBase }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bgBase }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <LogoIcon size={32} />
          <View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>DocuSync</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>{files.length} file{files.length !== 1 ? 's' : ''} tracked</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {activeTab === 'my_files' && (
            <React.Fragment>
              <AnimatedButton
                onPress={() => openFile(false)}
                style={[styles.openBtn, { backgroundColor: colors.accent }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="add-circle" size={16} color="#fff" />
                  <Text style={styles.openBtnText}>Open</Text>
                </View>
              </AnimatedButton>
            </React.Fragment>
          )}
          {activeTab === 'peer_rooms' && !currentRoom && (
            <AnimatedButton
              onPress={() => navigation.navigate('Peers')}
              style={[styles.openBtn, { backgroundColor: colors.accent }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="people" size={16} color="#fff" />
                <Text style={styles.openBtnText}>Join</Text>
              </View>
            </AnimatedButton>
          )}
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 16, backgroundColor: colors.bgCard, borderRadius: 8, padding: 4, borderWidth: 1, borderColor: colors.border }}>
        <TouchableOpacity
          style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6, backgroundColor: activeTab === 'my_files' ? colors.bgBase : 'transparent', shadowColor: activeTab === 'my_files' ? '#000' : 'transparent', shadowOpacity: 0.05, shadowRadius: 2, elevation: activeTab === 'my_files' ? 1 : 0 }}
          onPress={() => setActiveTab('my_files')}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: activeTab === 'my_files' ? colors.textPrimary : colors.textMuted }}>My Files</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6, backgroundColor: activeTab === 'peer_rooms' ? colors.bgBase : 'transparent', shadowColor: activeTab === 'peer_rooms' ? '#000' : 'transparent', shadowOpacity: 0.05, shadowRadius: 2, elevation: activeTab === 'peer_rooms' ? 1 : 0 }}
          onPress={() => setActiveTab('peer_rooms')}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: activeTab === 'peer_rooms' ? colors.textPrimary : colors.textMuted }}>Peer Rooms</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'my_files' && files.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="documents-outline" size={64} color={colors.textMuted} style={{ marginBottom: 16 }} />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No files yet</Text>
          <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>Tap "Open File" to add documents</Text>
        </View>
      )}

      {activeTab === 'my_files' && files.length > 0 && (
        <View style={{ padding: 16, flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted, marginBottom: 8, letterSpacing: 0.5 }}>OPEN DOCUMENTS</Text>
          <View style={[styles.tableContainer, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <FlatList
              data={files}
              keyExtractor={f => f.id}
              renderItem={renderFile}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      )}

      {/* Content - Peer Rooms Empty / List */}
      {activeTab === 'peer_rooms' && (!currentRoom || showRoomList) && (
        <View style={{ padding: 16, flex: 1 }}>
          {currentRoom && (
            <View style={{
              backgroundColor: colors.accent, padding: 12, borderRadius: 8,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 16, shadowColor: colors.accent, shadowOpacity: 0.3, shadowRadius: 8
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' }} />
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Session: {currentRoom.name}</Text>
              </View>
              <TouchableOpacity 
                style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                onPress={() => setShowRoomList(false)}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Return</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>Active Peer Rooms</Text>
            <TouchableOpacity 
              style={{ backgroundColor: colors.bgCard, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}
              onPress={() => navigation.navigate('Peers')}
            >
              <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: '600' }}>Host Room</Text>
            </TouchableOpacity>
          </View>

          {publicRooms.length === 0 ? (
            <View style={[styles.empty, { flex: 0, paddingVertical: 40 }]}>
              <Ionicons name="globe-outline" size={48} color={colors.textMuted} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary, fontSize: 16, marginBottom: 6 }]}>No active rooms found</Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted, fontSize: 13 }]}>Host a live session to create a new room.</Text>
            </View>
          ) : (
            <FlatList
              data={publicRooms}
              keyExtractor={item => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.bgCard, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 12
                  }}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 }}>{item.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted, fontFamily: 'monospace' }}>OTP: {item.id}</Text>
                    </View>
                    <View style={{ backgroundColor: 'rgba(34,197,94,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ color: colors.green, fontSize: 11, fontWeight: '600' }}>Active</Text>
                    </View>
                  </View>
                  
                  <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="people" size={14} color={colors.textSecondary} />
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>{item.peersJoined || 1} peers</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="folder-open" size={14} color={colors.textSecondary} />
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>{item.filesCount} files</Text>
                    </View>
                  </View>
                  
                  <TouchableOpacity
                    style={{ backgroundColor: colors.accent, paddingVertical: 10, borderRadius: 6, alignItems: 'center', opacity: joiningRoomId === item.id ? 0.7 : 1 }}
                    disabled={joiningRoomId === item.id}
                    onPress={async () => {
                      if (currentRoom?.id === item.id) {
                        setShowRoomList(false);
                        return;
                      }
                      try {
                        setJoiningRoomId(item.id);
                        await new Promise(r => setTimeout(r, 600));
                        const res = await fetch(`https://docusync-pnc.vercel.app/api/lobby/join`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ otp: item.id, clientNodeId: `mobile-${Date.now()}` })
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);
                        
                        const joinedRoom = { id: item.id, name: data.roomName, hostIp: data.hostIp, hostPort: data.hostPort, memberCount: data.memberCount };
                        await AsyncStorage.setItem('@docusync/current_room', JSON.stringify(joinedRoom));
                        setCurrentRoom(joinedRoom);
                        setShowRoomList(false);
                      } catch (err: any) {
                        Alert.alert('Error', err.message);
                      } finally {
                        setJoiningRoomId(null);
                      }
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
                      {joiningRoomId === item.id ? 'Connecting...' : (currentRoom?.id === item.id ? 'Return to Room' : 'Join Room')}
                    </Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {/* Content - Selected Room Drill-down */}
      {activeTab === 'peer_rooms' && currentRoom && !showRoomList && (
        <View style={{ padding: 16, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <TouchableOpacity 
                onPress={() => setShowRoomList(true)} 
                style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, padding: 6, backgroundColor: colors.bgCard, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
              >
                <Ionicons name="arrow-back" size={16} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>{currentRoom.name}</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>{currentRoom.id.startsWith('direct-') ? 'Direct IP' : `OTP: ${currentRoom.id}`} • {peerCount} connected</Text>
              </View>
            </View>
            <TouchableOpacity 
              onPress={() => setConfirmModal(true)}
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' }}
            >
              <Text style={{ color: colors.red, fontSize: 12, fontWeight: '600' }}>Leave</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted, marginBottom: 8, letterSpacing: 0.5 }}>ROOM FILES</Text>
          {roomFiles.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 24, flex: 0 }]}>
              <Ionicons name="cloud-download-outline" size={48} color={colors.textMuted} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary, fontSize: 16, marginBottom: 6 }]}>No files shared in this room yet</Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted, fontSize: 12, marginBottom: 16 }]}>Files shared by peers will appear here.</Text>
              <TouchableOpacity 
                style={{ backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                onPress={() => openFile(true)}
              >
                <Ionicons name="folder-open" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Share File to Room</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <FlatList
                data={roomFiles}
                keyExtractor={(item, idx) => item.fileId?.toString() || idx.toString()}
                renderItem={({ item }) => {
                  const ext = extMeta(item.fileName, colors);
                  return (
                    <TouchableOpacity
                      style={[styles.fileCard, { borderBottomColor: colors.border }]}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.extIcon, { backgroundColor: ext.bg }]}>
                        <Text style={{ color: ext.color, fontSize: 10, fontWeight: '800', fontFamily: 'monospace' }}>
                          {ext.label}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={styles.fileName} numberOfLines={1}>{item.fileName}</Text>
                          <Text style={styles.filePath} numberOfLines={1}>{formatBytes(item.contentLength)}</Text>
                        </View>
                      </View>
                      <TouchableOpacity 
                        style={{ backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                        onPress={() => handleDownloadRoomFile(item)}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Download</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                }}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
              <TouchableOpacity 
                style={{ backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }}
                onPress={() => openFile(true)}
              >
                <Ionicons name="folder-open" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Share File to Room</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <ConfirmModal
        visible={confirmModal}
        title="Leave Room"
        message="Are you sure you want to leave this room?"
        confirmText="Leave"
        cancelText="Cancel"
        onCancel={() => setConfirmModal(false)}
        onConfirm={async () => {
          await AsyncStorage.removeItem('@docusync/current_room');
          setCurrentRoom(null);
          setConfirmModal(false);
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
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    backgroundColor: themeColors.bgBase,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: themeColors.textMuted,
    marginTop: 2,
  },
  openBtn: {
    backgroundColor: themeColors.accent,
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openBtnText: {
    color: themeColors.white,
    fontSize: 13,
    fontWeight: '600',
  },

  // File card
  tableContainer: {
    backgroundColor: themeColors.bgCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
    overflow: 'hidden',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  extIcon: {
    width: 32,
    height: 32,
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
    color: themeColors.textSecondary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: themeColors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
