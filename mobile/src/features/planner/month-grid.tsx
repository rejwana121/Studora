import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { color, radius, space, touchTarget, type as typeTokens } from '@/design-system/tokens';
import { monthGridDates } from '@/lib/date';

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface MonthGridProps {
  year: number;
  month: number; // 1-12
  selectedDate: string;
  todayDate: string;
  taskDates: Set<string>;
  blockDates: Set<string>;
  onSelectDate: (date: string) => void;
}

function monthOf(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}

function dayOf(date: string): string {
  return String(Number(date.slice(8, 10)));
}

function zonedLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Grid only — the month label + prev/next controls live in Planner's
 * periwinkle header instead (per the approved reference, which shows the
 * navigator on the header surface and only the weekday/date grid inside
 * the white calendar card). `onChangeMonth` moved with them; Planner
 * calls its own handlers directly. Single consumer (Planner tab), so
 * this shape change carries no other caller. */
export function MonthGrid({
  year,
  month,
  selectedDate,
  todayDate,
  taskDates,
  blockDates,
  onSelectDate,
}: MonthGridProps) {
  const cells = monthGridDates(year, month);
  const currentMonthKey = `${year}-${String(month).padStart(2, '0')}`;
  const weeks: string[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View style={styles.container}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <ThemedText key={i} type="default" style={styles.weekdayLabel}>
            {label}
          </ThemedText>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.weekRow}>
          {week.map((date) => {
            const isCurrentMonth = monthOf(date) === currentMonthKey;
            const isToday = date === todayDate;
            const isSelected = date === selectedDate;
            const hasTasks = taskDates.has(date);
            const hasBlocks = blockDates.has(date);

            const itemDescription =
              hasTasks && hasBlocks
                ? 'has tasks and study blocks'
                : hasTasks
                  ? 'has tasks'
                  : hasBlocks
                    ? 'has study blocks'
                    : 'no items';

            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${zonedLabel(date)}, ${itemDescription}`}
                onPress={() => onSelectDate(date)}
                style={[styles.cell, isSelected && styles.cellSelected]}
              >
                <ThemedText
                  type="default"
                  style={[
                    styles.dayNumber,
                    !isCurrentMonth && styles.dayNumberDimmed,
                    isToday && !isSelected && styles.dayNumberToday,
                    isSelected && styles.dayNumberSelected,
                  ]}
                >
                  {dayOf(date)}
                </ThemedText>
                <View style={styles.dotsRow}>
                  {hasTasks && (
                    <View style={[styles.dot, { backgroundColor: color.accent.coral }]} />
                  )}
                  {hasBlocks && (
                    <View style={[styles.dot, { backgroundColor: color.secondary.teal }]} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.xs,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
    fontWeight: '600',
  },
  weekRow: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    // `radius.pill` (not `radius.control`) — the approved reference shows
    // the selected date as a true circle, not a rounded square. Harmless
    // on every unselected cell too, since those have no background to
    // reveal the corner radius.
    borderRadius: radius.pill,
    gap: 2,
  },
  cellSelected: {
    backgroundColor: color.primary.violet,
  },
  dayNumber: {
    fontSize: typeTokens.body.fontSize,
    color: color.text.primary,
  },
  dayNumberDimmed: {
    color: color.text.disabled,
  },
  dayNumberToday: {
    color: color.primary.violet,
    fontWeight: '700',
  },
  dayNumberSelected: {
    color: color.text.onFill,
    fontWeight: '700',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 3,
    minHeight: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
});
