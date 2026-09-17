import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useCallback } from 'react';
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

import { Card, Divider, IconButton, Txt } from '@/components/ui';
import { formatTime } from '@/domain/date';
import { SLOT_LABELS, mealMacros } from '@/domain/totals';
import { radius, spacing, useTheme } from '@/theme';
import type { Macros, Meal, MealSlot } from '@/types';

import { formatCount } from '../../../app/onboarding/_layout';

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

function metaLine(meal: Meal): string {
  const count = meal.entries.length;
  const items = `${count} item${count === 1 ? '' : 's'}`;
  const time = formatTime(meal.loggedAt);
  return time ? `${time} · ${items}` : items;
}

function summarize(meal: Meal): string {
  const names = meal.entries.map((entry) => entry.name).filter(Boolean);
  if (names.length === 0) return 'Empty meal';
  if (names.length <= 2) return names.join(', ');
  return `${names[0]}, ${names[1]} +${names.length - 2} more`;
}

/** react-native-web's Alert is a no-op, so fall back to the browser dialog. */
function confirmDelete(title: string, onConfirm: () => void): void {
  const message = `Delete "${title}"? This cannot be undone.`;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || window.confirm(message)) onConfirm();
    return;
  }

  Alert.alert('Delete meal', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
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
  const label = SLOT_LABELS[slot];
  const calories = Math.round(macros.calories);
  const empty = meals.length === 0;

  const requestDelete = useCallback(
    (meal: Meal) => confirmDelete(summarize(meal), () => onDelete(meal)),
    [onDelete],
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
          accessibilityLabel={`Log ${label.toLowerCase()}`}
          accessibilityHint="Opens food search for this meal"
          style={({ pressed }) => [
            styles.header,
            pressed ? { backgroundColor: colors.surfaceAlt } : null,
          ]}
        >
          {glyph}
          <View style={styles.headerText}>
            <Txt weight="semibold">{label}</Txt>
            <Txt variant="label" color="faint">
              Nothing logged yet
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
            {`${items} item${items === 1 ? '' : 's'}`}
          </Txt>
        </View>

        <View
          accessible
          accessibilityLabel={`${label} total, ${formatCount(calories)} kilocalories`}
          style={styles.subtotal}
        >
          <Txt variant="label" weight="bold" tabular>
            {formatCount(calories)}
          </Txt>
          <Txt variant="label" color="faint">
            kcal
          </Txt>
        </View>

        <IconButton
          icon="add"
          onPress={onAdd}
          accessibilityLabel={`Add food to ${label}`}
          variant="surface"
          size={18}
        />
      </View>

      {meals.map((meal, index) => {
        const title = summarize(meal);
        const mealCalories = Math.round(mealMacros(meal).calories);
        const time = formatTime(meal.loggedAt);

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
                accessibilityLabel={`${title}, ${mealCalories} kilocalories${time ? `, ${time}` : ''}`}
                accessibilityHint="Opens the meal"
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
                    {metaLine(meal)}
                  </Txt>
                </View>

                <View style={styles.rowValue}>
                  <Txt variant="label" weight="semibold" tabular>
                    {formatCount(mealCalories)}
                  </Txt>
                  <Txt variant="caption" color="faint">
                    kcal
                  </Txt>
                </View>
              </Pressable>

              <IconButton
                icon="trash-outline"
                onPress={() => requestDelete(meal)}
                accessibilityLabel={`Delete ${title}`}
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
