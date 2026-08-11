import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { color, radius, space, touchTarget, type as typeTokens } from '@/design-system/tokens';

type PlanId = 'free' | 'pro' | 'premium';

interface PlanDef {
  id: PlanId;
  name: string;
  price: string;
  priceSuffix: string;
  features: string[];
}

/** Feature lists transcribed from the approved Free/Pro/Premium table —
 * docs/Studora_PRD_Compact_Final.md §11 (mirrored in the BRD §7). Display
 * copy only; no new capability, limit, or entitlement is implied beyond
 * what those docs already describe. */
const PLANS: PlanDef[] = [
  {
    id: 'free',
    name: 'Free',
    price: '৳0',
    priceSuffix: 'forever',
    features: [
      'Core tasks & planner',
      'Basic current workload risk',
      'Essential, limited guidance',
      'Core insights',
      'Limited AI use',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '৳199',
    priceSuffix: '/month',
    features: [
      'High/unlimited tasks & planner',
      'Full risk factors & history',
      'Personalized guidance',
      'Advanced insights',
      'Higher AI use',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '৳349',
    priceSuffix: '/month',
    features: [
      'Highest fair-use tasks & planner',
      'Deep trend & forecast risk',
      'Advanced automation guidance',
      'Deep, personalized insights',
      'Highest fair-use AI',
    ],
  },
];

/** Real entitlement is out of scope for this screen — Profile has no plan
 * field (see types/api.ts `Profile`) and none is added here. Every student
 * is Free until real payment integration exists. */
const CURRENT_PLAN_ID: PlanId = 'free';

const UPGRADE_NOTICE = 'Plan upgrades will be available after payment integration.';

export default function PlansBillingScreen() {
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState<string | null>(null);

  function handleChoose(planId: PlanId) {
    if (planId === CURRENT_PLAN_ID) return;
    setNotice(UPGRADE_NOTICE);
  }

  return (
    // Same continuous-periwinkle-through-status-bar shell as Workload/
    // Planner/New Study Block: `edges` excludes 'top', headerSurface
    // absorbs insets.top into its own paddingTop.
    <SafeAreaView style={styles.outerSafeArea} edges={['left', 'right', 'bottom']}>
      <View style={[styles.headerSurface, { paddingTop: insets.top + space.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={space.xs}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressedFade]}
        >
          <Icon name="chevron-back" size="lg" color={color.text.primary} />
        </Pressable>
        <ThemedText type="default" style={styles.title}>
          Plans & Billing
        </ThemedText>
        <ThemedText type="default" style={styles.subtitle}>
          You&apos;re currently on the Free plan.
        </ThemedText>
      </View>

      <ScrollView
        style={styles.scrollFlex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {notice && <Banner variant="info" message={notice} />}

        {PLANS.map((plan) => {
          const isCurrent = plan.id === CURRENT_PLAN_ID;
          return (
            <SectionCard
              key={plan.id}
              variant={isCurrent ? 'emphasis' : 'default'}
              style={styles.planCard}
            >
              <View style={styles.planHeaderRow}>
                <View style={styles.planNameGroup}>
                  <ThemedText type="default" style={styles.planName}>
                    {plan.name}
                  </ThemedText>
                  {isCurrent && (
                    <View style={styles.currentPill}>
                      <ThemedText type="default" style={styles.currentPillText}>
                        Current
                      </ThemedText>
                    </View>
                  )}
                </View>
                <View style={styles.priceGroup}>
                  <ThemedText type="default" style={styles.price}>
                    {plan.price}
                  </ThemedText>
                  <ThemedText type="default" style={styles.priceSuffix}>
                    {plan.priceSuffix}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.featureList}>
                {plan.features.map((feature) => (
                  <View key={feature} style={styles.featureRow}>
                    <Icon name="checkmark-circle" size="sm" color={color.secondary.tealStrong} />
                    <ThemedText type="default" style={styles.featureText}>
                      {feature}
                    </ThemedText>
                  </View>
                ))}
              </View>

              <Button
                label={isCurrent ? 'Current plan' : `Choose ${plan.name}`}
                variant={isCurrent ? 'secondary' : 'primary'}
                disabled={isCurrent}
                onPress={() => handleChoose(plan.id)}
              />
            </SectionCard>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  outerSafeArea: {
    flex: 1,
    backgroundColor: color.surface.canvas,
  },
  headerSurface: {
    backgroundColor: color.surface.headerSoft,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: 2,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
  },
  backButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    marginLeft: -space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedFade: {
    opacity: 0.7,
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
  scrollFlex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  planCard: {
    gap: space.sm,
  },
  planHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  planNameGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexShrink: 1,
  },
  planName: {
    fontSize: typeTokens.heading.fontSize,
    lineHeight: typeTokens.heading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  currentPill: {
    backgroundColor: color.accent.mint,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  currentPillText: {
    fontSize: typeTokens.caption.fontSize,
    fontWeight: '700',
    color: color.success.strong,
  },
  priceGroup: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  priceSuffix: {
    fontSize: typeTokens.caption.fontSize,
    color: color.text.secondary,
  },
  featureList: {
    gap: space.xs,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  featureText: {
    flex: 1,
    fontSize: typeTokens.body.fontSize,
    lineHeight: typeTokens.body.lineHeight,
    color: color.text.primary,
  },
});
