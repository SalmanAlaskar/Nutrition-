import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppHeader,
  Button,
  Card,
  LoadingView,
  OptionRow,
  Screen,
  Txt,
} from '@/components/ui';
import {
  ACTIVITY_HINTS,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  totalDailyEnergyExpenditure,
} from '@/domain/nutrition';
import { spacing } from '@/theme';
import type { ActivityLevel, Goal } from '@/types';

import {
  bodyDraftParams,
  formatCount,
  parseBodyDraft,
  parsePlanDraft,
  planDraftParams,
  type PlanDraft,
} from './_layout';

const ACTIVITY_ORDER: ActivityLevel[] = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
];

const ACTIVITY_ICONS: Record<ActivityLevel, string> = {
  sedentary: 'bed-outline',
  light: 'walk-outline',
  moderate: 'bicycle-outline',
  active: 'barbell-outline',
  very_active: 'flame-outline',
};

const GOAL_ORDER: Goal[] = ['lose', 'maintain', 'gain'];

const GOAL_ICONS: Record<Goal, string> = {
  lose: 'trending-down-outline',
  maintain: 'remove-outline',
  gain: 'trending-up-outline',
};

/** What each goal actually does to the daily target. */
const GOAL_HINTS: Record<Goal, string> = {
  lose: 'A 20% calorie deficit, with protein kept high',
  maintain: 'Matches your maintenance calories exactly',
  gain: 'A 12% surplus to support training',
};

function Section({ title, hint }: { title: string; hint: string }) {
  return (
    <View style={styles.section}>
      <Txt variant="caption" color="faint" weight="semibold" style={styles.sectionLabel}>
        {title.toUpperCase()}
      </Txt>
      <Txt variant="label" color="muted" style={styles.sectionHint}>
        {hint}
      </Txt>
    </View>
  );
}

export default function GoalsStep() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const body = useMemo(() => parseBodyDraft(params), [params]);
  const missingBody = body === null;

  // Coming back from the plan step carries the choices already made; a fresh
  // arrival from step one carries only the body facts and takes the defaults.
  const [initial] = useState(() => parsePlanDraft(params));
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    initial?.activityLevel ?? 'moderate',
  );
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? 'maintain');

  // A deep link or a web reload can land here without the step-one facts.
  useEffect(() => {
    if (missingBody) router.replace('/onboarding/body');
  }, [missingBody, router]);

  if (!body) {
    return (
      <Screen>
        <AppHeader title="Your week" />
        <LoadingView message="Taking you back to your body details" />
      </Screen>
    );
  }

  const draft: PlanDraft = { ...body, activityLevel, goal };
  const maintenance = totalDailyEnergyExpenditure(draft);

  const goBack = () => {
    router.replace({ pathname: '/onboarding/body', params: bodyDraftParams(body) });
  };

  const handleContinue = () => {
    router.push({ pathname: '/onboarding/plan', params: planDraftParams(draft) });
  };

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <AppHeader
        large
        title="Your week"
        subtitle="Step 2 of 3 — how much you move and what you want"
        onBack={goBack}
      />

      <Section title="Activity level" hint="Pick the week you actually have, not the one you plan." />
      <View style={styles.options}>
        {ACTIVITY_ORDER.map((level) => (
          <OptionRow
            key={level}
            title={ACTIVITY_LABELS[level]}
            subtitle={ACTIVITY_HINTS[level]}
            icon={ACTIVITY_ICONS[level]}
            selected={activityLevel === level}
            onPress={() => setActivityLevel(level)}
          />
        ))}
      </View>

      <Card style={styles.estimate}>
        <View
          accessible
          accessibilityLabel={`Maintenance estimate: ${formatCount(maintenance)} calories a day`}
        >
          <Txt variant="caption" color="faint" weight="semibold" style={styles.sectionLabel}>
            MAINTENANCE ESTIMATE
          </Txt>
          <View style={styles.estimateRow}>
            <Txt variant="title" color="accent" tabular>
              {formatCount(maintenance)}
            </Txt>
            <Txt variant="label" color="muted">
              calories a day
            </Txt>
          </View>
          <Txt variant="label" color="muted">
            What you burn on a normal day at this activity level. Your goal then
            moves the daily target up or down from here.
          </Txt>
        </View>
      </Card>

      <Section title="Goal" hint="What the daily target should aim at." />
      <View style={styles.options}>
        {GOAL_ORDER.map((option) => (
          <OptionRow
            key={option}
            title={GOAL_LABELS[option]}
            subtitle={GOAL_HINTS[option]}
            icon={GOAL_ICONS[option]}
            selected={goal === option}
            onPress={() => setGoal(option)}
          />
        ))}
      </View>

      <View style={styles.spacer} />

      <Button
        label="Continue"
        iconRight="arrow-forward"
        size="lg"
        fullWidth
        onPress={handleContinue}
        accessibilityHint="Works out your calorie and macro plan"
        style={styles.continue}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  sectionLabel: {
    letterSpacing: 0.8,
  },
  sectionHint: {
    marginTop: 2,
  },
  options: {
    rowGap: spacing.sm,
  },
  estimate: {
    marginTop: spacing.lg,
  },
  estimateRow: {
    alignItems: 'baseline',
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  spacer: {
    flexGrow: 1,
    minHeight: spacing.xl,
  },
  continue: {
    marginTop: spacing.xl,
  },
});
