import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mindera.halloweenminder',
  appName: 'Halloween Minder',
  webDir: 'dist',
  backgroundColor: '#1a0b2e',
  ios: {
    contentInset: 'never',
  },
  android: {
    backgroundColor: '#1a0b2e',
  },
};

export default config;
