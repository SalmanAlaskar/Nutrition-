import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Platform, StyleSheet, View, type ViewProps } from 'react-native';

import { useDayText } from '@/components/history/dayText';
import { BmiScale } from '@/components/profile/BmiScale';
import {
  AppHeader,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ListRow,
  LoadingView,
  MeasurePicker,
  NumberField,
  OptionRow,
  Screen,
  Section,
  SegmentedControl,
  StatTile,
  Txt,
  type BadgeTone,
  type TxtColor,
} from '@/components/ui';
import { latestScan } from '@/domain/bodyScan';
import { todayKey } from '@/domain/date';
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
import { phaseProgress, targetsForPhase } from '@/domain/phase';
import { useDirection } from '@/i18n';
import { useApp } from '@/state/AppStore';
import { layout, radius, spacing, useTheme } from '@/theme';
import type { ActivityLevel, Goal, PhaseKind, Profile, Sex, UnitSystem } from '@/types';

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

const ACTIVITY_KEYS = {
  sedentary: { title: 'activitySedentary', hint: 'activitySedentaryHint' },
  light: { title: 'activityLight', hint: 'activityLightHint' },
  moderate: { title: 'activityModerate', hint: 'activityModerateHint' },
  active: { title: 'activityActive', hint: 'activityActiveHint' },
  very_active: { title: 'activityAthlete', hint: 'activityAthleteHint' },
} as const satisfies Record<ActivityLevel, { title: string; hint: string }>;

const GOAL_ORDER: Goal[] = ['lose', 'maintain', 'gain'];

const GOAL_KEYS = {
  lose: { title: 'goalLose', hint: 'goalLoseHint' },
  maintain: { title: 'goalMaintain', hint: 'goalMaintainHint' },
  gain: { title: 'goalGain', hint: 'goalGainHint' },
} as const satisfies Record<Goal, { title: string; hint: string }>;

/** A phase is named by what it is for, in the same words the phases screen uses. */
const PHASE_KIND_KEYS = {
  cut: 'phaseKindCut',
  maintain: 'phaseKindMaintain',
  build: 'phaseKindBuild',
} as const satisfies Record<PhaseKind, string>;

const FEET_RANGE = { min: 3, max: 8 };
const INCH_RANGE = { min: 0, max: 11 };
const CUSTOM_CALORIE_RANGE = { min: 800, max: 8000 };

/** The band is said in a word; the tone only tints that word. */
const BMI_TONE: Record<BmiCategory, BadgeTone> = {
  Underweight: 'warning',
  Healthy: 'default',
  Overweight: 'warning',
  Obese: 'danger',
};

const BMI_KEYS = {
  Underweight: 'bmiUnderweight',
  Healthy: 'bmiHealthy',
  Overweight: 'bmiOverweight',
  Obese: 'bmiObese',
} as const satisfies Record<BmiCategory, string>;

/** Which picker is unfolded. Only ever one, and never one on arrival. */
type PickerId = 'age' | 'height' | 'weight';

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
 * edited above is visibly connected to the plan further down.
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

/** Gives a segmented control the same label rhythm as a text field. */
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
      <Txt variant="label" color="muted" style={styles.fieldLabel}>
        {label}
      </Txt>
      {children}
    </View>
  );
}

/**
 * Everything about you that a machine did not measure: the four fields, what
 * you do with your week, what you want your weight to do, and the plan those
 * produce. The fifth tab reports readings; this is where they get changed.
 *
 * Top to bottom the page is what you are, then what you do, then what that
 * produces — the one hairline below marks that turn.
 */
export default function ProfileEditScreen() {
  const { ready, profile, activePhase, weights, bodyScans, updateProfile, logWeight } = useApp();
  const { colors } = useTheme();
  const { isRTL } = useDirection();
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
  // Nothing is unfolded on arrival: an open wheel over the page is a scroll trap.
  const [openPicker, setOpenPicker] = useState<PickerId | null>(null);

  // The plan shown here is today's, never `selectedDate`'s: this screen explains
  // what you are eating now. A phase covering today owns it; without one it
  // falls through to the figure the profile derives on its own.
  const planTargets = profile
    ? activePhase
      ? targetsForPhase(profile, activePhase)
      : macroTargets(profile)
    : null;

  const planSignature = planTargets
    ? `${planTargets.calories}/${planTargets.protein}/${planTargets.carbs}/${planTargets.fat}`
    : null;
  const recalc = useRecalcFlash(planSignature);

  // The newest reading, for one line only: whether the fields below still hold
  // what it printed. The reading itself is read on the InBody tab.
  const sheet = useMemo(() => latestScan(bodyScans), [bodyScans]);

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

  /* The way out, whether or not this screen was pushed: opened from a link it
     has no history behind it, and a back chevron that does nothing is worse
     than none. */
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/inbody');
  };

  const header = (
    <AppHeader title={t('detailsTitle')} subtitle={t('detailsSubtitle')} onBack={goBack} />
  );

  if (!ready) {
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        <LoadingView />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen scroll edges={['top', 'bottom']}>
        {header}
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

  const plan = planTargets ?? macroTargets(profile);
  const split = macroEnergySplit(plan);
  const automaticTarget = calorieTarget({ ...profile, customCalorieTarget: undefined });
  /* What the profile alone says, override included: the figure this screen
     showed before a phase took the target over. */
  const profileTarget = calorieTarget(profile);
  const bmr = basalMetabolicRate(profile);
  const maintenance = totalDailyEnergyExpenditure(profile);
  /* The index is worked out from the two fields above, not from the newest
     reading: this screen is about the figures you typed. */
  const bmi = bodyMassIndex(profile.heightCm, profile.weightKg);
  const category = bmiCategory(bmi);
  const categoryLabel = t(BMI_KEYS[category]);
  const [healthyLowKg, healthyHighKg] = healthyWeightRangeKg(profile.heightCm);
  const healthyLow = fromKg(healthyLowKg, units);
  const healthyHigh = fromKg(healthyHighKg, units);
  const usingOverride = profileCustomTarget !== null;

  /* ------------------------------------------------------------- phase -- */

  const phaseKindLabel = activePhase ? t(PHASE_KIND_KEYS[activePhase.kind]) : '';
  const phaseToday = activePhase ? phaseProgress(activePhase, todayKey()) : null;

  /* The spine gives a running phase precedence over the typed override, so the
     override is on hold rather than gone and the screen has to say which of the
     two is actually feeding the number above. */
  const customNote =
    activePhase !== null && profileCustomTarget !== null
      ? t('customOnHold', {
          end: dayText.shortDay(activePhase.endDate),
          value: formatCount(profileCustomTarget),
        })
      : t(usingOverride ? 'customActive' : 'customIdle', {
          value: formatCount(automaticTarget),
        });

  const planSpoken = activePhase
    ? t('planSpokenPhase', {
        calories: formatCount(plan.calories),
        kind: phaseKindLabel,
      })
    : t(usingOverride ? 'planSpokenCustom' : 'planSpokenCalculated', {
        calories: formatCount(plan.calories),
      });

  const heightLabel =
    units === 'imperial'
      ? t('heightImperial', {
          feet: formatCount(cmToFeetInches(profile.heightCm).feet),
          inches: formatCount(cmToFeetInches(profile.heightCm).inches),
        })
      : t('heightMetric', { value: formatCount(profile.heightCm) });

  const healthyRangeLine = t('bmiRange', {
    height: heightLabel,
    low: formatAmount(healthyLow),
    high: formatAmount(healthyHigh),
    unit: weightUnit,
  });

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

  /** One picker unfolded at a time, and the page keeps its own scroll. */
  const pickerOpen = (id: PickerId) => ({
    open: openPicker === id,
    onOpenChange: (next: boolean) => setOpenPicker(next ? id : null),
  });

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

  const recentWeights = weights.slice(-5).reverse();
  const firstWeight = weights.length > 0 ? weights[0] : null;
  const latestWeight = weights.length > 0 ? weights[weights.length - 1] : null;
  const weightDelta =
    firstWeight && latestWeight && firstWeight.id !== latestWeight.id
      ? roundTenth(fromKg(latestWeight.weightKg, units) - fromKg(firstWeight.weightKg, units))
      : null;

  // The plan is the one accent on this screen, so a trend that agrees with the
  // goal is said in words and kept in plain text.
  const deltaColor: TxtColor = weightDelta === null || weightDelta === 0 ? 'muted' : 'text';

  const ageError =
    draft.age !== null && !inRange(draft.age, LIMITS.age.min, LIMITS.age.max)
      ? t('ageError', {
          min: formatCount(LIMITS.age.min),
          max: formatCount(LIMITS.age.max),
        })
      : undefined;

  const heightError =
    draft.heightCm !== null && !inRange(draft.heightCm, LIMITS.heightCm.min, LIMITS.heightCm.max)
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

  const sheetDay = sheet ? dayText.dayLabel(sheet.date) : '';

  /** True while the four fields still hold what the newest reading printed. */
  const fieldsFromSheet =
    sheet !== null &&
    profile.weightKg === roundTenth(sheet.weightKg) &&
    (sheet.heightCm === undefined || profile.heightCm === Math.round(sheet.heightCm)) &&
    (sheet.age === undefined || profile.age === Math.round(sheet.age));

  return (
    <Screen scroll edges={['top', 'bottom']}>
      {header}

      {/* --------------------------------------------------------- inputs -- */}
      <Section
        first
        title={t('aboutTitle')}
        subtitle={fieldsFromSheet ? t('aboutFromScan', { day: sheetDay }) : t('aboutHint')}
        contentStyle={styles.fields}
      >
        <LabeledControl label={t('units')}>
          <SegmentedControl<UnitSystem>
            options={unitOptions}
            value={units}
            onChange={(next) => void updateProfile({ units: next })}
          />
        </LabeledControl>

        <LabeledControl label={t('sex')}>
          <SegmentedControl<Sex>
            options={sexOptions}
            value={profile.sex}
            onChange={(next) => void updateProfile({ sex: next })}
          />
        </LabeledControl>

        <MeasurePicker
          label={t('age')}
          value={draft.age}
          onChange={commitAge}
          unit={t('units:years')}
          min={LIMITS.age.min}
          max={LIMITS.age.max}
          hint={ageError}
          {...pickerOpen('age')}
        />

        {units === 'imperial' ? (
          <MeasurePicker
            label={t('height')}
            value={draft.feet}
            onChange={(next) => commitImperialHeight(next, draft.inches)}
            unit={t('feetSuffix')}
            min={FEET_RANGE.min}
            max={FEET_RANGE.max}
            secondary={{
              value: draft.inches,
              onChange: (next) => commitImperialHeight(draft.feet, next),
              min: INCH_RANGE.min,
              max: INCH_RANGE.max,
              unit: t('inchesSuffix'),
            }}
            {...pickerOpen('height')}
          />
        ) : (
          <MeasurePicker
            label={t('height')}
            value={draft.heightCm}
            onChange={commitHeightCm}
            unit={t('units:cm')}
            min={LIMITS.heightCm.min}
            max={LIMITS.heightCm.max}
            hint={heightError}
            {...pickerOpen('height')}
          />
        )}

        <MeasurePicker
          label={t('weight')}
          value={draft.weight}
          onChange={commitWeight}
          unit={weightUnit}
          step={units === 'metric' ? 0.5 : 1}
          min={fromKg(LIMITS.weightKg.min, units)}
          max={fromKg(LIMITS.weightKg.max, units)}
          hint={weightError}
          {...pickerOpen('weight')}
        />
      </Section>

      <Section title={t('activityTitle')} subtitle={t('activityHint')}>
        <View style={styles.optionList}>
          {ACTIVITY_ORDER.map((level) => (
            <OptionRow
              key={level}
              title={t(ACTIVITY_KEYS[level].title)}
              subtitle={t(ACTIVITY_KEYS[level].hint)}
              selected={profile.activityLevel === level}
              onPress={() => void updateProfile({ activityLevel: level })}
            />
          ))}
        </View>
      </Section>

      <Section title={t('goalTitle')} subtitle={t('goalHint')}>
        <View style={styles.optionList}>
          {GOAL_ORDER.map((goal) => (
            <OptionRow
              key={goal}
              title={t(GOAL_KEYS[goal].title)}
              subtitle={t(GOAL_KEYS[goal].hint)}
              selected={profile.goal === goal}
              onPress={() => void updateProfile({ goal })}
            />
          ))}
        </View>
      </Section>

      {/* --------------------------------------------------------- output -- */}
      {/*
        Everything above is either measured or something you set; everything
        below is what those produce. The hairline marks that turn, and the plan
        is the one thing on this screen drawn on a surface of its own.
      */}
      <Section
        divider
        title={t('planTitle')}
        subtitle={t(activePhase ? 'planHintPhase' : 'planHint')}
      >
        <Card style={styles.planCard}>
          <View style={styles.planHeader}>
            <View accessible accessibilityLabel={planSpoken} style={styles.planNumber}>
              {/* The figure is bare digits, so it carries no direction of its
                  own and would start on the left of a box whose Arabic unit
                  below it starts on the right. The physical edge keeps the two
                  lines of this stack on the same side. */}
              <Txt
                variant="display"
                color="accent"
                tabular
                numberOfLines={1}
                align={isRTL ? 'right' : 'left'}
              >
                {formatCount(plan.calories)}
              </Txt>
              {/* The unit carries no digits, so it reads cleanly on its own line. */}
              <Txt variant="label" color="muted" numberOfLines={1}>
                {t('planUnit')}
              </Txt>
            </View>

            <View style={styles.planBadges}>
              {recalc.showing ? (
                <Animated.View style={{ opacity: recalc.opacity }}>
                  <Badge label={t('updated')} tone="accent" variant="plain" />
                </Animated.View>
              ) : null}
              {activePhase ? <Badge label={phaseKindLabel} tone="accent" variant="plain" /> : null}
              {usingOverride ? (
                <Badge
                  label={t(activePhase ? 'customHeld' : 'custom')}
                  tone={activePhase ? 'default' : 'warning'}
                  variant="plain"
                />
              ) : null}
            </View>
          </View>

          {/* Where the number came from, and the figure it replaced. Both are
              plain sentences: a number this size has to say whose it is. */}
          {activePhase ? (
            <View style={styles.planSource}>
              <Txt variant="label" color="muted">
                {t('planFromPhase', {
                  kind: phaseKindLabel,
                  start: dayText.shortDay(activePhase.startDate),
                  end: dayText.shortDay(activePhase.endDate),
                })}
              </Txt>
              <Txt variant="caption" color="faint" tabular style={styles.planSourceSecond}>
                {t('planFromProfile', { value: formatCount(profileTarget) })}
              </Txt>
            </View>
          ) : null}

          <View style={styles.splitBar} {...DECORATIVE}>
            {macroRows.map((row) => (
              <View
                key={row.key}
                style={{ backgroundColor: row.color, flex: Math.max(split[row.key], 0.001) }}
              />
            ))}
          </View>

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
              <Txt numberOfLines={1} style={styles.macroLabel}>
                {row.label}
              </Txt>
              {/* Grams, unit and share in one run: as siblings they merge. */}
              <Txt tabular numberOfLines={1} align="end">
                {formatCount(row.grams)}
                <Txt variant="label" color="faint">
                  {` ${t('units:gram')} · ${formatPercent(split[row.key])}`}
                </Txt>
              </Txt>
            </View>
          ))}
        </Card>

        <View style={styles.tileRow}>
          <StatTile
            label={t('restingBurn')}
            value={formatCount(bmr)}
            unit={t('units:kcal')}
            hint={t('restingBurnHint')}
          />
          <StatTile
            label={t('maintenance')}
            value={formatCount(maintenance)}
            unit={t('units:kcal')}
            hint={t('maintenanceHint')}
          />
        </View>

        <View style={styles.linkList}>
          <Divider />
          <ListRow
            title={t('phaseRow')}
            subtitle={
              activePhase && phaseToday
                ? t('phaseRowActive', {
                    kind: phaseKindLabel,
                    day: formatCount(phaseToday.dayNumber),
                    total: formatCount(phaseToday.totalDays),
                  })
                : t('phaseRowHint')
            }
            chevron
            onPress={() => router.push('/phases')}
          />
        </View>
      </Section>

      <Section title={t('customTitle')} gap="tight">
        <Txt variant="label" color="muted" style={styles.paragraph}>
          {customNote}
        </Txt>
        <NumberField
          value={customTarget}
          onChange={commitCustomTarget}
          suffix={t('units:kcal')}
          placeholder={formatCount(automaticTarget)}
          min={CUSTOM_CALORIE_RANGE.min}
          max={CUSTOM_CALORIE_RANGE.max}
          error={customTargetError}
          style={styles.customField}
        />
        {usingOverride ? (
          <Button
            label={t('backToCalculated')}
            onPress={clearCustomTarget}
            variant="secondary"
            size="sm"
            style={styles.inlineButton}
          />
        ) : null}
      </Section>

      {/* The index belongs to the height and weight above, so it is shown
          whether or not a reading exists — the reading has its own page, and
          the healthy band is the one place this screen says what those two
          fields imply for a target weight. */}
      <Section title={t('bmiTitle')} subtitle={t('bmiFromProfile')}>
        <BmiScale bmi={bmi} categoryLabel={categoryLabel} tone={BMI_TONE[category]} />
        <Txt variant="label" color="muted" style={styles.bmiCopy}>
          {`${healthyRangeLine} ${t('bmiCaveat')}`}
        </Txt>
      </Section>

      {/* --------------------------------------------------------- weight -- */}
      <Section title={t('weightTitle')} subtitle={t('weightHint')}>
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
            variant="secondary"
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
            <Txt color={deltaColor} tabular numberOfLines={1}>
              {formatDelta(weightDelta)}
              <Txt variant="label" color="faint">
                {` ${weightUnit}`}
              </Txt>
            </Txt>
            <Txt variant="label" color="muted" numberOfLines={1} style={styles.deltaSince}>
              {t('sinceDate', { date: dayText.shortDay(firstWeight.date) })}
            </Txt>
          </View>
        ) : (
          <Txt variant="label" color="faint" style={styles.deltaRow}>
            {weights.length === 0 ? t('weightNone') : t('weightOne')}
          </Txt>
        )}

        {recentWeights.length > 0 ? (
          <View style={styles.linkList}>
            {recentWeights.map((log) => (
              <View key={log.id}>
                <Divider />
                <ListRow
                  title={`${formatAmount(fromKg(log.weightKg, units))} ${weightUnit}`}
                  subtitle={dayText.dayLabel(log.date)}
                />
              </View>
            ))}
          </View>
        ) : null}
      </Section>

      <Section divider gap="none" contentStyle={styles.settingsRow}>
        <ListRow
          title={t('settingsRow')}
          subtitle={t('settingsRowHint')}
          chevron
          onPress={() => router.push('/settings')}
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fields: {
    rowGap: spacing.xl,
  },
  fieldLabel: {
    marginBottom: spacing.sm,
  },
  paragraph: {
    maxWidth: layout.maxTextWidth,
  },
  customField: {
    marginTop: spacing.md,
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
  linkList: {
    marginTop: spacing.lg,
  },
  settingsRow: {
    marginBottom: spacing.xl,
  },

  /* plan */
  planCard: {
    paddingBottom: spacing.md,
  },
  planHeader: {
    alignItems: 'flex-start',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  planNumber: {
    flexShrink: 1,
  },
  planBadges: {
    alignItems: 'flex-end',
    marginTop: spacing.sm,
    rowGap: spacing.xs,
  },
  planSource: {
    marginTop: spacing.md,
    maxWidth: layout.maxTextWidth,
  },
  planSourceSecond: {
    marginTop: spacing.xs,
  },
  splitBar: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 6,
    marginTop: spacing.lg,
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
  tileRow: {
    columnGap: spacing.lg,
    flexDirection: 'row',
    marginTop: spacing.xl,
  },

  /* bmi */
  bmiCopy: {
    marginTop: spacing.lg,
    maxWidth: layout.maxTextWidth,
  },

  /* weight */
  deltaRow: {
    alignItems: 'baseline',
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginTop: spacing.lg,
  },
  deltaSince: {
    flexShrink: 1,
  },
});
