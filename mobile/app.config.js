// Converted from app.json (Checkpoint 4B) solely to inject a build-time
// signal into `extra` for the /workload screen's preview-only "Test alarm
// sound" control — see workload.tsx. Every other field below is carried
// over unchanged from the prior static app.json; no projectId, owner,
// version, versionCode, signing credential, or package/bundle identifier
// was touched.
module.exports = {
  expo: {
    name: 'Studora',
    slug: 'studora',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'studora',
    userInterfaceStyle: 'automatic',
    ios: {
      icon: './assets/expo.icon',
      bundleIdentifier: 'com.rejwanaakter.studora',
    },
    android: {
      package: 'com.rejwanaakter.studora',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#208AEF',
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      ],
      'expo-secure-store',
      '@react-native-community/datetimepicker',
      [
        'expo-notifications',
        {
          color: '#6D28D9',
          sounds: ['./assets/audio/studora_alert.wav'],
        },
      ],
      [
        'expo-audio',
        {
          microphonePermission: false,
          recordAudioAndroid: false,
          enableBackgroundRecording: false,
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'Studora uses your photo library so you can choose a profile photo.',
          cameraPermission: 'Studora uses your camera so you can take a profile photo.',
          microphonePermission: false,
        },
      ],
      'expo-asset',
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      eas: {
        projectId: 'e9a6ee43-f484-4b08-b2d0-88552f2fedfc',
      },
      // Real, guaranteed EAS behavior (not a guess): `eas build` always
      // sets EAS_BUILD_PROFILE in the environment this file evaluates in,
      // to the exact profile name being built (currently only "preview" is
      // defined in eas.json). Local `expo start`/dev-client runs never set
      // it, so this is `null` there. The /workload screen's dev-only alarm
      // test control checks `easBuildProfile !== 'production'` — so it
      // stays visible today (no "production" profile exists yet) and will
      // automatically stop rendering the moment one is added and used,
      // with no further code change required.
      easBuildProfile: process.env.EAS_BUILD_PROFILE ?? null,
    },
    owner: 'rejwana_043',
  },
};
