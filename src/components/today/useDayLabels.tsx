import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { addDays, parseDateKey, todayKey, type DateKey } from '@/domain/date';

/**
 * Day and time labels in the reader's language.
 *
 * The helpers in `@/domain/date` return English words, which is right for keys
 * and comparisons and wrong for anything on screen. This turns a date key into
 * the words the day is actually called, with Western digits in both languages.
 */
export interface DayLabels {
  /** 'Today', 'Yesterday', 'Tomorrow', or 'Sun, 14 Sep'. */
  day(key: DateKey, todayOverride?: DateKey): string;
  /** The day and month alone, e.g. '14 Sep'. */
  shortDay(key: DateKey): string;
  /** One character for the day strip. */
  weekdayInitial(key: DateKey): string;
  /** Clock time of an ISO timestamp, or '' when it cannot be read. */
  time(iso: string): string;
}

const WEEKDAY_KEYS = [
  'today:weekdaySun',
  'today:weekdayMon',
  'today:weekdayTue',
  'today:weekdayWed',
  'today:weekdayThu',
  'today:weekdayFri',
  'today:weekdaySat',
] as const;

const INITIAL_KEYS = [
  'today:initialSun',
  'today:initialMon',
  'today:initialTue',
  'today:initialWed',
  'today:initialThu',
  'today:initialFri',
  'today:initialSat',
] as const;

const MONTH_KEYS = [
  'today:monthJan',
  'today:monthFeb',
  'today:monthMar',
  'today:monthApr',
  'today:monthMay',
  'today:monthJun',
  'today:monthJul',
  'today:monthAug',
  'today:monthSep',
  'today:monthOct',
  'today:monthNov',
  'today:monthDec',
] as const;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function useDayLabels(): DayLabels {
  const { t } = useTranslation(['today', 'common']);

  return useMemo<DayLabels>(() => {
    const shortDay = (key: DateKey): string => {
      const date = parseDateKey(key);
      return `${date.getDate()} ${t(MONTH_KEYS[date.getMonth()])}`;
    };

    return {
      shortDay,
      day(key, todayOverride) {
        const today = todayOverride ?? todayKey();
        if (key === today) return t('common:today');
        if (key === addDays(today, -1)) return t('common:yesterday');
        if (key === addDays(today, 1)) return t('common:tomorrow');
        const date = parseDateKey(key);
        return t('today:dateLong', {
          weekday: t(WEEKDAY_KEYS[date.getDay()]),
          day: date.getDate(),
          month: t(MONTH_KEYS[date.getMonth()]),
        });
      },
      weekdayInitial(key) {
        return t(INITIAL_KEYS[parseDateKey(key).getDay()]);
      },
      time(iso) {
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '';
        const hours = date.getHours();
        const display = hours % 12 === 0 ? 12 : hours % 12;
        const suffix = hours >= 12 ? t('today:timePm') : t('today:timeAm');
        return `${display}:${pad(date.getMinutes())} ${suffix}`;
      },
    };
  }, [t]);
}
