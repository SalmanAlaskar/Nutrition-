import { Ionicons } from '@expo/vector-icons';
import React from 'react';
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
  hint: string;
  onPress: () => void;
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
  const { t } = useTranslation(['today', 'macros', 'nav', 'units']);
  const { isRTL } = useDirection();

  const caloriePillar = (): Pillar => {
    const eaten = Math.round(totals.macros.calories);
    const shared = {
      key: 'calories',
      icon: 'flame-outline' as IconName,
      label: t('macros:calories'),
      hint: t('today:hintCalories'),
      onPress: onCalories,
    };

    if (!targets) {
      return {
        ...shared,
        value: formatCount(eaten),
        detail: t('today:planLogged'),
        tone: 'text',
      };
    }

    const left = Math.round(targets.calories) - eaten;
    const over = left < 0;

    return {
      ...shared,
      value: formatCount(eaten),
      detail: over
        ? t('today:planOver', { value: formatCount(Math.abs(left)) })
        : t('today:planLeft', { value: formatCount(left) }),
      tone: over ? 'danger' : 'accent',
    };
  };

  const trainingPillar = (): Pillar => {
    const shared = {
      key: 'training',
      icon: 'barbell-outline' as IconName,
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
        tone: started ? 'accent' : 'muted',
      };
    }

    return {
      ...shared,
      value: (isRTL ? programDay.labelAr ?? programDay.label : programDay.label),
      detail: done
        ? t('today:planDone')
        : started
          ? t('today:planStarted')
          : t('today:planNotLogged'),
      tone: done ? 'accent' : 'text',
    };
  };

  const bodyPillar = (): Pillar => {
    const shared = {
      key: 'body',
      icon: 'body-outline' as IconName,
      label: t('today:body'),
      hint: t('today:hintBody'),
      onPress: onBody,
    };

    if (!scan) {
      return { ...shared, value: '--', detail: t('today:planNoReading'), tone: 'muted' };
    }

    const fat = scan.bodyFatPercent;

    return {
      ...shared,
      value: `${formatAmount(scan.weightKg, 1)} ${t('units:kg')}`,
      detail:
        fat === undefined
          ? t('today:planLastReading')
          : t('today:planBodyFat', { value: formatAmount(fat, 1) }),
      tone: 'text',
    };
  };

  const pillars: Pillar[] = [caloriePillar(), trainingPillar(), bodyPillar()];

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
            accessibilityLabel={t('today:pillarSpoken', {
              label: pillar.label,
              value: pillar.value,
              detail: pillar.detail,
            })}
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
