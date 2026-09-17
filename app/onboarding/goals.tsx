import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { formatCount, formatPercent } from '@/domain/format';
import { GOAL_FACTORS, totalDailyEnergyExpenditure } from '@/domain/nutrition';
import { mirrorIcon, useDirection } from '@/i18n';
import { spacing } from '@/theme';
import type { ActivityLevel, Goal } from '@/types';

import {
  Eyebrow,
  StepProgress,
  bodyDraftParams,
  parseBodyDraft,
  parsePlanDraft,
  planDraftParams,
  type PlanDraft,
} from './_layout';

/** Lightest week first, so the list reads as a ramp. */
const ACTIVITY_ORDER = [
  {
    value: 'sedentary',
    icon: 'bed-outline',
    labelKey: 'onboarding:activitySedentary',
    hintKey: 'onboarding:activitySedentaryHint',
  },
  {
    value: 'light',
    icon: 'walk-outline',
    labelKey: 'onboarding:activityLight',
    hintKey: 'onboarding:activityLightHint',
  },
  {
    value: 'moderate',
    icon: 'bicycle-outline',
    labelKey: 'onboarding:activityModerate',
    hintKey: 'onboarding:activityModerateHint',
  },
  {
    value: 'active',
    icon: 'barbell-outline',
    labelKey: 'onboarding:activityActive',
    hintKey: 'onboarding:activityActiveHint',
  },
  {
    value: 'very_active',
    icon: 'flame-outline',
    labelKey: 'onboarding:activityVeryActive',
    hintKey: 'onboarding:activityVeryActiveHint',
  },
] as const satisfies readonly {
  value: ActivityLevel;
  icon: string;
  labelKey: string;
  hintKey: string;
}[];

const GOAL_ORDER = [
  { value: 'lose', icon: 'trending-down-outline', labelKey: 'onboarding:goalLose' },
  { value: 'maintain', icon: 'remove-outline', labelKey: 'onboarding:goalMaintain' },
  { value: 'gain', icon: 'trending-up-outline', labelKey: 'onboarding:goalGain' },
] as const satisfies readonly { value: Goal; icon: string; labelKey: string }[];

function Section({ title, hint }: { title: string; hint: string }) {
  return (
    <View style={styles.section}>
      <Eyebrow label={title} />
      <Txt variant="label" color="muted" style={styles.sectionHint}>
        {hint}
      </Txt>
    </View>
  );
}

export default function GoalsStep() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { isRTL } = useDirection();
  const { t } = useTranslation(['onboarding', 'common']);

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

  /** What each goal actually does to the daily target, read off the factors. */
  const goalHint = (option: Goal): string => {
    if (option === 'lose') {
      return t('onboarding:goalLoseHint', {
        percent: formatPercent(1 - GOAL_FACTORS.lose),
      });
    }
    if (option === 'gain') {
      return t('onboarding:goalGainHint', {
        percent: formatPercent(GOAL_FACTORS.gain - 1),
      });
    }
    return t('onboarding:goalMaintainHint');
  };

  if (!body) {
    return (
      <Screen>
        <AppHeader title={t('onboarding:goalsTitle')} />
        <LoadingView message={t('onboarding:returning')} />
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
        title={t('onboarding:goalsTitle')}
        subtitle={t('onboarding:goalsSubtitle')}
        onBack={goBack}
      />

      <StepProgress current={2} />

      <Section
        title={t('onboarding:activityTitle')}
        hint={t('onboarding:activityHint')}
      />
      <View style={styles.options}>
        {ACTIVITY_ORDER.map((level) => (
          <OptionRow
            key={level.value}
            title={t(level.labelKey)}
            subtitle={t(level.hintKey)}
            icon={level.icon}
            selected={activityLevel === level.value}
            onPress={() => setActivityLevel(level.value)}
          />
        ))}
      </View>

      <Card style={styles.estimate}>
        <View
          accessible
          accessibilityLabel={t('onboarding:maintenanceSpoken', {
            calories: formatCount(maintenance),
          })}
        >
          <Eyebrow label={t('onboarding:maintenanceLabel')} />
          <View style={styles.estimateRow}>
            <Txt variant="title" color="accent" tabular numberOfLines={1}>
              {formatCount(maintenance)}
            </Txt>
            <Txt variant="label" color="muted" numberOfLines={1}>
              {t('onboarding:caloriesPerDay')}
            </Txt>
          </View>
          <Txt variant="label" color="muted">
            {t('onboarding:maintenanceNote')}
          </Txt>
        </View>
      </Card>

      <Section title={t('onboarding:goalTitle')} hint={t('onboarding:goalHint')} />
      <View style={styles.options}>
        {GOAL_ORDER.map((option) => (
          <OptionRow
            key={option.value}
            title={t(option.labelKey)}
            subtitle={goalHint(option.value)}
            icon={option.icon}
            selected={goal === option.value}
            onPress={() => setGoal(option.value)}
          />
        ))}
      </View>

      <View style={styles.spacer} />

      <Button
        label={t('common:continue')}
        iconRight={mirrorIcon('arrow-forward', isRTL)}
        size="lg"
        fullWidth
        onPress={handleContinue}
        accessibilityHint={t('onboarding:goalsContinueHint')}
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
