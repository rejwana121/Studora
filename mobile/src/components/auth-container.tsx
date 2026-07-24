import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

interface AuthContainerProps {
  children: React.ReactNode;
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared responsive shell for every (auth) screen. On a narrow viewport
 * (phone) it stays full-width with the screen's own padding; on a wide
 * viewport (web/desktop) it caps at `maxWidth` and centers, so inputs and
 * buttons read as a mobile-style card instead of stretching edge to edge.
 */
export function AuthContainer({ children, maxWidth = 500, style }: AuthContainerProps) {
  return (
    <View style={styles.center}>
      <View style={[styles.content, { maxWidth }, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    width: '100%',
  },
});
