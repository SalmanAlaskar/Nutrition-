import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';

import { InsightList } from '@/components/insights/InsightList';
import { PhaseBar } from '@/components/phase/PhaseBar';
import { CalorieSummary } from '@/components/today/CalorieSummary';
import { DayRows } from '@/components/today/DayRows';
import { DayStrip } from '@/components/today/DayStrip';
import { MealSection } from '@/components/today/MealSection';
import { QuickAddRow } from '@/components/today/QuickAddRow';
import { useDayLabels } from '@/components/today/useDayLabels';
import {
  AppHeader,
  Button,
  IconButton,
  LoadingView,
  Screen,
  Section,
  Txt,
} from '@/components/ui';
import { latestScan } from '@/domain/bodyScan';
import { currentSlot, lastNDays, todayKey } from '@/domain/date';
import { formatCount } from '@/domain/format';
import { buildInsights } from '@/domain/insights';
import { slotTargets } from '@/domain/mealPlan';
import { phaseFor } from '@/domain/phase';
import { MEAL_SLOTS, loggingStreak, mealsBySlot } from '@/domain/totals';
import { dayForDate } from '@/domain/training';
import { getMealsForDates, getWorkoutsForDates } from '@/storage/repository';
import { useApp } from '@/state/AppStore';
import { layout, radius, spacing, useTheme } from '@/theme';
import type { Meal, MealSlot, WorkoutSession } from '@/types';

/**
 * Height assumed for the floating actions until they report their own, so the
 * first frame never hides a row either. The real value replaces it on layout.
 */
const ACTION_BAR_ESTIMATE = 48;
/** Gap between the last row and the top of the floating actions. */
const ACTION_BAR_GAP = spacing.xl;

/**
 * Days of meals and sessions read for the insights, ending on the day shown.
 * The engine's own windows end on the day before, so a fortnight of history
 * plus the day itself is fifteen keys.
 */
const INSIGHT_WINDOW_DAYS = 15;

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

/**
 * The actions rest on the page rather than sitting in a bar, so they carry a
 * soft shadow and no fill of their own. `shadow*` is deprecated on the web
 * build, which wants the CSS property instead.
 */
const FLOAT: ViewStyle = Platform.select<ViewStyle>({
  web: { boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)' },
  android: { elevation: 6 },
  default: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
});

/** The fortnight behind the selected day, loaded once per day rather than per render. */
interface History {
  mealsByDate: Record<string, Meal[]>;
  workoutsByDate: Record<string, WorkoutSession[]>;
}

const EMPTY_HISTORY: History = { mealsByDate: {}, workoutsByDate: {} };

export default function TodayScreen() {
  const {
    ready,
    selectedDate,
    meals,
    totals,
    targets,
    loggedDates,
    program,
    todaysWorkouts,
    workoutDates,
    bodyScans,
    profile,
    phases,
    setSelectedDate,
    deleteMeal,
    refresh,
  } = useApp();
  const { colors } = useTheme();
  const { t } = useTranslation(['today', 'units', 'common']);
  const dayLabels = useDayLabels();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [actionBarHeight, setActionBarHeight] = useState(ACTION_BAR_ESTIMATE);
  const [history, setHistory] = useState<History>(EMPTY_HISTORY);

  const grouped = useMemo(() => mealsBySlot(meals), [meals]);
  const streak = useMemo(() => loggingStreak(loggedDates, todayKey()), [loggedDates]);
  const planTargets = useMemo(() => (targets ? slotTargets(targets) : null), [targets]);
  const scheduledDay = useMemo(
    () => (program ? dayForDate(program, selectedDate) : null),
    [program, selectedDate],
  );
  const scan = useMemo(() => latestScan(bodyScans), [bodyScans]);

  /**
   * The phase that owns the day on screen, which is the day the target above
   * belongs to. On today this is the store's `activePhase`; on a day picked
   * from the strip it is whichever phase covered that day, so the bar never
   * explains a figure the screen is not showing.
   */
  const dayPhase = useMemo(() => phaseFor(phases, selectedDate), [phases, selectedDate]);

  const title = dayLabels.day(selectedDate);
  const shortDate = dayLabels.shortDay(selectedDate);

  // The actions float over the scroll view, so their measured height plus the
  // inset they sit on is exactly the room the content needs underneath. The
  // tab bar is below the scene, not over it, and is already out of the way.
  const contentStyle = useMemo(
    () => ({ paddingBottom: actionBarHeight + spacing.lg + ACTION_BAR_GAP }),
    [actionBarHeight],
  );

  // One stable list of day keys per selected day: without this the effect below
  // would build a new array every render and re-read storage forever.
  const historyWindow = useMemo(
    () => lastNDays(INSIGHT_WINDOW_DAYS, selectedDate),
    [selectedDate],
  );

  // The fortnight is read in the background and only feeds the insights, so the
  // ring and the meal list paint on the first frame with the day already in the
  // store. `loggedDates` and `workoutDates` are replaced whenever anything is
  // logged, which is what re-runs this.
  useEffect(() => {
    if (!ready) return undefined;
    let active = true;

    Promise.all([getMealsForDates(historyWindow), getWorkoutsForDates(historyWindow)])
      .then(([mealsByDate, workoutsByDate]) => {
        if (active) setHistory({ mealsByDate, workoutsByDate });
      })
      .catch((error: unknown) => console.warn('[today] history load failed', error));

    return () => {
      active = false;
    };
  }, [ready, historyWindow, loggedDates, workoutDates]);

  const insights = useMemo(
    () =>
      buildInsights({
        today: selectedDate,
        profile,
        targets,
        program,
        mealsByDate: history.mealsByDate,
        workoutsByDate: history.workoutsByDate,
        scans: bodyScans,
        // The store keeps every logged day, so streaks are not capped by the
        // fortnight the maps cover.
        loggedDates,
        workoutDates,
      }),
    [
      selectedDate,
      profile,
      targets,
      program,
      history,
      bodyScans,
      loggedDates,
      workoutDates,
    ],
  );

  const handleActionBarLayout = useCallback((event: LayoutChangeEvent) => {
    const height = Math.ceil(event.nativeEvent.layout.height);
    setActionBarHeight((current) => (current === height ? current : height));
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    refresh()
      .catch((error: unknown) => console.warn('[today] refresh failed', error))
      .finally(() => setRefreshing(false));
  }, [refresh]);

  const openAdd = useCallback(
    (slot: MealSlot) => {
      router.push({ pathname: '/meal/add', params: { slot, date: selectedDate } });
    },
    [router, selectedDate],
  );

  const openCamera = useCallback(() => {
    router.push({
      pathname: '/meal/camera',
      params: { slot: currentSlot(), date: selectedDate },
    });
  }, [router, selectedDate]);

  const openMeal = useCallback(
    (meal: Meal) => {
      router.push({ pathname: '/meal/[id]', params: { id: meal.id, date: meal.date } });
    },
    [router],
  );

  const openSession = useCallback(() => {
    router.push({ pathname: '/training/session', params: { date: selectedDate } });
  }, [router, selectedDate]);

  const openBody = useCallback(() => router.push('/body'), [router]);
  const openPhases = useCallback(() => router.push('/phases'), [router]);
  const openHistory = useCallback(() => router.push('/(tabs)/history'), [router]);

  const handleDelete = useCallback(
    (meal: Meal) => {
      deleteMeal(meal.date, meal.id).catch((error: unknown) =>
        console.warn('[today] delete failed', error),
      );
    },
    [deleteMeal],
  );

  if (!ready) {
    return (
      <Screen>
        <LoadingView message={t('today:loading')} />
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <Screen
        scroll
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentStyle={contentStyle}
      >
        <AppHeader
          title={title}
          subtitle={title.includes(shortDate) ? undefined : shortDate}
          right={
            <View style={styles.headerRight}>
              {/* The streak is a quiet fact, not a trophy: no fill, no accent. */}
              {streak >= 2 ? (
                <View
                  accessible
                  accessibilityLabel={t('today:streak', { value: formatCount(streak) })}
                  style={styles.streak}
                >
                  <Ionicons
                    name="flame-outline"
                    size={14}
                    color={colors.textMuted}
                    {...DECORATIVE}
                  />
                  <Txt variant="label" color="muted" tabular>
                    {formatCount(streak)}
                  </Txt>
                </View>
              ) : null}
              <IconButton
                icon="settings-outline"
                onPress={() => router.push('/settings')}
                accessibilityLabel={t('today:settings')}
                size={20}
                color={colors.textMuted}
              />
            </View>
          }
        />

        <DayStrip
          selectedDate={selectedDate}
          loggedDates={loggedDates}
          onSelect={setSelectedDate}
          style={styles.bleed}
        />

        {/* The ring, with room around it. Everything below supports it, and
            nothing below repeats its figure. */}
        <CalorieSummary
          totals={totals}
          targets={targets}
          onFinishProfile={() => router.push('/onboarding')}
          onOpenHistory={openHistory}
          style={styles.hero}
        />

        {/* Only when a phase owns this day. With none running the target comes
            from the profile and needs no footnote, so nothing is drawn here. */}
        {dayPhase && targets ? (
          <PhaseBar
            phase={dayPhase}
            // Exactly the figure the ring above is counting against: with a
            // phase covering the day, the store's target is the phase's.
            targets={targets}
            today={selectedDate}
            onPress={openPhases}
            style={styles.phase}
          />
        ) : null}

        <DayRows
          programDay={scheduledDay}
          sessions={todaysWorkouts}
          scan={scan}
          onTraining={openSession}
          onBody={openBody}
          style={styles.rows}
        />

        <QuickAddRow date={selectedDate} />

        <Section title={t('today:mealsTitle')} contentStyle={styles.slots}>
          {MEAL_SLOTS.map((slot) => (
            <MealSection
              key={slot}
              slot={slot}
              meals={grouped[slot]}
              macros={totals.bySlot[slot]}
              target={planTargets ? planTargets[slot] : null}
              onAdd={() => openAdd(slot)}
              onOpen={openMeal}
              onDelete={handleDelete}
            />
          ))}
        </Section>

        {insights.length > 0 ? (
          <InsightList
            insights={insights}
            title={t('today:insightsTitle')}
            subtitle={t('today:insightsSubtitle')}
            style={styles.insights}
          />
        ) : null}
      </Screen>

      {/* Two things resting on the page, not a toolbar bolted to the bottom.
          Neither takes the accent: that belongs to the ring. */}
      <View style={styles.actionBar} pointerEvents="box-none">
        <View onLayout={handleActionBarLayout} style={styles.actionRow} pointerEvents="box-none">
          <View
            style={[
              styles.floatDisc,
              { backgroundColor: colors.surface, borderColor: colors.border },
              FLOAT,
            ]}
          >
            <IconButton
              icon="camera-outline"
              onPress={openCamera}
              accessibilityLabel={t('today:scanMeal')}
              size={20}
            />
          </View>

          <Button
            label={t('today:addFood')}
            icon="add"
            variant="secondary"
            onPress={() => openAdd(currentSlot())}
            accessibilityHint={t('today:addFoodHint')}
            style={[
              styles.floatPill,
              { backgroundColor: colors.surface, borderColor: colors.border },
              FLOAT,
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  streak: {
    alignItems: 'center',
    columnGap: spacing.xs + 1,
    flexDirection: 'row',
  },
  bleed: {
    marginHorizontal: -layout.gutter,
  },
  hero: {
    marginTop: spacing.xl,
  },
  // Attached to the ring rather than floating between two groups: the bar is
  // a caption on the figure above it.
  phase: {
    marginTop: spacing.lg,
  },
  rows: {
    marginTop: layout.sectionGap,
  },
  // Air, not rules, is what tells four slots apart. The gap between them is
  // well over the gap between a slot's header and its meals, which is none.
  slots: {
    rowGap: spacing.xl,
  },
  insights: {
    marginTop: layout.sectionGap,
  },
  actionBar: {
    bottom: spacing.lg,
    end: layout.gutter,
    position: 'absolute',
    start: layout.gutter,
  },
  actionRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  floatDisc: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  floatPill: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
