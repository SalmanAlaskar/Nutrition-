import type {
  ActivityLevel,
  Goal,
  Macros,
  Profile,
  Sex,
  Targets,
} from '@/types';

/** Physical Activity Level multipliers applied to BMR. */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary',
  light: 'Lightly active',
  moderate: 'Moderately active',
  active: 'Very active',
  very_active: 'Athlete',
};

export const ACTIVITY_HINTS: Record<ActivityLevel, string> = {
  sedentary: 'Desk job, little or no exercise',
  light: 'Light exercise 1-3 days a week',
  moderate: 'Moderate exercise 3-5 days a week',
  active: 'Hard exercise 6-7 days a week',
  very_active: 'Physical job or twice-daily training',
};

export const GOAL_LABELS: Record<Goal, string> = {
  lose: 'Lose weight',
  maintain: 'Maintain weight',
  gain: 'Build muscle',
};

/** Fraction of maintenance calories applied for each goal. */
export const GOAL_FACTORS: Record<Goal, number> = {
  lose: 0.8,
  maintain: 1,
  gain: 1.12,
};

/** Lowest daily calorie target the app will ever suggest, by sex. */
export const MIN_CALORIES: Record<Sex, number> = {
  male: 1500,
  female: 1200,
};

/** Grams of protein per kg of body weight, by goal. */
export const PROTEIN_PER_KG: Record<Goal, number> = {
  lose: 2,
  maintain: 1.6,
  gain: 1.8,
};

/** Share of daily calories that comes from fat. */
export const FAT_CALORIE_SHARE = 0.27;

export const CALORIES_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Basal metabolic rate, Mifflin-St Jeor equation.
 * male:   10*kg + 6.25*cm - 5*age + 5
 * female: 10*kg + 6.25*cm - 5*age - 161
 */
export function basalMetabolicRate(profile: Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  const base =
    10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  const offset = profile.sex === 'male' ? 5 : -161;
  return Math.max(0, Math.round(base + offset));
}

/** Maintenance calories: BMR scaled by the activity factor. */
export function totalDailyEnergyExpenditure(
  profile: Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg' | 'activityLevel'>,
): number {
  return Math.round(
    basalMetabolicRate(profile) * ACTIVITY_FACTORS[profile.activityLevel],
  );
}

/**
 * Daily calorie goal. A manual override in the profile wins; otherwise
 * maintenance is scaled by the goal factor and floored at a safe minimum.
 */
export function calorieTarget(profile: Profile): number {
  if (profile.customCalorieTarget && profile.customCalorieTarget > 0) {
    return Math.round(profile.customCalorieTarget);
  }
  const maintenance = totalDailyEnergyExpenditure(profile);
  const adjusted = maintenance * GOAL_FACTORS[profile.goal];
  return Math.round(Math.max(adjusted, MIN_CALORIES[profile.sex]));
}

/**
 * Daily macro goals. Protein is set from body weight, fat takes a fixed share
 * of calories, and carbohydrate absorbs whatever energy is left.
 */
export function macroTargets(profile: Profile): Targets {
  const calories = calorieTarget(profile);

  const protein = Math.round(PROTEIN_PER_KG[profile.goal] * profile.weightKg);
  const fat = Math.round((calories * FAT_CALORIE_SHARE) / CALORIES_PER_GRAM.fat);

  const proteinCalories = protein * CALORIES_PER_GRAM.protein;
  const fatCalories = fat * CALORIES_PER_GRAM.fat;
  const carbCalories = calories - proteinCalories - fatCalories;
  const carbs = Math.max(0, Math.round(carbCalories / CALORIES_PER_GRAM.carbs));

  return { calories, protein, carbs, fat };
}

export function bodyMassIndex(heightCm: number, weightKg: number): number {
  if (heightCm <= 0) return 0;
  const metres = heightCm / 100;
  return Math.round((weightKg / (metres * metres)) * 10) / 10;
}

export type BmiCategory = 'Underweight' | 'Healthy' | 'Overweight' | 'Obese';

export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Healthy';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

/** Healthy-weight range for a height, using the 18.5-24.9 BMI band. */
export function healthyWeightRangeKg(heightCm: number): [number, number] {
  const metres = heightCm / 100;
  const area = metres * metres;
  return [
    Math.round(18.5 * area * 10) / 10,
    Math.round(24.9 * area * 10) / 10,
  ];
}

/* ---------------------------------------------------------------- units -- */

export const kgToLb = (kg: number) => Math.round(kg * 2.20462 * 10) / 10;
export const lbToKg = (lb: number) => Math.round((lb / 2.20462) * 10) / 10;
export const cmToInches = (cm: number) => cm / 2.54;

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cmToInches(cm));
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * 2.54);
}

/* -------------------------------------------------------------- macros -- */

const roundTo = (value: number, places = 1) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

export const EMPTY_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

/** Scale per-100 g nutrients to an arbitrary portion. */
export function macrosForGrams(per100: Macros, grams: number): Macros {
  const factor = Math.max(0, grams) / 100;
  const scaled: Macros = {
    calories: Math.round(per100.calories * factor),
    protein: roundTo(per100.protein * factor),
    carbs: roundTo(per100.carbs * factor),
    fat: roundTo(per100.fat * factor),
  };
  if (per100.fiber !== undefined) scaled.fiber = roundTo(per100.fiber * factor);
  if (per100.sugar !== undefined) scaled.sugar = roundTo(per100.sugar * factor);
  if (per100.sodium !== undefined) scaled.sodium = Math.round(per100.sodium * factor);
  return scaled;
}

export function addMacros(a: Macros, b: Macros): Macros {
  const sum: Macros = {
    calories: a.calories + b.calories,
    protein: roundTo(a.protein + b.protein),
    carbs: roundTo(a.carbs + b.carbs),
    fat: roundTo(a.fat + b.fat),
  };
  if (a.fiber !== undefined || b.fiber !== undefined) {
    sum.fiber = roundTo((a.fiber ?? 0) + (b.fiber ?? 0));
  }
  if (a.sugar !== undefined || b.sugar !== undefined) {
    sum.sugar = roundTo((a.sugar ?? 0) + (b.sugar ?? 0));
  }
  if (a.sodium !== undefined || b.sodium !== undefined) {
    sum.sodium = Math.round((a.sodium ?? 0) + (b.sodium ?? 0));
  }
  return sum;
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(addMacros, { ...EMPTY_MACROS });
}

/**
 * Calories implied by the macro grams. Used to sanity-check food data and
 * model output, which sometimes disagree with themselves.
 */
export function caloriesFromMacros(macros: Pick<Macros, 'protein' | 'carbs' | 'fat'>): number {
  return Math.round(
    macros.protein * CALORIES_PER_GRAM.protein +
      macros.carbs * CALORIES_PER_GRAM.carbs +
      macros.fat * CALORIES_PER_GRAM.fat,
  );
}

/** Share of energy coming from each macro, as fractions that sum to ~1. */
export function macroEnergySplit(macros: Macros): {
  protein: number;
  carbs: number;
  fat: number;
} {
  const p = macros.protein * CALORIES_PER_GRAM.protein;
  const c = macros.carbs * CALORIES_PER_GRAM.carbs;
  const f = macros.fat * CALORIES_PER_GRAM.fat;
  const total = p + c + f;
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0 };
  return { protein: p / total, carbs: c / total, fat: f / total };
}

/** Progress toward a target, clamped to 0..1 for ring and bar rendering. */
export function progress(value: number, target: number): number {
  if (target <= 0) return 0;
  return clamp(value / target, 0, 1);
}

/* ------------------------------------------------------------ validation -- */

export const LIMITS = {
  age: { min: 13, max: 100 },
  heightCm: { min: 100, max: 230 },
  weightKg: { min: 30, max: 300 },
} as const;

export function isValidProfileInput(input: {
  age: number;
  heightCm: number;
  weightKg: number;
}): boolean {
  return (
    Number.isFinite(input.age) &&
    input.age >= LIMITS.age.min &&
    input.age <= LIMITS.age.max &&
    Number.isFinite(input.heightCm) &&
    input.heightCm >= LIMITS.heightCm.min &&
    input.heightCm <= LIMITS.heightCm.max &&
    Number.isFinite(input.weightKg) &&
    input.weightKg >= LIMITS.weightKg.min &&
    input.weightKg <= LIMITS.weightKg.max
  );
}
