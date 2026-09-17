import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { todayKey } from '@/domain/date';
import { makeId } from '@/domain/id';
import { macroTargets } from '@/domain/nutrition';
import { dailyTotals } from '@/domain/totals';
import * as repo from '@/storage/repository';
import type {
  DailyTotals,
  FoodItem,
  Meal,
  Profile,
  Settings,
  Targets,
  WeightLog,
} from '@/types';

interface AppContextValue {
  /** False until the first load from storage finishes. */
  ready: boolean;
  profile: Profile | null;
  settings: Settings;
  /** Day the dashboard and meal list are showing. */
  selectedDate: string;
  meals: Meal[];
  loggedDates: string[];
  weights: WeightLog[];
  customFoods: FoodItem[];
  /** Null until a profile exists. */
  targets: Targets | null;
  totals: DailyTotals;

  setSelectedDate: (date: string) => void;
  saveProfile: (profile: Profile) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  addMeal: (meal: Meal) => Promise<void>;
  updateMeal: (meal: Meal, previousDate?: string) => Promise<void>;
  deleteMeal: (date: string, mealId: string) => Promise<void>;
  logWeight: (weightKg: number, date?: string) => Promise<void>;
  addCustomFood: (food: FoodItem) => Promise<void>;
  refresh: () => Promise<void>;
  resetAll: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings>(repo.DEFAULT_SETTINGS);
  const [selectedDate, setSelectedDate] = useState<string>(todayKey());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loggedDates, setLoggedDates] = useState<string[]>([]);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [customFoods, setCustomFoods] = useState<FoodItem[]>([]);

  const loadDay = useCallback(async (date: string) => {
    setMeals(await repo.getMealsForDate(date));
  }, []);

  const refresh = useCallback(async () => {
    const [loadedProfile, loadedSettings, dates, logs, foods] = await Promise.all([
      repo.getProfile(),
      repo.getSettings(),
      repo.getLoggedDates(),
      repo.getWeightLogs(),
      repo.getCustomFoods(),
    ]);
    setProfile(loadedProfile);
    setSettings(loadedSettings);
    setLoggedDates(dates);
    setWeights(logs);
    setCustomFoods(foods);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await refresh();
        if (active) await loadDay(todayKey());
      } catch (error) {
        console.warn('[store] initial load failed', error);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [refresh, loadDay]);

  useEffect(() => {
    if (!ready) return;
    void loadDay(selectedDate);
  }, [selectedDate, ready, loadDay]);

  const saveProfile = useCallback(async (next: Profile) => {
    setProfile(await repo.saveProfile(next));
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      const base: Profile =
        profile ?? {
          sex: 'male',
          age: 30,
          heightCm: 175,
          weightKg: 75,
          activityLevel: 'moderate',
          goal: 'maintain',
          units: 'metric',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      setProfile(await repo.saveProfile({ ...base, ...patch }));
    },
    [profile],
  );

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings(await repo.saveSettings({ ...settings, ...patch }));
    },
    [settings],
  );

  const syncAfterMealChange = useCallback(
    async (date: string) => {
      setLoggedDates(await repo.getLoggedDates());
      if (date === selectedDate) await loadDay(date);
    },
    [selectedDate, loadDay],
  );

  const addMeal = useCallback(
    async (meal: Meal) => {
      await repo.addMeal(meal);
      await syncAfterMealChange(meal.date);
    },
    [syncAfterMealChange],
  );

  const updateMeal = useCallback(
    async (meal: Meal, previousDate?: string) => {
      await repo.updateMeal(meal, previousDate);
      await syncAfterMealChange(meal.date);
      if (previousDate && previousDate !== meal.date) {
        await syncAfterMealChange(previousDate);
      }
    },
    [syncAfterMealChange],
  );

  const deleteMeal = useCallback(
    async (date: string, mealId: string) => {
      await repo.deleteMeal(date, mealId);
      await syncAfterMealChange(date);
    },
    [syncAfterMealChange],
  );

  const logWeight = useCallback(
    async (weightKg: number, date: string = todayKey()) => {
      const next = await repo.saveWeightLog({ id: makeId('w'), date, weightKg });
      setWeights(next);
      if (date === todayKey()) {
        await updateProfile({ weightKg });
      }
    },
    [updateProfile],
  );

  const addCustomFood = useCallback(async (food: FoodItem) => {
    setCustomFoods(await repo.saveCustomFood(food));
  }, []);

  const resetAll = useCallback(async () => {
    await repo.clearAll();
    setProfile(null);
    setSettings(repo.DEFAULT_SETTINGS);
    setMeals([]);
    setLoggedDates([]);
    setWeights([]);
    setCustomFoods([]);
    setSelectedDate(todayKey());
  }, []);

  const targets = useMemo(
    () => (profile ? macroTargets(profile) : null),
    [profile],
  );

  const totals = useMemo(
    () => dailyTotals(selectedDate, meals),
    [selectedDate, meals],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      profile,
      settings,
      selectedDate,
      meals,
      loggedDates,
      weights,
      customFoods,
      targets,
      totals,
      setSelectedDate,
      saveProfile,
      updateProfile,
      updateSettings,
      addMeal,
      updateMeal,
      deleteMeal,
      logWeight,
      addCustomFood,
      refresh,
      resetAll,
    }),
    [
      ready, profile, settings, selectedDate, meals, loggedDates, weights,
      customFoods, targets, totals, saveProfile, updateProfile, updateSettings,
      addMeal, updateMeal, deleteMeal, logWeight, addCustomFood, refresh, resetAll,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used inside <AppProvider>');
  }
  return context;
}
