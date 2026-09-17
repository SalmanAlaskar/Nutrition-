import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { useTheme } from '@/theme';

export interface ProgressRingProps {
  size: number;
  strokeWidth: number;
  /** 0..1; values outside the range are clamped. */
  progress: number;
  color: string;
  trackColor?: string;
  /** Centred inside the ring, e.g. a calorie count. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ProgressRing({
  size,
  strokeWidth,
  progress,
  color,
  trackColor,
  children,
  style,
}: ProgressRingProps) {
  const { colors } = useTheme();

  const value = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const center = size / 2;
  const r = Math.max((size - strokeWidth) / 2, 0);
  const circumference = 2 * Math.PI * r;
  const filled = circumference * value;

  return (
    <View
      style={[{ height: size, width: size }, style]}
      accessibilityRole={children ? undefined : 'progressbar'}
      accessibilityValue={
        children ? undefined : { min: 0, max: 100, now: Math.round(value * 100) }
      }
    >
      <Svg width={size} height={size}>
        {/* Rotated so the arc grows clockwise from 12 o'clock. */}
        {/* An explicit transform string: rotation/originX emit a kebab-case
            transform-origin that React DOM rejects on the web build. */}
        <G transform={`rotate(-90 ${center} ${center})`}>
          <Circle
            cx={center}
            cy={center}
            r={r}
            stroke={trackColor ?? colors.track}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {value > 0 ? (
            <Circle
              cx={center}
              cy={center}
              r={r}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${Math.max(circumference - filled, 0)}`}
              fill="none"
            />
          ) : null}
        </G>
      </Svg>

      {children ? (
        <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
});
