import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps,
} from 'react-native';

import { ScanRow } from '@/components/body/ScanRow';
import { ScanTrendChart } from '@/components/body/ScanTrendChart';
import { SegmentalChart } from '@/components/body/SegmentalChart';
import { useScanDate } from '@/components/body/useScanDate';
import {
  AppHeader,
  Button,
  Divider,
  EmptyState,
  IconButton,
  LoadingView,
  Screen,
  Section,
  Txt,
} from '@/components/ui';
import {
  SCAN_METRICS,
  scanChange,
  type ScanChange,
  type ScanMetricDef,
} from '@/domain/bodyScan';
import { formatAmount, formatCount, formatDelta } from '@/domain/format';
import { useApp } from '@/state/AppStore';
import { layout, spacing, useTheme } from '@/theme';
import type { BodyScan } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Decoration only: the surrounding text already carries the meaning. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

/** The four a comparison is worth making on. Each one exists on ScanChange. */
type ChangeKey = 'weightKg' | 'skeletalMuscleKg' | 'bodyFatKg' | 'bodyFatPercent';

const CHANGE_KEYS: ChangeKey[] = ['weightKg', 'skeletalMuscleKg', 'bodyFatKg', 'bodyFatPercent'];

const CHANGE_METRICS: (ScanMetricDef & { key: ChangeKey })[] = SCAN_METRICS.filter(
  (metric): metric is ScanMetricDef & { key: ChangeKey } =>
    (CHANGE_KEYS as string[]).includes(metric.key),
);

/** Stands in for a figure there is nothing to compare against. */
const MISSING = '—';

/** Everything the lead block already shows, so the disclosure does not repeat it. */
const LEAD_KEYS: string[] = ['weightKg', 'skeletalMuscleKg', 'bodyFatPercent'];

/** Alert is a no-op on react-native-web, so the browser gets its own confirm. */
function confirmAction(options: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}): void {
  if (Platform.OS === 'web') {
    const canAsk = typeof window !== 'undefined' && typeof window.confirm === 'function';
    if (!canAsk || window.confirm(`${options.title}\n\n${options.message}`)) {
      options.onConfirm();
    }
    return;
  }
  Alert.alert(options.title, options.message, [
    { text: options.cancelLabel, style: 'cancel' },
    { text: options.confirmLabel, style: 'destructive', onPress: options.onConfirm },
  ]);
}

interface Movement {
  key: ChangeKey;
  label: string;
  /** 'up 0.9 kg', 'down 0.4 %', 'unchanged'. */
  text: string;
  /** Moving the way the owner wants it to. Carried by tone, never by a fill. */
  favourable: boolean;
}

export default function BodyScansScreen() {
  const router = useRouter();
  const { t } = useTranslation(['body', 'common', 'units']);
  const { colors } = useTheme();
  const { dayLabel, shortDay } = useScanDate();
  const { ready, bodyScans, deleteBodyScan } = useApp();

  const [showDetail, setShowDetail] = useState(false);
  const [showFirst, setShowFirst] = useState(false);

  /** Turns one signed difference into words. Direction first, never a verdict. */
  const movement = (
    metric: ScanMetricDef & { key: ChangeKey },
    change: ScanChange,
  ): Movement | null => {
    const delta = change[metric.key];
    if (delta === undefined || !Number.isFinite(delta)) return null;

    const label = t(metric.labelKey);
    // Below half the printed resolution the machines disagree with themselves.
    const threshold = 0.5 * 10 ** -metric.decimals;

    if (Math.abs(delta) < threshold) {
      return { key: metric.key, label, text: t('movedFlat'), favourable: false };
    }

    const up = delta > 0;
    const unit = metric.unitKey ? ` ${t(metric.unitKey)}` : '';
    const amount = `${formatAmount(Math.abs(delta), metric.decimals)}${unit}`;
    return {
      key: metric.key,
      label,
      text: t(up ? 'movedUp' : 'movedDown', { amount }),
      favourable: metric.higherIsBetter === null ? false : metric.higherIsBetter === up,
    };
  };

  const movements = (change: ScanChange): Movement[] => {
    const list: Movement[] = [];
    for (const metric of CHANGE_METRICS) {
      const moved = movement(metric, change);
      if (moved) list.push(moved);
    }
    return list;
  };

  // Storage sorts by day alone, so two readings from one day are ordered here by
  // the time they were taken.
  const ordered = useMemo(
    () =>
      [...bodyScans].sort((a, b) =>
        a.date === b.date ? a.takenAt.localeCompare(b.takenAt) : a.date.localeCompare(b.date),
      ),
    [bodyScans],
  );
  const newestFirst = useMemo(() => [...ordered].reverse(), [ordered]);
  const latest = newestFirst[0] ?? null;
  const previous = newestFirst[1] ?? null;
  const first = ordered[0] ?? null;

  const sinceLast = useMemo(
    () => (previous && latest ? scanChange(previous, latest) : null),
    [previous, latest],
  );
  const sinceFirst = useMemo(
    () => (first && latest && first.id !== latest.id ? scanChange(first, latest) : null),
    [first, latest],
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const openImport = useCallback(() => router.push('/body/import'), [router]);
  const openAdd = useCallback(() => router.push('/body/add'), [router]);

  const openScan = useCallback(
    (scan: BodyScan) => router.push({ pathname: '/body/add', params: { id: scan.id } }),
    [router],
  );

  const removeScan = useCallback(
    (scan: BodyScan) => {
      confirmAction({
        title: t('deleteTitle'),
        message: t('deleteMessage', { day: dayLabel(scan.date) }),
        confirmLabel: t('common:delete'),
        cancelLabel: t('common:cancel'),
        onConfirm: () => {
          void deleteBodyScan(scan.id);
        },
      });
    },
    [deleteBodyScan, dayLabel, t],
  );

  const spanLine = (change: ScanChange): string => {
    const from = shortDay(change.fromDate);
    const to = shortDay(change.toDate);
    if (change.days <= 0) return t('spanSameDay', { from, to });
    if (change.days === 1) return t('spanOneDay', { from, to });
    return t('spanDays', { from, to, days: formatCount(change.days) });
  };

  /** The movements of one comparison, as lines of text with no marks at all. */
  const changeRows = (change: ScanChange) => {
    const moved = movements(change);
    if (moved.length === 0) return null;
    return (
      <View style={styles.changeList}>
        {moved.map((item) => (
          <View
            key={item.key}
            accessible
            accessibilityLabel={t('movementSpoken', { label: item.label, change: item.text })}
            style={styles.changeRow}
          >
            <Txt variant="label" color="muted" style={styles.changeLabel} numberOfLines={2}>
              {item.label}
            </Txt>
            <Txt
              variant="label"
              color={item.favourable ? 'text' : 'muted'}
              tabular
              numberOfLines={1}
            >
              {item.text}
            </Txt>
          </View>
        ))}
      </View>
    );
  };

  /** A heading that opens something. The chevron is the only icon it needs. */
  const disclosure = (title: string, open: boolean, onToggle: () => void) => (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [styles.disclosure, pressed ? styles.pressed : null]}
    >
      <Txt variant="label" weight="semibold" style={styles.disclosureText} numberOfLines={2}>
        {title}
      </Txt>
      <View {...DECORATIVE}>
        <Ionicons
          name={(open ? 'chevron-up' : 'chevron-down') as IconName}
          size={16}
          color={colors.textFaint}
        />
      </View>
    </Pressable>
  );

  if (!ready) {
    return (
      <Screen edges={['top', 'bottom']}>
        <AppHeader title={t('title')} onBack={goBack} />
        <LoadingView message={t('loading')} />
      </Screen>
    );
  }

  if (!latest) {
    return (
      <Screen scroll edges={['top', 'bottom']}>
        <AppHeader title={t('title')} onBack={goBack} />
        <EmptyState
          icon="body-outline"
          title={t('emptyTitle')}
          message={t('emptyMessage')}
          actionLabel={t('emptyAction')}
          onAction={openImport}
          style={styles.empty}
        />
        <Button label={t('typeItIn')} variant="ghost" onPress={openAdd} style={styles.emptyAlt} />
      </Screen>
    );
  }

  /**
   * The two figures worth leading with beside the weight. Muscle is the one
   * thing this screen is about, so it is the only accent on the page.
   */
  const highlights: {
    key: string;
    label: string;
    value: string;
    unit: string;
    accent: boolean;
    /** Short enough for a column; the sentence lives in the spoken label. */
    delta: string;
    spokenDelta: string;
  }[] = [];
  const deltaChip = (delta: number | undefined, unit: string): string =>
    delta === undefined ? MISSING : `${formatDelta(delta, 1)} ${unit}`;
  const deltaSpoken = (delta: number | undefined): string =>
    delta === undefined ? t('noEarlier') : `${formatDelta(delta, 1)} ${t('deltaSince')}`;
  if (latest.skeletalMuscleKg !== undefined) {
    highlights.push({
      key: 'muscle',
      label: t('shortMuscle'),
      value: formatAmount(latest.skeletalMuscleKg, 1),
      unit: t('units:kg'),
      accent: true,
      delta: deltaChip(sinceLast?.skeletalMuscleKg, t('units:kg')),
      spokenDelta: deltaSpoken(sinceLast?.skeletalMuscleKg),
    });
  }
  if (latest.bodyFatPercent !== undefined) {
    highlights.push({
      key: 'fat',
      label: t('shortFat'),
      value: formatAmount(latest.bodyFatPercent, 1),
      unit: t('units:percent'),
      accent: false,
      delta: deltaChip(sinceLast?.bodyFatPercent, t('units:percent')),
      spokenDelta: deltaSpoken(sinceLast?.bodyFatPercent),
    });
  }

  const rest = SCAN_METRICS.filter((metric) => {
    if (LEAD_KEYS.includes(metric.key)) return false;
    const value = latest[metric.key];
    return typeof value === 'number' && Number.isFinite(value);
  });

  const segmentalSubtitle = previous
    ? t('segmentalSince', { day: shortDay(previous.date) })
    : dayLabel(latest.date);

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <AppHeader
        title={t('title')}
        subtitle={
          ordered.length === 1
            ? t('readingOne')
            : t('readingMany', { n: formatCount(ordered.length) })
        }
        onBack={goBack}
        right={
          <IconButton
            icon="add"
            variant="surface"
            onPress={openImport}
            accessibilityLabel={t('addReading')}
          />
        }
      />

      <Section first>
        <Txt variant="label" color="muted" numberOfLines={1}>
          {t('latest')}
        </Txt>
        {/*
          The unit is nested in the same run: as a sibling, Arabic reorders it.
          The run sits in a row of its own because a figure carries no reading
          direction of its own, and as a row child it is placed by the layout.
        */}
        <View style={styles.line}>
          <Txt
            variant="display"
            tabular
            numberOfLines={1}
            style={styles.leadFigure}
            accessibilityLabel={t('figureSpoken', {
              label: t('fieldWeight'),
              value: `${formatAmount(latest.weightKg, 1)} ${t('units:kg')}`,
            })}
          >
            {formatAmount(latest.weightKg, 1)}
            <Txt variant="label" color="faint" weight="medium">
              {` ${t('units:kg')}`}
            </Txt>
          </Txt>
        </View>
        <Txt variant="label" color="muted" numberOfLines={1}>
          {latest.device ? `${dayLabel(latest.date)} · ${latest.device}` : dayLabel(latest.date)}
        </Txt>

        {highlights.length > 0 ? (
          <View style={styles.highlights}>
            {highlights.map((item) => (
              <View
                key={item.key}
                accessible
                accessibilityLabel={`${t('figureSpoken', {
                  label: item.label,
                  value: `${item.value} ${item.unit}`,
                })} ${item.spokenDelta}`}
                style={styles.highlight}
              >
                <Txt variant="label" color="muted" numberOfLines={1}>
                  {item.label}
                </Txt>
                <View style={styles.line}>
                  <Txt
                    variant="metric"
                    color={item.accent ? 'accent' : 'text'}
                    tabular
                    numberOfLines={1}
                    style={styles.highlightValue}
                  >
                    {item.value}
                    <Txt variant="label" color="faint" weight="medium">
                      {` ${item.unit}`}
                    </Txt>
                  </Txt>
                </View>
                <View style={styles.line}>
                  <Txt variant="caption" color="faint" tabular numberOfLines={1}>
                    {item.delta}
                  </Txt>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </Section>

      {sinceLast ? (
        <Section title={t('sinceLast')} subtitle={spanLine(sinceLast)} gap="tight">
          {changeRows(sinceLast)}

          {sinceFirst && sinceFirst.fromDate !== sinceLast.fromDate ? (
            <View style={styles.nested}>
              {disclosure(t('sinceFirst'), showFirst, () => setShowFirst((open) => !open))}
              {showFirst ? changeRows(sinceFirst) : null}
            </View>
          ) : null}
        </Section>
      ) : (
        <Section>
          <Txt variant="label" color="muted">
            {t('firstReading')}
          </Txt>
        </Section>
      )}

      {rest.length > 0 ? (
        <Section gap="tight">
          {disclosure(t('detailTitle'), showDetail, () => setShowDetail((open) => !open))}
          {showDetail ? (
            <View style={styles.detailBody}>
              <Txt variant="caption" color="faint" style={styles.detailHint}>
                {t('detailHint')}
              </Txt>
              {rest.map((metric) => {
                const value = latest[metric.key] ?? 0;
                const text = `${formatAmount(value, metric.decimals)}${
                  metric.unitKey ? ` ${t(metric.unitKey)}` : ''
                }`;
                return (
                  <View
                    key={metric.key}
                    accessible
                    accessibilityLabel={t('figureSpoken', {
                      label: t(metric.labelKey),
                      value: text,
                    })}
                    style={styles.changeRow}
                  >
                    <Txt variant="label" color="muted" style={styles.changeLabel} numberOfLines={2}>
                      {t(metric.labelKey)}
                    </Txt>
                    <Txt variant="label" tabular numberOfLines={1}>
                      {text}
                    </Txt>
                  </View>
                );
              })}
            </View>
          ) : null}
        </Section>
      ) : null}

      <Section title={t('trend')}>
        <ScanTrendChart scans={ordered} />
      </Section>

      {latest.segmentalLeanKg || latest.segmentalFatKg ? (
        <Section title={t('segmental')} subtitle={segmentalSubtitle} gap="none">
          <SegmentalChart scan={latest} previous={previous ?? undefined} />
        </Section>
      ) : null}

      <Section title={t('allReadings')} gap="tight">
        {newestFirst.map((scan, index) => (
          <React.Fragment key={scan.id}>
            {index > 0 ? <Divider /> : null}
            <ScanRow scan={scan} onPress={() => openScan(scan)} onDelete={() => removeScan(scan)} />
          </React.Fragment>
        ))}
      </Section>

      <Section>
        {/*
          The accent on this screen belongs to the muscle figure at the top, so
          the two ways in sit quietly underneath the readings they add to.
        */}
        <View style={styles.actions}>
          <Button label={t('emptyAction')} variant="secondary" onPress={openImport} fullWidth />
          <Button label={t('typeItIn')} variant="ghost" onPress={openAdd} fullWidth />
        </View>
        <Txt variant="caption" color="faint" style={styles.foot}>
          {t('disclaimer')}
        </Txt>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // A figure made only of digits has no reading direction of its own, so it is
  // laid out as a row child rather than aligned as text.
  line: {
    flexDirection: 'row',
  },
  leadFigure: {
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  highlights: {
    columnGap: spacing.xxl,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xl,
    rowGap: spacing.lg,
  },
  highlight: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 112,
  },
  highlightValue: {
    marginBottom: 2,
    marginTop: spacing.xs,
  },
  changeList: {
    marginTop: spacing.sm,
  },
  changeRow: {
    alignItems: 'baseline',
    columnGap: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 30,
  },
  changeLabel: {
    flexShrink: 1,
  },
  nested: {
    marginTop: spacing.md,
  },
  disclosure: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: layout.minTarget,
  },
  pressed: {
    opacity: 0.6,
  },
  disclosureText: {
    flex: 1,
  },
  detailBody: {
    marginTop: spacing.xs,
  },
  detailHint: {
    marginBottom: spacing.sm,
    maxWidth: layout.maxTextWidth,
  },
  actions: {
    rowGap: spacing.md,
  },
  foot: {
    marginTop: spacing.xl,
    maxWidth: layout.maxTextWidth,
  },
  empty: {
    marginTop: spacing.xl,
  },
  emptyAlt: {
    alignSelf: 'flex-start',
  },
});
