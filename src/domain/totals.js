"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SLOT_ICONS = exports.SLOT_LABELS = exports.MEAL_SLOTS = void 0;
exports.mealMacros = mealMacros;
exports.totalMacros = totalMacros;
exports.mealsBySlot = mealsBySlot;
exports.dailyTotals = dailyTotals;
exports.remainingBudget = remainingBudget;
exports.averageCalories = averageCalories;
exports.loggingStreak = loggingStreak;
const nutrition_1 = require("./nutrition");
exports.MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
exports.SLOT_LABELS = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snacks',
};
exports.SLOT_ICONS = {
    breakfast: 'sunrise',
    lunch: 'sun',
    dinner: 'moon',
    snack: 'cookie',
};
/** Nutrients for every entry in one meal. */
function mealMacros(meal) {
    return (0, nutrition_1.sumMacros)(meal.entries.map((entry) => entry.macros));
}
/** Nutrients across a list of meals. */
function totalMacros(meals) {
    return meals.reduce((acc, meal) => (0, nutrition_1.addMacros)(acc, mealMacros(meal)), { ...nutrition_1.EMPTY_MACROS });
}
function mealsBySlot(meals) {
    const grouped = {
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: [],
    };
    for (const meal of meals) {
        const slot = grouped[meal.slot] ? meal.slot : 'snack';
        grouped[slot].push(meal);
    }
    return grouped;
}
function dailyTotals(date, meals) {
    const grouped = mealsBySlot(meals);
    return {
        date,
        macros: totalMacros(meals),
        mealCount: meals.length,
        entryCount: meals.reduce((count, meal) => count + meal.entries.length, 0),
        bySlot: {
            breakfast: totalMacros(grouped.breakfast),
            lunch: totalMacros(grouped.lunch),
            dinner: totalMacros(grouped.dinner),
            snack: totalMacros(grouped.snack),
        },
    };
}
/** What is left of the day's goals. Values go negative once exceeded. */
function remainingBudget(consumed, targets) {
    const calories = Math.round(targets.calories - consumed.calories);
    return {
        calories,
        protein: Math.round(targets.protein - consumed.protein),
        carbs: Math.round(targets.carbs - consumed.carbs),
        fat: Math.round(targets.fat - consumed.fat),
        overTarget: calories < 0,
    };
}
/** Mean daily calories over the supplied days, ignoring days with no meals. */
function averageCalories(mealsByDate) {
    const days = Object.values(mealsByDate).filter((meals) => meals.length > 0);
    if (days.length === 0)
        return 0;
    const total = days.reduce((sum, meals) => sum + totalMacros(meals).calories, 0);
    return Math.round(total / days.length);
}
/** Longest run of consecutive logged days ending on the most recent day. */
function loggingStreak(dates, today) {
    const logged = new Set(dates);
    let streak = 0;
    const cursor = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
    const pad = (n) => String(n).padStart(2, '0');
    const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (!logged.has(key(cursor)))
        cursor.setDate(cursor.getDate() - 1);
    while (logged.has(key(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}
