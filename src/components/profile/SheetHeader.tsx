import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Txt } from '@/components/ui';
import { spacing } from '@/theme';

/** Separates the facts of a reading. Kept in one text run so Arabic cannot reorder it. */
const DOT = ' · ';

export interface SheetHeaderProps {
  /** The day the reading was taken, already in the reader's language. */
  dayLabel: string;
  /** Machine the sheet came off, e.g. 'InBody 270'. */
  device?: string;
  /** Sex, age and height, each already carrying its own unit. */
  facts: string[];
  /** One quiet line under the facts, e.g. which units the sheet is printed in. */
  note?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The top of the printed sheet: when the reading was taken, on what, and the
 * three figures the machine prints beside the name. Everything arrives already
 * formatted, so the header stays a piece of layout rather than a second place
 * numbers are turned into text.
 */
export function SheetHeader({ dayLabel, device, facts, note, style }: SheetHeaderProps) {
  const { t } = useTranslation('profile');

  const taken = device ? `${device}${DOT}${dayLabel}` : dayLabel;
  const factLine = facts.join(DOT);

  return (
    <View style={style}>
      <Txt variant="label" color="muted" numberOfLines={1}>
        {taken}
      </Txt>

      <Txt variant="title" numberOfLines={2} style={styles.title} accessibilityRole="header">
        {t('sheetTitle')}
      </Txt>

      {facts.length > 0 ? (
        <Txt
          color="muted"
          numberOfLines={2}
          style={styles.facts}
          accessibilityLabel={t('sheetFactsSpoken', { day: dayLabel, facts: factLine })}
        >
          {factLine}
        </Txt>
      ) : null}

      {note ? (
        <Txt variant="caption" color="faint" style={styles.note}>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.xs,
  },
  facts: {
    marginTop: spacing.sm,
  },
  note: {
    marginTop: spacing.sm,
  },
});
