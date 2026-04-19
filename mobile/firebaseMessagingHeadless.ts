import Constants from 'expo-constants';

/**
 * Must run before `./App` is imported so `setBackgroundMessageHandler` registers first (RN Firebase).
 */
if (Constants.appOwnership !== 'expo') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const messaging = require('@react-native-firebase/messaging').default;
    messaging().setBackgroundMessageHandler(async () => {
      /* Notification+data messages show a system tray notification when backgrounded. */
    });
  } catch {
    /* Native module unavailable */
  }
}
