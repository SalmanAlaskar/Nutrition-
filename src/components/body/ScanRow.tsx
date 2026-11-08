import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconButton, Txt } from '@/components/ui';
import { formatAmount } from '@/domain/format';
import { spacing, useTheme } from '@/theme';
import type { BodyScan, ScanSource } from '@/types';

import { useScanDate } from './useScanDate';

export interface ScanRowProps {
  scan: BodyScan;
  /** Opens the reading for editing. */
  onPress: () => void;
  /** Asks for confirmation, then removes the reading. */
  onDelete: () => void;
  style?: StyleProp<ViewStyle>;
}

const SOURCE_KEYS = {
  manual: 'sourceManual',
  qr: 'sourceQr',
  photo: 'sourcePhoto',
  document: 'sourceDocument',
} as const satisfies Record<ScanSource, string>;

/**
 * One reading in the history, read as two lines of text: the day with the
 * weight it carried, then muscle and fat underneath. The delete control sits
 * beside the tap target, never inside it, so the browser never renders a
 * button within a button.
 */
export function ScanRow({ scan, onPress, onDelete, style }: ScanRowProps) {
  const { t } = useTranslation(['body', 'units']);
  const { colors } = useTheme();
  const { dayLabel } = useScanDate();

  const kg = t('units:kg');
  const day = dayLabel(scan.date);
  const weight = `${formatAmount(scan.weightKg, 1)} ${kg}`;

  // Each figure is one text run with its label and unit: rendered as siblings,
  // Arabic reorders them and two adjacent numbers collide into one.
  const secondary: { key: string; text: string; spoken: string }[] = [];
  if (scan.skeletalMuscleKg !== undefined) {
    const amount = `${formatAmount(scan.skeletalMuscleKg, 1)} ${kg}`;
    secondary.push({
      key: 'muscle',
      text: `${t('shortMuscle')} ${amount}`,
      spoken: t('figureSpoken', { label: t('shortMuscle'), value: amount }),
    });
  }
  const fatAmount =
    scan.bodyFatPercent !== undefined
      ? `${formatAmount(scan.bodyFatPercent, 1)} ${t('units:percent')}`
      : scan.bodyFatKg !== undefined
        ? `${formatAmount(scan.bodyFatKg, 1)} ${kg}`
        : null;
  if (fatAmount !== null) {
    secondary.push({
      key: 'fat',
      text: `${t('shortFat')} ${fatAmount}`,
      spoken: t('figureSpoken', { label: t('shortFat'), value: fatAmount }),
    });
  }

  const spoken = t('rowSpoken', {
    day,
    figures: [
      t('figureSpoken', { label: t('shortWeight'), value: weight }),
      ...secondary.map((figure) => figure.spoken),
      t(SOURCE_KEYS[scan.source]),
    ].join(t('listSeparator')),
  });

  return (
    <View style={[styles.row, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint={t('rowHint')}
        style={({ pressed }) => [
          styles.tapTarget,
          pressed ? { backgroundColor: colors.surfaceAlt } : null,
        ]}
      >
        <View style={styles.head}>
          <Txt numberOfLines={1} style={styles.day}>
            {day}
          </Txt>
          <Txt variant="label" weight="semibold" tabular numberOfLines={1}>
            {weight}
          </Txt>
        </View>

        {secondary.length > 0 ? (
          <View style={styles.figures}>
            {secondary.map((figure) => (
              <Txt key={figure.key} variant="label" color="muted" tabular numberOfLines={1}>
                {figure.text}
              </Txt>
            ))}
          </View>
        ) : null}
      </Pressable>

      <IconButton
        icon="trash-outline"
        variant="plain"
        size={17}
        onPress={onDelete}
        accessibilityLabel={t('rowDelete', { day })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 60,
  },
  tapTarget: {
    alignSelf: 'stretch',
    flex: 1,
    justifyContent: 'center',
    paddingEnd: spacing.sm,
    paddingVertical: spacing.md,
    rowGap: spacing.xs,
  },
  head: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  day: {
    flexShrink: 1,
  },
  figures: {
    columnGap: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 2,
  },
});
