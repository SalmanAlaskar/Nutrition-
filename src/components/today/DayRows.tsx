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
import { formatAmount } from '@/domain/format';
import { isSessionComplete } from '@/domain/training';
import { mirrorIcon, useDirection } from '@/i18n';
import { layout, radius, spacing, useTheme } from '@/theme';
import type { BodyScan, ProgramDay, SessionType, WorkoutSession } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

/** What each scheduled day works, keyed off the program day's own type. */
const MUSCLE_KEYS = {
  push: 'today:musclesPush',
  pull: 'today:musclesPull',
  legs: 'today:musclesLegs',
  upper: 'today:musclesUpper',
  lower: 'today:musclesLower',
  full: 'today:musclesFull',
  cardio: 'today:musclesCardio',
} as const satisfies Record<SessionType, string>;

export interface DayRowsProps {
  /** The day the program schedules, or null when the day is a rest day. */
  programDay: ProgramDay | null;
  /** Sessions logged on the selected day. */
  sessions: WorkoutSession[];
  /** Most recent body-composition reading, or null when there is none. */
  scan: BodyScan | null;
  onTraining: () => void;
  onBody: () => void;
  style?: StyleProp<ViewStyle>;
}

interface RowProps {
  title: string;
  meta: string;
  /** Right-hand value: a word for the session, a figure for the body. */
  trailing: React.ReactNode;
  spoken: string;
  hint: string;
  onPress: () => void;
}

/**
 * One line of the day. Size and tone separate the two strings, so neither
 * needs extra weight, and nothing is drawn around the row at all.
 */
function Row({ title, meta, trailing, spoken, hint, onPress }: RowProps) {
  const { colors } = useTheme();
  const { isRTL } = useDirection();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={hint}
      style={({ pressed }) => [
        styles.row,
        pressed ? [styles.pressed, { backgroundColor: colors.surfaceAlt }] : null,
      ]}
    >
      <View style={styles.text}>
        <Txt numberOfLines={1}>{title}</Txt>
        <Txt variant="label" color="faint" numberOfLines={1} style={styles.meta}>
          {meta}
        </Txt>
      </View>

      {trailing}

      {/* The chevron points the way the row opens, which is the reading direction. */}
      <View {...DECORATIVE}>
        <Ionicons
          name={mirrorIcon('chevron-forward', isRTL) as IconName}
          size={15}
          color={colors.textFaint}
        />
      </View>
    </Pressable>
  );
}

/**
 * The two standing facts of the day that the ring above does not carry: what
 * the gym asks for, and where the body is. Each one opens the screen that owns
 * it, so Today answers "where am I" without repeating the calorie count that
 * is already the largest thing on the page.
 */
export function DayRows({
  programDay,
  sessions,
  scan,
  onTraining,
  onBody,
  style,
}: DayRowsProps) {
  const { t } = useTranslation(['today', 'units']);
  const { isRTL } = useDirection();

  const done = sessions.some((session) => isSessionComplete(session));
  const started = sessions.length > 0;

  // A rest day with nothing logged says nothing here: the row already reads
  // "Rest day", and an empty word beside it would only be noise.
  const sessionState = done
    ? t('today:stateComplete')
    : started
      ? t('today:stateInProgress')
      : programDay
        ? t('today:stateNotLogged')
        : '';

  const sessionTitle = programDay
    ? t('today:sessionDay', {
        label: isRTL ? programDay.labelAr ?? programDay.label : programDay.label,
      })
    : t('today:restDay');

  const bodyLabel = t('today:body');
  const bodyMeta = scan
    ? scan.bodyFatPercent === undefined
      ? t('today:planLastReading')
      : t('today:planBodyFat', { value: formatAmount(scan.bodyFatPercent, 1) })
    : t('today:planNoReading');

  return (
    <View style={style}>
      <Row
        title={sessionTitle}
        meta={programDay ? t(MUSCLE_KEYS[programDay.type]) : t('today:restDayBody')}
        trailing={
          sessionState ? (
            <Txt variant="label" color="muted" numberOfLines={1}>
              {sessionState}
            </Txt>
          ) : null
        }
        spoken={t('today:sessionCard', {
          title: sessionTitle,
          state: sessionState || t('today:stateNoSession'),
        })}
        hint={t('today:hintTraining')}
        onPress={onTraining}
      />

      <Row
        title={bodyLabel}
        meta={bodyMeta}
        trailing={
          scan ? (
            // Figure and unit in one text run: as siblings Arabic reorders them
            // and the weight glues itself to whatever lands beside it.
            <Txt variant="label" tabular numberOfLines={1} style={styles.figure}>
              {formatAmount(scan.weightKg, 1)}
              <Txt variant="caption" color="faint">
                {` ${t('units:kg')}`}
              </Txt>
            </Txt>
          ) : (
            <Txt variant="label" color="faint" numberOfLines={1}>
              —
            </Txt>
          )
        }
        spoken={
          scan
            ? t('today:rowSpoken', {
                label: bodyLabel,
                value: `${formatAmount(scan.weightKg, 1)} ${t('units:kg')}`,
                detail: bodyMeta,
              })
            : t('today:rowSpokenEmpty', { label: bodyLabel, detail: bodyMeta })
        }
        hint={t('today:hintBody')}
        onPress={onBody}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: layout.minTarget + spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: {
    borderRadius: radius.md,
  },
  text: {
    flex: 1,
  },
  meta: {
    marginTop: 2,
  },
  figure: {
    // A figure never shrinks or wraps to fit what is beside it.
    flexShrink: 0,
  },
});
