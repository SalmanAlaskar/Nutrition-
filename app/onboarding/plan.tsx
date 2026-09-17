import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
import {
  GOAL_LABELS,
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
import { useApp } from '@/state/AppStore';
import { radius, spacing, useTheme } from '@/theme';
import type { Profile } from '@/types';

import { formatCount, parsePlanDraft, planDraftParams } from './_layout';

const BMI_TONE: Record<BmiCategory, BadgeTone> = {
  Underweight: 'warning',
  Healthy: 'success',
  Overweight: 'warning',
  Obese: 'danger',
};

const RING_STROKE = 9;
const RING_MIN = 64;
const RING_MAX = 96;
/** Screen gutter plus card padding, both edges. */
const RING_INSET = spacing.lg * 4;

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
  hint,
  right,
}: {
  label: string;
  value: string;
  hint: string;
  right?: React.ReactNode;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}. ${hint}`}
      style={styles.detailRow}
    >
      <View style={styles.detailText}>
        <Txt weight="medium">{label}</Txt>
        <Txt variant="caption" color="faint" style={styles.detailHint}>
          {hint}
        </Txt>
      </View>
      <View style={styles.detailValue}>
        <Txt weight="semibold" tabular>
          {value}
        </Txt>
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
        <AppHeader title="Your plan" />
        <LoadingView message="Taking you back to your body details" />
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
  const weightUnit = imperial ? 'lb' : 'kg';
  const healthyLow = imperial ? kgToLb(lowKg) : lowKg;
  const healthyHigh = imperial ? kgToLb(highKg) : highKg;

  // Read the gap off the finished target: a safety floor can soften the deficit.
  const deltaPercent =
    maintenance > 0
      ? Math.round(((targets.calories - maintenance) / maintenance) * 100)
      : 0;
  const maintenanceText = `your maintenance of ${formatCount(maintenance)} calories a day`;
  const goalSentence =
    deltaPercent === 0
      ? `Matched to ${maintenanceText}.`
      : `About ${Math.abs(deltaPercent)}% ${deltaPercent < 0 ? 'below' : 'above'} ${maintenanceText}.`;

  const ringSize = Math.round(
    Math.min(
      RING_MAX,
      Math.max(RING_MIN, (width - RING_INSET - spacing.md * 2) / 3),
    ),
  );

  const macros = [
    {
      key: 'protein',
      label: 'Protein',
      grams: targets.protein,
      share: split.protein,
      color: colors.protein,
    },
    {
      key: 'carbs',
      label: 'Carbs',
      grams: targets.carbs,
      share: split.carbs,
      color: colors.carbs,
    },
    {
      key: 'fat',
      label: 'Fat',
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
      const message =
        'Your plan could not be saved on this device. Check you have some free storage and try again.';
      setSaving(false);
      setError(message);
      notifyFailure('Could not save your plan', message);
    }
  };

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <AppHeader
        large
        title="Your plan"
        subtitle="Step 3 of 3 — what those answers work out to"
        onBack={goBack}
      />

      <Card style={styles.hero}>
        <View
          accessible
          accessibilityLabel={`${formatCount(targets.calories)} calories a day. ${GOAL_LABELS[profile.goal]}. ${goalSentence}`}
          style={styles.heroBlock}
        >
          <Txt variant="display" color="accent" tabular>
            {formatCount(targets.calories)}
          </Txt>
          <Txt variant="label" color="muted" style={styles.heroUnit}>
            calories a day
          </Txt>
          <View style={[styles.heroPill, { backgroundColor: colors.accentSoft }]}>
            <Txt variant="label" weight="semibold" color="accent">
              {GOAL_LABELS[profile.goal]}
            </Txt>
          </View>
          <Txt color="muted" align="center" style={styles.heroNote}>
            {goalSentence}
          </Txt>
        </View>

        <Divider style={styles.heroDivider} />

        <View style={styles.macroRow}>
          {macros.map((macro) => (
            <View
              key={macro.key}
              accessible
              accessibilityLabel={`${macro.label}: ${macro.grams} grams a day, ${Math.round(
                macro.share * 100,
              )} percent of your daily energy`}
              style={styles.macro}
            >
              <ProgressRing
                size={ringSize}
                strokeWidth={RING_STROKE}
                progress={macro.share}
                color={macro.color}
              >
                <Txt variant="label" weight="bold" tabular>
                  {`${macro.grams} g`}
                </Txt>
              </ProgressRing>
              <Txt variant="label" weight="semibold" style={styles.macroLabel}>
                {macro.label}
              </Txt>
              <Txt variant="caption" color="faint" tabular>
                {`${Math.round(macro.share * 100)}%`}
              </Txt>
            </View>
          ))}
        </View>

        <Txt variant="caption" color="faint" align="center" style={styles.macroNote}>
          Each ring shows that macro's share of your daily energy.
        </Txt>
      </Card>

      <Card padded={false} style={styles.details}>
        <DetailRow
          label="Resting burn"
          value={`${formatCount(bmr)} kcal`}
          hint="What your body uses at complete rest"
        />
        <Divider inset />
        <DetailRow
          label="Maintenance"
          value={`${formatCount(maintenance)} kcal`}
          hint="Resting burn scaled by your activity level"
        />
        <Divider inset />
        <DetailRow
          label="BMI"
          value={String(bmi)}
          hint="From your height and weight"
          right={<Badge label={category} tone={BMI_TONE[category]} style={styles.badge} />}
        />
        <Divider inset />
        <DetailRow
          label="Healthy weight"
          value={`${healthyLow}-${healthyHigh} ${weightUnit}`}
          hint="The 18.5 to 24.9 BMI band for your height"
        />
      </Card>

      <Txt variant="caption" color="faint" style={styles.disclaimer}>
        These are estimates from the Mifflin-St Jeor equation — a starting point
        you can adjust any time, not medical advice.
      </Txt>

      <View style={styles.spacer} />

      {error ? (
        <Txt variant="label" color="danger" align="center" style={styles.error}>
          {error}
        </Txt>
      ) : null}

      <Button
        label="Start tracking"
        iconRight="arrow-forward"
        size="lg"
        fullWidth
        loading={saving}
        disabled={saving}
        onPress={() => void startTracking()}
        accessibilityHint="Saves your plan and opens your daily log"
        style={styles.start}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: spacing.md,
  },
  heroBlock: {
    alignItems: 'center',
  },
  heroUnit: {
    marginTop: spacing.xs,
  },
  heroPill: {
    borderRadius: radius.pill,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm - 1,
  },
  heroNote: {
    marginTop: spacing.md,
  },
  heroDivider: {
    marginBottom: spacing.xl,
    marginTop: spacing.xl,
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
    marginTop: spacing.lg,
  },
  details: {
    marginTop: spacing.md,
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
