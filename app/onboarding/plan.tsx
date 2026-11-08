import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
} from 'react-native';

import {
  AppHeader,
  Badge,
  Button,
  Divider,
  LoadingView,
  Screen,
  Section,
  Txt,
  type BadgeTone,
} from '@/components/ui';
import { formatAmount, formatCount, formatPercent } from '@/domain/format';
import {
  basalMetabolicRate,
  bmiCategory,
  bodyMassIndex,
  healthyWeightRangeKg,
  kgToLb,
  macroEnergySplit,
  macroTargets,
  totalDailyEnergyExpenditure,
  type BmiCategory,
} from '@/domain/nutrition';
import { mirrorIcon, useDirection } from '@/i18n';
import { useApp } from '@/state/AppStore';
import { layout, radius, spacing, useTheme } from '@/theme';
import type { Goal, Profile } from '@/types';

import { StepProgress, parsePlanDraft, planDraftParams } from './_layout';

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

/**
 * A band is a word, not a colour wash: the tone only tints the word itself,
 * and a healthy band stays plain. The calorie figure is the one green on this
 * screen, and a second green beside it would halve its weight.
 */
const BMI_TONE: Record<BmiCategory, BadgeTone> = {
  Underweight: 'warning',
  Healthy: 'default',
  Overweight: 'warning',
  Obese: 'danger',
};

const BMI_KEYS = {
  Underweight: 'onboarding:bmiUnderweight',
  Healthy: 'onboarding:bmiHealthy',
  Overweight: 'onboarding:bmiOverweight',
  Obese: 'onboarding:bmiObese',
} as const satisfies Record<BmiCategory, string>;

const GOAL_KEYS = {
  lose: 'onboarding:goalLose',
  maintain: 'onboarding:goalMaintain',
  gain: 'onboarding:goalGain',
} as const satisfies Record<Goal, string>;

/** Alert is a no-op on react-native-web, so the browser gets its own dialog. */
function notifyFailure(title: string, message: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(`${title}\n\n${message}`);
    }
    return;
  }
  Alert.alert(title, message);
}

function DetailRow({
  label,
  value,
  unit,
  hint,
  right,
}: {
  label: string;
  value: string;
  /** Printed inside the value's own text run, at label size. */
  unit?: string;
  hint: string;
  right?: React.ReactNode;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${unit ? `${value} ${unit}` : value}. ${hint}`}
      style={styles.detailRow}
    >
      <View style={styles.detailText}>
        <Txt>{label}</Txt>
        <Txt variant="caption" color="faint" style={styles.detailHint}>
          {hint}
        </Txt>
      </View>
      {right}
      {/* One run, so Arabic never reorders a figure away from its unit. */}
      <Txt tabular numberOfLines={1} align="end" style={styles.detailValue}>
        {value}
        {unit ? (
          <Txt variant="label" color="faint">
            {` ${unit}`}
          </Txt>
        ) : null}
      </Txt>
    </View>
  );
}

export default function PlanStep() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { saveProfile } = useApp();
  const { colors } = useTheme();
  const { isRTL } = useDirection();
  const { t } = useTranslation(['onboarding', 'macros', 'units']);

  const draft = useMemo(() => parsePlanDraft(params), [params]);
  const missingDraft = draft === null;

  // Fixed on arrival so the plan on screen and the profile saved from it agree.
  const [stamp] = useState(() => new Date().toISOString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A deep link or a web reload can land here without the earlier answers.
  useEffect(() => {
    if (missingDraft) router.replace('/onboarding/body');
  }, [missingDraft, router]);

  if (!draft) {
    return (
      <Screen>
        <AppHeader title={t('onboarding:planTitle')} />
        <LoadingView message={t('onboarding:returning')} />
      </Screen>
    );
  }

  const profile: Profile = { ...draft, createdAt: stamp, updatedAt: stamp };

  const targets = macroTargets(profile);
  const split = macroEnergySplit(targets);
  const bmr = basalMetabolicRate(profile);
  const maintenance = totalDailyEnergyExpenditure(profile);
  const bmi = bodyMassIndex(profile.heightCm, profile.weightKg);
  const category = bmiCategory(bmi);
  const [lowKg, highKg] = healthyWeightRangeKg(profile.heightCm);

  const imperial = profile.units === 'imperial';
  const weightUnit = imperial ? t('units:lb') : t('units:kg');
  const healthyLow = imperial ? kgToLb(lowKg) : lowKg;
  const healthyHigh = imperial ? kgToLb(highKg) : highKg;

  const goalLabel = t(GOAL_KEYS[profile.goal]);

  // Read the gap off the finished target: a safety floor can soften the deficit.
  const deltaPercent =
    maintenance > 0
      ? Math.round(((targets.calories - maintenance) / maintenance) * 100)
      : 0;
  const goalSentence =
    deltaPercent === 0
      ? t('onboarding:goalMatched', { calories: formatCount(maintenance) })
      : t(deltaPercent < 0 ? 'onboarding:goalBelow' : 'onboarding:goalAbove', {
          percent: formatPercent(Math.abs(deltaPercent) / 100),
          calories: formatCount(maintenance),
        });

  const macros = [
    {
      key: 'protein',
      label: t('macros:protein'),
      grams: targets.protein,
      share: split.protein,
      color: colors.protein,
    },
    {
      key: 'carbs',
      label: t('macros:carbs'),
      grams: targets.carbs,
      share: split.carbs,
      color: colors.carbs,
    },
    {
      key: 'fat',
      label: t('macros:fat'),
      grams: targets.fat,
      share: split.fat,
      color: colors.fat,
    },
  ];

  const goBack = () => {
    router.replace({ pathname: '/onboarding/goals', params: planDraftParams(draft) });
  };

  const startTracking = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveProfile(profile);
      router.replace('/(tabs)');
    } catch {
      const message = t('onboarding:saveFailedBody');
      setSaving(false);
      setError(message);
      notifyFailure(t('onboarding:saveFailedTitle'), message);
    }
  };

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <AppHeader
        large
        title={t('onboarding:planTitle')}
        subtitle={t('onboarding:planSubtitle')}
        onBack={goBack}
      />

      <StepProgress current={3} />

      {/*
        The payoff. Nothing is drawn around it: the figure is the largest thing
        on the screen and the only accent, and the rest of the block supports it.
      */}
      <View
        accessible
        accessibilityLabel={t('onboarding:planSpoken', {
          calories: formatCount(targets.calories),
          goal: goalLabel,
          detail: goalSentence,
        })}
        style={styles.hero}
      >
        <Txt variant="label" color="muted" numberOfLines={1}>
          {goalLabel}
        </Txt>
        {/*
          A run of digits with no letters in it resolves its own direction to
          left-to-right, so a logical 'start' would pin the hero to the left
          edge of an Arabic screen while every line around it stayed right.
          The side is mirrored by hand, the way a typed number is in TextField.
        */}
        <Txt
          variant="display"
          color="accent"
          tabular
          numberOfLines={1}
          align={isRTL ? 'right' : 'left'}
          style={styles.heroValue}
        >
          {formatCount(targets.calories)}
        </Txt>
        {/* The unit carries no digits of its own, so it can sit on its own line. */}
        <Txt variant="label" color="muted" numberOfLines={1}>
          {t('onboarding:caloriesPerDay')}
        </Txt>
        <Txt color="muted" style={styles.heroNote}>
          {goalSentence}
        </Txt>
      </View>

      <View style={styles.macroBlock}>
        <View style={styles.splitBar} {...DECORATIVE}>
          {macros.map((macro) => (
            <View
              key={macro.key}
              style={{ backgroundColor: macro.color, flex: Math.max(macro.share, 0.001) }}
            />
          ))}
        </View>

        {macros.map((macro) => {
          const grams = `${formatCount(macro.grams)} ${t('units:gram')}`;
          return (
            <View
              key={macro.key}
              accessible
              accessibilityLabel={t('onboarding:macroSpoken', {
                label: macro.label,
                grams,
                percent: formatPercent(macro.share),
              })}
              style={styles.macroRow}
            >
              <View style={[styles.dot, { backgroundColor: macro.color }]} {...DECORATIVE} />
              <Txt numberOfLines={1} style={styles.macroLabel}>
                {macro.label}
              </Txt>
              {/* Grams and share share one run; as siblings they read as one number. */}
              <Txt tabular numberOfLines={1} align="end">
                {formatCount(macro.grams)}
                <Txt variant="label" color="faint">
                  {` ${t('units:gram')} · ${formatPercent(macro.share)}`}
                </Txt>
              </Txt>
            </View>
          );
        })}
      </View>

      <Section title={t('onboarding:breakdown')} gap="tight">
        <DetailRow
          label={t('onboarding:restingBurn')}
          value={formatCount(bmr)}
          unit={t('units:kcal')}
          hint={t('onboarding:restingBurnHint')}
        />
        <Divider />
        <DetailRow
          label={t('onboarding:maintenanceRow')}
          value={formatCount(maintenance)}
          unit={t('units:kcal')}
          hint={t('onboarding:maintenanceRowHint')}
        />
        <Divider />
        <DetailRow
          label={t('onboarding:bmi')}
          value={formatAmount(bmi)}
          hint={t('onboarding:bmiHint')}
          right={<Badge label={t(BMI_KEYS[category])} tone={BMI_TONE[category]} variant="plain" />}
        />
        <Divider />
        <DetailRow
          label={t('onboarding:healthyWeight')}
          // A word between the two figures, not a dash: Arabic reorders a dash
          // sitting between two numbers and the range reads back to front.
          value={t('onboarding:healthyWeightValue', {
            low: formatAmount(healthyLow),
            high: formatAmount(healthyHigh),
          })}
          unit={weightUnit}
          hint={t('onboarding:healthyWeightHint')}
        />
      </Section>

      <Txt variant="caption" color="faint" style={styles.disclaimer}>
        {t('onboarding:disclaimer')}
      </Txt>

      <View style={styles.spacer} />

      {error ? (
        <Txt variant="label" color="danger" align="center" style={styles.error}>
          {error}
        </Txt>
      ) : null}

      <Button
        label={t('onboarding:startTracking')}
        iconRight={mirrorIcon('arrow-forward', isRTL)}
        size="lg"
        fullWidth
        loading={saving}
        disabled={saving}
        onPress={() => void startTracking()}
        accessibilityHint={t('onboarding:startTrackingHint')}
        style={styles.start}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: layout.sectionGap,
  },
  heroValue: {
    marginTop: spacing.sm,
  },
  heroNote: {
    marginTop: spacing.lg,
    maxWidth: layout.maxTextWidth,
  },
  macroBlock: {
    marginTop: spacing.xl,
  },
  splitBar: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 6,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    width: '100%',
  },
  macroRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 34,
    paddingVertical: spacing.xs + 2,
  },
  dot: {
    borderRadius: radius.pill,
    height: 8,
    width: 8,
  },
  macroLabel: {
    flex: 1,
  },
  detailRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 60,
    paddingVertical: spacing.md,
  },
  detailText: {
    flex: 1,
  },
  detailHint: {
    marginTop: 2,
  },
  detailValue: {
    flexShrink: 0,
  },
  disclaimer: {
    marginTop: layout.sectionGap,
    maxWidth: layout.maxTextWidth,
  },
  spacer: {
    flexGrow: 1,
    minHeight: spacing.xxl,
  },
  error: {
    marginTop: spacing.lg,
  },
  start: {
    marginTop: spacing.xl,
  },
});
