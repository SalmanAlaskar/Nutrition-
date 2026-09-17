import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Badge, IconButton, Txt } from '@/components/ui';
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

interface Figure {
  key: string;
  label: string;
  text: string;
}

/**
 * One reading in the history. The delete control sits beside the tap target, never
 * inside it, so the browser never renders a button within a button.
 */
export function ScanRow({ scan, onPress, onDelete, style }: ScanRowProps) {
  const { t } = useTranslation(['body', 'units']);
  const { colors } = useTheme();
  const { dayLabel } = useScanDate();

  const kg = t('units:kg');
  const day = dayLabel(scan.date);

  const stats: Figure[] = [
    {
      key: 'weight',
      label: t('shortWeight'),
      text: `${formatAmount(scan.weightKg, 1)} ${kg}`,
    },
  ];
  if (scan.skeletalMuscleKg !== undefined) {
    stats.push({
      key: 'muscle',
      label: t('shortMuscle'),
      text: `${formatAmount(scan.skeletalMuscleKg, 1)} ${kg}`,
    });
  }
  if (scan.bodyFatPercent !== undefined) {
    stats.push({
      key: 'fat',
      label: t('shortFat'),
      text: `${formatAmount(scan.bodyFatPercent, 1)} ${t('units:percent')}`,
    });
  } else if (scan.bodyFatKg !== undefined) {
    stats.push({
      key: 'fat',
      label: t('shortFat'),
      text: `${formatAmount(scan.bodyFatKg, 1)} ${kg}`,
    });
  }

  const spoken = t('rowSpoken', {
    day,
    figures: stats
      .map((figure) => t('figureSpoken', { label: figure.label, value: figure.text }))
      .join(t('listSeparator')),
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
          <Txt weight="semibold" numberOfLines={1} style={styles.day}>
            {day}
          </Txt>
          <Badge label={t(SOURCE_KEYS[scan.source])} />
        </View>

        <View style={styles.stats}>
          {stats.map((figure) => (
            <View key={figure.key} style={styles.stat}>
              <Txt variant="caption" color="faint" weight="semibold" numberOfLines={1}>
                {figure.label.toUpperCase()}
              </Txt>
              <Txt variant="label" weight="semibold" tabular numberOfLines={1}>
                {figure.text}
              </Txt>
            </View>
          ))}
        </View>

        {scan.device ? (
          <Txt variant="caption" color="faint" numberOfLines={1} style={styles.device}>
            {scan.device}
          </Txt>
        ) : null}
      </Pressable>

      <IconButton
        icon="trash-outline"
        variant="plain"
        size={18}
        onPress={onDelete}
        accessibilityLabel={t('rowDelete', { day })}
        style={styles.delete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 72,
    paddingEnd: spacing.sm,
  },
  tapTarget: {
    alignSelf: 'stretch',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    rowGap: spacing.sm,
  },
  head: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  day: {
    flexShrink: 1,
  },
  stats: {
    columnGap: spacing.xl,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
  },
  stat: {
    rowGap: 1,
  },
  device: {
    marginTop: -spacing.xs,
  },
  delete: {
    marginStart: spacing.xs,
  },
});
