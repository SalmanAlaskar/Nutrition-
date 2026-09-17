import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  AppHeader,
  Badge,
  Button,
  Card,
  Divider,
  LoadingView,
  ProgressRing,
  Screen,
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
import { radius, spacing, useTheme } from '@/theme';
import type { Goal, Profile } from '@/types';

import { Eyebrow, StepProgress, parsePlanDraft, planDraftParams } from './_layout';

const BMI_TONE: Record<BmiCategory, BadgeTone> = {
  Underweight: 'warning',
  Healthy: 'success',
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

const RING_STROKE = 9;
const RING_MIN = 64;
const RING_MAX = 96;
/** Screen gutter, card padding and the inner panel's padding, both edges. */
const RING_INSET = spacing.lg * 6;

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
  /** Shown after the value at label weight, so the figure stays dominant. */
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
        <Txt weight="medium">{label}</Txt>
        <Txt variant="caption" color="faint" style={styles.detailHint}>
          {hint}
        </Txt>
      </View>
      <View style={styles.detailValue}>
        <Txt weight="semibold" tabular numberOfLines={1}>
          {value}
        </Txt>
        {unit ? (
          <Txt variant="label" color="faint" numberOfLines={1}>
            {unit}
          </Txt>
        ) : null}
        {right}
      </View>
    </View>
  );
}

export default function PlanStep() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { saveProfile } = useApp();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
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

  const ringSize = Math.round(
    Math.min(
      RING_MAX,
      Math.max(RING_MIN, (width - RING_INSET - spacing.md * 2) / 3),
    ),
  );

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

      <Card style={styles.hero}>
        <View
          accessible
          accessibilityLabel={t('onboarding:planSpoken', {
            calories: formatCount(targets.calories),
            goal: goalLabel,
            detail: goalSentence,
          })}
          style={styles.heroBlock}
        >
          <View style={[styles.heroPill, { backgroundColor: colors.accentSoft }]}>
            <Txt variant="label" weight="semibold" color="accent" numberOfLines={1}>
              {goalLabel}
            </Txt>
          </View>
          <Txt
            variant="display"
            color="accent"
            tabular
            numberOfLines={1}
            style={styles.heroValue}
          >
            {formatCount(targets.calories)}
          </Txt>
          <Txt variant="label" color="muted" numberOfLines={1}>
            {t('onboarding:caloriesPerDay')}
          </Txt>
          <Txt color="muted" align="center" style={styles.heroNote}>
            {goalSentence}
          </Txt>
        </View>

        <Divider style={styles.heroDivider} />

        <View style={[styles.macroPanel, { backgroundColor: colors.surfaceAlt }]}>
          <View style={styles.macroRow}>
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
                  style={styles.macro}
                >
                  <ProgressRing
                    size={ringSize}
                    strokeWidth={RING_STROKE}
                    progress={macro.share}
                    color={macro.color}
                  >
                    <Txt variant="label" weight="bold" tabular numberOfLines={1}>
                      {grams}
                    </Txt>
                  </ProgressRing>
                  <Txt
                    variant="label"
                    weight="semibold"
                    numberOfLines={1}
                    style={styles.macroLabel}
                  >
                    {macro.label}
                  </Txt>
                  <Txt variant="caption" color="faint" tabular numberOfLines={1}>
                    {formatPercent(macro.share)}
                  </Txt>
                </View>
              );
            })}
          </View>
        </View>

        <Txt variant="caption" color="faint" align="center" style={styles.macroNote}>
          {t('onboarding:macroNote')}
        </Txt>
      </Card>

      <Eyebrow label={t('onboarding:breakdown')} style={styles.breakdown} />

      <Card padded={false}>
        <DetailRow
          label={t('onboarding:restingBurn')}
          value={formatCount(bmr)}
          unit={t('units:kcal')}
          hint={t('onboarding:restingBurnHint')}
        />
        <Divider inset />
        <DetailRow
          label={t('onboarding:maintenanceRow')}
          value={formatCount(maintenance)}
          unit={t('units:kcal')}
          hint={t('onboarding:maintenanceRowHint')}
        />
        <Divider inset />
        <DetailRow
          label={t('onboarding:bmi')}
          value={formatAmount(bmi)}
          hint={t('onboarding:bmiHint')}
          right={
            <Badge
              label={t(BMI_KEYS[category])}
              tone={BMI_TONE[category]}
              style={styles.badge}
            />
          }
        />
        <Divider inset />
        <DetailRow
          label={t('onboarding:healthyWeight')}
          value={`${formatAmount(healthyLow)}–${formatAmount(healthyHigh)}`}
          unit={weightUnit}
          hint={t('onboarding:healthyWeightHint')}
        />
      </Card>

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
    marginTop: spacing.xs,
  },
  heroBlock: {
    alignItems: 'center',
  },
  heroPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm - 1,
  },
  heroValue: {
    marginTop: spacing.md,
  },
  heroNote: {
    marginTop: spacing.md,
  },
  heroDivider: {
    marginBottom: spacing.xl,
    marginTop: spacing.xl,
  },
  macroPanel: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  macroRow: {
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  macro: {
    alignItems: 'center',
    flexShrink: 1,
  },
  macroLabel: {
    marginTop: spacing.sm,
  },
  macroNote: {
    marginTop: spacing.md,
  },
  breakdown: {
    marginBottom: spacing.sm,
    marginTop: spacing.xl,
  },
  detailRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  detailText: {
    flex: 1,
  },
  detailHint: {
    marginTop: 2,
  },
  detailValue: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  badge: {
    alignSelf: 'center',
  },
  disclaimer: {
    marginTop: spacing.lg,
  },
  spacer: {
    flexGrow: 1,
    minHeight: spacing.xl,
  },
  error: {
    marginTop: spacing.lg,
  },
  start: {
    marginTop: spacing.xl,
  },
});
