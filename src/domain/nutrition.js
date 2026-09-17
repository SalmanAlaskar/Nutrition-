"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIMITS = exports.EMPTY_MACROS = exports.cmToInches = exports.lbToKg = exports.kgToLb = exports.CALORIES_PER_GRAM = exports.FAT_CALORIE_SHARE = exports.PROTEIN_PER_KG = exports.MIN_CALORIES = exports.GOAL_FACTORS = exports.GOAL_LABELS = exports.ACTIVITY_HINTS = exports.ACTIVITY_LABELS = exports.ACTIVITY_FACTORS = void 0;
exports.basalMetabolicRate = basalMetabolicRate;
exports.totalDailyEnergyExpenditure = totalDailyEnergyExpenditure;
exports.calorieTarget = calorieTarget;
exports.macroTargets = macroTargets;
exports.bodyMassIndex = bodyMassIndex;
exports.bmiCategory = bmiCategory;
exports.healthyWeightRangeKg = healthyWeightRangeKg;
exports.cmToFeetInches = cmToFeetInches;
exports.feetInchesToCm = feetInchesToCm;
exports.macrosForGrams = macrosForGrams;
exports.addMacros = addMacros;
exports.sumMacros = sumMacros;
exports.caloriesFromMacros = caloriesFromMacros;
exports.macroEnergySplit = macroEnergySplit;
exports.progress = progress;
exports.isValidProfileInput = isValidProfileInput;
/** Physical Activity Level multipliers applied to BMR. */
exports.ACTIVITY_FACTORS = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
};
exports.ACTIVITY_LABELS = {
    sedentary: 'Sedentary',
    light: 'Lightly active',
    moderate: 'Moderately active',
    active: 'Very active',
    very_active: 'Athlete',
};
exports.ACTIVITY_HINTS = {
    sedentary: 'Desk job, little or no exercise',
    light: 'Light exercise 1-3 days a week',
    moderate: 'Moderate exercise 3-5 days a week',
    active: 'Hard exercise 6-7 days a week',
    very_active: 'Physical job or twice-daily training',
};
exports.GOAL_LABELS = {
    lose: 'Lose weight',
    maintain: 'Maintain weight',
    gain: 'Build muscle',
};
/** Fraction of maintenance calories applied for each goal. */
exports.GOAL_FACTORS = {
    lose: 0.8,
    maintain: 1,
    gain: 1.12,
};
/** Lowest daily calorie target the app will ever suggest, by sex. */
exports.MIN_CALORIES = {
    male: 1500,
    female: 1200,
};
/** Grams of protein per kg of body weight, by goal. */
exports.PROTEIN_PER_KG = {
    lose: 2,
    maintain: 1.6,
    gain: 1.8,
};
/** Share of daily calories that comes from fat. */
exports.FAT_CALORIE_SHARE = 0.27;
exports.CALORIES_PER_GRAM = { protein: 4, carbs: 4, fat: 9 };
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
/**
 * Basal metabolic rate, Mifflin-St Jeor equation.
 * male:   10*kg + 6.25*cm - 5*age + 5
 * female: 10*kg + 6.25*cm - 5*age - 161
 */
function basalMetabolicRate(profile) {
    const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
    const offset = profile.sex === 'male' ? 5 : -161;
    return Math.max(0, Math.round(base + offset));
}
/** Maintenance calories: BMR scaled by the activity factor. */
function totalDailyEnergyExpenditure(profile) {
    return Math.round(basalMetabolicRate(profile) * exports.ACTIVITY_FACTORS[profile.activityLevel]);
}
/**
 * Daily calorie goal. A manual override in the profile wins; otherwise
 * maintenance is scaled by the goal factor and floored at a safe minimum.
 */
function calorieTarget(profile) {
    if (profile.customCalorieTarget && profile.customCalorieTarget > 0) {
        return Math.round(profile.customCalorieTarget);
    }
    const maintenance = totalDailyEnergyExpenditure(profile);
    const adjusted = maintenance * exports.GOAL_FACTORS[profile.goal];
    return Math.round(Math.max(adjusted, exports.MIN_CALORIES[profile.sex]));
}
/**
 * Daily macro goals. Protein is set from body weight, fat takes a fixed share
 * of calories, and carbohydrate absorbs whatever energy is left.
 */
function macroTargets(profile) {
    const calories = calorieTarget(profile);
    const protein = Math.round(exports.PROTEIN_PER_KG[profile.goal] * profile.weightKg);
    const fat = Math.round((calories * exports.FAT_CALORIE_SHARE) / exports.CALORIES_PER_GRAM.fat);
    const proteinCalories = protein * exports.CALORIES_PER_GRAM.protein;
    const fatCalories = fat * exports.CALORIES_PER_GRAM.fat;
    const carbCalories = calories - proteinCalories - fatCalories;
    const carbs = Math.max(0, Math.round(carbCalories / exports.CALORIES_PER_GRAM.carbs));
    return { calories, protein, carbs, fat };
}
function bodyMassIndex(heightCm, weightKg) {
    if (heightCm <= 0)
        return 0;
    const metres = heightCm / 100;
    return Math.round((weightKg / (metres * metres)) * 10) / 10;
}
function bmiCategory(bmi) {
    if (bmi < 18.5)
        return 'Underweight';
    if (bmi < 25)
        return 'Healthy';
    if (bmi < 30)
        return 'Overweight';
    return 'Obese';
}
/** Healthy-weight range for a height, using the 18.5-24.9 BMI band. */
function healthyWeightRangeKg(heightCm) {
    const metres = heightCm / 100;
    const area = metres * metres;
    return [
        Math.round(18.5 * area * 10) / 10,
        Math.round(24.9 * area * 10) / 10,
    ];
}
/* ---------------------------------------------------------------- units -- */
const kgToLb = (kg) => Math.round(kg * 2.20462 * 10) / 10;
exports.kgToLb = kgToLb;
const lbToKg = (lb) => Math.round((lb / 2.20462) * 10) / 10;
exports.lbToKg = lbToKg;
const cmToInches = (cm) => cm / 2.54;
exports.cmToInches = cmToInches;
function cmToFeetInches(cm) {
    const totalInches = Math.round((0, exports.cmToInches)(cm));
    return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}
function feetInchesToCm(feet, inches) {
    return Math.round((feet * 12 + inches) * 2.54);
}
/* -------------------------------------------------------------- macros -- */
const roundTo = (value, places = 1) => {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
};
exports.EMPTY_MACROS = { calories: 0, protein: 0, carbs: 0, fat: 0 };
/** Scale per-100 g nutrients to an arbitrary portion. */
function macrosForGrams(per100, grams) {
    const factor = Math.max(0, grams) / 100;
    const scaled = {
        calories: Math.round(per100.calories * factor),
        protein: roundTo(per100.protein * factor),
        carbs: roundTo(per100.carbs * factor),
        fat: roundTo(per100.fat * factor),
    };
    if (per100.fiber !== undefined)
        scaled.fiber = roundTo(per100.fiber * factor);
    if (per100.sugar !== undefined)
        scaled.sugar = roundTo(per100.sugar * factor);
    if (per100.sodium !== undefined)
        scaled.sodium = Math.round(per100.sodium * factor);
    return scaled;
}
function addMacros(a, b) {
    const sum = {
        calories: a.calories + b.calories,
        protein: roundTo(a.protein + b.protein),
        carbs: roundTo(a.carbs + b.carbs),
        fat: roundTo(a.fat + b.fat),
    };
    if (a.fiber !== undefined || b.fiber !== undefined) {
        sum.fiber = roundTo((a.fiber ?? 0) + (b.fiber ?? 0));
    }
    if (a.sugar !== undefined || b.sugar !== undefined) {
        sum.sugar = roundTo((a.sugar ?? 0) + (b.sugar ?? 0));
    }
    if (a.sodium !== undefined || b.sodium !== undefined) {
        sum.sodium = Math.round((a.sodium ?? 0) + (b.sodium ?? 0));
    }
    return sum;
}
function sumMacros(list) {
    return list.reduce(addMacros, { ...exports.EMPTY_MACROS });
}
/**
 * Calories implied by the macro grams. Used to sanity-check food data and
 * model output, which sometimes disagree with themselves.
 */
function caloriesFromMacros(macros) {
    return Math.round(macros.protein * exports.CALORIES_PER_GRAM.protein +
        macros.carbs * exports.CALORIES_PER_GRAM.carbs +
        macros.fat * exports.CALORIES_PER_GRAM.fat);
}
/** Share of energy coming from each macro, as fractions that sum to ~1. */
function macroEnergySplit(macros) {
    const p = macros.protein * exports.CALORIES_PER_GRAM.protein;
    const c = macros.carbs * exports.CALORIES_PER_GRAM.carbs;
    const f = macros.fat * exports.CALORIES_PER_GRAM.fat;
    const total = p + c + f;
    if (total <= 0)
        return { protein: 0, carbs: 0, fat: 0 };
    return { protein: p / total, carbs: c / total, fat: f / total };
}
/** Progress toward a target, clamped to 0..1 for ring and bar rendering. */
function progress(value, target) {
    if (target <= 0)
        return 0;
    return clamp(value / target, 0, 1);
}
/* ------------------------------------------------------------ validation -- */
exports.LIMITS = {
    age: { min: 13, max: 100 },
    heightCm: { min: 100, max: 230 },
    weightKg: { min: 30, max: 300 },
};
function isValidProfileInput(input) {
    return (Number.isFinite(input.age) &&
        input.age >= exports.LIMITS.age.min &&
        input.age <= exports.LIMITS.age.max &&
        Number.isFinite(input.heightCm) &&
        input.heightCm >= exports.LIMITS.heightCm.min &&
        input.heightCm <= exports.LIMITS.heightCm.max &&
        Number.isFinite(input.weightKg) &&
        input.weightKg >= exports.LIMITS.weightKg.min &&
        input.weightKg <= exports.LIMITS.weightKg.max);
}
