import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text, View } from 'react-native';

import FilesScreen from './screens/FilesScreen';
import EditorScreen from './screens/EditorScreen';
import ConflictsScreen from './screens/ConflictsScreen';
import PeersScreen from './screens/PeersScreen';
import MetricsScreen from './screens/MetricsScreen';
import { Colors } from './constants/Colors';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Tab icon component
function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    'Files': '📁',
    'Conflicts': '⚠️',
    'Peers': '👥',
    'Metrics': '📊',
  };
  return (
    <View style={{
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: focused ? Colors.acc + '18' : 'transparent',
      borderRadius: 8, width: 36, height: 28,
    }}>
      <Text style={{ fontSize: 16 }}>{icons[name] || '📄'}</Text>
    </View>
  );
}

// Files stack (Files → Editor)
function FilesStack() {
  return (
    <Stack.Navigator screenOptions={{
      headerStyle: { backgroundColor: Colors.bg2, elevation: 0, shadowOpacity: 0 },
      headerTintColor: Colors.t1,
      headerTitleStyle: { fontWeight: '700' },
      cardStyle: { backgroundColor: Colors.bg },
    }}>
      <Stack.Screen name="FilesList" component={FilesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Editor" component={EditorScreen} options={({ route }: any) => ({
        title: 'Editor',
        headerBackTitle: 'Back',
      })} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Tab.Navigator screenOptions={{
        tabBarStyle: {
          backgroundColor: Colors.bg2,
          borderTopColor: Colors.b1,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarActiveTintColor: Colors.acc,
        tabBarInactiveTintColor: Colors.t3,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        headerStyle: {
          backgroundColor: Colors.bg2,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: Colors.t1,
        headerTitleStyle: { fontWeight: '700' },
      }}>
        <Tab.Screen
          name="Files"
          component={FilesStack}
          options={{
            headerShown: false,
            tabBarIcon: ({ focused }) => <TabIcon name="Files" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Conflicts"
          component={ConflictsScreen}
          options={{
            headerShown: false,
            tabBarIcon: ({ focused }) => <TabIcon name="Conflicts" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Peers"
          component={PeersScreen}
          options={{
            headerShown: false,
            tabBarIcon: ({ focused }) => <TabIcon name="Peers" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Metrics"
          component={MetricsScreen}
          options={{
            headerShown: false,
            tabBarIcon: ({ focused }) => <TabIcon name="Metrics" focused={focused} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
