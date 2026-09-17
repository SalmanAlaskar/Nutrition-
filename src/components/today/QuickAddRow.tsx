import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useFoodLabels } from '@/components/meal/useFoodLabels';
import { Chip, Txt } from '@/components/ui';
import { defaultServing, entryFromFood, popularFoods } from '@/data/foodSearch';
import { currentSlot } from '@/domain/date';
import { makeId } from '@/domain/id';
import { useApp } from '@/state/AppStore';
import { spacing, useTheme } from '@/theme';
import type { FoodItem, Meal } from '@/types';

export interface QuickAddRowProps {
  /** Day the tapped food is logged against. */
  date: string;
  style?: StyleProp<ViewStyle>;
}

const MAX_SUGGESTIONS = 12;
const FEEDBACK_MS = 1600;

interface Feedback {
  foodId: string;
  ok: boolean;
}

export function QuickAddRow({ date, style }: QuickAddRowProps) {
  const { addMeal, customFoods } = useApp();
  const { colors } = useTheme();
  const { t } = useTranslation('today');
  const labels = useFoodLabels();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slot = currentSlot();
  const foods = useMemo(
    () => popularFoods(customFoods).slice(0, MAX_SUGGESTIONS),
    [customFoods],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flash = useCallback((next: Feedback) => {
    if (timer.current) clearTimeout(timer.current);
    setFeedback(next);
    timer.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
  }, []);

  const handleAdd = useCallback(
    async (food: FoodItem) => {
      const serving = defaultServing(food);
      const meal: Meal = {
        id: makeId('m'),
        date,
        loggedAt: new Date().toISOString(),
        slot,
        entries: [entryFromFood(food, serving.grams, serving.label)],
      };

      try {
        await addMeal(meal);
        flash({ foodId: food.id, ok: true });
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => undefined,
          );
        }
      } catch (error) {
        console.warn('[today] quick add failed', error);
        flash({ foodId: food.id, ok: false });
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
            () => undefined,
          );
        }
      }
    },
    [addMeal, date, flash, slot],
  );

  if (foods.length === 0) return null;

  return (
    <View style={style}>
      <View style={styles.heading}>
        <Txt variant="caption" color="faint" weight="semibold">
          {t('quickAddTitle')}
        </Txt>
        <Txt variant="label" color="muted" style={styles.hint}>
          {t('quickAddHint', { slot: labels.slot(slot) })}
        </Txt>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {foods.map((food) => {
          const state = feedback?.foodId === food.id ? feedback : null;
          // The chip carries its own result for a beat: the list is long and a
          // toast somewhere else would not say which food landed.
          const label = state
            ? state.ok
              ? t('quickAddDone')
              : t('quickAddFailed')
            : labels.name(food);
          const icon = state
            ? state.ok
              ? 'checkmark-circle'
              : 'alert-circle'
            : 'add-circle-outline';

          return (
            <Chip
              key={food.id}
              label={label}
              icon={icon}
              selected={state !== null}
              color={state?.ok === false ? colors.danger : undefined}
              onPress={() => {
                void handleAdd(food);
              }}
              style={styles.chip}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    paddingHorizontal: spacing.lg,
    rowGap: 2,
  },
  hint: {
    marginTop: 1,
  },
  content: {
    columnGap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  chip: {
    minHeight: 44,
  },
});
