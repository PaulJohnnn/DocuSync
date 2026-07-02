import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Clipboard, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import mockRoomService, { type Room } from '../services/mockRoomService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

type ViewState = 'list' | 'create_name' | 'create_generating' | 'create_success' | 'join_otp' | 'join_loading' | 'join_success' | 'join_error';

export default function PeersScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [view, setView] = useState<ViewState>('list');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  
  const [roomName, setRoomName] = useState('');
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null);
  
  const [otpInput, setOtpInput] = useState('');
  const [joinedRoom, setJoinedRoom] = useState<Room | null>(null);
  const [joinError, setJoinError] = useState('');

  const loadRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const data = await mockRoomService.listRooms();
      setRooms(data);
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  const handleCreateGenerate = async () => {
    if (!roomName.trim()) return;
    setView('create_generating');
    try {
      const room = await mockRoomService.createRoom(roomName);
      setCreatedRoom(room);
      setRooms(prev => [...prev, room]);
      setView('create_success');
    } catch {
      Alert.alert('Error', 'Failed to create room');
      setView('create_name');
    }
  };

  const handleJoinSubmit = async () => {
    if (otpInput.length < 6) return;
    setView('join_loading');
    try {
      const room = await mockRoomService.joinRoom(otpInput);
      setJoinedRoom(room);
      setRooms(prev => {
        const exists = prev.find(r => r.id === room.id);
        return exists ? prev : [...prev, room];
      });
      setView('join_success');
    } catch (err: any) {
      setJoinError(err?.message || 'Room not found.');
      setView('join_error');
    }
  };

  const handleDelete = async (roomId: string) => {
    await mockRoomService.deleteRoom(roomId);
    setRooms(prev => prev.filter(r => r.id !== roomId));
  };

  const handleEnterWorkspace = async (room: Room) => {
    await AsyncStorage.setItem('@docusync/current_room', JSON.stringify(room));
    navigation.navigate('Files');
  };

  const renderView = () => {
    switch (view) {
      case 'list':
        return (
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 4 }}>Sync Rooms</Text>
              <Text style={{ fontSize: 14, color: colors.textDim }}>Create a room or join one with an invite code to start syncing.</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
              <TouchableOpacity onPress={() => { setOtpInput(''); setJoinError(''); setView('join_otp'); }} style={{ flex: 1, backgroundColor: colors.surface, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontWeight: 'bold' }}>Join Room</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setRoomName(''); setView('create_name'); }} style={{ flex: 1, backgroundColor: colors.primary, padding: 12, borderRadius: 10, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Create Room</Text>
              </TouchableOpacity>
            </View>
            {loadingRooms ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
            ) : rooms.length === 0 ? (
              <View style={{ alignItems: 'center', marginTop: 40 }}>
                <Ionicons name="folder-open-outline" size={48} color={colors.textDim} />
                <Text style={{ marginTop: 12, fontSize: 16, color: colors.textDim }}>No rooms yet</Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {rooms.map(room => (
                  <View key={room.id} style={{ backgroundColor: colors.surface, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.text, marginBottom: 4 }}>{room.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.textDim, marginBottom: 8 }}>{room.isOwner ? '👑 You created this' : '🔗 Joined via invite'}</Text>
                    <Text style={{ fontSize: 12, color: colors.primary, fontFamily: 'monospace', fontWeight: 'bold', marginBottom: 16 }}>OTP: {room.otp}</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity onPress={() => handleEnterWorkspace(room)} style={{ flex: 1, backgroundColor: colors.primary, padding: 10, borderRadius: 8, alignItems: 'center' }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Enter</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(room.id)} style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.error, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        );
      
      case 'create_name':
        return (
          <View style={{ padding: 20, flex: 1, justifyContent: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 12, textAlign: 'center' }}>Create a Room</Text>
            <TextInput
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 16, borderRadius: 12, color: colors.text, fontSize: 16, marginBottom: 20 }}
              placeholder="e.g. Thesis Project..."
              placeholderTextColor={colors.textDim}
              value={roomName}
              onChangeText={setRoomName}
              autoFocus
            />
            <TouchableOpacity onPress={handleCreateGenerate} style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Generate Room</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView('list')} style={{ padding: 16, alignItems: 'center' }}>
              <Text style={{ color: colors.textDim, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        );

      case 'create_generating':
        return (
          <View style={{ padding: 20, flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ marginTop: 20, fontSize: 18, color: colors.text, fontWeight: 'bold' }}>Creating Room...</Text>
          </View>
        );

      case 'create_success':
        return (
          <View style={{ padding: 20, flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} style={{ marginBottom: 20 }} />
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 12 }}>Room Generated!</Text>
            <TouchableOpacity 
              onPress={() => Clipboard.setString(createdRoom?.otp ?? '')}
              style={{ backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary, padding: 20, borderRadius: 16, alignItems: 'center', width: '100%', marginBottom: 24, borderStyle: 'dashed' }}
            >
              <Text style={{ fontSize: 32, fontWeight: 'bold', color: colors.primary, letterSpacing: 4, fontFamily: 'monospace' }}>{createdRoom?.otp}</Text>
              <Text style={{ color: colors.primary, marginTop: 8, fontWeight: 'bold' }}>Tap to Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => createdRoom && handleEnterWorkspace(createdRoom)} style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', width: '100%', marginBottom: 12 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Enter Workspace</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView('list')} style={{ padding: 16, alignItems: 'center' }}>
              <Text style={{ color: colors.textDim, fontSize: 16 }}>Back to Room List</Text>
            </TouchableOpacity>
          </View>
        );

      case 'join_otp':
        return (
          <View style={{ padding: 20, flex: 1, justifyContent: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 12, textAlign: 'center' }}>Join a Room</Text>
            <Text style={{ fontSize: 14, color: colors.textDim, marginBottom: 24, textAlign: 'center' }}>Enter the 6-character invite code shared by the room owner.</Text>
            <TextInput
              style={{ backgroundColor: colors.surface, borderWidth: 2, borderColor: otpInput.length === 6 ? colors.primary : colors.border, padding: 16, borderRadius: 12, color: colors.text, fontSize: 24, fontWeight: 'bold', letterSpacing: 8, textAlign: 'center', fontFamily: 'monospace', marginBottom: 20 }}
              placeholder="CODE"
              placeholderTextColor={colors.textDim}
              value={otpInput}
              onChangeText={text => setOtpInput(text.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={6}
              autoFocus
              autoCapitalize="characters"
            />
            <TouchableOpacity onPress={handleJoinSubmit} disabled={otpInput.length < 6} style={{ backgroundColor: otpInput.length === 6 ? colors.primary : colors.surface, padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: otpInput.length === 6 ? '#fff' : colors.textDim, fontWeight: 'bold', fontSize: 16 }}>Join Room</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView('list')} style={{ padding: 16, alignItems: 'center' }}>
              <Text style={{ color: colors.textDim, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        );

      case 'join_loading':
        return (
          <View style={{ padding: 20, flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ marginTop: 20, fontSize: 18, color: colors.text, fontWeight: 'bold' }}>Joining Room...</Text>
          </View>
        );

      case 'join_success':
        return (
          <View style={{ padding: 20, flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={64} color={colors.green} style={{ marginBottom: 20 }} />
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 12 }}>Joined Room!</Text>
            <Text style={{ fontSize: 16, color: colors.textSecondary, marginBottom: 32 }}>You're now in {joinedRoom?.name}</Text>
            <TouchableOpacity onPress={() => joinedRoom && handleEnterWorkspace(joinedRoom)} style={{ backgroundColor: colors.accent, padding: 16, borderRadius: 12, alignItems: 'center', width: '100%', marginBottom: 12 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Enter Workspace</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView('list')} style={{ padding: 16, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 16 }}>Back to Room List</Text>
            </TouchableOpacity>
          </View>
        );

      case 'join_error':
        return (
          <View style={{ padding: 20, flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="close-circle" size={64} color={colors.red} style={{ marginBottom: 20 }} />
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 12 }}>Room Not Found</Text>
            <Text style={{ fontSize: 16, color: colors.textSecondary, marginBottom: 32, textAlign: 'center' }}>{joinError}</Text>
            <TouchableOpacity onPress={() => { setOtpInput(''); setJoinError(''); setView('join_otp'); }} style={{ backgroundColor: colors.accent, padding: 16, borderRadius: 12, alignItems: 'center', width: '100%', marginBottom: 12 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView('list')} style={{ padding: 16, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 16 }}>Back to Room List</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgBase }}>
      {renderView()}
    </SafeAreaView>
  );
}
