import { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { color, space, type as typeTokens } from '@/design-system/tokens';
import { toZonedDateString, zonedDatesForBlock } from '@/lib/date';
import type { CalendarResponse, PlannerTaskItem, StudyBlockRead } from '@/types/api';

import { AgendaSection } from './day-agenda';

function zonedLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

interface WeekAgendaProps {
  dates: string[]; // 7 local (Profile.timezone) YYYY-MM-DD strings, Monday first
  calendar: CalendarResponse | null;
  timeZone: string;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onSelectBlock: (block: StudyBlockRead, date: string) => void;
}

export function WeekAgenda({
  dates,
  calendar,
  timeZone,
  isLoading,
  error,
  onRetry,
  onRefresh,
  isRefreshing,
  onSelectBlock,
}: WeekAgendaProps) {
  const buckets = useMemo(() => {
    const byDate = new Map<string, { tasks: PlannerTaskItem[]; studyBlocks: StudyBlockRead[] }>();
    for (const date of dates) byDate.set(date, { tasks: [], studyBlocks: [] });

    if (calendar) {
      for (const task of calendar.tasks) {
        const date = toZonedDateString(new Date(task.deadline), timeZone);
        byDate.get(date)?.tasks.push(task);
      }
      for (const block of calendar.study_blocks) {
        for (const date of zonedDatesForBlock(block.starts_at, block.ends_at, timeZone)) {
          byDate.get(date)?.studyBlocks.push(block);
        }
      }
    }

    return dates.map((date) => ({ date, ...(byDate.get(date) ?? { tasks: [], studyBlocks: [] }) }));
  }, [dates, calendar, timeZone]);

  if (isLoading) {
    return <ActivityIndicator color={color.primary.violet} style={styles.loadingSpacer} />;
  }

  if (error) {
    return (
      <View style={styles.errorBlock}>
        <Banner variant="error" message={error} />
        <Button label="Retry" variant="secondary" onPress={onRetry} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {buckets.map(({ date, tasks, studyBlocks }) => (
        <View key={date} style={styles.daySection}>
          <ThemedText type="default" style={styles.dayHeader}>
            {zonedLabel(date)}
          </ThemedText>
          <AgendaSection
            compact
            tasks={tasks}
            studyBlocks={studyBlocks}
            onSelectBlock={(block) => onSelectBlock(block, date)}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingSpacer: {
    marginTop: space.lg,
  },
  errorBlock: {
    gap: space.sm,
  },
  scrollContent: {
    paddingBottom: space.xxl,
    gap: space.md,
  },
  daySection: {
    gap: space.xs,
  },
  dayHeader: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
    color: color.text.secondary,
    textTransform: 'uppercase',
  },
});
