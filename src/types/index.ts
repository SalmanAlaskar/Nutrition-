/**
 * Domain types for the Nutrition app.
 *
 * Canonical units: mass in grams, energy in kilocalories, height in centimetres,
 * body weight in kilograms. Imperial values exist only at the UI edge and are
 * converted on the way in and out.
 */

export type Sex = 'male' | 'female';

export type UnitSystem = 'metric' | 'imperial';

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export type Goal = 'lose' | 'maintain' | 'gain';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type EntrySource = 'database' | 'custom' | 'photo';

/** Absolute nutrient amounts for a portion, or per-100 g amounts for a food. */
export interface Macros {
  /** kilocalories */
  calories: number;
  /** grams */
  protein: number;
  /** grams */
  carbs: number;
  /** grams */
  fat: number;
  /** grams, optional */
  fiber?: number;
  /** grams, optional */
  sugar?: number;
  /** milligrams, optional */
  sodium?: number;
}

/** A named portion of a food, expressed in grams. */
export interface ServingOption {
  label: string;
  grams: number;
}

export type FoodCategory =
  | 'grains'
  | 'protein'
  | 'dairy'
  | 'vegetables'
  | 'fruit'
  | 'legumes'
  | 'nuts'
  | 'fats'
  | 'beverages'
  | 'sweets'
  | 'fastfood'
  | 'dishes'
  | 'condiments';

/** An entry in the bundled food database. All nutrients are per 100 g. */
export interface FoodItem {
  id: string;
  name: string;
  /** Arabic name, shown as a secondary label when present. */
  nameAr?: string;
  brand?: string;
  category: FoodCategory;
  per100: Macros;
  /** Ordered portion choices; the first one is the default in the UI. */
  servings: ServingOption[];
  /** Extra search terms: transliterations, synonyms, regional names. */
  aliases?: string[];
  /** True when the food is measured in millilitres rather than grams. */
  liquid?: boolean;
}

/** One food line inside a meal. `macros` is already scaled to `quantityGrams`. */
export interface MealEntry {
  id: string;
  /** Set when the line came from the bundled database. */
  foodId?: string;
  name: string;
  quantityGrams: number;
  /** Label of the chosen serving, e.g. "1 cup (240 g)". */
  servingLabel?: string;
  macros: Macros;
  source: EntrySource;
  /** 0..1, only set for photo-derived entries. */
  confidence?: number;
}

export interface Meal {
  id: string;
  /** Local calendar day, 'YYYY-MM-DD'. */
  date: string;
  /** ISO timestamp of when the meal was logged. */
  loggedAt: string;
  slot: MealSlot;
  entries: MealEntry[];
  /** Local file URI of the meal photo, when one was taken. */
  photoUri?: string;
  note?: string;
}

export interface WeightLog {
  id: string;
  /** Local calendar day, 'YYYY-MM-DD'. */
  date: string;
  weightKg: number;
}

export interface Profile {
  sex: Sex;
  /** Whole years. */
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  /** Preferred display units. */
  units: UnitSystem;
  /** Overrides the computed calorie target when set. */
  customCalorieTarget?: number;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** Daily nutrient goals derived from the profile. */
export interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** How a photo of a meal is turned into entries. */
export type PhotoAnalysisMode = 'ai' | 'manual';

export interface Settings {
  /** Send meal photos to a vision model for automatic recognition. */
  photoAnalysis: PhotoAnalysisMode;
  /** Base URL of the Anthropic-compatible API used for photo analysis. */
  aiBaseUrl: string;
  aiModel: string;
  /** Show a brief confirmation before a photo leaves the device. */
  confirmBeforeUpload: boolean;
}

/** One food the vision model believes it can see in a photo. */
export interface DetectedFood {
  name: string;
  /** Model's portion estimate in grams. */
  quantityGrams: number;
  macros: Macros;
  /** 0..1 */
  confidence: number;
  /** Short note from the model, e.g. "assumed grilled, no added oil". */
  note?: string;
}

export interface PhotoAnalysisResult {
  items: DetectedFood[];
  /** Model's guess at the meal slot, when it offers one. */
  slot?: MealSlot;
  /** Free-text caption describing the plate. */
  summary?: string;
}

/** Totals for a single calendar day. */
export interface DailyTotals {
  date: string;
  macros: Macros;
  mealCount: number;
  entryCount: number;
  bySlot: Record<MealSlot, Macros>;
}
