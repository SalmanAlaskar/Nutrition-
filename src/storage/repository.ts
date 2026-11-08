import AsyncStorage from '@react-native-async-storage/async-storage';

import { todayKey } from '@/domain/date';
import type {
  ActivityLevel,
  BodyScan,
  Equipment,
  EntrySource,
  Exercise,
  FoodCategory,
  FoodItem,
  Goal,
  LoggedExercise,
  Macros,
  Meal,
  MealEntry,
  MealSlot,
  PhotoAnalysisMode,
  PlannedExercise,
  Profile,
  Program,
  ProgramDay,
  ScanSource,
  ServingOption,
  SegmentalValues,
  SessionType,
  SetLog,
  Settings,
  Sex,
  UnitSystem,
  WeightLog,
  WorkoutSession,
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

/* -------------------------------------------------------------- program -- */

/** The one active training program, or null before the first one is seeded. */
export async function getProgram(): Promise<Program | null> {
  return readJson<Program | null>(KEYS.program, null);
}

export async function saveProgram(program: Program): Promise<Program> {
  const stamped: Program = { ...program, updatedAt: new Date().toISOString() };
  await writeJson(KEYS.program, stamped);
  return stamped;
}

/* ------------------------------------------------------------- workouts -- */

async function getWorkoutIndex(): Promise<string[]> {
  return readJson<string[]>(KEYS.workoutIndex, []);
}

async function addToWorkoutIndex(date: string): Promise<void> {
  const index = await getWorkoutIndex();
  if (index.includes(date)) return;
  index.push(date);
  index.sort();
  await writeJson(KEYS.workoutIndex, index);
}

async function removeFromWorkoutIndex(date: string): Promise<void> {
  const index = await getWorkoutIndex();
  const next = index.filter((key) => key !== date);
  if (next.length !== index.length) await writeJson(KEYS.workoutIndex, next);
}

/** Every day that has at least one workout session, oldest first. */
export async function getWorkoutDates(): Promise<string[]> {
  return getWorkoutIndex();
}

export async function getWorkoutsForDate(date: string): Promise<WorkoutSession[]> {
  const sessions = await readJson<WorkoutSession[]>(KEYS.workoutsFor(date), []);
  return sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

async function setWorkoutsForDate(
  date: string,
  sessions: WorkoutSession[],
): Promise<void> {
  if (sessions.length === 0) {
    await AsyncStorage.removeItem(KEYS.workoutsFor(date));
    await removeFromWorkoutIndex(date);
    return;
  }
  await writeJson(KEYS.workoutsFor(date), sessions);
  await addToWorkoutIndex(date);
}

export async function addWorkout(session: WorkoutSession): Promise<WorkoutSession> {
  const sessions = await getWorkoutsForDate(session.date);
  await setWorkoutsForDate(session.date, [...sessions, session]);
  return session;
}

/** Replaces a session in place, moving it between days if the date changed. */
export async function updateWorkout(
  session: WorkoutSession,
  previousDate?: string,
): Promise<WorkoutSession> {
  if (previousDate && previousDate !== session.date) {
    await deleteWorkout(previousDate, session.id);
    return addWorkout(session);
  }
  const sessions = await getWorkoutsForDate(session.date);
  const index = sessions.findIndex((item) => item.id === session.id);
  if (index === -1) return addWorkout(session);
  sessions[index] = session;
  await setWorkoutsForDate(session.date, sessions);
  return session;
}

export async function deleteWorkout(date: string, sessionId: string): Promise<void> {
  const sessions = await getWorkoutsForDate(date);
  await setWorkoutsForDate(
    date,
    sessions.filter((session) => session.id !== sessionId),
  );
}

export async function findWorkout(sessionId: string): Promise<WorkoutSession | null> {
  const dates = await getWorkoutIndex();
  for (const date of [...dates].reverse()) {
    const sessions = await getWorkoutsForDate(date);
    const match = sessions.find((session) => session.id === sessionId);
    if (match) return match;
  }
  return null;
}

/** Sessions for each day in `dates`, keyed by day. Days with none are omitted. */
export async function getWorkoutsForDates(
  dates: string[],
): Promise<Record<string, WorkoutSession[]>> {
  const pairs = await Promise.all(
    dates.map(async (date) => [date, await getWorkoutsForDate(date)] as const),
  );
  const out: Record<string, WorkoutSession[]> = {};
  for (const [date, sessions] of pairs) {
    if (sessions.length > 0) out[date] = sessions;
  }
  return out;
}

/* ----------------------------------------------------- custom exercises -- */

/** Exercises the user added by hand, offered alongside the bundled list. */
export async function getCustomExercises(): Promise<Exercise[]> {
  return readJson<Exercise[]>(KEYS.customExercises, []);
}

export async function saveCustomExercise(exercise: Exercise): Promise<Exercise[]> {
  const exercises = await getCustomExercises();
  const next = exercises.filter((item) => item.id !== exercise.id);
  next.unshift(exercise);
  await writeJson(KEYS.customExercises, next.slice(0, 200));
  return next;
}

export async function deleteCustomExercise(id: string): Promise<Exercise[]> {
  const exercises = await getCustomExercises();
  const next = exercises.filter((exercise) => exercise.id !== id);
  await writeJson(KEYS.customExercises, next);
  return next;
}

/* ------------------------------------------------------------ body scans -- */

export async function getBodyScans(): Promise<BodyScan[]> {
  const scans = await readJson<BodyScan[]>(KEYS.scans, []);
  return scans.sort((a, b) => a.date.localeCompare(b.date));
}

/** Replaces the scan carrying the same id, so re-saving an edit is safe. */
export async function saveBodyScan(scan: BodyScan): Promise<BodyScan[]> {
  const scans = await getBodyScans();
  const next = scans.filter((item) => item.id !== scan.id);
  next.push(scan);
  next.sort((a, b) => a.date.localeCompare(b.date));
  await writeJson(KEYS.scans, next);
  return next;
}

export async function deleteBodyScan(id: string): Promise<BodyScan[]> {
  const scans = await getBodyScans();
  const next = scans.filter((scan) => scan.id !== id);
  await writeJson(KEYS.scans, next);
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
  program: Program | null;
  workouts: Record<string, WorkoutSession[]>;
  customExercises: Exercise[];
  scans: BodyScan[];
}

export async function exportAll(): Promise<ExportBundle> {
  const dates = await getMealIndex();
  const workoutDates = await getWorkoutIndex();
  return {
    exportedAt: new Date().toISOString(),
    profile: await getProfile(),
    settings: await getSettings(),
    weights: await getWeightLogs(),
    customFoods: await getCustomFoods(),
    meals: await getMealsForDates(dates),
    program: await getProgram(),
    workouts: await getWorkoutsForDates(workoutDates),
    customExercises: await getCustomExercises(),
    scans: await getBodyScans(),
  };
}

/* ---------------------------------------------------------------- import -- */

/**
 * Reading an export back in.
 *
 * The counterpart of `exportAll`. The published build keeps everything in the
 * browser on one device, so a file is the only way a reading taken elsewhere
 * reaches the app.
 *
 * Two shapes are accepted: everything `exportAll` writes, and a partial file
 * carrying only some of the keys, such as `{ "version": 1, "scans": [...] }`.
 * Every record is checked field by field before anything is written, and one
 * that does not fit is skipped and reported rather than stored, so the worst a
 * bad file can do is add nothing. Records merge by id, which makes importing
 * the same file twice a no-op rather than a duplicate.
 */

/** The kinds of record an import file can carry, in the order a report lists them. */
export type ImportKind =
  | 'profile'
  | 'settings'
  | 'weights'
  | 'customFoods'
  | 'meals'
  | 'program'
  | 'workouts'
  | 'customExercises'
  | 'scans';

export const IMPORT_KINDS: readonly ImportKind[] = [
  'scans',
  'weights',
  'meals',
  'workouts',
  'program',
  'customFoods',
  'customExercises',
  'profile',
  'settings',
];

export interface ImportCounts {
  /** Records stored that had no counterpart already on this device. */
  added: number;
  /** Records that took the place of one carrying the same id. */
  replaced: number;
  /** Records that were rejected, and so never written. */
  skipped: number;
}

/**
 * Why one record, or one whole key, was refused. A code and its parts rather
 * than a sentence: the screen says it in the reader's language, exactly as
 * `ScanProblem` does for a reading that looks implausible.
 */
export type ImportProblemCode =
  /** The text is not JSON at all. */
  | 'notJson'
  /** Valid JSON, but not an object with keys. */
  | 'notObject'
  /** The file declares a format this version cannot read. */
  | 'unsupportedVersion'
  /** An object, but with none of the keys an export carries. */
  | 'nothingRecognised'
  /** A key held the wrong kind of value, e.g. scans that are not a list. */
  | 'wrongShape'
  /** Not an object, or with no usable id. */
  | 'badRecord'
  /** The same id appears twice in the file; the first one was kept. */
  | 'duplicate'
  /** The date is missing or is not a real 'YYYY-MM-DD' day. */
  | 'badDate'
  /** The weight is missing, zero or negative. */
  | 'badWeight'
  /** Shaped right, but a field it cannot do without is missing or impossible. */
  | 'badFields';

export interface ImportProblem {
  code: ImportProblemCode;
  /** The key it came from, absent when the whole file is the problem. */
  kind?: ImportKind;
  /** 1-based position inside the list it came from. */
  position?: number;
  /** The record's own id, when it carried a readable one. */
  id?: string;
  /** The day a per-day map was keyed by, when that is where it sat. */
  date?: string;
  /** The format number a file declared, for `unsupportedVersion`. */
  version?: number;
}

export interface ImportResult {
  /** True when the file was understood, whatever individual records did. */
  ok: boolean;
  counts: Record<ImportKind, ImportCounts>;
  added: number;
  replaced: number;
  skipped: number;
  problems: ImportProblem[];
}

export interface ImportOptions {
  /** Check and count the file without writing a single byte. */
  dryRun?: boolean;
}

/** The only file format this build writes, and the only one it reads. */
const IMPORT_VERSION = 1;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HTTP_URL_PATTERN = /^https?:\/\/\S+$/i;

const SEXES: readonly Sex[] = ['male', 'female'];
const UNIT_SYSTEMS: readonly UnitSystem[] = ['metric', 'imperial'];
const ACTIVITY_LEVELS: readonly ActivityLevel[] = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
];
const GOALS: readonly Goal[] = ['lose', 'maintain', 'gain'];
const MEAL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const ENTRY_SOURCES: readonly EntrySource[] = ['database', 'custom', 'photo'];
const PHOTO_MODES: readonly PhotoAnalysisMode[] = ['ai', 'manual'];
const SCAN_SOURCES: readonly ScanSource[] = ['manual', 'qr', 'photo', 'document'];
const SESSION_TYPES: readonly SessionType[] = [
  'push',
  'pull',
  'legs',
  'upper',
  'lower',
  'full',
  'cardio',
];
const EQUIPMENT: readonly Equipment[] = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'other',
];
const FOOD_CATEGORIES: readonly FoodCategory[] = [
  'grains',
  'protein',
  'dairy',
  'vegetables',
  'fruit',
  'legumes',
  'nuts',
  'fats',
  'beverages',
  'sweets',
  'fastfood',
  'dishes',
  'condiments',
];
const SEGMENT_PARTS: readonly (keyof SegmentalValues)[] = [
  'rightArm',
  'leftArm',
  'trunk',
  'rightLeg',
  'leftLeg',
];

/** Every optional measurement on a reading. All are masses, areas or indices. */
const SCAN_NUMBER_KEYS = [
  'skeletalMuscleKg',
  'bodyFatKg',
  'bodyFatPercent',
  'fatFreeMassKg',
  'totalBodyWaterL',
  'proteinKg',
  'mineralsKg',
  'bmi',
  'bmrKcal',
  'visceralFatLevel',
  'visceralFatAreaCm2',
  'waistHipRatio',
  'inBodyScore',
  'targetWeightKg',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A string with something in it, trimmed, or undefined. */
function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function atLeastZero(value: unknown): number | undefined {
  const parsed = finite(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function positive(value: unknown): number | undefined {
  const parsed = finite(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function flag(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** 'YYYY-MM-DD' naming a day that exists. 2026-02-30 is rejected, not shifted. */
function dateKey(value: unknown): string | undefined {
  const raw = text(value);
  if (raw === undefined || !DATE_KEY_PATTERN.test(raw)) return undefined;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  const day = Number(raw.slice(8, 10));
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return undefined;
  }
  return raw;
}

/** A timestamp the app can sort and parse, or undefined. */
function timestamp(value: unknown): string | undefined {
  const raw = text(value);
  if (raw === undefined || Number.isNaN(Date.parse(raw))) return undefined;
  return raw;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const raw = text(value);
  return allowed.find((item) => item === raw);
}

/** Midnight on the given day, used when a record carries no usable timestamp. */
const startOfDay = (date: string): string => `${date}T00:00:00.000Z`;

function macrosFrom(value: unknown): Macros | undefined {
  if (!isRecord(value)) return undefined;
  const calories = atLeastZero(value.calories);
  const protein = atLeastZero(value.protein);
  const carbs = atLeastZero(value.carbs);
  const fat = atLeastZero(value.fat);
  if (
    calories === undefined ||
    protein === undefined ||
    carbs === undefined ||
    fat === undefined
  ) {
    return undefined;
  }
  const macros: Macros = { calories, protein, carbs, fat };
  const fiber = atLeastZero(value.fiber);
  if (fiber !== undefined) macros.fiber = fiber;
  const sugar = atLeastZero(value.sugar);
  if (sugar !== undefined) macros.sugar = sugar;
  const sodium = atLeastZero(value.sodium);
  if (sodium !== undefined) macros.sodium = sodium;
  return macros;
}

/** Undefined when no limb reads at all, so an empty block is not stored. */
function segmentalFrom(value: unknown): SegmentalValues | undefined {
  if (!isRecord(value)) return undefined;
  const parts: SegmentalValues = {};
  let any = false;
  for (const part of SEGMENT_PARTS) {
    const reading = atLeastZero(value[part]);
    if (reading !== undefined) {
      parts[part] = reading;
      any = true;
    }
  }
  return any ? parts : undefined;
}

function scanFrom(value: unknown): BodyScan | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const date = dateKey(value.date);
  const weightKg = positive(value.weightKg);
  if (id === undefined || date === undefined || weightKg === undefined) return undefined;

  const scan: BodyScan = {
    id,
    date,
    takenAt: timestamp(value.takenAt) ?? startOfDay(date),
    source: oneOf(value.source, SCAN_SOURCES) ?? 'manual',
    weightKg,
  };
  for (const key of SCAN_NUMBER_KEYS) {
    const reading = atLeastZero(value[key]);
    if (reading !== undefined) scan[key] = reading;
  }
  const device = text(value.device);
  if (device !== undefined) scan.device = device;
  const note = text(value.note);
  if (note !== undefined) scan.note = note;
  const sourceUri = text(value.sourceUri);
  if (sourceUri !== undefined) scan.sourceUri = sourceUri;
  const lean = segmentalFrom(value.segmentalLeanKg);
  if (lean !== undefined) scan.segmentalLeanKg = lean;
  const fat = segmentalFrom(value.segmentalFatKg);
  if (fat !== undefined) scan.segmentalFatKg = fat;
  return scan;
}

function weightLogFrom(value: unknown): WeightLog | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const date = dateKey(value.date);
  const weightKg = positive(value.weightKg);
  if (id === undefined || date === undefined || weightKg === undefined) return undefined;
  return { id, date, weightKg };
}

function mealEntryFrom(value: unknown): MealEntry | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const name = text(value.name);
  const quantityGrams = atLeastZero(value.quantityGrams);
  const macros = macrosFrom(value.macros);
  const source = oneOf(value.source, ENTRY_SOURCES);
  if (
    id === undefined ||
    name === undefined ||
    quantityGrams === undefined ||
    macros === undefined ||
    source === undefined
  ) {
    return undefined;
  }
  const entry: MealEntry = { id, name, quantityGrams, macros, source };
  const foodId = text(value.foodId);
  if (foodId !== undefined) entry.foodId = foodId;
  const servingLabel = text(value.servingLabel);
  if (servingLabel !== undefined) entry.servingLabel = servingLabel;
  const confidence = atLeastZero(value.confidence);
  if (confidence !== undefined) entry.confidence = confidence;
  return entry;
}

/** One broken line rejects the whole meal: half a plate is worse than none. */
function mealFrom(value: unknown, fallbackDate: string): Meal | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const date = dateKey(value.date) ?? fallbackDate;
  const slot = oneOf(value.slot, MEAL_SLOTS);
  if (id === undefined || slot === undefined || !Array.isArray(value.entries)) return undefined;

  const entries: MealEntry[] = [];
  for (const raw of value.entries) {
    const entry = mealEntryFrom(raw);
    if (entry === undefined) return undefined;
    entries.push(entry);
  }
  const meal: Meal = {
    id,
    date,
    loggedAt: timestamp(value.loggedAt) ?? startOfDay(date),
    slot,
    entries,
  };
  const photoUri = text(value.photoUri);
  if (photoUri !== undefined) meal.photoUri = photoUri;
  const note = text(value.note);
  if (note !== undefined) meal.note = note;
  return meal;
}

function setLogFrom(value: unknown): SetLog | undefined {
  if (!isRecord(value)) return undefined;
  const done = flag(value.done);
  if (done === undefined) return undefined;
  const set: SetLog = { done };
  const reps = atLeastZero(value.reps);
  if (reps !== undefined) set.reps = reps;
  const weightKg = atLeastZero(value.weightKg);
  if (weightKg !== undefined) set.weightKg = weightKg;
  return set;
}

function loggedExerciseFrom(value: unknown): LoggedExercise | undefined {
  if (!isRecord(value)) return undefined;
  const exerciseId = text(value.exerciseId);
  const name = text(value.name);
  const done = flag(value.done);
  if (
    exerciseId === undefined ||
    name === undefined ||
    done === undefined ||
    !Array.isArray(value.sets)
  ) {
    return undefined;
  }
  const sets: SetLog[] = [];
  for (const raw of value.sets) {
    const set = setLogFrom(raw);
    if (set === undefined) return undefined;
    sets.push(set);
  }
  const logged: LoggedExercise = { exerciseId, name, done, sets };
  const note = text(value.note);
  if (note !== undefined) logged.note = note;
  return logged;
}

function workoutFrom(value: unknown, fallbackDate: string): WorkoutSession | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const date = dateKey(value.date) ?? fallbackDate;
  const type = oneOf(value.type, SESSION_TYPES);
  if (id === undefined || type === undefined || !Array.isArray(value.exercises)) return undefined;

  const exercises: LoggedExercise[] = [];
  for (const raw of value.exercises) {
    const exercise = loggedExerciseFrom(raw);
    if (exercise === undefined) return undefined;
    exercises.push(exercise);
  }
  const session: WorkoutSession = {
    id,
    date,
    startedAt: timestamp(value.startedAt) ?? startOfDay(date),
    type,
    exercises,
  };
  const completedAt = timestamp(value.completedAt);
  if (completedAt !== undefined) session.completedAt = completedAt;
  const programId = text(value.programId);
  if (programId !== undefined) session.programId = programId;
  const dayId = text(value.dayId);
  if (dayId !== undefined) session.dayId = dayId;
  const dayLabel = text(value.dayLabel);
  if (dayLabel !== undefined) session.dayLabel = dayLabel;
  const note = text(value.note);
  if (note !== undefined) session.note = note;
  return session;
}

function servingFrom(value: unknown): ServingOption | undefined {
  if (!isRecord(value)) return undefined;
  const label = text(value.label);
  const grams = positive(value.grams);
  if (label === undefined || grams === undefined) return undefined;
  return { label, grams };
}

function foodFrom(value: unknown): FoodItem | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const name = text(value.name);
  const category = oneOf(value.category, FOOD_CATEGORIES);
  const per100 = macrosFrom(value.per100);
  if (
    id === undefined ||
    name === undefined ||
    category === undefined ||
    per100 === undefined ||
    !Array.isArray(value.servings)
  ) {
    return undefined;
  }
  const servings: ServingOption[] = [];
  for (const raw of value.servings) {
    const serving = servingFrom(raw);
    if (serving === undefined) return undefined;
    servings.push(serving);
  }
  const food: FoodItem = { id, name, category, per100, servings };
  const nameAr = text(value.nameAr);
  if (nameAr !== undefined) food.nameAr = nameAr;
  const brand = text(value.brand);
  if (brand !== undefined) food.brand = brand;
  if (Array.isArray(value.aliases)) {
    const aliases: string[] = [];
    for (const raw of value.aliases) {
      const alias = text(raw);
      if (alias !== undefined) aliases.push(alias);
    }
    if (aliases.length > 0) food.aliases = aliases;
  }
  const liquid = flag(value.liquid);
  if (liquid !== undefined) food.liquid = liquid;
  return food;
}

function exerciseFrom(value: unknown): Exercise | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const name = text(value.name);
  const equipment = oneOf(value.equipment, EQUIPMENT);
  if (
    id === undefined ||
    name === undefined ||
    equipment === undefined ||
    !Array.isArray(value.types) ||
    !Array.isArray(value.muscles)
  ) {
    return undefined;
  }
  const types: SessionType[] = [];
  for (const raw of value.types) {
    const type = oneOf(raw, SESSION_TYPES);
    if (type === undefined) return undefined;
    types.push(type);
  }
  if (types.length === 0) return undefined;
  const muscles: string[] = [];
  for (const raw of value.muscles) {
    const muscle = text(raw);
    if (muscle === undefined) return undefined;
    muscles.push(muscle);
  }
  const exercise: Exercise = { id, name, types, muscles, equipment };
  const nameAr = text(value.nameAr);
  if (nameAr !== undefined) exercise.nameAr = nameAr;
  const cue = text(value.cue);
  if (cue !== undefined) exercise.cue = cue;
  const custom = flag(value.custom);
  if (custom !== undefined) exercise.custom = custom;
  return exercise;
}

function plannedExerciseFrom(value: unknown): PlannedExercise | undefined {
  if (!isRecord(value)) return undefined;
  const exerciseId = text(value.exerciseId);
  const sets = positive(value.sets);
  const repsLow = positive(value.repsLow);
  const repsHigh = positive(value.repsHigh);
  if (
    exerciseId === undefined ||
    sets === undefined ||
    repsLow === undefined ||
    repsHigh === undefined
  ) {
    return undefined;
  }
  const planned: PlannedExercise = { exerciseId, sets, repsLow, repsHigh };
  const restSeconds = atLeastZero(value.restSeconds);
  if (restSeconds !== undefined) planned.restSeconds = restSeconds;
  const note = text(value.note);
  if (note !== undefined) planned.note = note;
  return planned;
}

function programDayFrom(value: unknown): ProgramDay | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const type = oneOf(value.type, SESSION_TYPES);
  const label = text(value.label);
  if (
    id === undefined ||
    type === undefined ||
    label === undefined ||
    !Array.isArray(value.exercises)
  ) {
    return undefined;
  }
  const exercises: PlannedExercise[] = [];
  for (const raw of value.exercises) {
    const planned = plannedExerciseFrom(raw);
    if (planned === undefined) return undefined;
    exercises.push(planned);
  }
  const day: ProgramDay = { id, type, label, exercises };
  const labelAr = text(value.labelAr);
  if (labelAr !== undefined) day.labelAr = labelAr;
  return day;
}

function programFrom(value: unknown): Program | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const name = text(value.name);
  if (
    id === undefined ||
    name === undefined ||
    !Array.isArray(value.days) ||
    !isRecord(value.schedule)
  ) {
    return undefined;
  }
  const days: ProgramDay[] = [];
  for (const raw of value.days) {
    const day = programDayFrom(raw);
    if (day === undefined) return undefined;
    days.push(day);
  }
  const dayIds = new Set(days.map((day) => day.id));
  const schedule: Record<number, string | null> = {};
  for (const [weekday, slot] of Object.entries(value.schedule)) {
    const index = Number(weekday);
    if (!Number.isInteger(index) || index < 0 || index > 6) return undefined;
    if (slot === null) {
      schedule[index] = null;
      continue;
    }
    const dayId = text(slot);
    // A schedule pointing at a day the program does not have is a rest day.
    schedule[index] = dayId !== undefined && dayIds.has(dayId) ? dayId : null;
  }
  const now = new Date().toISOString();
  const program: Program = {
    id,
    name,
    days,
    schedule,
    createdAt: timestamp(value.createdAt) ?? now,
    updatedAt: timestamp(value.updatedAt) ?? now,
  };
  const nameAr = text(value.nameAr);
  if (nameAr !== undefined) program.nameAr = nameAr;
  return program;
}

function profileFrom(value: unknown): Profile | undefined {
  if (!isRecord(value)) return undefined;
  const sex = oneOf(value.sex, SEXES);
  const age = positive(value.age);
  const heightCm = positive(value.heightCm);
  const weightKg = positive(value.weightKg);
  const activityLevel = oneOf(value.activityLevel, ACTIVITY_LEVELS);
  const goal = oneOf(value.goal, GOALS);
  const units = oneOf(value.units, UNIT_SYSTEMS);
  if (
    sex === undefined ||
    age === undefined ||
    heightCm === undefined ||
    weightKg === undefined ||
    activityLevel === undefined ||
    goal === undefined ||
    units === undefined
  ) {
    return undefined;
  }
  const now = new Date().toISOString();
  const profile: Profile = {
    sex,
    age,
    heightCm,
    weightKg,
    activityLevel,
    goal,
    units,
    createdAt: timestamp(value.createdAt) ?? now,
    updatedAt: timestamp(value.updatedAt) ?? now,
  };
  const customCalorieTarget = positive(value.customCalorieTarget);
  if (customCalorieTarget !== undefined) profile.customCalorieTarget = customCalorieTarget;
  return profile;
}

/** Settings merge field by field: a key the file omits keeps its current value. */
function settingsFrom(value: unknown, current: Settings): Settings | undefined {
  if (!isRecord(value)) return undefined;
  const next: Settings = { ...current };
  const photoAnalysis = oneOf(value.photoAnalysis, PHOTO_MODES);
  if (photoAnalysis !== undefined) next.photoAnalysis = photoAnalysis;
  const aiBaseUrl = text(value.aiBaseUrl);
  if (aiBaseUrl !== undefined && HTTP_URL_PATTERN.test(aiBaseUrl)) next.aiBaseUrl = aiBaseUrl;
  const aiModel = text(value.aiModel);
  if (aiModel !== undefined) next.aiModel = aiModel;
  const confirmBeforeUpload = flag(value.confirmBeforeUpload);
  if (confirmBeforeUpload !== undefined) next.confirmBeforeUpload = confirmBeforeUpload;
  return next;
}

function emptyCounts(): Record<ImportKind, ImportCounts> {
  const counts = {} as Record<ImportKind, ImportCounts>;
  for (const kind of IMPORT_KINDS) counts[kind] = { added: 0, replaced: 0, skipped: 0 };
  return counts;
}

function emptyResult(): ImportResult {
  return { ok: false, counts: emptyCounts(), added: 0, replaced: 0, skipped: 0, problems: [] };
}

/** Fills in the totals once every key has been walked. */
function totalled(result: ImportResult): ImportResult {
  let added = 0;
  let replaced = 0;
  let skipped = 0;
  for (const kind of IMPORT_KINDS) {
    added += result.counts[kind].added;
    replaced += result.counts[kind].replaced;
    skipped += result.counts[kind].skipped;
  }
  return { ...result, added, replaced, skipped };
}

/**
 * The most precise reason a record was refused, so the report can say why
 * rather than only how many.
 */
function rejection(
  kind: ImportKind,
  value: unknown,
  position: number,
  date?: string,
): ImportProblem {
  const problem: ImportProblem = { code: 'badRecord', kind, position };
  if (date !== undefined) problem.date = date;
  if (!isRecord(value)) return problem;
  const id = text(value.id);
  if (id === undefined) return problem;
  problem.id = id;
  if (kind === 'scans' || kind === 'weights') {
    if (dateKey(value.date) === undefined) {
      problem.code = 'badDate';
      return problem;
    }
    if (positive(value.weightKg) === undefined) {
      problem.code = 'badWeight';
      return problem;
    }
  }
  problem.code = 'badFields';
  return problem;
}

/** Records a refused record against its kind and says why. */
function reject(result: ImportResult, kind: ImportKind, problem: ImportProblem): void {
  result.counts[kind].skipped += 1;
  result.problems.push(problem);
}

/**
 * Reads an export file back into storage.
 *
 * Accepts the whole bundle `exportAll` produces and any subset of its keys.
 * Nothing is written until the record has been checked field by field, so a
 * malformed file leaves what is already here untouched. Merging is by id, which
 * makes a second import of the same file replace rather than duplicate.
 *
 * With `dryRun` the same counts come back and storage is never touched, which
 * is how the screen can warn before anything is overwritten.
 */
export async function importBundle(
  raw: string,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const dryRun = options.dryRun === true;
  const result = emptyResult();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    result.problems.push({ code: 'notJson' });
    return totalled(result);
  }
  if (!isRecord(parsed)) {
    result.problems.push({ code: 'notObject' });
    return totalled(result);
  }
  if (parsed.version !== undefined) {
    const version = finite(parsed.version);
    if (version !== IMPORT_VERSION) {
      const problem: ImportProblem = { code: 'unsupportedVersion' };
      if (version !== undefined) problem.version = version;
      result.problems.push(problem);
      return totalled(result);
    }
  }

  let recognised = 0;

  /* ----------------------------------------------------------- readings -- */
  if (parsed.scans !== undefined) {
    recognised += 1;
    if (!Array.isArray(parsed.scans)) {
      result.problems.push({ code: 'wrongShape', kind: 'scans' });
    } else {
      const existing = await getBodyScans();
      const existingIds = new Set(existing.map((scan) => scan.id));
      const staged = new Map<string, BodyScan>();
      parsed.scans.forEach((value, index) => {
        const scan = scanFrom(value);
        if (scan === undefined) {
          reject(result, 'scans', rejection('scans', value, index + 1));
          return;
        }
        if (staged.has(scan.id)) {
          reject(result, 'scans', {
            code: 'duplicate',
            kind: 'scans',
            position: index + 1,
            id: scan.id,
          });
          return;
        }
        staged.set(scan.id, scan);
        if (existingIds.has(scan.id)) result.counts.scans.replaced += 1;
        else result.counts.scans.added += 1;
      });
      if (!dryRun && staged.size > 0) {
        const merged = existing
          .filter((scan) => !staged.has(scan.id))
          .concat([...staged.values()]);
        merged.sort((a, b) => a.date.localeCompare(b.date));
        await writeJson(KEYS.scans, merged);
      }
    }
  }

  /* ------------------------------------------------------------ weights -- */
  if (parsed.weights !== undefined) {
    recognised += 1;
    if (!Array.isArray(parsed.weights)) {
      result.problems.push({ code: 'wrongShape', kind: 'weights' });
    } else {
      const existing = await getWeightLogs();
      const staged = new Map<string, WeightLog>();
      const stagedDates = new Set<string>();
      parsed.weights.forEach((value, index) => {
        const log = weightLogFrom(value);
        if (log === undefined) {
          reject(result, 'weights', rejection('weights', value, index + 1));
          return;
        }
        // One entry per day is the invariant everywhere else, so a repeated id
        // and a repeated day are both duplicates here.
        if (staged.has(log.id) || stagedDates.has(log.date)) {
          reject(result, 'weights', {
            code: 'duplicate',
            kind: 'weights',
            position: index + 1,
            id: log.id,
            date: log.date,
          });
          return;
        }
        staged.set(log.id, log);
        stagedDates.add(log.date);
        const clash = existing.some((item) => item.id === log.id || item.date === log.date);
        if (clash) result.counts.weights.replaced += 1;
        else result.counts.weights.added += 1;
      });
      if (!dryRun && staged.size > 0) {
        const merged = existing
          .filter((log) => !staged.has(log.id) && !stagedDates.has(log.date))
          .concat([...staged.values()]);
        merged.sort((a, b) => a.date.localeCompare(b.date));
        await writeJson(KEYS.weights, merged);
      }
    }
  }

  /* -------------------------------------------------------------- meals -- */
  if (parsed.meals !== undefined) {
    recognised += 1;
    if (!isRecord(parsed.meals)) {
      result.problems.push({ code: 'wrongShape', kind: 'meals' });
    } else {
      const existingDates = await getMealIndex();
      const dateById = new Map<string, string>();
      for (const date of existingDates) {
        for (const meal of await getMealsForDate(date)) dateById.set(meal.id, date);
      }
      const staged = new Map<string, Meal>();
      for (const [dayKey, list] of Object.entries(parsed.meals)) {
        const day = dateKey(dayKey);
        if (day === undefined || !Array.isArray(list)) {
          const problem: ImportProblem = { code: 'wrongShape', kind: 'meals' };
          if (day !== undefined) problem.date = day;
          result.problems.push(problem);
          continue;
        }
        list.forEach((value, index) => {
          const meal = mealFrom(value, day);
          if (meal === undefined) {
            reject(result, 'meals', rejection('meals', value, index + 1, day));
            return;
          }
          if (staged.has(meal.id)) {
            reject(result, 'meals', {
              code: 'duplicate',
              kind: 'meals',
              position: index + 1,
              id: meal.id,
              date: day,
            });
            return;
          }
          staged.set(meal.id, meal);
          if (dateById.has(meal.id)) result.counts.meals.replaced += 1;
          else result.counts.meals.added += 1;
        });
      }
      if (!dryRun && staged.size > 0) {
        // Every day the import touches, plus every day it takes a meal away
        // from, so the index never keeps a day that has emptied out.
        const touched = new Set<string>();
        for (const meal of staged.values()) {
          touched.add(meal.date);
          const previous = dateById.get(meal.id);
          if (previous !== undefined) touched.add(previous);
        }
        for (const date of touched) {
          const current = await getMealsForDate(date);
          const kept = current.filter((meal) => !staged.has(meal.id));
          const mine = [...staged.values()].filter((meal) => meal.date === date);
          const next = [...kept, ...mine].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
          await setMealsForDate(date, next);
        }
      }
    }
  }

  /* ----------------------------------------------------------- workouts -- */
  if (parsed.workouts !== undefined) {
    recognised += 1;
    if (!isRecord(parsed.workouts)) {
      result.problems.push({ code: 'wrongShape', kind: 'workouts' });
    } else {
      const existingDates = await getWorkoutIndex();
      const dateById = new Map<string, string>();
      for (const date of existingDates) {
        for (const session of await getWorkoutsForDate(date)) dateById.set(session.id, date);
      }
      const staged = new Map<string, WorkoutSession>();
      for (const [dayKey, list] of Object.entries(parsed.workouts)) {
        const day = dateKey(dayKey);
        if (day === undefined || !Array.isArray(list)) {
          const problem: ImportProblem = { code: 'wrongShape', kind: 'workouts' };
          if (day !== undefined) problem.date = day;
          result.problems.push(problem);
          continue;
        }
        list.forEach((value, index) => {
          const session = workoutFrom(value, day);
          if (session === undefined) {
            reject(result, 'workouts', rejection('workouts', value, index + 1, day));
            return;
          }
          if (staged.has(session.id)) {
            reject(result, 'workouts', {
              code: 'duplicate',
              kind: 'workouts',
              position: index + 1,
              id: session.id,
              date: day,
            });
            return;
          }
          staged.set(session.id, session);
          if (dateById.has(session.id)) result.counts.workouts.replaced += 1;
          else result.counts.workouts.added += 1;
        });
      }
      if (!dryRun && staged.size > 0) {
        const touched = new Set<string>();
        for (const session of staged.values()) {
          touched.add(session.date);
          const previous = dateById.get(session.id);
          if (previous !== undefined) touched.add(previous);
        }
        for (const date of touched) {
          const current = await getWorkoutsForDate(date);
          const kept = current.filter((session) => !staged.has(session.id));
          const mine = [...staged.values()].filter((session) => session.date === date);
          const next = [...kept, ...mine].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
          await setWorkoutsForDate(date, next);
        }
      }
    }
  }

  /* -------------------------------------------------------------- foods -- */
  if (parsed.customFoods !== undefined) {
    recognised += 1;
    if (!Array.isArray(parsed.customFoods)) {
      result.problems.push({ code: 'wrongShape', kind: 'customFoods' });
    } else {
      const existing = await getCustomFoods();
      const existingIds = new Set(existing.map((food) => food.id));
      const staged = new Map<string, FoodItem>();
      parsed.customFoods.forEach((value, index) => {
        const food = foodFrom(value);
        if (food === undefined) {
          reject(result, 'customFoods', rejection('customFoods', value, index + 1));
          return;
        }
        if (staged.has(food.id)) {
          reject(result, 'customFoods', {
            code: 'duplicate',
            kind: 'customFoods',
            position: index + 1,
            id: food.id,
          });
          return;
        }
        staged.set(food.id, food);
        if (existingIds.has(food.id)) result.counts.customFoods.replaced += 1;
        else result.counts.customFoods.added += 1;
      });
      if (!dryRun && staged.size > 0) {
        // Newest first, the order the picker offers them in.
        const merged = [...staged.values()].concat(
          existing.filter((food) => !staged.has(food.id)),
        );
        await writeJson(KEYS.customFoods, merged);
      }
    }
  }

  /* ---------------------------------------------------------- exercises -- */
  if (parsed.customExercises !== undefined) {
    recognised += 1;
    if (!Array.isArray(parsed.customExercises)) {
      result.problems.push({ code: 'wrongShape', kind: 'customExercises' });
    } else {
      const existing = await getCustomExercises();
      const existingIds = new Set(existing.map((exercise) => exercise.id));
      const staged = new Map<string, Exercise>();
      parsed.customExercises.forEach((value, index) => {
        const exercise = exerciseFrom(value);
        if (exercise === undefined) {
          reject(result, 'customExercises', rejection('customExercises', value, index + 1));
          return;
        }
        if (staged.has(exercise.id)) {
          reject(result, 'customExercises', {
            code: 'duplicate',
            kind: 'customExercises',
            position: index + 1,
            id: exercise.id,
          });
          return;
        }
        staged.set(exercise.id, exercise);
        if (existingIds.has(exercise.id)) result.counts.customExercises.replaced += 1;
        else result.counts.customExercises.added += 1;
      });
      if (!dryRun && staged.size > 0) {
        const merged = [...staged.values()].concat(
          existing.filter((exercise) => !staged.has(exercise.id)),
        );
        await writeJson(KEYS.customExercises, merged);
      }
    }
  }

  /* ------------------------------------------------------------ program -- */
  if (parsed.program !== undefined) {
    recognised += 1;
    if (parsed.program !== null) {
      const program = programFrom(parsed.program);
      if (program === undefined) {
        reject(result, 'program', rejection('program', parsed.program, 1));
      } else {
        const existing = await getProgram();
        if (existing === null) result.counts.program.added += 1;
        else result.counts.program.replaced += 1;
        if (!dryRun) await writeJson(KEYS.program, program);
      }
    }
  }

  /* ------------------------------------------------------------ profile -- */
  if (parsed.profile !== undefined) {
    recognised += 1;
    if (parsed.profile !== null) {
      const profile = profileFrom(parsed.profile);
      if (profile === undefined) {
        reject(result, 'profile', rejection('profile', parsed.profile, 1));
      } else {
        const existing = await getProfile();
        if (existing === null) result.counts.profile.added += 1;
        else result.counts.profile.replaced += 1;
        if (!dryRun) await writeJson(KEYS.profile, profile);
      }
    }
  }

  /* ----------------------------------------------------------- settings -- */
  if (parsed.settings !== undefined) {
    recognised += 1;
    const current = await getSettings();
    const next = settingsFrom(parsed.settings, current);
    if (next === undefined) {
      reject(result, 'settings', { code: 'wrongShape', kind: 'settings' });
    } else {
      result.counts.settings.replaced += 1;
      if (!dryRun) await writeJson(KEYS.settings, next);
    }
  }

  if (recognised === 0) {
    result.problems.push({ code: 'nothingRecognised' });
    return totalled(result);
  }

  result.ok = true;
  return totalled(result);
}

/** Wipes every key this app owns. Other AsyncStorage users are untouched. */
export async function clearAll(): Promise<void> {
  const dates = await getMealIndex();
  const workoutDates = await getWorkoutIndex();
  const keys = [
    KEYS.profile,
    KEYS.settings,
    KEYS.weights,
    KEYS.customFoods,
    KEYS.mealIndex,
    ...dates.map((date) => KEYS.mealsFor(date)),
    KEYS.program,
    KEYS.customExercises,
    KEYS.workoutIndex,
    ...workoutDates.map((date) => KEYS.workoutsFor(date)),
    KEYS.scans,
  ];
  await AsyncStorage.multiRemove(keys);
}

/** Convenience used by the dashboard on first paint. */
export async function getTodayMeals(): Promise<Meal[]> {
  return getMealsForDate(todayKey());
}
