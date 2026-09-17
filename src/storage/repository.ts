import AsyncStorage from '@react-native-async-storage/async-storage';

import { todayKey } from '@/domain/date';
import type {
  FoodItem,
  Meal,
  Profile,
  Settings,
  WeightLog,
} from '@/types';

import { KEYS } from './keys';

export const DEFAULT_SETTINGS: Settings = {
  photoAnalysis: 'manual',
  aiBaseUrl: 'https://api.anthropic.com',
  aiModel: 'claude-sonnet-5',
  confirmBeforeUpload: true,
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`[storage] could not read ${key}`, error);
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[storage] could not write ${key}`, error);
    throw error;
  }
}

/* -------------------------------------------------------------- profile -- */

export async function getProfile(): Promise<Profile | null> {
  return readJson<Profile | null>(KEYS.profile, null);
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  const stamped: Profile = { ...profile, updatedAt: new Date().toISOString() };
  await writeJson(KEYS.profile, stamped);
  return stamped;
}

/* ------------------------------------------------------------- settings -- */

export async function getSettings(): Promise<Settings> {
  const stored = await readJson<Partial<Settings>>(KEYS.settings, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  await writeJson(KEYS.settings, settings);
  return settings;
}

/* ---------------------------------------------------------------- meals -- */

async function getMealIndex(): Promise<string[]> {
  return readJson<string[]>(KEYS.mealIndex, []);
}

async function addToMealIndex(date: string): Promise<void> {
  const index = await getMealIndex();
  if (index.includes(date)) return;
  index.push(date);
  index.sort();
  await writeJson(KEYS.mealIndex, index);
}

async function removeFromMealIndex(date: string): Promise<void> {
  const index = await getMealIndex();
  const next = index.filter((key) => key !== date);
  if (next.length !== index.length) await writeJson(KEYS.mealIndex, next);
}

/** Every day that has at least one logged meal, oldest first. */
export async function getLoggedDates(): Promise<string[]> {
  return getMealIndex();
}

export async function getMealsForDate(date: string): Promise<Meal[]> {
  const meals = await readJson<Meal[]>(KEYS.mealsFor(date), []);
  return meals.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
}

async function setMealsForDate(date: string, meals: Meal[]): Promise<void> {
  if (meals.length === 0) {
    await AsyncStorage.removeItem(KEYS.mealsFor(date));
    await removeFromMealIndex(date);
    return;
  }
  await writeJson(KEYS.mealsFor(date), meals);
  await addToMealIndex(date);
}

export async function addMeal(meal: Meal): Promise<Meal> {
  const meals = await getMealsForDate(meal.date);
  await setMealsForDate(meal.date, [...meals, meal]);
  return meal;
}

/** Replaces a meal in place, moving it between days if the date changed. */
export async function updateMeal(meal: Meal, previousDate?: string): Promise<Meal> {
  if (previousDate && previousDate !== meal.date) {
    await deleteMeal(previousDate, meal.id);
    return addMeal(meal);
  }
  const meals = await getMealsForDate(meal.date);
  const index = meals.findIndex((item) => item.id === meal.id);
  if (index === -1) return addMeal(meal);
  meals[index] = meal;
  await setMealsForDate(meal.date, meals);
  return meal;
}

export async function deleteMeal(date: string, mealId: string): Promise<void> {
  const meals = await getMealsForDate(date);
  await setMealsForDate(
    date,
    meals.filter((meal) => meal.id !== mealId),
  );
}

export async function findMeal(mealId: string): Promise<Meal | null> {
  const dates = await getMealIndex();
  for (const date of [...dates].reverse()) {
    const meals = await getMealsForDate(date);
    const match = meals.find((meal) => meal.id === mealId);
    if (match) return match;
  }
  return null;
}

/** Meals for each day in `dates`, keyed by day. Days with none are omitted. */
export async function getMealsForDates(
  dates: string[],
): Promise<Record<string, Meal[]>> {
  const pairs = await Promise.all(
    dates.map(async (date) => [date, await getMealsForDate(date)] as const),
  );
  const out: Record<string, Meal[]> = {};
  for (const [date, meals] of pairs) {
    if (meals.length > 0) out[date] = meals;
  }
  return out;
}

/* --------------------------------------------------------------- weight -- */

export async function getWeightLogs(): Promise<WeightLog[]> {
  const logs = await readJson<WeightLog[]>(KEYS.weights, []);
  return logs.sort((a, b) => a.date.localeCompare(b.date));
}

/** One entry per day: logging twice on the same day overwrites. */
export async function saveWeightLog(log: WeightLog): Promise<WeightLog[]> {
  const logs = await getWeightLogs();
  const next = logs.filter((item) => item.date !== log.date);
  next.push(log);
  next.sort((a, b) => a.date.localeCompare(b.date));
  await writeJson(KEYS.weights, next);
  return next;
}

export async function deleteWeightLog(id: string): Promise<WeightLog[]> {
  const logs = await getWeightLogs();
  const next = logs.filter((log) => log.id !== id);
  await writeJson(KEYS.weights, next);
  return next;
}

/* --------------------------------------------------------- custom foods -- */

/** Foods the user typed in by hand, offered alongside the bundled database. */
export async function getCustomFoods(): Promise<FoodItem[]> {
  return readJson<FoodItem[]>(KEYS.customFoods, []);
}

export async function saveCustomFood(food: FoodItem): Promise<FoodItem[]> {
  const foods = await getCustomFoods();
  const next = foods.filter((item) => item.id !== food.id);
  next.unshift(food);
  await writeJson(KEYS.customFoods, next.slice(0, 200));
  return next;
}

export async function deleteCustomFood(id: string): Promise<FoodItem[]> {
  const foods = await getCustomFoods();
  const next = foods.filter((food) => food.id !== id);
  await writeJson(KEYS.customFoods, next);
  return next;
}

/* ----------------------------------------------------------- whole store -- */

export interface ExportBundle {
  exportedAt: string;
  profile: Profile | null;
  settings: Settings;
  weights: WeightLog[];
  customFoods: FoodItem[];
  meals: Record<string, Meal[]>;
}

export async function exportAll(): Promise<ExportBundle> {
  const dates = await getMealIndex();
  return {
    exportedAt: new Date().toISOString(),
    profile: await getProfile(),
    settings: await getSettings(),
    weights: await getWeightLogs(),
    customFoods: await getCustomFoods(),
    meals: await getMealsForDates(dates),
  };
}

/** Wipes every key this app owns. Other AsyncStorage users are untouched. */
export async function clearAll(): Promise<void> {
  const dates = await getMealIndex();
  const keys = [
    KEYS.profile,
    KEYS.settings,
    KEYS.weights,
    KEYS.customFoods,
    KEYS.mealIndex,
    ...dates.map((date) => KEYS.mealsFor(date)),
  ];
  await AsyncStorage.multiRemove(keys);
}

/** Convenience used by the dashboard on first paint. */
export async function getTodayMeals(): Promise<Meal[]> {
  return getMealsForDate(todayKey());
}
