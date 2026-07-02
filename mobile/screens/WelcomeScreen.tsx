import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Main: undefined;
};

export default function WelcomeScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList, 'Welcome'>>();

  useEffect(() => {
    navigation.replace('Login');
  }, [navigation]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
      <ActivityIndicator size="large" color="#4f46e5" />
    </View>
  );
}
