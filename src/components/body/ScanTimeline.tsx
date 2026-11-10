import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Txt } from '@/components/ui';
import { daysBetween } from '@/domain/date';
import { formatAmount } from '@/domain/format';
import { layout, radius, useTheme } from '@/theme';
import type { BodyScan } from '@/types';

import { useScanDate } from './useScanDate';

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

const HEIGHT = 64;
/** The dot row is the tap target, full height; the date label sits under it. */
const ROW = layout.minTarget;
const RAIL = 1;
const DOT = 7;
const DOT_SELECTED = 11;
/** The soft disc the selected dot sits on. */
const RING = 22;
const LABEL_WIDTH = 64;
/** Half a label, so neither end label runs past the edge it is centred on. */
const EDGE = LABEL_WIDTH / 2;
/** Two labels closer together than their own width touch, so one of them goes. */
const LABEL_GAP = LABEL_WIDTH + 4;

interface Node {
  scan: BodyScan;
  /** Centre of the node, measured from the start edge. */
  x: number;
}

export interface ScanTimelineProps {
  /** Readings oldest first. At least one. */
  scans: BodyScan[];
  selectedId: string;
  onSelect: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * The rail the page moves along: every reading as a dot, placed by the day it
 * was taken rather than by its turn in the list. Five months of nothing has to
 * look like five months of nothing — that gap is the reading the chart cannot
 * print.
 */
export function ScanTimeline({ scans, selectedId, onSelect, style }: ScanTimelineProps) {
  const { t } = useTranslation(['profile', 'units']);
  const { colors } = useTheme();
  const { dayLabel, shortDay } = useScanDate();
  const [width, setWidth] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => (current === next ? current : next));
  }, []);

  const usable = Math.max(0, width - EDGE * 2);

  const nodes = useMemo<Node[]>(() => {
    const first = scans[0];
    const last = scans[scans.length - 1];
    if (!first || !last) return [];
    if (scans.length === 1) return [{ scan: first, x: width / 2 }];

    const span = Math.max(0, width - EDGE * 2);
    const totalDays = daysBetween(first.date, last.date);

    const placed = scans.map((scan, index) => {
      // Readings from a single day have no spacing of their own to show, so
      // they share the rail evenly instead of stacking on one point.
      const fraction =
        totalDays === 0
          ? index / (scans.length - 1)
          : Math.min(1, Math.max(0, daysBetween(first.date, scan.date) / totalDays));
      return { scan, x: EDGE + fraction * span };
    });

    /*
      Two readings a few days apart on a narrow phone land within a finger of
      each other, and two taken on the same day land on the same point — the
      one drawn first then sits under the other and can never be tapped. Dates
      decide the spacing, but a reading that cannot be reached is worse than a
      gap drawn slightly wide, so each node is pushed to at least a tap target
      from the one before it and the whole run is slid back inside the rail.
    */
    const minGap = ROW;
    for (let i = 1; i < placed.length; i += 1) {
      const previous = placed[i - 1];
      const node = placed[i];
      if (previous && node && node.x - previous.x < minGap) node.x = previous.x + minGap;
    }
    const last_ = placed[placed.length - 1];
    const overflow = last_ ? last_.x - (EDGE + span) : 0;
    if (overflow > 0) {
      const shift = Math.min(overflow, EDGE + span);
      placed.forEach((node) => {
        node.x = Math.max(EDGE, node.x - shift);
      });
      // Shifting can re-collide at the start edge; one more forward pass is
      // enough because every gap is already at least minGap behind it.
      for (let i = 1; i < placed.length; i += 1) {
        const previous = placed[i - 1];
        const node = placed[i];
        if (previous && node && node.x - previous.x < minGap) node.x = previous.x + minGap;
      }
    }

    return placed;
  }, [scans, width]);

  const labelled = useMemo(() => {
    // Weighed in this order and dropped on collision, so the selected reading
    // always keeps its label, the two ends anchor the span, and the rest fill
    // whatever room is left.
    const order: number[] = [];
    const add = (index: number) => {
      if (index >= 0 && index < nodes.length && !order.includes(index)) order.push(index);
    };
    add(nodes.findIndex((node) => node.scan.id === selectedId));
    add(0);
    add(nodes.length - 1);
    nodes.forEach((_, index) => add(index));

    const taken: number[] = [];
    const ids = new Set<string>();
    for (const index of order) {
      const node = nodes[index];
      if (!node) continue;
      if (taken.some((at) => Math.abs(at - node.x) < LABEL_GAP)) continue;
      taken.push(node.x);
      ids.add(node.scan.id);
    }
    return ids;
  }, [nodes, selectedId]);

  const handlePress = useCallback(
    (id: string) => {
      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
      onSelect(id);
    },
    [onSelect],
  );

  const kg = t('units:kg');

  /*
    The rail is pinned left to right in both languages.

    It is a value axis — days — and the app's other two, the range bars and the
    trend chart, both read left to right whatever the page direction is, as do
    the Western digits on all three. Letting this one alone mirror would put
    the oldest reading on the right here and on the left in the chart directly
    below it. Declaring the direction once also keeps the web and native builds
    the same: `start` is resolved against the page on one and against the
    layout engine on the other, and this is the one place that difference would
    show.
  */
  return (
    <View onLayout={handleLayout} style={[styles.wrap, style]}>
      {width > 0 ? (
        <>
          {/* The rail, the dots and the dates are the drawing around the
              buttons: read as well, a screen reader would announce every
              reading twice. */}
          <View style={[StyleSheet.absoluteFill, styles.decoration]} {...DECORATIVE}>
            {nodes.length > 1 ? (
              <View
                style={[styles.rail, { backgroundColor: colors.border, start: EDGE, width: usable }]}
              />
            ) : null}

            {nodes.map((node) => {
              if (!labelled.has(node.scan.id)) return null;
              const selected = node.scan.id === selectedId;
              return (
                <Txt
                  key={node.scan.id}
                  variant="caption"
                  color={selected ? 'text' : 'faint'}
                  weight={selected ? 'semibold' : 'medium'}
                  align="center"
                  numberOfLines={1}
                  style={[styles.label, { start: node.x - LABEL_WIDTH / 2 }]}
                >
                  {shortDay(node.scan.date)}
                </Txt>
              );
            })}
          </View>

          {nodes.map((node) => {
            const selected = node.scan.id === selectedId;
            const size = selected ? DOT_SELECTED : DOT;
            return (
              <Pressable
                key={node.scan.id}
                onPress={() => handlePress(node.scan.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={t('profile:timelineSpoken', {
                  day: dayLabel(node.scan.date),
                  value: `${formatAmount(node.scan.weightKg, 1)} ${kg}`,
                })}
                style={({ pressed }) => [
                  styles.node,
                  { start: node.x - ROW / 2 },
                  pressed ? styles.pressed : null,
                ]}
              >
                <View style={[styles.ring, selected ? { backgroundColor: colors.accentSoft } : null]}>
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: selected ? colors.accent : colors.borderStrong,
                        height: size,
                        width: size,
                      },
                    ]}
                  />
                </View>
              </Pressable>
            );
          })}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    direction: 'ltr',
    height: HEIGHT,
    width: '100%',
  },
  decoration: {
    pointerEvents: 'none',
  },
  rail: {
    height: RAIL,
    position: 'absolute',
    top: (ROW - RAIL) / 2,
  },
  label: {
    position: 'absolute',
    top: ROW + 2,
    width: LABEL_WIDTH,
  },
  node: {
    alignItems: 'center',
    height: ROW,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    width: ROW,
  },
  pressed: {
    opacity: 0.6,
  },
  ring: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: RING,
    justifyContent: 'center',
    width: RING,
  },
  dot: {
    borderRadius: radius.pill,
  },
});
