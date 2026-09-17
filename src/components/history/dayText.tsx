import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { addDays, parseDateKey, todayKey } from '@/domain/date';

/**
 * Calendar labels in the reader's language.
 *
 * The date helpers in the domain layer format in English on purpose: they are
 * pure and testable. Anything a person reads goes through here instead, which
 * resolves the month and weekday names from the history namespace. The history
 * screen and the profile screen both print dates, so the hook is shared rather
 * than copied into each one.
 */

const MONTH_KEYS = [
  'monthJan',
  'monthFeb',
  'monthMar',
  'monthApr',
  'monthMay',
  'monthJun',
  'monthJul',
  'monthAug',
  'monthSep',
  'monthOct',
  'monthNov',
  'monthDec',
] as const;

const WEEKDAY_KEYS = [
  'weekdaySun',
  'weekdayMon',
  'weekdayTue',
  'weekdayWed',
  'weekdayThu',
  'weekdayFri',
  'weekdaySat',
] as const;

const INITIAL_KEYS = [
  'initialSun',
  'initialMon',
  'initialTue',
  'initialWed',
  'initialThu',
  'initialFri',
  'initialSat',
] as const;

export interface DayText {
  /** Today, Yesterday, Tomorrow, or the weekday with the date. */
  dayLabel(date: string, todayOverride?: string): string;
  /** Day and month only, e.g. 14 Sep. */
  shortDay(date: string): string;
  /** A single letter for a chart axis. */
  initial(date: string): string;
}

export function useDayText(): DayText {
  const { t } = useTranslation(['history', 'common']);

  return useMemo<DayText>(() => {
    const shortDay = (date: string) => {
      const parsed = parseDateKey(date);
      return `${parsed.getDate()} ${t(MONTH_KEYS[parsed.getMonth()] ?? 'monthJan')}`;
    };

    return {
      shortDay,
      initial: (date) => t(INITIAL_KEYS[parseDateKey(date).getDay()] ?? 'initialSun'),
      dayLabel: (date, todayOverride) => {
        const today = todayOverride ?? todayKey();
        if (date === today) return t('common:today');
        if (date === addDays(today, -1)) return t('common:yesterday');
        if (date === addDays(today, 1)) return t('common:tomorrow');
        return t('dateWithWeekday', {
          weekday: t(WEEKDAY_KEYS[parseDateKey(date).getDay()] ?? 'weekdaySun'),
          date: shortDay(date),
        });
      },
    };
  }, [t]);
}
