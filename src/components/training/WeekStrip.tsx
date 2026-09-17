import { Ionicons } from '@expo/vector-icons';
import React from 'react';
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
import { formatDayLabel, weekdayInitial } from '@/domain/date';
import { SESSION_LABELS } from '@/domain/training';
import { radius, spacing, useTheme } from '@/theme';
import type { SessionType } from '@/types';

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

const REST_LABEL = 'Rest';

/** The training week at a glance: what each day holds and what is already done. */
export function WeekStrip({ days, selectedDate, today, onSelect, style }: WeekStripProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.row, style]}>
      {days.map((day) => {
        const selected = day.date === selectedDate;
        const isToday = day.date === today;
        const typeLabel = day.type ? SESSION_LABELS[day.type] : REST_LABEL;

        const background = selected ? colors.accent : colors.surface;
        const border = selected || isToday ? colors.accent : colors.border;
        const initialColor = selected
          ? colors.accentText
          : isToday
            ? colors.accent
            : colors.textFaint;
        const typeColor = selected
          ? colors.accentText
          : day.type
            ? colors.text
            : colors.textFaint;
        // On the filled day the tick has to read against the accent, not on it.
        const tickColor = selected ? colors.accentText : colors.success;

        const spoken = [
          formatDayLabel(day.date, today),
          typeLabel,
          day.completed ? 'completed' : null,
        ]
          .filter((part): part is string => Boolean(part))
          .join(', ');

        return (
          <Pressable
            key={day.date}
            onPress={() => onSelect(day.date)}
            accessibilityRole="button"
            accessibilityLabel={spoken}
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.day,
              {
                backgroundColor: background,
                borderColor: border,
                borderWidth: selected || isToday ? 1.5 : 1,
              },
              pressed ? styles.pressed : null,
            ]}
          >
            <Txt variant="caption" weight="bold" color={initialColor}>
              {weekdayInitial(day.date)}
            </Txt>
            <Txt
              variant="caption"
              weight={day.type ? 'semibold' : 'medium'}
              color={typeColor}
              numberOfLines={1}
              style={styles.type}
            >
              {typeLabel}
            </Txt>
            <View style={styles.tick} {...DECORATIVE}>
              {day.completed ? (
                <Ionicons name="checkmark-circle" size={13} color={tickColor} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    columnGap: spacing.xs + 2,
    flexDirection: 'row',
  },
  day: {
    alignItems: 'center',
    borderRadius: radius.md,
    flex: 1,
    flexBasis: 0,
    justifyContent: 'center',
    minHeight: 68,
    paddingHorizontal: 2,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  type: {
    letterSpacing: 0,
    marginTop: 3,
  },
  tick: {
    alignItems: 'center',
    height: 15,
    justifyContent: 'center',
    marginTop: 2,
  },
});
