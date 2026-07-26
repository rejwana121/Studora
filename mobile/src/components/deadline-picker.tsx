import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from './button';
import { ThemedText } from './themed-text';
import { color, radius, space, touchTarget, type as typeTokens } from '@/design-system/tokens';

interface DeadlinePickerProps {
  label: string;
  value: Date;
  onChange: (value: Date) => void;
  error?: string | null;
}

function mergeDate(base: Date, datePart: Date): Date {
  const next = new Date(base);
  next.setFullYear(datePart.getFullYear(), datePart.getMonth(), datePart.getDate());
  return next;
}

function mergeTime(base: Date, timePart: Date): Date {
  const next = new Date(base);
  next.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return next;
}

/** iOS's inline/spinner pickers otherwise render white text on a light
 * background (invisible) unless explicitly told they're on a light
 * surface. `textColor` uses the design system's primary text token
 * rather than a hardcoded black. Android's `default` display ignores
 * these props entirely, so they're only spread in on iOS. */
const IOS_PICKER_PROPS =
  Platform.OS === 'ios'
    ? { themeVariant: 'light' as const, textColor: color.text.primary, accentColor: color.primary.violet }
    : {};

/** Deadline entry via @react-native-community/datetimepicker. Two separate
 * triggers (date, time) rather than a single combined "datetime" mode —
 * Android's native picker only supports one mode's dialog at a time, so
 * this shape is the one that behaves correctly on both platforms. The
 * merged Date is always converted with `.toISOString()` by the caller,
 * which is always UTC ("Z"-suffixed) — never a naive/offset-less string. */
export function DeadlinePicker({ label, value, onChange, error }: DeadlinePickerProps) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  function handleDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS !== 'ios') setShowDate(false);
    if (event.type === 'dismissed' || !selected) return;
    onChange(mergeDate(value, selected));
  }

  function handleTimeChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS !== 'ios') setShowTime(false);
    if (event.type === 'dismissed' || !selected) return;
    onChange(mergeTime(value, selected));
  }

  return (
    <View style={styles.container}>
      <ThemedText type="default" style={styles.label}>
        {label}
      </ThemedText>
      <View style={styles.row}>
        <Pressable
          style={styles.field}
          onPress={() => {
            setShowTime(false);
            setShowDate(true);
          }}
          accessibilityRole="button"
        >
          <ThemedText type="default" style={styles.value}>
            {value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </ThemedText>
        </Pressable>
        <Pressable
          style={styles.field}
          onPress={() => {
            setShowDate(false);
            setShowTime(true);
          }}
          accessibilityRole="button"
        >
          <ThemedText type="default" style={styles.value}>
            {value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </ThemedText>
        </Pressable>
      </View>
      {!!error && (
        <ThemedText type="default" style={styles.errorText}>
          {error}
        </ThemedText>
      )}

      {showDate && (
        <View style={styles.pickerBlock}>
          <DateTimePicker
            value={value}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handleDateChange}
            {...IOS_PICKER_PROPS}
          />
          {Platform.OS === 'ios' && (
            <Button label="Done" variant="text" onPress={() => setShowDate(false)} />
          )}
        </View>
      )}
      {showTime && (
        <View style={styles.pickerBlock}>
          <DateTimePicker
            value={value}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleTimeChange}
            {...IOS_PICKER_PROPS}
          />
          {Platform.OS === 'ios' && (
            <Button label="Done" variant="text" onPress={() => setShowTime(false)} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.xs,
    alignSelf: 'stretch',
  },
  label: {
    color: color.text.secondary,
    fontSize: typeTokens.label.fontSize,
    lineHeight: typeTokens.label.lineHeight,
    fontWeight: typeTokens.label.fontWeight,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  field: {
    flex: 1,
    minHeight: touchTarget.min,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: color.border.divider,
    backgroundColor: color.background.card,
    paddingHorizontal: space.md,
    justifyContent: 'center',
  },
  value: {
    color: color.text.primary,
    fontSize: typeTokens.body.fontSize,
  },
  errorText: {
    color: color.risk.high.text,
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
  },
  pickerBlock: {
    gap: space.xs,
    alignItems: 'flex-end',
  },
});
