import { Platform } from 'react-native';

const mockCreateURL = jest.fn((..._args: unknown[]) => 'studora://workload?fromAlarm=1');

jest.mock('expo-linking', () => ({
  createURL: (...args: unknown[]) => mockCreateURL(...args),
}));

const mockStart = jest.fn();
const mockStop = jest.fn();

jest.mock('workload-alarm', () => ({
  __esModule: true,
  default: {
    start: (...args: unknown[]) => mockStart(...args),
    stop: (...args: unknown[]) => mockStop(...args),
    isActive: () => false,
  },
}));

// eslint-disable-next-line import/first -- must come after jest.mock('workload-alarm', ...) above, which the mockStart/mockStop closures depend on being registered before this module is first required
import { isWorkloadAlarmSupported, startWorkloadAlarm, stopWorkloadAlarm } from './workload-alarm-controller';

describe('workload-alarm-controller (native module present)', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
    jest.clearAllMocks();
  });

  it('is unsupported on iOS even when a native module happens to be linked', () => {
    Platform.OS = 'ios';
    expect(isWorkloadAlarmSupported()).toBe(false);
  });

  it('is supported on android when the native module is present', () => {
    Platform.OS = 'android';
    expect(isWorkloadAlarmSupported()).toBe(true);
  });

  it('starts the native alarm with a real expo-linking deep link marked for Take a Break', async () => {
    Platform.OS = 'android';
    mockStart.mockResolvedValueOnce(undefined);

    const result = await startWorkloadAlarm();

    expect(result).toEqual({ ok: true });
    // The marker matters: /workload reads it to know a "Take a Break" tap
    // landed it there, and stops the alarm from JS — native no longer
    // does this itself (see WorkloadAlarmService.kt's trampoline-avoidance
    // comment on takeBreakPendingIntent).
    expect(mockCreateURL).toHaveBeenCalledWith('/workload', { queryParams: { fromAlarm: '1' } });
    expect(mockStart).toHaveBeenCalledWith('studora://workload?fromAlarm=1');
  });

  it('falls back with user-facing copy when the native start rejects', async () => {
    Platform.OS = 'android';
    mockStart.mockRejectedValueOnce(new Error('boom'));

    const result = await startWorkloadAlarm();

    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('is idempotent: repeated start calls never throw and each just re-signal native start', async () => {
    Platform.OS = 'android';
    mockStart.mockResolvedValue(undefined);

    await startWorkloadAlarm();
    await startWorkloadAlarm();

    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it('never throws when stopping and the native call rejects (best-effort contract)', async () => {
    Platform.OS = 'android';
    mockStop.mockRejectedValueOnce(new Error('nothing running'));

    await expect(stopWorkloadAlarm()).resolves.toBeUndefined();
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: repeated stop calls are all safe no-throws', async () => {
    Platform.OS = 'android';
    mockStop.mockResolvedValue(undefined);

    await stopWorkloadAlarm();
    await stopWorkloadAlarm();

    expect(mockStop).toHaveBeenCalledTimes(2);
  });
});

describe('workload-alarm-controller (native module absent — iOS/web/Expo Go build)', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('workload-alarm', () => ({ __esModule: true, default: null }));
    jest.doMock('expo-linking', () => ({ createURL: jest.fn() }));
  });

  afterEach(() => {
    Platform.OS = originalOS;
    jest.dontMock('workload-alarm');
    jest.dontMock('expo-linking');
  });

  it('reports unsupported and returns fallback copy even on android when the module is missing', async () => {
    // Dynamic requires are required here (not static imports): each needs
    // to re-resolve fresh against the jest.resetModules() call above, with
    // the 'workload-alarm' → null mock already registered for this block.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RN = require('react-native');
    RN.Platform.OS = 'android';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const controller = require('./workload-alarm-controller') as typeof import('./workload-alarm-controller');

    expect(controller.isWorkloadAlarmSupported()).toBe(false);

    const result = await controller.startWorkloadAlarm();
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();

    // stopWorkloadAlarm must still resolve cleanly with nothing to stop.
    await expect(controller.stopWorkloadAlarm()).resolves.toBeUndefined();
  });
});
