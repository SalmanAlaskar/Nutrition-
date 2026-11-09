import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View, type AccessibilityProps } from 'react-native';

import { AdherenceBar } from '@/components/dashboard/AdherenceBar';
import { HeroSummary } from '@/components/dashboard/HeroSummary';
import {
  MetricTable,
  type MetricRow,
  type MetricTone,
} from '@/components/dashboard/MetricTable';
import { InsightList } from '@/components/insights/InsightList';
import { PhaseBar } from '@/components/phase/PhaseBar';
import {
  AppHeader,
  EmptyState,
  LoadingView,
  Screen,
  Section,
  SegmentedControl,
  Txt,
  type TxtAlign,
} from '@/components/ui';
import { latestScan, scanChange, type ScanMetricKey } from '@/domain/bodyScan';
import { addDays, lastNDays, parseDateKey, todayKey } from '@/domain/date';
import { formatAmount, formatCount, formatDelta } from '@/domain/format';
import { buildInsights } from '@/domain/insights';
import { targetsForPhase } from '@/domain/phase';
import { totalMacros } from '@/domain/totals';
import {
  SESSION_ICONS,
  dayForDate,
  sessionsThisWeek,
  trainingStreak,
  weekDates,
} from '@/domain/training';
import { useDirection } from '@/i18n';
import { useApp } from '@/state/AppStore';
import { getMealsForDates, getWorkoutsForDates } from '@/storage/repository';
import { layout, radius, spacing, useTheme } from '@/theme';
import type { BodyScan, Meal, PhaseKind, SessionType, WorkoutSession } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

type RangeKey = '7' | '30' | '90';

/**
 * Days always read from storage, whatever the range is showing: the thirty-day
 * average sits on the page at every setting, and the insight engine wants a
 * fortnight behind it.
 */
const MIN_LOAD_DAYS = 31;

/** A logged day this close to the calorie target, either way, counts as on target. */
const ADHERENCE_BAND = 10;

/** Stands in for a figure there is no data for. */
const MISSING = '—';

/** Below this a change is noise rather than a direction. */
const FLAT = 0.05;

/**
 * Sessions a day type has to fall short by before the figure is marked. One
 * missed session is an ordinary week; the colour is saved for a real gap.
 */
const BEHIND_BY = 2;

/** The InBody score is a whole number, so anything under half a point is level. */
const FLAT_SCORE = 0.5;

/** Sunday first, the way the week runs here. */
const WEEKDAY_KEYS = [
  'weekdaySun',
  'weekdayMon',
  'weekdayTue',
  'weekdayWed',
  'weekdayThu',
  'weekdayFri',
  'weekdaySat',
] as const;

type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

const TYPE_KEYS = {
  push: 'typePush',
  pull: 'typePull',
  legs: 'typeLegs',
  upper: 'typeUpper',
  lower: 'typeLower',
  full: 'typeFull',
  cardio: 'typeCardio',
} as const satisfies Record<SessionType, string>;

/** The noun each kind of phase is called inside a sentence. */
const PHASE_KIND_KEYS = {
  cut: 'phaseKindCut',
  maintain: 'phaseKindMaintain',
  build: 'phaseKindBuild',
} as const satisfies Record<PhaseKind, string>;

type BodyMetricKey = 'weightKg' | 'skeletalMuscleKg' | 'bodyFatKg' | 'bodyFatPercent';

/** The four readings the table leads with, in the order he reads them. */
const BODY_METRICS = [
  { key: 'weightKg', labelKey: 'metricWeight', unit: 'kg', decimals: 1, higherIsBetter: null },
  {
    key: 'skeletalMuscleKg',
    labelKey: 'metricMuscle',
    unit: 'kg',
    decimals: 1,
    higherIsBetter: true,
  },
  { key: 'bodyFatKg', labelKey: 'metricFatMass', unit: 'kg', decimals: 1, higherIsBetter: false },
  {
    key: 'bodyFatPercent',
    labelKey: 'metricFatPercent',
    unit: 'percent',
    decimals: 1,
    higherIsBetter: false,
  },
] as const satisfies readonly {
  key: BodyMetricKey;
  labelKey: string;
  unit: 'kg' | 'percent';
  decimals: number;
  /** Direction of a good change, null when it depends on the goal. */
  higherIsBetter: boolean | null;
}[];

type MetricLabelKey = (typeof BODY_METRICS)[number]['labelKey'];

/** One body metric, resolved against the two most recent readings. */
interface BodyMetricData {
  key: BodyMetricKey;
  labelKey: MetricLabelKey;
  unit: 'kg' | 'percent';
  decimals: number;
  value: number | null;
  delta?: number;
  better: boolean | null;
  series: number[];
}

/** One day of the current week in the strip. */
interface WeekDay {
  date: string;
  weekdayKey: WeekdayKey;
  trained: boolean;
  scheduled: SessionType | null;
  isToday: boolean;
}

/** One session type over the range: done against what the program scheduled. */
interface SplitRowData {
  type: SessionType;
  done: number;
  scheduled: number;
}

function scanValue(scan: BodyScan, key: ScanMetricKey): number | undefined {
  const value = scan[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * A fraction, written without spaces on purpose: a lone slash between two
 * numbers binds them into one left-to-right run, so Arabic cannot reorder the
 * halves and show the denominator first.
 */
function fraction(done: number, total: number): string {
  return `${formatCount(done)}/${formatCount(total)}`;
}

export default function DashboardScreen() {
  const { t } = useTranslation(['dashboard', 'units', 'macros']);
  const { colors } = useTheme();
  const { language, isRTL } = useDirection();
  const router = useRouter();

  /**
   * The end of a figure column, resolved from the page rather than from the
   * text. The web gives every run `dir="auto"`, so a cell holding nothing but
   * digits is read left to right and a logical 'end' would send it to the
   * opposite edge from the Arabic heading above it.
   */
  const figureEnd: TxtAlign = isRTL ? 'left' : 'right';

  const {
    ready,
    profile,
    targets,
    activePhase,
    loggedDates,
    workoutDates,
    bodyScans,
    program,
    refresh,
  } = useApp();

  const [range, setRange] = useState<RangeKey>('30');
  const [mealsByDate, setMealsByDate] = useState<Record<string, Meal[]>>({});
  const [workoutsByDate, setWorkoutsByDate] = useState<Record<string, WorkoutSession[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const today = todayKey();
  const rangeDays = Number(range);

  // One stable list of keys per range, or the effect below would build a new
  // array on every render and read storage forever.
  const loadDates = useMemo(
    () => lastNDays(Math.max(rangeDays + 1, MIN_LOAD_DAYS), today),
    [rangeDays, today],
  );

  /**
   * Nutrition averages end yesterday. Today is only half eaten and it already
   * has the hero to itself; letting a day in progress into a mean would drag
   * every average down and cost a day of adherence that has not been lost yet.
   */
  const nutritionDates = useMemo(
    () => lastNDays(rangeDays, addDays(today, -1)),
    [rangeDays, today],
  );

  /**
   * Training counts today. A logged session is a finished fact the moment it is
   * saved, so leaving it out would show nothing in the split for a day the week
   * strip has already ticked off.
   */
  const trainingDates = useMemo(() => lastNDays(rangeDays, today), [rangeDays, today]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [meals, workouts] = await Promise.all([
          getMealsForDates(loadDates),
          getWorkoutsForDates(loadDates),
        ]);
        if (active) {
          setMealsByDate(meals);
          setWorkoutsByDate(workouts);
        }
      } catch (error) {
        console.warn('[dashboard] could not read the range', error);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadDates, loggedDates, workoutDates]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    (async () => {
      try {
        await refresh();
        const [meals, workouts] = await Promise.all([
          getMealsForDates(loadDates),
          getWorkoutsForDates(loadDates),
        ]);
        setMealsByDate(meals);
        setWorkoutsByDate(workouts);
      } catch (error) {
        console.warn('[dashboard] could not refresh', error);
      } finally {
        setRefreshing(false);
      }
    })();
  }, [refresh, loadDates]);

  /* ------------------------------------------------------------ nutrition -- */

  const eatenToday = useMemo(
    () => totalMacros(mealsByDate[today] ?? []).calories,
    [mealsByDate, today],
  );

  const summarise = useCallback(
    (dates: string[]) => {
      let calories = 0;
      let protein = 0;
      let logged = 0;
      let onTarget = 0;
      const target = targets?.calories ?? 0;
      const band = (target * ADHERENCE_BAND) / 100;

      for (const date of dates) {
        const meals = mealsByDate[date] ?? [];
        if (meals.length === 0) continue;
        const macros = totalMacros(meals);
        calories += macros.calories;
        protein += macros.protein;
        logged += 1;
        if (target > 0 && Math.abs(macros.calories - target) <= band) onTarget += 1;
      }

      return {
        logged,
        onTarget,
        avgCalories: logged > 0 ? Math.round(calories / logged) : 0,
        avgProtein: logged > 0 ? Math.round(protein / logged) : 0,
      };
    },
    [mealsByDate, targets],
  );

  const nutrition = useMemo(() => summarise(nutritionDates), [summarise, nutritionDates]);
  const lastWeek = useMemo(() => summarise(lastNDays(7, addDays(today, -1))), [summarise, today]);
  const lastMonth = useMemo(() => summarise(lastNDays(30, addDays(today, -1))), [summarise, today]);

  /* ----------------------------------------------------------- the phase -- */

  /**
   * The days of the range that the running phase covers. A phase that began
   * part-way through the range leaves the rest of it under the old target,
   * which is exactly what the note under the table says out loud.
   */
  const phaseDates = useMemo(() => {
    if (activePhase === null) return [];
    const { startDate, endDate } = activePhase;
    return nutritionDates.filter((date) => date >= startDate && date <= endDate);
  }, [activePhase, nutritionDates]);

  /** Averages over the phase's own days, so the figure is read against its target. */
  const phaseNutrition = useMemo(() => summarise(phaseDates), [summarise, phaseDates]);

  const phaseTargets = useMemo(
    () => (profile && activePhase ? targetsForPhase(profile, activePhase) : null),
    [profile, activePhase],
  );

  /**
   * How much of the range the phase owns: all of it, part of it, or none. It
   * decides which of two honest readings the nutrition section gives, because
   * one average measured against two different targets is not a reading.
   */
  const phaseCoverage: 'none' | 'some' | 'all' =
    phaseTargets === null || phaseDates.length === 0
      ? 'none'
      : phaseDates.length >= nutritionDates.length
        ? 'all'
        : 'some';

  /** The noun the running phase is called, e.g. "cut". */
  const phaseKind = activePhase ? t(PHASE_KIND_KEYS[activePhase.kind]) : '';

  /* ------------------------------------------------------------- training -- */

  const week = useMemo<WeekDay[]>(() => {
    const trained = new Set(workoutDates);
    return weekDates(today).map((date) => ({
      date,
      weekdayKey: WEEKDAY_KEYS[parseDateKey(date).getDay()],
      trained: trained.has(date),
      scheduled: program ? (dayForDate(program, date)?.type ?? null) : null,
      isToday: date === today,
    }));
  }, [workoutDates, program, today]);

  const training = useMemo(() => {
    const sessions = trainingDates.flatMap((date) => workoutsByDate[date] ?? []);

    // Program order first, so a day type that was never trained still gets a
    // row, then anything logged outside the program.
    const order: SessionType[] = [];
    if (program) {
      for (const day of program.days) {
        if (!order.includes(day.type)) order.push(day.type);
      }
    }
    for (const session of sessions) {
      if (!order.includes(session.type)) order.push(session.type);
    }

    const rows: SplitRowData[] = order.map((type) => ({
      type,
      done: sessions.filter((session) => session.type === type).length,
      scheduled: program
        ? trainingDates.filter((date) => dayForDate(program, date)?.type === type).length
        : 0,
    }));

    return {
      sessions: sessions.length,
      rows,
      doneThisWeek: sessionsThisWeek(workoutDates, today),
      plannedThisWeek: program
        ? weekDates(today).filter((date) => dayForDate(program, date) !== null).length
        : 0,
      streak: trainingStreak(workoutDates, today),
      // The busiest row sets the bar length, so a neglected type reads short
      // beside the one that was trained most.
      peak: rows.reduce((most, row) => Math.max(most, row.done, row.scheduled), 0),
    };
  }, [trainingDates, workoutsByDate, program, workoutDates, today]);

  const trainingEmpty = training.sessions === 0 && workoutDates.length === 0;

  /* ----------------------------------------------------------------- body -- */

  const bodyData = useMemo(() => {
    const latest = latestScan(bodyScans);
    const previous = latest ? latestScan(bodyScans.filter((scan) => scan.id !== latest.id)) : null;
    const change = latest && previous ? scanChange(previous, latest) : null;

    const ordered = [...bodyScans].sort(
      (a, b) => a.date.localeCompare(b.date) || a.takenAt.localeCompare(b.takenAt),
    );

    const metrics: BodyMetricData[] = BODY_METRICS.map((metric) => {
      const value = latest ? (scanValue(latest, metric.key) ?? null) : null;
      const delta = change ? change[metric.key] : undefined;

      return {
        key: metric.key,
        labelKey: metric.labelKey,
        unit: metric.unit,
        decimals: metric.decimals,
        value,
        delta,
        better:
          delta === undefined || metric.higherIsBetter === null
            ? null
            : delta > 0 === metric.higherIsBetter,
        series: ordered
          .map((scan) => scanValue(scan, metric.key))
          .filter((point): point is number => point !== undefined),
      };
    });

    return { latest, change, metrics };
  }, [bodyScans]);

  const score = bodyData.latest ? scanValue(bodyData.latest, 'inBodyScore') : undefined;
  const scoreDelta = bodyData.change?.inBodyScore;

  /**
   * The body table: every reading as a line of figures, the change read as a
   * direction rather than as up or down, and the InBody score as the last row
   * so the whole section is one table instead of a table and a box.
   */
  const bodyRows = useMemo<MetricRow[]>(() => {
    const rows: MetricRow[] = bodyData.metrics.map((metric) => {
      const label = t(metric.labelKey);
      const unit = metric.unit === 'kg' ? t('units:kg') : t('units:percent');
      const { delta } = metric;
      const flat = delta !== undefined && Math.abs(delta) < FLAT;
      const tone: MetricTone =
        delta === undefined || flat || metric.better === null
          ? 'neutral'
          : metric.better
            ? 'good'
            : 'poor';

      const change =
        delta === undefined
          ? t('deltaNone')
          : flat
            ? t('deltaFlat')
            : t(delta > 0 ? 'deltaUp' : 'deltaDown', {
                amount: `${formatAmount(Math.abs(delta), metric.decimals)} ${unit}`.trim(),
              });

      return {
        key: metric.key,
        label,
        value: metric.value === null ? MISSING : formatAmount(metric.value, metric.decimals),
        unit,
        delta: delta === undefined ? undefined : formatDelta(delta, metric.decimals),
        tone,
        series: metric.series,
        spoken:
          metric.value === null
            ? t('metricMissing', { label })
            : `${t('metricSpoken', {
                label,
                value: formatAmount(metric.value, metric.decimals),
                unit,
              })}. ${change}`,
      };
    });

    if (score !== undefined) {
      const flat = scoreDelta !== undefined && Math.abs(scoreDelta) < FLAT_SCORE;
      const change =
        scoreDelta === undefined
          ? t('deltaNone')
          : flat
            ? t('deltaFlat')
            : t(scoreDelta > 0 ? 'deltaUp' : 'deltaDown', {
                amount: formatCount(Math.abs(scoreDelta)),
              });

      rows.push({
        key: 'inBodyScore',
        label: t('bodyScore'),
        value: formatCount(score),
        delta: scoreDelta === undefined ? undefined : formatDelta(scoreDelta, 0),
        tone:
          scoreDelta === undefined || flat ? 'neutral' : scoreDelta > 0 ? 'good' : 'poor',
        spoken: `${t('bodyScore')}: ${formatCount(score)}. ${change}`,
      });
    }

    return rows;
  }, [bodyData.metrics, score, scoreDelta, t]);

  /**
   * The three range figures, read as the same kind of table as the body.
   *
   * With the whole range inside the phase the target beside each average is
   * the phase's, so the row says whose target it is and how far the average
   * sits from it. Nothing is mixed in that case and a second table would only
   * print the same two numbers again.
   */
  const nutritionRows = useMemo<MetricRow[]>(() => {
    /** The phase's figures, but only while it owns every day of the range. */
    const whole = phaseCoverage === 'all' ? phaseTargets : null;

    const against = (
      field: 'calories' | 'protein',
      average: number,
    ): Pick<MetricRow, 'hint' | 'delta'> => {
      if (whole !== null) {
        return {
          hint: t('phaseTargetHint', { kind: phaseKind, value: formatCount(whole[field]) }),
          delta: nutrition.logged > 0 ? formatDelta(average - whole[field], 0) : undefined,
        };
      }
      if (targets === null) return {};
      return { hint: t('targetValue', { value: formatCount(targets[field]) }) };
    };

    return [
      {
        key: 'calories',
        label: t('avgCalories'),
        value: formatCount(nutrition.avgCalories),
        unit: t('units:kcal'),
        ...against('calories', nutrition.avgCalories),
      },
      {
        key: 'protein',
        label: t('avgProtein'),
        value: formatCount(nutrition.avgProtein),
        unit: t('units:gram'),
        ...against('protein', nutrition.avgProtein),
      },
      {
        key: 'daysLogged',
        label: t('daysLogged'),
        value: fraction(nutrition.logged, rangeDays),
      },
    ];
  }, [
    t,
    nutrition.avgCalories,
    nutrition.avgProtein,
    nutrition.logged,
    targets,
    rangeDays,
    phaseCoverage,
    phaseTargets,
    phaseKind,
  ]);

  /**
   * The same two averages over the phase's days alone, for a range that only
   * partly sits inside it. Mixing days under two targets into one mean and
   * printing a single target beside it would be the quiet lie this avoids.
   */
  const phaseRows = useMemo<MetricRow[]>(() => {
    if (phaseCoverage !== 'some' || phaseTargets === null) return [];

    const row = (
      key: string,
      label: string,
      unit: string,
      average: number,
      target: number,
    ): MetricRow => {
      if (phaseNutrition.logged === 0) {
        return {
          key,
          label,
          value: MISSING,
          unit,
          hint: t('targetValue', { value: formatCount(target) }),
          tone: 'neutral',
          spoken: `${label}. ${t('phaseNoDays', { kind: phaseKind })}`,
        };
      }

      const diff = average - target;
      const amount = `${formatCount(Math.abs(diff))} ${unit}`.trim();
      const state =
        Math.round(diff) === 0
          ? t('phaseOnTarget')
          : t(diff > 0 ? 'phaseOver' : 'phaseUnder', { amount });

      return {
        key,
        label,
        value: formatCount(average),
        unit,
        hint: t('targetValue', { value: formatCount(target) }),
        delta: formatDelta(diff, 0),
        // The direction of a gap is a fact about a plan the user set, not a
        // verdict on it, so it stays the quietest ink on the row.
        tone: 'neutral',
        spoken: t('phaseRowSpoken', {
          label,
          value: formatCount(average),
          unit,
          target: formatCount(target),
          state,
        }),
      };
    };

    return [
      row(
        'phaseCalories',
        t('macros:calories'),
        t('units:kcal'),
        phaseNutrition.avgCalories,
        phaseTargets.calories,
      ),
      row(
        'phaseProtein',
        t('macros:protein'),
        t('units:gram'),
        phaseNutrition.avgProtein,
        phaseTargets.protein,
      ),
    ];
  }, [t, phaseCoverage, phaseTargets, phaseNutrition, phaseKind]);

  /** Said out loud rather than left for the reader to work out from the dates. */
  const phaseNote = useMemo(() => {
    if (phaseCoverage !== 'some') return null;
    if (phaseNutrition.logged === 0) return t('phaseNoDays', { kind: phaseKind });
    return t('phasePartial', {
      inside: formatCount(phaseDates.length),
      days: formatCount(rangeDays),
      kind: phaseKind,
    });
  }, [t, phaseCoverage, phaseNutrition.logged, phaseDates.length, rangeDays, phaseKind]);

  /* ------------------------------------------------------------- insights -- */

  const insights = useMemo(
    () =>
      buildInsights({
        profile,
        targets,
        mealsByDate,
        workoutsByDate,
        scans: bodyScans,
        loggedDates,
        workoutDates,
        today,
        program,
      }),
    [
      profile,
      targets,
      mealsByDate,
      workoutsByDate,
      bodyScans,
      loggedDates,
      workoutDates,
      today,
      program,
    ],
  );

  /* ----------------------------------------------------------------- view -- */

  const rangeOptions = useMemo(
    () => [
      { value: '7' as RangeKey, label: t('rangeWeek') },
      { value: '30' as RangeKey, label: t('rangeMonth') },
      { value: '90' as RangeKey, label: t('rangeQuarter') },
    ],
    [t],
  );

  const compareRows = useMemo(
    () => [
      { key: '7', label: t('rangeWeek'), data: lastWeek },
      { key: '30', label: t('rangeMonth'), data: lastMonth },
    ],
    [t, lastWeek, lastMonth],
  );

  const programName =
    program === null
      ? undefined
      : language === 'ar'
        ? (program.nameAr ?? program.name)
        : program.name;

  const openBody = useCallback(() => {
    router.push(bodyScans.length > 0 ? '/body' : '/body/import');
  }, [router, bodyScans.length]);

  const openOnboarding = useCallback(() => {
    router.push('/onboarding');
  }, [router]);

  const openPhases = useCallback(() => {
    router.push('/phases');
  }, [router]);

  const hasReading = bodyData.latest !== null;
  const busy = !ready || !loaded;

  return (
    <Screen scroll refreshing={refreshing} onRefresh={handleRefresh}>
      {/* No strapline under the title: the figure below it is the subject of
          the screen, and a line of prose in front of it only delays the read. */}
      <AppHeader title={t('title')} large />

      {busy ? (
        <LoadingView message={t('loading')} />
      ) : (
        <>
          <HeroSummary
            consumed={eatenToday}
            targetCalories={targets?.calories ?? null}
            onSetUpProfile={openOnboarding}
            style={styles.hero}
          />

          {/* Directly under the figure it explains: the target above comes from
              a phase the user set, and the bar says which one and until when. */}
          {activePhase && phaseTargets ? (
            <PhaseBar
              phase={activePhase}
              targets={phaseTargets}
              onPress={openPhases}
              style={styles.phaseBar}
            />
          ) : null}

          <Section
            title={t('bodyTitle')}
            subtitle={
              bodyData.change
                ? t('bodySince', { days: formatCount(bodyData.change.days) })
                : hasReading
                  ? t('bodyOnlyReading')
                  : undefined
            }
            actionLabel={hasReading ? t('bodyOpen') : undefined}
            onAction={hasReading ? openBody : undefined}
          >
            {hasReading ? (
              <MetricTable rows={bodyRows} />
            ) : (
              <EmptyState
                icon="body-outline"
                title={t('bodyEmptyTitle')}
                message={t('bodyEmptyMessage')}
                actionLabel={t('bodyEmptyAction')}
                onAction={openBody}
              />
            )}
          </Section>

          <View style={styles.range}>
            <SegmentedControl<RangeKey>
              options={rangeOptions}
              value={range}
              onChange={setRange}
            />
          </View>

          <Section title={t('trainingTitle')} subtitle={programName} style={styles.afterRange}>
            {trainingEmpty ? (
              <EmptyState
                icon="barbell-outline"
                title={t('trainingEmptyTitle')}
                message={t('trainingEmptyMessage')}
                actionLabel={t('trainingEmptyAction')}
                onAction={() => router.navigate('/(tabs)/training')}
              />
            ) : (
              <>
                <View style={styles.weekHead}>
                  <View
                    accessible
                    accessibilityLabel={t('trainingWeekSpoken', {
                      done: formatCount(training.doneThisWeek),
                      planned: formatCount(training.plannedThisWeek),
                    })}
                    style={styles.weekCount}
                  >
                    <Txt variant="metric" tabular numberOfLines={1} style={styles.weekFigure}>
                      {fraction(training.doneThisWeek, training.plannedThisWeek)}
                    </Txt>
                    <Txt variant="label" color="muted" numberOfLines={2}>
                      {t('trainingWeek')}
                    </Txt>
                  </View>

                  <Txt variant="label" color="faint" align="end" numberOfLines={2} style={styles.streak}>
                    {training.streak > 0
                      ? t('trainingStreak', { days: formatCount(training.streak) })
                      : t('trainingNoStreak')}
                  </Txt>
                </View>

                <View style={styles.week}>
                  {week.map((day) => {
                    const weekday = t(day.weekdayKey);
                    const label = day.trained
                      ? t('dayTrained', { day: weekday })
                      : day.scheduled
                        ? t('dayScheduled', {
                            day: weekday,
                            type: t(TYPE_KEYS[day.scheduled]),
                          })
                        : t('dayRest', { day: weekday });

                    return (
                      <View
                        key={day.date}
                        accessible
                        accessibilityLabel={label}
                        style={styles.weekDay}
                      >
                        <Txt variant="caption" color="faint" numberOfLines={1}>
                          {weekday}
                        </Txt>

                        <View style={styles.weekSlot} {...DECORATIVE}>
                          {day.scheduled === null && !day.trained ? (
                            <View
                              style={[styles.weekRest, { backgroundColor: colors.borderStrong }]}
                            />
                          ) : (
                            <View
                              style={[
                                styles.weekDot,
                                day.trained
                                  ? { backgroundColor: colors.text, borderColor: colors.text }
                                  : {
                                      backgroundColor: 'transparent',
                                      borderColor: day.isToday
                                        ? colors.text
                                        : colors.borderStrong,
                                    },
                              ]}
                            />
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.splitHead}>
                  <Txt variant="label" weight="semibold" numberOfLines={1} style={styles.splitTitle}>
                    {t('trainingSplit', { days: formatCount(rangeDays) })}
                  </Txt>
                  <Txt variant="caption" color="faint" numberOfLines={1}>
                    {t('trainingSplitHint')}
                  </Txt>
                </View>

                <View style={styles.splitList}>
                  {training.rows.map((row) => {
                    const behind = row.scheduled > 0 && row.scheduled - row.done >= BEHIND_BY;
                    const share = training.peak > 0 ? Math.min(1, row.done / training.peak) : 0;
                    const typeLabel = t(TYPE_KEYS[row.type]);

                    return (
                      <View
                        key={row.type}
                        accessible
                        accessibilityLabel={
                          row.scheduled > 0
                            ? t('trainingTypeSpoken', {
                                type: typeLabel,
                                done: formatCount(row.done),
                                scheduled: formatCount(row.scheduled),
                              })
                            : t('trainingTypeDoneSpoken', {
                                type: typeLabel,
                                done: formatCount(row.done),
                              })
                        }
                      >
                        <View style={styles.splitLabels}>
                          {/* The glyph is the fastest way to tell push from legs;
                              it is the only icon in this section. */}
                          <View {...DECORATIVE}>
                            <Ionicons
                              name={SESSION_ICONS[row.type] as IconName}
                              size={15}
                              color={colors.textFaint}
                            />
                          </View>
                          <Txt numberOfLines={1} style={styles.splitLabel}>
                            {typeLabel}
                          </Txt>
                          <Txt
                            variant="label"
                            color={behind ? 'warning' : 'muted'}
                            tabular
                            numberOfLines={1}
                          >
                            {row.scheduled > 0
                              ? fraction(row.done, row.scheduled)
                              : formatCount(row.done)}
                          </Txt>
                        </View>

                        <View style={[styles.bar, { backgroundColor: colors.track }]} {...DECORATIVE}>
                          <View
                            style={[
                              styles.barFill,
                              { backgroundColor: colors.textFaint, width: `${share * 100}%` },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>

                {program === null ? (
                  <Txt variant="caption" color="muted" style={styles.note}>
                    {t('trainingNoSchedule')}
                  </Txt>
                ) : null}
              </>
            )}
          </Section>

          <Section
            title={t('nutritionTitle')}
            subtitle={t('lastDays', { days: formatCount(rangeDays) })}
          >
            {nutrition.logged === 0 ? (
              <EmptyState
                icon="restaurant-outline"
                title={t('nutritionEmptyTitle')}
                message={t('nutritionEmptyMessage')}
                actionLabel={t('nutritionEmptyAction')}
                onAction={() => router.push('/meal/add')}
              />
            ) : (
              <>
                {targets ? (
                  <AdherenceBar
                    hit={nutrition.onTarget}
                    logged={nutrition.logged}
                    band={ADHERENCE_BAND}
                  />
                ) : (
                  <Txt variant="caption" color="muted">
                    {t('nutritionNoTarget')}
                  </Txt>
                )}

                <MetricTable rows={nutritionRows} style={styles.nutritionTable} />

                {phaseRows.length > 0 ? (
                  <View style={styles.phase}>
                    <Txt variant="label" weight="semibold" numberOfLines={2}>
                      {t('phaseCompare', { kind: phaseKind })}
                    </Txt>

                    {/* Which days these figures came from, before the figures,
                        so nobody reads them as the whole range. */}
                    {phaseNote ? (
                      <Txt
                        variant="caption"
                        color="muted"
                        numberOfLines={3}
                        style={styles.phaseNote}
                      >
                        {phaseNote}
                      </Txt>
                    ) : null}

                    <MetricTable rows={phaseRows} style={styles.phaseTable} />
                  </View>
                ) : null}

                <View style={styles.compare}>
                  <Txt variant="label" weight="semibold" numberOfLines={1}>
                    {t('compare')}
                  </Txt>

                  <View
                    style={[styles.compareHead, { borderColor: colors.border }]}
                    {...DECORATIVE}
                  >
                    <View style={styles.compareLabel} />
                    <Txt
                      variant="caption"
                      color="faint"
                      align={figureEnd}
                      style={styles.compareCell}
                    >
                      {t('macros:calories')}
                    </Txt>
                    <Txt
                      variant="caption"
                      color="faint"
                      align={figureEnd}
                      style={styles.compareCell}
                    >
                      {t('macros:protein')}
                    </Txt>
                  </View>

                  {compareRows.map((row) => (
                    <View
                      key={row.key}
                      accessible
                      accessibilityLabel={`${row.label}. ${t('avgCalories')} ${formatCount(
                        row.data.avgCalories,
                      )} ${t('units:kcal')}. ${t('avgProtein')} ${formatCount(
                        row.data.avgProtein,
                      )} ${t('units:gram')}`}
                      style={styles.compareRow}
                    >
                      <Txt
                        variant="label"
                        color="muted"
                        numberOfLines={1}
                        style={styles.compareLabel}
                      >
                        {row.label}
                      </Txt>
                      <Txt
                        variant="label"
                        align={figureEnd}
                        tabular
                        numberOfLines={1}
                        style={styles.compareCell}
                      >
                        {row.data.logged > 0 ? formatCount(row.data.avgCalories) : MISSING}
                      </Txt>
                      <Txt
                        variant="label"
                        align={figureEnd}
                        tabular
                        numberOfLines={1}
                        style={styles.compareCell}
                      >
                        {row.data.logged > 0 ? formatCount(row.data.avgProtein) : MISSING}
                      </Txt>
                    </View>
                  ))}
                </View>
              </>
            )}
          </Section>

          <InsightList
            insights={insights}
            title={t('insightsTitle')}
            subtitle={t('insightsSubtitle')}
            emptyMessage={t('insightsEmpty')}
            style={styles.insights}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The one figure that carries the screen gets the whole top of the page.
  hero: {
    marginTop: spacing.xl,
  },
  // Close enough to the hero to read as a caption on it rather than as a
  // section of its own.
  phaseBar: {
    marginTop: spacing.lg,
  },
  // The range control belongs to everything under it, so it sits a full
  // section away from the body table and close enough to the training heading
  // to read as its filter rather than as a floating control.
  range: {
    marginTop: layout.sectionGap,
  },
  afterRange: {
    marginTop: spacing.lg,
  },
  insights: {
    marginTop: layout.sectionGap,
  },
  note: {
    marginTop: spacing.lg,
  },

  /* training */
  weekHead: {
    alignItems: 'flex-start',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekCount: {
    flexShrink: 1,
  },
  weekFigure: {
    // A figure never shrinks or wraps to fit.
    flexShrink: 0,
    /*
      Shrink-wrapped on purpose. A run of digits carries no strong direction,
      so the web reads it left to right and a logical text alignment would pin
      it to the wrong edge of the caption below it in Arabic. Sized to its own
      content, the figure is placed by the column, which follows the page.
    */
    alignSelf: 'flex-start',
  },
  streak: {
    flexShrink: 1,
    maxWidth: '45%',
    marginTop: spacing.xs,
  },
  week: {
    columnGap: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  weekDay: {
    alignItems: 'center',
    flex: 1,
    rowGap: spacing.sm,
  },
  weekSlot: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  weekDot: {
    borderRadius: radius.pill,
    borderWidth: 1.5,
    height: 12,
    width: 12,
  },
  weekRest: {
    borderRadius: radius.pill,
    height: 2,
    width: 10,
  },
  // Nothing inside a section may open up as far as the gap between two
  // sections, or the grouping stops reading.
  splitHead: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  splitTitle: {
    flexShrink: 1,
  },
  splitList: {
    marginTop: spacing.lg,
    rowGap: spacing.lg,
  },
  splitLabels: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    minHeight: 22,
  },
  splitLabel: {
    flexGrow: 1,
    flexShrink: 1,
  },
  bar: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 3,
    marginTop: spacing.sm,
    overflow: 'hidden',
    width: '100%',
  },
  barFill: {
    height: '100%',
  },

  /* nutrition */
  nutritionTable: {
    marginTop: spacing.xl,
  },
  phase: {
    marginTop: spacing.xl,
  },
  phaseTable: {
    marginTop: spacing.lg,
  },
  // Sits under its heading the way a section subtitle does.
  phaseNote: {
    marginTop: spacing.xs,
    maxWidth: layout.maxTextWidth,
  },
  compare: {
    marginTop: spacing.xl,
  },
  compareHead: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    columnGap: spacing.md,
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  compareRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 36,
  },
  compareLabel: {
    flexGrow: 1,
    flexShrink: 1,
  },
  compareCell: {
    minWidth: 64,
  },
});
