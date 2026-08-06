import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthContainer } from './auth-container';
import { Icon } from './icon';
import { ThemedText } from './themed-text';
import { color, elevation, radius, shadowStyle, space, type as typeTokens } from '@/design-system/tokens';

export type AuthScreenVariant = 'signIn' | 'signUp' | 'resetPassword';

// Hero assets are direct crops of the approved reference at 1448x1086 (no
// baked-in wordmark — that's rendered natively below).
const HERO_ASPECT_RATIO = 1086 / 1448;

// Target hero share of the *full* window height (not inset-adjusted) —
// Sign In and Sign Up only (approved, do not change). Reset Password is
// rendered at the image's exact natural width-driven ratio instead (see
// `heroHeight` below): at 0.49×windowHeight it was taller than the image's
// natural 4:3 display height, and since resizeMode="contain" never crops,
// that extra box height became visible top/bottom periwinkle letterbox
// bands that didn't quite match the asset's own edge pixels.
const HERO_HEIGHT_RATIO: Record<'signIn' | 'signUp', number> = {
  signIn: 0.41,
  signUp: 0.36,
};

// Trailing panel padding ("bottom breathing room" after the last link).
// Reset Password gets more because its one-field form is inherently short.
const PANEL_PADDING_BOTTOM: Record<AuthScreenVariant, number> = {
  signIn: space.lg,
  signUp: space.lg,
  resetPassword: 40,
};

// Gap between subtitle and the first form element — tight for Sign Up so
// its three-field form reads as one compact block.
const HEADER_MARGIN_BOTTOM: Record<AuthScreenVariant, number> = {
  signIn: 24,
  signUp: 12,
  resetPassword: 24,
};

// Average of the hero PNGs' own corner background samples — used so the
// `contain` letterbox strips (top/bottom, when the hero box is taller than
// the image's natural width-driven height) blend with the artwork instead
// of showing a hard edge.
const HERO_BACKDROP = '#C0CCFC';

const PANEL_OVERLAP = 18;
const PANEL_PADDING_TOP = 24;
const WORDMARK_BADGE_SIZE = 36;

interface AuthShellProps {
  title: string;
  subtitle: string;
  heroSource: ImageSourcePropType;
  variant: AuthScreenVariant;
  children: React.ReactNode;
}

export function AuthShell({ title, subtitle, heroSource, variant, children }: AuthShellProps) {
  const { width: viewportWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Reset Password: exact natural ratio, zero letterbox — the hero box and
  // the image match pixel-for-pixel, so `contain` has no unused space to
  // pad with HERO_BACKDROP. Sign In / Sign Up (approved, unchanged): never
  // smaller than the image's own width-driven height (that would force
  // `contain` to letterbox left/right instead of top/bottom) — their ratio
  // only ever adds extra top/bottom letterbox room, never crops.
  const heroHeight =
    variant === 'resetPassword'
      ? viewportWidth * HERO_ASPECT_RATIO
      : Math.max(HERO_HEIGHT_RATIO[variant] * windowHeight, viewportWidth * HERO_ASPECT_RATIO);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoider}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            contentInsetAdjustmentBehavior="never"
          >
            <View style={styles.heroWrap}>
              <Image
                source={heroSource}
                style={{ width: viewportWidth, height: heroHeight, backgroundColor: HERO_BACKDROP }}
                resizeMode="contain"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <View style={[styles.wordmarkRow, { top: insets.top + space.md }]}>
                <View style={styles.wordmarkBadge}>
                  <Icon name="book-outline" size="sm" color={color.text.onFill} />
                </View>
                <ThemedText type="default" style={styles.wordmarkText}>
                  Studora
                </ThemedText>
              </View>
            </View>

            <View
              style={[
                styles.panel,
                { paddingBottom: insets.bottom + PANEL_PADDING_BOTTOM[variant] },
              ]}
            >
              <AuthContainer style={styles.containerPadding}>
                <View style={[styles.header, { marginBottom: HEADER_MARGIN_BOTTOM[variant] }]}>
                  <ThemedText type="default" style={styles.title}>
                    {title}
                  </ThemedText>
                  <ThemedText type="default" style={styles.subtitle}>
                    {subtitle}
                  </ThemedText>
                </View>
                {children}
              </AuthContainer>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Outermost full-screen anchor. Every layer below is independently given
  // flex:1 + this same white token so that regardless of which single layer
  // might fail to stretch to the native screen's actual height, at least
  // one of them still paints white behind it — no layer relies on a
  // transparent ancestor "showing through" a sibling's paint.
  root: {
    flex: 1,
    backgroundColor: color.background.card,
  },
  safeArea: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: color.background.card,
  },
  keyboardAvoider: {
    flex: 1,
    backgroundColor: color.background.card,
  },
  scrollView: {
    flex: 1,
    backgroundColor: color.background.card,
  },
  // flexGrow: 1 here only to give `panel` below something to grow into when
  // content is shorter than the viewport — it does NOT by itself create
  // blank space, because nothing between hero and panel absorbs it; panel's
  // own flexGrow: 1 is what actually claims the leftover height as real,
  // painted, top-aligned white surface. When content is taller than the
  // viewport this has no effect and the ScrollView scrolls normally.
  scrollContent: {
    flexGrow: 1,
    backgroundColor: color.background.card,
  },
  heroWrap: {
    width: '100%',
  },
  wordmarkRow: {
    position: 'absolute',
    left: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  wordmarkBadge: {
    width: WORDMARK_BADGE_SIZE,
    height: WORDMARK_BADGE_SIZE,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primary.violet,
    ...shadowStyle(elevation.card),
  },
  wordmarkText: {
    color: color.text.primary,
    fontSize: typeTokens.subheading.fontSize,
    fontWeight: '700',
  },
  // flexGrow: 1 makes the panel itself — not a passive background
  // show-through — own any leftover height below its natural content, all
  // the way to the physical bottom of the viewport. Content inside stays
  // top-aligned (no space-between/centering), so leftover height only ever
  // appears below the last child, before this same white box's own edge.
  panel: {
    flexGrow: 1,
    marginTop: -PANEL_OVERLAP,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    backgroundColor: color.background.card,
    paddingTop: PANEL_PADDING_TOP,
    ...shadowStyle(elevation.raised),
  },
  containerPadding: {
    paddingHorizontal: space.lg,
  },
  header: {
    gap: space.xs,
  },
  title: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  subtitle: {
    fontSize: typeTokens.body.fontSize,
    lineHeight: typeTokens.body.lineHeight,
    color: color.text.secondary,
  },
});
