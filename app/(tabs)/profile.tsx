import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Platform, StyleSheet, View, type ViewProps } from 'react-native';

import { ScanTrendChart } from '@/components/body/ScanTrendChart';
import { useDayText } from '@/components/history/dayText';
import { ControlSummary } from '@/components/profile/ControlSummary';
import { ProgressRate, type ProgressRateMetric } from '@/components/profile/ProgressRate';
import { RangeBar } from '@/components/profile/RangeBar';
import { SheetHeader } from '@/components/profile/SheetHeader';
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
  MeasurePicker,
  NumberField,
  OptionRow,
  Screen,
  Section,
  SegmentedControl,
  StatTile,
  Txt,
  type TxtColor,
} from '@/components/ui';
import { SCAN_METRICS, SEGMENT_LABEL_KEYS, latestScan, scanChange } from '@/domain/bodyScan';
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
import { useApp } from '@/state/AppStore';
import { layout, radius, spacing, useTheme } from '@/theme';
import type {
  ActivityLevel,
  BodyScan,
  Goal,
  PhaseKind,
  Profile,
  ScanRange,
  SegmentalValues,
  Sex,
  UnitSystem,
} from '@/types';

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

/** The band an InBody sheet prints beside the visceral fat level. */
const VISCERAL_BAND = 10;
/** Above this the sheet's own obesity line is worth qualifying. */
const BMI_OVERWEIGHT = 25;

/** The band is said in a word; the tone only tints that word. */
const BMI_TONE: Record<BmiCategory, 'default' | 'warning' | 'danger'> = {
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
 * The composition table, in the order the machine prints it: what the body is
 * made of, finishing with the weight those parts add up to.
 */
const COMPOSITION_ROWS = [
  { key: 'totalBodyWaterL', labelKey: 'rowWater', unit: 'litre', decimals: 1 },
  { key: 'proteinKg', labelKey: 'rowProtein', unit: 'kg', decimals: 1 },
  { key: 'mineralsKg', labelKey: 'rowMinerals', unit: 'kg', decimals: 2 },
  { key: 'bodyFatKg', labelKey: 'rowFatMass', unit: 'kg', decimals: 1 },
  { key: 'weightKg', labelKey: 'rowWeight', unit: 'kg', decimals: 1 },
] as const satisfies readonly {
  key: 'totalBodyWaterL' | 'proteinKg' | 'mineralsKg' | 'bodyFatKg' | 'weightKg';
  labelKey: string;
  unit: 'kg' | 'litre';
  decimals: number;
}[];

/** Muscle-fat analysis: the same three figures the machine draws on one scale. */
const MUSCLE_FAT_ROWS = [
  { key: 'weightKg', labelKey: 'rowWeight', unit: 'kg', decimals: 1 },
  { key: 'skeletalMuscleKg', labelKey: 'rowMuscle', unit: 'kg', decimals: 1 },
  { key: 'bodyFatKg', labelKey: 'rowFatMass', unit: 'kg', decimals: 1 },
] as const satisfies readonly {
  key: 'weightKg' | 'skeletalMuscleKg' | 'bodyFatKg';
  labelKey: string;
  unit: 'kg';
  decimals: number;
}[];

/** Segments in the order the sheet stacks them. */
const SEGMENT_ORDER = ['rightArm', 'leftArm', 'trunk', 'rightLeg', 'leftLeg'] as const;

/**
 * What a rate over time is worth reading. Every one of these also exists on a
 * ScanChange, so the span can be printed without a second lookup.
 */
const PROGRESS_KEYS = [
  'weightKg',
  'skeletalMuscleKg',
  'bodyFatKg',
  'bodyFatPercent',
  'inBodyScore',
] as const;

type ProgressKey = (typeof PROGRESS_KEYS)[number];

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

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Where a BMI value sits on the drawn scale, as a 0..1 fraction. */
const bmiOffset = (value: number) =>
  clamp01((value - BMI_SCALE.min) / (BMI_SCALE.max - BMI_SCALE.min));

/** True when a value sits above the band the sheet printed for it. */
const aboveBand = (value: number | undefined, range: ScanRange | undefined) =>
  value !== undefined && range !== undefined && value > range.max;

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

/** The oldest reading, by calendar day then by time taken. */
function firstScan(scans: BodyScan[]): BodyScan | null {
  let first: BodyScan | null = null;
  for (const scan of scans) {
    if (
      first === null ||
      scan.date < first.date ||
      (scan.date === first.date && scan.takenAt < first.takenAt)
    ) {
      first = scan;
    }
  }
  return first;
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
 * One printed line of the sheet: a label and the figure beside it, with the
 * band or caveat the machine prints underneath when there is one.
 */
function ReadingRow({
  label,
  value,
  unit,
  decimals,
  note,
}: {
  label: string;
  value: number;
  /** Already translated; empty for a bare index such as a level or a ratio. */
  unit?: string;
  decimals: number;
  note?: string;
}) {
  const { t } = useTranslation('profile');
  const shown = formatAmount(value, decimals);

  return (
    <View
      accessible
      accessibilityLabel={t('rowSpoken', { label, value: shown, unit: unit ?? '' }).trim()}
      style={styles.readingRow}
    >
      <View style={styles.readingHead}>
        <Txt numberOfLines={2} style={styles.readingLabel}>
          {label}
        </Txt>
        {/* The figure and its unit are one run: as siblings Arabic reorders them. */}
        <Txt tabular numberOfLines={1} align="end" style={styles.readingValue}>
          {shown}
          {unit ? (
            <Txt variant="label" color="faint">
              {` ${unit}`}
            </Txt>
          ) : null}
        </Txt>
      </View>
      {note ? (
        <Txt variant="caption" color="faint" numberOfLines={2} style={styles.readingNote}>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * One group of the segmental table: five parts, each with its mass and how
 * that compares with the ideal the machine works out for this height.
 */
function SegmentalTable({
  mass,
  percent,
  unit,
}: {
  mass: SegmentalValues;
  percent?: SegmentalValues;
  unit: string;
}) {
  const { t } = useTranslation(['profile', 'body']);

  const rows = SEGMENT_ORDER.flatMap((key) => {
    const value = mass[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return [];
    return [{ key, part: t(SEGMENT_LABEL_KEYS[key]), value, share: percent?.[key] }];
  });

  if (rows.length === 0) return null;

  const hasShare = rows.some((row) => row.share !== undefined);

  return (
    <View>
      {hasShare ? (
        <View style={styles.segHead} {...DECORATIVE}>
          <Txt variant="caption" color="faint" align="end" numberOfLines={1}>
            {t('segmentalIdeal')}
          </Txt>
        </View>
      ) : null}

      {rows.map((row, index) => (
        <View key={row.key}>
          {index > 0 ? <Divider /> : null}
          <View
            accessible
            accessibilityLabel={
              row.share === undefined
                ? t('segmentalSpokenPlain', {
                    part: row.part,
                    value: formatAmount(row.value, 2),
                    unit,
                  })
                : t('segmentalSpoken', {
                    part: row.part,
                    value: formatAmount(row.value, 2),
                    unit,
                    percent: formatAmount(row.share, 1),
                  })
            }
            style={styles.segRow}
          >
            <Txt numberOfLines={1} style={styles.segLabel}>
              {row.part}
            </Txt>
            {/* Mass and unit in one run, share and its sign in another: two
                numbers as siblings collide into one in Arabic. */}
            <Txt tabular numberOfLines={1} align="end" style={styles.segValue}>
              {formatAmount(row.value, 2)}
              <Txt variant="label" color="faint">
                {` ${unit}`}
              </Txt>
            </Txt>
            <Txt
              variant="label"
              color="muted"
              tabular
              numberOfLines={1}
              align="end"
              style={styles.segShare}
            >
              {row.share === undefined ? '—' : formatPercent(row.share / 100, 1)}
            </Txt>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function ProfileScreen() {
  const { ready, profile, activePhase, weights, bodyScans, updateProfile, logWeight } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation(['profile', 'units', 'macros', 'body']);
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

  const sheet = useMemo(() => latestScan(bodyScans), [bodyScans]);
  const previousSheet = useMemo(
    () => (sheet ? latestScan(bodyScans.filter((scan) => scan.id !== sheet.id)) : null),
    [bodyScans, sheet],
  );
  const oldestSheet = useMemo(() => firstScan(bodyScans), [bodyScans]);
  const trendScans = useMemo(
    () =>
      [...bodyScans].sort((a, b) =>
        a.date === b.date ? a.takenAt.localeCompare(b.takenAt) : a.date.localeCompare(b.date),
      ),
    [bodyScans],
  );

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
  /* A reading is printed in the machine's units, whatever the screen is set to. */
  const sheetMassUnit = t('units:kg');
  const sheetWaterUnit = t('units:litre');
  const percentUnit = t('units:percent');

  const plan = planTargets ?? macroTargets(profile);
  const split = macroEnergySplit(plan);
  const automaticTarget = calorieTarget({ ...profile, customCalorieTarget: undefined });
  /* What the profile alone says, override included: the figure this screen
     showed before a phase took the target over. */
  const profileTarget = calorieTarget(profile);
  const bmr = basalMetabolicRate(profile);
  const maintenance = totalDailyEnergyExpenditure(profile);
  const bmi = sheet?.bmi ?? bodyMassIndex(profile.heightCm, profile.weightKg);
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

  /* ------------------------------------------------------- the sheet -- */

  const sheetDay = sheet ? dayText.dayLabel(sheet.date) : '';

  const sheetFacts = sheet
    ? [
        t(profile.sex === 'female' ? 'female' : 'male'),
        `${formatCount(sheet.age ?? profile.age)} ${t('units:years')}`,
        t('heightMetric', { value: formatCount(sheet.heightCm ?? profile.heightCm) }),
      ]
    : [];

  /** True while the four fields still hold what the newest reading printed. */
  const fieldsFromSheet =
    sheet !== null &&
    profile.weightKg === roundTenth(sheet.weightKg) &&
    (sheet.heightCm === undefined || profile.heightCm === Math.round(sheet.heightCm)) &&
    (sheet.age === undefined || profile.age === Math.round(sheet.age));

  const compositionRows = sheet
    ? COMPOSITION_ROWS.flatMap((row) => {
        const value = sheet[row.key];
        if (value === undefined) return [];
        return [
          {
            key: row.key,
            label: t(row.labelKey),
            value,
            decimals: row.decimals,
            unit: row.unit === 'litre' ? sheetWaterUnit : sheetMassUnit,
            range: sheet.ranges?.[row.key],
          },
        ];
      })
    : [];

  const muscleFatRows = sheet
    ? MUSCLE_FAT_ROWS.flatMap((row) => {
        const value = sheet[row.key];
        return value === undefined
          ? []
          : [{ key: row.key, label: t(row.labelKey), value, decimals: row.decimals }];
      })
    : [];

  /* BMI alone cannot tell muscle from fat, and on this sheet that is not a
     throwaway caveat: the protein and minerals above their bands are exactly
     what the index is counting as excess weight. */
  const buildAboveNormal =
    sheet !== null &&
    bmi >= BMI_OVERWEIGHT &&
    aboveBand(sheet.proteinKg, sheet.ranges?.proteinKg) &&
    aboveBand(sheet.mineralsKg, sheet.ranges?.mineralsKg);

  const progressMetrics = (change: ReturnType<typeof scanChange>): ProgressRateMetric[] =>
    PROGRESS_KEYS.flatMap((key: ProgressKey) => {
      const delta = change[key];
      if (delta === undefined) return [];
      const def = SCAN_METRICS.find((metric) => metric.key === key);
      if (!def) return [];
      return [
        {
          key,
          label: t(def.labelKey),
          delta,
          decimals: def.decimals,
          unit: def.unitKey ? t(def.unitKey) : '',
          higherIsBetter: def.higherIsBetter,
        },
      ];
    });

  const sincePrevious = sheet && previousSheet ? scanChange(previousSheet, sheet) : null;
  const sinceFirst =
    sheet && oldestSheet && previousSheet && oldestSheet.id !== previousSheet.id
      ? scanChange(oldestSheet, sheet)
      : null;

  const bmiBlock = (
    <>
      <View style={styles.bmiHeader}>
        <Txt
          accessible
          accessibilityLabel={t('bmiSpoken', {
            value: formatAmount(bmi),
            category: categoryLabel,
          })}
          variant="metric"
          tabular
          numberOfLines={1}
        >
          {formatAmount(bmi)}
          {/* The unit ends in a digit, so it must never be a separate element. */}
          <Txt variant="label" color="faint">
            {` ${t('bmiUnit')}`}
          </Txt>
        </Txt>
        <Badge label={categoryLabel} tone={BMI_TONE[category]} variant="plain" />
      </View>

      {/* A value scale: the bands and the marker both follow the reading
          direction, so they can never drift apart in Arabic. The healthy
          band is picked out in neutral ink, not in the accent — the plan
          below is the one thing on this screen allowed to be green. */}
      <View style={styles.bmiScale} {...DECORATIVE}>
        <View style={styles.bmiTrack}>
          {BMI_BANDS.map((band) => (
            <View
              key={band.key}
              style={{
                backgroundColor: band.healthy ? colors.borderStrong : colors.track,
                flex: band.to - band.from,
              }}
            />
          ))}
        </View>
        <View
          style={[
            styles.bmiMarker,
            { backgroundColor: colors.text, start: `${bmiOffset(bmi) * 100}%` },
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
            style={[styles.bmiTick, { start: `${bmiOffset(tick) * 100}%` }]}
          >
            {formatAmount(tick)}
          </Txt>
        ))}
      </View>
    </>
  );

  const scanLinks = (
    <View style={styles.linkList}>
      <Divider />
      <ListRow
        title={t('scanHistory')}
        subtitle={t('scanHistoryHint')}
        chevron
        onPress={() => router.push('/body')}
      />
      <Divider />
      <ListRow
        title={t('scanAdd')}
        subtitle={t('scanAddHint')}
        chevron
        onPress={() => router.push('/body/import')}
      />
    </View>
  );

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

      {/* ----------------------------------------------------- the sheet -- */}
      {sheet ? (
        <>
          <Section first>
            <SheetHeader
              dayLabel={sheetDay}
              device={sheet.device}
              facts={sheetFacts}
              note={t('sheetUnitsNote')}
            />
          </Section>

          {compositionRows.length > 0 ? (
            <Section title={t('compositionTitle')} subtitle={t('compositionHint')}>
              {compositionRows.map((row) => (
                <RangeBar
                  key={row.key}
                  label={row.label}
                  value={row.value}
                  decimals={row.decimals}
                  unit={row.unit}
                  range={row.range}
                />
              ))}
            </Section>
          ) : null}

          {muscleFatRows.length > 0 ? (
            <Section title={t('muscleFatTitle')} subtitle={t('muscleFatHint')}>
              {muscleFatRows.map((row, index) => (
                <View key={row.key}>
                  {index > 0 ? <Divider /> : null}
                  <ReadingRow
                    label={row.label}
                    value={row.value}
                    unit={sheetMassUnit}
                    decimals={row.decimals}
                  />
                </View>
              ))}
            </Section>
          ) : null}

          <Section title={t('obesityTitle')} subtitle={t('obesityHint')}>
            {bmiBlock}

            <Txt variant="label" color="muted" style={styles.bmiCopy}>
              {buildAboveNormal
                ? `${t('obesityNote')} ${t('obesityNoteAbove', { value: formatAmount(bmi) })}`
                : t('obesityNote')}
            </Txt>

            <View style={styles.sheetRows}>
              {sheet.bodyFatPercent === undefined ? null : (
                <ReadingRow
                  label={t('obesityFatPercent')}
                  value={sheet.bodyFatPercent}
                  unit={percentUnit}
                  decimals={1}
                />
              )}
              {sheet.waistHipRatio === undefined ? null : (
                <>
                  <Divider />
                  <ReadingRow
                    label={t('waistHipTitle')}
                    value={sheet.waistHipRatio}
                    decimals={2}
                  />
                </>
              )}
              {sheet.visceralFatLevel === undefined ? null : (
                <>
                  <Divider />
                  <ReadingRow
                    label={t('rowVisceral')}
                    value={sheet.visceralFatLevel}
                    decimals={0}
                    note={t('visceralBand', { value: formatCount(VISCERAL_BAND) })}
                  />
                </>
              )}
            </View>
          </Section>

          {sheet.segmentalLeanKg ? (
            <Section title={t('segmentalLeanTitle')} subtitle={t('segmentalHint')}>
              <SegmentalTable
                mass={sheet.segmentalLeanKg}
                percent={sheet.segmentalLeanPercent}
                unit={sheetMassUnit}
              />
            </Section>
          ) : null}

          {sheet.segmentalFatKg ? (
            <Section title={t('segmentalFatTitle')}>
              <SegmentalTable
                mass={sheet.segmentalFatKg}
                percent={sheet.segmentalFatPercent}
                unit={sheetMassUnit}
              />
            </Section>
          ) : null}

          <Section title={t('scoreTitle')} subtitle={t('scoreHint')}>
            <ControlSummary
              score={sheet.inBodyScore}
              targetWeightKg={sheet.targetWeightKg}
              weightControlKg={sheet.weightControlKg}
              fatControlKg={sheet.fatControlKg}
              muscleControlKg={sheet.muscleControlKg}
              unit={sheetMassUnit}
            />
          </Section>

          <Section title={t('progressTitle')} subtitle={t('progressHint')}>
            {sincePrevious === null ? (
              <Txt color="muted" style={styles.paragraph}>
                {t('progressNone')}
              </Txt>
            ) : (
              <>
                <ProgressRate
                  title={t('progressSincePrevious', {
                    day: dayText.shortDay(sincePrevious.fromDate),
                  })}
                  days={sincePrevious.days}
                  metrics={progressMetrics(sincePrevious)}
                />

                {sinceFirst === null ? null : (
                  <ProgressRate
                    title={t('progressSinceFirst', { day: dayText.shortDay(sinceFirst.fromDate) })}
                    days={sinceFirst.days}
                    metrics={progressMetrics(sinceFirst)}
                    style={styles.secondSpan}
                  />
                )}

                <Txt variant="label" weight="semibold" style={styles.chartTitle}>
                  {t('progressChartTitle')}
                </Txt>
                <ScanTrendChart scans={trendScans} />
              </>
            )}

            {scanLinks}
          </Section>
        </>
      ) : null}

      {/* --------------------------------------------------------- inputs -- */}
      <Section
        first={sheet === null}
        title={t('aboutTitle')}
        subtitle={
          fieldsFromSheet ? t('aboutFromScan', { day: sheetDay }) : t('aboutHint')
        }
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
              <Txt variant="display" color="accent" tabular numberOfLines={1}>
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
              {activePhase ? (
                <Badge label={phaseKindLabel} tone="accent" variant="plain" />
              ) : null}
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

        {sheet ? (
          <Txt variant="label" color="muted" tabular style={styles.bmiCopy}>
            {healthyRangeLine}
          </Txt>
        ) : null}

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

      {/* ------------------------------------------- no reading: as before -- */}
      {sheet === null ? (
        <>
          <Section title={t('bmiTitle')} subtitle={t('bmiHint')}>
            {bmiBlock}
            <Txt variant="label" color="muted" style={styles.bmiCopy}>
              {`${healthyRangeLine} ${t('bmiCaveat')}`}
            </Txt>
          </Section>

          <Section title={t('scanTitle')} subtitle={t('scanHintNone')}>
            <EmptyState
              icon="body-outline"
              title={t('scanEmptyTitle')}
              message={t('scanEmptyMessage')}
              actionLabel={t('scanEmptyAction')}
              onAction={() => router.push('/body/import')}
              compact
            />
            {scanLinks}
          </Section>
        </>
      ) : null}

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

  /* the sheet */
  readingRow: {
    minHeight: 34,
    paddingVertical: spacing.sm,
  },
  readingHead: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  readingLabel: {
    flexShrink: 1,
  },
  readingValue: {
    flexShrink: 0,
  },
  readingNote: {
    marginTop: spacing.xs,
    maxWidth: layout.maxTextWidth,
  },
  sheetRows: {
    marginTop: spacing.lg,
  },
  segHead: {
    alignItems: 'flex-end',
    marginBottom: spacing.xs,
  },
  segRow: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 34,
    paddingVertical: spacing.sm,
  },
  segLabel: {
    flex: 1,
  },
  segValue: {
    flexShrink: 0,
  },
  segShare: {
    flexShrink: 0,
    minWidth: 62,
  },
  secondSpan: {
    marginTop: spacing.xl,
  },
  chartTitle: {
    marginBottom: spacing.sm,
    marginTop: spacing.xl,
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
  bmiHeader: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bmiScale: {
    height: 18,
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  bmiTrack: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  bmiMarker: {
    borderRadius: radius.pill,
    height: 18,
    marginStart: -1,
    position: 'absolute',
    top: 0,
    width: 2,
  },
  bmiTicks: {
    height: 16,
    marginTop: spacing.sm,
  },
  bmiTick: {
    marginStart: -18,
    position: 'absolute',
    top: 0,
    width: 36,
  },
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
