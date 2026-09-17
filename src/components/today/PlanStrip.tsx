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
import { isSessionComplete } from '@/domain/training';
import { radius, spacing, useTheme } from '@/theme';
import type {
  BodyScan,
  DailyTotals,
  ProgramDay,
  Targets,
  WorkoutSession,
} from '@/types';

import { formatCount } from '../../../app/onboarding/_layout';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

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

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

/** Which palette slot a pillar's value uses. */
type Tone = 'text' | 'accent' | 'danger' | 'muted';

interface Pillar {
  key: string;
  icon: IconName;
  label: string;
  value: string;
  detail: string;
  tone: Tone;
  /** Read out in place of the three separate lines. */
  spoken: string;
  hint: string;
  onPress: () => void;
}

function caloriePillar(
  totals: DailyTotals,
  targets: Targets | null,
  onPress: () => void,
): Pillar {
  const eaten = Math.round(totals.macros.calories);
  const shared = { key: 'calories', icon: 'flame-outline' as IconName, label: 'Calories', onPress };

  if (!targets) {
    return {
      ...shared,
      value: formatCount(eaten),
      detail: 'kcal logged',
      tone: 'text',
      spoken: `Calories. ${formatCount(eaten)} kilocalories logged, no target set.`,
      hint: 'Opens your history',
    };
  }

  const left = Math.round(targets.calories) - eaten;
  const over = left < 0;

  return {
    ...shared,
    value: formatCount(eaten),
    detail: over
      ? `${formatCount(Math.abs(left))} over`
      : `${formatCount(left)} kcal left`,
    tone: over ? 'danger' : 'accent',
    spoken:
      `Calories. ${formatCount(eaten)} of ${formatCount(targets.calories)} kilocalories, ` +
      (over
        ? `${formatCount(Math.abs(left))} over target.`
        : `${formatCount(left)} left.`),
    hint: 'Opens your history',
  };
}

function trainingPillar(
  programDay: ProgramDay | null,
  sessions: WorkoutSession[],
  onPress: () => void,
): Pillar {
  const shared = {
    key: 'training',
    icon: 'barbell-outline' as IconName,
    label: 'Training',
    onPress,
    hint: 'Opens the session for this day',
  };
  const done = sessions.some((session) => isSessionComplete(session));
  const started = sessions.length > 0;

  if (!programDay) {
    return {
      ...shared,
      value: started ? sessions[0].dayLabel ?? 'Session' : 'Rest',
      detail: started ? 'Logged' : 'No session planned',
      tone: started ? 'accent' : 'muted',
      spoken: started
        ? 'Training. Rest day, one session logged.'
        : 'Training. Rest day, nothing planned.',
    };
  }

  return {
    ...shared,
    value: programDay.label,
    detail: done ? 'Done' : started ? 'Started' : 'Not logged',
    tone: done ? 'accent' : 'text',
    spoken: `Training. ${programDay.label} day, ${
      done ? 'finished' : started ? 'in progress' : 'not logged yet'
    }.`,
  };
}

function bodyPillar(scan: BodyScan | null, onPress: () => void): Pillar {
  const shared = {
    key: 'body',
    icon: 'body-outline' as IconName,
    label: 'Body',
    onPress,
    hint: 'Opens your body readings',
  };

  if (!scan) {
    return {
      ...shared,
      value: '--',
      detail: 'No reading yet',
      tone: 'muted',
      spoken: 'Body. No reading yet.',
    };
  }

  const weight = `${scan.weightKg.toFixed(1)} kg`;
  const fat = scan.bodyFatPercent;

  return {
    ...shared,
    value: weight,
    detail: fat === undefined ? 'Last reading' : `${fat.toFixed(1)}% fat`,
    tone: 'text',
    spoken:
      `Body. ${weight}` +
      (fat === undefined ? '.' : `, ${fat.toFixed(1)} percent body fat.`),
  };
}

/**
 * The day's three pillars in one row: what has been eaten, what is scheduled in
 * the gym and where the body is. Each one is a tap through to the screen that
 * owns it, so Today answers "where am I" without scrolling.
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

  const pillars: Pillar[] = [
    caloriePillar(totals, targets, onCalories),
    trainingPillar(programDay, sessions, onTraining),
    bodyPillar(scan, onBody),
  ];

  const valueColor: Record<Tone, string> = {
    text: colors.text,
    accent: colors.accent,
    danger: colors.danger,
    muted: colors.textFaint,
  };

  return (
    <View
      style={[
        styles.strip,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      {pillars.map((pillar, index) => (
        <React.Fragment key={pillar.key}>
          {index > 0 ? (
            <View style={[styles.split, { backgroundColor: colors.border }]} {...DECORATIVE} />
          ) : null}
          <Pressable
            onPress={pillar.onPress}
            accessibilityRole="button"
            accessibilityLabel={pillar.spoken}
            accessibilityHint={pillar.hint}
            style={({ pressed }) => [
              styles.pillar,
              pressed ? { backgroundColor: colors.surfaceAlt } : null,
            ]}
          >
            <View style={styles.head}>
              <Ionicons
                name={pillar.icon}
                size={13}
                color={colors.textFaint}
                {...DECORATIVE}
              />
              <Txt variant="caption" color="faint" weight="semibold" numberOfLines={1}>
                {pillar.label}
              </Txt>
            </View>

            <Txt
              variant="label"
              weight="bold"
              color={valueColor[pillar.tone]}
              numberOfLines={1}
              tabular
              style={styles.value}
            >
              {pillar.value}
            </Txt>

            <Txt variant="caption" color="faint" numberOfLines={1}>
              {pillar.detail}
            </Txt>
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    alignItems: 'stretch',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  split: {
    width: StyleSheet.hairlineWidth,
  },
  pillar: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 72,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.md,
  },
  head: {
    alignItems: 'center',
    columnGap: spacing.xs,
    flexDirection: 'row',
  },
  value: {
    marginTop: spacing.xs + 1,
  },
});
