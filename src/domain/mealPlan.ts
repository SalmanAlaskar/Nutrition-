/**
 * Turns the day's targets into a per-meal plan.
 *
 * The app logs meals well but has never said how much of the day belongs to
 * each one, so a big breakfast reads the same as a balanced morning until the
 * total runs out at dinner. These helpers split the daily target across the
 * four slots and describe how a slot is tracking against its share.
 *
 * The split is a guide, not a rule. Nothing here enforces it, nothing warns
 * when a day is shaped differently, and eating the whole target in two meals
 * is a valid day. It exists so the dashboard can read as a plan rather than a
 * running total.
 */

import type { Macros, MealSlot, Targets } from '@/types';

import { MEAL_SLOTS, remainingBudget, type RemainingBudget } from './totals';

/**
 * Share of the daily target each slot carries, summing to 1.
 *
 * Shaped for six training days a week: a real breakfast, the largest meal at
 * midday when most of the day's work is still ahead, a solid dinner near the
 * evening session and a small allowance left over for snacks.
 */
export const MEAL_SPLIT: Record<MealSlot, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
  snack: 0.1,
};

/** Below this many kilocalories a slot counts as untouched rather than under. */
const EMPTY_KCAL = 1;

/** A slot within this fraction of its share is on track, either way. */
const ON_TRACK_TOLERANCE = 0.15;

const TARGET_KEYS: (keyof Targets)[] = ['calories', 'protein', 'carbs', 'fat'];

/**
 * Splits one number across the slots so the rounded parts add back up to the
 * whole. Rounding each share on its own loses or gains a few kilocalories and
 * the four slot lines then visibly disagree with the ring, so the running
 * total is rounded instead and each slot takes the difference.
 */
function splitValue(total: number): Record<MealSlot, number> {
  const out = {} as Record<MealSlot, number>;
  let cumulativeShare = 0;
  let assigned = 0;

  for (const slot of MEAL_SLOTS) {
    cumulativeShare += MEAL_SPLIT[slot];
    const upTo = Math.round(total * cumulativeShare);
    out[slot] = upTo - assigned;
    assigned = upTo;
  }
  return out;
}

/**
 * The daily target divided across the four slots. Every macro is split by the
 * same shares, and the four slot targets add back up to the day's.
 */
export function slotTargets(targets: Targets): Record<MealSlot, Targets> {
  const split = {
    calories: splitValue(targets.calories),
    protein: splitValue(targets.protein),
    carbs: splitValue(targets.carbs),
    fat: splitValue(targets.fat),
  };

  const out = {} as Record<MealSlot, Targets>;
  for (const slot of MEAL_SLOTS) {
    const slotTarget = {} as Targets;
    for (const key of TARGET_KEYS) slotTarget[key] = split[key][slot];
    out[slot] = slotTarget;
  }
  return out;
}

/** How one slot is tracking against its share of the day. */
export type SlotStatus = 'empty' | 'under' | 'on-track' | 'over';

/**
 * Compares what was eaten in a slot with that slot's target, on calories.
 *
 * `target` is the slot's own target from {@link slotTargets}, not the day's.
 * A slot with nothing in it is `empty` rather than `under`, so an evening that
 * has not happened yet never reads as a shortfall.
 */
export function slotStatus(consumed: Macros, target: Targets): SlotStatus {
  const eaten = consumed.calories;
  if (!Number.isFinite(eaten) || eaten < EMPTY_KCAL) return 'empty';
  if (!Number.isFinite(target.calories) || target.calories <= 0) return 'over';

  const ratio = eaten / target.calories;
  if (ratio > 1 + ON_TRACK_TOLERANCE) return 'over';
  if (ratio < 1 - ON_TRACK_TOLERANCE) return 'under';
  return 'on-track';
}

/**
 * What is left of one slot's share of the day, from the day's targets.
 *
 * Takes the whole-day targets and does the split internally, so a caller that
 * only has one slot in hand does not have to compute all four. Values go
 * negative once the slot is past its share, exactly like the daily budget.
 */
export function remainingForSlot(
  slot: MealSlot,
  consumed: Macros,
  targets: Targets,
): RemainingBudget {
  return remainingBudget(consumed, slotTargets(targets)[slot]);
}
