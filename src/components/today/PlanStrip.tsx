import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Txt } from '@/components/ui';
import { formatAmount, formatCount } from '@/domain/format';
import { isSessionComplete } from '@/domain/training';
import { useDirection } from '@/i18n';
import { radius, spacing, useTheme } from '@/theme';
import type {
  BodyScan,
  DailyTotals,
  ProgramDay,
  Targets,
  WorkoutSession,
} from '@/types';

export interface PlanStripProps {
  totals: DailyTotals;
  /** Null until the profile exists. */
  targets: Targets | null;
  /** The day the program schedules, or null when the day is a rest day. */
  programDay: ProgramDay | null;
  /** Sessions logged on the selected day. */
  sessions: WorkoutSession[];
  /** Most recent body-composition reading, or null when there is none. */
  scan: BodyScan | null;
  onCalories: () => void;
  onTraining: () => void;
  onBody: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * 'quiet' is a pillar with nothing in it yet; 'warning' is past the day's
 * target. Neither uses the accent: that belongs to the ring above.
 */
type Tone = 'default' | 'quiet' | 'warning';

interface Pillar {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: Tone;
  hint: string;
  onPress: () => void;
}

/**
 * The day's three pillars in one row: what has been eaten, what is scheduled in
 * the gym and where the body is. Each one is a tap through to the screen that
 * owns it, so Today answers "where am I" without scrolling.
 *
 * Three columns separated by space alone — no box, no rules, no icons.
 */
export function PlanStrip({
  totals,
  targets,
  programDay,
  sessions,
  scan,
  onCalories,
  onTraining,
  onBody,
  style,
}: PlanStripProps) {
  const { colors } = useTheme();
  const { t } = useTranslation(['today', 'macros', 'nav', 'units']);
  const { isRTL } = useDirection();

  const caloriePillar = (): Pillar => {
    const eaten = Math.round(totals.macros.calories);
    const shared = {
      key: 'calories',
      label: t('macros:calories'),
      hint: t('today:hintCalories'),
      onPress: onCalories,
      value: formatCount(eaten),
    };

    if (!targets) {
      return { ...shared, detail: t('today:planLogged'), tone: 'default' };
    }

    const left = Math.round(targets.calories) - eaten;
    const over = left < 0;

    return {
      ...shared,
      detail: over
        ? t('today:planOver', { value: formatCount(Math.abs(left)) })
        : t('today:planLeft', { value: formatCount(left) }),
      tone: over ? 'warning' : 'default',
    };
  };

  const trainingPillar = (): Pillar => {
    const shared = {
      key: 'training',
      label: t('nav:training'),
      hint: t('today:hintTraining'),
      onPress: onTraining,
    };
    const done = sessions.some((session) => isSessionComplete(session));
    const started = sessions.length > 0;

    if (!programDay) {
      return {
        ...shared,
        value: started
          ? sessions[0].dayLabel ?? t('today:planSession')
          : t('today:planRest'),
        detail: started ? t('today:planSessionLogged') : t('today:planNoSession'),
        tone: started ? 'default' : 'quiet',
      };
    }

    return {
      ...shared,
      value: isRTL ? programDay.labelAr ?? programDay.label : programDay.label,
      detail: done
        ? t('today:planDone')
        : started
          ? t('today:planStarted')
          : t('today:planNotLogged'),
      tone: 'default',
    };
  };

  const bodyPillar = (): Pillar => {
    const shared = {
      key: 'body',
      label: t('today:body'),
      hint: t('today:hintBody'),
      onPress: onBody,
    };

    if (!scan) {
      return { ...shared, value: '--', detail: t('today:planNoReading'), tone: 'quiet' };
    }

    const fat = scan.bodyFatPercent;

    return {
      ...shared,
      value: `${formatAmount(scan.weightKg, 1)} ${t('units:kg')}`,
      detail:
        fat === undefined
          ? t('today:planLastReading')
          : t('today:planBodyFat', { value: formatAmount(fat, 1) }),
      tone: 'default',
    };
  };

  const pillars: Pillar[] = [caloriePillar(), trainingPillar(), bodyPillar()];

  return (
    <View style={[styles.strip, style]}>
      {pillars.map((pillar) => (
        <Pressable
          key={pillar.key}
          onPress={pillar.onPress}
          accessibilityRole="button"
          accessibilityLabel={t('today:pillarSpoken', {
            label: pillar.label,
            value: pillar.value,
            detail: pillar.detail,
          })}
          accessibilityHint={pillar.hint}
          style={({ pressed }) => [
            styles.pillar,
            pressed ? [styles.pressed, { backgroundColor: colors.surfaceAlt }] : null,
          ]}
        >
          <Txt variant="caption" color="faint" align="start" numberOfLines={1}>
            {pillar.label}
          </Txt>

          {/* The figure never wraps and never shrinks to fit its column. */}
          <Txt
            variant="body"
            weight="semibold"
            color={pillar.tone === 'quiet' ? 'faint' : 'text'}
            align="start"
            numberOfLines={1}
            tabular
            style={styles.value}
          >
            {pillar.value}
          </Txt>

          <Txt
            variant="caption"
            color={pillar.tone === 'warning' ? 'warning' : 'faint'}
            align="start"
            numberOfLines={2}
          >
            {pillar.detail}
          </Txt>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  pillar: {
    flex: 1,
    minHeight: 64,
    // A touch of negative inset keeps the first column flush with the gutter
    // while the pressed tone still has room to breathe.
    marginHorizontal: -spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  pressed: {
    borderRadius: radius.md,
  },
  value: {
    flexShrink: 0,
    marginTop: spacing.xs,
    marginBottom: 2,
  },
});
