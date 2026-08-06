import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { color, radius, space, touchTarget, type as typeTokens } from '@/design-system/tokens';

type TextFieldDensity = 'default' | 'auth';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  /** Soft tinted leading icon — Auth fields only. Omit for the original undecorated field. */
  icon?: React.ComponentProps<typeof Icon>['name'];
  /** Adds an eye/eye-off toggle for `secureTextEntry` fields — Auth fields only. */
  showPasswordToggle?: boolean;
  /** 'auth' renders the compact ~52pt decorated field used on Sign In/Up/Reset. */
  density?: TextFieldDensity;
}

const AUTH_FIELD_HEIGHT = 52;
const ICON_BADGE_SIZE = 32;

export function TextField({
  label,
  error,
  secureTextEntry,
  icon,
  showPasswordToggle,
  density = 'default',
  style,
  ...rest
}: TextFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const isDecorated = !!icon || !!showPasswordToggle || density === 'auth';
  const canToggle = !!secureTextEntry && !!showPasswordToggle;
  const resolvedSecureEntry = canToggle ? !isPasswordVisible : secureTextEntry;

  // Original, undecorated path — byte-for-byte the pre-existing render tree
  // so every non-Auth call site (task-form, subject-form, task-picker, ...)
  // is unaffected by the Auth-only icon/toggle/density additions above.
  if (!isDecorated) {
    return (
      <View style={styles.container}>
        <ThemedText type="default" style={styles.label}>
          {label}
        </ThemedText>
        <TextInput
          style={[styles.input, isFocused && styles.inputFocused, !!error && styles.inputError, style]}
          placeholderTextColor={color.text.disabled}
          secureTextEntry={secureTextEntry}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          accessibilityLabel={label}
          {...rest}
        />
        {!!error && (
          <ThemedText type="default" style={styles.errorText}>
            {error}
          </ThemedText>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemedText type="default" style={styles.label}>
        {label}
      </ThemedText>
      <View
        style={[
          styles.wrapper,
          density === 'auth' && styles.wrapperAuth,
          isFocused && styles.wrapperFocused,
          !!error && styles.wrapperError,
        ]}
      >
        {!!icon && (
          <View style={styles.iconBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name={icon} size="sm" color={color.primary.violet} />
          </View>
        )}
        <TextInput
          style={[styles.wrapperInput, style]}
          placeholderTextColor={color.text.disabled}
          secureTextEntry={resolvedSecureEntry}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          accessibilityLabel={label}
          {...rest}
        />
        {canToggle && (
          <Pressable
            onPress={() => setIsPasswordVisible((visible) => !visible)}
            hitSlop={8}
            style={styles.toggle}
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
          >
            <Icon
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size="sm"
              color={color.text.secondary}
            />
          </Pressable>
        )}
      </View>
      {!!error && (
        <ThemedText type="default" style={styles.errorText}>
          {error}
        </ThemedText>
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
  // --- Original undecorated path ---
  input: {
    minHeight: touchTarget.min,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: color.border.divider,
    backgroundColor: color.background.card,
    paddingHorizontal: space.md,
    color: color.text.primary,
    fontSize: typeTokens.body.fontSize,
  },
  inputFocused: {
    borderColor: color.primary.violet,
  },
  inputError: {
    borderColor: color.risk.high.text,
  },
  // --- Decorated (icon / toggle / auth density) path ---
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget.min,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: color.border.divider,
    backgroundColor: color.background.card,
    paddingHorizontal: space.sm,
    gap: space.sm,
  },
  wrapperAuth: {
    minHeight: AUTH_FIELD_HEIGHT,
  },
  wrapperFocused: {
    borderColor: color.primary.violet,
  },
  wrapperError: {
    borderColor: color.risk.high.text,
  },
  iconBadge: {
    width: ICON_BADGE_SIZE,
    height: ICON_BADGE_SIZE,
    borderRadius: radius.control - 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accent.lavender,
  },
  wrapperInput: {
    flex: 1,
    color: color.text.primary,
    fontSize: typeTokens.body.fontSize,
  },
  toggle: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -space.sm,
  },
  errorText: {
    color: color.risk.high.text,
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
  },
});
