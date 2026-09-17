/**
 * Search over the bundled database plus the user's own custom foods.
 *
 * Every searchable string is normalised once at module load and cached, so a
 * keystroke only costs a scan of pre-lowered strings rather than 300+ fresh
 * allocations. Custom foods get the same treatment, keyed on the array the
 * store hands us, which is replaced whenever the list changes.
 */
import { makeId } from '@/domain/id';
import { macrosForGrams } from '@/domain/nutrition';
import type { FoodCategory, FoodItem, MealEntry, ServingOption } from '@/types';
import { FOOD_BY_ID, FOODS, QUICK_ADD_IDS } from './foods';

export interface SearchOptions {
  limit?: number;
  category?: FoodCategory | 'all';
  /** The user's custom foods, searched alongside the bundled database. */
  extra?: FoodItem[];
}

const DEFAULT_LIMIT = 40;
/** How many of the user's own foods lead the quick-add list. */
const POPULAR_CUSTOM_LIMIT = 10;

const CAN_NORMALIZE = typeof String.prototype.normalize === 'function';

const LATIN_FOLD: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ñ: 'n', ç: 'c', ý: 'y', ÿ: 'y',
};

const COMBINING = /[̀-ͯ]/g;
/**
 * Arabic short vowels, sukun, shadda, the hamza marks NFD leaves behind,
 * superscript alef and tatweel all carry no meaning for search.
 */
const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640]/g;
const LATIN_ACCENTS = /[àáâãäåèéêëìíîïòóôõöùúûüñçýÿ]/g;
const ALEF_FORMS = /[آأإٱ]/g;
const NON_WORD_RUN = /[\s,./()\-_'"+&]+/g;

/** Lowercase, drop accents and Arabic diacritics, unify Arabic letter variants. */
function normalize(text: string): string {
  // Arabic letter variants are unified BEFORE any Unicode decomposition: NFD
  // splits أ into a bare alef plus a combining hamza, after which the
  // alef-form class no longer matches and a plain-alef query misses the word.
  let value = text
    .toLowerCase()
    .replace(ALEF_FORMS, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');

  value = CAN_NORMALIZE
    ? value.normalize('NFD').replace(COMBINING, '')
    : value.replace(LATIN_ACCENTS, (char) => LATIN_FOLD[char] ?? char);

  return value.replace(ARABIC_MARKS, '').replace(NON_WORD_RUN, ' ').trim();
}

interface IndexRow {
  food: FoodItem;
  name: string;
  nameAr: string;
  brand: string;
  aliases: string[];
  /** Cheap tie-breaker: a shorter name is usually the more basic food. */
  length: number;
}

function buildRow(food: FoodItem): IndexRow {
  const aliases: string[] = [];
  if (food.aliases) {
    for (const alias of food.aliases) aliases.push(normalize(alias));
  }
  return {
    food,
    name: normalize(food.name),
    nameAr: food.nameAr ? normalize(food.nameAr) : '',
    brand: food.brand ? normalize(food.brand) : '',
    aliases,
    length: food.name.length,
  };
}

const BASE_INDEX: IndexRow[] = FOODS.map(buildRow);
const EXTRA_INDEX = new WeakMap<FoodItem[], IndexRow[]>();

function indexFor(extra: FoodItem[]): IndexRow[] {
  const cached = EXTRA_INDEX.get(extra);
  if (cached) return cached;
  const rows = extra.map(buildRow);
  EXTRA_INDEX.set(extra, rows);
  return rows;
}

/* Lower tiers win. Name matches outrank alias matches at every strength. */
const TIER_NAME_EXACT = 0;
const TIER_NAME_PREFIX = 1;
const TIER_NAME_WORD = 2;
const TIER_NAME_SUBSTRING = 3;
const TIER_ALIAS_STRONG = 4;
const TIER_ALIAS_WEAK = 5;
const TIER_ALL_TERMS = 6;
const NO_MATCH = 99;

function isBoundary(code: number): boolean {
  // Space is the only separator left after normalisation, but guard the rest.
  return code === 32 || code === 44 || code === 40 || code === 41 || code === 45;
}

/** 0 exact, 1 prefix, 2 word start, 3 anywhere, -1 no match. */
function fieldTier(hay: string, query: string): number {
  if (!hay) return -1;
  if (hay === query) return TIER_NAME_EXACT;
  const index = hay.indexOf(query);
  if (index < 0) return -1;
  if (index === 0) return TIER_NAME_PREFIX;
  return isBoundary(hay.charCodeAt(index - 1)) ? TIER_NAME_WORD : TIER_NAME_SUBSTRING;
}

function rowTier(row: IndexRow, query: string, terms: string[]): number {
  let best = NO_MATCH;

  const nameTier = fieldTier(row.name, query);
  if (nameTier === TIER_NAME_EXACT) return TIER_NAME_EXACT;
  if (nameTier >= 0) best = nameTier;

  const arabicTier = fieldTier(row.nameAr, query);
  if (arabicTier === TIER_NAME_EXACT) return TIER_NAME_EXACT;
  if (arabicTier >= 0 && arabicTier < best) best = arabicTier;

  if (best <= TIER_NAME_PREFIX) return best;

  for (let i = 0; i < row.aliases.length; i += 1) {
    const tier = fieldTier(row.aliases[i], query);
    if (tier < 0) continue;
    const mapped = tier <= TIER_NAME_PREFIX ? TIER_ALIAS_STRONG : TIER_ALIAS_WEAK;
    if (mapped < best) best = mapped;
    if (best === TIER_ALIAS_STRONG) break;
  }

  if (best === NO_MATCH && row.brand && row.brand.indexOf(query) >= 0) {
    best = TIER_ALIAS_WEAK;
  }

  // "chicken kabsa" should still find "Kabsa with chicken".
  if (best === NO_MATCH && terms.length > 1 && matchesEveryTerm(row, terms)) {
    best = TIER_ALL_TERMS;
  }

  return best;
}

function matchesEveryTerm(row: IndexRow, terms: string[]): boolean {
  for (let i = 0; i < terms.length; i += 1) {
    const term = terms[i];
    if (row.name.indexOf(term) >= 0) continue;
    if (row.nameAr && row.nameAr.indexOf(term) >= 0) continue;
    let found = false;
    for (let j = 0; j < row.aliases.length; j += 1) {
      if (row.aliases[j].indexOf(term) >= 0) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

interface Match {
  row: IndexRow;
  tier: number;
}

function compareMatches(a: Match, b: Match): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.row.length !== b.row.length) return a.row.length - b.row.length;
  return a.row.name < b.row.name ? -1 : a.row.name > b.row.name ? 1 : 0;
}

function collect(
  rows: IndexRow[],
  query: string,
  terms: string[],
  category: FoodCategory | 'all',
  out: Match[],
): void {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (category !== 'all' && row.food.category !== category) continue;
    const tier = rowTier(row, query, terms);
    if (tier !== NO_MATCH) out.push({ row, tier });
  }
}

/**
 * Ranked search across the bundled foods and any custom foods passed in.
 * An empty query falls back to the quick-add list.
 */
export function searchFoods(query: string, options: SearchOptions = {}): FoodItem[] {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const category = options.category ?? 'all';
  const extra = options.extra;
  const normalized = normalize(query);

  if (!normalized) {
    const popular = popularFoods(extra);
    const filtered =
      category === 'all'
        ? popular
        : popular.filter((food) => food.category === category);
    return filtered.slice(0, limit);
  }

  const terms = normalized.indexOf(' ') >= 0 ? normalized.split(' ') : [normalized];
  const matches: Match[] = [];
  if (extra && extra.length > 0) {
    collect(indexFor(extra), normalized, terms, category, matches);
  }
  collect(BASE_INDEX, normalized, terms, category, matches);
  matches.sort(compareMatches);

  const count = Math.min(limit, matches.length);
  const results: FoodItem[] = new Array<FoodItem>(count);
  for (let i = 0; i < count; i += 1) results[i] = matches[i].row.food;
  return results;
}

/** Quick-add suggestions: the user's own foods first, then the staples. */
export function popularFoods(extra?: FoodItem[]): FoodItem[] {
  const results: FoodItem[] = [];
  const seen = new Set<string>();

  if (extra) {
    const take = Math.min(extra.length, POPULAR_CUSTOM_LIMIT);
    for (let i = 0; i < take; i += 1) {
      const food = extra[i];
      if (seen.has(food.id)) continue;
      seen.add(food.id);
      results.push(food);
    }
  }

  for (let i = 0; i < QUICK_ADD_IDS.length; i += 1) {
    const food = FOOD_BY_ID[QUICK_ADD_IDS[i]];
    if (!food || seen.has(food.id)) continue;
    seen.add(food.id);
    results.push(food);
  }

  return results;
}

export function foodById(id: string, extra?: FoodItem[]): FoodItem | undefined {
  if (extra) {
    for (let i = 0; i < extra.length; i += 1) {
      if (extra[i].id === id) return extra[i];
    }
  }
  return FOOD_BY_ID[id];
}

/** The portion the UI selects first; falls back to a flat 100 g. */
export function defaultServing(food: FoodItem): ServingOption {
  const first = food.servings[0];
  return first ?? { label: '100 g', grams: 100 };
}

/** Build a meal line from a database food and a portion size in grams. */
export function entryFromFood(
  food: FoodItem,
  grams: number,
  servingLabel?: string,
): MealEntry {
  const quantityGrams = Math.max(0, Math.round(grams * 10) / 10);
  const entry: MealEntry = {
    id: makeId('e'),
    foodId: food.id,
    name: food.name,
    quantityGrams,
    macros: macrosForGrams(food.per100, quantityGrams),
    source: 'database',
  };
  if (servingLabel) entry.servingLabel = servingLabel;
  return entry;
}
