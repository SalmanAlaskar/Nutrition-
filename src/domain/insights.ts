/**
 * Improvement suggestions built from the user's own logs.
 *
 * Every insight names a number that came from this device: an average against a
 * target, a count of scheduled sessions against logged ones, a difference
 * between two scans. Nothing here is a diagnosis or a prescription; it is
 * arithmetic on what was logged, plus one concrete next step.
 *
 * Windows end YESTERDAY, because a partly logged today would drag every average
 * down. Today still counts for streaks, where a partial day is still a day.
 */

import type {
  BodyScan,
  Goal,
  Insight,
  Meal,
  Profile,
  Program,
  SegmentalValues,
  SessionType,
  Targets,
  WorkoutSession,
} from '@/types';

import { scanChange, type ScanChange } from './bodyScan';
import { addDays, daysBetween, formatShortDay, lastNDays, parseDateKey } from './date';
import { loggingStreak, totalMacros } from './totals';
import { dayForDate, weekDates } from './training';

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

const round1 = (value: number) => Math.round(value * 10) / 10;

/** '1,842' — same grouping the dashboard uses. */
function groupDigits(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const kcal = (value: number) => `${groupDigits(value)} kcal`;
const grams = (value: number) => `${Math.round(value)} g`;
const kg = (value: number) => `${round1(value).toFixed(1)} kg`;
const kgFine = (value: number) => `${(Math.round(value * 100) / 100).toFixed(2)} kg`;
const percent = (value: number) => `${round1(value).toFixed(1)}%`;

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

function joinPhrases(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** 'right leg' plus 'left leg' reads better as 'both legs' in a title. */
function collapseSides(labels: string[]): string[] {
  const out = [...labels];
  for (const part of ['arm', 'leg']) {
    const right = out.indexOf(`right ${part}`);
    const left = out.indexOf(`left ${part}`);
    if (right === -1 || left === -1) continue;
    out.splice(Math.max(right, left), 1);
    out.splice(Math.min(right, left), 1, `both ${part}s`);
  }
  return out;
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** 0=Sunday, matching Date.getDay() and the program schedule. */
const weekdayName = (weekday: number) => WEEKDAY_NAMES[weekday] ?? '';

const SEGMENT_KEYS: (keyof SegmentalValues)[] = [
  'rightArm',
  'leftArm',
  'trunk',
  'rightLeg',
  'leftLeg',
];

const SEGMENT_LABELS: Record<keyof SegmentalValues, string> = {
  rightArm: 'right arm',
  leftArm: 'left arm',
  trunk: 'trunk',
  rightLeg: 'right leg',
  leftLeg: 'left leg',
};

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
  const lowDays = summaries.filter((day) => day.calories > 0 && day.calories < floor);
  const lowest = lowDays.reduce<DaySummary | null>(
    (min, day) => (min === null || day.calories < min.calories ? day : min),
    null,
  );

  if (logged >= MIN_LOGGED_DAYS) {
    const avgProtein = mean(summaries.map((day) => day.protein));
    const avgCalories = mean(summaries.map((day) => day.calories));
    const span =
      logged >= NUTRITION_WINDOW_DAYS
        ? `over the last ${NUTRITION_WINDOW_DAYS} days`
        : `across the ${logged} logged days of the last ${NUTRITION_WINDOW_DAYS}`;

    if (targets.protein > 0 && avgProtein < targets.protein * PROTEIN_SHORTFALL) {
      found.push({
        id: 'nutrition_protein',
        priority: PRIORITY.protein,
        tone: 'warning',
        category: 'nutrition',
        icon: 'nutrition-outline',
        title: 'Protein is landing under target',
        detail:
          `Protein averaged ${grams(avgProtein)} a day against a ${grams(targets.protein)} ` +
          `target ${span}. That is ${grams(targets.protein - avgProtein)} short a day. ` +
          'Adding one protein-led item to a day covers most of it.',
        actionLabel: 'Log a meal',
        actionHref: ROUTES.addMeal,
      });
    }

    const over = avgCalories > targets.calories * CALORIE_OVER;
    // A half-logged day already explains a low average; that insight says so.
    const under = !lowest && avgCalories < targets.calories * CALORIE_UNDER;
    const diff = Math.abs(avgCalories - targets.calories);

    if (over || under) {
      found.push({
        id: 'nutrition_calories',
        priority: PRIORITY.calories,
        tone: over ? 'warning' : 'neutral',
        category: 'nutrition',
        icon: 'flame-outline',
        title: over ? 'Calories are running over target' : 'Calories are running under target',
        detail:
          `Calories averaged ${kcal(avgCalories)} a day against a ${kcal(targets.calories)} ` +
          `target ${span}, ${kcal(diff)} a day ${over ? 'over' : 'under'}. ` +
          (over
            ? 'The history chart shows which days carry the difference.'
            : 'An average this low can also mean items were logged late or not at all.'),
        actionLabel: 'Open history',
        actionHref: ROUTES.history,
      });
    }
  }

  if (lowest) {
    const others =
      lowDays.length > 1
        ? ` ${plural(lowDays.length, 'day', 'days')} in the last ${NUTRITION_WINDOW_DAYS} read that low.`
        : '';
    found.push({
      id: 'nutrition_low_day',
      priority: PRIORITY.lowDay,
      tone: 'neutral',
      category: 'nutrition',
      icon: 'alert-circle-outline',
      title: `${formatShortDay(lowest.date)} reads unusually low`,
      detail:
        `That day totals ${kcal(lowest.calories)} from ` +
        `${plural(lowest.mealCount, 'meal', 'meals')}, under the ${kcal(floor)} mark for your ` +
        `${kcal(targets.calories)} target.${others} Filling the gaps keeps the averages honest.`,
      actionLabel: 'Open history',
      actionHref: ROUTES.history,
    });
  }

  return found;
}

/* -------------------------------------------------------------- training -- */

interface ScheduleCount {
  type: SessionType;
  label: string;
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
    const day = dayForDate(program, date);
    if (!day) continue;

    const row = counts.get(day.type) ?? {
      type: day.type,
      label: day.label,
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
    if (sessions.some((session) => session.type === day.type)) row.completed += 1;

    counts.set(day.type, row);
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
        title: `No session logged in ${plural(gap, 'day', 'days')}`,
        detail:
          `The last one was ${formatShortDay(lastSession)}.` +
          (missedScheduled > 0
            ? ` ${plural(missedScheduled, 'training day', 'training days')} on the schedule have ` +
              'passed since then.'
            : '') +
          ' Logging the next session restarts the count.',
        actionLabel: 'Open training',
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
      title: `${worst.label} days are the ones slipping`,
      detail:
        `${worst.label} was scheduled ${plural(worst.scheduled, 'time', 'times')} in the last ` +
        `${HISTORY_WINDOW_DAYS} days and logged ${worst.completed === 0 ? 'none' : worst.completed}. ` +
        'It falls on ' +
        `${joinPhrases(worst.weekdays.map(weekdayName))}. The next one is the one to protect.`,
      actionLabel: 'Open training',
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
      title: onTrack
        ? `${plural(trainedThisWeek, 'session', 'sessions')} logged this week`
        : `${trainedThisWeek} of ${scheduledSoFar} sessions logged this week`,
      detail:
        `The schedule called for ${scheduledSoFar} between Sunday and today, and ` +
        `${trainedThisWeek} ${trainedThisWeek === 1 ? 'is' : 'are'} logged.` +
        (onTrack
          ? ' The week is on plan so far.'
          : ' The rest of the week is where the count evens out.'),
      actionLabel: 'Open training',
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
  label: string;
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
      label: SEGMENT_LABELS[key],
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
function trendTitle(change: ScanChange, direction: TrendDirections): string {
  const { muscleUp, muscleDown, fatUp, fatDown } = direction;

  if (muscleUp && fatDown) return 'Muscle up and fat down';
  if (muscleUp && fatUp) return 'Muscle and fat both up';
  if (muscleUp) return 'Muscle up since the last scan';
  if (muscleDown && fatUp) return 'Muscle down and fat up';
  if (muscleDown) return 'Muscle down since the last scan';
  if (fatUp) return 'Fat up since the last scan';
  if (fatDown) return 'Fat down since the last scan';

  const composition = change.skeletalMuscleKg !== undefined || change.bodyFatKg !== undefined;
  if (!composition && Math.abs(change.weightKg) >= SCAN_NOISE_KG) {
    return change.weightKg > 0 ? 'Weight up since the last scan' : 'Weight down since the last scan';
  }
  return 'Little moved between the last two scans';
}

function scanTrendInsight(previous: BodyScan, latest: BodyScan, goal?: Goal): Insight {
  const change = scanChange(previous, latest);
  const span = `between ${formatShortDay(previous.date)} and ${formatShortDay(latest.date)}`;
  const parts: string[] = [];

  if (previous.skeletalMuscleKg !== undefined && latest.skeletalMuscleKg !== undefined) {
    parts.push(
      `skeletal muscle went from ${kg(previous.skeletalMuscleKg)} to ${kg(latest.skeletalMuscleKg)}`,
    );
  }
  if (previous.bodyFatKg !== undefined && latest.bodyFatKg !== undefined) {
    parts.push(`body fat from ${kg(previous.bodyFatKg)} to ${kg(latest.bodyFatKg)}`);
  } else if (previous.bodyFatPercent !== undefined && latest.bodyFatPercent !== undefined) {
    parts.push(
      `percent body fat from ${percent(previous.bodyFatPercent)} to ${percent(latest.bodyFatPercent)}`,
    );
  }
  if (parts.length === 0) {
    parts.push(`weight went from ${kg(previous.weightKg)} to ${kg(latest.weightKg)}`);
  }

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

  const title = trendTitle(change, { muscleUp, muscleDown, fatUp, fatDown });

  return {
    id: 'body_trend',
    priority: PRIORITY.scanTrend,
    tone,
    category: 'body',
    icon: 'analytics-outline',
    title,
    detail:
      `Over ${plural(change.days, 'day', 'days')} ${span}, ${joinPhrases(parts)}. ` +
      'A third reading on the same machine makes the line clearer.',
    actionLabel: 'View scans',
    actionHref: ROUTES.body,
  };
}

function imbalanceInsight(scan: BodyScan): Insight | null {
  const lean = scan.segmentalLeanKg;
  if (!lean) return null;

  const pairs: { what: string; right?: number; left?: number }[] = [
    { what: 'arm', right: lean.rightArm, left: lean.leftArm },
    { what: 'leg', right: lean.rightLeg, left: lean.leftLeg },
  ];

  let worst: { what: string; right: number; left: number; share: number } | null = null;
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

  const heavier = worst.right > worst.left ? 'right' : 'left';
  const lighter = heavier === 'right' ? 'left' : 'right';

  return {
    id: 'body_imbalance',
    priority: PRIORITY.imbalance,
    tone: 'neutral',
    category: 'body',
    icon: 'swap-horizontal-outline',
    title: `${sentenceCase(heavier)} ${worst.what} reads heavier than the ${lighter}`,
    detail:
      `On ${formatShortDay(scan.date)} the right ${worst.what} held ${kgFine(worst.right)} of lean ` +
      `mass against ${kgFine(worst.left)} on the left, a ${percent(worst.share * 100)} difference. ` +
      `Working one side at a time loads the ${lighter} ${worst.what} the same as the other. ` +
      'Segmental readings carry some noise, so watch it across scans rather than one.',
    actionLabel: 'Open training',
    actionHref: ROUTES.training,
  };
}

function stalledSegmentInsight(previous: BodyScan, latest: BodyScan): Insight | null {
  const moves = segmentMoves(previous, latest);
  if (moves.length < 3) return null;

  const movers = moves.filter((move) => move.share >= SEGMENT_MOVED);
  const flat = moves.filter((move) => Math.abs(move.share) < SEGMENT_FLAT);
  if (movers.length === 0 || flat.length === 0) return null;

  const topMovers = [...movers].sort((a, b) => b.change - a.change).slice(0, 2);
  const grew = joinPhrases(
    topMovers.map(
      (move) => `${move.label} gained ${kgFine(move.change)} (${percent(move.share * 100)})`,
    ),
  );
  const stood = joinPhrases(
    flat.map((move) => `${move.label} moved ${kgFine(Math.abs(move.change))}`),
  );
  const flatTitle = joinPhrases(collapseSides(flat.map((move) => move.label)));

  return {
    id: 'body_segment_stalled',
    priority: PRIORITY.segmentStalled,
    tone: 'neutral',
    category: 'body',
    icon: 'footsteps-outline',
    title: `${sentenceCase(flatTitle)} did not move`,
    detail:
      `Between ${formatShortDay(previous.date)} and ${formatShortDay(latest.date)}, ${grew}, ` +
      `while ${stood}. Load and reps logged in each session are what show whether the work ` +
      'on those segments is progressing.',
    actionLabel: 'Open training',
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
      title: `${plural(streak, 'day', 'days')} logged in a row`,
      detail:
        `Meals are on record for ${plural(streak, 'day', 'days')} straight. ` +
        'Every number above is drawn from that run.',
    });
  }

  if (loggedDays > 0 && missed >= MIN_MISSED_DAYS) {
    found.push({
      id: 'consistency_missed',
      priority: PRIORITY.missedDays,
      tone: 'neutral',
      category: 'consistency',
      icon: 'calendar-number-outline',
      title: `${loggedDays} of the last ${HISTORY_WINDOW_DAYS} days have meals`,
      detail:
        `${plural(missed, 'day', 'days')} in that fortnight have nothing logged, so every ` +
        `average here comes from ${loggedDays}. Back-filling a day takes a minute in history.`,
      actionLabel: 'Open history',
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
      title: 'No targets to measure against yet',
      detail:
        'Sex, age, height, weight and goal are what the calorie and macro targets are built ' +
        'from. Without them there is nothing to compare your logged days to.',
      actionLabel: 'Finish profile',
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
      title: 'Food averages need more days',
      detail:
        `${summaries.length} of the last ${NUTRITION_WINDOW_DAYS} days have meals logged. ` +
        `At ${MIN_LOGGED_DAYS} this list starts reporting protein and calorie averages.`,
      actionLabel: 'Log a meal',
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
      title: 'No sessions logged yet',
      detail:
        'Once sessions are on record, this list can compare what the schedule asked for with ' +
        'what was done, by day type.',
      actionLabel: 'Open training',
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
      title:
        input.scans.length === 0
          ? 'No body scan on file'
          : 'One body scan on file',
      detail:
        input.scans.length === 0
          ? 'A body-composition reading adds muscle, fat and per-limb numbers that weight alone ' +
            'cannot show.'
          : 'A second reading is what turns a single sheet into a direction for muscle, fat and ' +
            'each limb.',
      actionLabel: 'Add a scan',
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
