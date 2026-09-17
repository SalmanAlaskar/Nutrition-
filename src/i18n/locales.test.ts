/// <reference types="jest" />
import ar from './locales/ar';
import en from './locales/en';

type Dict = Record<string, unknown>;

function paths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value as Dict).flatMap(([key, child]) =>
    paths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('translations', () => {
  const enPaths = paths(en).sort();
  const arPaths = paths(ar).sort();

  it('defines the same keys in both languages', () => {
    const missingInArabic = enPaths.filter((key) => !arPaths.includes(key));
    const missingInEnglish = arPaths.filter((key) => !enPaths.includes(key));
    expect({ missingInArabic, missingInEnglish }).toEqual({
      missingInArabic: [],
      missingInEnglish: [],
    });
  });

  it('has no blank value anywhere', () => {
    const blanks: string[] = [];
    const walk = (value: unknown, prefix: string, lang: string) => {
      if (typeof value === 'string') {
        if (value.trim() === '') blanks.push(`${lang}:${prefix}`);
        return;
      }
      if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value as Dict)) {
          walk(child, prefix ? `${prefix}.${key}` : key, lang);
        }
      }
    };
    walk(en, '', 'en');
    walk(ar, '', 'ar');
    expect(blanks).toEqual([]);
  });

  it('leaves no Arabic value identical to its English original for real copy', () => {
    // Brand names and symbols legitimately match; everything else should differ.
    const allowed = new Set(['units.kcal', 'units.gram', 'units.kg']);
    const shared: string[] = [];
    const walk = (a: unknown, b: unknown, prefix: string) => {
      if (typeof a === 'string' && typeof b === 'string') {
        if (a === b && !allowed.has(prefix) && /[A-Za-z]{3,}/.test(a)) shared.push(prefix);
        return;
      }
      if (a && b && typeof a === 'object' && typeof b === 'object') {
        for (const key of Object.keys(a as Dict)) {
          walk((a as Dict)[key], (b as Dict)[key], prefix ? `${prefix}.${key}` : key);
        }
      }
    };
    walk(en, ar, '');
    expect(shared).toEqual([]);
  });
});
