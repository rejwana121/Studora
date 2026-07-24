import { ActivityIndicator, Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';

import { ThemedText } from './themed-text';
import { color, radius, touchTarget, type as typeTokens } from '@/design-system/tokens';

type ButtonVariant = 'primary' | 'secondary' | 'text' | 'onGradient';

interface ButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
}

const LABEL_STYLE_BY_VARIANT = {
  primary: 'primaryLabel',
  secondary: 'secondaryLabel',
  text: 'secondaryLabel',
  onGradient: 'onGradientLabel',
} as const;

export function Button({ label, onPress, variant = 'primary', disabled, loading }: ButtonProps) {
  const isDisabled = disabled || loading;
  const spinnerColor = variant === 'primary' ? color.text.onFill : color.primary.violet;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'text' && styles.text,
        variant === 'onGradient' && styles.onGradient,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'onGradient' ? color.text.onFill : spinnerColor} />
      ) : (
        <ThemedText
          type="default"
          style={[styles[LABEL_STYLE_BY_VARIANT[variant]], isDisabled && styles.disabledLabel]}
        >
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primary: {
    backgroundColor: color.primary.violet,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: color.primary.violet,
  },
  text: {
    backgroundColor: 'transparent',
  },
  // For use on the saturated violet->teal hero gradient (welcome screen):
  // a violet border/text (the plain `secondary` variant) reads as low
  // contrast against a similarly-hued background, so this variant swaps to
  // white on a translucent fill instead.
  onGradient: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1.5,
    borderColor: color.text.onFill,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  primaryLabel: {
    color: color.text.onFill,
    fontSize: typeTokens.label.fontSize,
    fontWeight: typeTokens.label.fontWeight,
  },
  secondaryLabel: {
    color: color.primary.violet,
    fontSize: typeTokens.label.fontSize,
    fontWeight: typeTokens.label.fontWeight,
  },
  onGradientLabel: {
    color: color.text.onFill,
    fontSize: typeTokens.label.fontSize,
    fontWeight: typeTokens.label.fontWeight,
  },
  disabledLabel: {
    opacity: 0.8,
  },
});
