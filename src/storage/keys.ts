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
} as const;

export const MEALS_KEY_PREFIX = `${STORAGE_PREFIX}/meals/`;
