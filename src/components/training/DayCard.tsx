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

import { Badge, Button, Divider, Txt } from '@/components/ui';
import { SESSION_ICONS } from '@/domain/training';
import { layout, spacing, useTheme } from '@/theme';
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

/**
 * The plan for one day, set as a page rather than boxed in a card: the title
 * carries the day, one hairline bounds the list, and the only accent on the
 * screen is the button that starts it.
 */
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

  return (
    <View style={style}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Txt variant="label" color="muted" numberOfLines={1}>
            {dateLabel}
          </Txt>
          <View style={styles.titleRow}>
            {/* A session type is quicker to recognise by its glyph than by reading. */}
            <View style={styles.glyph} {...DECORATIVE}>
              <Ionicons
                name={icon as IconName}
                size={20}
                color={resting ? colors.textFaint : colors.textMuted}
              />
            </View>
            <Txt variant="title" numberOfLines={2} style={styles.title} accessibilityRole="header">
              {title}
            </Txt>
          </View>
        </View>

        {badge ? (
          <Badge
            label={badge}
            variant="plain"
            tone={status === 'completed' ? 'success' : 'default'}
            style={styles.badge}
          />
        ) : null}
      </View>

      <Txt variant="body" color="muted" numberOfLines={2} style={styles.subtitle}>
        {subtitle}
      </Txt>

      {exercises.length > 0 ? (
        <View style={styles.list}>
          <Divider style={styles.rule} />
          {exercises.map((exercise) => (
            <View
              key={exercise.id}
              style={styles.exercise}
              accessible
              accessibilityLabel={
                exercise.done
                  ? t('plannedSpokenDone', {
                      name: exercise.name,
                      planned: exercise.detailSpoken,
                    })
                  : t('plannedSpoken', {
                      name: exercise.name,
                      planned: exercise.detailSpoken,
                    })
              }
            >
              <View style={styles.mark} {...DECORATIVE}>
                {exercise.done ? (
                  <Ionicons name="checkmark" size={15} color={colors.textMuted} />
                ) : null}
              </View>
              <Txt
                numberOfLines={1}
                color={exercise.done ? 'muted' : 'text'}
                style={styles.exerciseName}
              >
                {exercise.name}
              </Txt>
              <Txt variant="label" color="faint" numberOfLines={1} tabular style={styles.detail}>
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
        size="lg"
        fullWidth
        style={styles.action}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'flex-start',
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  headerText: {
    flex: 1,
  },
  titleRow: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginTop: 2,
  },
  glyph: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
  },
  title: {
    flexShrink: 1,
  },
  badge: {
    marginTop: 3,
  },
  subtitle: {
    marginTop: spacing.sm,
  },
  list: {
    marginTop: spacing.xl,
    rowGap: spacing.md,
  },
  rule: {
    marginBottom: spacing.xs,
  },
  exercise: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    minHeight: 22,
  },
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
  },
  exerciseName: {
    flex: 1,
    flexShrink: 1,
  },
  // The planned volume never wraps and never gives way to a long Arabic name.
  detail: {
    flexShrink: 0,
  },
  action: {
    marginTop: layout.sectionGap - spacing.sm,
  },
});
