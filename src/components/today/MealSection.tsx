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
import { IconButton, Txt } from '@/components/ui';
import { formatCount } from '@/domain/format';
import { slotStatus, type SlotStatus } from '@/domain/mealPlan';
import { mealMacros } from '@/domain/totals';
import { radius, spacing, useTheme } from '@/theme';
import type { Macros, Meal, MealSlot, Targets } from '@/types';

import { useDayLabels } from './useDayLabels';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface MealSectionProps {
  slot: MealSlot;
  meals: Meal[];
  /** The slot's subtotal, straight from DailyTotals.bySlot. */
  macros: Macros;
  /** This slot's share of the day, or null before the profile exists. */
  target: Targets | null;
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

/** Short word under a slot saying how it is tracking against its share. */
const STATUS_KEYS = {
  under: 'today:statusUnder',
  'on-track': 'today:statusOnTrack',
  over: 'today:statusOver',
} as const satisfies Record<Exclude<SlotStatus, 'empty'>, string>;

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
 * One slot of the day as a run of list rows: a two-line header, then a meal
 * per row. No card, no rules and no second figure at the end of the header —
 * the four slots are a single list, not four boxes.
 */
export function MealSection({
  slot,
  meals,
  macros,
  target,
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

  const status: SlotStatus = target ? slotStatus(macros, target) : 'empty';
  const word = status === 'empty' ? '' : t(STATUS_KEYS[status]);

  // The header's second line carries the slot's whole arithmetic, which is why
  // the header needs no trailing figure of its own.
  const planLine = target
    ? t('today:slotPlan', {
        eaten: formatCount(calories),
        target: formatCount(Math.round(target.calories)),
      })
    : empty
      ? t('common:notLoggedYet')
      : t('today:slotTotal', { value: formatCount(calories) });

  const headerSpoken = target
    ? word
      ? t('today:slotPlanSpokenStatus', { slot: label, line: planLine, status: word })
      : t('today:slotPlanSpoken', { slot: label, line: planLine })
    : t('today:slotTotalSpoken', { slot: label, value: formatCount(calories) });

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
      <Ionicons name={SLOT_GLYPHS[slot]} size={18} color={colors.textMuted} />
    </View>
  );

  const headerText = (
    /*
      Status and figures share one text run. Laid out as siblings Arabic
      reorders them, and two adjacent numbers read as one longer number.
    */
    <View style={styles.headerText}>
      <Txt numberOfLines={1}>{label}</Txt>
      <Txt variant="caption" color="faint" tabular numberOfLines={1} style={styles.headerMeta}>
        {planLine}
        {word ? (
          <Txt variant="caption" color={status === 'over' ? 'warning' : 'faint'}>
            {` · ${word}`}
          </Txt>
        ) : null}
      </Txt>
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
          accessibilityLabel={
            target
              ? t('today:logSlotPlan', { slot: label, line: planLine })
              : t('today:logSlot', { slot: label })
          }
          accessibilityHint={t('today:logSlotHint')}
          style={({ pressed }) => [
            styles.header,
            pressed ? [styles.pressed, { backgroundColor: colors.surfaceAlt }] : null,
          ]}
        >
          {glyph}
          {headerText}
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

        <View accessible accessibilityLabel={headerSpoken} style={styles.headerWrap}>
          {headerText}
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

      {meals.map((meal) => {
        const title = summarize(meal);
        const mealCalories = Math.round(mealMacros(meal).calories);
        const time = dayLabels.time(meal.loggedAt);
        const countText = foodLabels.items(meal.entries.length);

        return (
          /* The row and its delete action are siblings: a Pressable nested
             inside a Pressable renders an invalid <button> in <button>. */
          <View key={meal.id} style={styles.rowWrap}>
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
                // Empty, not a tone: a column of grey squares would be four
                // more objects on the page. The space only holds the indent.
                <View style={styles.thumb} {...DECORATIVE} />
              )}

              <View style={styles.rowText}>
                <Txt numberOfLines={1}>{title}</Txt>
                <Txt variant="label" color="faint" numberOfLines={1} style={styles.rowMeta}>
                  {time ? `${time} · ${countText}` : countText}
                </Txt>
              </View>

              {/* Figure and unit in one run: as siblings Arabic reorders them. */}
              <Txt variant="label" tabular numberOfLines={1} style={styles.rowFigure}>
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
  headerWrap: {
    flex: 1,
  },
  headerText: {
    flex: 1,
  },
  headerMeta: {
    marginTop: 3,
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
    minHeight: 56,
    paddingVertical: spacing.sm,
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
  rowFigure: {
    // A figure never shrinks or wraps to fit its column.
    flexShrink: 0,
  },
});
