import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AdherenceRing } from '@/components/dashboard/AdherenceRing';
import { HeroSummary, type HeroBody } from '@/components/dashboard/HeroSummary';
import { MetricGrid, type MetricGridItem } from '@/components/dashboard/MetricGrid';
import { InsightList } from '@/components/insights/InsightList';
import {
  AppHeader,
  Badge,
  Card,
  Divider,
  EmptyState,
  LoadingView,
  Screen,
  SegmentedControl,
  Txt,
} from '@/components/ui';
import { latestScan, scanChange, type ScanMetricKey } from '@/domain/bodyScan';
import { addDays, lastNDays, parseDateKey, todayKey } from '@/domain/date';
import { formatCount, formatDelta } from '@/domain/format';
import { buildInsights } from '@/domain/insights';
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
import { radius, spacing, useTheme } from '@/theme';
import type { BodyScan, Meal, SessionType, WorkoutSession } from '@/types';

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

type BodyMetricKey = 'weightKg' | 'skeletalMuscleKg' | 'bodyFatKg' | 'bodyFatPercent';

/** The four readings the grid leads with, in the order he reads them. */
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

/** Section title with a caption or a badge on the trailing edge. */
function SectionHeader({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Txt
        variant="heading"
        numberOfLines={1}
        style={styles.sectionTitle}
        accessibilityRole="header"
      >
        {title}
      </Txt>
      {right ??
        (hint ? (
          <Txt variant="caption" color="faint" align="end" numberOfLines={2} style={styles.sectionHint}>
            {hint}
          </Txt>
        ) : null)}
    </View>
  );
}

/** A label, a figure, and the line that puts the figure in context. */
function StatLine({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View accessible accessibilityLabel={[label, value, hint].filter(Boolean).join('. ')}>
      <Txt variant="caption" color="faint" weight="bold" numberOfLines={1}>
        {label.toUpperCase()}
      </Txt>
      <Txt variant="heading" weight="bold" tabular numberOfLines={1}>
        {value}
      </Txt>
      {hint ? (
        <Txt variant="caption" color="muted" tabular numberOfLines={1}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export default function DashboardScreen() {
  const { t } = useTranslation(['dashboard', 'units', 'macros']);
  const { colors } = useTheme();
  const { language } = useDirection();
  const router = useRouter();

  const { ready, profile, targets, loggedDates, workoutDates, bodyScans, program, refresh } =
    useApp();

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

    const fatPercent = latest ? scanValue(latest, 'bodyFatPercent') : undefined;
    const headline: HeroBody | null =
      latest && fatPercent !== undefined
        ? {
            metric: 'bodyFat',
            value: fatPercent,
            fromScan: true,
            delta: change?.bodyFatPercent,
            days: change?.days,
          }
        : latest
          ? {
              metric: 'weight',
              value: latest.weightKg,
              fromScan: true,
              delta: change?.weightKg,
              days: change?.days,
            }
          : profile
            ? { metric: 'weight', value: profile.weightKg, fromScan: false }
            : null;

    return { latest, change, metrics, headline };
  }, [bodyScans, profile]);

  const metricItems = useMemo<MetricGridItem[]>(
    () =>
      bodyData.metrics.map((metric) => ({
        key: metric.key,
        label: t(metric.labelKey),
        value: metric.value,
        unit: metric.unit === 'kg' ? t('units:kg') : t('units:percent'),
        decimals: metric.decimals,
        delta: metric.delta,
        better: metric.better,
        series: metric.series,
      })),
    [bodyData.metrics, t],
  );

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

  const score = bodyData.latest ? scanValue(bodyData.latest, 'inBodyScore') : undefined;
  const scoreDelta = bodyData.change?.inBodyScore;
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

  const busy = !ready || !loaded;

  return (
    <Screen scroll refreshing={refreshing} onRefresh={handleRefresh}>
      <AppHeader title={t('title')} subtitle={t('subtitle')} large />

      {busy ? (
        <LoadingView message={t('loading')} />
      ) : (
        <>
          <HeroSummary
            consumed={eatenToday}
            targetCalories={targets?.calories ?? null}
            body={bodyData.headline}
            onPressBody={openBody}
            onSetUpProfile={openOnboarding}
            style={styles.hero}
          />

          <SectionHeader
            title={t('bodyTitle')}
            hint={
              bodyData.change
                ? t('bodySince', { days: formatCount(bodyData.change.days) })
                : bodyData.latest
                  ? t('bodyOnlyReading')
                  : undefined
            }
          />

          {bodyData.latest === null ? (
            <Card style={styles.block}>
              <EmptyState
                icon="body-outline"
                title={t('bodyEmptyTitle')}
                message={t('bodyEmptyMessage')}
                actionLabel={t('bodyEmptyAction')}
                onAction={() => router.push('/body/import')}
              />
            </Card>
          ) : (
            <View style={styles.block}>
              <MetricGrid items={metricItems} />

              {score === undefined ? null : (
                <View
                  accessible
                  accessibilityLabel={`${t('bodyScore')}: ${formatCount(score)}`}
                  style={[
                    styles.scoreRow,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Txt variant="label" weight="semibold" numberOfLines={1} style={styles.scoreLabel}>
                    {t('bodyScore')}
                  </Txt>
                  <Txt variant="heading" weight="bold" tabular numberOfLines={1}>
                    {formatCount(score)}
                  </Txt>
                  {scoreDelta === undefined ? null : (
                    <Txt
                      variant="label"
                      weight="semibold"
                      tabular
                      numberOfLines={1}
                      color={
                        scoreDelta === 0 ? 'faint' : scoreDelta > 0 ? colors.accent : colors.warning
                      }
                      style={styles.scoreDelta}
                    >
                      {formatDelta(scoreDelta, 0)}
                    </Txt>
                  )}
                </View>
              )}
            </View>
          )}

          <SegmentedControl<RangeKey>
            options={rangeOptions}
            value={range}
            onChange={setRange}
            style={styles.range}
          />

          <SectionHeader title={t('trainingTitle')} hint={programName} />

          <Card style={styles.block}>
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
                <View style={styles.trainingHead}>
                  <View
                    accessible
                    accessibilityLabel={t('trainingWeekSpoken', {
                      done: formatCount(training.doneThisWeek),
                      planned: formatCount(training.plannedThisWeek),
                    })}
                    style={styles.trainingCount}
                  >
                    <Txt variant="title" weight="bold" tabular numberOfLines={1}>
                      {`${formatCount(training.doneThisWeek)} / ${formatCount(
                        training.plannedThisWeek,
                      )}`}
                    </Txt>
                    <Txt
                      variant="label"
                      color="muted"
                      numberOfLines={1}
                      style={styles.trainingUnit}
                    >
                      {t('trainingWeek')}
                    </Txt>
                  </View>

                  <Badge
                    label={
                      training.streak > 0
                        ? t('trainingStreak', { days: formatCount(training.streak) })
                        : t('trainingNoStreak')
                    }
                    tone={training.streak > 0 ? 'accent' : 'default'}
                  />
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

                        {day.scheduled === null && !day.trained ? (
                          <View style={styles.weekSlot} {...DECORATIVE}>
                            <View style={[styles.weekRest, { backgroundColor: colors.border }]} />
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.weekSlot,
                              styles.weekDot,
                              day.trained
                                ? { backgroundColor: colors.accent, borderColor: colors.accent }
                                : {
                                    backgroundColor: colors.surfaceAlt,
                                    borderColor: day.isToday ? colors.accent : colors.border,
                                  },
                            ]}
                            {...DECORATIVE}
                          >
                            {day.trained ? (
                              <Ionicons name="checkmark" size={14} color={colors.accentText} />
                            ) : null}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>

                <Divider style={styles.divider} />

                <View style={styles.splitHead}>
                  <Txt
                    variant="label"
                    weight="semibold"
                    numberOfLines={1}
                    style={styles.splitTitle}
                  >
                    {t('trainingSplit', { days: formatCount(rangeDays) })}
                  </Txt>
                  <Txt variant="caption" color="faint" numberOfLines={1}>
                    {t('trainingSplitHint')}
                  </Txt>
                </View>

                <View style={styles.splitList}>
                  {training.rows.map((row) => {
                    const behind = row.scheduled > 0 && row.done < row.scheduled;
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
                        style={styles.splitRow}
                      >
                        <View
                          style={[styles.splitBubble, { backgroundColor: colors.surfaceAlt }]}
                          {...DECORATIVE}
                        >
                          <Ionicons
                            name={SESSION_ICONS[row.type] as IconName}
                            size={16}
                            color={colors.textMuted}
                          />
                        </View>

                        <View style={styles.splitBody}>
                          <View style={styles.splitLabels}>
                            <Txt weight="medium" numberOfLines={1} style={styles.splitLabel}>
                              {typeLabel}
                            </Txt>
                            <Txt
                              variant="label"
                              color={behind ? 'warning' : 'muted'}
                              tabular
                              numberOfLines={1}
                            >
                              {row.scheduled > 0
                                ? `${formatCount(row.done)} / ${formatCount(row.scheduled)}`
                                : formatCount(row.done)}
                            </Txt>
                          </View>

                          <View
                            style={[styles.bar, { backgroundColor: colors.track }]}
                            {...DECORATIVE}
                          >
                            <View
                              style={[
                                styles.barFill,
                                {
                                  backgroundColor: behind ? colors.warning : colors.accent,
                                  width: `${share * 100}%`,
                                },
                              ]}
                            />
                          </View>
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
          </Card>

          <SectionHeader
            title={t('nutritionTitle')}
            hint={t('lastDays', { days: formatCount(rangeDays) })}
          />

          <Card style={styles.block}>
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
                <View style={styles.nutritionTop}>
                  {targets ? (
                    <AdherenceRing
                      hit={nutrition.onTarget}
                      logged={nutrition.logged}
                      band={ADHERENCE_BAND}
                      style={styles.ring}
                    />
                  ) : null}

                  <View style={styles.nutritionStats}>
                    <StatLine
                      label={t('avgCalories')}
                      value={formatCount(nutrition.avgCalories)}
                      hint={
                        targets
                          ? t('targetValue', { value: formatCount(targets.calories) })
                          : undefined
                      }
                    />
                    <StatLine
                      label={t('avgProtein')}
                      value={formatCount(nutrition.avgProtein)}
                      hint={
                        targets
                          ? t('targetValue', { value: formatCount(targets.protein) })
                          : undefined
                      }
                    />
                    <StatLine
                      label={t('daysLogged')}
                      value={t('daysLoggedValue', {
                        logged: formatCount(nutrition.logged),
                        total: formatCount(rangeDays),
                      })}
                    />
                  </View>
                </View>

                {targets === null ? (
                  <Txt variant="caption" color="muted" style={styles.note}>
                    {t('nutritionNoTarget')}
                  </Txt>
                ) : null}

                <Divider style={styles.divider} />

                <Txt variant="caption" color="faint" weight="bold" style={styles.compareTitle}>
                  {t('compare').toUpperCase()}
                </Txt>

                <View style={styles.compareHead} {...DECORATIVE}>
                  <View style={styles.compareLabel} />
                  <Txt variant="caption" color="faint" align="end" style={styles.compareCell}>
                    {t('macros:calories')}
                  </Txt>
                  <Txt variant="caption" color="faint" align="end" style={styles.compareCell}>
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
                      weight="semibold"
                      align="end"
                      tabular
                      numberOfLines={1}
                      style={styles.compareCell}
                    >
                      {row.data.logged > 0 ? formatCount(row.data.avgCalories) : MISSING}
                    </Txt>
                    <Txt
                      variant="label"
                      weight="semibold"
                      align="end"
                      tabular
                      numberOfLines={1}
                      style={styles.compareCell}
                    >
                      {row.data.logged > 0 ? formatCount(row.data.avgProtein) : MISSING}
                    </Txt>
                  </View>
                ))}
              </>
            )}
          </Card>

          <InsightList
            insights={insights}
            title={t('insightsTitle')}
            subtitle={t('insightsSubtitle')}
            emptyMessage={t('insightsEmpty')}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginBottom: spacing.xl,
  },
  block: {
    marginBottom: spacing.xl,
  },
  range: {
    marginBottom: spacing.xl,
  },
  section: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    minHeight: 44,
  },
  sectionTitle: {
    flexShrink: 1,
  },
  sectionHint: {
    flexShrink: 1,
    maxWidth: '50%',
  },
  note: {
    marginTop: spacing.md,
  },
  divider: {
    marginVertical: spacing.lg,
  },

  /* body */
  scoreRow: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginTop: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  scoreLabel: {
    flexGrow: 1,
    flexShrink: 1,
  },
  scoreDelta: {
    minWidth: 34,
  },

  /* training */
  trainingHead: {
    alignItems: 'flex-start',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trainingCount: {
    alignItems: 'baseline',
    columnGap: spacing.sm,
    flexDirection: 'row',
    flexShrink: 1,
  },
  trainingUnit: {
    flexShrink: 1,
  },
  week: {
    columnGap: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  weekDay: {
    alignItems: 'center',
    flex: 1,
    rowGap: spacing.xs + 2,
  },
  weekSlot: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  weekDot: {
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  weekRest: {
    borderRadius: radius.pill,
    height: 3,
    width: 12,
  },
  splitHead: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  splitTitle: {
    flexShrink: 1,
  },
  splitList: {
    marginTop: spacing.lg,
    rowGap: spacing.md,
  },
  splitRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 34,
  },
  splitBubble: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  splitBody: {
    flex: 1,
    rowGap: spacing.xs + 2,
  },
  splitLabels: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  splitLabel: {
    flexShrink: 1,
  },
  bar: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  barFill: {
    height: '100%',
  },

  /* nutrition */
  nutritionTop: {
    alignItems: 'center',
    columnGap: spacing.lg,
    flexDirection: 'row',
  },
  ring: {
    flexShrink: 0,
  },
  nutritionStats: {
    flex: 1,
    rowGap: spacing.md,
  },
  compareTitle: {
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  compareHead: {
    columnGap: spacing.md,
    flexDirection: 'row',
    paddingBottom: spacing.xs,
  },
  compareRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 32,
  },
  compareLabel: {
    flexGrow: 1,
    flexShrink: 1,
  },
  compareCell: {
    minWidth: 64,
  },
});
