import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Badge, Button, Card, Divider, Txt } from '@/components/ui';
import { SESSION_ICONS } from '@/domain/training';
import { radius, spacing, useTheme } from '@/theme';
import type { ProgramDay } from '@/types';

import { useTrainingText } from './useTrainingText';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

/** How far a session has got on the day the card is showing. */
export type DayCardStatus = 'none' | 'in_progress' | 'completed';

export interface DayCardExercise {
  /** Exercise id, unique inside the day. */
  id: string;
  /** Leading name, already in the reading language. */
  name: string;
  /** The other name, shown quietly underneath. */
  altName?: string;
  /** Planned volume in its dense form, e.g. '4×5-8'. */
  detail: string;
  /** The same volume in words, for the row's spoken label. */
  detailSpoken: string;
  /** Ticked in the logged session for this day. */
  done?: boolean;
}

export interface DayCardProps {
  /** The scheduled day, or null when the program rests. */
  day: ProgramDay | null;
  /** Day label shown above the title, e.g. 'Today'. */
  dateLabel: string;
  exercises: DayCardExercise[];
  status: DayCardStatus;
  primaryLabel: string;
  onPrimary: () => void;
  style?: StyleProp<ViewStyle>;
}

/** The plan for one day: what it covers, what is in it, and how to start it. */
export function DayCard({
  day,
  dateLabel,
  exercises,
  status,
  primaryLabel,
  onPrimary,
  style,
}: DayCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation('training');
  const text = useTrainingText();

  const resting = day === null;
  const title = day ? text.day(day) : t('restTitle');
  const subtitle = day ? text.muscles(day.type) : t('restSubtitle');
  const icon = day ? SESSION_ICONS[day.type] : 'moon-outline';
  const badge =
    status === 'completed'
      ? t('statusDone')
      : status === 'in_progress'
        ? t('statusInProgress')
        : null;

  const bubbleColor = resting ? colors.surfaceAlt : colors.accentSoft;
  const glyphColor = resting ? colors.textMuted : colors.accent;

  return (
    <Card style={style}>
      <View style={styles.header}>
        <View style={[styles.bubble, { backgroundColor: bubbleColor }]} {...DECORATIVE}>
          <Ionicons name={icon as IconName} size={22} color={glyphColor} />
        </View>

        <View style={styles.headerText}>
          <Txt variant="caption" color="faint" weight="bold" numberOfLines={1}>
            {dateLabel.toUpperCase()}
          </Txt>
          <Txt variant="heading" weight="bold" numberOfLines={1} style={styles.title}>
            {title}
          </Txt>
          <Txt variant="label" color="muted" numberOfLines={2} style={styles.subtitle}>
            {subtitle}
          </Txt>
        </View>

        {badge ? (
          <Badge label={badge} tone={status === 'completed' ? 'success' : 'accent'} />
        ) : null}
      </View>

      {exercises.length > 0 ? (
        <View style={styles.list}>
          <Divider style={styles.divider} />
          {exercises.map((exercise) => (
            <View
              key={exercise.id}
              style={styles.exercise}
              accessible
              accessibilityLabel={t('plannedSpoken', {
                name: exercise.name,
                planned: exercise.detailSpoken,
              })}
            >
              <View style={styles.mark} {...DECORATIVE}>
                <Ionicons
                  name={exercise.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={exercise.done ? colors.success : colors.textFaint}
                />
              </View>
              <View style={styles.exerciseText}>
                <Txt weight="medium" numberOfLines={1}>
                  {exercise.name}
                </Txt>
                {exercise.altName ? (
                  <Txt variant="caption" color="faint" numberOfLines={1} style={styles.alt}>
                    {exercise.altName}
                  </Txt>
                ) : null}
              </View>
              <Txt variant="label" color="muted" numberOfLines={1} tabular style={styles.detail}>
                {exercise.detail}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}

      <Button
        label={primaryLabel}
        onPress={onPrimary}
        variant={resting ? 'secondary' : 'primary'}
        fullWidth
        style={styles.action}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'flex-start',
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  bubble: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerText: {
    flex: 1,
  },
  title: {
    marginTop: 2,
  },
  subtitle: {
    marginTop: 2,
  },
  list: {
    marginTop: spacing.md,
  },
  divider: {
    marginBottom: spacing.sm,
  },
  exercise: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    minHeight: 34,
  },
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
  },
  exerciseText: {
    flex: 1,
    flexShrink: 1,
  },
  alt: {
    marginTop: 1,
  },
  // The planned volume never wraps and never gives way to a long Arabic name.
  detail: {
    flexShrink: 0,
  },
  action: {
    marginTop: spacing.lg,
  },
});
