import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Button, Card, Txt } from '@/components/ui';
import { parseDateKey } from '@/domain/date';
import { formatCount } from '@/domain/format';
import type {
  Insight,
  InsightCountNoun,
  InsightKey,
  InsightParam,
  InsightSegment,
} from '@/domain/insights';
import { mirrorIcon, useDirection } from '@/i18n';
import { radius, spacing, useTheme, type Palette } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Decoration only: the text beside it already carries the meaning. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

/** One palette slot per tone, used for the edge bar and the glyph. */
const TONE_COLOR: Record<Insight['tone'], keyof Palette> = {
  positive: 'success',
  neutral: 'accent',
  warning: 'warning',
};

/**
 * Arabic puts a counted noun in four different forms; English in two. The
 * engine only ever sends the number, so the form is picked here, against the
 * language actually on screen.
 */
const COUNT_KEYS = {
  day: {
    one: 'dayCountOne',
    two: 'dayCountTwo',
    few: 'dayCountFew',
    many: 'dayCountMany',
  },
  meal: {
    one: 'mealCountOne',
    two: 'mealCountTwo',
    few: 'mealCountFew',
    many: 'mealCountMany',
  },
  session: {
    one: 'sessionCountOne',
    two: 'sessionCountTwo',
    few: 'sessionCountFew',
    many: 'sessionCountMany',
  },
} as const satisfies Record<InsightCountNoun, Record<string, string>>;

const SEGMENT_KEYS = {
  rightArm: 'segRightArm',
  leftArm: 'segLeftArm',
  trunk: 'segTrunk',
  rightLeg: 'segRightLeg',
  leftLeg: 'segLeftLeg',
  bothArms: 'segBothArms',
  bothLegs: 'segBothLegs',
} as const satisfies Record<InsightSegment, string>;

const WEEKDAY_KEYS = [
  'weekdaySunday',
  'weekdayMonday',
  'weekdayTuesday',
  'weekdayWednesday',
  'weekdayThursday',
  'weekdayFriday',
  'weekdaySaturday',
] as const;

const MONTH_KEYS = [
  'monthJan',
  'monthFeb',
  'monthMar',
  'monthApr',
  'monthMay',
  'monthJun',
  'monthJul',
  'monthAug',
  'monthSep',
  'monthOct',
  'monthNov',
  'monthDec',
] as const;

/** 1, 2, 3-10 and the rest: the four buckets Arabic actually distinguishes. */
function countBucket(value: number): 'one' | 'two' | 'few' | 'many' {
  const size = Math.abs(Math.round(value));
  if (size === 1) return 'one';
  if (size === 2) return 'two';
  const tail = size % 100;
  return tail >= 3 && tail <= 10 ? 'few' : 'many';
}

export interface InsightCardProps {
  insight: Insight;
  style?: StyleProp<ViewStyle>;
}

/**
 * One observation: a tone-coloured edge, its glyph, the headline, the numbers
 * behind it and, when the insight offers one, a button that opens the screen
 * where it can be acted on.
 */
export function InsightCard({ insight, style }: InsightCardProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const { language, isRTL } = useDirection();
  const { t } = useTranslation('insights');
  const { t: tc } = useTranslation('common');

  const { actionHref, actionLabelKey, titleKey, detailKey, params } = insight;
  const accent = colors[TONE_COLOR[insight.tone]];

  const handleAction = useCallback(() => {
    if (actionHref) router.push(actionHref);
  }, [router, actionHref]);

  const { title, detail } = useMemo(() => {
    /** Folds a short list into one phrase: 'a, b and c', 'أ، ب وج'. */
    const join = (parts: string[]): string => {
      let out = parts[0] ?? '';
      for (let i = 1; i < parts.length; i += 1) {
        const next = parts[i] ?? '';
        out =
          i === parts.length - 1
            ? tc('joinPair', { a: out, b: next })
            : tc('joinList', { a: out, b: next });
      }
      return out;
    };

    const resolve = (value: InsightParam): string | number => {
      if (typeof value === 'string' || typeof value === 'number') return value;

      switch (value.kind) {
        case 'count':
          return t(COUNT_KEYS[value.noun][countBucket(value.value)], {
            n: formatCount(value.value),
          });
        case 'date': {
          const date = parseDateKey(value.value);
          return `${date.getDate()} ${tc(MONTH_KEYS[date.getMonth()] ?? 'monthJan')}`;
        }
        case 'weekdays':
          return join(value.value.map((index) => tc(WEEKDAY_KEYS[index] ?? 'weekdaySunday')));
        case 'segments':
          return join(value.value.map((segment) => t(SEGMENT_KEYS[segment])));
        case 'name':
          return language === 'ar' && value.ar ? value.ar : value.en;
      }
    };

    const filled: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(params ?? {})) {
      filled[key] = resolve(value);
    }

    // t() narrows its options to the placeholders of whichever key is passed.
    // These two keys are picked at runtime, so the values go over as a map.
    const translate = t as (key: InsightKey, values: Record<string, string | number>) => string;
    return { title: translate(titleKey, filled), detail: translate(detailKey, filled) };
  }, [t, tc, language, titleKey, detailKey, params]);

  return (
    <Card padded={false} style={style}>
      <View style={styles.row}>
        <View style={[styles.edge, { backgroundColor: accent }]} {...DECORATIVE} />

        <View style={styles.body}>
          <View accessible accessibilityLabel={`${title}. ${detail}`}>
            <View style={styles.header}>
              <View
                style={[styles.glyph, { backgroundColor: colors.surfaceAlt }]}
                {...DECORATIVE}
              >
                <Ionicons name={insight.icon as IconName} size={18} color={accent} />
              </View>
              <Txt variant="body" weight="semibold" style={styles.title}>
                {title}
              </Txt>
            </View>

            <Txt variant="label" color="muted" style={styles.detail}>
              {detail}
            </Txt>
          </View>

          {actionHref && actionLabelKey ? (
            <Button
              label={t(actionLabelKey)}
              onPress={handleAction}
              variant="secondary"
              size="sm"
              iconRight={mirrorIcon('arrow-forward', isRTL)}
              style={styles.action}
            />
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  edge: {
    width: 4,
  },
  body: {
    flex: 1,
    padding: spacing.lg,
  },
  header: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  glyph: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  title: {
    flex: 1,
  },
  detail: {
    marginTop: spacing.sm,
  },
  action: {
    marginTop: spacing.md,
  },
});
