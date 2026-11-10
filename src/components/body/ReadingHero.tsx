import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Txt, type TxtAlign, type TxtColor } from '@/components/ui';
import { useDirection } from '@/i18n';
import { spacing } from '@/theme';

/** Separates the change from the span it was measured over. One run, so Arabic cannot reorder it. */
const DOT = ' · ';

export type ReadingHeroTone = 'good' | 'bad' | 'flat';

/**
 * A change is good news or bad news, never an alarm: the warning amber, not the
 * danger red, and a flat reading is simply quiet.
 */
const TONE_COLOR: Record<ReadingHeroTone, TxtColor> = {
  good: 'success',
  bad: 'warning',
  flat: 'muted',
};

export interface ReadingHeroMetric {
  key: string;
  /** Already translated. */
  label: string;
  /** Already formatted figure, no unit. */
  value: string;
  /** Already translated unit; '' for a bare index. */
  unit: string;
  /** Already formatted signed change against the previous reading, no unit. Omitted when there is nothing to compare with. */
  delta?: string;
  deltaTone?: ReadingHeroTone;
  accent?: boolean;
}

export interface ReadingHeroProps {
  /** One to four. The first is the lead figure. */
  metrics: ReadingHeroMetric[];
  /** 'since 8 Sep', or '' when this is the first reading. */
  sinceLabel: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The headline figures of the reading on screen, and what each one did since
 * the reading before it.
 *
 * Every figure, unit and change arrives already formatted and already
 * translated, the way SheetHeader takes its facts: the screen owns which
 * reading is selected and what it is being compared with, and this stays a
 * piece of layout rather than a second place numbers are turned into text.
 */
export function ReadingHero({ metrics, sinceLabel, style }: ReadingHeroProps) {
  const { t } = useTranslation(['profile', 'body']);
  const { isRTL } = useDirection();

  /*
    The physical edge, not the logical one. A text node carries dir="auto" and
    resolves it from its own content: "36.5 كجم" is Arabic and starts on the
    right, while "81" and "21.1 ٪" have no strong character at all and start on
    the left. Aligning each figure logically therefore puts the cells of one row
    on opposite edges, each disagreeing with the label above it. One physical
    edge for every cell is the only thing that holds whatever the unit is.
  */
  const figureStart: TxtAlign = isRTL ? 'right' : 'left';

  if (metrics.length === 0) return null;

  const [lead, ...rest] = metrics;

  // With nothing earlier to compare against, the span line says so rather than
  // leaving the figure sitting on its own.
  const span = sinceLabel || t('profile:heroFirst');
  const separator = t('body:listSeparator');

  const changeOf = (metric: ReadingHeroMetric) =>
    metric.delta === undefined
      ? ''
      : `${metric.delta}${metric.unit ? ` ${metric.unit}` : ''}`;

  // One sentence per figure. The span is spoken with the lead only, because
  // that is the one place the screen prints it.
  const spokenOf = (metric: ReadingHeroMetric, tail: string) =>
    [
      t('profile:rowSpoken', {
        label: metric.label,
        value: metric.value,
        unit: metric.unit,
      }).trim(),
      changeOf(metric),
      tail,
    ]
      .filter(Boolean)
      .join(separator);

  return (
    <View style={style}>
      <View accessible accessibilityLabel={spokenOf(lead, span)}>
        <Txt variant="label" color="muted" numberOfLines={1}>
          {lead.label}
        </Txt>

        {/* Figure and unit are one run: as siblings Arabic reorders them, and a
            unit opening on a digit glues itself onto the number. The unit is
            carried at heading size here — at label size it disappears beside a
            display figure. */}
        <Txt
          variant="display"
          color={lead.accent ? 'accent' : 'text'}
          tabular
          numberOfLines={1}
          align={figureStart}
          style={styles.leadValue}
        >
          {lead.value}
          {lead.unit ? (
            <Txt variant="heading" color="faint" weight="medium">
              {` ${lead.unit}`}
            </Txt>
          ) : null}
        </Txt>

        {lead.delta === undefined ? (
          <Txt variant="caption" color="faint" numberOfLines={1} style={styles.leadChange}>
            {span}
          </Txt>
        ) : (
          <Txt
            variant="label"
            color={TONE_COLOR[lead.deltaTone ?? 'flat']}
            tabular
            numberOfLines={1}
            align={figureStart}
            style={styles.leadChange}
          >
            {lead.delta}
            {lead.unit ? (
              <Txt variant="label" color="faint">
                {` ${lead.unit}`}
              </Txt>
            ) : null}
            <Txt variant="caption" color="faint">
              {`${DOT}${span}`}
            </Txt>
          </Txt>
        )}
      </View>

      {rest.length > 0 ? (
        <View style={styles.row}>
          {rest.map((metric) => (
            <View key={metric.key} accessible accessibilityLabel={spokenOf(metric, '')} style={styles.cell}>
              <Txt variant="label" color="muted" numberOfLines={1}>
                {metric.label}
              </Txt>

              <Txt
                variant="metric"
                color={metric.accent ? 'accent' : 'text'}
                tabular
                numberOfLines={1}
                align={figureStart}
                style={styles.cellValue}
              >
                {metric.value}
                {metric.unit ? (
                  <Txt variant="label" color="faint" weight="medium">
                    {` ${metric.unit}`}
                  </Txt>
                ) : null}
              </Txt>

              {metric.delta === undefined ? null : (
                <Txt
                  variant="caption"
                  color={TONE_COLOR[metric.deltaTone ?? 'flat']}
                  tabular
                  numberOfLines={1}
                  align={figureStart}
                  style={styles.cellChange}
                >
                  {metric.delta}
                  {metric.unit ? (
                    <Txt variant="caption" color="faint">
                      {` ${metric.unit}`}
                    </Txt>
                  ) : null}
                </Txt>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // A figure never shrinks or wraps to fit its column.
  leadValue: {
    flexShrink: 0,
    marginTop: spacing.xs,
  },
  leadChange: {
    marginTop: spacing.sm,
  },
  // Three secondary figures fit one phone row at this width; a fourth wraps to
  // a second row of two rather than squeezing all four.
  row: {
    columnGap: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xl,
    rowGap: spacing.lg,
  },
  cell: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 100,
  },
  cellValue: {
    flexShrink: 0,
    marginTop: spacing.xs,
  },
  cellChange: {
    marginTop: spacing.xs,
  },
});
