import type { DailyTotals, Macros, Meal, MealSlot, Targets } from '@/types';

import { EMPTY_MACROS, addMacros, sumMacros } from './nutrition';

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export const SLOT_ICONS: Record<MealSlot, string> = {
  breakfast: 'sunrise',
  lunch: 'sun',
  dinner: 'moon',
  snack: 'cookie',
};

/** Nutrients for every entry in one meal. */
export function mealMacros(meal: Meal): Macros {
  return sumMacros(meal.entries.map((entry) => entry.macros));
}

/** Nutrients across a list of meals. */
export function totalMacros(meals: Meal[]): Macros {
  return meals.reduce<Macros>(
    (acc, meal) => addMacros(acc, mealMacros(meal)),
    { ...EMPTY_MACROS },
  );
}

export function mealsBySlot(meals: Meal[]): Record<MealSlot, Meal[]> {
  const grouped: Record<MealSlot, Meal[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const meal of meals) {
    const slot = grouped[meal.slot] ? meal.slot : 'snack';
    grouped[slot].push(meal);
  }
  return grouped;
}

export function dailyTotals(date: string, meals: Meal[]): DailyTotals {
  const grouped = mealsBySlot(meals);
  return {
    date,
    macros: totalMacros(meals),
    mealCount: meals.length,
    entryCount: meals.reduce((count, meal) => count + meal.entries.length, 0),
    bySlot: {
      breakfast: totalMacros(grouped.breakfast),
      lunch: totalMacros(grouped.lunch),
      dinner: totalMacros(grouped.dinner),
      snack: totalMacros(grouped.snack),
    },
  };
}

export interface RemainingBudget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** True once intake passes the calorie target. */
  overTarget: boolean;
}

/** What is left of the day's goals. Values go negative once exceeded. */
export function remainingBudget(consumed: Macros, targets: Targets): RemainingBudget {
  const calories = Math.round(targets.calories - consumed.calories);
  return {
    calories,
    protein: Math.round(targets.protein - consumed.protein),
    carbs: Math.round(targets.carbs - consumed.carbs),
    fat: Math.round(targets.fat - consumed.fat),
    overTarget: calories < 0,
  };
}

/** Mean daily calories over the supplied days, ignoring days with no meals. */
export function averageCalories(mealsByDate: Record<string, Meal[]>): number {
  const days = Object.values(mealsByDate).filter((meals) => meals.length > 0);
  if (days.length === 0) return 0;
  const total = days.reduce((sum, meals) => sum + totalMacros(meals).calories, 0);
  return Math.round(total / days.length);
}

/** Longest run of consecutive logged days ending on the most recent day. */
export function loggingStreak(dates: string[], today: string): number {
  const logged = new Set(dates);
  let streak = 0;
  const cursor = new Date(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );
  const pad = (n: number) => String(n).padStart(2, '0');
  const key = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (!logged.has(key(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (logged.has(key(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
