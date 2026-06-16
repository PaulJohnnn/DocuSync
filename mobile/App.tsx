import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';

import FilesScreen from './screens/FilesScreen';
import ConflictsScreen from './screens/ConflictsScreen';
import PeersScreen from './screens/PeersScreen';
import MetricsScreen from './screens/MetricsScreen';

const Tab = createBottomTabNavigator();

const COLORS = {
  bg:  '#0d1117',
  bg2: '#131929',
  b1:  '#253050',
  acc: '#4f7df8',
  t1:  '#dde4f5',
  t2:  '#8a9bc0',
  t3:  '#4d5f85',
  grn: '#1ec76a',
  amb: '#f5a020',
  pur: '#9b6ff5',
};

/** Emoji tab bar icon — avoids icon library dependency. */
function TabIcon({ label, color }: { label: string; color: string }) {
  const icons: Record<string, string> = {
    Files:     '📄',
    Conflicts: '⚡',
    Peers:     '🔗',
    Metrics:   '📊',
  };
  return (
    <Text style={{ fontSize: 18, color }}>
      {icons[label] ?? '●'}
    </Text>
  );
}

/**
 * DocuSync logo badge for React Native.
 * SVG is not natively supported without additional libraries,
 * so this renders a styled "DS" badge that matches the brand colours.
 */
function DSLogo() {
  return (
    <View style={styles.logoWrap}>
      <Text style={[styles.logoLetter, { color: COLORS.acc }]}>D</Text>
      <Text style={[styles.logoLetter, { color: COLORS.grn }]}>S</Text>
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color }) => (
            <TabIcon label={route.name} color={color} />
          ),
          tabBarActiveTintColor:   COLORS.acc,
          tabBarInactiveTintColor: COLORS.t3,
          tabBarStyle: {
            backgroundColor: COLORS.bg2,
            borderTopColor:  COLORS.b1,
            borderTopWidth:  1,
            paddingBottom:   4,
            height:          60,
          },
          tabBarLabelStyle: {
            fontSize:   11,
            fontWeight: '600',
          },
          headerStyle: {
            backgroundColor: COLORS.bg2,
            borderBottomColor: COLORS.b1,
            borderBottomWidth: 1,
          },
          headerTintColor: COLORS.t1,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize:   16,
          },
          // DS logo badge in every header's left slot
          headerLeft: () => <DSLogo />,
        })}
      >
        <Tab.Screen
          name="Files"
          component={FilesScreen}
          options={{ title: 'Files', headerTitle: 'DocuSync — Files' }}
        />
        <Tab.Screen
          name="Conflicts"
          component={ConflictsScreen}
          options={{ title: 'Conflicts', headerTitle: 'Conflict Resolution' }}
        />
        <Tab.Screen
          name="Peers"
          component={PeersScreen}
          options={{ title: 'Peers', headerTitle: 'P2P Network' }}
        />
        <Tab.Screen
          name="Metrics"
          component={MetricsScreen}
          options={{ title: 'Metrics', headerTitle: 'ISO 25010 Metrics' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  logoWrap: {
    width:           30,
    height:          30,
    borderRadius:    7,
    backgroundColor: COLORS.bg,
    borderWidth:     1.5,
    borderColor:     COLORS.acc,
    alignItems:      'center',
    justifyContent:  'center',
    flexDirection:   'row',
    marginLeft:      12,
    gap:             0,
  },
  logoLetter: {
    fontSize:   10,
    fontWeight: '800',
    lineHeight: 14,
  },
});
