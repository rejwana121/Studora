import Constants from 'expo-constants';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCurrentWorkload } from '@/api/workload';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import {
  isWorkloadAlarmSupported,
  startWorkloadAlarm,
  stopWorkloadAlarm,
  TAKE_A_BREAK_PARAM,
} from '@/features/notifications/workload-alarm-controller';
import {
  color,
  elevation,
  radius,
  riskLevelTokens,
  shadowStyle,
  space,
  touchTarget,
  type as typeTokens,
} from '@/design-system/tokens';
import type {
  WorkloadCurrentResponse,
  WorkloadFactor,
  WorkloadLevel,
  WorkloadRecommendation,
  WorkloadRecommendationType,
} from '@/types/api';

type IconName = React.ComponentProps<typeof Icon>['name'];

const RISK_KEY_BY_LEVEL: Record<WorkloadLevel, keyof typeof riskLevelTokens> = {
  Low: 'low',
  Moderate: 'moderate',
  High: 'high',
  Critical: 'critical',
};

const LEVEL_SUMMARY_TEXT: Record<WorkloadLevel, string> = {
  Low: 'Your current academic workload appears manageable.',
  Moderate: 'Your workload needs some attention.',
  High: 'Your workload is currently heavy.',
  Critical: 'Your workload needs immediate attention.',
};

/** A factor is worth showing under "What's contributing" only if it
 * actually contributed something — a strong signal, a true flag, or a
 * positive numeric value. Zero/false/null factors are real engine output
 * (every signal group is always present) but are non-contributing noise
 * for this summary view. */
function isMeaningfulFactor(factor: WorkloadFactor): boolean {
  if (factor.is_strong) return true;
  if (typeof factor.value === 'boolean') return factor.value;
  if (typeof factor.value === 'number') return factor.value > 0;
  return false;
}

const MAX_VISIBLE_ITEMS = 3;

/** Default "top 3" ordering: is_strong factors first, then other
 * meaningful factors — each group preserving `factors`' existing order
 * (the engine emits factors in a fixed `WEIGHTS`-declared order). Never
 * re-derives or approximates the backend's own scoring/weighting. */
function orderFactorsForDisplay(factors: WorkloadFactor[]): WorkloadFactor[] {
  const meaningful = factors.filter(isMeaningfulFactor);
  const strong = meaningful.filter((factor) => factor.is_strong);
  const otherMeaningful = meaningful.filter((factor) => !factor.is_strong);
  return [...strong, ...otherMeaningful];
}

// Guaranteed by EAS itself, not a guess: `eas build` always sets
// EAS_BUILD_PROFILE to the profile name being built during config
// evaluation (see app.config.js), which is baked into
// `extra.easBuildProfile` at build time. Local dev/Metro runs never set
// it, so this reads `null` there too. Only a "preview" profile exists in
// eas.json today, so this stays true (control visible) for every build
// the team can currently produce — the moment a "production" profile is
// added and used, this flips to hide the control with no further code
// change required.
const IS_NON_PRODUCTION_BUILD = Constants.expoConfig?.extra?.easBuildProfile !== 'production';

function pluralize(word: string, n: number): string {
  return n === 1 ? word : `${word}s`;
}

function formatHoursAsDuration(hours: number): string {
  if (hours < 1) return 'under an hour';
  if (hours < 24) {
    const n = Math.round(hours);
    return `about ${n} ${pluralize('hour', n)}`;
  }
  const days = Math.round(hours / 24);
  return `about ${days} ${pluralize('day', days)}`;
}

/** Backend explanation strings are truthful but carry raw-engine markers
 * ("task(s)") and raw hour magnitudes not meant for primary UI. This
 * reformats them for human reading without changing the underlying value
 * or meaning: "4 task(s)" -> "4 tasks", "269.8h" -> "about 11 days". */
function humanizeExplanation(explanation: string): string {
  let text = explanation.replace(/(\d+(?:\.\d+)?)h\b/, (_match, raw: string) =>
    formatHoursAsDuration(Number(raw))
  );
  text = text.replace(
    /(\d+(?:\.\d+)?)((?:\s+\S+){0,3}?)\s+(\w+)\(s\)/g,
    (_match, count: string, between: string, word: string) => {
      const n = Number(count);
      const displayCount = Number.isInteger(n) ? String(n) : count;
      return `${displayCount}${between} ${pluralize(word, n)}`;
    }
  );
  return text;
}

const FACTOR_GROUP_ICON: Record<string, IconName> = {
  Deadline: 'time-outline',
  Importance: 'flag-outline',
  Feasibility: 'hourglass-outline',
  Backlog: 'file-tray-outline',
  Completion: 'checkmark-circle-outline',
  Study: 'book-outline',
};
const DEFAULT_FACTOR_ICON: IconName = 'ellipse-outline';

/** The backend's own `GROUP_OF` (constants.py) groups multiple distinct signals
 * under the same group name — three signals share "Deadline" and two share
 * "Completion". Rendering the group name as-is would produce identical
 * "Deadline / Deadline / Deadline" rows. Display-only: each entry here gives
 * a specific factor `key` its own truthful title and icon instead of the
 * group-level fallback. The factor's group, key, value, and explanation are
 * all still read from the real payload unchanged. */
const FACTOR_KEY_DISPLAY: Partial<Record<string, { title: string; icon: IconName }>> = {
  // Deadline group — three distinct signals, each with its own title so the
  // factors card never shows "Deadline / Deadline / Deadline" in a row.
  overdue_count: { title: 'Overdue tasks', icon: 'alert-circle-outline' },
  cluster_72h: { title: 'Deadline cluster', icon: 'time-outline' },
  due_72h_count: { title: 'Due soon', icon: 'calendar-outline' },
  // Completion group — two semantically different factors under one group name.
  reschedule_count_lifetime: { title: 'Rescheduling', icon: 'repeat-outline' },
};

function factorDisplay(factor: WorkloadFactor): { title: string; icon: IconName } {
  return (
    FACTOR_KEY_DISPLAY[factor.key] ?? {
      title: factor.group,
      icon: FACTOR_GROUP_ICON[factor.group] ?? DEFAULT_FACTOR_ICON,
    }
  );
}

/** Badge tint tracks the same "Strong" signal already surfaced by the
 * pill next to it, not the factor's group — a strong factor is urgent
 * regardless of which group produced it. */
function factorBadgeTone(isStrong: boolean): { bg: string; iconColor: string } {
  return isStrong
    ? { bg: color.risk.high.bg, iconColor: color.risk.high.text }
    : { bg: color.accent.lavender, iconColor: color.primary.violet };
}

/** `recent_completion_delay_avg`'s raw explanation leads with "Tasks
 * completed in the last 14 days finished..." — accurate but redundant
 * for a compact row (the 14-day lookback isn't primary-UI-worthy). This
 * trims that lead-in only for that one key; every other factor's
 * humanized explanation passes through unchanged. Same average, same
 * meaning, shorter sentence. */
function displayExplanation(factor: WorkloadFactor): string {
  const humanized = humanizeExplanation(factor.explanation);
  if (factor.key === 'recent_completion_delay_avg') {
    return humanized.replace(/^Tasks completed in the last \d+ days finished /, 'Tasks finished ');
  }
  return humanized;
}

const RECOMMENDATION_TYPE_ICON: Record<WorkloadRecommendationType, IconName> = {
  Priority: 'flag-outline',
  Split: 'git-branch-outline',
  Reschedule: 'calendar-outline',
  StudyBlock: 'book-outline',
  Break: 'cafe-outline',
  Recovery: 'clipboard-outline',
};

/** `Recovery`'s real explanation (recommendations.py `_generate_recovery`)
 * interpolates the actual overdue task titles — e.g. "These overdue tasks
 * are good candidates to clear first: Sound Test, Prepare BI
 * presentation." — accurate, but too long/technical for this compact
 * card, and the CTA below already routes to the real task list (see
 * `getRecommendationHref`), so nothing is lost by not repeating the
 * titles here. Display-only; `recommendation.explanation` itself, and
 * everything the CTA reads, is untouched. Every other recommendation
 * type's explanation is already a short single-task sentence and passes
 * through unchanged. */
const RECOMMENDATION_EXPLANATION_OVERRIDE: Partial<Record<WorkloadRecommendationType, string>> = {
  Recovery: 'Start with your most overdue tasks.',
};

function displayRecommendationExplanation(recommendation: WorkloadRecommendation): string {
  return RECOMMENDATION_EXPLANATION_OVERRIDE[recommendation.type] ?? recommendation.explanation;
}

/** Navigation target only — never reads `proposed_change` and never
 * triggers a mutation. `StudyBlock` opens the existing Planner tab so the
 * user schedules their own slot; a recommendation tied to exactly one
 * task opens that task's existing detail route; one tied to several
 * tasks (e.g. `Recovery`'s "Clear overdue backlog", which selects up to
 * `RECOVERY_MAX_TASKS` — see recommendations.py — so it's essentially
 * never exactly 1) opens the existing Tasks tab instead of picking one
 * arbitrarily. Zero `relevant_task_ids` has no target at all, so the
 * card stays display-only. */
function getRecommendationHref(recommendation: WorkloadRecommendation): Href | null {
  if (recommendation.type === 'StudyBlock') return '/planner' as Href;
  if (recommendation.relevant_task_ids.length === 1) {
    return `/tasks/${recommendation.relevant_task_ids[0]}` as Href;
  }
  if (recommendation.relevant_task_ids.length > 1) return '/tasks' as Href;
  return null;
}

/** Label derived from the real route a recommendation already resolves
 * to (see `getRecommendationHref`) — never a fabricated action. */
function ctaLabelForHref(href: Href): string {
  const path = String(href);
  if (path.startsWith('/planner')) return 'Plan study time';
  if (path === '/tasks') return 'Review tasks';
  return 'Review task';
}

export default function WorkloadScreen() {
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ fromAlarm?: string }>();
  const [data, setData] = useState<WorkloadCurrentResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAllFactors, setShowAllFactors] = useState(false);
  const [testAlarmActive, setTestAlarmActive] = useState(false);
  const [testAlarmError, setTestAlarmError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const showTestAlarmControl = IS_NON_PRODUCTION_BUILD && isWorkloadAlarmSupported();

  const handleToggleTestAlarm = useCallback(() => {
    setTestAlarmError(null);
    if (testAlarmActive) {
      setTestAlarmActive(false);
      void stopWorkloadAlarm();
      return;
    }
    // Starts the same real native service path the real workload trigger
    // uses (see workload-alert.ts) — no separate fake audio implementation.
    // Deliberately does not stop on screen unmount/navigation: the whole
    // point of this control is to physically verify the alarm keeps
    // looping while backgrounded/locked, same as a real one would.
    void startWorkloadAlarm().then((result) => {
      if (result.ok) setTestAlarmActive(true);
      else setTestAlarmError(result.message ?? null);
    });
  }, [testAlarmActive]);

  const load = useCallback(
    (isRefresh = false) => {
      if (!session || isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (isRefresh) {
        setIsRefreshing(true);
        setShowAllFactors(false); // a fresh pull-to-refresh always starts collapsed
      } else {
        setIsLoading(true);
      }
      getCurrentWorkload(session.access_token).then((result) => {
        isFetchingRef.current = false;
        if (result.ok) {
          setData(result.data);
          setLoadError(null);
        } else {
          setLoadError(result.error.message);
        }
        if (isRefresh) setIsRefreshing(false);
        else setIsLoading(false);
      });
    },
    [session]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // The alarm notification's "Take a Break" action opens this exact route
  // with this marker (see workload-alarm-controller.ts) instead of
  // stopping the alarm natively — a notification action that starts an
  // Activity via an intermediary Service is blocked as a "trampoline" on
  // Android 12+, so cleanup happens here instead, the moment this screen
  // is reached. Idempotent/harmless if called when nothing is active, or
  // if this fires again on a later focus.
  useFocusEffect(
    useCallback(() => {
      if (params[TAKE_A_BREAK_PARAM] === '1') void stopWorkloadAlarm();
    }, [params])
  );

  const orderedFactors = data ? orderFactorsForDisplay(data.factors) : [];
  const visibleFactors = showAllFactors ? orderedFactors : orderedFactors.slice(0, MAX_VISIBLE_ITEMS);
  const hasFactorOverflow = orderedFactors.length > MAX_VISIBLE_ITEMS;
  const topRecommendations = data ? data.recommendations.slice(0, MAX_VISIBLE_ITEMS) : [];

  return (
    // `edges` excludes 'top' deliberately: SafeAreaView's own background
    // would otherwise paint the top safe-area/status-bar strip, producing
    // a second seam above `headerSurface`. Instead `headerSurface` itself
    // absorbs `insets.top` into its own paddingTop below, so its periwinkle
    // background extends continuously through the status bar — same
    // technique Today's tab header uses.
    <SafeAreaView style={styles.outerSafeArea} edges={['left', 'right', 'bottom']}>
      <StatusBar style="dark" />

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
          Workload
        </ThemedText>
        <ThemedText type="default" style={styles.subtitle}>
          Understand what needs your attention.
        </ThemedText>
      </View>

      <View style={styles.bodyColumn}>
        {showTestAlarmControl && (
          <View style={styles.testAlarmBlock}>
            <Button
              label={testAlarmActive ? 'Stop test alarm' : 'Test alarm sound'}
              variant={testAlarmActive ? 'destructive' : 'secondary'}
              onPress={handleToggleTestAlarm}
            />
            {testAlarmError && <Banner variant="error" message={testAlarmError} />}
          </View>
        )}

        {isLoading && <ActivityIndicator color={color.primary.violet} />}

        {!isLoading && loadError && (
          <View style={styles.errorBlock}>
            <Banner variant="error" message={loadError} />
            <Button label="Retry" variant="secondary" onPress={() => load()} />
          </View>
        )}

        {!isLoading && !loadError && data && data.insufficient_data && (
          <EmptyState message="Not enough recent activity yet to evaluate your workload. Add a task or start a study session to get your first evaluation." />
        )}

        {!isLoading && !loadError && data && !data.insufficient_data && (
          <>
            {/* Fixed (non-scrolling) hero — overlaps the header's rounded
             * bottom edge via negative margin, same technique Profile's
             * identityBlock uses. Deliberately a sibling of the ScrollView
             * below, not its first child: a negative margin on a
             * ScrollView's own content gets clipped at the scroll boundary
             * instead of overlapping anything. */}
            <SummaryHero data={data} />

            <ScrollView
              contentContainerStyle={styles.sections}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
            >
              <View>
                <SectionCard padded={false} style={styles.factorsCard}>
                  <ThemedText type="default" style={styles.cardTitle}>
                    What&apos;s contributing
                  </ThemedText>
                  {visibleFactors.length === 0 ? (
                    <ThemedText type="default" style={styles.emptyCardText}>
                      No major workload contributors were detected right now.
                    </ThemedText>
                  ) : (
                    visibleFactors.map((factor, index) => (
                      <Fragment key={`${factor.group}-${factor.key}`}>
                        {index > 0 && <View style={styles.divider} />}
                        <FactorRow factor={factor} />
                      </Fragment>
                    ))
                  )}
                </SectionCard>
                {hasFactorOverflow && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showAllFactors ? 'Show fewer factors' : 'View all factors'}
                    onPress={() => setShowAllFactors((prev) => !prev)}
                    style={({ pressed }) => [styles.expandRow, pressed && styles.pressedFade]}
                  >
                    <ThemedText type="default" style={styles.expandLabel}>
                      {showAllFactors ? 'Show fewer' : 'View all factors'}
                    </ThemedText>
                    <Icon name={showAllFactors ? 'chevron-up' : 'chevron-forward'} size="sm" color={color.primary.violet} />
                  </Pressable>
                )}
              </View>

              {topRecommendations.length > 0 && (
                <View style={styles.section}>
                  <ThemedText type="default" style={styles.sectionHeading}>
                    {topRecommendations.length === 1 ? 'Recommended next step' : 'Recommended next steps'}
                  </ThemedText>
                  <View style={{ gap: space.sm }}>
                    {topRecommendations.map((recommendation, index) => (
                      <RecommendationCard key={`${recommendation.type}-${index}`} recommendation={recommendation} />
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function SummaryHero({ data }: { data: WorkloadCurrentResponse }) {
  const risk = riskLevelTokens[RISK_KEY_BY_LEVEL[data.level]];

  const overdueFactor = data.factors.find((factor) => factor.key === 'overdue_count');
  const overdueCount = typeof overdueFactor?.value === 'number' ? overdueFactor.value : null;

  const metrics: { key: string; icon: IconName; bg: string; iconColor: string; value: number; label: string }[] = [];
  if (overdueCount !== null) {
    metrics.push({
      key: 'overdue',
      icon: 'alert-circle-outline',
      bg: color.risk.high.bg,
      iconColor: color.risk.high.text,
      value: overdueCount,
      label: 'Overdue',
    });
  }
  metrics.push({
    key: 'strong',
    icon: 'trending-up-outline',
    bg: color.accent.mint,
    iconColor: color.success.strong,
    value: data.strong_signal_count,
    label: 'Strong signals',
  });
  metrics.push({
    key: 'next',
    icon: 'arrow-forward-outline',
    bg: color.accent.lavender,
    iconColor: color.primary.violet,
    value: data.recommendations.length,
    label: 'Next steps',
  });

  return (
    <SectionCard variant="emphasis" style={styles.heroCard}>
      <View style={[styles.levelChip, { backgroundColor: risk.bg }]}>
        <ThemedText type="default" style={[styles.levelChipText, { color: risk.text }]}>
          {data.level}
        </ThemedText>
      </View>
      <ThemedText type="default" style={styles.score}>
        {data.raw_score}
        <ThemedText type="default" style={styles.scoreMax}>
          /100
        </ThemedText>
      </ThemedText>
      <ThemedText type="default" style={styles.summarySentence}>
        {LEVEL_SUMMARY_TEXT[data.level]}
      </ThemedText>

      <View style={styles.scoreTrack}>
        <View
          style={[
            styles.scoreFill,
            { width: `${Math.max(0, Math.min(100, data.raw_score))}%`, backgroundColor: risk.text },
          ]}
        />
      </View>

      <View style={styles.heroDivider} />

      <View style={styles.metricsRow}>
        {metrics.map((metric, index) => (
          <Fragment key={metric.key}>
            {index > 0 && <View style={styles.metricDivider} />}
            <View style={styles.metricColumn}>
              <View style={[styles.metricIconBadge, { backgroundColor: metric.bg }]}>
                <Icon name={metric.icon} size="sm" color={metric.iconColor} />
              </View>
              <ThemedText type="default" style={styles.metricValue}>
                {metric.value}
              </ThemedText>
              <ThemedText type="default" style={styles.metricLabel} numberOfLines={1}>
                {metric.label}
              </ThemedText>
            </View>
          </Fragment>
        ))}
      </View>
    </SectionCard>
  );
}

function FactorRow({ factor }: { factor: WorkloadFactor }) {
  const display = factorDisplay(factor);
  const tone = factorBadgeTone(factor.is_strong);

  return (
    <View style={styles.factorRow}>
      <View style={[styles.factorIconBadge, { backgroundColor: tone.bg }]}>
        <Icon name={display.icon} size="sm" color={tone.iconColor} />
      </View>
      <View style={styles.factorTextGroup}>
        <ThemedText type="default" style={styles.factorTitle}>
          {display.title}
        </ThemedText>
        <ThemedText type="default" style={styles.factorExplanation}>
          {displayExplanation(factor)}
        </ThemedText>
      </View>
      {factor.is_strong && (
        <View style={styles.strongPill}>
          <ThemedText type="default" style={styles.strongPillText}>
            Strong
          </ThemedText>
        </View>
      )}
    </View>
  );
}

function RecommendationCard({ recommendation }: { recommendation: WorkloadRecommendation }) {
  const href = getRecommendationHref(recommendation);
  const icon = RECOMMENDATION_TYPE_ICON[recommendation.type];

  return (
    <SectionCard style={styles.recommendationCard}>
      <View style={styles.recommendationRow}>
        <View style={styles.recommendationIconBadge}>
          <Icon name={icon} size="md" color={color.primary.violet} />
        </View>
        <View style={styles.recommendationTextGroup}>
          <ThemedText type="default" style={styles.recommendationTitle} numberOfLines={1}>
            {recommendation.title}
          </ThemedText>
          <ThemedText type="default" style={styles.factorExplanation}>
            {displayRecommendationExplanation(recommendation)}
          </ThemedText>
        </View>
        {href && <Button label={ctaLabelForHref(href)} onPress={() => router.push(href)} />}
      </View>
    </SectionCard>
  );
}

const HERO_OVERLAP = space.md;

const styles = StyleSheet.create({
  outerSafeArea: {
    flex: 1,
    backgroundColor: color.surface.canvas,
  },
  headerSurface: {
    backgroundColor: color.surface.headerSoft,
    paddingHorizontal: space.lg,
    // `HERO_OVERLAP` pulls the hero card up into this padding to overlap
    // the rounded bottom corner — paddingBottom must stay bigger than
    // HERO_OVERLAP by the real visible gap (16pt) we want between the
    // subtitle text and the card's top edge, or the card overlaps the
    // subtitle itself instead of just the empty corner beneath it.
    paddingBottom: space.xl,
    gap: 2,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
  },
  backButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: radius.pill,
    backgroundColor: color.background.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
    ...shadowStyle(elevation.card, 3),
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
  bodyColumn: {
    flex: 1,
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  errorBlock: {
    gap: space.sm,
  },
  testAlarmBlock: {
    gap: space.sm,
  },
  sections: {
    gap: space.md,
    // No paddingTop: `bodyColumn`'s own `gap: space.md` already spaces
    // the hero card from this ScrollView (they're Fragment siblings, so
    // that gap lands right here) — an added paddingTop would double it.
    paddingBottom: space.xxl,
  },
  // Pulls the hero card up to overlap the header's rounded bottom edge —
  // same negative-margin technique as Today's heroSlot/Profile's
  // identityBlock.
  heroCard: {
    marginTop: -HERO_OVERLAP,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  levelChip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  levelChipText: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  score: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  scoreMax: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '400',
    color: color.text.secondary,
  },
  summarySentence: {
    fontSize: typeTokens.body.fontSize,
    lineHeight: typeTokens.body.lineHeight,
    color: color.text.secondary,
  },
  scoreTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.border.divider,
    overflow: 'hidden',
  },
  scoreFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  heroDivider: {
    height: 1,
    backgroundColor: color.border.divider,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  metricColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricDivider: {
    width: 1,
    alignSelf: 'center',
    height: 36,
    backgroundColor: color.border.divider,
  },
  metricIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  metricLabel: {
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
    color: color.text.secondary,
  },
  section: {
    gap: space.xs,
  },
  sectionHeading: {
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
  },
  factorsCard: {
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  cardTitle: {
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '700',
    color: color.text.primary,
    paddingHorizontal: space.md,
    paddingBottom: space.xs,
  },
  emptyCardText: {
    fontSize: typeTokens.body.fontSize,
    lineHeight: typeTokens.body.lineHeight,
    color: color.text.secondary,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  divider: {
    height: 1,
    backgroundColor: color.border.divider,
    marginHorizontal: space.md,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  factorIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factorTextGroup: {
    flex: 1,
    gap: 2,
  },
  factorTitle: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
  factorExplanation: {
    fontSize: typeTokens.caption.fontSize,
    lineHeight: typeTokens.caption.lineHeight,
    color: color.text.secondary,
  },
  strongPill: {
    backgroundColor: color.risk.high.bg,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  strongPillText: {
    fontSize: typeTokens.caption.fontSize,
    fontWeight: '700',
    color: color.risk.high.text,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: touchTarget.min,
  },
  expandLabel: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.primary.violet,
  },
  recommendationCard: {
    paddingVertical: space.sm,
  },
  recommendationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  recommendationIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.accent.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendationTextGroup: {
    flex: 1,
    gap: 2,
  },
  recommendationTitle: {
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
});
