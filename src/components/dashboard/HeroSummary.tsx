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
import { useTranslation } from 'react-i18next';

import { Button, Txt, type TxtColor } from '@/components/ui';
import { formatAmount, formatCount, formatDelta } from '@/domain/format';
import { mirrorIcon, useDirection } from '@/i18n';
import { radius, spacing, useTheme } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

/** The headline body figure: percent body fat when a scan has it, weight otherwise. */
export interface HeroBody {
  metric: 'bodyFat' | 'weight';
  value: number;
  /** False when the figure is the profile weight rather than a reading. */
  fromScan: boolean;
  /** Signed change since the previous reading, absent when there is only one. */
  delta?: number;
  /** Days between the two compared readings. */
  days?: number;
}

export interface HeroSummaryProps {
  /** Calories eaten today. */
  consumed: number;
  /** The day's calorie target, null until a profile exists. */
  targetCalories: number | null;
  /** Null until there is a weight to show. */
  body: HeroBody | null;
  /** Opens body composition, or the importer when there is no reading yet. */
  onPressBody: () => void;
  /** Opens the profile setup when there is no target. */
  onSetUpProfile: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Where today stands against the calorie target, and the one body number worth
 * leading with. Everything else on the page is detail behind these two.
 */
export function HeroSummary({
  consumed,
  targetCalories,
  body,
  onPressBody,
  onSetUpProfile,
  style,
}: HeroSummaryProps) {
  const { t } = useTranslation(['dashboard', 'units']);
  const { colors } = useTheme();
  const { isRTL } = useDirection();

  const target = targetCalories !== null && targetCalories > 0 ? targetCalories : null;
  const eaten = Math.max(0, Math.round(consumed));
  const remaining = target === null ? 0 : Math.round(target - eaten);
  const over = remaining < 0;
  const progress = target === null ? 0 : Math.min(1, Math.max(0, eaten / target));

  const figure = target === null ? eaten : Math.abs(remaining);
  const caption = target === null ? t('heroEatenToday') : over ? t('heroOver') : t('heroLeft');
  const barColor = over ? colors.warning : colors.accent;

  const bodyLabel =
    body === null
      ? t('heroNoScan')
      : body.metric === 'bodyFat'
        ? t('heroBodyFat')
        : t('heroWeight');
  const bodyUnit = body?.metric === 'bodyFat' ? t('units:percent') : t('units:kg');
  const bodyHint =
    body === null || !body.fromScan
      ? t('heroAddScan')
      : body.delta !== undefined && body.days !== undefined
        ? t('heroOverDays', { days: formatCount(body.days) })
        : t('heroFirstReading');

  // Lower body fat is the direction he is working in; weight depends on the
  // goal, so it is left uncoloured rather than judged.
  const deltaColor: TxtColor =
    body === null || body.delta === undefined || body.metric !== 'bodyFat'
      ? 'faint'
      : body.delta <= 0
        ? colors.accent
        : colors.warning;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.accentSoft, borderColor: colors.border },
        style,
      ]}
    >
      <Txt variant="caption" color="muted" weight="bold" style={styles.eyebrow}>
        {t('heroToday').toUpperCase()}
      </Txt>

      <View
        accessible
        accessibilityLabel={
          target === null
            ? `${formatCount(eaten)} ${caption}`
            : t('heroProgress', {
                eaten: formatCount(eaten),
                target: formatCount(target),
              })
        }
        style={styles.figureRow}
      >
        <Txt variant="display" weight="bold" tabular numberOfLines={1} style={styles.figure}>
          {formatCount(figure)}
        </Txt>
        <Txt variant="label" color="muted" weight="semibold" numberOfLines={1} style={styles.unit}>
          {caption}
        </Txt>
      </View>

      {target === null ? (
        <>
          <Txt color="muted" style={styles.note}>
            {t('heroNoTarget')}
          </Txt>
          <Button
            label={t('heroSetProfile')}
            onPress={onSetUpProfile}
            variant="secondary"
            size="sm"
            style={styles.action}
          />
        </>
      ) : (
        <>
          <View style={[styles.bar, { backgroundColor: colors.surface }]} {...DECORATIVE}>
            <View style={[styles.barFill, { backgroundColor: barColor, width: `${progress * 100}%` }]} />
          </View>
          <Txt variant="label" color="muted" tabular numberOfLines={1} style={styles.against}>
            {t('heroAgainst', { eaten: formatCount(eaten), target: formatCount(target) })}
          </Txt>
        </>
      )}

      <View style={[styles.separator, { backgroundColor: colors.border }]} {...DECORATIVE} />

      <Pressable
        onPress={onPressBody}
        accessibilityRole="button"
        accessibilityLabel={body === null || !body.fromScan ? t('heroAddScan') : t('heroOpenBody')}
        style={({ pressed }) => [styles.bodyRow, pressed ? styles.pressed : null]}
      >
        <View style={styles.bodyText}>
          <Txt variant="label" weight="semibold" numberOfLines={1}>
            {bodyLabel}
          </Txt>
          <Txt variant="caption" color="muted" numberOfLines={1}>
            {bodyHint}
          </Txt>
        </View>

        {body === null ? null : (
          <>
            {/* One run: as separate elements the figure and its unit collide
                in Arabic and read as a single longer number. */}
            <Txt variant="heading" numberOfLines={1} style={styles.bodyValue}>
              <Txt variant="heading" weight="bold" tabular>
                {formatAmount(body.value, 1)}
              </Txt>
              <Txt variant="caption" color="faint" weight="semibold">
                {` ${bodyUnit}`}
              </Txt>
            </Txt>
            {body.delta === undefined ? null : (
              <Txt
                variant="label"
                weight="semibold"
                color={deltaColor}
                tabular
                numberOfLines={1}
                style={styles.bodyDelta}
              >
                {formatDelta(body.delta, 1)}
              </Txt>
            )}
          </>
        )}

        <Ionicons
          name={mirrorIcon('chevron-forward', isRTL) as IconName}
          size={16}
          color={colors.textFaint}
          {...DECORATIVE}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: spacing.xl,
  },
  eyebrow: {
    letterSpacing: 1.1,
  },
  figureRow: {
    alignItems: 'baseline',
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  figure: {
    flexShrink: 0,
  },
  unit: {
    flexShrink: 1,
  },
  note: {
    marginTop: spacing.md,
  },
  action: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
  },
  bar: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 8,
    marginTop: spacing.lg,
    overflow: 'hidden',
    width: '100%',
  },
  barFill: {
    height: '100%',
  },
  against: {
    marginTop: spacing.sm,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    width: '100%',
  },
  bodyRow: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    minHeight: 44,
    paddingTop: spacing.sm,
  },
  bodyText: {
    flexShrink: 1,
    flexGrow: 1,
    rowGap: 1,
  },
  bodyValue: {
    flexShrink: 0,
  },
  bodyDelta: {
    marginStart: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
});
