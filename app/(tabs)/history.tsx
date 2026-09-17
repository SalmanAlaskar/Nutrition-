import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps,
} from 'react-native';

import { CalorieChart } from '@/components/history/CalorieChart';
import { DaySummaryRow } from '@/components/history/DaySummaryRow';
import { WeightChart } from '@/components/history/WeightChart';
import { useDayText } from '@/components/history/dayText';
import {
  AppHeader,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  IconButton,
  LoadingView,
  NumberField,
  Screen,
  SegmentedControl,
  StatTile,
  Txt,
  type TxtColor,
} from '@/components/ui';
import { latestScan, scanChange } from '@/domain/bodyScan';
import { lastNDays, todayKey } from '@/domain/date';
import { formatAmount, formatCount, formatDelta } from '@/domain/format';
import { LIMITS, kgToLb, lbToKg } from '@/domain/nutrition';
import { averageCalories, loggingStreak, totalMacros } from '@/domain/totals';
import { SESSION_ICONS, dayForDate, isSessionComplete } from '@/domain/training';
import { mirrorIcon, useDirection } from '@/i18n';
import { useApp } from '@/state/AppStore';
import { getMealsForDates, getWorkoutsForDates } from '@/storage/repository';
import { radius, spacing, useTheme } from '@/theme';
import type { Macros, Meal, Program, SessionType, WorkoutSession } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

type RangeKey = '7' | '14' | '30';

/** Adherence at or above this share of the scheduled days reads as on plan. */
const ON_PLAN_PERCENT = 80;

/** Session types, mapped to the copy that names them in the reader's language. */
const TYPE_KEYS = {
  push: 'typePush',
  pull: 'typePull',
  legs: 'typeLegs',
  upper: 'typeUpper',
  lower: 'typeLower',
  full: 'typeFull',
  cardio: 'typeCardio',
} as const satisfies Record<SessionType, string>;

interface DayRow {
  date: string;
  macros: Macros;
  mealCount: number;
  logged: boolean;
}

/**
 * What the day-by-day list prints about training, beside the calorie summary:
 * the session that was logged, or the scheduled one that was not.
 */
type DayTraining =
  | { kind: 'logged'; label: string; sets: number; icon: string }
  | { kind: 'missed'; label: string };

/** One session type in the range: how many were done against how many planned. */
interface TypeRowData {
  type: SessionType;
  done: number;
  scheduled: number;
}

/** The three numbers a scan card leads with, in kilograms and percent. */
const SCAN_CARD_METRICS = [
  { key: 'weightKg', labelKey: 'metricWeight', unit: 'kg', decimals: 1, higherIsBetter: null },
  {
    key: 'skeletalMuscleKg',
    labelKey: 'metricMuscle',
    unit: 'kg',
    decimals: 1,
    higherIsBetter: true,
  },
  {
    key: 'bodyFatPercent',
    labelKey: 'metricFat',
    unit: 'percent',
    decimals: 1,
    higherIsBetter: false,
  },
] as const satisfies readonly {
  key: 'weightKg' | 'skeletalMuscleKg' | 'bodyFatPercent';
  labelKey: 'metricWeight' | 'metricMuscle' | 'metricFat';
  unit: 'kg' | 'percent';
  decimals: number;
  /** Direction of a good change, null when it depends on the goal. */
  higherIsBetter: boolean | null;
}[];

/** Sets ticked off across a set of sessions. */
function completedSets(sessions: WorkoutSession[]): number {
  let total = 0;
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      total += exercise.sets.filter((set) => set.done).length;
    }
  }
  return total;
}

/** Section title with an optional caption or action on the trailing edge. */
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
      <Txt variant="heading" numberOfLines={1} style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Txt>
      {right ??
        (hint ? (
          <Txt
            variant="caption"
            color="faint"
            align="end"
            numberOfLines={2}
            style={styles.sectionHint}
          >
            {hint}
          </Txt>
        ) : null)}
    </View>
  );
}

/**
 * One session type inside the training card. The count turns amber when fewer
 * sessions were done than the program scheduled, so a neglected day type is
 * visible without reading the numbers.
 */
function TypeRow({ data }: { data: TypeRowData }) {
  const { colors } = useTheme();
  const { t } = useTranslation('history');
  const { type, done, scheduled } = data;
  const behind = scheduled > 0 && done < scheduled;
  const share = scheduled > 0 ? Math.min(1, done / scheduled) : done > 0 ? 1 : 0;
  const label = t(TYPE_KEYS[type]);

  return (
    <View
      accessible
      accessibilityLabel={
        scheduled > 0
          ? t('typeSpoken', {
              type: label,
              done: formatCount(done),
              scheduled: formatCount(scheduled),
            })
          : t('typeSpokenPlain', { type: label, done: formatCount(done) })
      }
      style={styles.typeRow}
    >
      <View style={[styles.typeBubble, { backgroundColor: colors.surfaceAlt }]} {...DECORATIVE}>
        <Ionicons name={SESSION_ICONS[type] as IconName} size={16} color={colors.textMuted} />
      </View>

      <View style={styles.typeBody}>
        <View style={styles.typeHead}>
          <Txt weight="medium" numberOfLines={1} style={styles.typeLabel}>
            {label}
          </Txt>
          <Txt variant="label" color={behind ? 'warning' : 'muted'} tabular numberOfLines={1}>
            {scheduled > 0
              ? `${formatCount(done)} / ${formatCount(scheduled)}`
              : formatCount(done)}
          </Txt>
        </View>

        <View style={[styles.bar, { backgroundColor: colors.track }]} {...DECORATIVE}>
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
}

/** The training line under a day row: what was logged, or what was missed. */
function DayTrainingNote({ data }: { data: DayTraining }) {
  const { colors } = useTheme();
  const { t } = useTranslation('history');
  const logged = data.kind === 'logged';

  const text =
    data.kind === 'logged'
      ? data.sets > 0
        ? t(data.sets === 1 ? 'daySetsOne' : 'daySets', {
            label: data.label,
            sets: formatCount(data.sets),
          })
        : data.label
      : t('dayMissed', { label: data.label });

  return (
    <View
      accessible
      accessibilityLabel={logged ? t('daySpoken', { text }) : text}
      style={styles.dayNote}
    >
      <Ionicons
        name={(data.kind === 'logged' ? data.icon : 'remove-circle-outline') as IconName}
        size={14}
        color={logged ? colors.accent : colors.textFaint}
        {...DECORATIVE}
      />
      <Txt variant="caption" color={logged ? 'accent' : 'faint'} numberOfLines={1}>
        {text}
      </Txt>
    </View>
  );
}

export default function HistoryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation(['history', 'units', 'common']);
  const { language, isRTL } = useDirection();
  const dayText = useDayText();
  const {
    ready,
    profile,
    targets,
    weights,
    loggedDates,
    program,
    workoutDates,
    bodyScans,
    setSelectedDate,
    logWeight,
    refresh,
  } = useApp();

  const [range, setRange] = useState<RangeKey>('14');
  const [mealsByDate, setMealsByDate] = useState<Record<string, Meal[]>>({});
  const [workoutsByDate, setWorkoutsByDate] = useState<Record<string, WorkoutSession[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const today = todayKey();
  const rangeDays = Number(range);
  const dates = useMemo(() => lastNDays(rangeDays, today), [rangeDays, today]);
  const startDate = dates[0] ?? today;

  const rangeOptions = useMemo(
    () => [
      { value: '7' as RangeKey, label: t('range7') },
      { value: '14' as RangeKey, label: t('range14') },
      { value: '30' as RangeKey, label: t('range30') },
    ],
    [t],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [loadedMeals, loadedWorkouts] = await Promise.all([
          getMealsForDates(dates),
          getWorkoutsForDates(dates),
        ]);
        if (active) {
          setMealsByDate(loadedMeals);
          setWorkoutsByDate(loadedWorkouts);
        }
      } catch (error) {
        console.warn('[history] could not load the range', error);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [dates, loggedDates, workoutDates]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    (async () => {
      try {
        await refresh();
        const [loadedMeals, loadedWorkouts] = await Promise.all([
          getMealsForDates(dates),
          getWorkoutsForDates(dates),
        ]);
        setMealsByDate(loadedMeals);
        setWorkoutsByDate(loadedWorkouts);
      } catch (error) {
        console.warn('[history] could not refresh', error);
      } finally {
        setRefreshing(false);
      }
    })();
  }, [refresh, dates]);

  const summary = useMemo(() => {
    const rows: DayRow[] = dates.map((date) => {
      const meals = mealsByDate[date] ?? [];
      return {
        date,
        macros: totalMacros(meals),
        mealCount: meals.length,
        logged: meals.length > 0,
      };
    });
    const logged = rows.filter((row) => row.logged);
    return {
      rows,
      chart: rows.map((row) => ({
        date: row.date,
        calories: Math.round(row.macros.calories),
        logged: row.logged,
      })),
      recent: [...rows].reverse().filter((row) => row.logged),
      loggedCount: logged.length,
      avgCalories: averageCalories(mealsByDate),
      avgProtein:
        logged.length > 0
          ? Math.round(
              logged.reduce((sum, row) => sum + row.macros.protein, 0) / logged.length,
            )
          : 0,
    };
  }, [dates, mealsByDate]);

  const streak = useMemo(() => loggingStreak(loggedDates, today), [loggedDates, today]);

  const rangeWeights = useMemo(
    () => weights.filter((log) => log.date >= startDate && log.date <= today),
    [weights, startDate, today],
  );

  /**
   * A program day carries its own Arabic label; a logged session only kept the
   * label it was saved with, so Arabic falls back to the day type rather than
   * printing English back at the reader.
   */
  const labelForDay = useCallback(
    (dayId: string | undefined, type: SessionType, saved: string | undefined): string => {
      const day = dayId ? program?.days.find((entry) => entry.id === dayId) : undefined;
      if (language === 'ar') return day?.labelAr ?? t(TYPE_KEYS[type]);
      return day?.label ?? saved ?? t(TYPE_KEYS[type]);
    },
    [program, language, t],
  );

  const training = useMemo(() => {
    const sessions = dates.flatMap((date) => workoutsByDate[date] ?? []);
    const trainedDays = dates.filter((date) => (workoutsByDate[date] ?? []).length > 0).length;
    const scheduledDays = program
      ? dates.filter((date) => dayForDate(program, date) !== null).length
      : 0;

    // Program order first so an untrained day type still has a row, then any
    // type that was logged outside the program.
    const order: SessionType[] = [];
    if (program) {
      for (const day of program.days) {
        if (!order.includes(day.type)) order.push(day.type);
      }
    }
    for (const session of sessions) {
      if (!order.includes(session.type)) order.push(session.type);
    }

    const rows: TypeRowData[] = order.map((type) => ({
      type,
      done: sessions.filter((session) => session.type === type).length,
      scheduled: program
        ? dates.filter((date) => dayForDate(program, date)?.type === type).length
        : 0,
    }));

    const unfinished = sessions.filter(
      (session) => session.completedAt === undefined && !isSessionComplete(session),
    ).length;

    return {
      count: sessions.length,
      sets: completedSets(sessions),
      trainedDays,
      scheduledDays,
      unfinished,
      rows,
      adherence:
        scheduledDays > 0 ? Math.round((trainedDays / scheduledDays) * 100) : null,
    };
  }, [dates, workoutsByDate, program]);

  const dayTraining = useMemo(() => {
    const map: Record<string, DayTraining> = {};
    for (const date of dates) {
      const sessions = workoutsByDate[date] ?? [];
      const first = sessions[0];
      if (first) {
        map[date] = {
          kind: 'logged',
          label: sessions
            .map((session) => labelForDay(session.dayId, session.type, session.dayLabel))
            .join(' + '),
          sets: completedSets(sessions),
          icon: SESSION_ICONS[first.type],
        };
        continue;
      }
      // Today is still open, so a scheduled day is not yet a missed one.
      if (date === today) continue;
      const scheduled = program ? dayForDate(program, date) : null;
      if (scheduled) {
        map[date] = {
          kind: 'missed',
          label: labelForDay(scheduled.id, scheduled.type, scheduled.label),
        };
      }
    }
    return map;
  }, [dates, workoutsByDate, program, today, labelForDay]);

  const body = useMemo(() => {
    const latest = latestScan(bodyScans);
    const previous = latest
      ? latestScan(bodyScans.filter((scan) => scan.id !== latest.id))
      : null;
    return {
      latest,
      change: latest && previous ? scanChange(previous, latest) : null,
    };
  }, [bodyScans]);

  const targetCalories = targets?.calories ?? 0;
  const units = profile?.units ?? 'metric';
  const unitLabel = units === 'imperial' ? t('units:lb') : t('units:kg');
  const minDisplay =
    units === 'imperial' ? Math.round(kgToLb(LIMITS.weightKg.min)) : LIMITS.weightKg.min;
  const maxDisplay =
    units === 'imperial' ? Math.round(kgToLb(LIMITS.weightKg.max)) : LIMITS.weightKg.max;

  const draftKg = draft === null ? null : units === 'imperial' ? lbToKg(draft) : draft;
  const draftValid =
    draftKg !== null && draftKg >= LIMITS.weightKg.min && draftKg <= LIMITS.weightKg.max;

  const openDay = useCallback(
    (date: string) => {
      setSelectedDate(date);
      router.navigate('/(tabs)');
    },
    [setSelectedDate, router],
  );

  const openWeightSheet = useCallback(() => {
    const seedKg = rangeWeights[rangeWeights.length - 1]?.weightKg ?? profile?.weightKg ?? null;
    setDraft(
      seedKg === null
        ? null
        : units === 'imperial'
          ? kgToLb(seedKg)
          : Math.round(seedKg * 10) / 10,
    );
    setWeightOpen(true);
  }, [rangeWeights, profile, units]);

  const closeWeightSheet = useCallback(() => {
    if (saving) return;
    setWeightOpen(false);
  }, [saving]);

  const saveWeight = useCallback(() => {
    if (draftKg === null || !draftValid) return;
    setSaving(true);
    (async () => {
      try {
        await logWeight(Math.round(draftKg * 10) / 10);
        setWeightOpen(false);
      } catch (error) {
        console.warn('[history] could not save the weight log', error);
      } finally {
        setSaving(false);
      }
    })();
  }, [draftKg, draftValid, logWeight]);

  const busy = !ready || !loaded;

  return (
    <>
      <Screen scroll refreshing={refreshing} onRefresh={handleRefresh}>
        <AppHeader
          title={t('title')}
          subtitle={t('subtitle', {
            logged: formatCount(summary.loggedCount),
            total: formatCount(rangeDays),
          })}
          large
        />

        <SegmentedControl<RangeKey>
          options={rangeOptions}
          value={range}
          onChange={setRange}
          style={styles.range}
        />

        {busy ? (
          <LoadingView message={t('loading')} />
        ) : (
          <>
            <SectionHeader
              title={t('caloriesTitle')}
              hint={t('span', {
                from: dayText.shortDay(startDate),
                to: dayText.shortDay(today),
              })}
            />
            <Card style={styles.block}>
              <CalorieChart days={summary.chart} target={targetCalories} />
            </Card>

            <View style={styles.tiles}>
              <StatTile
                label={t('avgCalories')}
                value={formatCount(summary.avgCalories)}
                unit={t('units:kcal')}
                icon="flame-outline"
                tone="accent"
                hint={t('avgCaloriesHint')}
              />
              <StatTile
                label={t('daysLogged')}
                value={`${formatCount(summary.loggedCount)}/${formatCount(rangeDays)}`}
                icon="calendar-outline"
                hint={t('daysLoggedHint')}
              />
              <StatTile
                label={t('streak')}
                value={formatCount(streak)}
                unit={streak === 1 ? t('dayUnitOne') : t('dayUnit')}
                icon="flash-outline"
                hint={t('streakHint')}
              />
              <StatTile
                label={t('avgProtein')}
                value={formatCount(summary.avgProtein)}
                unit={t('units:gram')}
                icon="barbell-outline"
                hint={t('avgProteinHint')}
              />
            </View>

            <SectionHeader title={t('trainingTitle')} hint={programName(program, language)} />
            <Card style={styles.block}>
              {training.count === 0 && training.scheduledDays === 0 ? (
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
                      accessibilityLabel={t('trainingSpoken', {
                        sessions: formatCount(training.count),
                        days: formatCount(rangeDays),
                        sets: formatCount(training.sets),
                      })}
                      style={styles.trainingCount}
                    >
                      <Txt variant="title" tabular>
                        {formatCount(training.count)}
                      </Txt>
                      <Txt
                        variant="label"
                        color="muted"
                        numberOfLines={2}
                        style={styles.trainingUnit}
                      >
                        {t('trainingUnit', { sets: formatCount(training.sets) })}
                      </Txt>
                    </View>

                    {training.adherence === null ? (
                      <Badge label={t('noSchedule')} />
                    ) : (
                      <Badge
                        label={t('adherence', { percent: formatCount(training.adherence) })}
                        tone={training.adherence >= ON_PLAN_PERCENT ? 'accent' : 'default'}
                      />
                    )}
                  </View>

                  {training.scheduledDays > 0 ? (
                    <>
                      <View
                        style={[styles.bar, styles.trainingBar, { backgroundColor: colors.track }]}
                        {...DECORATIVE}
                      >
                        <View
                          style={[
                            styles.barFill,
                            {
                              backgroundColor: colors.accent,
                              width: `${
                                Math.min(1, training.trainedDays / training.scheduledDays) * 100
                              }%`,
                            },
                          ]}
                        />
                      </View>
                      <Txt variant="label" color="muted" style={styles.trainingHint}>
                        {t('trainedDays', {
                          done: formatCount(training.trainedDays),
                          planned: formatCount(training.scheduledDays),
                        })}
                      </Txt>
                    </>
                  ) : (
                    <Txt variant="label" color="muted" style={styles.trainingHint}>
                      {t('scheduleHint')}
                    </Txt>
                  )}

                  {training.unfinished > 0 ? (
                    <Txt variant="caption" color="faint" style={styles.trainingNote}>
                      {t('unfinished', { sessions: formatCount(training.unfinished) })}
                    </Txt>
                  ) : null}

                  {training.rows.length > 0 ? (
                    <>
                      <Divider style={styles.trainingDivider} />
                      <View style={styles.typeList}>
                        {training.rows.map((row) => (
                          <TypeRow key={row.type} data={row} />
                        ))}
                      </View>
                    </>
                  ) : null}
                </>
              )}
            </Card>

            <SectionHeader
              title={t('weightTitle')}
              right={
                <IconButton
                  icon="add"
                  onPress={openWeightSheet}
                  accessibilityLabel={t('logWeight')}
                  variant="surface"
                  size={20}
                />
              }
            />
            <Card style={styles.block}>
              <WeightChart
                logs={rangeWeights}
                startDate={startDate}
                endDate={today}
                units={units}
                onLogWeight={openWeightSheet}
              />
            </Card>

            <SectionHeader
              title={t('bodyTitle')}
              hint={body.latest ? dayText.shortDay(body.latest.date) : undefined}
            />
            {body.latest === null ? (
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
              <Card
                style={styles.block}
                onPress={() => router.push('/body')}
                accessibilityLabel={t('bodyOpen')}
              >
                <View style={styles.bodyHead}>
                  <View style={styles.bodyHeadText}>
                    <Txt weight="semibold" numberOfLines={1}>
                      {body.latest.device ?? t('bodyLatest')}
                    </Txt>
                    <Txt variant="label" color="muted" numberOfLines={2} style={styles.bodySub}>
                      {body.change
                        ? t('bodyChange', {
                            days: formatCount(body.change.days),
                            date: dayText.shortDay(body.change.fromDate),
                          })
                        : t('bodyFirst')}
                    </Txt>
                  </View>
                  <Ionicons
                    name={mirrorIcon('chevron-forward', isRTL) as IconName}
                    size={16}
                    color={colors.textFaint}
                    {...DECORATIVE}
                  />
                </View>

                <View style={styles.bodyMetrics}>
                  {SCAN_CARD_METRICS.map((metric) => {
                    const scan = body.latest;
                    const value = scan === null ? undefined : scan[metric.key];
                    const delta = body.change ? body.change[metric.key] : undefined;
                    const better =
                      delta === undefined || delta === 0 || metric.higherIsBetter === null
                        ? null
                        : delta > 0 === metric.higherIsBetter;
                    const deltaColor: TxtColor =
                      better === null ? 'faint' : better ? colors.accent : colors.warning;
                    const label = t(metric.labelKey);
                    const unit = metric.unit === 'kg' ? t('units:kg') : t('units:percent');

                    const spokenChange =
                      delta === undefined
                        ? ''
                        : delta === 0
                          ? `. ${t('deltaFlat')}`
                          : `. ${t(delta > 0 ? 'deltaUp' : 'deltaDown', {
                              amount: formatAmount(Math.abs(delta), metric.decimals),
                            })}`;

                    return (
                      <View
                        key={metric.key}
                        accessible
                        accessibilityLabel={
                          value === undefined
                            ? t('metricMissing', { label })
                            : `${t('metricSpoken', {
                                label,
                                value: formatAmount(value, metric.decimals),
                                unit,
                              })}${spokenChange}`
                        }
                        style={styles.bodyMetric}
                      >
                        <Txt variant="caption" color="faint" numberOfLines={1}>
                          {label}
                        </Txt>
                        <View style={styles.bodyValue}>
                          <Txt variant="heading" weight="bold" tabular numberOfLines={1}>
                            {value === undefined ? '—' : formatAmount(value, metric.decimals)}
                          </Txt>
                          <Txt variant="caption" color="faint">
                            {unit}
                          </Txt>
                        </View>
                        <Txt variant="label" color={deltaColor} tabular numberOfLines={1}>
                          {delta === undefined ? '—' : formatDelta(delta, metric.decimals)}
                        </Txt>
                      </View>
                    );
                  })}
                </View>
              </Card>
            )}

            <SectionHeader
              title={t('dayByDay')}
              hint={summary.recent.length > 0 ? t('newestFirst') : undefined}
            />

            {summary.recent.length === 0 ? (
              <Card style={styles.block}>
                <EmptyState
                  icon="restaurant-outline"
                  title={t('daysEmptyTitle')}
                  message={t('daysEmptyMessage')}
                  actionLabel={t('daysEmptyAction')}
                  onAction={() => router.navigate('/(tabs)')}
                />
              </Card>
            ) : (
              <Card padded={false} style={styles.block}>
                {summary.recent.map((row, index) => {
                  const note = dayTraining[row.date];
                  return (
                    <View key={row.date}>
                      {index > 0 ? <Divider inset /> : null}
                      <DaySummaryRow
                        date={row.date}
                        macros={row.macros}
                        mealCount={row.mealCount}
                        targetCalories={targetCalories}
                        onPress={openDay}
                        style={note ? styles.dayRowWithNote : undefined}
                      />
                      {note ? <DayTrainingNote data={note} /> : null}
                    </View>
                  );
                })}
              </Card>
            )}
          </>
        )}
      </Screen>

      <Modal
        visible={weightOpen}
        transparent
        animationType="fade"
        onRequestClose={closeWeightSheet}
        statusBarTranslucent
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
            onPress={closeWeightSheet}
            accessibilityRole="button"
            accessibilityLabel={t('common:close')}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalCenter}
            pointerEvents="box-none"
          >
            <View
              style={[
                styles.sheet,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Txt variant="heading">{t('logWeight')}</Txt>
              <Txt variant="label" color="muted" style={styles.sheetHint}>
                {units === 'imperial' ? t('weightSheetHintLb') : t('weightSheetHintKg')}
              </Txt>

              <NumberField
                label={t('weightField', { unit: unitLabel })}
                value={draft}
                onChange={setDraft}
                suffix={unitLabel}
                placeholder={units === 'imperial' ? '165' : '75'}
                min={minDisplay}
                max={maxDisplay}
                error={
                  draft !== null && !draftValid
                    ? t('weightRangeError', {
                        min: formatCount(minDisplay),
                        max: formatCount(maxDisplay),
                        unit: unitLabel,
                      })
                    : undefined
                }
                style={styles.sheetField}
              />

              <View style={styles.sheetActions}>
                <Button label={t('common:cancel')} onPress={closeWeightSheet} variant="ghost" />
                <Button
                  label={t('common:save')}
                  onPress={saveWeight}
                  disabled={!draftValid}
                  loading={saving}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

/** The program's own name, which is the user's data rather than app copy. */
function programName(program: Program | null, language: string): string | undefined {
  if (!program) return undefined;
  return language === 'ar' ? (program.nameAr ?? program.name) : program.name;
}

const styles = StyleSheet.create({
  range: {
    marginBottom: spacing.xl,
  },
  block: {
    marginBottom: spacing.xl,
  },
  tiles: {
    columnGap: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.xl,
    rowGap: spacing.md,
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
    maxWidth: '55%',
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
  trainingBar: {
    marginTop: spacing.lg,
  },
  trainingHint: {
    marginTop: spacing.sm,
  },
  trainingNote: {
    marginTop: spacing.xs,
  },
  trainingDivider: {
    marginTop: spacing.lg,
  },
  typeList: {
    marginTop: spacing.lg,
    rowGap: spacing.md,
  },
  typeRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 34,
  },
  typeBubble: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  typeBody: {
    flex: 1,
    rowGap: spacing.xs + 2,
  },
  typeHead: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  typeLabel: {
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

  /* body composition */
  bodyHead: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bodyHeadText: {
    flexShrink: 1,
  },
  bodySub: {
    marginTop: 2,
  },
  bodyMetrics: {
    columnGap: spacing.md,
    flexDirection: 'row',
    marginTop: spacing.lg,
  },
  bodyMetric: {
    flex: 1,
    rowGap: 2,
  },
  bodyValue: {
    alignItems: 'baseline',
    columnGap: 3,
    flexDirection: 'row',
  },

  /* day rows */
  dayRowWithNote: {
    paddingBottom: spacing.sm,
  },
  dayNote: {
    alignItems: 'center',
    columnGap: spacing.xs + 2,
    flexDirection: 'row',
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  modalRoot: {
    flex: 1,
  },
  modalCenter: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    alignSelf: 'center',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 420,
    padding: spacing.xl,
    width: '100%',
  },
  sheetHint: {
    marginTop: spacing.xs,
  },
  sheetField: {
    marginTop: spacing.lg,
  },
  sheetActions: {
    columnGap: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
