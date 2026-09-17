"use strict";
/**
 * Training programs: the bundled Push/Pull/Legs split, the weekly schedule and
 * the helpers that turn a planned day into a logged session.
 *
 * The week is anchored to the Saudi calendar: weekday 0 is Sunday and the rest
 * day is Friday (weekday 5). Exercise ids are plain string literals so this
 * module never has to load the exercise database.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROGRAM = exports.DEFAULT_REST_WEEKDAY = exports.SESSION_MUSCLES = exports.SESSION_ICONS = exports.SESSION_LABELS = void 0;
exports.dayForWeekday = dayForWeekday;
exports.dayForDate = dayForDate;
exports.isRestDay = isRestDay;
exports.fallbackExerciseName = fallbackExerciseName;
exports.sessionFromDay = sessionFromDay;
exports.completionRatio = completionRatio;
exports.isSessionComplete = isSessionComplete;
exports.weeklyVolume = weeklyVolume;
exports.trainingStreak = trainingStreak;
exports.weekStart = weekStart;
exports.sessionsThisWeek = sessionsThisWeek;
exports.weekDates = weekDates;
const date_1 = require("./date");
const id_1 = require("./id");
const totals_1 = require("./totals");
exports.SESSION_LABELS = {
    push: 'Push',
    pull: 'Pull',
    legs: 'Legs',
    upper: 'Upper',
    lower: 'Lower',
    full: 'Full body',
    cardio: 'Cardio',
};
/** Ionicons glyphs, one per session type. */
exports.SESSION_ICONS = {
    push: 'barbell-outline',
    pull: 'fitness-outline',
    legs: 'footsteps-outline',
    upper: 'body-outline',
    lower: 'walk-outline',
    full: 'layers-outline',
    cardio: 'heart-outline',
};
/** The muscles each session type is built around, for a subtitle line. */
exports.SESSION_MUSCLES = {
    push: 'Chest, shoulders, triceps',
    pull: 'Back, rear delts, biceps',
    legs: 'Quads, hamstrings, glutes, calves',
    upper: 'Chest, back, shoulders, arms',
    lower: 'Quads, hamstrings, glutes, calves',
    full: 'Whole body',
    cardio: 'Heart and lungs',
};
/** Weekday index of the rest day in the default program: Friday. */
exports.DEFAULT_REST_WEEKDAY = 5;
const plan = (exerciseId, sets, repsLow, repsHigh, restSeconds) => ({ exerciseId, sets, repsLow, repsHigh, restSeconds });
const PUSH_DAY = {
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
const PULL_DAY = {
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
const LEGS_DAY = {
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
exports.DEFAULT_PROGRAM = {
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
function dayForWeekday(program, weekday) {
    const dayId = program.schedule[weekday];
    if (!dayId)
        return null;
    return program.days.find((day) => day.id === dayId) ?? null;
}
/** The day scheduled for a calendar day key, or null on a rest day. */
function dayForDate(program, date) {
    return dayForWeekday(program, (0, date_1.parseDateKey)(date).getDay());
}
function isRestDay(program, date) {
    return dayForDate(program, date) === null;
}
/* --------------------------------------------------------------- session -- */
/**
 * Title case from an exercise id, e.g. 'ex_bench_press' -> 'Bench Press'.
 * Used when a session is built without the exercise database at hand; callers
 * that have the real record should pass its name through instead.
 */
function fallbackExerciseName(exerciseId) {
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
function sessionFromDay(day, date) {
    return {
        id: (0, id_1.makeId)('ws'),
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
function completionRatio(session) {
    if (session.exercises.length === 0)
        return 0;
    const done = session.exercises.filter((exercise) => exercise.done).length;
    return done / session.exercises.length;
}
/** True once every exercise in a non-empty session is done. */
function isSessionComplete(session) {
    return session.exercises.length > 0 && completionRatio(session) === 1;
}
/**
 * Completed sets per session type across the supplied sessions. Every type is
 * present so callers can chart them without guarding; untrained types are 0.
 */
function weeklyVolume(sessions) {
    const volume = {
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
function trainingStreak(dates, today) {
    return (0, totals_1.loggingStreak)(dates, today);
}
/** First day of the week containing `date`: the Sunday on or before it. */
function weekStart(date) {
    return (0, date_1.addDays)(date, -(0, date_1.parseDateKey)(date).getDay());
}
/** Sessions logged in the Sunday-to-Saturday week containing `today`. */
function sessionsThisWeek(dates, today) {
    const start = weekStart(today);
    const end = (0, date_1.addDays)(start, 6);
    return dates.filter((date) => date >= start && date <= end).length;
}
/** The seven day keys of the week containing `today`, Sunday first. */
function weekDates(today) {
    const start = weekStart(today);
    return Array.from({ length: 7 }, (_, index) => (0, date_1.addDays)(start, index));
}
