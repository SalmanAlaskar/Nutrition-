import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Txt } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';
import type { SessionType } from '@/types';

import { useTrainingText } from './useTrainingText';

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

export interface WeekStripDay {
  /** Local calendar day, 'YYYY-MM-DD'. */
  date: string;
  /** What the program schedules that day, or null on a rest day. */
  type: SessionType | null;
  /** A session was logged and finished on that day. */
  completed: boolean;
}

export interface WeekStripProps {
  /** Seven days, Sunday first. */
  days: WeekStripDay[];
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * The training week at a glance. No colour carries meaning here: the selected
 * day is a tone, today is the one day set in ink, and a finished day keeps a
 * small mark under it. That leaves the screen's single accent for the action.
 */
export function WeekStrip({ days, selectedDate, today, onSelect, style }: WeekStripProps) {
  const { colors } = useTheme();
  const { t } = useTranslation('training');
  const text = useTrainingText();

  return (
    <View style={[styles.row, style]}>
      {days.map((day) => {
        const selected = day.date === selectedDate;
        const isToday = day.date === today;
        const typeLabel = day.type ? text.type(day.type) : t('rest');
        const spoken = day.completed
          ? t('spokenDayDone', { date: text.date(day.date, today), type: typeLabel })
          : t('spokenDay', { date: text.date(day.date, today), type: typeLabel });

        return (
          <Pressable
            key={day.date}
            onPress={() => onSelect(day.date)}
            accessibilityRole="button"
            accessibilityLabel={spoken}
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.day,
              selected ? { backgroundColor: colors.surfaceAlt } : null,
              pressed && !selected ? { backgroundColor: colors.surface } : null,
            ]}
          >
            <Txt
              variant="caption"
              weight={isToday ? 'bold' : 'medium'}
              color={isToday || selected ? 'text' : 'faint'}
            >
              {text.weekdayLetter(day.date)}
            </Txt>
            <Txt
              variant="caption"
              weight={selected ? 'semibold' : 'regular'}
              color={day.type ? (selected ? 'text' : 'muted') : 'faint'}
              numberOfLines={1}
              align="center"
              style={styles.type}
            >
              {typeLabel}
            </Txt>
            {/* The mark keeps its height on every day, so the row never jumps. */}
            <View style={styles.mark} {...DECORATIVE}>
              {day.completed ? <View style={[styles.dot, { backgroundColor: colors.text }]} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    columnGap: spacing.xs,
    flexDirection: 'row',
  },
  day: {
    alignItems: 'center',
    borderRadius: radius.md,
    flex: 1,
    flexBasis: 0,
    justifyContent: 'center',
    minHeight: 64,
    paddingHorizontal: 2,
    paddingVertical: spacing.sm,
  },
  type: {
    marginTop: 5,
    width: '100%',
  },
  mark: {
    alignItems: 'center',
    height: 5,
    justifyContent: 'center',
    marginTop: 6,
  },
  dot: {
    borderRadius: radius.pill,
    height: 5,
    width: 5,
  },
});
