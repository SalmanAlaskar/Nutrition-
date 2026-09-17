/// <reference types="jest" />
import { macrosForGrams } from '@/domain/nutrition';
import type { FoodItem, Macros } from '@/types';

import { defaultServing, entryFromFood, foodById, popularFoods, searchFoods } from './foodSearch';
import { FOOD_BY_ID, QUICK_ADD_IDS } from './foods';

const PER100: Macros = { calories: 250, protein: 12.4, carbs: 30.2, fat: 8.6, fiber: 2.5 };

const custom = (overrides: Partial<FoodItem> & Pick<FoodItem, 'id' | 'name'>): FoodItem => ({
  category: 'dishes',
  per100: PER100,
  servings: [{ label: '1 portion (200 g)', grams: 200 }],
  ...overrides,
});

describe('searchFoods ranking', () => {
  it('puts an exact name match first', () => {
    const results = searchFoods('banana');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('banana');
    expect(results[0].name).toBe('Banana');
  });

  it('ranks a prefix match above a mid-word substring match', () => {
    // A nonsense token so only these two rows can match, making the order exact.
    const prefix = custom({ id: 'c_prefix', name: 'Zqxil bar' });
    const midWord = custom({ id: 'c_mid', name: 'Bezqxil bar' });
    const results = searchFoods('zqx', { extra: [midWord, prefix] });
    expect(results.map((food) => food.id)).toEqual(['c_prefix', 'c_mid']);
  });

  it('ranks a word-start match above a mid-word one', () => {
    const wordStart = custom({ id: 'c_word', name: 'Plain zqxil bar' });
    const midWord = custom({ id: 'c_mid', name: 'Bezqxil bar' });
    const results = searchFoods('zqx', { extra: [midWord, wordStart] });
    expect(results.map((food) => food.id)).toEqual(['c_word', 'c_mid']);
  });

  it('ranks a name match above an alias-only match', () => {
    const byName = custom({ id: 'c_name', name: 'Zqxil stew' });
    const byAlias = custom({ id: 'c_alias', name: 'Plain stew', aliases: ['zqxil'] });
    const results = searchFoods('zqxil', { extra: [byAlias, byName] });
    expect(results.map((food) => food.id)).toEqual(['c_name', 'c_alias']);
  });

  it('finds a food by its Arabic name', () => {
    const results = searchFoods('أرز');
    expect(results.map((food) => food.id)).toContain('rice_white_cooked');
  });

  it('ignores Arabic short vowels and tatweel', () => {
    const bare = searchFoods('أرز').map((food) => food.id);
    expect(bare).toContain('rice_basmati_cooked');
    // Fatha on the alef, and a tatweel stretching the word, must not matter.
    expect(searchFoods('أَرز').map((food) => food.id)).toEqual(bare);
    expect(searchFoods('أرزـ').map((food) => food.id)).toEqual(bare);
  });

  it('matches a hamza-carrying alef when the query uses a plain alef', () => {
    // Most people type a bare alef. NFD used to strip the alef form apart and
    // leave a combining hamza behind, so these two spellings had to be kept in
    // step deliberately.
    const hamza = searchFoods('أرز').map((food) => food.id);
    const plain = searchFoods('ارز').map((food) => food.id);
    expect(hamza).toContain('rice_white_cooked');
    expect(plain).toEqual(hamza);
    expect(searchFoods('إرز').map((food) => food.id)).toEqual(hamza);
  });

  it('unifies ta marbuta with ha in Arabic queries', () => {
    const marbuta = searchFoods('شوربة').map((food) => food.id);
    expect(marbuta.length).toBeGreaterThan(0);
    expect(searchFoods('شوربه').map((food) => food.id)).toEqual(marbuta);
  });

  it('finds a food by a transliterated alias', () => {
    expect(searchFoods('khubz').map((food) => food.id)).toContain('pita_bread');
    expect(searchFoods('ruz').map((food) => food.id)).toContain('rice_white_cooked');
  });

  it('matches every term of a multi-word query in any order', () => {
    const results = searchFoods('chicken kabsa').map((food) => food.id);
    expect(results).toContain('kabsa_chicken');
  });
});

describe('searchFoods options', () => {
  it('restricts results to the chosen category', () => {
    const all = searchFoods('rice');
    const grains = searchFoods('rice', { category: 'grains' });
    expect(grains.length).toBeGreaterThan(0);
    expect(grains.every((food) => food.category === 'grains')).toBe(true);
    expect(grains.length).toBeLessThan(all.length);

    const dishes = searchFoods('rice', { category: 'dishes' });
    expect(dishes.every((food) => food.category === 'dishes')).toBe(true);
    expect(dishes.map((food) => food.id)).not.toContain('rice_white_cooked');
  });

  it("treats the category 'all' as no filter", () => {
    expect(searchFoods('rice', { category: 'all' })).toEqual(searchFoods('rice'));
  });

  it('searches and ranks extra foods alongside the bundled ones', () => {
    const mine = custom({ id: 'c_banana_bread', name: 'Banana bread slice' });
    const results = searchFoods('banana', { extra: [mine] });
    const ids = results.map((food) => food.id);
    expect(ids).toContain('c_banana_bread');
    expect(ids).toContain('banana');
    // The bundled exact match still outranks the custom prefix match.
    expect(ids[0]).toBe('banana');
    expect(ids.indexOf('c_banana_bread')).toBeGreaterThan(0);
  });

  it('lets an extra food outrank the bundle when it is the stronger match', () => {
    const mine = custom({ id: 'c_exact', name: 'Rice' });
    expect(searchFoods('rice', { extra: [mine] })[0].id).toBe('c_exact');
  });

  it('applies the category filter to extra foods too', () => {
    const mine = custom({ id: 'c_dish', name: 'Rice bowl', category: 'dishes' });
    const grains = searchFoods('rice', { category: 'grains', extra: [mine] });
    expect(grains.map((food) => food.id)).not.toContain('c_dish');
  });

  it('returns popularFoods for an empty or whitespace-only query', () => {
    expect(searchFoods('')).toEqual(popularFoods());
    expect(searchFoods('   ')).toEqual(popularFoods());
    const mine = custom({ id: 'c_mine', name: 'My leftovers' });
    expect(searchFoods('', { extra: [mine] })).toEqual(popularFoods([mine]));
    expect(searchFoods('', { extra: [mine] })[0].id).toBe('c_mine');
  });

  it('honours the limit, on both a query and the empty-query fallback', () => {
    expect(searchFoods('rice', { limit: 2 })).toHaveLength(2);
    expect(searchFoods('rice', { limit: 2 })).toEqual(searchFoods('rice').slice(0, 2));
    expect(searchFoods('', { limit: 3 })).toHaveLength(3);
    expect(searchFoods('rice', { limit: 0 })).toEqual([]);
  });

  it('returns nothing for a query that matches no food', () => {
    expect(searchFoods('qqzzxxjjvv')).toEqual([]);
  });
});

describe('popularFoods', () => {
  it('lists the quick-add staples when there are no custom foods', () => {
    expect(popularFoods().map((food) => food.id)).toEqual(QUICK_ADD_IDS);
  });

  it('leads with the custom foods and never repeats one', () => {
    const mine = custom({ id: 'banana', name: 'My banana' });
    const results = popularFoods([mine]);
    expect(results[0]).toBe(mine);
    expect(results.filter((food) => food.id === 'banana')).toHaveLength(1);
    expect(results).toHaveLength(QUICK_ADD_IDS.length);
  });

  it('caps how many custom foods lead the list', () => {
    const many = Array.from({ length: 25 }, (_, i) => custom({ id: `c${i}`, name: `Custom ${i}` }));
    const results = popularFoods(many);
    expect(results.slice(0, 10)).toEqual(many.slice(0, 10));
    expect(results).toHaveLength(10 + QUICK_ADD_IDS.length);
  });
});

describe('foodById', () => {
  it('finds a bundled food', () => {
    expect(foodById('banana')).toBe(FOOD_BY_ID.banana);
  });

  it('prefers an extra food that shadows a bundled id', () => {
    const mine = custom({ id: 'banana', name: 'My own banana' });
    expect(foodById('banana', [mine])).toBe(mine);
    expect(foodById('banana', [mine])).not.toBe(FOOD_BY_ID.banana);
  });

  it('falls through to the bundle for an id the extras do not hold', () => {
    const mine = custom({ id: 'c_other', name: 'Other' });
    expect(foodById('banana', [mine])).toBe(FOOD_BY_ID.banana);
  });

  it('returns undefined for an unknown id', () => {
    expect(foodById('no_such_food')).toBeUndefined();
    expect(foodById('no_such_food', [])).toBeUndefined();
  });
});

describe('defaultServing', () => {
  it('returns the first listed serving', () => {
    const food = custom({
      id: 'c_serving',
      name: 'Two portions',
      servings: [
        { label: '1 cup (150 g)', grams: 150 },
        { label: '1 bowl (300 g)', grams: 300 },
      ],
    });
    expect(defaultServing(food)).toEqual({ label: '1 cup (150 g)', grams: 150 });
  });

  it('falls back to a flat 100 g for a food with no servings', () => {
    const food = custom({ id: 'c_empty', name: 'No servings', servings: [] });
    expect(defaultServing(food)).toEqual({ label: '100 g', grams: 100 });
  });
});

describe('entryFromFood', () => {
  const food = custom({ id: 'c_entry', name: 'Test dish' });

  it('scales the macros exactly as macrosForGrams would', () => {
    const entry = entryFromFood(food, 175);
    expect(entry.quantityGrams).toBe(175);
    expect(entry.macros).toEqual(macrosForGrams(food.per100, 175));
    expect(entry.macros.fiber).toBe(macrosForGrams(food.per100, 175).fiber);
  });

  it('marks the line as coming from the database and links the food', () => {
    const entry = entryFromFood(food, 100);
    expect(entry.source).toBe('database');
    expect(entry.foodId).toBe('c_entry');
    expect(entry.name).toBe('Test dish');
    expect(entry.id).not.toBe(entryFromFood(food, 100).id);
  });

  it('keeps the serving label only when one is given', () => {
    expect(entryFromFood(food, 200, '1 portion (200 g)').servingLabel).toBe('1 portion (200 g)');
    expect('servingLabel' in entryFromFood(food, 200)).toBe(false);
    expect('servingLabel' in entryFromFood(food, 200, '')).toBe(false);
  });

  it('rounds the quantity to one decimal and clamps a negative to zero', () => {
    expect(entryFromFood(food, 123.456).quantityGrams).toBe(123.5);
    const negative = entryFromFood(food, -50);
    expect(negative.quantityGrams).toBe(0);
    expect(negative.macros).toEqual(macrosForGrams(food.per100, 0));
  });

  it('works for a real bundled food', () => {
    const rice = FOOD_BY_ID.rice_white_cooked;
    const entry = entryFromFood(rice, 160, '1 cup cooked (160 g)');
    expect(entry.macros).toEqual(macrosForGrams(rice.per100, 160));
    expect(entry.macros.calories).toBe(208);
  });
});
