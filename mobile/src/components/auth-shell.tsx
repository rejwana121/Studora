import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthContainer } from './auth-container';
import { color, elevation, shadowStyle, space } from '@/design-system/tokens';

interface AuthShellProps {
  children: React.ReactNode;
}

/**
 * Shared shell for Sign In / Sign Up / Forgot Password: pale lavender page
 * background, two soft non-interactive lavender/mint blobs clipped to the
 * screen edge (decoration only — `pointerEvents="none"`, never intercepts
 * touches), and a centered white card holding the actual form.
 */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.decorLayer} pointerEvents="none">
        <View style={[styles.blob, styles.blobTop]} />
        <View style={[styles.blob, styles.blobBottom]} />
      </View>

      <AuthContainer>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>{children}</View>
        </ScrollView>
      </AuthContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: color.background.main,
    overflow: 'hidden',
  },
  decorLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  blob: {
    position: 'absolute',
    borderRadius: 9999,
  },
  blobTop: {
    width: 220,
    height: 220,
    top: -70,
    right: -60,
    backgroundColor: color.accent.lavender,
  },
  blobBottom: {
    width: 260,
    height: 260,
    bottom: -90,
    left: -80,
    backgroundColor: color.accent.mint,
    opacity: 0.8,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: space.xl,
  },
  card: {
    backgroundColor: color.background.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: color.border.divider,
    padding: space.xl,
    gap: space.md,
    ...shadowStyle(elevation.raised),
  },
});
