import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo, useState } from 'react';
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

import { formatAmount } from '@/domain/format';
import { mirrorIcon, useDirection } from '@/i18n';
import { radius, spacing, useTheme } from '@/theme';

import { NumberField } from './NumberField';
import { Txt } from './Txt';
import { WheelPicker } from './WheelPicker';

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

/** Stands in for a value that has not been chosen yet. */
const UNSET = '—';

export interface MeasurePickerSecondary {
  value: number | null;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
}

export interface MeasurePickerProps {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Default 1. */
  step?: number;
  unit: string;
  /** Second wheel for feet + inches style input. */
  secondary?: MeasurePickerSecondary;
  /** Shown above the wheel, e.g. '13 to 100'. */
  hint?: string;
  /** Lets the user switch to typing when the wheel is the wrong tool. */
  allowTyping?: boolean;
  /**
   * Closed, the picker is a single row showing its value, and it opens on tap.
   * This is the default because an open wheel is a scroll trap: a page-scroll
   * gesture that happens to start over one turns the wheel instead of moving
   * the page, silently rewriting the value.
   */
  collapsible?: boolean;
  /** Controlled open state, so a screen can keep one picker open at a time. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** How many decimals a step carries, so 0.1 keeps one and 5 keeps none. */
function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Every row is computed from the minimum rather than by adding the step over and
 * over, which would drift: 30 + 0.1 repeated 400 times is not 70.
 */
function buildValues(min: number, max: number, step: number, decimals: number): number[] {
  const safeStep = step > 0 ? step : 1;
  const span = Math.max(0, max - min);
  const count = Math.floor(span / safeStep + 1e-6) + 1;
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    values.push(roundTo(min + i * safeStep, decimals));
  }
  return values;
}

/** Puts a typed number back onto the wheel's grid. */
function snapTo(value: number, min: number, max: number, step: number, decimals: number): number {
  const safeStep = step > 0 ? step : 1;
  const clamped = Math.min(max, Math.max(min, value));
  const snapped = roundTo(min + Math.round((clamped - min) / safeStep) * safeStep, decimals);
  return Math.min(max, Math.max(min, snapped));
}

export function MeasurePicker({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  secondary,
  hint,
  allowTyping = true,
  collapsible = true,
  open,
  onOpenChange,
  accessibilityLabel,
  style,
}: MeasurePickerProps) {
  const { t } = useTranslation('common');
  const { colors } = useTheme();
  const { isRTL } = useDirection();
  const [typing, setTyping] = useState(false);
  const [selfOpen, setSelfOpen] = useState(false);
  const isOpen = !collapsible || (open ?? selfOpen);

  const setOpen = useCallback(
    (next: boolean) => {
      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => undefined);
      if (onOpenChange) onOpenChange(next);
      else setSelfOpen(next);
    },
    [onOpenChange],
  );

  const decimals = useMemo(() => decimalsOf(step), [step]);
  const values = useMemo(() => buildValues(min, max, step, decimals), [min, max, step, decimals]);
  const format = useCallback((v: number) => formatAmount(v, decimals), [decimals]);

  // Read as primitives so the wheel's data keeps a stable identity even though
  // the caller rebuilds the `secondary` object on every render.
  const secondaryMin = secondary?.min ?? 0;
  const secondaryMax = secondary?.max ?? 0;
  const secondaryStep = secondary?.step ?? 1;
  const secondaryDecimals = useMemo(() => decimalsOf(secondaryStep), [secondaryStep]);
  const secondaryValues = useMemo(
    () => buildValues(secondaryMin, secondaryMax, secondaryStep, secondaryDecimals),
    [secondaryMin, secondaryMax, secondaryStep, secondaryDecimals],
  );
  const formatSecondary = useCallback(
    (v: number) => formatAmount(v, secondaryDecimals),
    [secondaryDecimals],
  );

  const base = accessibilityLabel ?? label;

  const handleTyped = useCallback(
    (next: number | null) => {
      if (next !== null) onChange(next);
    },
    [onChange],
  );

  const handleTypedSecondary = useCallback(
    (next: number | null) => {
      if (next !== null && secondary) secondary.onChange(next);
    },
    [secondary],
  );

  const toggleTyping = () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => undefined);
    }
    // Leaving the keyboard, the typed number is pulled onto the wheel's grid so
    // the two ways of entering a value never disagree by half a step.
    if (typing) {
      if (value !== null) {
        const snapped = snapTo(value, min, max, step, decimals);
        if (snapped !== value) onChange(snapped);
      }
      if (secondary && secondary.value !== null) {
        const snapped = snapTo(
          secondary.value,
          secondaryMin,
          secondaryMax,
          secondaryStep,
          secondaryDecimals,
        );
        if (snapped !== secondary.value) secondary.onChange(snapped);
      }
    }
    setTyping((previous) => !previous);
  };

  const valueText = (
    <Txt variant="metric">
      <Txt variant="metric" tabular>
        {value === null ? UNSET : format(value)}
      </Txt>
      <Txt variant="body" color="muted">
        {` ${unit}`}
      </Txt>
      {secondary ? (
        <>
          <Txt variant="metric" tabular>
            {`  ${secondary.value === null ? UNSET : formatSecondary(secondary.value)}`}
          </Txt>
          <Txt variant="body" color="muted">
            {` ${secondary.unit}`}
          </Txt>
        </>
      ) : null}
    </Txt>
  );

  if (!isOpen) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('joinList', { a: base, b: unit })}
        accessibilityHint={t('pickerOpenHint')}
        style={({ pressed }) => [
          styles.closedRow,
          { borderColor: colors.border },
          pressed ? styles.pressed : null,
          style,
        ]}
      >
        <Txt variant="label" color="muted">
          {label}
        </Txt>
        <View style={styles.closedValue}>
          {valueText}
          <Ionicons
            name={mirrorIcon('chevron-forward', isRTL) as never}
            size={16}
            color={colors.textFaint}
            {...DECORATIVE}
          />
        </View>
      </Pressable>
    );
  }

  return (
    <View style={style}>
      <View style={styles.header}>
        <Txt variant="label" color="muted">
          {label}
        </Txt>
        {collapsible ? (
          <Pressable
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('pickerDoneAction')}
            hitSlop={spacing.sm}
            style={({ pressed }) => (pressed ? styles.pressed : null)}
          >
            <Txt variant="label" color="accent" weight="semibold">
              {t('pickerDoneAction')}
            </Txt>
          </Pressable>
        ) : null}
        {allowTyping ? (
          <Pressable
            onPress={toggleTyping}
            accessibilityRole="button"
            accessibilityLabel={typing ? t('pickerScrollAction') : t('pickerTypeAction')}
            hitSlop={spacing.sm}
            style={({ pressed }) => (pressed ? styles.pressed : null)}
          >
            {/* A way to switch input, not the point of the screen: no accent. */}
            <Txt variant="label" color="muted" weight="semibold">
              {typing ? t('pickerScrollAction') : t('pickerTypeAction')}
            </Txt>
          </Pressable>
        ) : null}
      </View>

      {hint ? (
        <Txt variant="caption" color="faint" style={styles.hint}>
          {hint}
        </Txt>
      ) : null}

      {/*
        The wheel and the fields below already announce their own value.
        Each figure and its unit are one text run: as separate elements Arabic
        reorders them and two adjacent numbers, such as feet and inches, collide
        into one longer number.
      */}
      <View style={styles.readout} {...DECORATIVE}>
        <Txt variant="metric">
          <Txt variant="metric" tabular>
            {value === null ? UNSET : format(value)}
          </Txt>
          <Txt variant="body" color="muted">
            {` ${unit}`}
          </Txt>
        </Txt>
        {secondary ? (
          <Txt variant="metric" style={styles.readoutSecond}>
            <Txt variant="metric" tabular>
              {secondary.value === null ? UNSET : formatSecondary(secondary.value)}
            </Txt>
            <Txt variant="body" color="muted">
              {` ${secondary.unit}`}
            </Txt>
          </Txt>
        ) : null}
      </View>

      {typing ? (
        <View style={styles.row}>
          <NumberField
            value={value}
            onChange={handleTyped}
            placeholder={label}
            suffix={unit}
            min={min}
            max={max}
            autoFocus
            style={styles.column}
          />
          {secondary ? (
            <NumberField
              value={secondary.value}
              onChange={handleTypedSecondary}
              suffix={secondary.unit}
              min={secondaryMin}
              max={secondaryMax}
              style={styles.column}
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.row}>
          <WheelPicker
            values={values}
            value={value}
            onChange={onChange}
            unit={unit}
            format={format}
            accessibilityLabel={t('joinList', { a: base, b: unit })}
            style={styles.column}
          />
          {secondary ? (
            <WheelPicker
              values={secondaryValues}
              value={secondary.value}
              onChange={secondary.onChange}
              unit={secondary.unit}
              format={formatSecondary}
              accessibilityLabel={t('joinList', { a: base, b: secondary.unit })}
              style={styles.column}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    marginStart: spacing.xs / 2,
  },
  pressed: {
    opacity: 0.6,
  },
  hint: {
    marginBottom: spacing.xs,
    marginStart: spacing.xs / 2,
  },
  closedRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingVertical: spacing.sm,
  },
  closedValue: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  readout: {
    alignItems: 'baseline',
    columnGap: spacing.xs,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    marginStart: spacing.xs / 2,
  },
  readoutSecond: {
    marginStart: spacing.sm,
  },
  row: {
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  column: {
    flex: 1,
  },
});
