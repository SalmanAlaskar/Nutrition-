import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Txt } from '@/components/ui';
import { daysBetween, lastNDays, parseDateKey, todayKey } from '@/domain/date';
import { radius, spacing, useTheme } from '@/theme';

import { useDayLabels } from './useDayLabels';

export interface DayStripProps {
  selectedDate: string;
  /** Days that have at least one meal; they get a dot. */
  loggedDates: string[];
  onSelect: (date: string) => void;
  style?: StyleProp<ViewStyle>;
}

/** Two weeks of history plus today. */
const WINDOW_DAYS = 15;
/** Ceiling for the window when the selected day sits far in the past. */
const MAX_DAYS = 120;

const ITEM_WIDTH = 54;
const GAP = spacing.sm;
const EDGE = spacing.lg;

export function DayStrip({ selectedDate, loggedDates, onSelect, style }: DayStripProps) {
  const { colors } = useTheme();
  const { t } = useTranslation('today');
  const labels = useDayLabels();
  const scrollRef = useRef<ScrollView>(null);
  const viewportRef = useRef(0);
  const mountedRef = useRef(false);

  const today = todayKey();

  // A day picked on the History tab can predate the default window, so stretch
  // the strip far enough back to keep the selection reachable.
  const keys = useMemo(() => {
    const end = selectedDate > today ? selectedDate : today;
    const span = Math.min(
      Math.max(daysBetween(selectedDate, end) + 1, WINDOW_DAYS),
      MAX_DAYS,
    );
    return lastNDays(span, end);
  }, [selectedDate, today]);

  const logged = useMemo(() => new Set(loggedDates), [loggedDates]);

  const centerOnSelected = useCallback(
    (animated: boolean) => {
      const index = keys.indexOf(selectedDate);
      const viewport = viewportRef.current;
      if (index < 0 || viewport <= 0) return;

      const stride = ITEM_WIDTH + GAP;
      const content = keys.length * stride - GAP + EDGE * 2;
      const target = EDGE + index * stride + ITEM_WIDTH / 2 - viewport / 2;
      const x = Math.max(0, Math.min(target, Math.max(0, content - viewport)));
      scrollRef.current?.scrollTo({ x, y: 0, animated });
    },
    [keys, selectedDate],
  );

  useEffect(() => {
    centerOnSelected(mountedRef.current);
    mountedRef.current = true;
  }, [centerOnSelected]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      if (width === viewportRef.current) return;
      viewportRef.current = width;
      centerOnSelected(false);
    },
    [centerOnSelected],
  );

  return (
    <View style={style} onLayout={handleLayout}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {keys.map((key) => {
          const selected = key === selectedDate;
          const isToday = key === today;
          const hasMeals = logged.has(key);

          // Three states have to stay apart: the day you are looking at is
          // filled, today keeps an accent outline when you are looking
          // elsewhere, and every other day is a plain surface.
          const background = selected ? colors.accent : colors.surface;
          const border = selected
            ? colors.accent
            : isToday
              ? colors.accent
              : colors.border;
          const weekdayColor = selected
            ? colors.accentText
            : isToday
              ? colors.accent
              : colors.textFaint;
          const numberColor = selected ? colors.accentText : colors.text;
          // On the filled day the dot has to read against the accent, not on it.
          const dotColor = selected ? colors.accentText : colors.accent;

          const label = labels.day(key, today);

          return (
            <Pressable
              key={key}
              onPress={() => onSelect(key)}
              accessibilityRole="button"
              accessibilityLabel={hasMeals ? t('dayWithMeals', { day: label }) : label}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.day,
                {
                  backgroundColor: background,
                  borderColor: border,
                  borderWidth: isToday || selected ? 1.5 : 1,
                },
                pressed ? styles.pressed : null,
              ]}
            >
              <Txt variant="caption" weight="bold" color={weekdayColor}>
                {labels.weekdayInitial(key)}
              </Txt>
              <Txt
                variant="body"
                weight={selected || isToday ? 'bold' : 'medium'}
                color={numberColor}
                tabular
                style={styles.number}
              >
                {parseDateKey(key).getDate()}
              </Txt>
              <View
                style={[
                  styles.dot,
                  hasMeals ? { backgroundColor: dotColor } : styles.dotHidden,
                ]}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    columnGap: GAP,
    paddingHorizontal: EDGE,
    paddingVertical: spacing.xs,
  },
  day: {
    alignItems: 'center',
    borderRadius: radius.lg,
    height: 72,
    justifyContent: 'center',
    width: ITEM_WIDTH,
  },
  pressed: {
    opacity: 0.7,
  },
  number: {
    marginTop: 1,
  },
  dot: {
    borderRadius: radius.pill,
    height: 6,
    marginTop: spacing.xs + 1,
    width: 6,
  },
  dotHidden: {
    backgroundColor: 'transparent',
  },
});
