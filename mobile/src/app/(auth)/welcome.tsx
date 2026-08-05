import { Link } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthContainer } from '@/components/auth-container';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { color, elevation, radius, shadowStyle, space, type as typeTokens } from '@/design-system/tokens';

// Hero asset is a pre-cropped 853x925 slice of the approved reference
// (wordmark, planner, Today/Upcoming/Focus cards, books/plant, curved
// transition). Sized with explicit numeric width/height derived from the
// viewport rather than '100%'/aspectRatio — inside a ScrollView, percentage
// width resolves against the image's own intrinsic size, not the screen.
const HERO_ASPECT_RATIO = 925 / 853;

const MOBILE_MARGIN = 20;
const CONTENT_MAX_WIDTH = 480;

// Compact panel typography/spacing — deliberately smaller than the design
// tokens so the full composition (hero + headline + copy + tiles + both
// buttons) fits a 390x844 viewport without scrolling, matching the
// approved reference's density. Not token values because no existing
// token hits these specific compacted sizes.
const HEADLINE_FONT_SIZE = 26;
const HEADLINE_LINE_HEIGHT = 30;
const HEADLINE_LINE_GAP = 0;

const SUPPORTING_FONT_SIZE = 14;
const SUPPORTING_LINE_HEIGHT = 19;
// Caps the supporting line so it wraps to a balanced two lines like the
// approved reference instead of stretching to the full panel width.
const SUPPORTING_MAX_WIDTH = 270;
const HEADLINE_TO_SUPPORTING_GAP = 10;

const BENEFIT_TILE_MIN_HEIGHT = 58;
const BENEFIT_TILE_PADDING_H = 12;
const BENEFIT_BADGE_GAP = 10;

const ACTION_BUTTON_HEIGHT = 50;
const PANEL_BOTTOM_PADDING = 10;

// Soft coral tile wash — no dedicated token exists; derived from
// color.accent.coral (#FF6B57) at low opacity rather than adding a
// one-off design token for a single decorative surface.
const CORAL_SURFACE = 'rgba(255, 107, 87, 0.14)';

const TOP_BENEFITS = [
  { icon: 'list-outline', label: 'Plan tasks', surface: color.accent.lavender, badge: color.primary.violet },
  { icon: 'calendar-outline', label: 'Meet deadlines', surface: CORAL_SURFACE, badge: color.accent.coral },
] as const;

const FULL_WIDTH_BENEFIT = {
  icon: 'scale-outline',
  label: 'Balance workload',
  surface: color.accent.mint,
  badge: color.secondary.teal,
} as const;

export default function WelcomeScreen() {
  const { width: viewportWidth } = useWindowDimensions();
  const heroWidth = viewportWidth;
  const heroHeight = heroWidth * HERO_ASPECT_RATIO;

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Image
          source={require('../../../assets/images/studora-welcome-hero-crop.png')}
          style={{ width: heroWidth, height: heroHeight }}
          resizeMode="stretch"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />

        <View style={styles.panel}>
          <AuthContainer maxWidth={CONTENT_MAX_WIDTH}>
            <View style={styles.panelContent}>
              <View style={styles.headlineBlock}>
                <ThemedText type="default" style={styles.headlineDark} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  Plan smarter.
                </ThemedText>
                <ThemedText
                  type="default"
                  style={styles.headlineViolet}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.3}
                >
                  Study calmer.
                </ThemedText>
              </View>

              <ThemedText type="default" style={styles.supporting} maxFontSizeMultiplier={1.5}>
                Keep tasks, deadlines and workload in one calm place.
              </ThemedText>

              <View style={styles.benefits}>
                <View style={styles.benefitTopRow}>
                  {TOP_BENEFITS.map((benefit) => (
                    <View key={benefit.label} style={[styles.benefitTile, { backgroundColor: benefit.surface }]}>
                      <View style={[styles.benefitBadge, { backgroundColor: benefit.badge }]}>
                        <Icon name={benefit.icon} size="md" color={color.text.onFill} />
                      </View>
                      <ThemedText type="default" style={styles.benefitLabel} numberOfLines={1}>
                        {benefit.label}
                      </ThemedText>
                    </View>
                  ))}
                </View>
                <View style={[styles.benefitTile, styles.benefitTileFull, { backgroundColor: FULL_WIDTH_BENEFIT.surface }]}>
                  <View style={[styles.benefitBadge, { backgroundColor: FULL_WIDTH_BENEFIT.badge }]}>
                    <Icon name={FULL_WIDTH_BENEFIT.icon} size="md" color={color.text.onFill} />
                  </View>
                  <ThemedText type="default" style={styles.benefitLabel} numberOfLines={1}>
                    {FULL_WIDTH_BENEFIT.label}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.actions}>
                <Link href="/(auth)/sign-up" asChild>
                  <Pressable
                    style={styles.actionPrimary}
                    accessibilityRole="button"
                    accessibilityLabel="Create Account"
                  >
                    <View style={styles.actionIconSlot} />
                    <ThemedText type="default" style={styles.actionPrimaryLabel} numberOfLines={1}>
                      Create Account
                    </ThemedText>
                    <View style={styles.actionIconSlot}>
                      <Icon name="chevron-forward" size="sm" color={color.text.onFill} />
                    </View>
                  </Pressable>
                </Link>
                <Link href="/(auth)/sign-in" asChild>
                  <Pressable
                    style={styles.actionSecondary}
                    accessibilityRole="button"
                    accessibilityLabel="Sign In"
                  >
                    <View style={styles.actionIconSlot} />
                    <ThemedText type="default" style={styles.actionSecondaryLabel} numberOfLines={1}>
                      Sign In
                    </ThemedText>
                    <View style={styles.actionIconSlot}>
                      <Icon name="chevron-forward" size="sm" color={color.text.primary} />
                    </View>
                  </Pressable>
                </Link>
              </View>
            </View>
          </AuthContainer>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: color.background.card,
  },
  fill: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
  },
  panel: {
    backgroundColor: color.background.card,
    paddingTop: space.md,
    paddingBottom: PANEL_BOTTOM_PADDING,
  },
  panelContent: {
    paddingHorizontal: MOBILE_MARGIN,
  },
  headlineBlock: {
    alignItems: 'center',
    gap: HEADLINE_LINE_GAP,
  },
  headlineDark: {
    color: color.text.primary,
    fontSize: HEADLINE_FONT_SIZE,
    lineHeight: HEADLINE_LINE_HEIGHT,
    fontWeight: '700',
    textAlign: 'center',
  },
  headlineViolet: {
    color: color.primary.violet,
    fontSize: HEADLINE_FONT_SIZE,
    lineHeight: HEADLINE_LINE_HEIGHT,
    fontWeight: '700',
    textAlign: 'center',
  },
  supporting: {
    alignSelf: 'center',
    marginTop: HEADLINE_TO_SUPPORTING_GAP,
    maxWidth: SUPPORTING_MAX_WIDTH,
    color: color.text.secondary,
    fontSize: SUPPORTING_FONT_SIZE,
    lineHeight: SUPPORTING_LINE_HEIGHT,
    textAlign: 'center',
  },
  benefits: {
    marginTop: space.md,
    gap: space.sm,
  },
  benefitTopRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  benefitTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: BENEFIT_BADGE_GAP,
    minHeight: BENEFIT_TILE_MIN_HEIGHT,
    borderRadius: radius.control + 6,
    paddingHorizontal: BENEFIT_TILE_PADDING_H,
    paddingVertical: space.sm,
  },
  benefitTileFull: {
    width: '100%',
  },
  benefitBadge: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  benefitLabel: {
    flexShrink: 1,
    color: color.text.primary,
    fontSize: typeTokens.label.fontSize,
    fontWeight: '700',
  },
  actions: {
    marginTop: space.md,
    gap: space.sm,
  },
  actionIconSlot: {
    width: 20,
    alignItems: 'flex-end',
  },
  actionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: ACTION_BUTTON_HEIGHT,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    backgroundColor: color.primary.violet,
  },
  actionPrimaryLabel: {
    flex: 1,
    textAlign: 'center',
    color: color.text.onFill,
    fontSize: typeTokens.label.fontSize,
    fontWeight: '700',
  },
  actionSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: ACTION_BUTTON_HEIGHT,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    backgroundColor: color.background.card,
    borderWidth: 1,
    borderColor: color.border.divider,
    ...shadowStyle(elevation.card),
  },
  actionSecondaryLabel: {
    flex: 1,
    textAlign: 'center',
    color: color.text.primary,
    fontSize: typeTokens.label.fontSize,
    fontWeight: '700',
  },
});
