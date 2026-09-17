import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Badge, Txt } from '@/components/ui';
import { defaultServing } from '@/data/foodSearch';
import { CATEGORY_LABELS } from '@/data/foods';
import { macrosForGrams } from '@/domain/nutrition';
import { spacing, useTheme } from '@/theme';
import type { FoodItem } from '@/types';

import { formatCount } from '../../../app/onboarding/_layout';

export interface FoodResultRowProps {
  food: FoodItem;
  onPress: (food: FoodItem) => void;
  /** Flags a food the user created rather than one from the bundled database. */
  custom?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** One search hit: what the food is called, and what a normal portion costs. */
export function FoodResultRow({ food, onPress, custom = false, style }: FoodResultRowProps) {
  const { colors } = useTheme();

  const serving = useMemo(() => defaultServing(food), [food]);
  const calories = useMemo(
    () => macrosForGrams(food.per100, serving.grams).calories,
    [food, serving],
  );

  const meta = [food.brand, CATEGORY_LABELS[food.category], serving.label]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <Pressable
      onPress={() => onPress(food)}
      accessibilityRole="button"
      accessibilityLabel={`${food.name}, ${formatCount(calories)} kilocalories per ${serving.label}${
        custom ? ', your own food' : ''
      }`}
      accessibilityHint="Opens portion options"
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.surfaceAlt } : null,
        style,
      ]}
    >
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Txt weight="semibold" numberOfLines={1} style={styles.title}>
            {food.name}
          </Txt>
          {custom ? <Badge label="Yours" tone="accent" /> : null}
        </View>

        {food.nameAr ? (
          <Txt variant="label" color="muted" numberOfLines={1} style={styles.arabic}>
            {food.nameAr}
          </Txt>
        ) : null}

        <Txt variant="caption" color="faint" numberOfLines={1} style={styles.meta}>
          {meta}
        </Txt>
      </View>

      <View style={styles.energy}>
        <Txt variant="heading" tabular numberOfLines={1}>
          {formatCount(calories)}
        </Txt>
        <Txt variant="caption" color="faint" style={styles.unit}>
          kcal
        </Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  text: {
    flex: 1,
  },
  titleRow: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  title: {
    flexShrink: 1,
  },
  arabic: {
    marginTop: 2,
  },
  meta: {
    marginTop: 3,
  },
  energy: {
    alignItems: 'flex-end',
    minWidth: 56,
  },
  unit: {
    marginTop: 1,
  },
});
