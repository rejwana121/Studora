import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { getCurrentWorkload } from '@/api/workload';
import { Banner } from '@/components/banner';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/features/auth/session-context';
import { color, radius, riskLevelTokens, space, type as typeTokens } from '@/design-system/tokens';
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

export default function WorkloadScreen() {
  const { session } = useSession();
  const [data, setData] = useState<WorkloadCurrentResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isFetchingRef = useRef(false);

  const load = useCallback(
    (isRefresh = false) => {
      if (!session || isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
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

  return (
    <Screen style={styles.screen}>
      <ThemedText type="default" style={styles.title}>
        Workload
      </ThemedText>

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
              {data.factors.length > 0 && <FactorsSection factors={data.factors} />}
              {data.recommendations.length > 0 && (
                <RecommendationsSection recommendations={data.recommendations} />
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

function FactorsSection({ factors }: { factors: WorkloadFactor[] }) {
  return (
    <View style={styles.section}>
      <ThemedText type="default" style={styles.sectionHeader}>
        What&apos;s contributing
      </ThemedText>
      <View style={{ gap: space.sm }}>
        {factors.map((factor) => (
          <View key={`${factor.group}-${factor.key}`} style={styles.factorCard}>
            <View style={styles.factorHeaderRow}>
              <ThemedText type="default" style={styles.factorGroup}>
                {factor.group}
              </ThemedText>
              {factor.is_strong && (
                <View style={styles.strongBadge}>
                  <ThemedText type="default" style={styles.strongBadgeText}>
                    Strong
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
    </View>
  );
}

function RecommendationsSection({ recommendations }: { recommendations: WorkloadRecommendation[] }) {
  return (
    <View style={styles.section}>
      <ThemedText type="default" style={styles.sectionHeader}>
        Suggestions
      </ThemedText>
      <View style={{ gap: space.sm }}>
        {recommendations.map((recommendation, index) => (
          <View key={`${recommendation.type}-${index}`} style={styles.recommendationCard}>
            <ThemedText type="default" style={styles.recommendationTitle}>
              {recommendation.title}
            </ThemedText>
            <ThemedText type="default" style={styles.factorExplanation}>
              {recommendation.explanation}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'relative',
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
    paddingVertical: 2,
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
  recommendationTitle: {
    fontSize: typeTokens.subheading.fontSize,
    lineHeight: typeTokens.subheading.lineHeight,
    fontWeight: '600',
    color: color.text.primary,
  },
});
