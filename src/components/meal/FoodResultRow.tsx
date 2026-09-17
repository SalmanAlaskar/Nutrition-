import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Badge, Txt } from '@/components/ui';
import { defaultServing } from '@/data/foodSearch';
import { formatCount } from '@/domain/format';
import { macrosForGrams } from '@/domain/nutrition';
import { spacing, useTheme } from '@/theme';
import type { FoodItem } from '@/types';

import { useFoodLabels } from './useFoodLabels';

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
  const { t } = useTranslation(['meals', 'units']);
  const labels = useFoodLabels();

  const serving = useMemo(() => defaultServing(food), [food]);
  const calories = useMemo(
    () => macrosForGrams(food.per100, serving.grams).calories,
    [food, serving],
  );

  const portion = labels.portion(serving.label, serving.grams, food.liquid);
  const secondary = labels.secondaryName(food);
  const meta = [food.brand, labels.category(food.category), portion]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  const spoken = t('meals:resultSpoken', {
    name: labels.name(food),
    value: formatCount(calories),
    portion,
  });

  return (
    <Pressable
      onPress={() => onPress(food)}
      accessibilityRole="button"
      accessibilityLabel={custom ? `${spoken}. ${t('meals:yoursSpoken')}` : spoken}
      accessibilityHint={t('meals:resultHint')}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.surfaceAlt } : null,
        style,
      ]}
    >
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Txt weight="semibold" numberOfLines={1} style={styles.title}>
            {labels.name(food)}
          </Txt>
          {custom ? <Badge label={t('meals:yours')} tone="accent" /> : null}
        </View>

        {secondary ? (
          <Txt variant="label" color="muted" numberOfLines={1} style={styles.secondary}>
            {secondary}
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
          {t('units:kcal')}
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
  secondary: {
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
