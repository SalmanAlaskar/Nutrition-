import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { CalorieChart } from '@/components/history/CalorieChart';
import { DaySummaryRow } from '@/components/history/DaySummaryRow';
import { WeightChart } from '@/components/history/WeightChart';
import {
  AppHeader,
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
} from '@/components/ui';
import { formatShortDay, lastNDays, todayKey } from '@/domain/date';
import { LIMITS, kgToLb, lbToKg } from '@/domain/nutrition';
import { averageCalories, loggingStreak, totalMacros } from '@/domain/totals';
import { useApp } from '@/state/AppStore';
import { getMealsForDates } from '@/storage/repository';
import { radius, spacing, useTheme } from '@/theme';
import type { Macros, Meal } from '@/types';

import { formatCount } from '../onboarding/_layout';

type RangeKey = '7' | '14' | '30';

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
];

interface DayRow {
  date: string;
  macros: Macros;
  mealCount: number;
  logged: boolean;
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
      {right ?? (hint ? (
        <Txt variant="caption" color="faint" numberOfLines={1}>
          {hint}
        </Txt>
      ) : null)}
    </View>
  );
}

export default function HistoryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { ready, profile, targets, weights, loggedDates, setSelectedDate, logWeight, refresh } =
    useApp();

  const [range, setRange] = useState<RangeKey>('14');
  const [mealsByDate, setMealsByDate] = useState<Record<string, Meal[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const today = todayKey();
  const rangeDays = Number(range);
  const dates = useMemo(() => lastNDays(rangeDays, today), [rangeDays, today]);
  const startDate = dates[0] ?? today;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const loadedMeals = await getMealsForDates(dates);
        if (active) setMealsByDate(loadedMeals);
      } catch (error) {
        console.warn('[history] could not load the range', error);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [dates, loggedDates]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    (async () => {
      try {
        await refresh();
        setMealsByDate(await getMealsForDates(dates));
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

  const targetCalories = targets?.calories ?? 0;
  const units = profile?.units ?? 'metric';
  const unitLabel = units === 'imperial' ? 'lb' : 'kg';
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
          title="History"
          subtitle={`${summary.loggedCount} of ${rangeDays} days logged`}
          large
        />

        <SegmentedControl<RangeKey>
          options={RANGE_OPTIONS}
          value={range}
          onChange={setRange}
          style={styles.range}
        />

        {busy ? (
          <LoadingView message="Reading your log" />
        ) : (
          <>
            <SectionHeader
              title="Calories"
              hint={`${formatShortDay(startDate)} to ${formatShortDay(today)}`}
            />
            <Card style={styles.block}>
              <CalorieChart days={summary.chart} target={targetCalories} />
            </Card>

            <View style={styles.tiles}>
              <StatTile
                label="Avg calories"
                value={formatCount(summary.avgCalories)}
                unit="kcal"
                icon="flame-outline"
                tone="accent"
                hint="Across days you logged"
              />
              <StatTile
                label="Days logged"
                value={`${summary.loggedCount}/${rangeDays}`}
                icon="calendar-outline"
                hint="In this range"
              />
              <StatTile
                label="Streak"
                value={formatCount(streak)}
                unit={streak === 1 ? 'day' : 'days'}
                icon="flash-outline"
                hint="Consecutive days"
              />
              <StatTile
                label="Avg protein"
                value={formatCount(summary.avgProtein)}
                unit="g"
                icon="barbell-outline"
                hint="Per logged day"
              />
            </View>

            <SectionHeader
              title="Weight"
              right={
                <IconButton
                  icon="add"
                  onPress={openWeightSheet}
                  accessibilityLabel="Log weight"
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
              title="Day by day"
              hint={summary.recent.length > 0 ? 'Newest first' : undefined}
            />

            {summary.recent.length === 0 ? (
              <Card style={styles.block}>
                <EmptyState
                  icon="restaurant-outline"
                  title="Nothing logged yet"
                  message="Days you log show up here, newest first, with how each one compared to your target."
                  actionLabel="Go to Today"
                  onAction={() => router.navigate('/(tabs)')}
                />
              </Card>
            ) : (
              <Card padded={false} style={styles.block}>
                {summary.recent.map((row, index) => (
                  <View key={row.date}>
                    {index > 0 ? <Divider inset /> : null}
                    <DaySummaryRow
                      date={row.date}
                      macros={row.macros}
                      mealCount={row.mealCount}
                      targetCalories={targetCalories}
                      onPress={openDay}
                    />
                  </View>
                ))}
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
            accessibilityLabel="Close"
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
              <Txt variant="heading">Log weight</Txt>
              <Txt variant="label" color="muted" style={styles.sheetHint}>
                {`Saved against today, ${unitLabel === 'lb' ? 'in pounds' : 'in kilograms'}.`}
              </Txt>

              <NumberField
                label={`Weight (${unitLabel})`}
                value={draft}
                onChange={setDraft}
                suffix={unitLabel}
                placeholder={unitLabel === 'lb' ? '165' : '75'}
                min={minDisplay}
                max={maxDisplay}
                error={
                  draft !== null && !draftValid
                    ? `Enter a value between ${minDisplay} and ${maxDisplay} ${unitLabel}`
                    : undefined
                }
                style={styles.sheetField}
              />

              <View style={styles.sheetActions}>
                <Button label="Cancel" onPress={closeWeightSheet} variant="ghost" />
                <Button
                  label="Save"
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
