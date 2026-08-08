import { Platform } from 'react-native';

import type { WorkloadCurrentResponse } from '@/types/api';

const mockMemoryStore = new Map<string, string>();

jest.mock('@/lib/secure-storage', () => ({
  secureStorageAdapter: {
    getItem: jest.fn(async (key: string) => mockMemoryStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockMemoryStore.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockMemoryStore.delete(key);
    }),
  },
}));

const mockIsWorkloadAlarmSupported = jest.fn();
const mockStartWorkloadAlarm = jest.fn();

jest.mock('./workload-alarm-controller', () => ({
  isWorkloadAlarmSupported: () => mockIsWorkloadAlarmSupported(),
  startWorkloadAlarm: () => mockStartWorkloadAlarm(),
}));

const mockScheduleNotificationAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  AndroidImportance: { MAX: 5 },
  setNotificationChannelAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  dismissNotificationAsync: jest.fn(async () => undefined),
}));

// eslint-disable-next-line import/first -- must come after the jest.mock(...) calls above, which this module's dependencies need registered before first require
import { checkAndMaybeFireWorkloadAlert } from './workload-alert';

function qualifyingWorkload(overrides: Partial<WorkloadCurrentResponse> = {}): WorkloadCurrentResponse {
  return {
    raw_score: 90,
    ungated_level: 'Critical',
    level: 'Critical',
    gate_applied: false,
    gate_explanation: null,
    strong_signal_count: 2,
    confidence: 'full',
    factors: [],
    relevant_task_ids: [],
    evaluated_at: '2026-08-08T10:00:00.000Z',
    engine_version: 'v1',
    insufficient_data: false,
    recommendations: [],
    recommendation_engine_version: 'v1',
    ...overrides,
  };
}

describe('checkAndMaybeFireWorkloadAlert — native alarm vs one-shot fallback', () => {
  const originalOS = Platform.OS;
  const userId = 'user-1';

  beforeEach(() => {
    mockMemoryStore.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('uses the native alarm and skips the one-shot sound notification when supported and it starts', async () => {
    Platform.OS = 'android';
    mockIsWorkloadAlarmSupported.mockReturnValue(true);
    mockStartWorkloadAlarm.mockResolvedValue({ ok: true });

    await checkAndMaybeFireWorkloadAlert(userId, true, qualifyingWorkload());

    expect(mockStartWorkloadAlarm).toHaveBeenCalledTimes(1);
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('falls back to the one-shot notification when the native alarm is unsupported (iOS/web/Expo Go)', async () => {
    Platform.OS = 'ios';
    mockIsWorkloadAlarmSupported.mockReturnValue(false);

    await checkAndMaybeFireWorkloadAlert(userId, true, qualifyingWorkload());

    expect(mockStartWorkloadAlarm).not.toHaveBeenCalled();
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('falls back to the one-shot notification when the native alarm fails to start', async () => {
    Platform.OS = 'android';
    mockIsWorkloadAlarmSupported.mockReturnValue(true);
    mockStartWorkloadAlarm.mockResolvedValue({ ok: false, message: 'native failure' });

    await checkAndMaybeFireWorkloadAlert(userId, true, qualifyingWorkload());

    expect(mockStartWorkloadAlarm).toHaveBeenCalledTimes(1);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate-fire for the same still-qualifying crossing on a second check (existing cooldown/dedup untouched)', async () => {
    Platform.OS = 'android';
    mockIsWorkloadAlarmSupported.mockReturnValue(true);
    mockStartWorkloadAlarm.mockResolvedValue({ ok: true });

    const workload = qualifyingWorkload();
    await checkAndMaybeFireWorkloadAlert(userId, true, workload);
    await checkAndMaybeFireWorkloadAlert(userId, true, { ...workload, evaluated_at: '2026-08-08T10:05:00.000Z' });

    expect(mockStartWorkloadAlarm).toHaveBeenCalledTimes(1);
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
