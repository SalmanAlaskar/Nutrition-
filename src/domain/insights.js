"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_INSIGHTS = void 0;
exports.buildInsights = buildInsights;
const bodyScan_1 = require("./bodyScan");
const date_1 = require("./date");
const totals_1 = require("./totals");
const training_1 = require("./training");
/** Most insights the engine ever returns. */
exports.MAX_INSIGHTS = 5;
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
};
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
};
/* ------------------------------------------------------------ formatting -- */
const round1 = (value) => Math.round(value * 10) / 10;
/** '1,842' — same grouping the dashboard uses. */
function groupDigits(value) {
    return Math.round(value)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
const kcal = (value) => `${groupDigits(value)} kcal`;
const grams = (value) => `${Math.round(value)} g`;
const kg = (value) => `${round1(value).toFixed(1)} kg`;
const kgFine = (value) => `${(Math.round(value * 100) / 100).toFixed(2)} kg`;
const percent = (value) => `${round1(value).toFixed(1)}%`;
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
function joinPhrases(parts) {
    if (parts.length <= 1)
        return parts[0] ?? '';
    if (parts.length === 2)
        return `${parts[0]} and ${parts[1]}`;
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
const sentenceCase = (text) => text.charAt(0).toUpperCase() + text.slice(1);
/** 'right leg' plus 'left leg' reads better as 'both legs' in a title. */
function collapseSides(labels) {
    const out = [...labels];
    for (const part of ['arm', 'leg']) {
        const right = out.indexOf(`right ${part}`);
        const left = out.indexOf(`left ${part}`);
        if (right === -1 || left === -1)
            continue;
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
const weekdayName = (date) => WEEKDAY_NAMES[(0, date_1.parseDateKey)(date).getDay()] ?? '';
const SEGMENT_KEYS = [
    'rightArm',
    'leftArm',
    'trunk',
    'rightLeg',
    'leftLeg',
];
const SEGMENT_LABELS = {
    rightArm: 'right arm',
    leftArm: 'left arm',
    trunk: 'trunk',
    rightLeg: 'right leg',
    leftLeg: 'left leg',
};
const mean = (values) => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
/** The keys of a per-day map that actually hold something, oldest first. */
function datesWithEntries(byDate) {
    return Object.keys(byDate)
        .filter((date) => (byDate[date] ?? []).length > 0)
        .sort();
}
/** One row per day that actually has meals, oldest first. */
function summariseDays(dates, mealsByDate) {
    const rows = [];
    for (const date of dates) {
        const meals = mealsByDate[date] ?? [];
        if (meals.length === 0)
            continue;
        const macros = (0, totals_1.totalMacros)(meals);
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
function nutritionInsights(targets, summaries) {
    const found = [];
    if (!targets)
        return found;
    const logged = summaries.length;
    if (logged >= MIN_LOGGED_DAYS) {
        const avgProtein = mean(summaries.map((day) => day.protein));
        const avgCalories = mean(summaries.map((day) => day.calories));
        const span = `${plural(logged, 'logged day', 'logged days')} in the last ${NUTRITION_WINDOW_DAYS}`;
        if (targets.protein > 0 && avgProtein < targets.protein * PROTEIN_SHORTFALL) {
            found.push({
                id: 'nutrition_protein',
                priority: PRIORITY.protein,
                tone: 'warning',
                category: 'nutrition',
                icon: 'nutrition-outline',
                title: 'Protein is landing under target',
                detail: `Protein averaged ${grams(avgProtein)} a day against a ${grams(targets.protein)} ` +
                    `target across ${span}. That is ${grams(targets.protein - avgProtein)} short a day. ` +
                    'One protein-led item at the meal you usually log lightest covers most of it.',
                actionLabel: 'Log a meal',
                actionHref: ROUTES.addMeal,
            });
        }
        if (targets.calories > 0) {
            const over = avgCalories > targets.calories * CALORIE_OVER;
            const under = avgCalories < targets.calories * CALORIE_UNDER;
            const diff = Math.abs(avgCalories - targets.calories);
            if (over || under) {
                found.push({
                    id: 'nutrition_calories',
                    priority: PRIORITY.calories,
                    tone: over ? 'warning' : 'neutral',
                    category: 'nutrition',
                    icon: 'flame-outline',
                    title: over ? 'Calories are running over target' : 'Calories are running under target',
                    detail: `Calories averaged ${kcal(avgCalories)} a day against a ${kcal(targets.calories)} ` +
                        `target across ${span}, ${kcal(diff)} a day ${over ? 'over' : 'under'}. ` +
                        (over
                            ? 'The history chart shows which days carry the difference.'
                            : 'An average this low can also mean items were logged late or not at all.'),
                    actionLabel: 'Open history',
                    actionHref: ROUTES.history,
                });
            }
        }
    }
    if (targets.calories > 0) {
        const floor = targets.calories * LOW_DAY_SHARE;
        const lowDays = summaries.filter((day) => day.calories > 0 && day.calories < floor);
        const lowest = lowDays.reduce((min, day) => (min === null || day.calories < min.calories ? day : min), null);
        if (lowest) {
            const others = lowDays.length > 1
                ? ` ${plural(lowDays.length, 'day', 'days')} in the last ${NUTRITION_WINDOW_DAYS} read that low.`
                : '';
            found.push({
                id: 'nutrition_low_day',
                priority: PRIORITY.lowDay,
                tone: 'neutral',
                category: 'nutrition',
                icon: 'alert-circle-outline',
                title: `${(0, date_1.formatShortDay)(lowest.date)} reads unusually low`,
                detail: `That day totals ${kcal(lowest.calories)} from ` +
                    `${plural(lowest.mealCount, 'meal', 'meals')}, under the ${kcal(floor)} mark for your ` +
                    `${kcal(targets.calories)} target.${others} Filling the gaps keeps the averages honest.`,
                actionLabel: 'Open history',
                actionHref: ROUTES.history,
            });
        }
    }
    return found;
}
/** Scheduled days against logged sessions of the same type, over a date range. */
function countSchedule(program, dates, workoutsByDate) {
    const counts = new Map();
    for (const date of dates) {
        const day = (0, training_1.dayForDate)(program, date);
        if (!day)
            continue;
        const row = counts.get(day.type) ?? {
            type: day.type,
            label: day.label,
            scheduled: 0,
            completed: 0,
            weekdays: [],
        };
        row.scheduled += 1;
        const name = weekdayName(date);
        if (name && !row.weekdays.includes(name))
            row.weekdays.push(name);
        const sessions = workoutsByDate[date] ?? [];
        if (sessions.some((session) => session.type === day.type))
            row.completed += 1;
        counts.set(day.type, row);
    }
    return [...counts.values()];
}
/** `trained` is every day with a session, oldest first. */
function trainingInsights(input, today, trained) {
    const found = [];
    const program = input.program ?? null;
    const lastSession = trained.length > 0 ? trained[trained.length - 1] : null;
    if (lastSession) {
        const gap = (0, date_1.daysBetween)(lastSession, today);
        if (gap >= TRAINING_GAP_DAYS) {
            // Days strictly between the last session and today: today is not missed yet.
            const sinceDates = (0, date_1.lastNDays)(gap, (0, date_1.addDays)(today, -1)).filter((date) => date > lastSession);
            const missedScheduled = program
                ? sinceDates.filter((date) => (0, training_1.dayForDate)(program, date) !== null).length
                : 0;
            found.push({
                id: 'training_gap',
                priority: PRIORITY.trainingGap,
                tone: 'warning',
                category: 'training',
                icon: 'time-outline',
                title: `No session logged in ${plural(gap, 'day', 'days')}`,
                detail: `The last one was ${(0, date_1.formatShortDay)(lastSession)}.` +
                    (missedScheduled > 0
                        ? ` ${plural(missedScheduled, 'training day', 'training days')} on the schedule have ` +
                            'passed since then. Starting today’s session, even a short one, restarts the count.'
                        : ' Starting the next session restarts the count.'),
                actionLabel: 'Open training',
                actionHref: ROUTES.training,
            });
            // The gap already says everything the schedule breakdown would repeat.
            return found;
        }
    }
    if (!program)
        return found;
    const fortnight = (0, date_1.lastNDays)(HISTORY_WINDOW_DAYS, (0, date_1.addDays)(today, -1));
    const counts = countSchedule(program, fortnight, input.workoutsByDate);
    const worst = counts.reduce((max, row) => {
        const missed = row.scheduled - row.completed;
        if (missed < MIN_MISSED_SESSIONS)
            return max;
        if (max === null)
            return row;
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
            detail: `${worst.label} was scheduled ${plural(worst.scheduled, 'time', 'times')} in the last ` +
                `${HISTORY_WINDOW_DAYS} days and logged ${worst.completed}. It falls on ` +
                `${joinPhrases(worst.weekdays)}. The next one is the one to protect.`,
            actionLabel: 'Open training',
            actionHref: ROUTES.training,
        });
    }
    const trainedSet = new Set(trained);
    const weekSoFar = (0, training_1.weekDates)(today).filter((date) => date <= today);
    const scheduledSoFar = weekSoFar.filter((date) => (0, training_1.dayForDate)(program, date) !== null).length;
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
            detail: `The schedule called for ${scheduledSoFar} between Sunday and today, and ` +
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
function sortScans(scans) {
    return [...scans].sort((a, b) => a.date === b.date ? a.takenAt.localeCompare(b.takenAt) : a.date.localeCompare(b.date));
}
function segmentMoves(from, to) {
    const before = from.segmentalLeanKg;
    const after = to.segmentalLeanKg;
    if (!before || !after)
        return [];
    const moves = [];
    for (const key of SEGMENT_KEYS) {
        const start = before[key];
        const end = after[key];
        if (start === undefined || end === undefined || start <= 0)
            continue;
        moves.push({
            label: SEGMENT_LABELS[key],
            change: end - start,
            share: (end - start) / start,
        });
    }
    return moves;
}
function scanTrendInsight(previous, latest) {
    const change = (0, bodyScan_1.scanChange)(previous, latest);
    const span = `between ${(0, date_1.formatShortDay)(previous.date)} and ${(0, date_1.formatShortDay)(latest.date)}`;
    const parts = [];
    if (previous.skeletalMuscleKg !== undefined && latest.skeletalMuscleKg !== undefined) {
        parts.push(`skeletal muscle went from ${kg(previous.skeletalMuscleKg)} to ${kg(latest.skeletalMuscleKg)}`);
    }
    if (previous.bodyFatKg !== undefined && latest.bodyFatKg !== undefined) {
        parts.push(`body fat from ${kg(previous.bodyFatKg)} to ${kg(latest.bodyFatKg)}`);
    }
    else if (previous.bodyFatPercent !== undefined && latest.bodyFatPercent !== undefined) {
        parts.push(`percent body fat from ${percent(previous.bodyFatPercent)} to ${percent(latest.bodyFatPercent)}`);
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
    const tone = muscleUp && !fatUp ? 'positive' : muscleDown || fatUp ? 'warning' : 'neutral';
    const title = muscleUp && fatDown
        ? 'Muscle up and fat down'
        : muscleUp
            ? 'Muscle up since the last scan'
            : muscleDown
                ? 'Muscle down since the last scan'
                : fatUp
                    ? 'Fat up since the last scan'
                    : 'Little moved between the last two scans';
    return {
        id: 'body_trend',
        priority: PRIORITY.scanTrend,
        tone,
        category: 'body',
        icon: 'analytics-outline',
        title,
        detail: `Over ${plural(change.days, 'day', 'days')} ${span}, ${joinPhrases(parts)}. ` +
            'A third reading on the same machine makes the line clearer.',
        actionLabel: 'View scans',
        actionHref: ROUTES.body,
    };
}
function imbalanceInsight(scan) {
    const lean = scan.segmentalLeanKg;
    if (!lean)
        return null;
    const pairs = [
        { what: 'arm', right: lean.rightArm, left: lean.leftArm },
        { what: 'leg', right: lean.rightLeg, left: lean.leftLeg },
    ];
    let worst = null;
    for (const pair of pairs) {
        const { right, left } = pair;
        if (right === undefined || left === undefined)
            continue;
        const average = (right + left) / 2;
        if (average <= 0)
            continue;
        const share = Math.abs(right - left) / average;
        if (share < IMBALANCE_SHARE)
            continue;
        if (!worst || share > worst.share)
            worst = { what: pair.what, right, left, share };
    }
    if (!worst)
        return null;
    const heavier = worst.right > worst.left ? 'right' : 'left';
    const lighter = heavier === 'right' ? 'left' : 'right';
    return {
        id: 'body_imbalance',
        priority: PRIORITY.imbalance,
        tone: 'neutral',
        category: 'body',
        icon: 'swap-horizontal-outline',
        title: `Your ${heavier} ${worst.what} reads heavier`,
        detail: `On ${(0, date_1.formatShortDay)(scan.date)} the right ${worst.what} held ${kgFine(worst.right)} of lean ` +
            `mass against ${kgFine(worst.left)} on the left, a ${percent(worst.share * 100)} difference. ` +
            `Single-side work loads the ${lighter} ${worst.what} the same as the other; a gap this ` +
            'small can also be the machine.',
        actionLabel: 'Open training',
        actionHref: ROUTES.training,
    };
}
function stalledSegmentInsight(previous, latest) {
    const moves = segmentMoves(previous, latest);
    if (moves.length < 3)
        return null;
    const movers = moves.filter((move) => move.share >= SEGMENT_MOVED);
    const flat = moves.filter((move) => Math.abs(move.share) < SEGMENT_FLAT);
    if (movers.length === 0 || flat.length === 0)
        return null;
    const topMovers = [...movers].sort((a, b) => b.share - a.share).slice(0, 2);
    const grew = joinPhrases(topMovers.map((move) => `${move.label} gained ${kgFine(move.change)} (${percent(move.share * 100)})`));
    const stood = joinPhrases(flat.map((move) => `${move.label} moved ${kgFine(Math.abs(move.change))}`));
    const flatTitle = joinPhrases(collapseSides(flat.map((move) => move.label)));
    return {
        id: 'body_segment_stalled',
        priority: PRIORITY.segmentStalled,
        tone: 'neutral',
        category: 'body',
        icon: 'footsteps-outline',
        title: `${sentenceCase(flatTitle)} did not move`,
        detail: `Between ${(0, date_1.formatShortDay)(previous.date)} and ${(0, date_1.formatShortDay)(latest.date)}, ${grew}, ` +
            `while ${stood}. Load and reps logged in each session are what show whether the work ` +
            'on those segments is progressing.',
        actionLabel: 'Open training',
        actionHref: ROUTES.training,
    };
}
function bodyInsights(scans) {
    const sorted = sortScans(scans);
    if (sorted.length < 2)
        return [];
    const latest = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2];
    if (!latest || !previous)
        return [];
    const found = [scanTrendInsight(previous, latest)];
    const stalled = stalledSegmentInsight(previous, latest);
    if (stalled)
        found.push(stalled);
    const imbalance = imbalanceInsight(latest);
    if (imbalance)
        found.push(imbalance);
    return found;
}
/* ----------------------------------------------------------- consistency -- */
/** `logged` is every day with a meal, oldest first. */
function consistencyInsights(today, logged) {
    const found = [];
    const loggedSet = new Set(logged);
    const fortnight = (0, date_1.lastNDays)(HISTORY_WINDOW_DAYS, (0, date_1.addDays)(today, -1));
    const loggedDays = fortnight.filter((date) => loggedSet.has(date)).length;
    const missed = fortnight.length - loggedDays;
    const streak = (0, totals_1.loggingStreak)(logged, today);
    if (streak >= MIN_STREAK_DAYS) {
        found.push({
            id: 'consistency_streak',
            priority: PRIORITY.streak,
            tone: 'positive',
            category: 'consistency',
            icon: 'flash-outline',
            title: `${plural(streak, 'day', 'days')} logged in a row`,
            detail: `Meals are on record for ${plural(streak, 'day', 'days')} straight. ` +
                'Every number above is drawn from that run.',
        });
    }
    if (missed >= MIN_MISSED_DAYS) {
        found.push({
            id: 'consistency_missed',
            priority: PRIORITY.missedDays,
            tone: 'neutral',
            category: 'consistency',
            icon: 'calendar-number-outline',
            title: `${loggedDays} of the last ${HISTORY_WINDOW_DAYS} days have meals`,
            detail: `${plural(missed, 'day', 'days')} in that fortnight have nothing logged, so every ` +
                `average here comes from ${loggedDays}. Back-filling a day takes a minute in history.`,
            actionLabel: 'Open history',
            actionHref: ROUTES.history,
        });
    }
    return found;
}
/* ----------------------------------------------------------------- gates -- */
/** Honest placeholders: what is missing, and what it would unlock. */
function gateInsights(input, summaries, trained) {
    const found = [];
    if (!input.profile || !input.targets) {
        found.push({
            id: 'gate_profile',
            priority: PRIORITY.profileGate,
            tone: 'neutral',
            category: 'nutrition',
            icon: 'person-outline',
            title: 'No targets to measure against yet',
            detail: 'Sex, age, height, weight and goal are what the calorie and macro targets are built ' +
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
            detail: `${summaries.length} of the last ${NUTRITION_WINDOW_DAYS} days have meals logged. ` +
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
            detail: 'Once sessions are on record, this list can compare what the schedule asked for with ' +
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
            title: input.scans.length === 0
                ? 'No body scan on file'
                : 'One body scan on file',
            detail: input.scans.length === 0
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
function buildInsights(input) {
    const { today } = input;
    const window = (0, date_1.lastNDays)(NUTRITION_WINDOW_DAYS, (0, date_1.addDays)(today, -1));
    const summaries = summariseDays(window, input.mealsByDate);
    const logged = [...(input.loggedDates ?? datesWithEntries(input.mealsByDate))].sort();
    const trained = [...(input.workoutDates ?? datesWithEntries(input.workoutsByDate))].sort();
    const candidates = [
        ...nutritionInsights(input.targets, summaries),
        ...trainingInsights(input, today, trained),
        ...bodyInsights(input.scans),
        ...consistencyInsights(today, logged),
        ...gateInsights(input, summaries, trained),
    ];
    const seen = new Set();
    const unique = candidates.filter((insight) => {
        if (seen.has(insight.id))
            return false;
        seen.add(insight.id);
        return true;
    });
    return unique
        .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
        .slice(0, exports.MAX_INSIGHTS);
}
