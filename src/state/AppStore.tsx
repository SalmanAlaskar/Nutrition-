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
import {
  activePhase as phaseCovering,
  targetsForDate,
} from '@/domain/phase';
import { dailyTotals } from '@/domain/totals';
import { DEFAULT_PROGRAM } from '@/domain/training';
import { subscribeLinkImport, takeLinkImport } from '@/services/linkImport';
import * as repo from '@/storage/repository';
import type {
  BodyScan,
  DailyTotals,
  Exercise,
  FoodItem,
  Meal,
  Phase,
  Profile,
  Program,
  Settings,
  Targets,
  WeightLog,
  WorkoutSession,
} from '@/types';

interface AppContextValue {
  /**
   * False until the first load from storage finishes, and again while a link
   * import is replacing what is stored. Screens show their loading state while
   * it is false, which is what keeps figures that are about to change wholesale
   * from sitting on screen looking current.
   */
  ready: boolean;
  /**
   * Counts link imports that arrived at an already-open app. The app watches it
   * to send the person to what the link set up, wherever they were standing.
   */
  linkImportCount: number;
  profile: Profile | null;
  settings: Settings;
  /** Day the dashboard and meal list are showing. */
  selectedDate: string;
  meals: Meal[];
  loggedDates: string[];
  weights: WeightLog[];
  customFoods: FoodItem[];
  /** The active training program, seeded on first launch. */
  program: Program | null;
  /** Sessions logged on `selectedDate`. */
  todaysWorkouts: WorkoutSession[];
  /** Every day with at least one session, oldest first. */
  workoutDates: string[];
  /** Body-composition readings, oldest first. */
  bodyScans: BodyScan[];
  customExercises: Exercise[];
  /** Dated phases, earliest start first. */
  phases: Phase[];
  /** The phase covering today, or null when none does. Never `selectedDate`. */
  activePhase: Phase | null;
  /**
   * Target for `selectedDate`: the phase that covered that day owns it, so a
   * past day shows the target that applied then. Null until a profile exists.
   */
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
  saveProgram: (program: Program) => Promise<void>;
  addWorkout: (session: WorkoutSession) => Promise<void>;
  updateWorkout: (session: WorkoutSession, previousDate?: string) => Promise<void>;
  deleteWorkout: (date: string, sessionId: string) => Promise<void>;
  saveBodyScan: (scan: BodyScan) => Promise<void>;
  deleteBodyScan: (id: string) => Promise<void>;
  savePhase: (phase: Phase) => Promise<void>;
  deletePhase: (id: string) => Promise<void>;
  saveCustomExercise: (exercise: Exercise) => Promise<void>;
  deleteCustomExercise: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  resetAll: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [linkImportCount, setLinkImportCount] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings>(repo.DEFAULT_SETTINGS);
  const [selectedDate, setSelectedDate] = useState<string>(todayKey());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loggedDates, setLoggedDates] = useState<string[]>([]);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [customFoods, setCustomFoods] = useState<FoodItem[]>([]);
  const [program, setProgram] = useState<Program | null>(null);
  const [todaysWorkouts, setTodaysWorkouts] = useState<WorkoutSession[]>([]);
  const [workoutDates, setWorkoutDates] = useState<string[]>([]);
  const [bodyScans, setBodyScans] = useState<BodyScan[]>([]);
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);

  const loadDay = useCallback(async (date: string) => {
    const [dayMeals, daySessions] = await Promise.all([
      repo.getMealsForDate(date),
      repo.getWorkoutsForDate(date),
    ]);
    setMeals(dayMeals);
    setTodaysWorkouts(daySessions);
  }, []);

  const refresh = useCallback(async () => {
    const [
      loadedProfile,
      loadedSettings,
      dates,
      logs,
      foods,
      loadedProgram,
      trainedDates,
      scans,
      exercises,
      storedPhases,
    ] = await Promise.all([
      repo.getProfile(),
      repo.getSettings(),
      repo.getLoggedDates(),
      repo.getWeightLogs(),
      repo.getCustomFoods(),
      repo.getProgram(),
      repo.getWorkoutDates(),
      repo.getBodyScans(),
      repo.getCustomExercises(),
      repo.getPhases(),
    ]);
    setProfile(loadedProfile);
    setSettings(loadedSettings);
    setLoggedDates(dates);
    setWeights(logs);
    setCustomFoods(foods);
    // Seed the bundled split the first time, so the training tab is never empty.
    setProgram(loadedProgram ?? (await repo.saveProgram(DEFAULT_PROGRAM)));
    setWorkoutDates(trainedDates);
    setBodyScans(scans);
    setCustomExercises(exercises);
    setPhases(storedPhases);
  }, []);

  /** Never throws: a bad payload must not keep the app from opening. */
  const applyLinkImport = useCallback(async (payload: string) => {
    try {
      const outcome = await repo.importBundle(payload);
      console.log('[store] imported from link', outcome.counts);
    } catch (error) {
      console.warn('[store] link import failed', error);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // A link can carry readings in its fragment. Importing before the first
        // read means the app opens already showing them, with no second step
        // asked of the person who was handed the link.
        const payload = takeLinkImport();
        if (payload) await applyLinkImport(payload);
        await refresh();
        if (active) await loadDay(todayKey());
      } catch (error) {
        console.warn('[store] initial load failed', error);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [refresh, loadDay, applyLinkImport]);

  /**
   * The same link, tapped while the app is already open. The fragment changes
   * without a reload, so this is the only chance to read it; `importing` holds
   * the screens on their loading state meanwhile, so the figures go straight
   * from the spinner to the imported ones with no stale value in between.
   */
  useEffect(
    () =>
      subscribeLinkImport((payload) => {
        void (async () => {
          setImporting(true);
          try {
            await applyLinkImport(payload);
            await refresh();
            // The import is a fresh start; today is the day to land on.
            const today = todayKey();
            setSelectedDate(today);
            await loadDay(today);
          } catch (error) {
            console.warn('[store] reload after link import failed', error);
          } finally {
            setImporting(false);
            setLinkImportCount((count) => count + 1);
          }
        })();
      }),
    [applyLinkImport, refresh, loadDay],
  );

  const ready = loaded && !importing;

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

  const saveProgram = useCallback(async (next: Program) => {
    setProgram(await repo.saveProgram(next));
  }, []);

  const syncAfterWorkoutChange = useCallback(
    async (date: string) => {
      setWorkoutDates(await repo.getWorkoutDates());
      if (date === selectedDate) {
        setTodaysWorkouts(await repo.getWorkoutsForDate(date));
      }
    },
    [selectedDate],
  );

  const addWorkout = useCallback(
    async (session: WorkoutSession) => {
      await repo.addWorkout(session);
      await syncAfterWorkoutChange(session.date);
    },
    [syncAfterWorkoutChange],
  );

  const updateWorkout = useCallback(
    async (session: WorkoutSession, previousDate?: string) => {
      await repo.updateWorkout(session, previousDate);
      await syncAfterWorkoutChange(session.date);
      if (previousDate && previousDate !== session.date) {
        await syncAfterWorkoutChange(previousDate);
      }
    },
    [syncAfterWorkoutChange],
  );

  const deleteWorkout = useCallback(
    async (date: string, sessionId: string) => {
      await repo.deleteWorkout(date, sessionId);
      await syncAfterWorkoutChange(date);
    },
    [syncAfterWorkoutChange],
  );

  const saveBodyScan = useCallback(async (scan: BodyScan) => {
    setBodyScans(await repo.saveBodyScan(scan));
  }, []);

  const deleteBodyScan = useCallback(async (id: string) => {
    setBodyScans(await repo.deleteBodyScan(id));
  }, []);

  const saveCustomExercise = useCallback(async (exercise: Exercise) => {
    setCustomExercises(await repo.saveCustomExercise(exercise));
  }, []);

  const deleteCustomExercise = useCallback(async (id: string) => {
    setCustomExercises(await repo.deleteCustomExercise(id));
  }, []);

  const savePhase = useCallback(async (phase: Phase) => {
    setPhases(await repo.savePhase(phase));
  }, []);

  const deletePhase = useCallback(async (id: string) => {
    setPhases(await repo.deletePhase(id));
  }, []);

  const resetAll = useCallback(async () => {
    await repo.clearAll();
    setProfile(null);
    setSettings(repo.DEFAULT_SETTINGS);
    setMeals([]);
    setLoggedDates([]);
    setWeights([]);
    setCustomFoods([]);
    setTodaysWorkouts([]);
    setWorkoutDates([]);
    setBodyScans([]);
    setCustomExercises([]);
    setPhases([]);
    setProgram(await repo.saveProgram(DEFAULT_PROGRAM));
    setSelectedDate(todayKey());
  }, []);

  const activePhase = useMemo(
    () => phaseCovering(phases, todayKey()),
    [phases],
  );

  // Resolved for the day on screen, not for today: scrolling back to a day
  // inside a finished cut should show the target that was in force then.
  const targets = useMemo(
    () => (profile ? targetsForDate(profile, phases, selectedDate) : null),
    [profile, phases, selectedDate],
  );

  const totals = useMemo(
    () => dailyTotals(selectedDate, meals),
    [selectedDate, meals],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      linkImportCount,
      profile,
      settings,
      selectedDate,
      meals,
      loggedDates,
      weights,
      customFoods,
      program,
      todaysWorkouts,
      workoutDates,
      bodyScans,
      customExercises,
      phases,
      activePhase,
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
      saveProgram,
      addWorkout,
      updateWorkout,
      deleteWorkout,
      saveBodyScan,
      deleteBodyScan,
      savePhase,
      deletePhase,
      saveCustomExercise,
      deleteCustomExercise,
      refresh,
      resetAll,
    }),
    [
      ready, linkImportCount, profile, settings, selectedDate, meals, loggedDates, weights,
      customFoods, program, todaysWorkouts, workoutDates, bodyScans,
      customExercises, phases, activePhase, targets, totals,
      saveProfile, updateProfile, updateSettings,
      addMeal, updateMeal, deleteMeal, logWeight, addCustomFood, saveProgram,
      addWorkout, updateWorkout, deleteWorkout, saveBodyScan, deleteBodyScan,
      savePhase, deletePhase, saveCustomExercise, deleteCustomExercise,
      refresh, resetAll,
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
