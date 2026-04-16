import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PushRegistrationProvider } from './src/context/PushRegistrationContext';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  return (
    <PushRegistrationProvider>
      <SafeAreaProvider>
        <AppNavigator />
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </PushRegistrationProvider>
  );
}
