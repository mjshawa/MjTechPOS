import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.barpos.app',
  appName: 'MjTech POS',
  webDir: 'dist',
  server: { androidScheme: 'https' },
};

export default config;
