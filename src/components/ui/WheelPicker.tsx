import * as Haptics from 'expo-haptics';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type AccessibilityProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { formatAmount } from '@/domain/format';
import { useDirection } from '@/i18n';
import { fontSize, radius, spacing, useTheme } from '@/theme';

import { Txt } from './Txt';

export interface WheelPickerProps {
  /** Ascending, already stepped, and never empty. */
  values: number[];
  /** `null` selects nothing and centres on the middle of the list. */
  value: number | null;
  onChange: (value: number) => void;
  /** Rendered under each number, e.g. 'kg'. Shown once beside the centre row. */
  unit?: string;
  /** Row height in points. Default 44. */
  itemHeight?: number;
  /** Rows visible above and below the centre. Default 2, so five rows total. */
  visibleRadius?: number;
  format?: (value: number) => string;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Every row is mounted. The wheel used to virtualise, and that is exactly what
 * broke it on the web: a virtualised list renders a handful of rows between two
 * tall spacer views, the spacers carry no `scroll-snap-align`, and the scroller
 * declares `scroll-snap-type: y mandatory`. The browser then refuses any scroll
 * offset that does not land on a mounted row, so a programmatic jump to a value
 * outside the rendered window was rejected outright - the assignment read back
 * unchanged. Since the window only follows the offset, and the offset could not
 * leave the window, a value arriving after mount could never be shown.
 *
 * The cost of mounting everything is bounded: the longest wheel in the app is
 * weight in pounds, 66 to 661, at 596 rows; metric weight is 541 and ages and
 * heights are well under 150. Rows are memoised on their distance bucket from
 * the centre, so turning the wheel only re-renders the handful of rows whose
 * size or opacity actually changes, not the whole list.
 */
const SETTLE_MS = 120;

/** How long a placement keeps re-asserting itself while the scroller ignores it. */
const MAX_PLACEMENT_FRAMES = 30;
/** Repeats on native, where the offset cannot be read back to check it took. */
const BLIND_PLACEMENT_FRAMES = 2;

/** Distance from the centre beyond which every row looks the same. */
const FAR = 3;
const ROW_FONT_SIZE = [fontSize.xl, fontSize.lg, fontSize.md, fontSize.md];
const ROW_OPACITY = [1, 0.6, 0.32, 0.18];

/**
 * react-native-web ignores `snapToInterval` and `decelerationRate` entirely -
 * only `pagingEnabled` produces CSS scroll snapping, and that snaps whole
 * viewports. So the web gets the snap declared directly: the scroller snaps
 * mandatorily on the Y axis and every row is a snap target aligned to the centre
 * of the scrollport, which is exactly the centre row. `overscrollBehavior` stops
 * a flick at either end of the wheel from scrolling the page behind it.
 */
const WEB_SCROLLER_STYLE: ViewStyle | null =
  Platform.OS === 'web'
    ? ({ scrollSnapType: 'y mandatory', overscrollBehavior: 'contain' } as unknown as ViewStyle)
    : null;

const WEB_ROW_STYLE: ViewStyle | null =
  Platform.OS === 'web' ? ({ scrollSnapAlign: 'center' } as unknown as ViewStyle) : null;

/**
 * Keyboard support for the web build, where `onAccessibilityAction` is never
 * called. react-native-web forwards key handlers to the DOM node; the shape is
 * declared here because the React Native prop types have no place for it.
 */
interface WebKeyboardProps {
  onKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
  /** Mouse wheel and trackpad never fire a drag, so they are marked here. */
  onWheel?: () => void;
  onTouchStart?: () => void;
  onPointerDown?: () => void;
}

const ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

/**
 * Native hides the rows behind the `accessible` wrapper on its own; the web has
 * no such thing, so the rows are muted there and the slider does the talking.
 */
const ROWS_HIDDEN: AccessibilityProps = Platform.OS === 'web' ? { 'aria-hidden': true } : {};

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Nearest entry to `value`, so a typed or clamped number still lands on a row. */
function nearestIndex(values: number[], value: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const distance = Math.abs(values[i] - value);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

function defaultFormat(value: number): string {
  return formatAmount(value);
}

interface WheelRowProps {
  text: string;
  itemHeight: number;
  /** Distance from the centre row, flattened at FAR so far rows never re-render. */
  bucket: number;
  withUnit: boolean;
  valueAlign: 'flex-start' | 'flex-end';
}

/**
 * Memoised on primitives only: a scroll of one row changes the bucket of at most
 * a few rows, and every other row is skipped without touching the DOM.
 */
const WheelRow = memo(function WheelRow({
  text,
  itemHeight,
  bucket,
  withUnit,
  valueAlign,
}: WheelRowProps) {
  const label = (
    <Txt
      weight={bucket === 0 ? 'semibold' : 'medium'}
      color={bucket === 0 ? 'text' : 'muted'}
      tabular
      align="center"
      numberOfLines={1}
      style={{
        fontSize: ROW_FONT_SIZE[bucket],
        lineHeight: itemHeight,
        opacity: ROW_OPACITY[bucket],
      }}
    >
      {text}
    </Txt>
  );

  // With a unit, the number is pushed against the centre line and the unit
  // sits in the opposite half, painted once by the band. Both halves follow the
  // reading direction, so Arabic mirrors without any extra work.
  return (
    <View style={[styles.row, { height: itemHeight }, WEB_ROW_STYLE]}>
      {withUnit ? (
        <>
          <View style={[styles.valueHalf, { alignItems: valueAlign }]}>{label}</View>
          <View style={styles.half} />
        </>
      ) : (
        <View style={styles.full}>{label}</View>
      )}
    </View>
  );
});

export function WheelPicker({
  values,
  value,
  onChange,
  unit,
  itemHeight = 44,
  visibleRadius = 2,
  format = defaultFormat,
  accessibilityLabel,
  style,
}: WheelPickerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation('common');
  const { isRTL } = useDirection();
  const scrollRef = useRef<ScrollView>(null);

  // The row mirrors on its own, but the number's alignment inside its half does
  // not: 'flex-end' pushes it to the physical right, which in Arabic is away
  // from the centre line and straight into the unit label.
  const valueAlign = isRTL ? 'flex-start' : 'flex-end';

  const count = values.length;
  const lastIndex = Math.max(0, count - 1);
  const padding = visibleRadius * itemHeight;
  const height = (visibleRadius * 2 + 1) * itemHeight;
  const contentHeight = count * itemHeight + padding * 2;

  const targetIndex = useMemo(
    () => (value === null ? Math.floor(lastIndex / 2) : nearestIndex(values, value)),
    [values, value, lastIndex],
  );

  const [centreIndex, setCentreIndex] = useState(targetIndex);
  const centreRef = useRef(targetIndex);
  const offsetRef = useRef(targetIndex * itemHeight);
  /** True from the first scroll event until the wheel has been still for a moment. */
  const movingRef = useRef(false);
  /** Set while the wheel is being driven by code, so it does not buzz at the user. */
  const drivenRef = useRef(false);
  /** Set while the motion on screen came from a finger, a wheel or a trackpad. */
  const gestureRef = useRef(false);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A value that arrived from outside mid-gesture, applied once the wheel stops. */
  const pendingRef = useRef<number | null>(null);
  /** False until the wheel has been put on a row at least once. */
  const positionedRef = useRef(false);
  const frameRef = useRef(0);
  const targetRef = useRef(targetIndex);
  targetRef.current = targetIndex;
  const contentHeightRef = useRef(contentHeight);
  contentHeightRef.current = contentHeight;

  // Swapping units rebuilds the list, which moves every row and leaves the
  // browser's scroll position meaning something else. The wheel is measured and
  // placed again from scratch rather than trusting the offset it happens to be
  // sitting at. The scrollport itself has not changed, so only the content is
  // waited on.
  const listSignature = `${count}:${itemHeight}`;
  const signatureRef = useRef(listSignature);
  if (signatureRef.current !== listSignature) {
    signatureRef.current = listSignature;
    positionedRef.current = false;
  }

  const toIndex = useCallback(
    (offsetY: number) => clamp(Math.round(offsetY / itemHeight), 0, lastIndex),
    [itemHeight, lastIndex],
  );

  const commit = useCallback(
    (index: number) => {
      const next = values[index];
      if (next === undefined || next === value) return;
      onChange(next);
    },
    [onChange, value, values],
  );

  /** The scroller's own node on the web, to read back what the browser accepted. */
  const scrollNode = useCallback((): { scrollTop: number } | null => {
    if (Platform.OS !== 'web') return null;
    const node = scrollRef.current?.getScrollableNode?.() as
      | { scrollTop?: number }
      | null
      | undefined;
    if (node == null || typeof node.scrollTop !== 'number') return null;
    return node as { scrollTop: number };
  }, []);

  const cancelPlacement = useCallback(() => {
    if (frameRef.current !== 0) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
  }, []);

  /**
   * Puts the wheel on a row, for value changes that did not come from a drag.
   *
   * A scroll offset only takes once the scroller has been laid out and its
   * content is tall enough to reach it; before that the browser clamps the
   * assignment to zero and says nothing. `onLayout` and `onContentSizeChange`
   * are not dependable enough to wait on here - on the web build neither fires
   * for this scroller - so the placement reads the offset back and repeats
   * itself for a few frames until the scroller really holds it. On native there
   * is nothing to read back, so it simply repeats a couple of times.
   */
  const driveTo = useCallback(
    (index: number, animated: boolean) => {
      cancelPlacement();
      centreRef.current = index;
      setCentreIndex(index);
      const y = index * itemHeight;
      offsetRef.current = y;
      // The web snaps through CSS, which competes with a smooth programmatic
      // scroll and can leave the wheel on the row it started from. Jumping is
      // reliable, and an external value change is not a gesture to animate.
      const smooth = animated && Platform.OS !== 'web';
      if (smooth) {
        // A deliberate step the user asked for, on a wheel already on screen.
        drivenRef.current = true;
        positionedRef.current = true;
        scrollRef.current?.scrollTo({ y, animated: true });
        return;
      }

      let frames = 0;
      const step = () => {
        frameRef.current = 0;
        // The moment the user takes hold, the wheel is theirs.
        if (gestureRef.current) return;
        drivenRef.current = true;
        scrollRef.current?.scrollTo({ y, animated: false });
        frames += 1;
        const node = scrollNode();
        const landed =
          node === null ? frames >= BLIND_PLACEMENT_FRAMES : Math.abs(node.scrollTop - y) <= 1;
        if (!landed && frames < MAX_PLACEMENT_FRAMES) {
          frameRef.current = requestAnimationFrame(step);
          return;
        }
        positionedRef.current = true;
      };
      step();
    },
    [cancelPlacement, itemHeight, scrollNode],
  );

  const stepBy = useCallback(
    (delta: number) => {
      const next = clamp(centreRef.current + delta, 0, lastIndex);
      if (next === centreRef.current) return;
      driveTo(next, true);
      commit(next);
    },
    [commit, driveTo, lastIndex],
  );

  const scheduleSettle = useCallback(() => {
    if (settleRef.current !== null) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      settleRef.current = null;
      movingRef.current = false;
      const wasGesture = gestureRef.current;
      gestureRef.current = false;
      drivenRef.current = false;

      // Land exactly on the row. Native has already snapped by now, but the web
      // is snapping through CSS, which a cancelled gesture can leave a few
      // pixels short - and half a row of drift reads as a broken wheel. The
      // correction is never more than half a row, so it cannot change the value.
      const settled = centreRef.current * itemHeight;
      if (Math.abs(offsetRef.current - settled) > 0.5) {
        offsetRef.current = settled;
        scrollRef.current?.scrollTo({ y: settled, animated: Platform.OS !== 'web' });
      }

      // Only report a value the user actually landed on. Settling after an
      // opening or programmatic scroll must not write the wheel's current row
      // back over the value the screen is still loading.
      if (wasGesture) commit(centreRef.current);

      // A value that arrived while the wheel was in hand was held back rather
      // than yanking the drag; now that the wheel is still it can be shown.
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending !== null && pending !== centreRef.current) driveTo(pending, true);
    }, SETTLE_MS);
  }, [commit, driveTo, itemHeight]);

  const markGesture = useCallback(() => {
    gestureRef.current = true;
    // The wheel is no longer being driven, so the rows it passes may buzz again.
    drivenRef.current = false;
    cancelPlacement();
  }, [cancelPlacement]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const index = toIndex(offsetY);
      offsetRef.current = offsetY;
      movingRef.current = true;

      if (index !== centreRef.current) {
        centreRef.current = index;
        setCentreIndex(index);
        if (!drivenRef.current && Platform.OS !== 'web') {
          Haptics.selectionAsync().catch(() => undefined);
        }
      }

      // The web fires neither momentum nor drag-end callbacks, so the value is
      // committed once the wheel has been still for SETTLE_MS. On native this is
      // only a safety net behind the two handlers below.
      scheduleSettle();
    },
    [scheduleSettle, toIndex],
  );

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!gestureRef.current) return;
      commit(toIndex(event.nativeEvent.contentOffset.y));
    },
    [commit, toIndex],
  );

  const handleDragEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // A release that still carries speed becomes momentum, and committing the
      // row it happens to be passing would fire onChange with a value the user
      // never chose. Only a drag that ends where it stops is final here.
      const velocity = event.nativeEvent.velocity?.y ?? 0;
      if (Math.abs(velocity) > 0.05) return;
      commit(toIndex(event.nativeEvent.contentOffset.y));
    },
    [commit, toIndex],
  );

  /** Opens on the target, and follows it afterwards, unless the wheel is in hand. */
  const applyTarget = useCallback(() => {
    if (gestureRef.current) return;
    if (positionedRef.current && targetRef.current === centreRef.current) return;
    driveTo(targetRef.current, false);
  }, [driveTo]);

  /**
   * Native measures the rows itself, and a wheel taller than its content cannot
   * be scrolled anywhere, so the opening position is re-asserted here too. The
   * web never reaches this - the callback does not fire for this scroller -
   * which is why the placement above verifies itself instead of waiting.
   */
  const handleContentSizeChange = useCallback(
    (_width: number, measured: number) => {
      if (measured + 1 < contentHeightRef.current) return;
      if (gestureRef.current) return;
      driveTo(targetRef.current, false);
    },
    [driveTo],
  );

  /** Follows a value changed elsewhere, but never while the wheel is in hand. */
  useEffect(() => {
    if (targetIndex === centreRef.current && positionedRef.current) return;
    if (movingRef.current && gestureRef.current) {
      pendingRef.current = targetIndex;
      return;
    }
    applyTarget();
  }, [applyTarget, targetIndex]);

  useEffect(
    () => () => {
      if (settleRef.current !== null) clearTimeout(settleRef.current);
      cancelPlacement();
    },
    [cancelPlacement],
  );

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'increment') stepBy(1);
      else if (event.nativeEvent.actionName === 'decrement') stepBy(-1);
    },
    [stepBy],
  );

  // Up and down only: left and right would have to mean opposite things in
  // Arabic, and a vertical wheel has no horizontal reading anyway.
  const keyboardProps: WebKeyboardProps =
    Platform.OS === 'web'
      ? {
          onKeyDown: (event) => {
            if (event.key === 'ArrowDown') stepBy(1);
            else if (event.key === 'ArrowUp') stepBy(-1);
            else if (event.key === 'PageDown') stepBy(visibleRadius * 2 + 1);
            else if (event.key === 'PageUp') stepBy(-(visibleRadius * 2 + 1));
            else if (event.key === 'Home') stepBy(-lastIndex);
            else if (event.key === 'End') stepBy(lastIndex);
            else return;
            event.preventDefault();
          },
          onWheel: markGesture,
          onTouchStart: markGesture,
          onPointerDown: markGesture,
        }
      : {};

  // The height is stated rather than left to the rows, so the scroller knows how
  // far it can travel on the very first layout pass instead of a frame later.
  const contentStyle = useMemo<ViewStyle>(
    () => ({ height: contentHeight, paddingVertical: padding }),
    [contentHeight, padding],
  );

  const rows = useMemo(
    () =>
      values.map((item, index) => (
        <WheelRow
          key={item}
          text={format(item)}
          itemHeight={itemHeight}
          bucket={Math.min(Math.abs(index - centreIndex), FAR)}
          withUnit={unit !== undefined}
          valueAlign={valueAlign}
        />
      )),
    [centreIndex, format, itemHeight, unit, valueAlign, values],
  );

  const current = count === 0 ? null : values[clamp(centreIndex, 0, lastIndex)];
  const spokenValue =
    current === null ? undefined : unit === undefined ? format(current) : `${format(current)} ${unit}`;

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={t('pickerAdjustHint')}
      accessibilityActions={ACTIONS}
      onAccessibilityAction={handleAccessibilityAction}
      accessibilityValue={{
        now: current ?? undefined,
        min: count === 0 ? undefined : values[0],
        max: count === 0 ? undefined : values[lastIndex],
        text: spokenValue,
      }}
      // react-native-web reads only the flat ARIA props, never the object above,
      // so the web build would otherwise announce a slider with no value.
      aria-valuenow={current ?? undefined}
      aria-valuemin={count === 0 ? undefined : values[0]}
      aria-valuemax={count === 0 ? undefined : values[lastIndex]}
      aria-valuetext={spokenValue}
      aria-orientation="vertical"
      focusable={Platform.OS === 'web'}
      style={[styles.container, { height }, style]}
      {...keyboardProps}
    >
      <View
        style={[
          styles.band,
          {
            top: padding,
            height: itemHeight,
            backgroundColor: colors.surfaceAlt,
            borderColor: colors.border,
          },
        ]}
      >
        {unit === undefined ? null : (
          <>
            <View style={styles.half} />
            <View style={styles.unitHalf}>
              <Txt variant="label" color="muted" weight="medium" numberOfLines={1}>
                {unit}
              </Txt>
            </View>
          </>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        onContentSizeChange={handleContentSizeChange}
        onScroll={handleScroll}
        onScrollBeginDrag={markGesture}
        onScrollEndDrag={handleDragEnd}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
        snapToInterval={itemHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={contentStyle}
        style={[styles.scroller, { height }, WEB_SCROLLER_STYLE]}
        {...ROWS_HIDDEN}
      >
        {rows}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  // The band is absolutely positioned, which on the web would paint it over the
  // rows whatever the source order says, so the stacking is stated explicitly.
  scroller: {
    zIndex: 1,
  },
  band: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    end: 0,
    flexDirection: 'row',
    // In the style rather than as a prop, which react-native-web deprecated.
    pointerEvents: 'none',
    position: 'absolute',
    start: 0,
    zIndex: 0,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  full: {
    flex: 1,
  },
  half: {
    flex: 1,
  },
  valueHalf: {
    flex: 1,
    paddingEnd: spacing.sm,
  },
  unitHalf: {
    flex: 1,
    justifyContent: 'center',
    paddingStart: spacing.sm,
  },
});
