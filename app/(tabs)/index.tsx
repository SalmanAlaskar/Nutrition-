import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type LayoutChangeEvent,
} from 'react-native';

import { CalorieSummary } from '@/components/today/CalorieSummary';
import { DayStrip } from '@/components/today/DayStrip';
import { MealSection } from '@/components/today/MealSection';
import { QuickAddRow } from '@/components/today/QuickAddRow';
import { AppHeader, Button, IconButton, LoadingView, Screen, Txt } from '@/components/ui';
import { currentSlot, formatDayLabel, formatShortDay, todayKey } from '@/domain/date';
import { MEAL_SLOTS, loggingStreak, mealsBySlot } from '@/domain/totals';
import { useApp } from '@/state/AppStore';
import { radius, spacing, useTheme } from '@/theme';
import type { Meal, MealSlot } from '@/types';

import { formatCount } from '../onboarding/_layout';

/**
 * Height assumed for the floating actions until they report their own, so the
 * first frame never hides a card either. The real value replaces it on layout.
 */
const ACTION_BAR_ESTIMATE = 64;
/** Gap between the last card and the top of the floating actions. */
const ACTION_BAR_GAP = spacing.lg;

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

export default function TodayScreen() {
  const {
    ready,
    selectedDate,
    meals,
    totals,
    targets,
    loggedDates,
    setSelectedDate,
    deleteMeal,
    refresh,
  } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [actionBarHeight, setActionBarHeight] = useState(ACTION_BAR_ESTIMATE);

  const grouped = useMemo(() => mealsBySlot(meals), [meals]);
  const streak = useMemo(() => loggingStreak(loggedDates, todayKey()), [loggedDates]);

  const title = formatDayLabel(selectedDate);
  const shortDate = formatShortDay(selectedDate);

  // The bar floats over the scroll view, so its measured height plus the inset
  // it sits on is exactly the room the content needs underneath. The tab bar
  // is below the scene, not over it, and is already out of the way.
  const contentStyle = useMemo(
    () => ({ paddingBottom: actionBarHeight + spacing.lg + ACTION_BAR_GAP }),
    [actionBarHeight],
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
        <LoadingView message="Loading your day" />
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
              {streak >= 2 ? (
                <View
                  accessible
                  accessibilityLabel={`${streak} day logging streak`}
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
                accessibilityLabel="Settings"
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
              MEALS
            </Txt>
            {totals.mealCount > 0 ? (
              <Txt variant="caption" color="faint" tabular>
                {`${formatCount(totals.macros.calories)} KCAL`}
              </Txt>
            ) : null}
          </View>

          <View style={styles.sections}>
            {MEAL_SLOTS.map((slot) => (
              <MealSection
                key={slot}
                slot={slot}
                meals={grouped[slot]}
                macros={totals.bySlot[slot]}
                onAdd={() => openAdd(slot)}
                onOpen={openMeal}
                onDelete={handleDelete}
              />
            ))}
          </View>
        </View>
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
            label="Scan meal"
            icon="camera-outline"
            variant="secondary"
            onPress={openCamera}
            accessibilityHint="Opens the camera to log a meal from a photo"
            fullWidth
            style={styles.action}
          />
          <Button
            label="Add food"
            icon="add"
            onPress={() => openAdd(currentSlot())}
            accessibilityHint="Opens food search for the current meal"
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
