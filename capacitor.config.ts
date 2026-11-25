import type { CapacitorConfig } from '@capacitor/cli';

// Wraps the built web app (the dist folder) as the Android and iPhone apps.
const config: CapacitorConfig = {
  appId: 'com.getshiftkind.app',
  appName: 'ShiftKind',
  webDir: 'dist',
  backgroundColor: '#1d3a6e',
  android: { allowMixedContent: false },
  ios: { contentInset: 'always' },
};

export default config;
