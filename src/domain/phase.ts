/**
 * Dated phases.
 *
 * A phase is a stretch of time the user sets for themselves — a cut, a stretch
 * of maintenance, a build — and while it runs it owns the daily target. Without
 * one the app derives a single target from the profile's `goal` and shows it
 * forever, which is wrong the moment somebody decides to eat differently for
 * eight weeks and then stop.
 *
 * A phase is a plan the person wrote down, not a prescription the app issues.
 * Every figure here is an estimate built from body weight and activity, and an
 * explicit number the user typed always beats a derived one.
 *
 * Bounds are inclusive on both ends and compared as DateKey strings, which sort
 * correctly: '2026-11-08' <= '2026-12-31' is true as text and as dates.
 */

import type { Phase, PhaseKind, Profile, Targets } from '@/types';

import { daysBetween } from './date';
import {
  CALORIES_PER_GRAM,
  FAT_CALORIE_SHARE,
  MIN_CALORIES,
  macroTargets,
  totalDailyEnergyExpenditure,
} from './nutrition';

export const PHASE_KINDS: PhaseKind[] = ['cut', 'maintain', 'build'];

/** Fraction of maintenance calories each kind of phase aims at. */
export const PHASE_CALORIE_FACTOR: Record<PhaseKind, number> = {
  cut: 0.85,
  maintain: 1,
  build: 1.1,
};

/**
 * Grams of protein per kg of body weight. A cut asks for more of it than a
 * build does: the aim while eating less is to keep the muscle that is already
 * there.
 */
export const PHASE_PROTEIN_PER_KG: Record<PhaseKind, number> = {
  cut: 2.2,
  maintain: 1.8,
  build: 1.8,
};

/** Shortest phase worth planning, in days. A week is the smallest honest span. */
export const MIN_PHASE_DAYS = 7;

/** Longest phase, in days. 366 so a span across a leap year still fits a year. */
export const MAX_PHASE_DAYS = 366;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const isDateKey = (value: string): boolean => DATE_KEY_PATTERN.test(value);

/** Inclusive length of a phase in days: a Sunday-to-Saturday phase is 7 days. */
export function phaseLengthDays(phase: Pick<Phase, 'startDate' | 'endDate'>): number {
  return daysBetween(phase.startDate, phase.endDate) + 1;
}

/* ------------------------------------------------------------- selection -- */

/**
 * The phase covering `date`, or null when none does.
 *
 * Validation keeps phases from overlapping, but an imported file or an older
 * record can still carry two that do. The one that starts latest wins, because
 * it is the more specific and more recent intent; a tie goes to whichever was
 * edited last.
 */
export function activePhase(phases: Phase[], date: string): Phase | null {
  let best: Phase | null = null;
  for (const phase of phases) {
    if (phase.startDate > date || phase.endDate < date) continue;
    if (
      best === null ||
      phase.startDate > best.startDate ||
      (phase.startDate === best.startDate && phase.updatedAt > best.updatedAt)
    ) {
      best = phase;
    }
  }
  return best;
}

/** Reads better at a call site asking about a particular day. Same answer as {@link activePhase}. */
export function phaseFor(phases: Phase[], date: string): Phase | null {
  return activePhase(phases, date);
}

/** Phases that have not begun on `today`, soonest first. */
export function upcomingPhases(phases: Phase[], today: string): Phase[] {
  return phases
    .filter((phase) => phase.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Phases that ended before `today`, most recently finished first. */
export function pastPhases(phases: Phase[], today: string): Phase[] {
  return phases
    .filter((phase) => phase.endDate < today)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/* --------------------------------------------------------------- targets -- */

/**
 * The macro split for a calorie figure: protein from body weight, fat at the
 * app's fixed share of energy, carbohydrate absorbing whatever is left. Exactly
 * the arithmetic `macroTargets` does, with the phase's protein figure instead
 * of the goal's.
 */
function splitCalories(calories: number, proteinG: number, fatG?: number): Targets {
  const protein = Math.max(0, Math.round(proteinG));
  const fat =
    fatG === undefined
      ? Math.round((calories * FAT_CALORIE_SHARE) / CALORIES_PER_GRAM.fat)
      : Math.max(0, Math.round(fatG));
  const left =
    calories - protein * CALORIES_PER_GRAM.protein - fat * CALORIES_PER_GRAM.fat;
  const carbs = Math.max(0, Math.round(left / CALORIES_PER_GRAM.carbs));
  return { calories, protein, carbs, fat };
}

/**
 * What a phase of this kind would ask for, before any explicit figure on the
 * phase itself. Maintenance scaled by the kind's factor and floored at the safe
 * minimum for the sex, then split into macros.
 *
 * The profile's `customCalorieTarget` is deliberately ignored here: the user is
 * asking what this kind of phase implies, and the override answers a different
 * question. See {@link targetsForDate} for how the two rank in the app.
 */
export function derivePhaseTargets(profile: Profile, kind: PhaseKind): Targets {
  const maintenance = totalDailyEnergyExpenditure(profile);
  const calories = Math.round(
    Math.max(maintenance * PHASE_CALORIE_FACTOR[kind], MIN_CALORIES[profile.sex]),
  );
  return splitCalories(calories, PHASE_PROTEIN_PER_KG[kind] * profile.weightKg);
}

/**
 * The daily target a phase asks for.
 *
 * Explicit beats derived field by field, in the order calories, protein, fat,
 * carbohydrate. A phase carrying only `calories` therefore keeps the derived
 * macros, recomputed at that calorie figure: protein still comes from body
 * weight, fat still takes its share, carbohydrate still absorbs the remainder.
 * Carbohydrate falls out of whatever protein and fat ended up being, so the
 * four numbers always agree with each other.
 *
 * An explicit calorie figure is used exactly as typed, with no minimum applied:
 * silently raising a number somebody entered on purpose would be worse than
 * showing it back to them.
 */
export function targetsForPhase(profile: Profile, phase: Phase): Targets {
  const derived = derivePhaseTargets(profile, phase.kind);

  const calories =
    phase.calories !== undefined && phase.calories > 0
      ? Math.round(phase.calories)
      : derived.calories;

  const protein = phase.proteinG ?? PHASE_PROTEIN_PER_KG[phase.kind] * profile.weightKg;
  const split = splitCalories(calories, protein, phase.fatG);

  return {
    calories,
    protein: split.protein,
    carbs: phase.carbsG !== undefined ? Math.max(0, Math.round(phase.carbsG)) : split.carbs,
    fat: split.fat,
  };
}

/**
 * The target that applied on `date`.
 *
 * Precedence, deliberately: a phase covering the date wins over the profile's
 * `customCalorieTarget`, which in turn wins over the goal-derived figure. The
 * phase is both the more specific intent — it names the days it applies to —
 * and the more recent one, since the user set it knowing an override was
 * already there. The profile screen can still say so: when `activePhase` is
 * not null and `customCalorieTarget` is set, the override is on hold until the
 * phase ends rather than gone.
 *
 * With no phase covering the date this falls straight through to
 * `macroTargets(profile)`, so every screen keeps working with no phases at all.
 */
export function targetsForDate(
  profile: Profile,
  phases: Phase[],
  date: string,
): Targets {
  const phase = activePhase(phases, date);
  return phase ? targetsForPhase(profile, phase) : macroTargets(profile);
}

/* -------------------------------------------------------------- progress -- */

/**
 * Where `today` sits inside a phase.
 *
 * `dayNumber` is 1 on the first day and `totalDays` on the last, 0 before the
 * phase begins. `daysLeft` counts the days still to come after today, so
 * `dayNumber + daysLeft` always equals `totalDays` and the final day reads as
 * none left. `ratio` is `dayNumber / totalDays`, clamped to 0..1 for a bar.
 */
export function phaseProgress(
  phase: Phase,
  today: string,
): { dayNumber: number; totalDays: number; daysLeft: number; ratio: number } {
  const totalDays = Math.max(1, phaseLengthDays(phase));
  const dayNumber = clamp(daysBetween(phase.startDate, today) + 1, 0, totalDays);
  const daysLeft = totalDays - dayNumber;
  return { dayNumber, totalDays, daysLeft, ratio: clamp(dayNumber / totalDays, 0, 1) };
}

/* ------------------------------------------------------------ validation -- */

/**
 * Why a phase cannot be saved. A key in the `phases` namespace rather than a
 * sentence, so the screen says it in the reader's language.
 *
 * The copy for each of these lives in src/i18n/locales/{en,ar}/phases.ts under
 * exactly these names.
 */
export type PhaseIssue =
  /** A bound is missing or is not a 'YYYY-MM-DD' day. */
  | 'errorBadDates'
  /** The phase ends before it starts. */
  | 'errorEndBeforeStart'
  /** Shorter than {@link MIN_PHASE_DAYS}. */
  | 'errorTooShort'
  /** Longer than {@link MAX_PHASE_DAYS}. */
  | 'errorTooLong'
  /** Another phase already covers part of the same stretch. */
  | 'errorOverlap';

/** True when two phases share at least one day. Inclusive bounds on both. */
function overlaps(a: Pick<Phase, 'startDate' | 'endDate'>, b: Pick<Phase, 'startDate' | 'endDate'>): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/**
 * Everything wrong with a phase, as keys. An empty list means it can be saved.
 *
 * `others` is the rest of the stored phases; one carrying the same id is the
 * phase being edited and is skipped, so re-saving an edit never collides with
 * itself. A broken or reversed pair of dates is reported on its own, because
 * length and overlap mean nothing until the span does.
 */
export function validatePhase(phase: Phase, others: Phase[]): PhaseIssue[] {
  if (!isDateKey(phase.startDate) || !isDateKey(phase.endDate)) return ['errorBadDates'];
  if (phase.endDate < phase.startDate) return ['errorEndBeforeStart'];

  const issues: PhaseIssue[] = [];
  const days = phaseLengthDays(phase);
  if (days < MIN_PHASE_DAYS) issues.push('errorTooShort');
  if (days > MAX_PHASE_DAYS) issues.push('errorTooLong');

  const clash = others.some(
    (other) =>
      other.id !== phase.id &&
      isDateKey(other.startDate) &&
      isDateKey(other.endDate) &&
      overlaps(phase, other),
  );
  if (clash) issues.push('errorOverlap');

  return issues;
}
