import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { radius, useTheme } from '@/theme';

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

export interface TrendSparkProps {
  /** Readings oldest first. Fewer than two draws the flat rule instead. */
  values: number[];
  /** Line colour. Defaults to the theme accent. */
  color?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_HEIGHT = 28;
/** Keeps the stroke and the end dot inside the measured box. */
const INSET = 4;

/**
 * The shape of a series, at the size of a line of text.
 *
 * Deliberately unlabelled: the figure beside it already carries the number, so
 * this only has to say which way the readings went. Geometry is left to right
 * in both languages, the way a time axis reads everywhere.
 */
export function TrendSpark({ values, color, height = DEFAULT_HEIGHT, style }: TrendSparkProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  const stroke = color ?? colors.accent;

  // Measured rather than assumed: the tile is a flex child, so its width is
  // only known once it has been laid out, and SVG needs a number.
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => (current === next ? current : next));
  }, []);

  const model = useMemo(() => {
    const clean = values.filter((value) => Number.isFinite(value));
    if (clean.length < 2 || width <= 0) return null;

    const lowest = Math.min(...clean);
    const highest = Math.max(...clean);
    const span = highest - lowest;
    const top = INSET;
    const bottom = height - INSET;
    const usable = bottom - top;
    const step = (width - INSET * 2) / (clean.length - 1);

    const points = clean.map((value, index) => ({
      x: INSET + index * step,
      // A flat series sits on the centre line rather than dividing by zero.
      y: span === 0 ? top + usable / 2 : bottom - ((value - lowest) / span) * usable,
    }));

    return {
      polyline: points.map((point) => `${point.x},${point.y}`).join(' '),
      last: points[points.length - 1],
    };
  }, [values, width, height]);

  const last = model?.last;

  return (
    <View onLayout={handleLayout} style={[styles.box, { height }, style]} {...DECORATIVE}>
      {model && last ? (
        <Svg width={width} height={height}>
          <Polyline
            points={model.polyline}
            fill="none"
            stroke={stroke}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.9}
          />
          <Circle cx={last.x} cy={last.y} r={2.5} fill={stroke} />
        </Svg>
      ) : (
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    justifyContent: 'center',
    width: '100%',
  },
  rule: {
    borderRadius: radius.pill,
    height: 2,
    width: '100%',
  },
});
