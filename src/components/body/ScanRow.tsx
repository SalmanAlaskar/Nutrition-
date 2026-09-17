import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Badge, IconButton, Txt } from '@/components/ui';
import { formatDayLabel } from '@/domain/date';
import { spacing, useTheme } from '@/theme';
import type { BodyScan, ScanSource } from '@/types';

export interface ScanRowProps {
  scan: BodyScan;
  /** Opens the reading for editing. */
  onPress: () => void;
  /** Asks for confirmation, then removes the reading. */
  onDelete: () => void;
  style?: StyleProp<ViewStyle>;
}

const SOURCE_LABELS: Record<ScanSource, string> = {
  manual: 'Typed in',
  qr: 'QR code',
  photo: 'Photo',
  document: 'PDF',
};

interface Figure {
  label: string;
  text: string;
}

function figures(scan: BodyScan): Figure[] {
  const list: Figure[] = [{ label: 'Weight', text: `${scan.weightKg.toFixed(1)} kg` }];
  if (scan.skeletalMuscleKg !== undefined) {
    list.push({ label: 'Muscle', text: `${scan.skeletalMuscleKg.toFixed(1)} kg` });
  }
  if (scan.bodyFatPercent !== undefined) {
    list.push({ label: 'Body fat', text: `${scan.bodyFatPercent.toFixed(1)} %` });
  } else if (scan.bodyFatKg !== undefined) {
    list.push({ label: 'Body fat', text: `${scan.bodyFatKg.toFixed(1)} kg` });
  }
  return list;
}

/**
 * One reading in the history. The delete control sits beside the tap target, never
 * inside it, so the browser never renders a button within a button.
 */
export function ScanRow({ scan, onPress, onDelete, style }: ScanRowProps) {
  const { colors } = useTheme();
  const stats = figures(scan);
  const day = formatDayLabel(scan.date);
  const spoken = `${day}. ${stats.map((figure) => `${figure.label} ${figure.text}`).join(', ')}.`;

  return (
    <View style={[styles.row, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint="Opens this reading for editing"
        style={({ pressed }) => [
          styles.tapTarget,
          pressed ? { backgroundColor: colors.surfaceAlt } : null,
        ]}
      >
        <View style={styles.head}>
          <Txt weight="semibold" numberOfLines={1} style={styles.day}>
            {day}
          </Txt>
          <Badge label={SOURCE_LABELS[scan.source]} />
        </View>

        <View style={styles.stats}>
          {stats.map((figure) => (
            <View key={figure.label} style={styles.stat}>
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
        accessibilityLabel={`Delete the reading from ${day}`}
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
    paddingRight: spacing.sm,
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
    marginLeft: spacing.xs,
  },
});
