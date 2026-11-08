import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  AppHeader,
  Button,
  LoadingView,
  OptionRow,
  Screen,
  Section,
  Txt,
} from '@/components/ui';
import { formatCount, formatPercent } from '@/domain/format';
import { GOAL_FACTORS, totalDailyEnergyExpenditure } from '@/domain/nutrition';
import { mirrorIcon, useDirection } from '@/i18n';
import { layout, spacing } from '@/theme';
import type { ActivityLevel, Goal } from '@/types';

import {
  StepProgress,
  bodyDraftParams,
  parseBodyDraft,
  parsePlanDraft,
  planDraftParams,
  type PlanDraft,
} from './_layout';

/**
 * Lightest week first, so the list reads as a ramp. No glyphs: a bed beside
 * "Sedentary" says nothing the word has not already said.
 */
const ACTIVITY_ORDER = [
  {
    value: 'sedentary',
    labelKey: 'onboarding:activitySedentary',
    hintKey: 'onboarding:activitySedentaryHint',
  },
  {
    value: 'light',
    labelKey: 'onboarding:activityLight',
    hintKey: 'onboarding:activityLightHint',
  },
  {
    value: 'moderate',
    labelKey: 'onboarding:activityModerate',
    hintKey: 'onboarding:activityModerateHint',
  },
  {
    value: 'active',
    labelKey: 'onboarding:activityActive',
    hintKey: 'onboarding:activityActiveHint',
  },
  {
    value: 'very_active',
    labelKey: 'onboarding:activityVeryActive',
    hintKey: 'onboarding:activityVeryActiveHint',
  },
] as const satisfies readonly {
  value: ActivityLevel;
  labelKey: string;
  hintKey: string;
}[];

const GOAL_ORDER = [
  { value: 'lose', labelKey: 'onboarding:goalLose' },
  { value: 'maintain', labelKey: 'onboarding:goalMaintain' },
  { value: 'gain', labelKey: 'onboarding:goalGain' },
] as const satisfies readonly { value: Goal; labelKey: string }[];

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

      <Section title={t('onboarding:activityTitle')} subtitle={t('onboarding:activityHint')}>
        <View style={styles.options}>
          {ACTIVITY_ORDER.map((level) => (
            <OptionRow
              key={level.value}
              title={t(level.labelKey)}
              subtitle={t(level.hintKey)}
              selected={activityLevel === level.value}
              onPress={() => setActivityLevel(level.value)}
            />
          ))}
        </View>

        {/*
          The estimate belongs to the list above it, so it sits inside the same
          section rather than in a box of its own: pick a week, read the number.
        */}
        <View
          accessible
          accessibilityLabel={t('onboarding:maintenanceSpoken', {
            calories: formatCount(maintenance),
          })}
          style={styles.estimate}
        >
          <Txt variant="label" color="muted">
            {t('onboarding:maintenanceLabel')}
          </Txt>
          {/* Figure and unit are one text run, never two elements in a row. */}
          <Txt variant="metric" tabular numberOfLines={1} style={styles.estimateValue}>
            {formatCount(maintenance)}
            <Txt variant="label" color="faint" weight="medium">
              {` ${t('onboarding:caloriesPerDay')}`}
            </Txt>
          </Txt>
          <Txt variant="label" color="muted" style={styles.estimateNote}>
            {t('onboarding:maintenanceNote')}
          </Txt>
        </View>
      </Section>

      <Section title={t('onboarding:goalTitle')} subtitle={t('onboarding:goalHint')}>
        <View style={styles.options}>
          {GOAL_ORDER.map((option) => (
            <OptionRow
              key={option.value}
              title={t(option.labelKey)}
              subtitle={goalHint(option.value)}
              selected={goal === option.value}
              onPress={() => setGoal(option.value)}
            />
          ))}
        </View>
      </Section>

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
  options: {
    rowGap: spacing.sm,
  },
  estimate: {
    marginTop: spacing.xl,
  },
  estimateValue: {
    marginTop: spacing.xs,
  },
  estimateNote: {
    marginTop: spacing.sm,
    maxWidth: layout.maxTextWidth,
  },
  spacer: {
    flexGrow: 1,
    minHeight: spacing.xxl,
  },
  continue: {
    marginTop: spacing.xl,
  },
});
