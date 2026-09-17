import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useFoodLabels } from '@/components/meal/useFoodLabels';
import { Card, Divider, IconButton, Txt } from '@/components/ui';
import { formatCount } from '@/domain/format';
import { mealMacros } from '@/domain/totals';
import { radius, spacing, useTheme } from '@/theme';
import type { Macros, Meal, MealSlot } from '@/types';

import { useDayLabels } from './useDayLabels';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface MealSectionProps {
  slot: MealSlot;
  meals: Meal[];
  /** The slot's subtotal, straight from DailyTotals.bySlot. */
  macros: Macros;
  onAdd: () => void;
  onOpen: (meal: Meal) => void;
  /** Called only after the user confirms. */
  onDelete: (meal: Meal) => void;
  style?: StyleProp<ViewStyle>;
}

const SLOT_GLYPHS: Record<MealSlot, IconName> = {
  breakfast: 'partly-sunny-outline',
  lunch: 'sunny-outline',
  dinner: 'moon-outline',
  snack: 'ice-cream-outline',
};

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

function itemCount(meals: Meal[]): number {
  return meals.reduce((count, meal) => count + meal.entries.length, 0);
}

interface DeletePrompt {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}

/** react-native-web's Alert is a no-op, so fall back to the browser dialog. */
function confirmDelete(prompt: DeletePrompt): void {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || window.confirm(prompt.message)) prompt.onConfirm();
    return;
  }

  Alert.alert(prompt.title, prompt.message, [
    { text: prompt.cancelLabel, style: 'cancel' },
    { text: prompt.confirmLabel, style: 'destructive', onPress: prompt.onConfirm },
  ]);
}

export function MealSection({
  slot,
  meals,
  macros,
  onAdd,
  onOpen,
  onDelete,
  style,
}: MealSectionProps) {
  const { colors } = useTheme();
  const { t } = useTranslation(['today', 'common', 'units']);
  const foodLabels = useFoodLabels();
  const dayLabels = useDayLabels();

  const label = foodLabels.slot(slot);
  const calories = Math.round(macros.calories);
  const empty = meals.length === 0;

  // Meal names come from the entries the user logged, so they are shown as
  // they were saved rather than translated.
  const summarize = useCallback(
    (meal: Meal): string => {
      const names = meal.entries.map((entry) => entry.name).filter(Boolean);
      if (names.length === 0) return t('today:emptyMeal');
      if (names.length <= 2) return names.join(t('today:listSeparator'));
      return t('today:summaryMore', {
        first: names[0],
        second: names[1],
        value: formatCount(names.length - 2),
      });
    },
    [t],
  );

  const requestDelete = useCallback(
    (meal: Meal) => {
      const name = summarize(meal);
      confirmDelete({
        title: t('today:deleteTitle'),
        message: t('today:deleteMessage', { name }),
        confirmLabel: t('common:delete'),
        cancelLabel: t('common:cancel'),
        onConfirm: () => onDelete(meal),
      });
    },
    [onDelete, summarize, t],
  );

  const glyph = (
    <View style={[styles.glyph, { backgroundColor: colors.surfaceAlt }]} {...DECORATIVE}>
      <Ionicons name={SLOT_GLYPHS[slot]} size={18} color={colors.accent} />
    </View>
  );

  // An empty slot is one quiet affordance: the whole header is the tap target,
  // so there is no button inside a button and nothing extra to read out.
  if (empty) {
    return (
      <Card padded={false} style={style}>
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={t('today:logSlot', { slot: label })}
          accessibilityHint={t('today:logSlotHint')}
          style={({ pressed }) => [
            styles.header,
            pressed ? { backgroundColor: colors.surfaceAlt } : null,
          ]}
        >
          {glyph}
          <View style={styles.headerText}>
            <Txt weight="semibold">{label}</Txt>
            <Txt variant="label" color="faint">
              {t('common:notLoggedYet')}
            </Txt>
          </View>
          <View style={styles.addHint} {...DECORATIVE}>
            <Ionicons name="add" size={20} color={colors.textFaint} />
          </View>
        </Pressable>
      </Card>
    );
  }

  const items = itemCount(meals);

  return (
    <Card padded={false} style={style}>
      <View style={styles.header}>
        {glyph}

        <View style={styles.headerText}>
          <Txt weight="semibold">{label}</Txt>
          <Txt variant="label" color="muted">
            {foodLabels.items(items)}
          </Txt>
        </View>

        <View
          accessible
          accessibilityLabel={t('today:slotTotalSpoken', {
            slot: label,
            value: formatCount(calories),
          })}
          style={styles.subtotal}
        >
          <Txt variant="label" weight="bold" tabular>
            {formatCount(calories)}
          </Txt>
          <Txt variant="label" color="faint">
            {t('units:kcal')}
          </Txt>
        </View>

        <IconButton
          icon="add"
          onPress={onAdd}
          accessibilityLabel={t('today:addToSlot', { slot: label })}
          variant="surface"
          size={18}
        />
      </View>

      {meals.map((meal, index) => {
        const title = summarize(meal);
        const mealCalories = Math.round(mealMacros(meal).calories);
        const time = dayLabels.time(meal.loggedAt);
        const countText = foodLabels.items(meal.entries.length);

        return (
          <View key={meal.id}>
            <Divider inset={index > 0} />
            {/* The row and its delete action are siblings: a Pressable nested
                inside a Pressable renders an invalid <button> in <button>. */}
            <View style={styles.rowWrap}>
              <Pressable
                onPress={() => onOpen(meal)}
                onLongPress={() => requestDelete(meal)}
                delayLongPress={350}
                accessibilityRole="button"
                accessibilityLabel={
                  time
                    ? t('today:mealSpokenAt', {
                        title,
                        value: formatCount(mealCalories),
                        time,
                      })
                    : t('today:mealSpoken', { title, value: formatCount(mealCalories) })
                }
                accessibilityHint={t('today:openMealHint')}
                style={({ pressed }) => [
                  styles.row,
                  pressed ? { backgroundColor: colors.surfaceAlt } : null,
                ]}
              >
                {meal.photoUri ? (
                  <Image
                    source={{ uri: meal.photoUri }}
                    style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}
                    contentFit="cover"
                    transition={120}
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <View
                    style={[styles.thumb, styles.thumbFallback, { backgroundColor: colors.surfaceAlt }]}
                    {...DECORATIVE}
                  >
                    <Ionicons name={SLOT_GLYPHS[slot]} size={15} color={colors.textFaint} />
                  </View>
                )}

                <View style={styles.rowText}>
                  <Txt weight="medium" numberOfLines={1}>
                    {title}
                  </Txt>
                  <Txt variant="label" color="muted" numberOfLines={1} style={styles.rowMeta}>
                    {time ? `${time} · ${countText}` : countText}
                  </Txt>
                </View>

                <View style={styles.rowValue}>
                  <Txt variant="label" weight="semibold" tabular>
                    {formatCount(mealCalories)}
                  </Txt>
                  <Txt variant="caption" color="faint">
                    {t('units:kcal')}
                  </Txt>
                </View>
              </Pressable>

              <IconButton
                icon="trash-outline"
                onPress={() => requestDelete(meal)}
                accessibilityLabel={t('today:deleteLabel', { name: title })}
                size={16}
                color={colors.textFaint}
              />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 64,
    paddingStart: spacing.lg,
    paddingEnd: spacing.sm,
    paddingVertical: spacing.md,
  },
  glyph: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerText: {
    flex: 1,
    rowGap: 1,
  },
  addHint: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  subtotal: {
    alignItems: 'baseline',
    columnGap: spacing.xs,
    flexDirection: 'row',
  },
  rowWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingEnd: spacing.xs,
  },
  row: {
    alignItems: 'center',
    columnGap: spacing.md,
    flex: 1,
    flexDirection: 'row',
    minHeight: 62,
    paddingStart: spacing.lg,
    paddingEnd: spacing.sm,
    paddingVertical: spacing.sm,
  },
  thumb: {
    borderRadius: radius.md,
    height: 40,
    width: 40,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowMeta: {
    marginTop: 2,
  },
  rowValue: {
    alignItems: 'flex-end',
  },
});
