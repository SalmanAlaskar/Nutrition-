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
import { layout, radius, spacing, useTheme } from '@/theme';

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

const ITEM_WIDTH = 46;
const GAP = spacing.xs;
const EDGE = layout.gutter;
/** The filled disc behind the selected day's number. */
const DISC = 34;

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

          // No boxes and no accent: three tiers drawn with weight and tone
          // alone. The day you are looking at is ink, today is plain ink type,
          // every other day recedes.
          const numberColor = selected
            ? colors.bg
            : isToday
              ? colors.text
              : colors.textMuted;
          const weekdayColor = selected || isToday ? colors.text : colors.textFaint;
          const dotColor = selected ? colors.bg : colors.textFaint;

          const label = labels.day(key, today);

          return (
            <Pressable
              key={key}
              onPress={() => onSelect(key)}
              accessibilityRole="button"
              accessibilityLabel={hasMeals ? t('dayWithMeals', { day: label }) : label}
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.day, pressed ? styles.pressed : null]}
            >
              <Txt variant="caption" color={weekdayColor} numberOfLines={1}>
                {labels.weekdayInitial(key)}
              </Txt>

              <View
                style={[
                  styles.disc,
                  selected ? { backgroundColor: colors.text } : null,
                ]}
              >
                <Txt
                  variant="body"
                  weight={selected || isToday ? 'semibold' : 'regular'}
                  color={numberColor}
                  tabular
                >
                  {parseDateKey(key).getDate()}
                </Txt>
              </View>

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
    justifyContent: 'center',
    minHeight: layout.minTarget,
    width: ITEM_WIDTH,
  },
  pressed: {
    opacity: 0.55,
  },
  disc: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: DISC,
    justifyContent: 'center',
    marginTop: spacing.xs,
    width: DISC,
  },
  dot: {
    borderRadius: radius.pill,
    height: 4,
    marginTop: spacing.xs,
    width: 4,
  },
  dotHidden: {
    backgroundColor: 'transparent',
  },
});
