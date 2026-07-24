import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthContainer } from '@/components/auth-container';
import { BrandBadge } from '@/components/brand-badge';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import {
  color,
  elevation,
  gradient,
  radius,
  shadowStyle,
  space,
  type as typeTokens,
} from '@/design-system/tokens';

const BENEFITS = ['Plan smarter', 'Meet deadlines', 'Balance workload'];

// Requirement: ~20px safe margin around the card on iPhone.
const MOBILE_MARGIN = 20;
const CARD_PADDING = Platform.select({ web: 32, default: 24 });
const CARD_GAP = 20;

export default function WelcomeScreen() {
  return (
    <LinearGradient colors={gradient.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
      <SafeAreaView style={styles.safeArea}>
        <AuthContainer maxWidth={620}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.glassCard}>
              <BrandBadge tone="onGradient" />
              <ThemedText type="default" style={styles.title}>
                Studora
              </ThemedText>
              <ThemedText type="default" style={styles.subtitle}>
                A calmer way to manage university life.
              </ThemedText>

              <View style={styles.benefitRow}>
                {BENEFITS.map((benefit) => (
                  <View key={benefit} style={styles.benefitCard}>
                    <ThemedText type="default" style={styles.benefitText}>
                      ✓ {benefit}
                    </ThemedText>
                  </View>
                ))}
              </View>

              <View style={styles.actions}>
                <Link href="/(auth)/sign-up" asChild>
                  <Button label="Sign Up" variant="primary" onPress={() => {}} />
                </Link>
                <Link href="/(auth)/sign-in" asChild>
                  <Button label="Sign In" variant="onGradient" onPress={() => {}} />
                </Link>
              </View>
            </View>
          </ScrollView>
        </AuthContainer>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: MOBILE_MARGIN,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassCard: {
    width: '100%',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 30,
    padding: CARD_PADDING,
    gap: CARD_GAP,
    alignItems: 'center',
    ...shadowStyle(elevation.raised),
  },
  title: {
    color: color.text.onFill,
    fontSize: typeTokens.display.fontSize + 4,
    lineHeight: typeTokens.display.lineHeight + 4,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: color.text.onFill,
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    opacity: 0.92,
    textAlign: 'center',
  },
  benefitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.sm,
    alignSelf: 'stretch',
  },
  benefitCard: {
    flexGrow: 1,
    flexBasis: 140,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: radius.control + 6,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  benefitText: {
    color: color.text.onFill,
    fontSize: typeTokens.caption.fontSize,
    fontWeight: '600',
    textAlign: 'center',
  },
  actions: {
    gap: space.sm,
    alignSelf: 'stretch',
  },
});
