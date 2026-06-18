import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from './constants/Colors';

import FilesScreen     from './screens/FilesScreen';
import ConflictsScreen from './screens/ConflictsScreen';
import PeersScreen     from './screens/PeersScreen';
import MetricsScreen   from './screens/MetricsScreen';
import SettingsScreen  from './screens/SettingsScreen';
import { ThemeProvider, useTheme } from './context/ThemeContext';

const Tab = createBottomTabNavigator();

// ── Tab icons (emoji — no extra lib needed) ───────────────────────────────

const TAB_ICONS: Record<string, string> = {
  Files:     '📄',
  Conflicts: '⚡',
  Peers:     '🔗',
  Metrics:   '📊',
  Settings:  '⚙️',
};

function TabIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <Text style={{ fontSize: 22, color }}>{TAB_ICONS[name] ?? '●'}</Text>
      {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />}
    </View>
  );
}

// ── App ───────────────────────────────────────────────────────────────────

function MainApp() {
  const { colors } = useTheme();
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={route.name} color={color} focused={focused} />
          ),
          tabBarActiveTintColor:   colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize:     10,
            fontWeight:   '500',
            marginBottom: 4,
          },
          tabBarStyle: {
            backgroundColor: colors.bgCard,
            borderTopColor:  colors.border,
            borderTopWidth:  1,
            height:          60,
            paddingTop:      6,
            paddingBottom:   8,
          },
          headerShown: false,
        })}
      >
        <Tab.Screen name="Files"     component={FilesScreen}     />
        <Tab.Screen name="Conflicts" component={ConflictsScreen} />
        <Tab.Screen name="Peers"     component={PeersScreen}     />
        <Tab.Screen name="Metrics"   component={MetricsScreen}   />
        <Tab.Screen name="Settings"  component={SettingsScreen}  />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}
