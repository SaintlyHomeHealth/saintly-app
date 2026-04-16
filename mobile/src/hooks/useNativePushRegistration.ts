/**
 * Re-export from app-level context — registration runs on app launch in `PushRegistrationProvider` (`App.tsx`).
 */
export {
  useNativePushRegistration,
  type NativePushHookState,
} from '../context/PushRegistrationContext';
