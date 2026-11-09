/// <reference types="jest" />
/**
 * Dated phases.
 *
 * The fixture that matters most is the owner's real one: a cut from 8 November
 * to 31 December 2026 at 2,450 kcal with 180 g protein, 285 g carbohydrate and
 * 65 g fat, set against a profile whose goal still says 'gain'. Every figure a
 * phase produces is an estimate from body weight and activity, and the point of
 * these tests is that an explicit number the user typed is never quietly
 * replaced by a derived one.
 */
import type { Phase, PhaseKind, Profile } from '@/types';

import { MIN_CALORIES, macroTargets, totalDailyEnergyExpenditure } from './nutrition';
import {
  MAX_PHASE_DAYS,
  MIN_PHASE_DAYS,
  PHASE_KINDS,
  activePhase,
  derivePhaseTargets,
  pastPhases,
  phaseFor,
  phaseLengthDays,
  phaseProgress,
  targetsForDate,
  targetsForPhase,
  upcomingPhases,
  validatePhase,
} from './phase';

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  sex: 'male',
  age: 28,
  heightCm: 178,
  weightKg: 78,
  activityLevel: 'active',
  goal: 'gain',
  units: 'metric',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...overrides,
});

const phase = (
  overrides: Partial<Phase> & Pick<Phase, 'id' | 'startDate' | 'endDate'>,
): Phase => ({
  kind: 'cut',
  createdAt: `${overrides.startDate}T00:00:00.000Z`,
  updatedAt: `${overrides.startDate}T00:00:00.000Z`,
  ...overrides,
});

/** The owner's own cut, as he set it. */
const ownerCut = (): Phase =>
  phase({
    id: 'p_cut_2026',
    kind: 'cut',
    startDate: '2026-11-08',
    endDate: '2026-12-31',
    calories: 2450,
    proteinG: 180,
    carbsG: 285,
    fatG: 65,
    note: 'Muscle up, trunk fat flat across three readings.',
  });

/** 78 kg, 178 cm, 28, six days a week: 3,033 kcal of maintenance. */
const OWNER_MAINTENANCE = 3033;

describe('phaseLengthDays', () => {
  it('counts both ends: 8 November to 31 December is 54 days', () => {
    expect(phaseLengthDays(ownerCut())).toBe(54);
  });

  it('is 1 for a single day and 7 for a week', () => {
    expect(phaseLengthDays({ startDate: '2026-11-08', endDate: '2026-11-08' })).toBe(1);
    expect(phaseLengthDays({ startDate: '2026-11-08', endDate: '2026-11-14' })).toBe(7);
  });
});

describe('activePhase', () => {
  const phases = [ownerCut()];

  it('covers the first day of the range', () => {
    expect(activePhase(phases, '2026-11-08')?.id).toBe('p_cut_2026');
  });

  it('covers the last day of the range', () => {
    expect(activePhase(phases, '2026-12-31')?.id).toBe('p_cut_2026');
  });

  it('does not cover the day before it starts or the day after it ends', () => {
    expect(activePhase(phases, '2026-11-07')).toBeNull();
    expect(activePhase(phases, '2027-01-01')).toBeNull();
  });

  it('returns null with no phases at all', () => {
    expect(activePhase([], '2026-11-20')).toBeNull();
  });

  it('picks the phase whose range holds the date, not the first in the list', () => {
    const list = [
      phase({ id: 'maintain', kind: 'maintain', startDate: '2026-09-01', endDate: '2026-11-07' }),
      ownerCut(),
      phase({ id: 'build', kind: 'build', startDate: '2027-01-01', endDate: '2027-03-31' }),
    ];
    expect(activePhase(list, '2026-10-01')?.id).toBe('maintain');
    expect(activePhase(list, '2026-11-08')?.id).toBe('p_cut_2026');
    expect(activePhase(list, '2027-02-14')?.id).toBe('build');
    expect(activePhase(list, '2026-08-31')).toBeNull();
    expect(activePhase(list, '2027-04-01')).toBeNull();
  });

  it('prefers the later start when an imported file carries two that overlap', () => {
    const list = [
      phase({ id: 'wide', kind: 'maintain', startDate: '2026-11-01', endDate: '2026-12-31' }),
      ownerCut(),
    ];
    expect(activePhase(list, '2026-11-20')?.id).toBe('p_cut_2026');
    expect(activePhase(list, '2026-11-03')?.id).toBe('wide');
  });

  it('breaks a tie on the same start date with the one edited last', () => {
    const list = [
      phase({
        id: 'older',
        startDate: '2026-11-08',
        endDate: '2026-12-31',
        updatedAt: '2026-11-01T00:00:00.000Z',
      }),
      phase({
        id: 'newer',
        startDate: '2026-11-08',
        endDate: '2026-12-31',
        updatedAt: '2026-11-02T00:00:00.000Z',
      }),
    ];
    expect(activePhase(list, '2026-11-20')?.id).toBe('newer');
    expect(activePhase([...list].reverse(), '2026-11-20')?.id).toBe('newer');
  });

  it('phaseFor is the same answer', () => {
    expect(phaseFor(phases, '2026-11-08')).toEqual(activePhase(phases, '2026-11-08'));
    expect(phaseFor(phases, '2026-11-07')).toBeNull();
  });
});

describe('upcomingPhases and pastPhases', () => {
  const list = [
    ownerCut(),
    phase({ id: 'build', kind: 'build', startDate: '2027-01-01', endDate: '2027-03-31' }),
    phase({ id: 'spring', kind: 'maintain', startDate: '2027-04-01', endDate: '2027-05-31' }),
    phase({ id: 'last-year', kind: 'maintain', startDate: '2026-01-01', endDate: '2026-02-28' }),
  ];

  it('lists what has not begun, soonest first, excluding the running phase', () => {
    expect(upcomingPhases(list, '2026-11-20').map((item) => item.id)).toEqual([
      'build',
      'spring',
    ]);
  });

  it('lists what has finished, most recent first, excluding the running phase', () => {
    expect(pastPhases(list, '2026-11-20').map((item) => item.id)).toEqual(['last-year']);
    expect(pastPhases(list, '2027-01-01').map((item) => item.id)).toEqual([
      'p_cut_2026',
      'last-year',
    ]);
  });

  it('counts the last day as still running, not past', () => {
    expect(pastPhases(list, '2026-12-31').map((item) => item.id)).toEqual(['last-year']);
    expect(pastPhases(list, '2027-01-01').map((item) => item.id)).toContain('p_cut_2026');
  });
});

describe('derivePhaseTargets', () => {
  const owner = profile();

  it('agrees with the maintenance figure the profile implies', () => {
    expect(totalDailyEnergyExpenditure(owner)).toBe(OWNER_MAINTENANCE);
    expect(derivePhaseTargets(owner, 'maintain').calories).toBe(OWNER_MAINTENANCE);
  });

  it('moves calories in the direction each kind implies', () => {
    const cut = derivePhaseTargets(owner, 'cut');
    const maintain = derivePhaseTargets(owner, 'maintain');
    const build = derivePhaseTargets(owner, 'build');

    expect(cut.calories).toBeLessThan(maintain.calories);
    expect(build.calories).toBeGreaterThan(maintain.calories);
    expect(cut.calories).toBe(2578);
    expect(build.calories).toBe(3336);
  });

  it('asks for more protein on a cut than on a build, from the same body weight', () => {
    expect(derivePhaseTargets(owner, 'cut').protein).toBe(172);
    expect(derivePhaseTargets(owner, 'maintain').protein).toBe(140);
    expect(derivePhaseTargets(owner, 'build').protein).toBe(140);
    expect(derivePhaseTargets(owner, 'cut').protein).toBeGreaterThan(
      derivePhaseTargets(owner, 'build').protein,
    );
  });

  it('splits the calories so the four figures agree with each other', () => {
    for (const kind of PHASE_KINDS) {
      const targets = derivePhaseTargets(owner, kind);
      const fromMacros = targets.protein * 4 + targets.carbs * 4 + targets.fat * 9;
      expect(Math.abs(fromMacros - targets.calories)).toBeLessThanOrEqual(4);
    }
  });

  it('ignores the profile override, which answers a different question', () => {
    const overridden = profile({ customCalorieTarget: 1800 });
    expect(derivePhaseTargets(overridden, 'cut')).toEqual(derivePhaseTargets(owner, 'cut'));
  });

  it('holds the floor for a small sedentary woman on a cut', () => {
    const small = profile({
      sex: 'female',
      age: 58,
      heightCm: 155,
      weightKg: 48,
      activityLevel: 'sedentary',
      goal: 'maintain',
    });
    expect(totalDailyEnergyExpenditure(small)).toBe(1198);

    const cut = derivePhaseTargets(small, 'cut');
    // 85% of 1,198 is 1,018, below the floor, so the floor is what comes back.
    expect(cut.calories).toBe(MIN_CALORIES.female);
    expect(cut).toEqual({ calories: 1200, protein: 106, carbs: 113, fat: 36 });
  });

  it('holds the floor for a small sedentary man on a cut', () => {
    const small = profile({
      age: 70,
      heightCm: 160,
      weightKg: 50,
      activityLevel: 'sedentary',
      goal: 'maintain',
    });
    expect(derivePhaseTargets(small, 'cut').calories).toBe(MIN_CALORIES.male);
  });
});

describe('targetsForPhase', () => {
  const owner = profile();

  it('uses every figure the owner typed for his own cut', () => {
    expect(targetsForPhase(owner, ownerCut())).toEqual({
      calories: 2450,
      protein: 180,
      carbs: 285,
      fat: 65,
    });
  });

  it('derives all four when the phase carries none of them', () => {
    const bare = phase({ id: 'bare', kind: 'cut', startDate: '2026-11-08', endDate: '2026-12-31' });
    expect(targetsForPhase(owner, bare)).toEqual(derivePhaseTargets(owner, 'cut'));
  });

  it('lets an explicit calorie figure win while the macros stay derived and scaled', () => {
    const caloriesOnly = phase({
      id: 'cal-only',
      kind: 'cut',
      startDate: '2026-11-08',
      endDate: '2026-12-31',
      calories: 2450,
    });
    const derived = derivePhaseTargets(owner, 'cut');
    const targets = targetsForPhase(owner, caloriesOnly);

    expect(targets.calories).toBe(2450);
    // Protein comes from body weight, so it does not move with the calories.
    expect(targets.protein).toBe(derived.protein);
    // Fat takes its share of the smaller figure and carbohydrate absorbs the rest.
    expect(targets.fat).toBeLessThan(derived.fat);
    expect(targets.carbs).toBeLessThan(derived.carbs);
    expect(targets).toEqual({ calories: 2450, protein: 172, carbs: 274, fat: 74 });
  });

  it('uses an explicit calorie figure exactly as typed, with no floor applied', () => {
    const low = phase({
      id: 'low',
      kind: 'cut',
      startDate: '2026-11-08',
      endDate: '2026-12-31',
      calories: 1300,
    });
    expect(targetsForPhase(owner, low).calories).toBe(1300);
    expect(targetsForPhase(owner, low).calories).toBeLessThan(MIN_CALORIES.male);
  });

  it('lets one explicit macro win while the rest stay derived', () => {
    const proteinOnly = phase({
      id: 'protein-only',
      kind: 'cut',
      startDate: '2026-11-08',
      endDate: '2026-12-31',
      proteinG: 200,
    });
    const derived = derivePhaseTargets(owner, 'cut');
    const targets = targetsForPhase(owner, proteinOnly);

    expect(targets.protein).toBe(200);
    expect(targets.calories).toBe(derived.calories);
    expect(targets.fat).toBe(derived.fat);
    // Carbohydrate absorbs what the extra protein took.
    expect(targets.carbs).toBeLessThan(derived.carbs);
    expect(targets).toEqual({ calories: 2578, protein: 200, carbs: 271, fat: 77 });
  });

  it('lets an explicit fat figure win, with carbohydrate absorbing the difference', () => {
    const fatOnly = phase({
      id: 'fat-only',
      kind: 'cut',
      startDate: '2026-11-08',
      endDate: '2026-12-31',
      fatG: 60,
    });
    expect(targetsForPhase(owner, fatOnly)).toEqual({
      calories: 2578,
      protein: 172,
      carbs: 338,
      fat: 60,
    });
  });

  it('takes an explicit carbohydrate figure even when it disagrees with the remainder', () => {
    const carbsOnly = phase({
      id: 'carbs-only',
      kind: 'cut',
      startDate: '2026-11-08',
      endDate: '2026-12-31',
      carbsG: 100,
    });
    expect(targetsForPhase(owner, carbsOnly).carbs).toBe(100);
  });

  it('never returns a negative macro when the explicit calories are tiny', () => {
    const tiny = phase({
      id: 'tiny',
      kind: 'cut',
      startDate: '2026-11-08',
      endDate: '2026-12-31',
      calories: 400,
      proteinG: 180,
    });
    const targets = targetsForPhase(owner, tiny);
    expect(targets.carbs).toBe(0);
    expect(targets.protein).toBe(180);
  });
});

describe('targetsForDate', () => {
  const owner = profile();

  it('falls through to the goal-derived target with no phases at all', () => {
    expect(targetsForDate(owner, [], '2026-11-20')).toEqual(macroTargets(owner));
    expect(targetsForDate(owner, [], '2026-11-20').calories).toBe(3397);
  });

  it('falls through on a day no phase covers', () => {
    expect(targetsForDate(owner, [ownerCut()], '2026-11-07')).toEqual(macroTargets(owner));
    expect(targetsForDate(owner, [ownerCut()], '2027-01-01')).toEqual(macroTargets(owner));
  });

  it('hands the day to the phase that covers it, on both bounds', () => {
    const cut = targetsForPhase(owner, ownerCut());
    expect(targetsForDate(owner, [ownerCut()], '2026-11-08')).toEqual(cut);
    expect(targetsForDate(owner, [ownerCut()], '2026-12-01')).toEqual(cut);
    expect(targetsForDate(owner, [ownerCut()], '2026-12-31')).toEqual(cut);
  });

  it('puts the running phase above the profile override, and the override back after', () => {
    const overridden = profile({ customCalorieTarget: 3600 });
    expect(targetsForDate(overridden, [ownerCut()], '2026-11-20').calories).toBe(2450);
    expect(targetsForDate(overridden, [ownerCut()], '2027-01-01').calories).toBe(3600);
  });
});

describe('phaseProgress', () => {
  const cut = ownerCut();

  it('reads as day 1 of 54 on the first day', () => {
    expect(phaseProgress(cut, '2026-11-08')).toEqual({
      dayNumber: 1,
      totalDays: 54,
      daysLeft: 53,
      ratio: 1 / 54,
    });
  });

  it('reads as halfway on the middle day', () => {
    expect(phaseProgress(cut, '2026-12-04')).toEqual({
      dayNumber: 27,
      totalDays: 54,
      daysLeft: 27,
      ratio: 0.5,
    });
  });

  it('reads as the last day with none left', () => {
    expect(phaseProgress(cut, '2026-12-31')).toEqual({
      dayNumber: 54,
      totalDays: 54,
      daysLeft: 0,
      ratio: 1,
    });
  });

  it('reads as day 0 before the phase begins', () => {
    const before = phaseProgress(cut, '2026-11-01');
    expect(before.dayNumber).toBe(0);
    expect(before.daysLeft).toBe(54);
    expect(before.ratio).toBe(0);
  });

  it('clamps to the end once the phase is over', () => {
    expect(phaseProgress(cut, '2027-02-01')).toEqual({
      dayNumber: 54,
      totalDays: 54,
      daysLeft: 0,
      ratio: 1,
    });
  });

  it('keeps dayNumber plus daysLeft equal to totalDays across the range', () => {
    for (const day of ['2026-11-08', '2026-11-30', '2026-12-04', '2026-12-25', '2026-12-31']) {
      const at = phaseProgress(cut, day);
      expect(at.dayNumber + at.daysLeft).toBe(at.totalDays);
      expect(at.ratio).toBeGreaterThan(0);
      expect(at.ratio).toBeLessThanOrEqual(1);
    }
  });

  it('handles a single-day phase without dividing by zero', () => {
    const oneDay = phase({ id: 'one', startDate: '2026-11-08', endDate: '2026-11-08' });
    expect(phaseProgress(oneDay, '2026-11-08')).toEqual({
      dayNumber: 1,
      totalDays: 1,
      daysLeft: 0,
      ratio: 1,
    });
  });
});

describe('validatePhase', () => {
  it('accepts the cut the owner set, against an empty store', () => {
    expect(validatePhase(ownerCut(), [])).toEqual([]);
  });

  it('rejects a range that ends before it starts', () => {
    const inverted = phase({ id: 'inverted', startDate: '2026-12-31', endDate: '2026-11-08' });
    expect(validatePhase(inverted, [])).toEqual(['errorEndBeforeStart']);
  });

  it('rejects dates that are not days', () => {
    expect(validatePhase(phase({ id: 'a', startDate: '2026-11', endDate: '2026-12-31' }), [])).toEqual([
      'errorBadDates',
    ]);
    expect(validatePhase(phase({ id: 'b', startDate: '2026-11-08', endDate: '' }), [])).toEqual([
      'errorBadDates',
    ]);
  });

  it('rejects a span shorter than a week and accepts one exactly a week long', () => {
    expect(MIN_PHASE_DAYS).toBe(7);
    const short = phase({ id: 'short', startDate: '2026-11-08', endDate: '2026-11-13' });
    expect(phaseLengthDays(short)).toBe(6);
    expect(validatePhase(short, [])).toEqual(['errorTooShort']);

    const week = phase({ id: 'week', startDate: '2026-11-08', endDate: '2026-11-14' });
    expect(phaseLengthDays(week)).toBe(7);
    expect(validatePhase(week, [])).toEqual([]);
  });

  it('rejects a span longer than a year and accepts one exactly at the limit', () => {
    expect(MAX_PHASE_DAYS).toBe(366);
    const tooLong = phase({ id: 'long', startDate: '2026-01-01', endDate: '2027-01-02' });
    expect(phaseLengthDays(tooLong)).toBe(367);
    expect(validatePhase(tooLong, [])).toEqual(['errorTooLong']);

    const atLimit = phase({ id: 'limit', startDate: '2026-01-01', endDate: '2027-01-01' });
    expect(phaseLengthDays(atLimit)).toBe(366);
    expect(validatePhase(atLimit, [])).toEqual([]);
  });

  it('rejects a phase that shares even one day with another', () => {
    const others = [ownerCut()];
    const overlapping = phase({
      id: 'next',
      kind: 'build',
      startDate: '2026-12-31',
      endDate: '2027-02-15',
    });
    expect(validatePhase(overlapping, others)).toEqual(['errorOverlap']);

    const after = phase({
      id: 'after',
      kind: 'build',
      startDate: '2027-01-01',
      endDate: '2027-02-15',
    });
    expect(validatePhase(after, others)).toEqual([]);
  });

  it('does not let a phase collide with its own stored copy', () => {
    const stored = ownerCut();
    const edited: Phase = { ...stored, calories: 2500 };
    expect(validatePhase(edited, [stored])).toEqual([]);
  });

  it('ignores stored phases whose own dates are broken', () => {
    const broken = phase({ id: 'broken', startDate: 'soon', endDate: 'later' });
    expect(validatePhase(ownerCut(), [broken])).toEqual([]);
  });

  it('reports a bad range on its own, before length or overlap', () => {
    const inverted = phase({ id: 'inverted', startDate: '2027-12-31', endDate: '2026-11-08' });
    expect(validatePhase(inverted, [ownerCut()])).toEqual(['errorEndBeforeStart']);
  });

  it('reports every applicable issue together', () => {
    const shortAndOverlapping = phase({
      id: 'clash',
      startDate: '2026-12-29',
      endDate: '2026-12-31',
    });
    expect(validatePhase(shortAndOverlapping, [ownerCut()]).sort()).toEqual([
      'errorOverlap',
      'errorTooShort',
    ]);
  });

  it('covers every kind the app offers', () => {
    const kinds: PhaseKind[] = ['cut', 'maintain', 'build'];
    expect(PHASE_KINDS).toEqual(kinds);
    for (const kind of kinds) {
      expect(validatePhase(phase({ id: kind, kind, startDate: '2026-11-08', endDate: '2026-12-31' }), [])).toEqual([]);
    }
  });
});
