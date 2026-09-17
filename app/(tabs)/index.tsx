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
} from 'react-native';

import { InsightList } from '@/components/insights/InsightList';
import { useFoodLabels } from '@/components/meal/useFoodLabels';
import { CalorieSummary } from '@/components/today/CalorieSummary';
import { DayStrip } from '@/components/today/DayStrip';
import { MealSection } from '@/components/today/MealSection';
import { PlanStrip } from '@/components/today/PlanStrip';
import { QuickAddRow } from '@/components/today/QuickAddRow';
import { useDayLabels } from '@/components/today/useDayLabels';
import { AppHeader, Button, Card, IconButton, LoadingView, Screen, Txt } from '@/components/ui';
import { latestScan } from '@/domain/bodyScan';
import { currentSlot, lastNDays, todayKey } from '@/domain/date';
import { formatCount } from '@/domain/format';
import { buildInsights } from '@/domain/insights';
import { slotStatus, slotTargets, type SlotStatus } from '@/domain/mealPlan';
import { MEAL_SLOTS, loggingStreak, mealsBySlot } from '@/domain/totals';
import { dayForDate, isSessionComplete } from '@/domain/training';
import { useDirection } from '@/i18n';
import { getMealsForDates, getWorkoutsForDates } from '@/storage/repository';
import { useApp } from '@/state/AppStore';
import { radius, spacing, useTheme } from '@/theme';
import type { Meal, MealSlot, SessionType, WorkoutSession } from '@/types';

/**
 * Height assumed for the floating actions until they report their own, so the
 * first frame never hides a card either. The real value replaces it on layout.
 */
const ACTION_BAR_ESTIMATE = 64;
/** Gap between the last card and the top of the floating actions. */
const ACTION_BAR_GAP = spacing.lg;

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

/** The fortnight behind the selected day, loaded once per day rather than per render. */
interface History {
  mealsByDate: Record<string, Meal[]>;
  workoutsByDate: Record<string, WorkoutSession[]>;
}

const EMPTY_HISTORY: History = { mealsByDate: {}, workoutsByDate: {} };

/** Short word under a meal section saying how the slot is tracking. */
const STATUS_KEYS = {
  under: 'today:statusUnder',
  'on-track': 'today:statusOnTrack',
  over: 'today:statusOver',
} as const satisfies Record<Exclude<SlotStatus, 'empty'>, string>;

/** What each scheduled day works, keyed off the program day's own type. */
const MUSCLE_KEYS = {
  push: 'today:musclesPush',
  pull: 'today:musclesPull',
  legs: 'today:musclesLegs',
  upper: 'today:musclesUpper',
  lower: 'today:musclesLower',
  full: 'today:musclesFull',
  cardio: 'today:musclesCardio',
} as const satisfies Record<SessionType, string>;

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
    setSelectedDate,
    deleteMeal,
    refresh,
  } = useApp();
  const { colors } = useTheme();
  const { t } = useTranslation(['today', 'units', 'common']);
  const { isRTL } = useDirection();
  const dayLabels = useDayLabels();
  const foodLabels = useFoodLabels();
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

  const title = dayLabels.day(selectedDate);
  const shortDate = dayLabels.shortDay(selectedDate);

  // The bar floats over the scroll view, so its measured height plus the inset
  // it sits on is exactly the room the content needs underneath. The tab bar
  // is below the scene, not over it, and is already out of the way.
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

  const sessionDone = todaysWorkouts.some((session) => isSessionComplete(session));
  // Short enough to sit beside the muscle line on a phone. A rest day with
  // nothing logged says nothing here; the row already reads "Rest day".
  const sessionState = sessionDone
    ? t('today:stateComplete')
    : todaysWorkouts.length > 0
      ? t('today:stateInProgress')
      : scheduledDay
        ? t('today:stateNotLogged')
        : '';
  const sessionSpokenState = sessionState || t('today:stateNoSession');
  const sessionTitle = scheduledDay
    ? t('today:sessionDay', {
        label: isRTL ? scheduledDay.labelAr ?? scheduledDay.label : scheduledDay.label,
      })
    : t('today:restDay');

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
              {streak >= 2 ? (
                <View
                  accessible
                  accessibilityLabel={t('today:streak', { value: formatCount(streak) })}
                  style={[styles.streak, { backgroundColor: colors.accentSoft }]}
                >
                  <Ionicons name="flame" size={14} color={colors.accent} {...DECORATIVE} />
                  <Txt variant="label" weight="bold" color="accent" tabular>
                    {streak}
                  </Txt>
                </View>
              ) : null}
              <IconButton
                icon="settings-outline"
                onPress={() => router.push('/settings')}
                accessibilityLabel={t('today:settings')}
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

        <PlanStrip
          totals={totals}
          targets={targets}
          programDay={scheduledDay}
          sessions={todaysWorkouts}
          scan={scan}
          onCalories={openHistory}
          onTraining={openSession}
          onBody={openBody}
          style={styles.strip}
        />

        <CalorieSummary
          totals={totals}
          targets={targets}
          onFinishProfile={() => router.push('/onboarding')}
          style={styles.summary}
        />

        <QuickAddRow date={selectedDate} style={[styles.bleed, styles.group]} />

        <View style={styles.group}>
          <View style={styles.sectionHeader}>
            <Txt variant="caption" color="faint" weight="semibold">
              {t('today:trainingTitle')}
            </Txt>
          </View>

          <Card
            padded={false}
            onPress={openSession}
            // Card has no hint prop, so the label carries what the tap does.
            accessibilityLabel={t('today:sessionCard', {
              title: sessionTitle,
              state: sessionSpokenState,
            })}
          >
            <View style={styles.trainingRow}>
              <View
                style={[
                  styles.glyph,
                  { backgroundColor: scheduledDay ? colors.accentSoft : colors.surfaceAlt },
                ]}
                {...DECORATIVE}
              >
                <Ionicons
                  name={scheduledDay ? 'barbell-outline' : 'moon-outline'}
                  size={18}
                  color={scheduledDay ? colors.accent : colors.textFaint}
                />
              </View>

              <View style={styles.trainingText}>
                <Txt weight="semibold" numberOfLines={1}>
                  {sessionTitle}
                </Txt>
                <Txt variant="label" color="muted" numberOfLines={1} style={styles.trainingMeta}>
                  {scheduledDay ? t(MUSCLE_KEYS[scheduledDay.type]) : t('today:restDayBody')}
                </Txt>
              </View>

              <View style={styles.trainingState}>
                {sessionState ? (
                  <Txt
                    variant="label"
                    weight="semibold"
                    color={sessionDone ? 'accent' : 'faint'}
                    numberOfLines={1}
                  >
                    {sessionState}
                  </Txt>
                ) : null}
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.textFaint}
                  {...DECORATIVE}
                />
              </View>
            </View>
          </Card>
        </View>

        <View style={styles.group}>
          <View style={styles.sectionHeader}>
            <Txt variant="caption" color="faint" weight="semibold">
              {t('today:mealsTitle')}
            </Txt>
            {totals.mealCount > 0 ? (
              <Txt variant="caption" color="faint" tabular>
                {t('today:mealsTotal', { value: formatCount(totals.macros.calories) })}
              </Txt>
            ) : null}
          </View>

          <View style={styles.sections}>
            {MEAL_SLOTS.map((slot) => {
              const eaten = totals.bySlot[slot];
              const slotTarget = planTargets ? planTargets[slot] : null;
              const status = slotTarget ? slotStatus(eaten, slotTarget) : 'empty';
              const word = status === 'empty' ? '' : t(STATUS_KEYS[status]);
              const planLine = slotTarget
                ? t('today:slotPlan', {
                    eaten: formatCount(eaten.calories),
                    target: formatCount(slotTarget.calories),
                  })
                : null;

              return (
                <View key={slot} style={styles.slotBlock}>
                  <MealSection
                    slot={slot}
                    meals={grouped[slot]}
                    macros={eaten}
                    onAdd={() => openAdd(slot)}
                    onOpen={openMeal}
                    onDelete={handleDelete}
                  />
                  {planLine ? (
                    <View
                      accessible
                      accessibilityLabel={
                        word
                          ? t('today:slotPlanSpokenStatus', {
                              slot: foodLabels.slot(slot),
                              line: planLine,
                              status: word,
                            })
                          : t('today:slotPlanSpoken', {
                              slot: foodLabels.slot(slot),
                              line: planLine,
                            })
                      }
                      style={styles.slotPlan}
                    >
                      <Txt variant="caption" color="faint" tabular>
                        {planLine}
                      </Txt>
                      {word ? (
                        <Txt variant="caption" color={status === 'over' ? 'danger' : 'faint'}>
                          {`· ${word}`}
                        </Txt>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>

        {insights.length > 0 ? (
          <InsightList
            insights={insights}
            title={t('today:insightsTitle')}
            subtitle={t('today:insightsSubtitle')}
            style={styles.group}
          />
        ) : null}
      </Screen>

      <View style={styles.actionBar} pointerEvents="box-none">
        <View
          onLayout={handleActionBarLayout}
          style={[
            styles.actionCard,
            styles.actionShadow,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Button
            label={t('today:scanMeal')}
            icon="camera-outline"
            variant="secondary"
            onPress={openCamera}
            accessibilityHint={t('today:scanMealHint')}
            fullWidth
            style={styles.action}
          />
          <Button
            label={t('today:addFood')}
            icon="add"
            onPress={() => openAdd(currentSlot())}
            accessibilityHint={t('today:addFoodHint')}
            fullWidth
            style={styles.action}
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
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  streak: {
    alignItems: 'center',
    borderRadius: radius.pill,
    columnGap: spacing.xs,
    flexDirection: 'row',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  bleed: {
    marginHorizontal: -spacing.lg,
  },
  strip: {
    marginTop: spacing.lg,
  },
  summary: {
    marginTop: spacing.lg,
  },
  group: {
    marginTop: spacing.xl,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  sections: {
    rowGap: spacing.md,
  },
  slotBlock: {
    rowGap: spacing.xs,
  },
  slotPlan: {
    columnGap: spacing.xs,
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
  },
  trainingRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  glyph: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  trainingText: {
    flex: 1,
    rowGap: 1,
  },
  trainingMeta: {
    marginTop: 2,
  },
  trainingState: {
    alignItems: 'center',
    columnGap: spacing.xs,
    flexDirection: 'row',
  },
  actionBar: {
    bottom: spacing.lg,
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
  },
  actionCard: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    columnGap: spacing.sm,
    flexDirection: 'row',
    padding: spacing.sm,
  },
  action: {
    flex: 1,
  },
  actionShadow: Platform.select({
    android: { elevation: 8 },
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
    },
  }),
});
