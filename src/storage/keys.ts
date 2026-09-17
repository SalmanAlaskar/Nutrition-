/** AsyncStorage key namespace. Meals are sharded per day so reads stay small. */
export const STORAGE_PREFIX = '@nutrition/v1';

export const KEYS = {
  profile: `${STORAGE_PREFIX}/profile`,
  settings: `${STORAGE_PREFIX}/settings`,
  weights: `${STORAGE_PREFIX}/weights`,
  customFoods: `${STORAGE_PREFIX}/customFoods`,
  /** Sorted list of day keys that have at least one meal. */
  mealIndex: `${STORAGE_PREFIX}/mealIndex`,
  mealsFor: (date: string) => `${STORAGE_PREFIX}/meals/${date}`,
  /** The single active training program. */
  program: `${STORAGE_PREFIX}/program`,
  customExercises: `${STORAGE_PREFIX}/customExercises`,
  /** Sorted list of day keys that have at least one workout. */
  workoutIndex: `${STORAGE_PREFIX}/workoutIndex`,
  workoutsFor: (date: string) => `${STORAGE_PREFIX}/workouts/${date}`,
  /** Every body-composition reading, in one list. */
  scans: `${STORAGE_PREFIX}/scans`,
} as const;

export const MEALS_KEY_PREFIX = `${STORAGE_PREFIX}/meals/`;
export const WORKOUTS_KEY_PREFIX = `${STORAGE_PREFIX}/workouts/`;
