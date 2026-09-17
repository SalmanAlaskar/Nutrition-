/// <reference types="jest" />
import type { Macros, Profile } from '@/types';

import {
  ACTIVITY_FACTORS,
  CALORIES_PER_GRAM,
  EMPTY_MACROS,
  FAT_CALORIE_SHARE,
  GOAL_FACTORS,
  LIMITS,
  MIN_CALORIES,
  PROTEIN_PER_KG,
  addMacros,
  basalMetabolicRate,
  bmiCategory,
  bodyMassIndex,
  caloriesFromMacros,
  calorieTarget,
  cmToFeetInches,
  feetInchesToCm,
  healthyWeightRangeKg,
  isValidProfileInput,
  kgToLb,
  lbToKg,
  macroEnergySplit,
  macroTargets,
  macrosForGrams,
  progress,
  sumMacros,
  totalDailyEnergyExpenditure,
} from './nutrition';

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  sex: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'sedentary',
  goal: 'maintain',
  units: 'metric',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('basalMetabolicRate', () => {
  it('matches Mifflin-St Jeor for a male', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5
    expect(basalMetabolicRate({ sex: 'male', age: 30, heightCm: 180, weightKg: 80 })).toBe(1780);
  });

  it('matches Mifflin-St Jeor for a female', () => {
    // 10*65 + 6.25*165 - 5*28 - 161 = 650 + 1031.25 - 140 - 161 = 1380.25
    expect(basalMetabolicRate({ sex: 'female', age: 28, heightCm: 165, weightKg: 65 })).toBe(1380);
  });

  it('is the male figure minus 166 for identical body measurements', () => {
    const body = { age: 40, heightCm: 172, weightKg: 71 } as const;
    const male = basalMetabolicRate({ ...body, sex: 'male' });
    const female = basalMetabolicRate({ ...body, sex: 'female' });
    expect(male - female).toBe(166);
  });

  it('never goes below zero', () => {
    expect(basalMetabolicRate({ sex: 'female', age: 100, heightCm: 100, weightKg: 30 })).toBe(264);
    expect(basalMetabolicRate({ sex: 'female', age: 0, heightCm: 0, weightKg: 0 })).toBe(0);
  });
});

describe('totalDailyEnergyExpenditure', () => {
  const body = { sex: 'male', age: 30, heightCm: 180, weightKg: 80 } as const;

  it.each([
    ['sedentary', 1.2, 2136],
    ['light', 1.375, 2448],
    ['moderate', 1.55, 2759],
    ['active', 1.725, 3071],
    ['very_active', 1.9, 3382],
  ] as const)('applies the %s multiplier', (level, factor, expected) => {
    expect(ACTIVITY_FACTORS[level]).toBe(factor);
    expect(totalDailyEnergyExpenditure({ ...body, activityLevel: level })).toBe(expected);
    expect(totalDailyEnergyExpenditure({ ...body, activityLevel: level })).toBe(
      Math.round(1780 * factor),
    );
  });
});

describe('calorieTarget', () => {
  it.each([
    ['lose', 0.8],
    ['maintain', 1],
    ['gain', 1.12],
  ] as const)('scales maintenance by the %s goal factor', (goal, factor) => {
    const input = profile({ goal, activityLevel: 'moderate' });
    expect(GOAL_FACTORS[goal]).toBe(factor);
    const maintenance = totalDailyEnergyExpenditure(input);
    expect(calorieTarget(input)).toBe(Math.round(maintenance * factor));
  });

  it('floors a tiny sedentary weight-loss profile at the sex minimum', () => {
    const tiny = profile({
      sex: 'female',
      age: 100,
      heightCm: 100,
      weightKg: 30,
      activityLevel: 'sedentary',
      goal: 'lose',
    });
    // 264 BMR -> 317 maintenance -> 254 after the loss factor, well under the floor.
    expect(Math.round(totalDailyEnergyExpenditure(tiny) * GOAL_FACTORS.lose)).toBeLessThan(
      MIN_CALORIES.female,
    );
    expect(calorieTarget(tiny)).toBe(MIN_CALORIES.female);
    expect(calorieTarget({ ...tiny, sex: 'male' })).toBe(MIN_CALORIES.male);
  });

  it('lets a manual override win over everything else', () => {
    const overridden = profile({ goal: 'lose', customCalorieTarget: 2222 });
    expect(calorieTarget(overridden)).toBe(2222);
    expect(calorieTarget(overridden)).not.toBe(calorieTarget(profile({ goal: 'lose' })));
  });

  it('rounds a fractional override and ignores a non-positive one', () => {
    expect(calorieTarget(profile({ customCalorieTarget: 1999.6 }))).toBe(2000);
    const zeroed = profile({ customCalorieTarget: 0 });
    expect(calorieTarget(zeroed)).toBe(calorieTarget(profile()));
  });
});

describe('macroTargets', () => {
  const cases: Profile[] = [
    profile(),
    profile({ goal: 'lose', sex: 'female', weightKg: 62, heightCm: 166, age: 34 }),
    profile({ goal: 'gain', activityLevel: 'very_active', weightKg: 95 }),
    profile({ activityLevel: 'light', customCalorieTarget: 2600 }),
  ];

  it.each(cases.map((p, i) => [i, p] as const))(
    'reconciles with its own calorie target (case %i)',
    (_index, input) => {
      const targets = macroTargets(input);
      expect(targets.calories).toBe(calorieTarget(input));
      expect(targets.carbs).toBeGreaterThan(0);
      // Only the carbohydrate rounding separates the two figures.
      expect(Math.abs(caloriesFromMacros(targets) - targets.calories)).toBeLessThanOrEqual(3);
    },
  );

  it('sets protein from body weight and fat from the calorie share', () => {
    const input = profile({ goal: 'lose', weightKg: 80 });
    const targets = macroTargets(input);
    expect(targets.protein).toBe(Math.round(PROTEIN_PER_KG.lose * 80));
    expect(targets.fat).toBe(
      Math.round((targets.calories * FAT_CALORIE_SHARE) / CALORIES_PER_GRAM.fat),
    );
  });

  it('never returns negative carbohydrate', () => {
    // A very heavy weight-loss profile makes protein alone eat the whole budget.
    const extreme = profile({ weightKg: 300, customCalorieTarget: 1500, goal: 'lose' });
    expect(macroTargets(extreme).carbs).toBe(0);
  });
});

describe('bodyMassIndex and bmiCategory', () => {
  it('computes BMI to one decimal place', () => {
    expect(bodyMassIndex(180, 80)).toBe(24.7);
    expect(bodyMassIndex(170, 53.465)).toBe(18.5);
    expect(bodyMassIndex(170, 72.25)).toBe(25);
  });

  it('returns 0 for a non-positive height instead of Infinity', () => {
    expect(bodyMassIndex(0, 80)).toBe(0);
    expect(bodyMassIndex(-10, 80)).toBe(0);
  });

  it.each([
    [18.4, 'Underweight'],
    [18.5, 'Healthy'],
    [24.9, 'Healthy'],
    [25, 'Overweight'],
    [29.9, 'Overweight'],
    [30, 'Obese'],
  ] as const)('puts BMI %p in %s', (bmi, expected) => {
    expect(bmiCategory(bmi)).toBe(expected);
  });
});

describe('healthyWeightRangeKg', () => {
  it('spans the 18.5-24.9 band for a height', () => {
    expect(healthyWeightRangeKg(170)).toEqual([53.5, 72]);
    expect(healthyWeightRangeKg(180)).toEqual([59.9, 80.7]);
  });

  it('returns a range whose ends are both classed Healthy', () => {
    for (const heightCm of [155, 165, 175, 185, 195]) {
      const [low, high] = healthyWeightRangeKg(heightCm);
      expect(low).toBeLessThan(high);
      expect(bmiCategory(bodyMassIndex(heightCm, low))).toBe('Healthy');
      expect(bmiCategory(bodyMassIndex(heightCm, high))).toBe('Healthy');
    }
  });
});

describe('unit conversions', () => {
  it('round-trips kilograms through pounds within the rounding tolerance', () => {
    for (let kg = 30; kg <= 300; kg += 0.5) {
      const back = lbToKg(kgToLb(kg));
      expect(Math.abs(back - kg)).toBeLessThanOrEqual(0.1);
    }
  });

  it('converts known weights', () => {
    expect(kgToLb(80)).toBe(176.4);
    expect(lbToKg(176.4)).toBe(80);
    expect(kgToLb(0)).toBe(0);
  });

  it('round-trips centimetres through feet and inches within a centimetre', () => {
    for (let cm = 100; cm <= 230; cm += 1) {
      const { feet, inches } = cmToFeetInches(cm);
      expect(inches).toBeGreaterThanOrEqual(0);
      expect(inches).toBeLessThan(12);
      expect(Math.abs(feetInchesToCm(feet, inches) - cm)).toBeLessThanOrEqual(1);
    }
  });

  it('converts known heights', () => {
    expect(cmToFeetInches(180)).toEqual({ feet: 5, inches: 11 });
    expect(cmToFeetInches(152.4)).toEqual({ feet: 5, inches: 0 });
    expect(feetInchesToCm(6, 0)).toBe(183);
  });
});

describe('macrosForGrams', () => {
  const per100: Macros = { calories: 250, protein: 12.4, carbs: 30.2, fat: 8.6 };

  it('scales and rounds to the app conventions', () => {
    expect(macrosForGrams(per100, 150)).toEqual({
      calories: 375,
      protein: 18.6,
      carbs: 45.3,
      fat: 12.9,
    });
  });

  it('carries optional fields only when the source has them', () => {
    const withFiber = macrosForGrams({ ...per100, fiber: 3 }, 50);
    expect(withFiber.fiber).toBe(1.5);
    expect('sugar' in withFiber).toBe(false);
    expect('sodium' in withFiber).toBe(false);

    const withAll = macrosForGrams({ ...per100, fiber: 3, sugar: 5.5, sodium: 410 }, 200);
    expect(withAll).toEqual({
      calories: 500,
      protein: 24.8,
      carbs: 60.4,
      fat: 17.2,
      fiber: 6,
      sugar: 11,
      sodium: 820,
    });

    const plain = macrosForGrams(per100, 100);
    expect(Object.keys(plain).sort()).toEqual(['calories', 'carbs', 'fat', 'protein']);
  });

  it('treats a negative portion as zero', () => {
    expect(macrosForGrams(per100, -10)).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe('addMacros and sumMacros', () => {
  const a: Macros = { calories: 100, protein: 10.15, carbs: 5.25, fat: 2.05 };
  const b: Macros = { calories: 50, protein: 1.05, carbs: 0.35, fat: 0.15 };

  it('adds the required fields and keeps one decimal', () => {
    expect(addMacros(a, b)).toEqual({ calories: 150, protein: 11.2, carbs: 5.6, fat: 2.2 });
  });

  it('keeps an optional field present on only one side', () => {
    const sum = addMacros({ ...a, fiber: 2 }, { ...b, sodium: 300 });
    expect(sum.fiber).toBe(2);
    expect(sum.sodium).toBe(300);
    expect('sugar' in sum).toBe(false);
  });

  it('adds optional fields present on both sides', () => {
    const sum = addMacros({ ...a, fiber: 2.25, sugar: 1, sodium: 120 }, { ...b, fiber: 1.1, sugar: 0.5, sodium: 80 });
    expect(sum.fiber).toBe(3.4);
    expect(sum.sugar).toBe(1.5);
    expect(sum.sodium).toBe(200);
  });

  it('sums an empty list to a fresh zero macro with no optional fields', () => {
    const empty = sumMacros([]);
    expect(empty).toEqual(EMPTY_MACROS);
    expect(empty).not.toBe(EMPTY_MACROS);
    expect(Object.keys(empty).sort()).toEqual(['calories', 'carbs', 'fat', 'protein']);
  });

  it('does not mutate EMPTY_MACROS across calls', () => {
    sumMacros([{ ...a, fiber: 4 }]);
    expect(EMPTY_MACROS).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(sumMacros([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('sums a mixed list', () => {
    const sum = sumMacros([a, b, { ...a, fiber: 1.5 }]);
    expect(sum.calories).toBe(250);
    expect(sum.fiber).toBe(1.5);
  });
});

describe('caloriesFromMacros and macroEnergySplit', () => {
  it('applies 4/4/9', () => {
    expect(caloriesFromMacros({ protein: 10, carbs: 20, fat: 5 })).toBe(165);
  });

  it('returns shares that sum to 1', () => {
    const split = macroEnergySplit({ calories: 165, protein: 10, carbs: 20, fat: 5 });
    expect(split.protein).toBeCloseTo(40 / 165, 10);
    expect(split.carbs).toBeCloseTo(80 / 165, 10);
    expect(split.fat).toBeCloseTo(45 / 165, 10);
    expect(split.protein + split.carbs + split.fat).toBeCloseTo(1, 10);
  });

  it('returns zeros when there is no energy to split', () => {
    expect(macroEnergySplit(EMPTY_MACROS)).toEqual({ protein: 0, carbs: 0, fat: 0 });
    expect(macroEnergySplit({ calories: 500, protein: 0, carbs: 0, fat: 0 })).toEqual({
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
});

describe('progress', () => {
  it('clamps to 0..1', () => {
    expect(progress(0, 2000)).toBe(0);
    expect(progress(1000, 2000)).toBe(0.5);
    expect(progress(2000, 2000)).toBe(1);
    expect(progress(5000, 2000)).toBe(1);
    expect(progress(-500, 2000)).toBe(0);
  });

  it('returns 0 for a non-positive target instead of dividing by zero', () => {
    expect(progress(100, 0)).toBe(0);
    expect(progress(100, -5)).toBe(0);
  });
});

describe('isValidProfileInput', () => {
  const valid = { age: 30, heightCm: 180, weightKg: 80 };

  it('accepts the exact limits', () => {
    expect(
      isValidProfileInput({
        age: LIMITS.age.min,
        heightCm: LIMITS.heightCm.min,
        weightKg: LIMITS.weightKg.min,
      }),
    ).toBe(true);
    expect(
      isValidProfileInput({
        age: LIMITS.age.max,
        heightCm: LIMITS.heightCm.max,
        weightKg: LIMITS.weightKg.max,
      }),
    ).toBe(true);
  });

  it.each([
    ['age', LIMITS.age.min - 1],
    ['age', LIMITS.age.max + 1],
    ['heightCm', LIMITS.heightCm.min - 1],
    ['heightCm', LIMITS.heightCm.max + 1],
    ['weightKg', LIMITS.weightKg.min - 1],
    ['weightKg', LIMITS.weightKg.max + 1],
  ] as const)('rejects %s = %p, one step outside the limit', (field, value) => {
    expect(isValidProfileInput({ ...valid, [field]: value })).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity])('rejects the non-finite value %p', (value) => {
    expect(isValidProfileInput({ ...valid, age: value })).toBe(false);
    expect(isValidProfileInput({ ...valid, heightCm: value })).toBe(false);
    expect(isValidProfileInput({ ...valid, weightKg: value })).toBe(false);
  });
});
