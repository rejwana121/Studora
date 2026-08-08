import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { getCurrentWorkload } from '@/api/workload';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
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
  radius,
  riskLevelTokens,
  space,
  touchTarget,
  type as typeTokens,
} from '@/design-system/tokens';
import type {
  WorkloadCurrentResponse,
  WorkloadFactor,
  WorkloadLevel,
  WorkloadRecommendation,
} from '@/types/api';

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

function BackRow() {
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={space.xs}
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backControl, pressed && styles.backControlPressed]}
      >
        <Ionicons name="chevron-back" size={22} color={color.primary.violet} />
        <ThemedText type="default" style={styles.backLabel}>
          Back
        </ThemedText>
      </Pressable>
    </View>
  );
}

export default function WorkloadScreen() {
  const { session } = useSession();
  const params = useLocalSearchParams<{ fromAlarm?: string }>();
  const [data, setData] = useState<WorkloadCurrentResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAllDetails, setShowAllDetails] = useState(false);
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
        setShowAllDetails(false); // a fresh pull-to-refresh always starts collapsed
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
  const hasOverflow = data
    ? orderedFactors.length > MAX_VISIBLE_ITEMS || data.recommendations.length > MAX_VISIBLE_ITEMS
    : false;

  return (
    <Screen style={styles.screen}>
      <BackRow />
      <ThemedText type="default" style={styles.title}>
        Workload
      </ThemedText>

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

      {!isLoading && !loadError && data && (
        <ScrollView
          contentContainerStyle={styles.sections}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
        >
          {data.insufficient_data ? (
            <EmptyState message="Not enough recent activity yet to evaluate your workload. Add a task or start a study session to get your first evaluation." />
          ) : (
            <>
              <LevelSummary data={data} />
              <FactorsSection factors={orderedFactors} showAll={showAllDetails} />
              {data.recommendations.length > 0 && (
                <RecommendationsSection recommendations={data.recommendations} showAll={showAllDetails} />
              )}
              {hasOverflow && (
                <Button
                  label={showAllDetails ? 'Show less' : 'View all details'}
                  variant="text"
                  onPress={() => setShowAllDetails((prev) => !prev)}
                />
              )}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

function LevelSummary({ data }: { data: WorkloadCurrentResponse }) {
  const risk = riskLevelTokens[RISK_KEY_BY_LEVEL[data.level]];

  return (
    <View style={styles.summaryCard}>
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

      {data.gate_applied && (
        <Banner
          variant="info"
          message={
            data.gate_explanation ??
            `Capped from ${data.ungated_level} — fewer than 2 strong signals were found.`
          }
        />
      )}

      {data.confidence === 'reduced' && (
        <Banner
          variant="warning"
          message="Some task estimates are missing — this evaluation may be less precise."
        />
      )}
    </View>
  );
}

function FactorsSection({ factors, showAll }: { factors: WorkloadFactor[]; showAll: boolean }) {
  const visibleFactors = showAll ? factors : factors.slice(0, MAX_VISIBLE_ITEMS);

  return (
    <View style={styles.section}>
      <ThemedText type="default" style={styles.sectionHeader}>
        What&apos;s contributing
      </ThemedText>
      {visibleFactors.length === 0 ? (
        <ThemedText type="default" style={styles.factorExplanation}>
          No major workload contributors were detected right now.
        </ThemedText>
      ) : (
        <View style={{ gap: space.sm }}>
          {visibleFactors.map((factor) => (
            <View key={`${factor.group}-${factor.key}`} style={styles.factorCard}>
              <View style={styles.factorHeaderRow}>
                <ThemedText type="default" style={styles.factorGroup}>
                  {factor.group}
                </ThemedText>
                {factor.is_strong && (
                  <View style={styles.strongBadge}>
                    <ThemedText type="default" style={styles.strongBadgeText}>
                      Strong signal
                    </ThemedText>
                  </View>
                )}
              </View>
              <ThemedText type="default" style={styles.factorExplanation}>
                {factor.explanation}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Navigation target only — never reads `proposed_change` and never
 * triggers a mutation. `StudyBlock` opens the existing Planner tab so the
 * user schedules their own slot; a non-StudyBlock recommendation tied to
 * exactly one task opens that task's existing detail route. Zero or
 * multiple `relevant_task_ids` has no unambiguous single target, so the
 * card stays display-only. */
function getRecommendationHref(recommendation: WorkloadRecommendation): Href | null {
  if (recommendation.type === 'StudyBlock') return '/planner' as Href;
  if (recommendation.relevant_task_ids.length === 1) {
    return `/tasks/${recommendation.relevant_task_ids[0]}` as Href;
  }
  return null;
}

function RecommendationsSection({
  recommendations,
  showAll,
}: {
  recommendations: WorkloadRecommendation[];
  showAll: boolean;
}) {
  const visibleRecommendations = showAll ? recommendations : recommendations.slice(0, MAX_VISIBLE_ITEMS);

  return (
    <View style={styles.section}>
      <ThemedText type="default" style={styles.sectionHeader}>
        Suggestions
      </ThemedText>
      <View style={{ gap: space.sm }}>
        {visibleRecommendations.map((recommendation, index) => {
          const href = getRecommendationHref(recommendation);
          const content = (
            <>
              <View style={styles.recommendationHeaderRow}>
                <ThemedText type="default" style={styles.recommendationTitle}>
                  {recommendation.title}
                </ThemedText>
                {href && (
                  <ThemedText type="default" style={styles.recommendationChevron}>
                    ›
                  </ThemedText>
                )}
              </View>
              <ThemedText type="default" style={styles.factorExplanation}>
                {recommendation.explanation}
              </ThemedText>
            </>
          );

          if (!href) {
            return (
              <View key={`${recommendation.type}-${index}`} style={styles.recommendationCard}>
                {content}
              </View>
            );
          }

          return (
            <Pressable
              key={`${recommendation.type}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={recommendation.title}
              onPress={() => router.push(href)}
              style={({ pressed }) => [
                styles.recommendationCard,
                pressed && styles.recommendationCardPressed,
              ]}
            >
              {content}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'relative',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  backControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    paddingHorizontal: space.sm,
    marginLeft: -space.sm,
  },
  backControlPressed: {
    opacity: 0.6,
  },
  backLabel: {
    color: color.primary.violet,
    fontSize: typeTokens.body.fontSize,
    fontWeight: '600',
  },
  title: {
    fontSize: typeTokens.display.fontSize,
    lineHeight: typeTokens.display.lineHeight,
    fontWeight: '700',
    color: color.primary.violet,
  },
  errorBlock: {
    gap: space.sm,
  },
  testAlarmBlock: {
    gap: space.sm,
  },
  sections: {
    gap: space.lg,
    paddingBottom: space.xxl,
  },
  summaryCard: {
    gap: space.sm,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    padding: space.md,
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
  section: {
    gap: space.xs,
  },
  sectionHeader: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
    color: color.text.secondary,
    textTransform: 'uppercase',
  },
  factorCard: {
    gap: space.xs,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    padding: space.md,
  },
  factorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  factorGroup: {
    fontSize: typeTokens.label.fontSize,
    fontWeight: '600',
    color: color.text.primary,
  },
  strongBadge: {
    backgroundColor: color.risk.high.bg,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  strongBadgeText: {
    fontSize: typeTokens.caption.fontSize,
    fontWeight: '700',
    color: color.risk.high.text,
  },
  factorExplanation: {
    fontSize: typeTokens.body.fontSize,
    lineHeight: typeTokens.body.lineHeight,
    color: color.text.secondary,
  },
  recommendationCard: {
    gap: space.xs,
    backgroundColor: color.background.card,
    borderRadius: radius.card,
    padding: space.md,
  },
  recommendationCardPressed: {
    opacity: 0.7,
  },
  recommendationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recommendationTitle: {
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '600',
    color: color.text.primary,
  },
  recommendationChevron: {
    fontSize: typeTokens.subheading.fontSize,
    color: color.text.secondary,
  },
});
