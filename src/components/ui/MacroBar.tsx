import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { formatCount } from '@/domain/format';
import { radius, spacing, useTheme } from '@/theme';

import { Txt } from './Txt';

export interface MacroBarProps {
  label: string;
  value: number;
  target: number;
  color: string;
  /** Defaults to the translated gram symbol. */
  unit?: string;
  style?: StyleProp<ViewStyle>;
}

function round(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** A tiny amount still has to be visible, so the fill never drops below a sliver. */
const MIN_FILL = 5;
/** The overflow tail is capped so a large overshoot cannot swallow the bar. */
const MAX_OVER = 28;

export function MacroBar({ label, value, target, color, unit, style }: MacroBarProps) {
  const { colors } = useTheme();
  const { t } = useTranslation('common');
  const { t: tu } = useTranslation('units');

  const suffix = unit ?? tu('gram');
  const shown = round(value);
  const goal = round(target);
  const over = goal > 0 && shown > goal;

  const ratio = goal > 0 ? Math.min(shown / goal, 1) : shown > 0 ? 1 : 0;
  const overPct = over ? Math.min((shown - goal) / goal, 1) * MAX_OVER : 0;
  // Under target: a sliver at minimum. Over: the macro colour gives up the tail.
  const fillPct = over ? 100 - overPct : shown > 0 ? Math.max(ratio * 100, MIN_FILL) : 0;

  const spoken = {
    label,
    value: formatCount(shown),
    target: formatCount(goal),
    unit: suffix,
  };

  return (
    <View
      style={style}
      accessibilityRole="progressbar"
      accessibilityLabel={over ? t('progressOver', spoken) : t('progressOf', spoken)}
      accessibilityValue={{ min: 0, max: goal, now: shown }}
    >
      <View style={styles.header}>
        <Txt variant="caption" weight="bold" color="faint" numberOfLines={1} style={styles.label}>
          {label.toUpperCase()}
        </Txt>
        {/*
          One text run, not three siblings in a row. Laid out as separate
          elements, Arabic reorders them and the two figures end up touching, so
          "39 / 141" reads as "14139". Inside a single run the numbers and the
          slash stay one left-to-right group and the unit sits beside it.
          Past the target the figure stays in the reading colour: the bar and
          the muted target carry the signal without shouting.
        */}
        <Txt variant="label" numberOfLines={1} style={styles.values}>
          <Txt variant="label" weight="bold" color="text" tabular>
            {formatCount(shown)}
          </Txt>
          <Txt variant="label" color={over ? colors.warning : 'faint'} tabular>
            {` / ${formatCount(goal)}`}
          </Txt>
          <Txt variant="caption" color="faint" weight="medium">
            {` ${suffix}`}
          </Txt>
        </Txt>
      </View>

      <View style={[styles.track, { backgroundColor: colors.track }]}>
        {fillPct > 0 ? (
          <View style={[styles.fill, { backgroundColor: color, width: `${fillPct}%` }]} />
        ) : null}
        {over ? (
          <View style={[styles.over, { backgroundColor: colors.warning, width: `${overPct}%` }]} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs + 2,
  },
  label: {
    flexShrink: 1,
    marginEnd: spacing.sm,
  },
  values: {
    flexShrink: 0,
  },
  track: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 8,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    borderRadius: radius.pill,
    height: '100%',
    minWidth: 6,
  },
  over: {
    height: '100%',
  },
});
