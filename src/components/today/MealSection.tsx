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
import { Divider, IconButton, Txt } from '@/components/ui';
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

/** A slot glyph is the fastest way to tell four meals apart, so it stays. */
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

/** Thumbnail size, and the indent everything under a slot header lines up to. */
const THUMB = 38;
const ROW_INDENT = THUMB + spacing.md;

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

/**
 * One slot of the day as a run of list rows: a header line, then a meal per
 * row. No card — the four slots are a single list, not four boxes.
 */
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

  // Flat and muted: four accent bubbles would be four accents on one screen.
  const glyph = (
    <View style={styles.glyph} {...DECORATIVE}>
      <Ionicons name={SLOT_GLYPHS[slot]} size={19} color={colors.textMuted} />
    </View>
  );

  // An empty slot is one quiet affordance: the whole line is the tap target,
  // so there is no button inside a button and nothing extra to read out.
  if (empty) {
    return (
      <View style={style}>
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={t('today:logSlot', { slot: label })}
          accessibilityHint={t('today:logSlotHint')}
          style={({ pressed }) => [
            styles.header,
            pressed ? [styles.pressed, { backgroundColor: colors.surfaceAlt }] : null,
          ]}
        >
          {glyph}
          <Txt weight="semibold" numberOfLines={1} style={styles.headerTitle}>
            {label}
          </Txt>
          <Txt variant="label" color="faint" numberOfLines={1}>
            {t('common:notLoggedYet')}
          </Txt>
          <View style={styles.addGlyph} {...DECORATIVE}>
            <Ionicons name="add" size={20} color={colors.textFaint} />
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={style}>
      <View style={styles.header}>
        {glyph}

        <Txt weight="semibold" numberOfLines={1} style={styles.headerTitle}>
          {label}
        </Txt>

        <View
          accessible
          accessibilityLabel={t('today:slotTotalSpoken', {
            slot: label,
            value: formatCount(calories),
          })}
        >
          {/* Figure and unit in one run: as siblings Arabic reorders them. */}
          <Txt variant="label" weight="semibold" tabular numberOfLines={1}>
            {formatCount(calories)}
            <Txt variant="caption" color="faint" weight="regular">
              {` ${t('units:kcal')}`}
            </Txt>
          </Txt>
        </View>

        <IconButton
          icon="add"
          onPress={onAdd}
          accessibilityLabel={t('today:addToSlot', { slot: label })}
          size={18}
          color={colors.textMuted}
          style={styles.addButton}
        />
      </View>

      {meals.map((meal, index) => {
        const title = summarize(meal);
        const mealCalories = Math.round(mealMacros(meal).calories);
        const time = dayLabels.time(meal.loggedAt);
        const countText = foodLabels.items(meal.entries.length);

        return (
          <View key={meal.id}>
            {index > 0 ? <Divider style={styles.rowDivider} /> : null}
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
                  pressed ? [styles.pressed, { backgroundColor: colors.surfaceAlt }] : null,
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
                  // A plain tone, not a repeat of the slot glyph above it: the
                  // square is here to keep the list aligned, nothing more.
                  <View
                    style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]}
                    {...DECORATIVE}
                  />
                )}

                <View style={styles.rowText}>
                  <Txt numberOfLines={1}>{title}</Txt>
                  <Txt variant="label" color="muted" numberOfLines={1} style={styles.rowMeta}>
                    {time ? `${time} · ${countText}` : countText}
                  </Txt>
                </View>

                <Txt variant="label" tabular numberOfLines={1}>
                  {formatCount(mealCalories)}
                  <Txt variant="caption" color="faint">
                    {` ${t('units:kcal')}`}
                  </Txt>
                </Txt>
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
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 52,
  },
  headerTitle: {
    flex: 1,
  },
  glyph: {
    alignItems: 'center',
    justifyContent: 'center',
    width: THUMB,
  },
  addGlyph: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  addButton: {
    marginEnd: -spacing.sm,
  },
  pressed: {
    borderRadius: radius.md,
  },
  rowWrap: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  row: {
    alignItems: 'center',
    columnGap: spacing.md,
    flex: 1,
    flexDirection: 'row',
    minHeight: 58,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    marginStart: ROW_INDENT,
    width: 'auto',
  },
  thumb: {
    borderRadius: radius.md,
    height: THUMB,
    width: THUMB,
  },
  rowText: {
    flex: 1,
  },
  rowMeta: {
    marginTop: 2,
  },
});
