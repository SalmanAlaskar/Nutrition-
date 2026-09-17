import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { formatAmount, formatCount } from '@/domain/format';
import { useDirection } from '@/i18n';
import type { FoodCategory, FoodItem, Macros, MealSlot } from '@/types';

/**
 * How a food, a portion and its nutrients read in the current language.
 *
 * Names come from the data, never from a translation: a food carries its own
 * Arabic name and the reader's language only decides which of the two leads.
 * Portion labels are data too. The bundled database writes them in English
 * ("1 cup cooked (160 g)"), and a food the user typed in Arabic carries Arabic
 * words, so an Arabic reader is shown the label when it is in their script and
 * the plain weight when it is not.
 */
export interface FoodLabels {
  /** The name that leads: Arabic first for an Arabic reader, when there is one. */
  name(food: FoodItem): string;
  /** The other name, or undefined when the food only has one. */
  secondaryName(food: FoodItem): string | undefined;
  category(category: FoodCategory): string;
  /** The name of a meal slot, from the slots namespace. */
  slot(slot: MealSlot): string;
  /** A weight or a volume, e.g. '160 g'. */
  weight(grams: number, liquid?: boolean): string;
  /** A serving's own words when they suit the reader, the weight otherwise. */
  portion(label: string | undefined, grams: number, liquid?: boolean): string;
  /** 'P 12 g · C 30 g · F 4 g'. */
  macroLine(macros: Macros): string;
  /** The same three figures, spelled out for a screen reader. */
  macroSpoken(macros: Macros): string;
  /** '1 item' or '4 items'. */
  items(count: number): string;
}

const CATEGORY_KEYS = {
  grains: 'meals:categoryGrains',
  protein: 'meals:categoryProtein',
  dairy: 'meals:categoryDairy',
  vegetables: 'meals:categoryVegetables',
  fruit: 'meals:categoryFruit',
  legumes: 'meals:categoryLegumes',
  nuts: 'meals:categoryNuts',
  fats: 'meals:categoryFats',
  beverages: 'meals:categoryBeverages',
  sweets: 'meals:categorySweets',
  fastfood: 'meals:categoryFastfood',
  dishes: 'meals:categoryDishes',
  condiments: 'meals:categoryCondiments',
} as const satisfies Record<FoodCategory, string>;

const SLOT_KEYS = {
  breakfast: 'slots:breakfast',
  lunch: 'slots:lunch',
  dinner: 'slots:dinner',
  snack: 'slots:snack',
} as const satisfies Record<MealSlot, string>;

/** Every category, in the order the filters and the picker show them. */
export const FOOD_CATEGORIES = Object.keys(CATEGORY_KEYS) as FoodCategory[];

/** Any Arabic letter; enough to tell whether a label reads in Arabic. */
const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

export function useFoodLabels(): FoodLabels {
  const { t } = useTranslation(['meals', 'slots', 'units']);
  const { isRTL } = useDirection();

  return useMemo<FoodLabels>(() => {
    const weight = (grams: number, liquid = false): string =>
      t(liquid ? 'meals:millilitresAmount' : 'meals:gramsAmount', {
        amount: formatAmount(grams, 1),
      });

    return {
      weight,
      name(food) {
        return isRTL ? food.nameAr ?? food.name : food.name;
      },
      secondaryName(food) {
        if (!food.nameAr) return undefined;
        return isRTL ? food.name : food.nameAr;
      },
      category(category) {
        return t(CATEGORY_KEYS[category]);
      },
      slot(slot) {
        return t(SLOT_KEYS[slot]);
      },
      portion(label, grams, liquid = false) {
        if (!label) return weight(grams, liquid);
        if (!isRTL || ARABIC_SCRIPT.test(label)) return label;
        return weight(grams, liquid);
      },
      macroLine(macros) {
        return [
          `${t('meals:macroShortProtein')} ${weight(macros.protein)}`,
          `${t('meals:macroShortCarbs')} ${weight(macros.carbs)}`,
          `${t('meals:macroShortFat')} ${weight(macros.fat)}`,
        ].join(' · ');
      },
      macroSpoken(macros) {
        return t('meals:macroSpoken', {
          protein: formatAmount(macros.protein, 1),
          carbs: formatAmount(macros.carbs, 1),
          fat: formatAmount(macros.fat, 1),
        });
      },
      items(count) {
        return count === 1
          ? t('meals:itemsOne')
          : t('meals:itemsOther', { value: formatCount(count) });
      },
    };
  }, [t, isRTL]);
}
