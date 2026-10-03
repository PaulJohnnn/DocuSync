import React from 'react';
import { WebView } from 'react-native-webview';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <StatusBar style="dark" />
        {/* Open the application's sign-in page, not the site root.
            The root redirects to /home, which is the public marketing page —
            so the mobile app opened on a page advertising itself, with a
            download button, instead of letting the user sign in. The desktop
            app had the same problem and was fixed the same way, so all three
            platforms now start at the identical screen. */}
        <WebView
          source={{ uri: 'https://docusync-dusky.vercel.app/app/login' }}
          style={{ flex: 1 }}
          startInLoadingState={true}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
