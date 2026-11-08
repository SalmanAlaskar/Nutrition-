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
  Divider,
  EmptyState,
  IconButton,
  LoadingView,
  NumberField,
  Screen,
  Section,
  SegmentedControl,
  StatTile,
  Txt,
} from '@/components/ui';
import { latestScan, scanChange } from '@/domain/bodyScan';
import { lastNDays, todayKey } from '@/domain/date';
import { formatAmount, formatCount, formatDelta } from '@/domain/format';
import { LIMITS, kgToLb, lbToKg } from '@/domain/nutrition';
import { averageCalories, loggingStreak, totalMacros } from '@/domain/totals';
import { SESSION_ICONS, dayForDate, isSessionComplete } from '@/domain/training';
import { useDirection } from '@/i18n';
import { useApp } from '@/state/AppStore';
import { getMealsForDates, getWorkoutsForDates } from '@/storage/repository';
import { layout, radius, spacing, useTheme } from '@/theme';
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

/** Stands in for a figure that was never measured. */
const MISSING = '—';

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
  | { kind: 'logged'; label: string; sets: number }
  | { kind: 'missed'; label: string };

/** One session type in the range: how many were done against how many planned. */
interface TypeRowData {
  type: SessionType;
  done: number;
  scheduled: number;
}

/** The three figures the body-composition summary leads with. */
const SCAN_METRICS = [
  { key: 'weightKg', labelKey: 'metricWeight', unit: 'kg', decimals: 1 },
  { key: 'skeletalMuscleKg', labelKey: 'metricMuscle', unit: 'kg', decimals: 1 },
  { key: 'bodyFatPercent', labelKey: 'metricFat', unit: 'percent', decimals: 1 },
] as const satisfies readonly {
  key: 'weightKg' | 'skeletalMuscleKg' | 'bodyFatPercent';
  labelKey: 'metricWeight' | 'metricMuscle' | 'metricFat';
  unit: 'kg' | 'percent';
  decimals: number;
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

/**
 * One session type, read as a line of text. The glyph is the fastest way to
 * recognise a day type, so it stays; the bar that used to sit under it said
 * nothing the two figures beside it do not already say.
 */
function TypeRow({ data }: { data: TypeRowData }) {
  const { colors } = useTheme();
  const { t } = useTranslation('history');
  const { type, done, scheduled } = data;
  const behind = scheduled > 0 && done < scheduled;
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
      <View {...DECORATIVE}>
        <Ionicons name={SESSION_ICONS[type] as IconName} size={16} color={colors.textFaint} />
      </View>

      <Txt variant="label" numberOfLines={1} style={styles.typeLabel}>
        {label}
      </Txt>

      {/* Done and scheduled in one run: as siblings Arabic reorders the pair. */}
      <Txt variant="label" color={behind ? 'muted' : 'text'} tabular numberOfLines={1}>
        {scheduled > 0 ? `${formatCount(done)}/${formatCount(scheduled)}` : formatCount(done)}
      </Txt>
    </View>
  );
}

/** The training line under a day row: what was logged, or what was missed. */
function DayTrainingNote({ data }: { data: DayTraining }) {
  const { t } = useTranslation('history');

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
    <Txt
      accessible
      accessibilityLabel={data.kind === 'logged' ? t('daySpoken', { text }) : text}
      variant="caption"
      color="faint"
      numberOfLines={1}
      style={styles.dayNote}
    >
      {text}
    </Txt>
  );
}

export default function HistoryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation(['history', 'units', 'common']);
  const { language } = useDirection();
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
      if (sessions.length > 0) {
        map[date] = {
          kind: 'logged',
          label: sessions
            .map((session) => labelForDay(session.dayId, session.type, session.dayLabel))
            .join(' + '),
          sets: completedSets(sessions),
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

  const openBody = useCallback(() => router.push('/body'), [router]);

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
  const trainingEmpty = training.count === 0 && training.scheduledDays === 0;

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

        {/* The range governs every section under it, so it sits with them. */}
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
            <Section
              first
              title={t('caloriesTitle')}
              subtitle={t('span', {
                from: dayText.shortDay(startDate),
                to: dayText.shortDay(today),
              })}
              style={styles.afterRange}
            >
              <CalorieChart days={summary.chart} target={targetCalories} />

              <View style={styles.figures}>
                <StatTile
                  label={t('avgCalories')}
                  value={formatCount(summary.avgCalories)}
                  unit={t('units:kcal')}
                  style={styles.figure}
                />
                <StatTile
                  label={t('avgProtein')}
                  value={formatCount(summary.avgProtein)}
                  unit={t('units:gram')}
                  style={styles.figure}
                />
                <StatTile
                  label={t('daysLogged')}
                  value={formatCount(summary.loggedCount)}
                  unit={t('ofTotal', { total: formatCount(rangeDays) })}
                  style={styles.figure}
                />
                <StatTile
                  label={t('streak')}
                  value={formatCount(streak)}
                  unit={streak === 1 ? t('dayUnitOne') : t('dayUnit')}
                  style={styles.figure}
                />
              </View>
            </Section>

            <Section title={t('trainingTitle')} subtitle={programName(program, language)}>
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
                    {/* The count and what it is made of share one run. */}
                    <Txt
                      accessibilityLabel={t('trainingSpoken', {
                        sessions: formatCount(training.count),
                        days: formatCount(rangeDays),
                        sets: formatCount(training.sets),
                      })}
                      variant="metric"
                      tabular
                      numberOfLines={1}
                      style={styles.trainingCount}
                    >
                      {formatCount(training.count)}
                      <Txt variant="label" color="faint" weight="medium">
                        {` ${t('trainingUnit', { sets: formatCount(training.sets) })}`}
                      </Txt>
                    </Txt>

                    <Badge
                      variant="plain"
                      label={
                        training.adherence === null
                          ? t('noSchedule')
                          : t('adherence', { percent: formatCount(training.adherence) })
                      }
                      style={styles.trainingBadge}
                    />
                  </View>

                  <Txt variant="label" color="muted" style={styles.trainingNote}>
                    {training.scheduledDays > 0
                      ? t('trainedDays', {
                          done: formatCount(training.trainedDays),
                          planned: formatCount(training.scheduledDays),
                        })
                      : t('scheduleHint')}
                  </Txt>

                  {training.unfinished > 0 ? (
                    <Txt variant="caption" color="faint" style={styles.trainingAside}>
                      {t('unfinished', { sessions: formatCount(training.unfinished) })}
                    </Txt>
                  ) : null}

                  {training.rows.length > 0 ? (
                    <View style={styles.typeList}>
                      {training.rows.map((row) => (
                        <TypeRow key={row.type} data={row} />
                      ))}
                    </View>
                  ) : null}
                </>
              )}
            </Section>

            <Section
              title={t('weightTitle')}
              action={
                <IconButton
                  icon="add"
                  onPress={openWeightSheet}
                  accessibilityLabel={t('logWeight')}
                  variant="surface"
                  size={20}
                />
              }
            >
              <WeightChart
                logs={rangeWeights}
                startDate={startDate}
                endDate={today}
                units={units}
                onLogWeight={openWeightSheet}
              />
            </Section>

            <Section
              title={t('bodyTitle')}
              subtitle={
                body.latest === null
                  ? undefined
                  : body.change
                    ? t('bodyChange', {
                        days: formatCount(body.change.days),
                        date: dayText.shortDay(body.change.fromDate),
                      })
                    : t('bodyFirst')
              }
              actionLabel={body.latest === null ? undefined : t('bodyOpenAction')}
              onAction={body.latest === null ? undefined : openBody}
              actionHint={t('bodyOpen')}
            >
              {body.latest === null ? (
                <EmptyState
                  icon="body-outline"
                  title={t('bodyEmptyTitle')}
                  message={t('bodyEmptyMessage')}
                  actionLabel={t('bodyEmptyAction')}
                  onAction={() => router.push('/body/import')}
                />
              ) : (
                <View style={styles.bodyMetrics}>
                  {SCAN_METRICS.map((metric) => {
                    const scan = body.latest;
                    const value = scan === null ? undefined : scan[metric.key];
                    const delta = body.change ? body.change[metric.key] : undefined;
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
                        {/*
                          Each figure sits in a row of its own. A run of digits
                          alone carries no reading direction, so left to itself
                          it aligns to the left of the column even in Arabic;
                          as a row child it is placed by the layout instead.
                          The unit is nested in the run, never a sibling.
                        */}
                        <View style={styles.bodyLine}>
                          <Txt variant="metric" tabular numberOfLines={1}>
                            {value === undefined
                              ? MISSING
                              : formatAmount(value, metric.decimals)}
                            {value === undefined ? null : (
                              <Txt variant="label" color="faint" weight="medium">
                                {` ${unit}`}
                              </Txt>
                            )}
                          </Txt>
                        </View>

                        <View style={styles.bodyLine}>
                          <Txt variant="label" color="muted" numberOfLines={1}>
                            {label}
                          </Txt>
                        </View>

                        <View style={styles.bodyLine}>
                          <Txt variant="caption" color="faint" tabular numberOfLines={1}>
                            {delta === undefined
                              ? MISSING
                              : formatDelta(delta, metric.decimals)}
                          </Txt>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </Section>

            <Section
              title={t('dayByDay')}
              subtitle={summary.recent.length > 0 ? t('newestFirst') : undefined}
              gap="tight"
            >
              {summary.recent.length === 0 ? (
                <EmptyState
                  icon="restaurant-outline"
                  title={t('daysEmptyTitle')}
                  message={t('daysEmptyMessage')}
                  actionLabel={t('daysEmptyAction')}
                  onAction={() => router.navigate('/(tabs)')}
                />
              ) : (
                summary.recent.map((row, index) => {
                  const note = dayTraining[row.date];
                  return (
                    <View key={row.date}>
                      {index > 0 ? <Divider /> : null}
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
                })
              )}
            </Section>
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
            <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
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
    marginTop: spacing.sm,
  },
  afterRange: {
    marginTop: spacing.xl,
  },

  /* calories */
  figures: {
    columnGap: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xl,
    rowGap: spacing.xl,
  },
  // Two to a row at every width, so four figures read as one block.
  // `flex-start` also keeps each line shrink-wrapped, so the figure and its
  // label are placed by the layout and follow the reading direction together.
  figure: {
    alignItems: 'flex-start',
    flexBasis: '40%',
  },

  /* training */
  trainingHead: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trainingCount: {
    flexShrink: 1,
  },
  trainingBadge: {
    // A badge pins itself to the start of its line; on this row it has to sit
    // on the same baseline as the figure beside it.
    alignSelf: 'baseline',
    flexShrink: 0,
  },
  trainingNote: {
    marginTop: spacing.sm,
    maxWidth: layout.maxTextWidth,
  },
  trainingAside: {
    marginTop: spacing.xs,
  },
  typeList: {
    marginTop: spacing.xl,
    rowGap: spacing.md,
  },
  typeRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 24,
  },
  typeLabel: {
    flexGrow: 1,
    flexShrink: 1,
  },

  /* body composition */
  bodyMetrics: {
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  bodyMetric: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    rowGap: spacing.xs,
  },
  bodyLine: {
    flexDirection: 'row',
  },

  /* day rows */
  dayRowWithNote: {
    paddingBottom: spacing.sm,
  },
  dayNote: {
    paddingBottom: spacing.md,
  },

  /* weight sheet */
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
