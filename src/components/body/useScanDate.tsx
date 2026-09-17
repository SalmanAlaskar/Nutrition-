import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { addDays, parseDateKey, todayKey, type DateKey } from '@/domain/date';
import { formatCount } from '@/domain/format';

/** Month and weekday names live in the body namespace, in both languages. */
const MONTH_KEYS = [
  'body:monthJan',
  'body:monthFeb',
  'body:monthMar',
  'body:monthApr',
  'body:monthMay',
  'body:monthJun',
  'body:monthJul',
  'body:monthAug',
  'body:monthSep',
  'body:monthOct',
  'body:monthNov',
  'body:monthDec',
] as const;

/** Sunday first, the way the week runs here. */
const WEEKDAY_KEYS = [
  'body:weekdaySun',
  'body:weekdayMon',
  'body:weekdayTue',
  'body:weekdayWed',
  'body:weekdayThu',
  'body:weekdayFri',
  'body:weekdaySat',
] as const;

export interface ScanDateFormatters {
  /** 'Today', otherwise 'Sun, 12 May'. */
  dayLabel(date: DateKey): string;
  /** '12 May', for a chart axis or a span between two readings. */
  shortDay(date: DateKey): string;
}

/**
 * Dates in the reader's language, with Western digits in both. Kept here rather
 * than in `domain/date`, which has no access to the translations.
 */
export function useScanDate(): ScanDateFormatters {
  const { t } = useTranslation(['body', 'common']);

  return useMemo<ScanDateFormatters>(() => {
    const today = todayKey();

    const shortDay = (date: DateKey): string => {
      const at = parseDateKey(date);
      return `${formatCount(at.getDate())} ${t(MONTH_KEYS[at.getMonth()] ?? 'body:monthJan')}`;
    };

    const dayLabel = (date: DateKey): string => {
      if (date === today) return t('common:today');
      if (date === addDays(today, -1)) return t('common:yesterday');
      if (date === addDays(today, 1)) return t('common:tomorrow');
      const at = parseDateKey(date);
      return t('body:dateFull', {
        weekday: t(WEEKDAY_KEYS[at.getDay()] ?? 'body:weekdaySun'),
        day: formatCount(at.getDate()),
        month: t(MONTH_KEYS[at.getMonth()] ?? 'body:monthJan'),
      });
    };

    return { dayLabel, shortDay };
  }, [t]);
}
