import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Txt } from '@/components/ui';
import { spacing } from '@/theme';

/** Separates the facts of a reading. Kept in one text run so Arabic cannot reorder it. */
const DOT = ' · ';

export interface SheetHeaderProps {
  /** The quiet line above the heading: what this block is, and the machine. */
  eyebrow: string;
  /**
   * The heading. On a page that can show any reading, this is the day it was
   * taken: the one thing that tells you which reading you are looking at, so
   * it gets the size rather than a fixed phrase that is true of all of them.
   */
  title: string;
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
export function SheetHeader({ eyebrow, title, facts, note, style }: SheetHeaderProps) {
  const { t } = useTranslation('profile');

  const factLine = facts.join(DOT);

  return (
    <View style={style}>
      <Txt variant="label" color="muted" numberOfLines={1}>
        {eyebrow}
      </Txt>

      <Txt variant="title" numberOfLines={2} style={styles.title} accessibilityRole="header">
        {title}
      </Txt>

      {facts.length > 0 ? (
        <Txt
          color="muted"
          numberOfLines={2}
          style={styles.facts}
          accessibilityLabel={t('sheetFactsSpoken', { day: title, facts: factLine })}
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
