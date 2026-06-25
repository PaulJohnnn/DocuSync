import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import FilesScreen     from './screens/FilesScreen';
import ConflictsScreen from './screens/ConflictsScreen';
import PeersScreen     from './screens/PeersScreen';
import SettingsScreen  from './screens/SettingsScreen';
import SplashScreen    from './components/SplashScreen';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const Tab = createBottomTabNavigator();

// ── Per-tab icon config ───────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_CONFIG: Record<string, { active: IoniconName; inactive: IoniconName; color: string }> = {
  Files:     { active: 'documents',    inactive: 'documents-outline',    color: '#4f7df8' },
  Conflicts: { active: 'warning',      inactive: 'warning-outline',      color: '#ef4444' },
  Peers:     { active: 'people',       inactive: 'people-outline',       color: '#22c55e' },
  Settings:  { active: 'settings',     inactive: 'settings-outline',     color: '#7e8ba8' },
};

// ── Tab Icon ─────────────────────────────────────────────────────────────

function TabIcon({
  name,
  focused,
  conflictCount = 0,
}: {
  name: string;
  focused: boolean;
  conflictCount?: number;
}) {
  const { colors } = useTheme();
  const cfg = TAB_CONFIG[name];
  if (!cfg) return null;

  const iconName = focused ? cfg.active : cfg.inactive;
  const iconColor = focused ? cfg.color : colors.textMuted;

  return (
    <View style={{ alignItems: 'center' }}>
      <View>
        <Ionicons name={iconName} size={24} color={iconColor} />
        {/* Red conflict badge */}
        {name === 'Conflicts' && conflictCount > 0 && (
          <View style={{
            position: 'absolute',
            top: -4,
            right: -6,
            backgroundColor: '#ef4444',
            borderRadius: 8,
            minWidth: 16,
            height: 16,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 3,
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
          </View>
        )}
      </View>
      {/* Active dot indicator */}
      {focused && (
        <View style={{
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: cfg.color,
          marginTop: 3,
        }} />
      )}
    </View>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────

function MainApp() {
  const { colors } = useTheme();

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused }) => (
            <TabIcon name={route.name} focused={focused} />
          ),
          tabBarActiveTintColor:   TAB_CONFIG[route.name]?.color ?? colors.accent,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize:     10,
            fontWeight:   '600',
            marginBottom: 4,
          },
          tabBarStyle: {
            backgroundColor: colors.bgCard,
            borderTopColor:  colors.border,
            borderTopWidth:  1,
            height:          64,
            paddingTop:      6,
            paddingBottom:   8,
          },
          headerShown: false,
        })}
      >
        <Tab.Screen name="Files"     component={FilesScreen}     />
        <Tab.Screen name="Conflicts" component={ConflictsScreen} />
        <Tab.Screen name="Peers"     component={PeersScreen}     />
        <Tab.Screen name="Settings"  component={SettingsScreen}  />
      </Tab.Navigator>
    </>
  );
}

// ── Root with Splash ──────────────────────────────────────────────────────

import { createStackNavigator } from '@react-navigation/stack';
import WelcomeScreen from './screens/WelcomeScreen';
import LoginScreen from './screens/LoginScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Stack = createStackNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState<'Welcome' | 'Login' | 'Main'>('Welcome');

  useEffect(() => {
    async function initAuth() {
      try {
        const isUnlocked = await AsyncStorage.getItem('docusync_unlocked');
        
        // Always show Welcome screen first on app startup
        setInitialRoute('Welcome');
      } catch (e) {
        setInitialRoute('Welcome');
      } finally {
        setTimeout(() => setIsLoading(false), 1500); // give splash time
      }
    }
    initAuth();
  }, []);

  if (isLoading) return <SplashScreen />;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Main" component={MainApp} />
          </Stack.Navigator>
        </NavigationContainer>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
