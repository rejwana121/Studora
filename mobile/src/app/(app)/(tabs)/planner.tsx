import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { getCalendar, getDay } from '@/api/planner';
import { getProfile, updateProfile } from '@/api/profile';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Fab } from '@/components/fab';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { DayAgenda } from '@/features/planner/day-agenda';
import { MonthGrid } from '@/features/planner/month-grid';
import { WeekAgenda } from '@/features/planner/week-agenda';
import { color, radius, space, type as typeTokens } from '@/design-system/tokens';
import {
  addDaysToDateString,
  mondayOfWeekContaining,
  monthGridDates,
  toZonedDateString,
  zonedDateRange,
  zonedDatesForBlock,
} from '@/lib/date';
import type { CalendarResponse, DayView, Profile, StudyBlockRead } from '@/types/api';

type Mode = 'day' | 'week';

export default function PlannerScreen() {
  const { session } = useSession();
  const token = session?.access_token ?? null;
  const deviceTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isAligning, setIsAligning] = useState(false);
  const [alignError, setAlignError] = useState<string | null>(null);

  const isAligned = profile !== null && profile.timezone === deviceTimezone;

  const nowInit = new Date();
  const [visibleYear, setVisibleYear] = useState(nowInit.getFullYear());
  const [visibleMonth, setVisibleMonth] = useState(nowInit.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('day');
  const [refreshKey, setRefreshKey] = useState(0);

  const [taskDates, setTaskDates] = useState<Set<string>>(new Set());
  const [blockDates, setBlockDates] = useState<Set<string>>(new Set());
  const [monthError, setMonthError] = useState<string | null>(null);

  const [dayView, setDayView] = useState<DayView | null>(null);
  const [isDayLoading, setIsDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [isDayRefreshing, setIsDayRefreshing] = useState(false);

  const [weekCalendar, setWeekCalendar] = useState<CalendarResponse | null>(null);
  const [isWeekLoading, setIsWeekLoading] = useState(false);
  const [weekError, setWeekError] = useState<string | null>(null);
  const [isWeekRefreshing, setIsWeekRefreshing] = useState(false);

  // Request-sequence guards: each fetch family gets its own counter,
  // bumped at request start and captured locally. A response is applied
  // only if the ref still matches what was captured — so a slower
  // response for an abandoned request (superseded by rapid month
  // navigation, date selection, mode switching, or a repeat focus event)
  // can never overwrite state a newer request already produced.
  const profileRequestIdRef = useRef(0);
  const monthRequestIdRef = useRef(0);
  const dayRequestIdRef = useRef(0);
  const weekRequestIdRef = useRef(0);

  const loadProfile = useCallback(() => {
    if (!token) return;
    const requestId = ++profileRequestIdRef.current;
    setIsProfileLoading(true);
    setProfileError(null);
    getProfile(token).then((result) => {
      if (profileRequestIdRef.current !== requestId) return;
      if (!result.ok) {
        setProfileError(result.error.message);
        setIsProfileLoading(false);
        return;
      }
      setProfile(result.data);
      setIsProfileLoading(false);
      if (result.data.timezone === deviceTimezone) {
        const todayLocal = toZonedDateString(new Date(), result.data.timezone);
        setSelectedDate((prev) => prev ?? todayLocal);
      }
    });
  }, [token, deviceTimezone]);

  // useFocusEffect's registered callback depends only on `loadProfile`
  // (itself only [token, deviceTimezone]) — refreshKey is set here via a
  // functional updater and is never read as a dependency of this effect,
  // so bumping it cannot cause useFocusEffect to re-register or re-fire
  // itself. Focus regain therefore triggers exactly one refresh cycle:
  // one loadProfile() call plus one refreshKey bump, batched into a
  // single re-render.
  useFocusEffect(
    useCallback(() => {
      loadProfile();
      setRefreshKey((k) => k + 1);
    }, [loadProfile])
  );

  // Depends on profile.timezone (a primitive), not the profile object
  // itself — a fresh object reference from a re-fetch that carries the
  // same timezone value does not change this callback's identity, so it
  // can't cause an extra, unnecessary effect run on its own.
  const loadMonthIndicators = useCallback(() => {
    if (!token || !profile || !isAligned) return;
    const requestId = ++monthRequestIdRef.current;
    setMonthError(null);
    const gridDates = monthGridDates(visibleYear, visibleMonth);
    const startDate = gridDates[0];
    const endDate = gridDates[gridDates.length - 1];
    const timeZone = profile.timezone;
    getCalendar(token, startDate, endDate).then((result) => {
      if (monthRequestIdRef.current !== requestId) return;
      if (!result.ok) {
        setMonthError(result.error.message);
        return;
      }
      const tDates = new Set<string>();
      for (const task of result.data.tasks) {
        tDates.add(toZonedDateString(new Date(task.deadline), timeZone));
      }
      const bDates = new Set<string>();
      for (const block of result.data.study_blocks) {
        for (const d of zonedDatesForBlock(block.starts_at, block.ends_at, timeZone)) bDates.add(d);
      }
      setTaskDates(tDates);
      setBlockDates(bDates);
    });
    // `profile` is read only for its `.timezone` primitive (captured
    // above into `timeZone`), which is already tracked via
    // `profile?.timezone` below — depending on the whole object instead
    // would re-create this callback on every profile re-fetch even when
    // the timezone value is unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, profile?.timezone, isAligned, visibleYear, visibleMonth]);

  const loadDay = useCallback(
    (isRefresh = false) => {
      if (!token || !isAligned || !selectedDate) return;
      const requestId = ++dayRequestIdRef.current;
      if (isRefresh) setIsDayRefreshing(true);
      else setIsDayLoading(true);
      setDayError(null);
      getDay(token, selectedDate).then((result) => {
        if (dayRequestIdRef.current !== requestId) return;
        if (result.ok) setDayView(result.data);
        else setDayError(result.error.message);
        if (isRefresh) setIsDayRefreshing(false);
        else setIsDayLoading(false);
      });
    },
    [token, isAligned, selectedDate]
  );

  const weekStart = selectedDate ? mondayOfWeekContaining(selectedDate) : null;
  const weekDates = weekStart ? zonedDateRange(weekStart, addDaysToDateString(weekStart, 6)) : [];

  const loadWeek = useCallback(
    (isRefresh = false) => {
      if (!token || !isAligned || !weekStart) return;
      const requestId = ++weekRequestIdRef.current;
      const weekEnd = addDaysToDateString(weekStart, 6);
      if (isRefresh) setIsWeekRefreshing(true);
      else setIsWeekLoading(true);
      setWeekError(null);
      getCalendar(token, weekStart, weekEnd).then((result) => {
        if (weekRequestIdRef.current !== requestId) return;
        if (result.ok) setWeekCalendar(result.data);
        else setWeekError(result.error.message);
        if (isRefresh) setIsWeekRefreshing(false);
        else setIsWeekLoading(false);
      });
    },
    [token, isAligned, weekStart]
  );

  useEffect(() => {
    loadMonthIndicators();
  }, [loadMonthIndicators, refreshKey]);

  useEffect(() => {
    if (mode === 'day') loadDay();
    else loadWeek();
  }, [mode, loadDay, loadWeek, refreshKey]);

  async function handleAlignTimezone() {
    if (!token) return;
    const requestId = ++profileRequestIdRef.current;
    setIsAligning(true);
    setAlignError(null);
    const result = await updateProfile(token, { timezone: deviceTimezone });
    const isStale = profileRequestIdRef.current !== requestId; // superseded by a newer profile fetch
    setIsAligning(false);
    if (isStale) return;
    if (!result.ok) {
      setAlignError(result.error.message);
      return;
    }
    setProfile(result.data);
    const todayLocal = toZonedDateString(new Date(), result.data.timezone);
    setSelectedDate((prev) => prev ?? todayLocal);
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    const [y, m] = date.split('-').map(Number);
    if (y !== visibleYear || m !== visibleMonth) {
      setVisibleYear(y);
      setVisibleMonth(m);
    }
  }

  function goToNewBlock() {
    if (!selectedDate) return;
    router.push(`/planner/blocks/new?date=${selectedDate}` as Href);
  }

  function goToEditBlock(block: StudyBlockRead, date: string) {
    router.push(`/planner/blocks/${block.id}/edit?date=${date}` as Href);
  }

  if (isProfileLoading) {
    return (
      <Screen>
        <ThemedText type="default" style={styles.title}>
          Planner
        </ThemedText>
        <ActivityIndicator color={color.primary.violet} />
      </Screen>
    );
  }

  if (profileError) {
    return (
      <Screen>
        <ThemedText type="default" style={styles.title}>
          Planner
        </ThemedText>
        <Banner variant="error" message={profileError} />
        <Button label="Retry" variant="secondary" onPress={loadProfile} />
      </Screen>
    );
  }

  if (profile && !isAligned) {
    return (
      <Screen>
        <ThemedText type="default" style={styles.title}>
          Planner
        </ThemedText>
        <Banner
          variant="warning"
          message={`Planner needs your profile timezone to match this device's timezone for correct calendar dates and times. Your profile is set to ${profile.timezone}, but this device is set to ${deviceTimezone}.`}
        />
        {alignError && <Banner variant="error" message={alignError} />}
        <Button label="Use device timezone" onPress={handleAlignTimezone} loading={isAligning} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <ThemedText type="default" style={styles.title}>
        Planner
      </ThemedText>

      {monthError && <Banner variant="error" message={monthError} />}

      <MonthGrid
        year={visibleYear}
        month={visibleMonth}
        selectedDate={selectedDate ?? ''}
        todayDate={profile ? toZonedDateString(new Date(), profile.timezone) : ''}
        taskDates={taskDates}
        blockDates={blockDates}
        onSelectDate={handleSelectDate}
        onChangeMonth={(y, m) => {
          setVisibleYear(y);
          setVisibleMonth(m);
        }}
      />

      <View style={styles.modeRow}>
        {(['day', 'week'] as Mode[]).map((m) => {
          const selected = m === mode;
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={m === 'day' ? 'Day view' : 'Week view'}
              accessibilityState={{ selected }}
              onPress={() => setMode(m)}
              style={[styles.modeSegment, selected && styles.modeSegmentSelected]}
            >
              <ThemedText
                type="default"
                style={[styles.modeLabel, selected && styles.modeLabelSelected]}
              >
                {m === 'day' ? 'Day' : 'Week'}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {mode === 'day' && (
        <DayAgenda
          tasks={dayView?.tasks ?? []}
          studyBlocks={dayView?.study_blocks ?? []}
          isLoading={isDayLoading}
          error={dayError}
          onRetry={() => loadDay()}
          onRefresh={() => loadDay(true)}
          isRefreshing={isDayRefreshing}
          onSelectBlock={(block) => selectedDate && goToEditBlock(block, selectedDate)}
        />
      )}

      {mode === 'week' && profile && (
        <WeekAgenda
          dates={weekDates}
          calendar={weekCalendar}
          timeZone={profile.timezone}
          isLoading={isWeekLoading}
          error={weekError}
          onRetry={() => loadWeek()}
          onRefresh={() => loadWeek(true)}
          isRefreshing={isWeekRefreshing}
          onSelectBlock={goToEditBlock}
        />
      )}

      <Fab accessibilityLabel="Add study block" onPress={goToNewBlock} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'relative',
  },
  title: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight,
    fontWeight: '700',
    color: color.primary.violet,
  },
  modeRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  modeSegment: {
    flex: 1,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: color.background.card,
  },
  modeSegmentSelected: {
    backgroundColor: color.primary.violet,
  },
  modeLabel: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
    fontWeight: '600',
  },
  modeLabelSelected: {
    color: color.text.onFill,
  },
});
