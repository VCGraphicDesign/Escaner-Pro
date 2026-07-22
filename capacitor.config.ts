import { defineConfig } from '@capacitor/cli';

const config = defineConfig({
  appId: 'com.vcgraphicdesign.escanerpro',
  appName: 'Escaner Pro',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  },
  android: {
    buildOptions: {
      signingType: 'apksigner'
    }
  }
});

export default config;
