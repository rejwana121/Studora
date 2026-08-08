import fs from 'node:fs';
import path from 'node:path';

const moduleRoot = __dirname;
const appRoot = path.join(moduleRoot, '..', '..');

describe('workload-alarm local Expo module registration', () => {
  it('declares the native module class in expo-module.config.json for Android only', () => {
    const config = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'expo-module.config.json'), 'utf8')) as {
      platforms: string[];
      android: { modules: string[] };
    };

    expect(config.platforms).toEqual(['android']);
    expect(config.android.modules).toContain('expo.modules.workloadalarm.WorkloadAlarmModule');
  });

  it('registers the foreground service and only the three approved permissions', () => {
    const manifest = fs.readFileSync(path.join(moduleRoot, 'android/src/main/AndroidManifest.xml'), 'utf8');

    expect(manifest).toContain('android.permission.FOREGROUND_SERVICE"');
    expect(manifest).toContain('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"');
    expect(manifest).toContain('android.permission.WAKE_LOCK"');
    expect(manifest).not.toMatch(/android:name="android\.permission\.(SCHEDULE_EXACT_ALARM|USE_EXACT_ALARM)"/);

    expect(manifest).toContain('expo.modules.workloadalarm.WorkloadAlarmService');
    expect(manifest).toContain('android:foregroundServiceType="mediaPlayback"');
    expect(manifest).toContain('android:exported="false"');
  });

  it('bundles the alarm sound as a raw resource', () => {
    expect(fs.existsSync(path.join(moduleRoot, 'android/src/main/res/raw/studora_alarm_loop.wav'))).toBe(true);
  });

  it('never uses a full-screen intent anywhere in the native service source', () => {
    const serviceSource = fs.readFileSync(
      path.join(moduleRoot, 'android/src/main/java/expo/modules/workloadalarm/WorkloadAlarmService.kt'),
      'utf8'
    );

    expect(serviceSource).not.toMatch(/\.setFullScreenIntent\(/);
    expect(serviceSource).toContain('START_NOT_STICKY');
  });

  it('never starts an Activity from the service itself (Android 12+ notification-trampoline restriction)', () => {
    const serviceSource = fs.readFileSync(
      path.join(moduleRoot, 'android/src/main/java/expo/modules/workloadalarm/WorkloadAlarmService.kt'),
      'utf8'
    );

    // A notification action that launches an Activity via an intermediary
    // Service/BroadcastReceiver is blocked as a "trampoline" for apps
    // targeting Android 12+. The "Take a Break" action must use a direct
    // PendingIntent.getActivity() instead — this service must never call
    // startActivity() itself.
    expect(serviceSource).not.toMatch(/\bstartActivity\(/);
    expect(serviceSource).toMatch(/PendingIntent\.getActivity\(/);
  });

  it('is linked into the app as a local file: dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };

    expect(pkg.dependencies['workload-alarm']).toBe('file:./modules/workload-alarm');
  });

  it('does not request exact-alarm scheduling anywhere in app config either', () => {
    const appConfig = fs.readFileSync(path.join(appRoot, 'app.config.js'), 'utf8');
    expect(appConfig).not.toMatch(/android\.permission\.(SCHEDULE_EXACT_ALARM|USE_EXACT_ALARM)/);
  });
});
