import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Platform, StyleSheet, View, type ViewProps } from 'react-native';

import { useDayText } from '@/components/history/dayText';
import {
  AppHeader,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  IconButton,
  ListRow,
  LoadingView,
  NumberField,
  OptionRow,
  Screen,
  SegmentedControl,
  StatTile,
  Txt,
  type TxtColor,
} from '@/components/ui';
import { latestScan, scanChange } from '@/domain/bodyScan';
import { formatAmount, formatCount, formatDelta, formatPercent } from '@/domain/format';
import {
  LIMITS,
  basalMetabolicRate,
  bmiCategory,
  bodyMassIndex,
  calorieTarget,
  cmToFeetInches,
  feetInchesToCm,
  healthyWeightRangeKg,
  kgToLb,
  lbToKg,
  macroEnergySplit,
  macroTargets,
  totalDailyEnergyExpenditure,
  type BmiCategory,
} from '@/domain/nutrition';
import { useApp } from '@/state/AppStore';
import { radius, spacing, useTheme } from '@/theme';
import type { ActivityLevel, Goal, Profile, Sex, UnitSystem } from '@/types';

/**
 * Decorative nodes are hidden from assistive tech with the prop the platform
 * understands: the native pair is not valid on a DOM element.
 */
const DECORATIVE: Pick<
  ViewProps,
  'aria-hidden' | 'accessibilityElementsHidden' | 'importantForAccessibility'
> =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

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

const ACTIVITY_KEYS = {
  sedentary: { title: 'activitySedentary', hint: 'activitySedentaryHint' },
  light: { title: 'activityLight', hint: 'activityLightHint' },
  moderate: { title: 'activityModerate', hint: 'activityModerateHint' },
  active: { title: 'activityActive', hint: 'activityActiveHint' },
  very_active: { title: 'activityAthlete', hint: 'activityAthleteHint' },
} as const satisfies Record<ActivityLevel, { title: string; hint: string }>;

const GOAL_ORDER: Goal[] = ['lose', 'maintain', 'gain'];

const GOAL_ICONS: Record<Goal, string> = {
  lose: 'trending-down-outline',
  maintain: 'remove-outline',
  gain: 'trending-up-outline',
};

const GOAL_KEYS = {
  lose: { title: 'goalLose', hint: 'goalLoseHint' },
  maintain: { title: 'goalMaintain', hint: 'goalMaintainHint' },
  gain: { title: 'goalGain', hint: 'goalGainHint' },
} as const satisfies Record<Goal, { title: string; hint: string }>;

const FEET_RANGE = { min: 3, max: 8 };
const INCH_RANGE = { min: 0, max: 11 };
const CUSTOM_CALORIE_RANGE = { min: 800, max: 8000 };

const BMI_TONE: Record<BmiCategory, 'accent' | 'warning' | 'danger'> = {
  Underweight: 'warning',
  Healthy: 'accent',
  Overweight: 'warning',
  Obese: 'danger',
};

const BMI_KEYS = {
  Underweight: 'bmiUnderweight',
  Healthy: 'bmiHealthy',
  Overweight: 'bmiOverweight',
  Obese: 'bmiObese',
} as const satisfies Record<BmiCategory, string>;

/** Ends of the scale drawn under the BMI number, and the band edges inside it. */
const BMI_SCALE = { min: 15, max: 40 };
const BMI_BANDS: { key: string; from: number; to: number; healthy: boolean }[] = [
  { key: 'under', from: 15, to: 18.5, healthy: false },
  { key: 'healthy', from: 18.5, to: 25, healthy: true },
  { key: 'over', from: 25, to: 30, healthy: false },
  { key: 'high', from: 30, to: 40, healthy: false },
];
const BMI_TICKS = [18.5, 25, 30];

/**
 * The scan metrics this screen lists, in reading order. Every one of them also
 * exists on a ScanChange, so the difference since the previous reading can be
 * printed beside the value.
 */
const SCAN_ROWS = [
  { key: 'weightKg', labelKey: 'rowWeight', unit: 'kg', decimals: 1, higherIsBetter: null },
  {
    key: 'skeletalMuscleKg',
    labelKey: 'rowMuscle',
    unit: 'kg',
    decimals: 1,
    higherIsBetter: true,
  },
  { key: 'bodyFatKg', labelKey: 'rowFatMass', unit: 'kg', decimals: 1, higherIsBetter: false },
  {
    key: 'bodyFatPercent',
    labelKey: 'rowFatPercent',
    unit: 'percent',
    decimals: 1,
    higherIsBetter: false,
  },
  {
    key: 'visceralFatLevel',
    labelKey: 'rowVisceral',
    unit: 'none',
    decimals: 0,
    higherIsBetter: false,
  },
  { key: 'inBodyScore', labelKey: 'rowScore', unit: 'none', decimals: 0, higherIsBetter: true },
] as const satisfies readonly {
  key:
    | 'weightKg'
    | 'skeletalMuscleKg'
    | 'bodyFatKg'
    | 'bodyFatPercent'
    | 'visceralFatLevel'
    | 'inBodyScore';
  labelKey: string;
  unit: 'kg' | 'percent' | 'none';
  decimals: number;
  /** Direction of a good change, null when it depends on the goal. */
  higherIsBetter: boolean | null;
}[];

/** Editable copy of the numeric fields, held in whatever units are on screen. */
interface Draft {
  age: number | null;
  heightCm: number | null;
  feet: number | null;
  inches: number | null;
  weight: number | null;
}

const EMPTY_DRAFT: Draft = {
  age: null,
  heightCm: null,
  feet: null,
  inches: null,
  weight: null,
};

const roundTenth = (n: number) => Math.round(n * 10) / 10;

const toKg = (value: number, system: UnitSystem) =>
  system === 'imperial' ? lbToKg(value) : roundTenth(value);

const fromKg = (kg: number, system: UnitSystem) =>
  system === 'imperial' ? kgToLb(kg) : roundTenth(kg);

const inRange = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Where a BMI value sits on the drawn scale, as a 0..1 fraction. */
const bmiOffset = (value: number) =>
  clamp01((value - BMI_SCALE.min) / (BMI_SCALE.max - BMI_SCALE.min));

function draftFromProfile(profile: Profile | null): Draft {
  if (!profile) return EMPTY_DRAFT;
  const { feet, inches } = cmToFeetInches(profile.heightCm);
  return {
    age: profile.age,
    heightCm: profile.heightCm,
    feet,
    inches,
    weight: fromKg(profile.weightKg, profile.units),
  };
}

/**
 * Fades an "Updated" marker in whenever the signature changes, so a number
 * edited in one card is visibly connected to the plan further down.
 */
function useRecalcFlash(signature: string | null) {
  const opacity = useRef(new Animated.Value(0)).current;
  const previous = useRef<string | null>(signature);
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    if (previous.current === signature) return;
    const hadPrevious = previous.current !== null;
    previous.current = signature;
    if (!hadPrevious || signature === null) return;

    setShowing(true);
    // The browser build has no native animation module; asking for it warns.
    const native = Platform.OS !== 'web';
    const animation = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: native }),
      Animated.delay(1100),
      Animated.timing(opacity, { toValue: 0, duration: 380, useNativeDriver: native }),
    ]);
    animation.start(({ finished }) => {
      if (finished) setShowing(false);
    });
    return () => animation.stop();
  }, [signature, opacity]);

  return { opacity, showing };
}

function SectionTitle({
  title,
  hint,
  first = false,
  lead = false,
}: {
  title: string;
  hint?: string;
  /** Tightens the gap when the section sits directly under the header. */
  first?: boolean;
  /** Marks the section the inputs feed into, so the plan reads as the result. */
  lead?: boolean;
}) {
  return (
    <View style={[styles.sectionTitle, first ? styles.sectionTitleFirst : null]}>
      <Txt
        variant="caption"
        color={lead ? 'accent' : 'faint'}
        weight="semibold"
        accessibilityRole="header"
        style={styles.sectionLabel}
      >
        {title.toUpperCase()}
      </Txt>
      {hint ? (
        <Txt variant="label" color="muted" style={styles.sectionHint}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

/** Gives a segmented control the same label rhythm as a TextField. */
function LabeledControl({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: ViewProps['style'];
}) {
  return (
    <View style={style}>
      <Txt variant="label" color="muted" weight="medium" style={styles.fieldLabel}>
        {label}
      </Txt>
      {children}
    </View>
  );
}

export default function ProfileScreen() {
  const { ready, profile, targets, weights, bodyScans, updateProfile, logWeight } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation(['profile', 'units', 'macros']);
  const dayText = useDayText();

  const units: UnitSystem = profile?.units ?? 'metric';
  const profileAge = profile?.age ?? null;
  const profileHeightCm = profile?.heightCm ?? null;
  const profileWeightKg = profile?.weightKg ?? null;
  const profileCustomTarget = profile?.customCalorieTarget ?? null;
  const displayWeight = profileWeightKg === null ? null : fromKg(profileWeightKg, units);

  const [draft, setDraft] = useState<Draft>(() => draftFromProfile(profile));
  const [customTarget, setCustomTarget] = useState<number | null>(profileCustomTarget);
  const [logValue, setLogValue] = useState<number | null>(null);
  const [logging, setLogging] = useState(false);

  const planSignature = targets
    ? `${targets.calories}/${targets.protein}/${targets.carbs}/${targets.fat}`
    : null;
  const recalc = useRecalcFlash(planSignature);

  // Mirror the stored profile, but never overwrite a field whose typed value
  // still converts to exactly what is stored.
  useEffect(() => {
    setDraft((prev) => {
      if (profileAge === null || profileHeightCm === null || profileWeightKg === null) {
        return EMPTY_DRAFT;
      }
      const { feet, inches } = cmToFeetInches(profileHeightCm);
      const keepImperialHeight =
        prev.feet !== null &&
        prev.inches !== null &&
        feetInchesToCm(prev.feet, prev.inches) === profileHeightCm;
      const keepWeight = prev.weight !== null && toKg(prev.weight, units) === profileWeightKg;

      return {
        age: profileAge,
        heightCm: profileHeightCm,
        feet: keepImperialHeight ? prev.feet : feet,
        inches: keepImperialHeight ? prev.inches : inches,
        weight: keepWeight ? prev.weight : fromKg(profileWeightKg, units),
      };
    });
  }, [profileAge, profileHeightCm, profileWeightKg, units]);

  useEffect(() => {
    setCustomTarget(profileCustomTarget);
  }, [profileCustomTarget]);

  // A unit switch invalidates the pending weight entry; it is re-seeded below.
  useEffect(() => {
    setLogValue(null);
  }, [units]);

  useEffect(() => {
    setLogValue((prev) => (prev === null ? displayWeight : prev));
  }, [displayWeight]);

  if (!ready) {
    return (
      <Screen>
        <AppHeader title={t('title')} />
        <LoadingView message={t('loading')} />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen scroll>
        <AppHeader title={t('title')} />
        <EmptyState
          icon="person-add-outline"
          title={t('emptyTitle')}
          message={t('emptyMessage')}
          actionLabel={t('emptyAction')}
          onAction={() => router.replace('/onboarding')}
        />
      </Screen>
    );
  }

  const weightUnit = units === 'imperial' ? t('units:lb') : t('units:kg');
  const plan = targets ?? macroTargets(profile);
  const split = macroEnergySplit(plan);
  const automaticTarget = calorieTarget({ ...profile, customCalorieTarget: undefined });
  const bmr = basalMetabolicRate(profile);
  const maintenance = totalDailyEnergyExpenditure(profile);
  const bmi = bodyMassIndex(profile.heightCm, profile.weightKg);
  const category = bmiCategory(bmi);
  const categoryLabel = t(BMI_KEYS[category]);
  const bmiTone = BMI_TONE[category];
  const bmiToneColor =
    bmiTone === 'accent' ? colors.accent : bmiTone === 'danger' ? colors.danger : colors.warning;
  const bmiPosition = bmiOffset(bmi);
  const [healthyLowKg, healthyHighKg] = healthyWeightRangeKg(profile.heightCm);
  const healthyLow = fromKg(healthyLowKg, units);
  const healthyHigh = fromKg(healthyHighKg, units);
  const usingOverride = profileCustomTarget !== null;

  const heightLabel =
    units === 'imperial'
      ? t('heightImperial', {
          feet: formatCount(cmToFeetInches(profile.heightCm).feet),
          inches: formatCount(cmToFeetInches(profile.heightCm).inches),
        })
      : t('heightMetric', { value: formatCount(profile.heightCm) });

  const unitOptions = [
    { value: 'metric' as const, label: t('unitMetric') },
    { value: 'imperial' as const, label: t('unitImperial') },
  ];

  const sexOptions = [
    { value: 'male' as const, label: t('male') },
    { value: 'female' as const, label: t('female') },
  ];

  const macroRows = [
    { key: 'protein', label: t('macros:protein'), grams: plan.protein, color: colors.protein },
    { key: 'carbs', label: t('macros:carbs'), grams: plan.carbs, color: colors.carbs },
    { key: 'fat', label: t('macros:fat'), grams: plan.fat, color: colors.fat },
  ] as const;

  const commitAge = (value: number | null) => {
    setDraft((prev) => ({ ...prev, age: value }));
    if (value !== null && inRange(value, LIMITS.age.min, LIMITS.age.max)) {
      void updateProfile({ age: Math.round(value) });
    }
  };

  const commitHeightCm = (value: number | null) => {
    setDraft((prev) => ({ ...prev, heightCm: value }));
    if (value !== null && inRange(value, LIMITS.heightCm.min, LIMITS.heightCm.max)) {
      void updateProfile({ heightCm: Math.round(value) });
    }
  };

  const commitImperialHeight = (feet: number | null, inches: number | null) => {
    setDraft((prev) => ({ ...prev, feet, inches }));
    if (feet === null || inches === null) return;
    if (!inRange(feet, FEET_RANGE.min, FEET_RANGE.max)) return;
    if (!inRange(inches, INCH_RANGE.min, INCH_RANGE.max)) return;
    const cm = feetInchesToCm(Math.round(feet), Math.round(inches));
    if (inRange(cm, LIMITS.heightCm.min, LIMITS.heightCm.max)) {
      void updateProfile({ heightCm: cm });
    }
  };

  const commitWeight = (value: number | null) => {
    setDraft((prev) => ({ ...prev, weight: value }));
    if (value === null) return;
    const kg = toKg(value, units);
    if (inRange(kg, LIMITS.weightKg.min, LIMITS.weightKg.max)) {
      void updateProfile({ weightKg: kg });
    }
  };

  const commitCustomTarget = (value: number | null) => {
    setCustomTarget(value);
    if (value === null) {
      void updateProfile({ customCalorieTarget: undefined });
      return;
    }
    if (inRange(value, CUSTOM_CALORIE_RANGE.min, CUSTOM_CALORIE_RANGE.max)) {
      void updateProfile({ customCalorieTarget: Math.round(value) });
    }
  };

  const clearCustomTarget = () => {
    setCustomTarget(null);
    void updateProfile({ customCalorieTarget: undefined });
  };

  const pendingLogKg = logValue === null ? null : toKg(logValue, units);
  const canLogWeight =
    pendingLogKg !== null && inRange(pendingLogKg, LIMITS.weightKg.min, LIMITS.weightKg.max);

  const handleLogWeight = async () => {
    if (!canLogWeight || pendingLogKg === null) return;
    setLogging(true);
    try {
      await logWeight(pendingLogKg);
    } finally {
      setLogging(false);
    }
  };

  const latestBodyScan = latestScan(bodyScans);
  const previousBodyScan = latestBodyScan
    ? latestScan(bodyScans.filter((scan) => scan.id !== latestBodyScan.id))
    : null;
  const bodyChange =
    latestBodyScan && previousBodyScan ? scanChange(previousBodyScan, latestBodyScan) : null;
  const scanRows = latestBodyScan
    ? SCAN_ROWS.filter((row) => latestBodyScan[row.key] !== undefined)
    : [];

  const recentWeights = weights.slice(-5).reverse();
  const firstWeight = weights.length > 0 ? weights[0] : null;
  const latestWeight = weights.length > 0 ? weights[weights.length - 1] : null;
  const weightDelta =
    firstWeight && latestWeight && firstWeight.id !== latestWeight.id
      ? roundTenth(fromKg(latestWeight.weightKg, units) - fromKg(firstWeight.weightKg, units))
      : null;

  // Accent only when the trend agrees with the goal; never red for a direction.
  const deltaColor: TxtColor =
    weightDelta === null || weightDelta === 0 || profile.goal === 'maintain'
      ? 'text'
      : (profile.goal === 'lose') === (weightDelta < 0)
        ? colors.accent
        : 'text';

  const ageError =
    draft.age !== null && !inRange(draft.age, LIMITS.age.min, LIMITS.age.max)
      ? t('ageError', {
          min: formatCount(LIMITS.age.min),
          max: formatCount(LIMITS.age.max),
        })
      : undefined;

  const heightError =
    draft.heightCm !== null &&
    !inRange(draft.heightCm, LIMITS.heightCm.min, LIMITS.heightCm.max)
      ? t('heightError', {
          min: formatCount(LIMITS.heightCm.min),
          max: formatCount(LIMITS.heightCm.max),
        })
      : undefined;

  const weightError =
    draft.weight !== null &&
    !inRange(toKg(draft.weight, units), LIMITS.weightKg.min, LIMITS.weightKg.max)
      ? t('weightError', {
          min: formatAmount(fromKg(LIMITS.weightKg.min, units)),
          max: formatAmount(fromKg(LIMITS.weightKg.max, units)),
          unit: weightUnit,
        })
      : undefined;

  const customTargetError =
    customTarget !== null &&
    !inRange(customTarget, CUSTOM_CALORIE_RANGE.min, CUSTOM_CALORIE_RANGE.max)
      ? t('customError', {
          min: formatCount(CUSTOM_CALORIE_RANGE.min),
          max: formatCount(CUSTOM_CALORIE_RANGE.max),
        })
      : undefined;

  return (
    <Screen scroll>
      <AppHeader
        title={t('title')}
        subtitle={t('subtitle')}
        right={
          <IconButton
            icon="settings-outline"
            onPress={() => router.push('/settings')}
            accessibilityLabel={t('openSettings')}
          />
        }
      />

      {/* ----------------------------------------------------------- you -- */}
      <SectionTitle first title={t('aboutTitle')} hint={t('aboutHint')} />
      <Card style={styles.firstCard}>
        <LabeledControl label={t('units')}>
          <SegmentedControl<UnitSystem>
            options={unitOptions}
            value={units}
            onChange={(next) => void updateProfile({ units: next })}
          />
        </LabeledControl>

        <LabeledControl label={t('sex')} style={styles.field}>
          <SegmentedControl<Sex>
            options={sexOptions}
            value={profile.sex}
            onChange={(next) => void updateProfile({ sex: next })}
          />
        </LabeledControl>

        <NumberField
          label={t('age')}
          value={draft.age}
          onChange={commitAge}
          suffix={t('units:years')}
          min={LIMITS.age.min}
          max={LIMITS.age.max}
          error={ageError}
          style={styles.field}
        />

        {units === 'imperial' ? (
          <View style={[styles.row, styles.field]}>
            <NumberField
              label={t('heightFeet')}
              value={draft.feet}
              onChange={(next) => commitImperialHeight(next, draft.inches)}
              suffix={t('feetSuffix')}
              min={FEET_RANGE.min}
              max={FEET_RANGE.max}
              style={styles.rowItem}
            />
            <NumberField
              label={t('heightInches')}
              value={draft.inches}
              onChange={(next) => commitImperialHeight(draft.feet, next)}
              suffix={t('inchesSuffix')}
              min={INCH_RANGE.min}
              max={INCH_RANGE.max}
              style={styles.rowItem}
            />
          </View>
        ) : (
          <NumberField
            label={t('height')}
            value={draft.heightCm}
            onChange={commitHeightCm}
            suffix={t('units:cm')}
            min={LIMITS.heightCm.min}
            max={LIMITS.heightCm.max}
            error={heightError}
            style={styles.field}
          />
        )}

        <NumberField
          label={t('weight')}
          value={draft.weight}
          onChange={commitWeight}
          suffix={weightUnit}
          min={fromKg(LIMITS.weightKg.min, units)}
          max={fromKg(LIMITS.weightKg.max, units)}
          error={weightError}
          style={styles.field}
        />
      </Card>

      {/* ------------------------------------------------------ movement -- */}
      <SectionTitle title={t('activityTitle')} hint={t('activityHint')} />
      <View style={styles.optionList}>
        {ACTIVITY_ORDER.map((level) => (
          <OptionRow
            key={level}
            title={t(ACTIVITY_KEYS[level].title)}
            subtitle={t(ACTIVITY_KEYS[level].hint)}
            icon={ACTIVITY_ICONS[level]}
            selected={profile.activityLevel === level}
            onPress={() => void updateProfile({ activityLevel: level })}
          />
        ))}
      </View>

      {/* ---------------------------------------------------------- goal -- */}
      <SectionTitle title={t('goalTitle')} hint={t('goalHint')} />
      <View style={styles.optionList}>
        {GOAL_ORDER.map((goal) => (
          <OptionRow
            key={goal}
            title={t(GOAL_KEYS[goal].title)}
            subtitle={t(GOAL_KEYS[goal].hint)}
            icon={GOAL_ICONS[goal]}
            selected={profile.goal === goal}
            onPress={() => void updateProfile({ goal })}
          />
        ))}
      </View>

      {/* ---------------------------------------------------------- plan -- */}
      <Divider style={styles.planDivider} />
      <SectionTitle lead title={t('planTitle')} hint={t('planHint')} />
      <Card style={[styles.planCard, { borderColor: colors.accent }]}>
        <View style={styles.planHeader}>
          <View
            accessible
            accessibilityLabel={t(
              usingOverride ? 'planSpokenCustom' : 'planSpokenCalculated',
              { calories: formatCount(plan.calories) },
            )}
            style={styles.planNumber}
          >
            <Txt variant="display" color="accent" tabular>
              {formatCount(plan.calories)}
            </Txt>
            <Txt variant="label" color="muted" numberOfLines={1} style={styles.planUnit}>
              {t('planUnit')}
            </Txt>
          </View>

          <View style={styles.planBadges}>
            {recalc.showing ? (
              <Animated.View style={{ opacity: recalc.opacity }}>
                <Badge label={t('updated')} tone="accent" />
              </Animated.View>
            ) : null}
            <Badge
              label={usingOverride ? t('custom') : t('calculated')}
              tone={usingOverride ? 'warning' : 'default'}
            />
          </View>
        </View>

        <View style={styles.splitBar} {...DECORATIVE}>
          {macroRows.map((row) => (
            <View
              key={row.key}
              style={{ backgroundColor: row.color, flex: Math.max(split[row.key], 0.001) }}
            />
          ))}
        </View>

        <View style={styles.macroList}>
          {macroRows.map((row) => (
            <View
              key={row.key}
              accessible
              accessibilityLabel={t('macroSpoken', {
                label: row.label,
                grams: formatCount(row.grams),
                percent: formatPercent(split[row.key]),
              })}
              style={styles.macroRow}
            >
              <View style={[styles.dot, { backgroundColor: row.color }]} {...DECORATIVE} />
              <Txt weight="medium" numberOfLines={1} style={styles.macroLabel}>
                {row.label}
              </Txt>
              <Txt variant="label" color="faint" tabular>
                {formatPercent(split[row.key])}
              </Txt>
              <View style={styles.macroValue}>
                <Txt weight="semibold" tabular>
                  {formatCount(row.grams)}
                </Txt>
                <Txt variant="label" color="faint">
                  {t('units:gram')}
                </Txt>
              </View>
            </View>
          ))}
        </View>
      </Card>

      <View style={styles.tileRow}>
        <StatTile
          label={t('restingBurn')}
          value={formatCount(bmr)}
          unit={t('units:kcal')}
          hint={t('restingBurnHint')}
          icon="moon-outline"
        />
        <StatTile
          label={t('maintenance')}
          value={formatCount(maintenance)}
          unit={t('units:kcal')}
          hint={t('maintenanceHint')}
          icon="flame-outline"
        />
      </View>

      <Card style={styles.card}>
        <Txt weight="semibold">{t('customTitle')}</Txt>
        <Txt variant="label" color="muted" style={styles.paragraph}>
          {t(usingOverride ? 'customActive' : 'customIdle', {
            value: formatCount(automaticTarget),
          })}
        </Txt>
        <NumberField
          value={customTarget}
          onChange={commitCustomTarget}
          suffix={t('units:kcal')}
          placeholder={formatCount(automaticTarget)}
          min={CUSTOM_CALORIE_RANGE.min}
          max={CUSTOM_CALORIE_RANGE.max}
          error={customTargetError}
          style={styles.field}
        />
        {usingOverride ? (
          <Button
            label={t('backToCalculated')}
            onPress={clearCustomTarget}
            variant="secondary"
            size="sm"
            icon="refresh-outline"
            style={styles.inlineButton}
          />
        ) : null}
      </Card>

      {/* ----------------------------------------------------------- bmi -- */}
      <SectionTitle title={t('bmiTitle')} hint={t('bmiHint')} />
      <Card style={styles.firstCard}>
        <View style={styles.bmiHeader}>
          <View
            accessible
            accessibilityLabel={t('bmiSpoken', {
              value: formatAmount(bmi),
              category: categoryLabel,
            })}
            style={styles.bmiNumber}
          >
            <Txt variant="title" tabular>
              {formatAmount(bmi)}
            </Txt>
            <Txt variant="label" color="faint" style={styles.bmiUnit}>
              {t('bmiUnit')}
            </Txt>
          </View>
          <Badge label={categoryLabel} tone={bmiTone} />
        </View>

        {/*
          A value scale, not a layout: it runs low to high from the left in both
          languages, so the bands and the marker keep their physical order.
        */}
        <View style={styles.bmiScale} {...DECORATIVE}>
          <View style={styles.bmiTrack}>
            {BMI_BANDS.map((band) => (
              <View
                key={band.key}
                style={{
                  backgroundColor: band.healthy ? colors.accentSoft : colors.track,
                  flex: band.to - band.from,
                }}
              />
            ))}
          </View>
          <View
            style={[
              styles.bmiMarker,
              {
                backgroundColor: bmiToneColor,
                borderColor: colors.surface,
                left: `${bmiPosition * 100}%`,
              },
            ]}
          />
        </View>

        <View style={styles.bmiTicks} {...DECORATIVE}>
          {BMI_TICKS.map((tick) => (
            <Txt
              key={tick}
              variant="caption"
              color="faint"
              align="center"
              tabular
              style={[styles.bmiTick, { left: `${bmiOffset(tick) * 100}%` }]}
            >
              {formatAmount(tick)}
            </Txt>
          ))}
        </View>

        <Divider style={styles.bmiDivider} />

        <Txt variant="label" color="muted">
          {`${t('bmiRange', {
            height: heightLabel,
            low: formatAmount(healthyLow),
            high: formatAmount(healthyHigh),
            unit: weightUnit,
          })} ${t('bmiCaveat')}`}
        </Txt>
      </Card>

      {/* ----------------------------------------------- body composition -- */}
      <SectionTitle
        title={t('scanTitle')}
        hint={
          latestBodyScan
            ? latestBodyScan.device
              ? t('scanHintLastDevice', {
                  day: dayText.dayLabel(latestBodyScan.date),
                  device: latestBodyScan.device,
                })
              : t('scanHintLast', { day: dayText.dayLabel(latestBodyScan.date) })
            : t('scanHintNone')
        }
      />
      {latestBodyScan === null ? (
        <Card style={styles.firstCard}>
          <EmptyState
            icon="body-outline"
            title={t('scanEmptyTitle')}
            message={t('scanEmptyMessage')}
            actionLabel={t('scanEmptyAction')}
            onAction={() => router.push('/body/import')}
          />
        </Card>
      ) : (
        <Card style={styles.firstCard}>
          <Txt variant="label" color="muted" style={styles.scanIntro}>
            {bodyChange
              ? t(bodyChange.days === 1 ? 'scanChangeOneDay' : 'scanChange', {
                  date: dayText.shortDay(bodyChange.fromDate),
                  days: formatCount(bodyChange.days),
                })
              : t('scanFirst')}
          </Txt>

          {scanRows.map((row, index) => {
            const value = latestBodyScan[row.key];
            const delta = bodyChange ? bodyChange[row.key] : undefined;
            const better =
              delta === undefined || delta === 0 || row.higherIsBetter === null
                ? null
                : delta > 0 === row.higherIsBetter;
            const rowDeltaColor: TxtColor =
              better === null ? 'faint' : better ? colors.accent : colors.warning;
            const shown = value === undefined ? '—' : formatAmount(value, row.decimals);
            const label = t(row.labelKey);
            const unit =
              row.unit === 'kg' ? t('units:kg') : row.unit === 'percent' ? t('units:percent') : '';
            const spokenChange =
              delta === undefined
                ? ''
                : delta === 0
                  ? `. ${t('deltaFlat')}`
                  : `. ${t(delta > 0 ? 'deltaUp' : 'deltaDown', {
                      amount: formatAmount(Math.abs(delta), row.decimals),
                    })}`;

            return (
              <View key={row.key}>
                {index > 0 ? <Divider /> : null}
                <View
                  accessible
                  accessibilityLabel={`${t('rowSpoken', {
                    label,
                    value: shown,
                    unit,
                  })}${spokenChange}`}
                  style={styles.scanRow}
                >
                  <Txt weight="medium" numberOfLines={1} style={styles.scanLabel}>
                    {label}
                  </Txt>
                  <View style={styles.scanValue}>
                    <Txt weight="semibold" tabular>
                      {shown}
                    </Txt>
                    {unit ? (
                      <Txt variant="label" color="faint">
                        {unit}
                      </Txt>
                    ) : null}
                  </View>
                  <Txt
                    variant="label"
                    color={rowDeltaColor}
                    align="end"
                    tabular
                    style={styles.scanDelta}
                  >
                    {delta === undefined ? '—' : formatDelta(delta, row.decimals)}
                  </Txt>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <Card padded={false} style={styles.card}>
        <ListRow
          title={t('scanHistory')}
          subtitle={t('scanHistoryHint')}
          icon="analytics-outline"
          chevron
          onPress={() => router.push('/body')}
        />
        <Divider inset />
        <ListRow
          title={t('scanAdd')}
          subtitle={t('scanAddHint')}
          icon="add-circle-outline"
          chevron
          onPress={() => router.push('/body/import')}
        />
      </Card>

      {/* -------------------------------------------------------- weight -- */}
      <SectionTitle title={t('weightTitle')} hint={t('weightHint')} />
      <Card style={styles.firstCard}>
        <View style={styles.row}>
          <NumberField
            label={t('weightToday')}
            value={logValue}
            onChange={setLogValue}
            suffix={weightUnit}
            min={fromKg(LIMITS.weightKg.min, units)}
            max={fromKg(LIMITS.weightKg.max, units)}
            style={styles.rowItem}
          />
          <Button
            label={t('logAction')}
            onPress={() => void handleLogWeight()}
            disabled={!canLogWeight}
            loading={logging}
            icon="add-outline"
            accessibilityHint={t('logHint')}
            style={styles.logButton}
          />
        </View>

        {weightDelta !== null && firstWeight ? (
          <View
            accessible
            accessibilityLabel={t(
              weightDelta > 0
                ? 'deltaSpokenUp'
                : weightDelta < 0
                  ? 'deltaSpokenDown'
                  : 'deltaSpokenLevel',
              {
                amount: formatAmount(Math.abs(weightDelta)),
                unit: weightUnit,
                date: dayText.shortDay(firstWeight.date),
              },
            )}
            style={styles.deltaRow}
          >
            <Txt weight="semibold" color={deltaColor} tabular>
              {formatDelta(weightDelta)}
            </Txt>
            <Txt variant="label" color="faint">
              {weightUnit}
            </Txt>
            <Txt variant="label" color="muted" numberOfLines={1} style={styles.deltaSince}>
              {t('sinceDate', { date: dayText.shortDay(firstWeight.date) })}
            </Txt>
          </View>
        ) : (
          <Txt variant="label" color="faint" style={styles.deltaEmpty}>
            {weights.length === 0 ? t('weightNone') : t('weightOne')}
          </Txt>
        )}
      </Card>

      {recentWeights.length > 0 ? (
        <Card padded={false} style={styles.card}>
          {recentWeights.map((log, index) => (
            <View key={log.id}>
              {index > 0 ? <Divider inset /> : null}
              <ListRow
                title={`${formatAmount(fromKg(log.weightKg, units))} ${weightUnit}`}
                subtitle={dayText.dayLabel(log.date)}
                icon="scale-outline"
              />
            </View>
          ))}
        </Card>
      ) : null}

      <Card padded={false} style={styles.settingsCard}>
        <ListRow
          title={t('settingsRow')}
          subtitle={t('settingsRowHint')}
          icon="options-outline"
          chevron
          onPress={() => router.push('/settings')}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginBottom: spacing.sm,
    marginTop: spacing.xxl,
  },
  sectionTitleFirst: {
    marginTop: spacing.sm,
  },
  sectionLabel: {
    letterSpacing: 0.8,
  },
  sectionHint: {
    marginTop: 2,
  },
  firstCard: {
    marginTop: 0,
  },
  card: {
    marginTop: spacing.md,
  },
  settingsCard: {
    marginBottom: spacing.xl,
    marginTop: spacing.xl,
  },
  field: {
    marginTop: spacing.lg,
  },
  fieldLabel: {
    marginBottom: spacing.xs + 2,
  },
  paragraph: {
    marginTop: spacing.xs,
  },
  inlineButton: {
    marginTop: spacing.md,
  },
  row: {
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  rowItem: {
    flex: 1,
  },
  logButton: {
    marginTop: spacing.xl + spacing.xs,
  },
  optionList: {
    rowGap: spacing.sm,
  },

  /* plan */
  planDivider: {
    marginTop: spacing.xxl,
  },
  planCard: {
    borderWidth: 1,
  },
  planHeader: {
    alignItems: 'flex-start',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  planNumber: {
    alignItems: 'baseline',
    columnGap: spacing.sm,
    flexDirection: 'row',
    flexShrink: 1,
  },
  planUnit: {
    flexShrink: 1,
    marginBottom: spacing.xs,
  },
  planBadges: {
    alignItems: 'flex-end',
    marginTop: spacing.xs,
    rowGap: spacing.xs,
  },
  splitBar: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 8,
    marginTop: spacing.lg,
    overflow: 'hidden',
    width: '100%',
  },
  macroList: {
    marginTop: spacing.xs,
  },
  macroRow: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    minHeight: 34,
    paddingVertical: spacing.xs + 2,
  },
  dot: {
    borderRadius: radius.pill,
    height: 10,
    width: 10,
  },
  macroLabel: {
    flex: 1,
  },
  macroValue: {
    alignItems: 'baseline',
    columnGap: 3,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minWidth: 64,
  },
  tileRow: {
    columnGap: spacing.md,
    flexDirection: 'row',
    marginTop: spacing.md,
  },

  /* bmi */
  bmiHeader: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bmiNumber: {
    alignItems: 'baseline',
    columnGap: spacing.xs + 2,
    flexDirection: 'row',
    flexShrink: 1,
  },
  bmiUnit: {
    marginBottom: 1,
  },
  bmiScale: {
    height: 22,
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  bmiTrack: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 10,
    overflow: 'hidden',
    width: '100%',
  },
  /* Keeps the low-to-high bands under a marker positioned from the left. */
  bmiMarker: {
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 22,
    marginLeft: -4,
    position: 'absolute',
    top: 0,
    width: 8,
  },
  bmiTicks: {
    height: 16,
    marginTop: spacing.xs,
  },
  bmiTick: {
    marginLeft: -18,
    position: 'absolute',
    top: 0,
    width: 36,
  },
  bmiDivider: {
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },

  /* body composition */
  scanIntro: {
    marginBottom: spacing.sm,
  },
  scanRow: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 34,
    paddingVertical: spacing.sm,
  },
  scanLabel: {
    flex: 1,
  },
  scanValue: {
    alignItems: 'baseline',
    columnGap: 3,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minWidth: 64,
  },
  scanDelta: {
    minWidth: 52,
  },

  /* weight */
  deltaRow: {
    alignItems: 'baseline',
    columnGap: spacing.xs,
    flexDirection: 'row',
    marginTop: spacing.lg,
  },
  deltaSince: {
    flexShrink: 1,
    marginStart: spacing.xs,
  },
  deltaEmpty: {
    marginTop: spacing.lg,
  },
});
