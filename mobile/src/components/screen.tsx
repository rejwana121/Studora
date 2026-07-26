import { StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, space } from '@/design-system/tokens';

/** Shared SafeAreaView + padded-content wrapper for app screens — factors
 * out the boilerplate already duplicated in the Phase-3 home screen. */
export function Screen({ style, children, ...rest }: ViewProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.content, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: color.background.main,
  },
  content: {
    flex: 1,
    padding: space.lg,
    gap: space.md,
  },
});
