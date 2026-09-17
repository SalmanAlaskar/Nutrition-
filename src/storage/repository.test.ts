/// <reference types="jest" />
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FoodItem, Meal, MealEntry, Profile, WeightLog } from '@/types';

import { KEYS } from './keys';
import {
  DEFAULT_SETTINGS,
  addMeal,
  clearAll,
  deleteCustomFood,
  deleteMeal,
  deleteWeightLog,
  exportAll,
  findMeal,
  getCustomFoods,
  getLoggedDates,
  getMealsForDate,
  getMealsForDates,
  getProfile,
  getSettings,
  getWeightLogs,
  saveCustomFood,
  saveProfile,
  saveSettings,
  saveWeightLog,
  updateMeal,
} from './repository';

const entry = (calories: number, name = 'Food'): MealEntry => ({
  id: `e_${name}`,
  name,
  quantityGrams: 100,
  macros: { calories, protein: 10, carbs: 20, fat: 5 },
  source: 'database',
});

const meal = (overrides: Partial<Meal> & Pick<Meal, 'id' | 'date'>): Meal => ({
  loggedAt: `${overrides.date}T08:00:00.000Z`,
  slot: 'breakfast',
  entries: [entry(300)],
  ...overrides,
});

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  sex: 'female',
  age: 31,
  heightCm: 166,
  weightKg: 62,
  activityLevel: 'moderate',
  goal: 'lose',
  units: 'metric',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const rawKeys = async (): Promise<string[]> => [...(await AsyncStorage.getAllKeys())].sort();

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('profile', () => {
  it('returns null before anything is saved', async () => {
    expect(await getProfile()).toBeNull();
  });

  it('round-trips a profile and re-stamps updatedAt', async () => {
    const input = profile({ updatedAt: '2000-01-01T00:00:00.000Z' });
    const saved = await saveProfile(input);

    expect(saved.updatedAt).not.toBe(input.updatedAt);
    expect(Number.isNaN(Date.parse(saved.updatedAt))).toBe(false);
    expect(saved.createdAt).toBe(input.createdAt);

    const loaded = await getProfile();
    expect(loaded).toEqual(saved);
    expect(loaded?.sex).toBe('female');
    expect(loaded?.weightKg).toBe(62);
  });

  it('keeps an optional custom calorie target through the round trip', async () => {
    await saveProfile(profile({ customCalorieTarget: 1850 }));
    expect((await getProfile())?.customCalorieTarget).toBe(1850);
  });

  it('returns null rather than throwing when the stored value is corrupt', async () => {
    // The repository logs the bad read; that warning is expected here, not noise.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await AsyncStorage.setItem(KEYS.profile, '{not json');
    expect(await getProfile()).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('settings', () => {
  it('returns the defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges a partial stored value over the defaults', async () => {
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify({ photoAnalysis: 'ai' }));
    const settings = await getSettings();
    expect(settings.photoAnalysis).toBe('ai');
    expect(settings.aiBaseUrl).toBe(DEFAULT_SETTINGS.aiBaseUrl);
    expect(settings.aiModel).toBe(DEFAULT_SETTINGS.aiModel);
    expect(settings.confirmBeforeUpload).toBe(DEFAULT_SETTINGS.confirmBeforeUpload);
  });

  it('keeps a stored false rather than letting the default win', async () => {
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify({ confirmBeforeUpload: false }));
    expect((await getSettings()).confirmBeforeUpload).toBe(false);
  });

  it('round-trips a full save', async () => {
    const next = { ...DEFAULT_SETTINGS, photoAnalysis: 'ai' as const, aiModel: 'claude-x' };
    expect(await saveSettings(next)).toEqual(next);
    expect(await getSettings()).toEqual(next);
  });
});

describe('meals', () => {
  it('adds a meal and indexes its day', async () => {
    const m = meal({ id: 'm1', date: '2024-03-10' });
    expect(await addMeal(m)).toEqual(m);
    expect(await getMealsForDate('2024-03-10')).toEqual([m]);
    expect(await getLoggedDates()).toEqual(['2024-03-10']);
  });

  it('returns an empty list for a day with nothing on it', async () => {
    expect(await getMealsForDate('2024-03-10')).toEqual([]);
    expect(await getLoggedDates()).toEqual([]);
  });

  it('returns a day sorted by the time each meal was logged', async () => {
    const late = meal({ id: 'late', date: '2024-03-10', loggedAt: '2024-03-10T20:00:00.000Z' });
    const early = meal({ id: 'early', date: '2024-03-10', loggedAt: '2024-03-10T07:00:00.000Z' });
    await addMeal(late);
    await addMeal(early);
    expect((await getMealsForDate('2024-03-10')).map((m) => m.id)).toEqual(['early', 'late']);
  });

  it('keeps the day index sorted however the days arrive', async () => {
    for (const date of ['2024-03-10', '2024-01-05', '2024-12-31', '2024-02-29']) {
      await addMeal(meal({ id: `m_${date}`, date }));
    }
    expect(await getLoggedDates()).toEqual([
      '2024-01-05',
      '2024-02-29',
      '2024-03-10',
      '2024-12-31',
    ]);
  });

  it('indexes a day only once, however many meals it holds', async () => {
    await addMeal(meal({ id: 'a', date: '2024-03-10' }));
    await addMeal(meal({ id: 'b', date: '2024-03-10' }));
    expect(await getLoggedDates()).toEqual(['2024-03-10']);
    expect(await getMealsForDate('2024-03-10')).toHaveLength(2);
  });

  it('updates a meal in place', async () => {
    await addMeal(meal({ id: 'a', date: '2024-03-10' }));
    await addMeal(meal({ id: 'b', date: '2024-03-10', loggedAt: '2024-03-10T09:00:00.000Z' }));

    const edited = meal({
      id: 'a',
      date: '2024-03-10',
      slot: 'lunch',
      entries: [entry(555, 'Edited')],
    });
    await updateMeal(edited);

    const day = await getMealsForDate('2024-03-10');
    expect(day).toHaveLength(2);
    expect(day.find((m) => m.id === 'a')).toEqual(edited);
    expect(day.find((m) => m.id === 'b')?.slot).toBe('breakfast');
  });

  it('adds a meal that updateMeal cannot find on its day', async () => {
    const orphan = meal({ id: 'ghost', date: '2024-03-10' });
    await updateMeal(orphan);
    expect(await getMealsForDate('2024-03-10')).toEqual([orphan]);
    expect(await getLoggedDates()).toEqual(['2024-03-10']);
  });

  it('moves a meal to another day, leaving no key and no index entry behind', async () => {
    const original = meal({ id: 'm1', date: '2024-03-10' });
    await addMeal(original);
    expect(await rawKeys()).toContain(KEYS.mealsFor('2024-03-10'));

    const moved: Meal = { ...original, date: '2024-03-12', loggedAt: '2024-03-12T08:00:00.000Z' };
    await updateMeal(moved, '2024-03-10');

    expect(await getMealsForDate('2024-03-12')).toEqual([moved]);
    expect(await getMealsForDate('2024-03-10')).toEqual([]);
    expect(await getLoggedDates()).toEqual(['2024-03-12']);
    expect(await rawKeys()).not.toContain(KEYS.mealsFor('2024-03-10'));
  });

  it('keeps the old day when it still holds another meal after a move', async () => {
    await addMeal(meal({ id: 'stay', date: '2024-03-10' }));
    const goer = meal({ id: 'go', date: '2024-03-10', loggedAt: '2024-03-10T12:00:00.000Z' });
    await addMeal(goer);

    await updateMeal({ ...goer, date: '2024-03-11' }, '2024-03-10');

    expect((await getMealsForDate('2024-03-10')).map((m) => m.id)).toEqual(['stay']);
    expect(await getLoggedDates()).toEqual(['2024-03-10', '2024-03-11']);
  });

  it('deletes a meal and drops the day once it is empty', async () => {
    await addMeal(meal({ id: 'a', date: '2024-03-10' }));
    await addMeal(meal({ id: 'b', date: '2024-03-10', loggedAt: '2024-03-10T12:00:00.000Z' }));

    await deleteMeal('2024-03-10', 'a');
    expect((await getMealsForDate('2024-03-10')).map((m) => m.id)).toEqual(['b']);
    expect(await getLoggedDates()).toEqual(['2024-03-10']);

    await deleteMeal('2024-03-10', 'b');
    expect(await getMealsForDate('2024-03-10')).toEqual([]);
    expect(await getLoggedDates()).toEqual([]);
    expect(await rawKeys()).not.toContain(KEYS.mealsFor('2024-03-10'));
  });

  it('ignores a delete for a meal that is not there', async () => {
    await addMeal(meal({ id: 'a', date: '2024-03-10' }));
    await deleteMeal('2024-03-10', 'nope');
    expect((await getMealsForDate('2024-03-10')).map((m) => m.id)).toEqual(['a']);
    await deleteMeal('2024-03-11', 'a');
    expect(await getLoggedDates()).toEqual(['2024-03-10']);
  });

  it('finds a meal on an older day', async () => {
    const old = meal({ id: 'old', date: '2024-01-05' });
    await addMeal(old);
    await addMeal(meal({ id: 'recent', date: '2024-03-10' }));

    expect(await findMeal('old')).toEqual(old);
    expect(await findMeal('recent')).not.toBeNull();
    expect(await findMeal('missing')).toBeNull();
  });

  it('returns meals for several days, omitting the empty ones', async () => {
    await addMeal(meal({ id: 'a', date: '2024-03-08' }));
    await addMeal(meal({ id: 'b', date: '2024-03-10' }));

    const byDate = await getMealsForDates(['2024-03-08', '2024-03-09', '2024-03-10']);
    expect(Object.keys(byDate).sort()).toEqual(['2024-03-08', '2024-03-10']);
    expect(byDate['2024-03-10'].map((m) => m.id)).toEqual(['b']);
    expect(await getMealsForDates([])).toEqual({});
  });
});

describe('weight logs', () => {
  const log = (id: string, date: string, weightKg: number): WeightLog => ({ id, date, weightKg });

  it('starts empty', async () => {
    expect(await getWeightLogs()).toEqual([]);
  });

  it('keeps the logs sorted oldest first', async () => {
    await saveWeightLog(log('w2', '2024-03-10', 61));
    await saveWeightLog(log('w1', '2024-03-01', 62));
    expect((await getWeightLogs()).map((l) => l.date)).toEqual(['2024-03-01', '2024-03-10']);
  });

  it('replaces a same-day entry rather than duplicating it', async () => {
    await saveWeightLog(log('w1', '2024-03-10', 62));
    const after = await saveWeightLog(log('w2', '2024-03-10', 61.5));

    expect(after).toHaveLength(1);
    expect(after[0]).toEqual({ id: 'w2', date: '2024-03-10', weightKg: 61.5 });
    expect(await getWeightLogs()).toEqual(after);
  });

  it('deletes by id', async () => {
    await saveWeightLog(log('w1', '2024-03-01', 62));
    await saveWeightLog(log('w2', '2024-03-10', 61));
    expect(await deleteWeightLog('w1')).toEqual([log('w2', '2024-03-10', 61)]);
    expect(await getWeightLogs()).toHaveLength(1);
  });
});

describe('custom foods', () => {
  const food = (id: string, name: string): FoodItem => ({
    id,
    name,
    category: 'dishes',
    per100: { calories: 200, protein: 10, carbs: 20, fat: 8 },
    servings: [{ label: '1 portion (250 g)', grams: 250 }],
  });

  it('starts empty', async () => {
    expect(await getCustomFoods()).toEqual([]);
  });

  it('puts the newest food first and replaces one saved under the same id', async () => {
    await saveCustomFood(food('f1', 'Mum’s stew'));
    await saveCustomFood(food('f2', 'Office salad'));
    expect((await getCustomFoods()).map((f) => f.id)).toEqual(['f2', 'f1']);

    await saveCustomFood(food('f1', 'Mum’s stew, revised'));
    const foods = await getCustomFoods();
    expect(foods.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(foods[0].name).toBe('Mum’s stew, revised');
  });

  it('deletes by id', async () => {
    await saveCustomFood(food('f1', 'One'));
    await saveCustomFood(food('f2', 'Two'));
    expect(await deleteCustomFood('f1')).toHaveLength(1);
    expect((await getCustomFoods()).map((f) => f.id)).toEqual(['f2']);
  });
});

describe('exportAll and clearAll', () => {
  const seed = async () => {
    await saveProfile(profile());
    await saveSettings({ ...DEFAULT_SETTINGS, photoAnalysis: 'ai' });
    await saveWeightLog({ id: 'w1', date: '2024-03-10', weightKg: 62 });
    await saveCustomFood({
      id: 'f1',
      name: 'Leftovers',
      category: 'dishes',
      per100: { calories: 180, protein: 9, carbs: 18, fat: 7 },
      servings: [{ label: '1 box (300 g)', grams: 300 }],
    });
    await addMeal(meal({ id: 'm1', date: '2024-03-09' }));
    await addMeal(meal({ id: 'm2', date: '2024-03-10' }));
  };

  it('exports every part of the store', async () => {
    await seed();
    const bundle = await exportAll();
    expect(bundle.profile?.age).toBe(31);
    expect(bundle.settings.photoAnalysis).toBe('ai');
    expect(bundle.weights).toHaveLength(1);
    expect(bundle.customFoods).toHaveLength(1);
    expect(Object.keys(bundle.meals).sort()).toEqual(['2024-03-09', '2024-03-10']);
    expect(Number.isNaN(Date.parse(bundle.exportedAt))).toBe(false);
  });

  it('leaves nothing behind', async () => {
    await seed();
    expect((await rawKeys()).length).toBeGreaterThan(0);

    await clearAll();

    expect(await rawKeys()).toEqual([]);
    expect(await getProfile()).toBeNull();
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await getLoggedDates()).toEqual([]);
    expect(await getMealsForDate('2024-03-10')).toEqual([]);
    expect(await getWeightLogs()).toEqual([]);
    expect(await getCustomFoods()).toEqual([]);
  });

  it('leaves keys that belong to other AsyncStorage users alone', async () => {
    await seed();
    await AsyncStorage.setItem('@someone-else/token', 'keep me');
    await clearAll();
    expect(await AsyncStorage.getItem('@someone-else/token')).toBe('keep me');
    expect(await rawKeys()).toEqual(['@someone-else/token']);
  });
});
