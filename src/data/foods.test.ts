/// <reference types="jest" />
import { caloriesFromMacros } from '@/domain/nutrition';
import type { FoodCategory, FoodItem } from '@/types';

import { CATEGORY_LABELS, FOODS, FOOD_BY_ID, QUICK_ADD_IDS } from './foods';

/** Every nutrient field a row may carry, so none is checked by accident. */
const NUTRIENT_KEYS = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium'] as const;

/** Rows that break `check`, named by id so a failure points at the data. */
function offenders(check: (food: FoodItem) => boolean): string[] {
  return FOODS.filter((food) => !check(food)).map((food) => food.id);
}

describe('the bundled food database', () => {
  it('is large enough to be useful offline', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(240);
  });

  it('gives every food a unique id', () => {
    const seen = new Map<string, number>();
    for (const food of FOODS) seen.set(food.id, (seen.get(food.id) ?? 0) + 1);
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
    expect(duplicates).toEqual([]);
  });

  it('gives every food a non-empty id and name', () => {
    expect(offenders((food) => food.id.trim().length > 0 && food.name.trim().length > 0)).toEqual(
      [],
    );
  });

  it('gives every food at least one serving, each with positive grams', () => {
    expect(
      offenders(
        (food) =>
          food.servings.length > 0 &&
          food.servings.every(
            (serving) =>
              serving.label.trim().length > 0 &&
              Number.isFinite(serving.grams) &&
              serving.grams > 0,
          ),
      ),
    ).toEqual([]);
  });

  it('keeps every nutrient finite and non-negative', () => {
    expect(
      offenders((food) =>
        NUTRIENT_KEYS.every((key) => {
          const value = food.per100[key];
          if (value === undefined) return key !== 'calories';
          return Number.isFinite(value) && value >= 0;
        }),
      ),
    ).toEqual([]);
  });

  it('keeps the listed calories within 12% of the 4/4/9 figure implied by the macros', () => {
    const wrong = FOODS.filter((food) => {
      const implied = caloriesFromMacros(food.per100);
      return Math.abs(food.per100.calories - implied) > implied * 0.12;
    }).map((food) => {
      const implied = caloriesFromMacros(food.per100);
      return `${food.id} (listed ${food.per100.calories}, macros imply ${implied})`;
    });
    expect(wrong).toEqual([]);
  });

  it('keeps sub-nutrients inside their parent macro', () => {
    // Sugar is a carbohydrate and fibre is counted as one in these tables.
    expect(
      offenders((food) => (food.per100.sugar ?? 0) <= food.per100.carbs + 0.5),
    ).toEqual([]);
  });

  it('gives every food a category that CATEGORY_LABELS names', () => {
    const labelled = new Set(Object.keys(CATEGORY_LABELS));
    const used = new Set<FoodCategory>(FOODS.map((food) => food.category));
    const unlabelled = [...used].filter((category) => !labelled.has(category));
    expect(unlabelled).toEqual([]);
    for (const category of used) {
      expect(CATEGORY_LABELS[category].trim().length).toBeGreaterThan(0);
    }
  });

  it('never leaves an alias or Arabic name blank', () => {
    expect(
      offenders(
        (food) =>
          (food.aliases ?? []).every((alias) => alias.trim().length > 0) &&
          (food.nameAr === undefined || food.nameAr.trim().length > 0),
      ),
    ).toEqual([]);
  });
});

describe('FOOD_BY_ID', () => {
  it('covers every entry in FOODS', () => {
    const missing = FOODS.filter((food) => FOOD_BY_ID[food.id] !== food).map((food) => food.id);
    expect(missing).toEqual([]);
  });

  it('holds nothing that is not in FOODS', () => {
    const ids = new Set(FOODS.map((food) => food.id));
    const extra = Object.keys(FOOD_BY_ID).filter((id) => !ids.has(id));
    expect(extra).toEqual([]);
    expect(Object.keys(FOOD_BY_ID)).toHaveLength(FOODS.length);
  });
});

describe('QUICK_ADD_IDS', () => {
  it('resolves every id to a real food', () => {
    const dangling = QUICK_ADD_IDS.filter((id) => FOOD_BY_ID[id] === undefined);
    expect(dangling).toEqual([]);
  });

  it('lists each food only once and is not empty', () => {
    expect(QUICK_ADD_IDS.length).toBeGreaterThan(0);
    expect(new Set(QUICK_ADD_IDS).size).toBe(QUICK_ADD_IDS.length);
  });
});
