import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from './constants/Colors';

import FilesScreen     from './screens/FilesScreen';
import ConflictsScreen from './screens/ConflictsScreen';
import PeersScreen     from './screens/PeersScreen';
import MetricsScreen   from './screens/MetricsScreen';

const Tab = createBottomTabNavigator();

// ── Tab icons (emoji — no extra lib needed) ───────────────────────────────

const TAB_ICONS: Record<string, string> = {
  Files:     '📄',
  Conflicts: '⚡',
  Peers:     '🔗',
  Metrics:   '📊',
};

function TabIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  return (
    <View style={tabIconStyles.wrap}>
      <Text style={{ fontSize: 22, color }}>{TAB_ICONS[name] ?? '●'}</Text>
      {focused && <View style={tabIconStyles.dot} />}
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 3 },
  dot:  { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.accent },
});

// ── App ───────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={route.name} color={color} focused={focused} />
          ),
          tabBarActiveTintColor:   Colors.accent,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize:     10,
            fontWeight:   '500',
            marginBottom: 4,
          },
          tabBarStyle: {
            backgroundColor: Colors.bgCard,
            borderTopColor:  Colors.border,
            borderTopWidth:  1,
            height:          60,
            paddingTop:      6,
            paddingBottom:   8,
          },
          // Custom header replaced by per-screen headers
          headerShown: false,
        })}
      >
        <Tab.Screen name="Files"     component={FilesScreen}     />
        <Tab.Screen name="Conflicts" component={ConflictsScreen} />
        <Tab.Screen name="Peers"     component={PeersScreen}     />
        <Tab.Screen name="Metrics"   component={MetricsScreen}   />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
