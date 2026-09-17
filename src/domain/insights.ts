/**
 * Improvement suggestions built from the user's own logs.
 *
 * Every insight names a number that came from this device: an average against a
 * target, a count of scheduled sessions against logged ones, a difference
 * between two scans. Nothing here is a diagnosis or a prescription; it is
 * arithmetic on what was logged, plus one concrete next step.
 *
 * The engine never builds a sentence. It returns the translation KEY of the
 * headline and of the detail, plus the values that go into them, so the same
 * insight reads as natural English or natural Arabic depending on what the
 * reader picked. {@link InsightCard} resolves the pair with t().
 *
 * Windows end YESTERDAY, because a partly logged today would drag every average
 * down. Today still counts for streaks, where a partial day is still a day.
 */

import type { insights as InsightCopy } from '@/i18n/locales/en/insights';
import type {
  BodyScan,
  Goal,
  Insight as BaseInsight,
  Meal,
  Profile,
  Program,
  SegmentalValues,
  SessionType,
  Targets,
  WorkoutSession,
} from '@/types';

import { scanChange, type ScanChange } from './bodyScan';
import { addDays, daysBetween, lastNDays, parseDateKey } from './date';
import { formatAmount, formatCount } from './format';
import { loggingStreak, totalMacros } from './totals';
import { dayForDate, weekDates } from './training';

/* ------------------------------------------------------------ the shape -- */

/** Every key defined in the insights namespace, checked at compile time. */
export type InsightKey = keyof typeof InsightCopy;

/** Counted nouns whose form changes with the number in Arabic. */
export type InsightCountNoun = 'day' | 'meal' | 'session';

/** One limb or region, or a left-and-right pair collapsed into one word. */
export type InsightSegment =
  | 'rightArm'
  | 'leftArm'
  | 'trunk'
  | 'rightLeg'
  | 'leftLeg'
  | 'bothArms'
  | 'bothLegs';

/**
 * A value inside a sentence. Plain strings and numbers are printed as they are;
 * the tagged shapes need the reader's language, so the card resolves them.
 */
export type InsightParam =
  | string
  | number
  | { readonly kind: 'count'; readonly noun: InsightCountNoun; readonly value: number }
  | { readonly kind: 'date'; readonly value: string }
  | { readonly kind: 'weekdays'; readonly value: readonly number[] }
  | { readonly kind: 'segments'; readonly value: readonly InsightSegment[] }
  /** The user's own data, which is never translated, only chosen. */
  | { readonly kind: 'name'; readonly en: string; readonly ar?: string };

export type InsightParams = Readonly<Record<string, InsightParam>>;

/**
 * The insight as the app reads it: everything {@link BaseInsight} carries, with
 * the two sentences and the button label held as keys rather than finished
 * prose.
 */
export interface Insight extends Omit<BaseInsight, 'title' | 'detail' | 'actionLabel'> {
  titleKey: InsightKey;
  detailKey: InsightKey;
  params?: InsightParams;
  /** Label for the button that opens {@link Insight.actionHref}. */
  actionLabelKey?: InsightKey;
}

export interface InsightInput {
  profile: Profile | null;
  /** Null until a profile exists; nutrition insights stay quiet without it. */
  targets: Targets | null;
  /** Meals keyed by day, for at least the last 14 days. */
  mealsByDate: Record<string, Meal[]>;
  /** Sessions keyed by day, for at least the last 14 days. */
  workoutsByDate: Record<string, WorkoutSession[]>;
  /** Body-composition readings, any order. */
  scans: BodyScan[];
  /**
   * Every day with at least one meal, across all of history. Leave it out and
   * the days in `mealsByDate` are used, which caps the streak at that window.
   */
  loggedDates?: string[];
  /** Every day with at least one session. Falls back to `workoutsByDate`. */
  workoutDates?: string[];
  /** The day the list is being built for, usually today, 'YYYY-MM-DD'. */
  today: string;
  /**
   * The active program. Without it the schedule cannot be read, so the missed
   * day type and sessions-this-week insights are skipped rather than guessed.
   */
  program?: Program | null;
}

/** Most insights the engine ever returns. */
export const MAX_INSIGHTS = 5;

/** Days of food logging behind the nutrition averages. */
const NUTRITION_WINDOW_DAYS = 7;
/** Days behind the training and consistency counts. */
const HISTORY_WINDOW_DAYS = 14;
/** Fewest logged days before an average is worth reporting. */
const MIN_LOGGED_DAYS = 3;
/** Average protein below this share of target counts as a shortfall. */
const PROTEIN_SHORTFALL = 0.85;
/** Average calories outside this band are worth naming. */
const CALORIE_OVER = 1.1;
const CALORIE_UNDER = 0.85;
/** A logged day under this share of the calorie target reads as incomplete. */
const LOW_DAY_SHARE = 0.4;
/** Days without a session before the gap is worth naming. */
const TRAINING_GAP_DAYS = 4;
/** Missed sessions of one day type before that type is worth naming. */
const MIN_MISSED_SESSIONS = 2;
/** Left-right lean difference worth naming, as a share of the pair average. */
const IMBALANCE_SHARE = 0.05;
/** Segment change counted as movement, as a share of that segment's mass. */
const SEGMENT_MOVED = 0.015;
/** Segment change small enough to call flat. */
const SEGMENT_FLAT = 0.005;
/** Muscle or fat change, in kg, below which two scans read as unchanged. */
const SCAN_NOISE_KG = 0.1;
/** Consecutive logged days before the run is worth naming. */
const MIN_STREAK_DAYS = 3;
/** Missed days in the fortnight before they are worth naming. */
const MIN_MISSED_DAYS = 3;

/** Lower sorts first. Every insight has its own slot, so ties never happen. */
const PRIORITY = {
  profileGate: 5,
  protein: 10,
  lowDay: 12,
  calories: 14,
  trainingGap: 20,
  missedType: 22,
  segmentStalled: 30,
  imbalance: 32,
  scanTrend: 34,
  missedDays: 40,
  weekSessions: 45,
  streak: 50,
  foodGate: 60,
  trainingGateEmpty: 62,
  scanGate: 64,
} as const;

/**
 * Group segments are optional in a URL, so '/training' reaches the screen
 * wherever its file sits.
 */
const ROUTES = {
  addMeal: '/meal/add',
  history: '/(tabs)/history',
  training: '/training',
  body: '/body',
  onboarding: '/onboarding',
} as const;

/* ------------------------------------------------------------ formatting -- */

/** A counted noun the card will put in the right form for the language. */
const count = (noun: InsightCountNoun, value: number): InsightParam => ({
  kind: 'count',
  noun,
  value,
});

/** A 'YYYY-MM-DD' day the card will print with a translated month. */
const day = (value: string): InsightParam => ({ kind: 'date', value });

/** Whole numbers, grouped: 1842 -> '1,842'. Digits stay Western in both languages. */
const whole = (value: number) => formatCount(value);
/** One decimal, for kilograms on a scale that reads to 100 g. */
const fine = (value: number) => formatAmount(value, 1);
/** Two decimals, for per-limb lean mass, where 50 g still means something. */
const finer = (value: number) => formatAmount(value, 2);

const SEGMENT_KEYS: (keyof SegmentalValues)[] = [
  'rightArm',
  'leftArm',
  'trunk',
  'rightLeg',
  'leftLeg',
];

/** 'right leg' plus 'left leg' reads better as 'both legs' in a headline. */
function collapseSides(labels: InsightSegment[]): InsightSegment[] {
  const out = [...labels];
  const pairs: [InsightSegment, InsightSegment, InsightSegment][] = [
    ['rightArm', 'leftArm', 'bothArms'],
    ['rightLeg', 'leftLeg', 'bothLegs'],
  ];
  for (const [right, left, both] of pairs) {
    const r = out.indexOf(right);
    const l = out.indexOf(left);
    if (r === -1 || l === -1) continue;
    out.splice(Math.max(r, l), 1);
    out.splice(Math.min(r, l), 1, both);
  }
  return out;
}

/* --------------------------------------------------------------- windows -- */

interface DaySummary {
  date: string;
  calories: number;
  protein: number;
  mealCount: number;
}

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/** The keys of a per-day map that actually hold something, oldest first. */
function datesWithEntries<T>(byDate: Record<string, T[]>): string[] {
  return Object.keys(byDate)
    .filter((date) => (byDate[date] ?? []).length > 0)
    .sort();
}

/** One row per day that actually has meals, oldest first. */
function summariseDays(dates: string[], mealsByDate: Record<string, Meal[]>): DaySummary[] {
  const rows: DaySummary[] = [];
  for (const date of dates) {
    const meals = mealsByDate[date] ?? [];
    if (meals.length === 0) continue;
    const macros = totalMacros(meals);
    rows.push({
      date,
      calories: macros.calories,
      protein: macros.protein,
      mealCount: meals.length,
    });
  }
  return rows;
}

/* ------------------------------------------------------------- nutrition -- */

function nutritionInsights(targets: Targets | null, summaries: DaySummary[]): Insight[] {
  const found: Insight[] = [];
  if (!targets || targets.calories <= 0) return found;

  const logged = summaries.length;
  const floor = targets.calories * LOW_DAY_SHARE;
  const lowDays = summaries.filter((entry) => entry.calories > 0 && entry.calories < floor);
  const lowest = lowDays.reduce<DaySummary | null>(
    (min, entry) => (min === null || entry.calories < min.calories ? entry : min),
    null,
  );

  if (logged >= MIN_LOGGED_DAYS) {
    const avgProtein = mean(summaries.map((entry) => entry.protein));
    const avgCalories = mean(summaries.map((entry) => entry.calories));
    // Between MIN_LOGGED_DAYS and the window, so the partial phrasing always
    // names three to six days and both languages read correctly with a plain
    // number.
    const full = logged >= NUTRITION_WINDOW_DAYS;

    if (targets.protein > 0 && avgProtein < targets.protein * PROTEIN_SHORTFALL) {
      found.push({
        id: 'nutrition_protein',
        priority: PRIORITY.protein,
        tone: 'warning',
        category: 'nutrition',
        icon: 'nutrition-outline',
        titleKey: 'proteinTitle',
        detailKey: full ? 'proteinDetailFull' : 'proteinDetailPartial',
        params: {
          avg: whole(avgProtein),
          target: whole(targets.protein),
          short: whole(targets.protein - avgProtein),
          window: NUTRITION_WINDOW_DAYS,
          logged,
        },
        actionLabelKey: 'actionLogMeal',
        actionHref: ROUTES.addMeal,
      });
    }

    const over = avgCalories > targets.calories * CALORIE_OVER;
    // A half-logged day already explains a low average; that insight says so.
    const under = !lowest && avgCalories < targets.calories * CALORIE_UNDER;

    if (over || under) {
      found.push({
        id: 'nutrition_calories',
        priority: PRIORITY.calories,
        tone: over ? 'warning' : 'neutral',
        category: 'nutrition',
        icon: 'flame-outline',
        titleKey: over ? 'caloriesOverTitle' : 'caloriesUnderTitle',
        detailKey: over
          ? full
            ? 'caloriesOverDetailFull'
            : 'caloriesOverDetailPartial'
          : full
            ? 'caloriesUnderDetailFull'
            : 'caloriesUnderDetailPartial',
        params: {
          avg: whole(avgCalories),
          target: whole(targets.calories),
          diff: whole(Math.abs(avgCalories - targets.calories)),
          window: NUTRITION_WINDOW_DAYS,
          logged,
        },
        actionLabelKey: 'actionOpenHistory',
        actionHref: ROUTES.history,
      });
    }
  }

  if (lowest) {
    found.push({
      id: 'nutrition_low_day',
      priority: PRIORITY.lowDay,
      tone: 'neutral',
      category: 'nutrition',
      icon: 'alert-circle-outline',
      titleKey: 'lowDayTitle',
      detailKey: lowDays.length > 1 ? 'lowDayDetailMore' : 'lowDayDetail',
      params: {
        date: day(lowest.date),
        total: whole(lowest.calories),
        meals: count('meal', lowest.mealCount),
        floor: whole(floor),
        target: whole(targets.calories),
        days: count('day', lowDays.length),
        window: NUTRITION_WINDOW_DAYS,
      },
      actionLabelKey: 'actionOpenHistory',
      actionHref: ROUTES.history,
    });
  }

  return found;
}

/* -------------------------------------------------------------- training -- */

interface ScheduleCount {
  type: SessionType;
  label: string;
  labelAr?: string;
  scheduled: number;
  completed: number;
  /** Weekday indexes the day falls on, 0=Sunday, ascending. */
  weekdays: number[];
}

/** Scheduled days against logged sessions of the same type, over a date range. */
function countSchedule(
  program: Program,
  dates: string[],
  workoutsByDate: Record<string, WorkoutSession[]>,
): ScheduleCount[] {
  const counts = new Map<SessionType, ScheduleCount>();

  for (const date of dates) {
    const scheduled = dayForDate(program, date);
    if (!scheduled) continue;

    const row = counts.get(scheduled.type) ?? {
      type: scheduled.type,
      label: scheduled.label,
      labelAr: scheduled.labelAr,
      scheduled: 0,
      completed: 0,
      weekdays: [],
    };
    row.scheduled += 1;

    const weekday = parseDateKey(date).getDay();
    if (!row.weekdays.includes(weekday)) {
      row.weekdays.push(weekday);
      row.weekdays.sort((a, b) => a - b);
    }

    const sessions = workoutsByDate[date] ?? [];
    if (sessions.some((session) => session.type === scheduled.type)) row.completed += 1;

    counts.set(scheduled.type, row);
  }

  return [...counts.values()];
}

/** `trained` is every day with a session, oldest first. */
function trainingInsights(input: InsightInput, today: string, trained: string[]): Insight[] {
  const found: Insight[] = [];
  const program = input.program ?? null;
  const lastSession = trained.length > 0 ? trained[trained.length - 1] : null;

  if (lastSession) {
    const gap = daysBetween(lastSession, today);
    if (gap >= TRAINING_GAP_DAYS) {
      // Days strictly between the last session and today: today is not missed yet.
      const sinceDates = lastNDays(gap, addDays(today, -1)).filter((date) => date > lastSession);
      const missedScheduled = program
        ? sinceDates.filter((date) => dayForDate(program, date) !== null).length
        : 0;
      found.push({
        id: 'training_gap',
        priority: PRIORITY.trainingGap,
        tone: 'warning',
        category: 'training',
        icon: 'time-outline',
        titleKey: 'trainingGapTitle',
        detailKey: missedScheduled > 0 ? 'trainingGapDetailMissed' : 'trainingGapDetail',
        params: {
          days: count('day', gap),
          date: day(lastSession),
          missed: count('day', missedScheduled),
        },
        actionLabelKey: 'actionOpenTraining',
        actionHref: ROUTES.training,
      });
      // The gap already says everything the schedule breakdown would repeat.
      return found;
    }
  }

  // Before the first session there is nothing to compare; the gate says so.
  if (!program || trained.length === 0) return found;

  const fortnight = lastNDays(HISTORY_WINDOW_DAYS, addDays(today, -1));
  const counts = countSchedule(program, fortnight, input.workoutsByDate);
  const worst = counts.reduce<ScheduleCount | null>((max, row) => {
    const missed = row.scheduled - row.completed;
    if (missed < MIN_MISSED_SESSIONS) return max;
    if (max === null) return row;
    return missed > max.scheduled - max.completed ? row : max;
  }, null);

  if (worst) {
    found.push({
      id: 'training_missed_type',
      priority: PRIORITY.missedType,
      tone: 'warning',
      category: 'training',
      icon: 'calendar-outline',
      titleKey: 'missedTypeTitle',
      detailKey: worst.completed === 0 ? 'missedTypeDetailNone' : 'missedTypeDetail',
      params: {
        label: { kind: 'name', en: worst.label, ar: worst.labelAr },
        scheduled: count('day', worst.scheduled),
        completed: worst.completed,
        window: HISTORY_WINDOW_DAYS,
        weekdays: { kind: 'weekdays', value: worst.weekdays },
      },
      actionLabelKey: 'actionOpenTraining',
      actionHref: ROUTES.training,
    });
  }

  const trainedSet = new Set(trained);
  const weekSoFar = weekDates(today).filter((date) => date <= today);
  const scheduledSoFar = weekSoFar.filter((date) => dayForDate(program, date) !== null).length;
  const trainedThisWeek = weekSoFar.filter((date) => trainedSet.has(date)).length;
  const onTrack = trainedThisWeek >= scheduledSoFar;

  if (scheduledSoFar > 0 && (onTrack || !worst)) {
    found.push({
      id: 'training_week',
      priority: PRIORITY.weekSessions,
      tone: onTrack ? 'positive' : 'neutral',
      category: 'training',
      icon: 'barbell-outline',
      titleKey: onTrack ? 'weekOnTrackTitle' : 'weekBehindTitle',
      detailKey: onTrack ? 'weekOnTrackDetail' : 'weekBehindDetail',
      params: {
        sessions: count('session', trainedThisWeek),
        planned: count('session', scheduledSoFar),
        done: trainedThisWeek,
      },
      actionLabelKey: 'actionOpenTraining',
      actionHref: ROUTES.training,
    });
  }

  return found;
}

/* ------------------------------------------------------------------ body -- */

function sortScans(scans: BodyScan[]): BodyScan[] {
  return [...scans].sort((a, b) =>
    a.date === b.date ? a.takenAt.localeCompare(b.takenAt) : a.date.localeCompare(b.date),
  );
}

interface SegmentMove {
  segment: InsightSegment;
  /** Signed change in kilograms from the earlier scan to the later one. */
  change: number;
  /** That change as a share of the segment's earlier mass. */
  share: number;
}

function segmentMoves(from: BodyScan, to: BodyScan): SegmentMove[] {
  const before = from.segmentalLeanKg;
  const after = to.segmentalLeanKg;
  if (!before || !after) return [];

  const moves: SegmentMove[] = [];
  for (const key of SEGMENT_KEYS) {
    const start = before[key];
    const end = after[key];
    if (start === undefined || end === undefined || start <= 0) continue;
    moves.push({
      segment: key,
      change: end - start,
      share: (end - start) / start,
    });
  }
  return moves;
}

interface TrendDirections {
  muscleUp: boolean;
  muscleDown: boolean;
  fatUp: boolean;
  fatDown: boolean;
}

/** The headline for two scans: muscle first, then fat, then weight alone. */
function trendTitleKey(change: ScanChange, direction: TrendDirections): InsightKey {
  const { muscleUp, muscleDown, fatUp, fatDown } = direction;

  if (muscleUp && fatDown) return 'trendMuscleUpFatDown';
  if (muscleUp && fatUp) return 'trendMuscleUpFatUp';
  if (muscleUp) return 'trendMuscleUp';
  if (muscleDown && fatUp) return 'trendMuscleDownFatUp';
  if (muscleDown) return 'trendMuscleDown';
  if (fatUp) return 'trendFatUp';
  if (fatDown) return 'trendFatDown';

  const composition = change.skeletalMuscleKg !== undefined || change.bodyFatKg !== undefined;
  if (!composition && Math.abs(change.weightKg) >= SCAN_NOISE_KG) {
    return change.weightKg > 0 ? 'trendWeightUp' : 'trendWeightDown';
  }
  return 'trendFlat';
}

/** Which pair of readings the detail sentence can actually quote. */
function trendDetailKey(hasMuscle: boolean, hasFatKg: boolean, hasFatPct: boolean): InsightKey {
  if (hasMuscle && hasFatKg) return 'trendDetailMuscleFat';
  if (hasMuscle && hasFatPct) return 'trendDetailMuscleFatPercent';
  if (hasMuscle) return 'trendDetailMuscle';
  if (hasFatKg) return 'trendDetailFat';
  if (hasFatPct) return 'trendDetailFatPercent';
  return 'trendDetailWeight';
}

function scanTrendInsight(previous: BodyScan, latest: BodyScan, goal?: Goal): Insight {
  const change = scanChange(previous, latest);

  const hasMuscle =
    previous.skeletalMuscleKg !== undefined && latest.skeletalMuscleKg !== undefined;
  const hasFatKg = previous.bodyFatKg !== undefined && latest.bodyFatKg !== undefined;
  const hasFatPct =
    !hasFatKg &&
    previous.bodyFatPercent !== undefined &&
    latest.bodyFatPercent !== undefined;

  const muscle = change.skeletalMuscleKg ?? 0;
  const fat = change.bodyFatKg ?? 0;
  const muscleUp = muscle >= SCAN_NOISE_KG;
  const muscleDown = muscle <= -SCAN_NOISE_KG;
  const fatDown = fat <= -SCAN_NOISE_KG;
  const fatUp = fat >= SCAN_NOISE_KG;

  // Fat gained alongside muscle is part of a gaining phase, so it is only a
  // warning when that is not the stated goal.
  const fatConcerns = fatUp && goal !== 'gain';
  const tone: Insight['tone'] =
    muscleUp && !fatUp ? 'positive' : muscleDown || fatConcerns ? 'warning' : 'neutral';

  return {
    id: 'body_trend',
    priority: PRIORITY.scanTrend,
    tone,
    category: 'body',
    icon: 'analytics-outline',
    titleKey: trendTitleKey(change, { muscleUp, muscleDown, fatUp, fatDown }),
    detailKey: trendDetailKey(hasMuscle, hasFatKg, hasFatPct),
    params: {
      days: count('day', change.days),
      from: day(previous.date),
      to: day(latest.date),
      muscleFrom: fine(previous.skeletalMuscleKg ?? 0),
      muscleTo: fine(latest.skeletalMuscleKg ?? 0),
      fatFrom: fine(hasFatKg ? (previous.bodyFatKg ?? 0) : (previous.bodyFatPercent ?? 0)),
      fatTo: fine(hasFatKg ? (latest.bodyFatKg ?? 0) : (latest.bodyFatPercent ?? 0)),
      weightFrom: fine(previous.weightKg),
      weightTo: fine(latest.weightKg),
    },
    actionLabelKey: 'actionViewScans',
    actionHref: ROUTES.body,
  };
}

function imbalanceInsight(scan: BodyScan): Insight | null {
  const lean = scan.segmentalLeanKg;
  if (!lean) return null;

  const pairs: { what: 'arm' | 'leg'; right?: number; left?: number }[] = [
    { what: 'arm', right: lean.rightArm, left: lean.leftArm },
    { what: 'leg', right: lean.rightLeg, left: lean.leftLeg },
  ];

  let worst: { what: 'arm' | 'leg'; right: number; left: number; share: number } | null = null;
  for (const pair of pairs) {
    const { right, left } = pair;
    if (right === undefined || left === undefined) continue;
    const average = (right + left) / 2;
    if (average <= 0) continue;
    const share = Math.abs(right - left) / average;
    if (share < IMBALANCE_SHARE) continue;
    if (!worst || share > worst.share) worst = { what: pair.what, right, left, share };
  }

  if (!worst) return null;

  const rightHeavier = worst.right > worst.left;
  const titleKey: InsightKey =
    worst.what === 'arm'
      ? rightHeavier
        ? 'imbalanceArmRightTitle'
        : 'imbalanceArmLeftTitle'
      : rightHeavier
        ? 'imbalanceLegRightTitle'
        : 'imbalanceLegLeftTitle';

  return {
    id: 'body_imbalance',
    priority: PRIORITY.imbalance,
    tone: 'neutral',
    category: 'body',
    icon: 'swap-horizontal-outline',
    titleKey,
    detailKey: worst.what === 'arm' ? 'imbalanceArmDetail' : 'imbalanceLegDetail',
    params: {
      date: day(scan.date),
      right: finer(worst.right),
      left: finer(worst.left),
      share: formatAmount(worst.share * 100, 1),
    },
    actionLabelKey: 'actionOpenTraining',
    actionHref: ROUTES.training,
  };
}

function stalledSegmentInsight(previous: BodyScan, latest: BodyScan): Insight | null {
  const moves = segmentMoves(previous, latest);
  if (moves.length < 3) return null;

  const movers = moves.filter((move) => move.share >= SEGMENT_MOVED);
  const flat = moves.filter((move) => Math.abs(move.share) < SEGMENT_FLAT);
  if (movers.length === 0 || flat.length === 0) return null;

  const leader = [...movers].sort((a, b) => b.change - a.change)[0];
  if (!leader) return null;

  const noise = flat.reduce((max, move) => Math.max(max, Math.abs(move.change)), 0);

  return {
    id: 'body_segment_stalled',
    priority: PRIORITY.segmentStalled,
    tone: 'neutral',
    category: 'body',
    icon: 'footsteps-outline',
    titleKey: 'stalledTitle',
    detailKey: 'stalledDetail',
    params: {
      segments: { kind: 'segments', value: collapseSides(flat.map((move) => move.segment)) },
      mover: { kind: 'segments', value: [leader.segment] },
      gain: finer(leader.change),
      // Rounded up so the sentence never claims a tighter bound than it measured.
      noise: finer(Math.ceil(noise * 100) / 100),
      from: day(previous.date),
      to: day(latest.date),
    },
    actionLabelKey: 'actionOpenTraining',
    actionHref: ROUTES.training,
  };
}

function bodyInsights(scans: BodyScan[], goal?: Goal): Insight[] {
  const sorted = sortScans(scans);
  if (sorted.length < 2) return [];

  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  if (!latest || !previous) return [];

  const found: Insight[] = [scanTrendInsight(previous, latest, goal)];

  const stalled = stalledSegmentInsight(previous, latest);
  if (stalled) found.push(stalled);

  const imbalance = imbalanceInsight(latest);
  if (imbalance) found.push(imbalance);

  return found;
}

/* ----------------------------------------------------------- consistency -- */

/** `logged` is every day with a meal, oldest first. */
function consistencyInsights(today: string, logged: string[]): Insight[] {
  const found: Insight[] = [];
  const loggedSet = new Set(logged);
  const fortnight = lastNDays(HISTORY_WINDOW_DAYS, addDays(today, -1));
  const loggedDays = fortnight.filter((date) => loggedSet.has(date)).length;
  const missed = fortnight.length - loggedDays;
  const streak = loggingStreak(logged, today);

  if (streak >= MIN_STREAK_DAYS) {
    found.push({
      id: 'consistency_streak',
      priority: PRIORITY.streak,
      tone: 'positive',
      category: 'consistency',
      icon: 'flash-outline',
      titleKey: 'streakTitle',
      detailKey: 'streakDetail',
      params: { days: count('day', streak) },
    });
  }

  if (loggedDays > 0 && missed >= MIN_MISSED_DAYS) {
    found.push({
      id: 'consistency_missed',
      priority: PRIORITY.missedDays,
      tone: 'neutral',
      category: 'consistency',
      icon: 'calendar-number-outline',
      titleKey: 'missedDaysTitle',
      detailKey: 'missedDaysDetail',
      params: {
        logged: count('day', loggedDays),
        missed: count('day', missed),
        window: HISTORY_WINDOW_DAYS,
      },
      actionLabelKey: 'actionOpenHistory',
      actionHref: ROUTES.history,
    });
  }

  return found;
}

/* ----------------------------------------------------------------- gates -- */

/** Honest placeholders: what is missing, and what it would unlock. */
function gateInsights(
  input: InsightInput,
  summaries: DaySummary[],
  trained: string[],
): Insight[] {
  const found: Insight[] = [];

  if (!input.profile || !input.targets) {
    found.push({
      id: 'gate_profile',
      priority: PRIORITY.profileGate,
      tone: 'neutral',
      category: 'nutrition',
      icon: 'person-outline',
      titleKey: 'gateProfileTitle',
      detailKey: 'gateProfileDetail',
      actionLabelKey: 'actionFinishProfile',
      actionHref: ROUTES.onboarding,
    });
  }

  if (summaries.length < MIN_LOGGED_DAYS) {
    found.push({
      id: 'gate_food',
      priority: PRIORITY.foodGate,
      tone: 'neutral',
      category: 'nutrition',
      icon: 'restaurant-outline',
      titleKey: 'gateFoodTitle',
      detailKey: summaries.length === 0 ? 'gateFoodDetailNone' : 'gateFoodDetail',
      params: {
        logged: count('day', summaries.length),
        window: NUTRITION_WINDOW_DAYS,
        min: MIN_LOGGED_DAYS,
      },
      actionLabelKey: 'actionLogMeal',
      actionHref: ROUTES.addMeal,
    });
  }

  if (trained.length === 0) {
    found.push({
      id: 'gate_training',
      priority: PRIORITY.trainingGateEmpty,
      tone: 'neutral',
      category: 'training',
      icon: 'barbell-outline',
      titleKey: 'gateTrainingTitle',
      detailKey: 'gateTrainingDetail',
      actionLabelKey: 'actionOpenTraining',
      actionHref: ROUTES.training,
    });
  }

  if (input.scans.length < 2) {
    found.push({
      id: 'gate_scans',
      priority: PRIORITY.scanGate,
      tone: 'neutral',
      category: 'body',
      icon: 'body-outline',
      titleKey: input.scans.length === 0 ? 'gateScanNoneTitle' : 'gateScanOneTitle',
      detailKey: input.scans.length === 0 ? 'gateScanNoneDetail' : 'gateScanOneDetail',
      actionLabelKey: 'actionAddScan',
      actionHref: ROUTES.body,
    });
  }

  return found;
}

/* ----------------------------------------------------------------- build -- */

/**
 * At most {@link MAX_INSIGHTS} observations, most pressing first. Each family
 * fires only when the data supports it, and each observation appears once.
 */
export function buildInsights(input: InsightInput): Insight[] {
  const { today } = input;
  const window = lastNDays(NUTRITION_WINDOW_DAYS, addDays(today, -1));
  const summaries = summariseDays(window, input.mealsByDate);
  const logged = [...(input.loggedDates ?? datesWithEntries(input.mealsByDate))].sort();
  const trained = [...(input.workoutDates ?? datesWithEntries(input.workoutsByDate))].sort();

  const candidates: Insight[] = [
    ...nutritionInsights(input.targets, summaries),
    ...trainingInsights(input, today, trained),
    ...bodyInsights(input.scans, input.profile?.goal),
    ...consistencyInsights(today, logged),
    ...gateInsights(input, summaries, trained),
  ];

  const seen = new Set<string>();
  const unique = candidates.filter((insight) => {
    if (seen.has(insight.id)) return false;
    seen.add(insight.id);
    return true;
  });

  return unique
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .slice(0, MAX_INSIGHTS);
}
