/// <reference types="jest" />
import type { Macros, Meal, MealEntry, MealSlot, Targets } from '@/types';

import {
  MEAL_SLOTS,
  averageCalories,
  dailyTotals,
  loggingStreak,
  mealMacros,
  mealsBySlot,
  remainingBudget,
  totalMacros,
} from './totals';

const entry = (macros: Partial<Macros>, name = 'Food'): MealEntry => ({
  id: `e_${name}_${macros.calories ?? 0}`,
  name,
  quantityGrams: 100,
  macros: { calories: 0, protein: 0, carbs: 0, fat: 0, ...macros },
  source: 'database',
});

const meal = (
  id: string,
  slot: MealSlot,
  entries: MealEntry[],
  date = '2024-03-10',
): Meal => ({
  id,
  date,
  loggedAt: `${date}T08:00:00.000Z`,
  slot,
  entries,
});

describe('mealMacros', () => {
  it('sums every entry in the meal', () => {
    const m = meal('m1', 'breakfast', [
      entry({ calories: 200, protein: 10.5, carbs: 20.2, fat: 5.1 }, 'a'),
      entry({ calories: 150, protein: 4.5, carbs: 9.8, fat: 2.9 }, 'b'),
    ]);
    expect(mealMacros(m)).toEqual({ calories: 350, protein: 15, carbs: 30, fat: 8 });
  });

  it('returns zeros for a meal with no entries', () => {
    expect(mealMacros(meal('m0', 'lunch', []))).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });

  it('carries optional nutrients through from the entries that have them', () => {
    const m = meal('m2', 'lunch', [
      entry({ calories: 100, fiber: 3 }, 'a'),
      entry({ calories: 100, sodium: 250 }, 'b'),
    ]);
    expect(mealMacros(m).fiber).toBe(3);
    expect(mealMacros(m).sodium).toBe(250);
  });
});

describe('totalMacros', () => {
  it('sums across meals', () => {
    const meals = [
      meal('m1', 'breakfast', [entry({ calories: 300, protein: 20, carbs: 30, fat: 10 })]),
      meal('m2', 'dinner', [entry({ calories: 700, protein: 40, carbs: 60, fat: 25 })]),
    ];
    expect(totalMacros(meals)).toEqual({ calories: 1000, protein: 60, carbs: 90, fat: 35 });
  });

  it('returns zeros for no meals', () => {
    expect(totalMacros([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe('mealsBySlot', () => {
  it('always returns all four slots', () => {
    const grouped = mealsBySlot([]);
    expect(Object.keys(grouped).sort()).toEqual([...MEAL_SLOTS].sort());
    for (const slot of MEAL_SLOTS) expect(grouped[slot]).toEqual([]);
  });

  it('routes meals to their own slot, preserving order', () => {
    const a = meal('a', 'lunch', []);
    const b = meal('b', 'lunch', []);
    const c = meal('c', 'dinner', []);
    const grouped = mealsBySlot([a, c, b]);
    expect(grouped.lunch).toEqual([a, b]);
    expect(grouped.dinner).toEqual([c]);
    expect(grouped.breakfast).toEqual([]);
  });

  it('routes an unrecognised slot into snack rather than dropping the meal', () => {
    const stray = meal('stray', 'brunch' as MealSlot, [entry({ calories: 400 })]);
    const grouped = mealsBySlot([stray]);
    expect(grouped.snack).toEqual([stray]);
    const found = MEAL_SLOTS.flatMap((slot) => grouped[slot]);
    expect(found).toHaveLength(1);
  });
});

describe('dailyTotals', () => {
  const meals = [
    meal('m1', 'breakfast', [
      entry({ calories: 300, protein: 20, carbs: 30, fat: 10 }, 'a'),
      entry({ calories: 100, protein: 5, carbs: 10, fat: 2 }, 'b'),
    ]),
    meal('m2', 'dinner', [entry({ calories: 700, protein: 40, carbs: 60, fat: 25 }, 'c')]),
    meal('m3', 'snack', [entry({ calories: 200, protein: 3, carbs: 25, fat: 8 }, 'd')]),
  ];

  it('reports the date, the macros and both counts', () => {
    const totals = dailyTotals('2024-03-10', meals);
    expect(totals.date).toBe('2024-03-10');
    expect(totals.mealCount).toBe(3);
    expect(totals.entryCount).toBe(4);
    expect(totals.macros).toEqual({ calories: 1300, protein: 68, carbs: 125, fat: 45 });
  });

  it('breaks the day down per slot', () => {
    const totals = dailyTotals('2024-03-10', meals);
    expect(totals.bySlot.breakfast).toEqual({ calories: 400, protein: 25, carbs: 40, fat: 12 });
    expect(totals.bySlot.lunch).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(totals.bySlot.dinner).toEqual({ calories: 700, protein: 40, carbs: 60, fat: 25 });
    expect(totals.bySlot.snack).toEqual({ calories: 200, protein: 3, carbs: 25, fat: 8 });
    const slotCalories = MEAL_SLOTS.reduce(
      (sum, slot) => sum + totals.bySlot[slot].calories,
      0,
    );
    expect(slotCalories).toBe(totals.macros.calories);
  });

  it('reports an empty day', () => {
    const totals = dailyTotals('2024-03-11', []);
    expect(totals.mealCount).toBe(0);
    expect(totals.entryCount).toBe(0);
    expect(totals.macros).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe('remainingBudget', () => {
  const targets: Targets = { calories: 2000, protein: 150, carbs: 200, fat: 60 };

  it('reports what is left while under the target', () => {
    const budget = remainingBudget(
      { calories: 1200, protein: 90, carbs: 120, fat: 40 },
      targets,
    );
    expect(budget).toEqual({
      calories: 800,
      protein: 60,
      carbs: 80,
      fat: 20,
      overTarget: false,
    });
  });

  it('is not over target when intake exactly meets it', () => {
    const budget = remainingBudget({ calories: 2000, protein: 150, carbs: 200, fat: 60 }, targets);
    expect(budget.calories).toBe(0);
    expect(budget.overTarget).toBe(false);
  });

  it('goes negative and flags overTarget once the calories are exceeded', () => {
    const budget = remainingBudget(
      { calories: 2350, protein: 170, carbs: 260, fat: 55 },
      targets,
    );
    expect(budget.calories).toBe(-350);
    expect(budget.protein).toBe(-20);
    expect(budget.carbs).toBe(-60);
    expect(budget.fat).toBe(5);
    expect(budget.overTarget).toBe(true);
  });

  it('rounds fractional macro intake', () => {
    const budget = remainingBudget(
      { calories: 1000.4, protein: 90.6, carbs: 120.5, fat: 40.4 },
      targets,
    );
    expect(budget.calories).toBe(1000);
    expect(budget.protein).toBe(59);
    expect(budget.carbs).toBe(80);
    expect(budget.fat).toBe(20);
  });
});

describe('averageCalories', () => {
  it('returns 0 for an empty record', () => {
    expect(averageCalories({})).toBe(0);
  });

  it('ignores days with no meals', () => {
    const byDate: Record<string, Meal[]> = {
      '2024-03-08': [meal('a', 'lunch', [entry({ calories: 1000 })], '2024-03-08')],
      '2024-03-09': [],
      '2024-03-10': [meal('b', 'lunch', [entry({ calories: 2000 })], '2024-03-10')],
    };
    // 3000 over the two logged days, not over all three.
    expect(averageCalories(byDate)).toBe(1500);
  });

  it('returns 0 when every day is empty', () => {
    expect(averageCalories({ '2024-03-08': [], '2024-03-09': [] })).toBe(0);
  });

  it('rounds the mean', () => {
    const byDate: Record<string, Meal[]> = {
      a: [meal('a', 'lunch', [entry({ calories: 1000 })])],
      b: [meal('b', 'lunch', [entry({ calories: 1001 })])],
      c: [meal('c', 'lunch', [entry({ calories: 1001 })])],
    };
    expect(averageCalories(byDate)).toBe(1001);
  });
});

describe('loggingStreak', () => {
  const today = '2024-03-10';

  it('is 0 with no history at all', () => {
    expect(loggingStreak([], today)).toBe(0);
  });

  it('is 0 when the most recent log is older than yesterday', () => {
    expect(loggingStreak(['2024-03-07', '2024-03-08'], today)).toBe(0);
  });

  it('counts a run that ends today', () => {
    expect(loggingStreak(['2024-03-08', '2024-03-09', '2024-03-10'], today)).toBe(3);
    expect(loggingStreak([today], today)).toBe(1);
  });

  it('counts a run that ends yesterday, so the day is not lost before logging', () => {
    expect(loggingStreak(['2024-03-08', '2024-03-09'], today)).toBe(2);
    expect(loggingStreak(['2024-03-09'], today)).toBe(1);
  });

  it('stops at the first gap', () => {
    expect(
      loggingStreak(
        ['2024-03-01', '2024-03-02', '2024-03-05', '2024-03-09', '2024-03-10'],
        today,
      ),
    ).toBe(2);
  });

  it('counts across a month and a leap day', () => {
    expect(
      loggingStreak(['2024-02-28', '2024-02-29', '2024-03-01'], '2024-03-01'),
    ).toBe(3);
  });

  it('ignores duplicates and unordered input', () => {
    expect(loggingStreak(['2024-03-10', '2024-03-08', '2024-03-10', '2024-03-09'], today)).toBe(3);
  });
});
