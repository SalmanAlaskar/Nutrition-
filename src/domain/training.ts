/**
 * Training programs: the bundled Push/Pull/Legs split, the weekly schedule and
 * the helpers that turn a planned day into a logged session.
 *
 * The week is anchored to the Saudi calendar: weekday 0 is Sunday and the rest
 * day is Friday (weekday 5). Exercise ids are plain string literals so this
 * module never has to load the exercise database.
 */

import type { LanguageCode } from '@/i18n';
import type {
  PlannedExercise,
  Program,
  ProgramDay,
  SessionType,
  WorkoutSession,
} from '@/types';

import { addDays, parseDateKey } from './date';
import { makeId } from './id';
import { loggingStreak } from './totals';

/**
 * English day-type names. They are the fallback and the value stored with a
 * logged session; anything on screen goes through `SESSION_LABEL_KEYS` and
 * t() instead.
 */
export const SESSION_LABELS: Record<SessionType, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  upper: 'Upper',
  lower: 'Lower',
  full: 'Full body',
  cardio: 'Cardio',
};

/**
 * Translation keys, fully qualified so a caller only has to load the two
 * namespaces. One per day type.
 */
export const SESSION_LABEL_KEYS = {
  push: 'training:typePush',
  pull: 'training:typePull',
  legs: 'training:typeLegs',
  upper: 'training:typeUpper',
  lower: 'training:typeLower',
  full: 'training:typeFull',
  cardio: 'training:typeCardio',
} as const satisfies Record<SessionType, string>;

/** Translation keys for the muscles line that sits under a day type. */
export const SESSION_MUSCLE_KEYS = {
  push: 'training:musclesPush',
  pull: 'training:musclesPull',
  legs: 'training:musclesLegs',
  upper: 'training:musclesUpper',
  lower: 'training:musclesLower',
  full: 'training:musclesFull',
  cardio: 'training:musclesCardio',
} as const satisfies Record<SessionType, string>;

/** Weekday keys, Sunday first, the way the week runs here. */
export const WEEKDAY_LETTER_KEYS = [
  'training:letterSun',
  'training:letterMon',
  'training:letterTue',
  'training:letterWed',
  'training:letterThu',
  'training:letterFri',
  'training:letterSat',
] as const;

export const WEEKDAY_SHORT_KEYS = [
  'training:dayShortSun',
  'training:dayShortMon',
  'training:dayShortTue',
  'training:dayShortWed',
  'training:dayShortThu',
  'training:dayShortFri',
  'training:dayShortSat',
] as const;

/** Full weekday and month names are shared app-wide, so they live in `common`. */
export const WEEKDAY_LONG_KEYS = [
  'common:weekdaySunday',
  'common:weekdayMonday',
  'common:weekdayTuesday',
  'common:weekdayWednesday',
  'common:weekdayThursday',
  'common:weekdayFriday',
  'common:weekdaySaturday',
] as const;

export const MONTH_KEYS = [
  'common:monthJan',
  'common:monthFeb',
  'common:monthMar',
  'common:monthApr',
  'common:monthMay',
  'common:monthJun',
  'common:monthJul',
  'common:monthAug',
  'common:monthSep',
  'common:monthOct',
  'common:monthNov',
  'common:monthDec',
] as const;

/**
 * A program day carries its own label, which the user can have renamed, so it
 * is his data rather than copy: the Arabic one is shown when there is one.
 */
export function programDayLabel(day: ProgramDay, language: LanguageCode): string {
  return language === 'ar' && day.labelAr ? day.labelAr : day.label;
}

/** Same rule as `programDayLabel`, for the name of the program itself. */
export function programTitle(program: Program, language: LanguageCode): string {
  return language === 'ar' && program.nameAr ? program.nameAr : program.name;
}

/** Ionicons glyphs, one per session type. */
export const SESSION_ICONS: Record<SessionType, string> = {
  push: 'barbell-outline',
  pull: 'fitness-outline',
  legs: 'footsteps-outline',
  upper: 'body-outline',
  lower: 'walk-outline',
  full: 'layers-outline',
  cardio: 'heart-outline',
};

/**
 * The muscles each session type is built around, for a subtitle line. English
 * fallback only: on screen this goes through `SESSION_MUSCLE_KEYS` and t().
 */
export const SESSION_MUSCLES: Record<SessionType, string> = {
  push: 'Chest, shoulders, triceps',
  pull: 'Back, rear delts, biceps',
  legs: 'Quads, hamstrings, glutes, calves',
  upper: 'Chest, back, shoulders, arms',
  lower: 'Quads, hamstrings, glutes, calves',
  full: 'Whole body',
  cardio: 'Heart and lungs',
};

/** Weekday index of the rest day in the default program: Friday. */
export const DEFAULT_REST_WEEKDAY = 5;

const plan = (
  exerciseId: string,
  sets: number,
  repsLow: number,
  repsHigh: number,
  restSeconds: number,
): PlannedExercise => ({ exerciseId, sets, repsLow, repsHigh, restSeconds });

const PUSH_DAY: ProgramDay = {
  id: 'push_a',
  type: 'push',
  label: 'Push',
  labelAr: 'دفع',
  exercises: [
    plan('ex_bench_press', 4, 5, 8, 180),
    plan('ex_overhead_press', 3, 6, 10, 150),
    plan('ex_incline_db_press', 3, 8, 12, 120),
    plan('ex_lateral_raise', 3, 12, 20, 60),
    plan('ex_triceps_pushdown', 3, 10, 15, 60),
  ],
};

const PULL_DAY: ProgramDay = {
  id: 'pull_a',
  type: 'pull',
  label: 'Pull',
  labelAr: 'سحب',
  exercises: [
    plan('ex_deadlift', 3, 4, 6, 210),
    plan('ex_pull_up', 4, 6, 12, 150),
    plan('ex_barbell_row', 3, 8, 12, 150),
    plan('ex_seated_cable_row', 3, 10, 15, 90),
    plan('ex_face_pull', 3, 12, 20, 60),
    plan('ex_barbell_curl', 3, 8, 12, 60),
  ],
};

const LEGS_DAY: ProgramDay = {
  id: 'legs_a',
  type: 'legs',
  label: 'Legs',
  labelAr: 'أرجل',
  exercises: [
    plan('ex_back_squat', 4, 5, 8, 180),
    plan('ex_romanian_deadlift', 3, 8, 10, 150),
    plan('ex_leg_press', 3, 10, 15, 120),
    plan('ex_leg_curl', 3, 10, 15, 90),
    plan('ex_calf_raise', 4, 10, 15, 60),
    plan('ex_hanging_leg_raise', 3, 10, 15, 60),
  ],
};

const SEEDED_AT = new Date().toISOString();

/**
 * Six training days and one rest day. Saturday Push, Sunday Pull, Monday Legs,
 * Tuesday Push, Wednesday Pull, Thursday Legs, Friday rest: no two leg days
 * land back to back and the rest day falls on the Saudi weekend.
 */
export const DEFAULT_PROGRAM: Program = {
  id: 'program_ppl_default',
  name: 'Push / Pull / Legs',
  nameAr: 'دفع / سحب / أرجل',
  days: [PUSH_DAY, PULL_DAY, LEGS_DAY],
  schedule: {
    0: PULL_DAY.id,
    1: LEGS_DAY.id,
    2: PUSH_DAY.id,
    3: PULL_DAY.id,
    4: LEGS_DAY.id,
    5: null,
    6: PUSH_DAY.id,
  },
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
};

/* -------------------------------------------------------------- schedule -- */

/** The day scheduled for a weekday index (0=Sunday), or null on a rest day. */
export function dayForWeekday(program: Program, weekday: number): ProgramDay | null {
  const dayId = program.schedule[weekday];
  if (!dayId) return null;
  return program.days.find((day) => day.id === dayId) ?? null;
}

/** The day scheduled for a calendar day key, or null on a rest day. */
export function dayForDate(program: Program, date: string): ProgramDay | null {
  return dayForWeekday(program, parseDateKey(date).getDay());
}

export function isRestDay(program: Program, date: string): boolean {
  return dayForDate(program, date) === null;
}

/* --------------------------------------------------------------- session -- */

/**
 * Title case from an exercise id, e.g. 'ex_bench_press' -> 'Bench Press'.
 * Used when a session is built without the exercise database at hand; callers
 * that have the real record should pass its name through instead.
 */
export function fallbackExerciseName(exerciseId: string): string {
  return exerciseId
    .replace(/^ex_/, '')
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * A fresh, unlogged session for a planned day: every set present and empty, so
 * the logging screen only has to fill in reps and load.
 */
export function sessionFromDay(day: ProgramDay, date: string): WorkoutSession {
  return {
    id: makeId('ws'),
    date,
    startedAt: new Date().toISOString(),
    type: day.type,
    dayId: day.id,
    dayLabel: day.label,
    exercises: day.exercises.map((planned) => ({
      exerciseId: planned.exerciseId,
      name: fallbackExerciseName(planned.exerciseId),
      done: false,
      sets: Array.from({ length: planned.sets }, () => ({ done: false })),
    })),
  };
}

/** Share of the session's exercises marked done, 0..1. */
export function completionRatio(session: WorkoutSession): number {
  if (session.exercises.length === 0) return 0;
  const done = session.exercises.filter((exercise) => exercise.done).length;
  return done / session.exercises.length;
}

/** True once every exercise in a non-empty session is done. */
export function isSessionComplete(session: WorkoutSession): boolean {
  return session.exercises.length > 0 && completionRatio(session) === 1;
}

/**
 * Completed sets per session type across the supplied sessions. Every type is
 * present so callers can chart them without guarding; untrained types are 0.
 */
export function weeklyVolume(sessions: WorkoutSession[]): Record<SessionType, number> {
  const volume: Record<SessionType, number> = {
    push: 0,
    pull: 0,
    legs: 0,
    upper: 0,
    lower: 0,
    full: 0,
    cardio: 0,
  };
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      volume[session.type] += exercise.sets.filter((set) => set.done).length;
    }
  }
  return volume;
}

/* --------------------------------------------------------------- streaks -- */

/** Longest run of consecutive trained days ending on the most recent one. */
export function trainingStreak(dates: string[], today: string): number {
  return loggingStreak(dates, today);
}

/** First day of the week containing `date`: the Sunday on or before it. */
export function weekStart(date: string): string {
  return addDays(date, -parseDateKey(date).getDay());
}

/** Sessions logged in the Sunday-to-Saturday week containing `today`. */
export function sessionsThisWeek(dates: string[], today: string): number {
  const start = weekStart(today);
  const end = addDays(start, 6);
  return dates.filter((date) => date >= start && date <= end).length;
}

/** The seven day keys of the week containing `today`, Sunday first. */
export function weekDates(today: string): string[] {
  const start = weekStart(today);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}
