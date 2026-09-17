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
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ScanRow } from '@/components/body/ScanRow';
import { ScanTrendChart } from '@/components/body/ScanTrendChart';
import { SegmentalChart } from '@/components/body/SegmentalChart';
import { useScanDate } from '@/components/body/useScanDate';
import {
  AppHeader,
  Button,
  Card,
  Divider,
  EmptyState,
  IconButton,
  LoadingView,
  Screen,
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
import { radius, spacing, useTheme } from '@/theme';
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

/** Everything the hero already shows, so the disclosure does not repeat it. */
const HERO_KEYS: string[] = ['weightKg', 'skeletalMuscleKg', 'bodyFatPercent'];

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
  icon: IconName;
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
      return { key: metric.key, label, text: t('movedFlat'), icon: 'remove', favourable: false };
    }

    const up = delta > 0;
    const unit = metric.unitKey ? ` ${t(metric.unitKey)}` : '';
    const amount = `${formatAmount(Math.abs(delta), metric.decimals)}${unit}`;
    return {
      key: metric.key,
      label,
      text: t(up ? 'movedUp' : 'movedDown', { amount }),
      icon: up ? 'arrow-up' : 'arrow-down',
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

  const changeRows = (change: ScanChange) => {
    const moved = movements(change);
    if (moved.length === 0) return null;
    return (
      <>
        <Txt variant="caption" color="faint" style={styles.changeSpan}>
          {spanLine(change)}
        </Txt>
        {moved.map((item) => (
          <View
            key={item.key}
            accessible
            accessibilityLabel={t('movementSpoken', { label: item.label, change: item.text })}
            style={styles.changeRow}
          >
            <View {...DECORATIVE}>
              <Ionicons
                name={item.icon}
                size={15}
                color={item.favourable ? colors.success : colors.textMuted}
              />
            </View>
            <Txt variant="label" color="muted" style={styles.changeLabel} numberOfLines={1}>
              {item.label}
            </Txt>
            <Txt
              variant="label"
              weight="semibold"
              color={item.favourable ? 'success' : 'text'}
              tabular
              numberOfLines={1}
            >
              {item.text}
            </Txt>
          </View>
        ))}
      </>
    );
  };

  const disclosure = (
    title: string,
    open: boolean,
    onToggle: () => void,
    style?: StyleProp<ViewStyle>,
  ) => (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [
        styles.disclosure,
        style,
        pressed ? { backgroundColor: colors.surfaceAlt } : null,
      ]}
    >
      <Txt variant="label" weight="semibold" style={styles.disclosureText} numberOfLines={2}>
        {title}
      </Txt>
      <View {...DECORATIVE}>
        <Ionicons
          name={(open ? 'chevron-up' : 'chevron-down') as IconName}
          size={18}
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

  // The two figures worth leading with beside the weight, when the sheet had them.
  const highlights: {
    key: string;
    label: string;
    value: string;
    /** Short enough for a chip; the sentence lives in the spoken label. */
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
      value: `${formatAmount(latest.skeletalMuscleKg, 1)} ${t('units:kg')}`,
      delta: deltaChip(sinceLast?.skeletalMuscleKg, t('units:kg')),
      spokenDelta: deltaSpoken(sinceLast?.skeletalMuscleKg),
    });
  }
  if (latest.bodyFatPercent !== undefined) {
    highlights.push({
      key: 'fat',
      label: t('shortFat'),
      value: `${formatAmount(latest.bodyFatPercent, 1)} ${t('units:percent')}`,
      delta: deltaChip(sinceLast?.bodyFatPercent, t('units:percent')),
      spokenDelta: deltaSpoken(sinceLast?.bodyFatPercent),
    });
  }

  const rest = SCAN_METRICS.filter((metric) => {
    if (HERO_KEYS.includes(metric.key)) return false;
    const value = latest[metric.key];
    return typeof value === 'number' && Number.isFinite(value);
  });

  return (
    <Screen scroll edges={['top', 'bottom']} contentStyle={styles.content}>
      <AppHeader
        title={t('title')}
        subtitle={
          ordered.length === 1 ? t('readingOne') : t('readingMany', { n: formatCount(ordered.length) })
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

      <View style={[styles.hero, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
        <Txt variant="caption" color="muted" weight="bold">
          {t('latest').toUpperCase()}
        </Txt>
        <View
          accessible
          accessibilityLabel={t('figureSpoken', {
            label: t('fieldWeight'),
            value: `${formatAmount(latest.weightKg, 1)} ${t('units:kg')}`,
          })}
          style={styles.heroFigure}
        >
          <Txt variant="display" tabular>
            {formatAmount(latest.weightKg, 1)}
          </Txt>
          <Txt variant="label" color="faint" weight="medium" style={styles.heroUnit}>
            {t('units:kg')}
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
                  value: item.value,
                })} ${item.spokenDelta}`}
                style={[styles.highlight, { backgroundColor: colors.surface }]}
              >
                <Txt variant="caption" color="faint" weight="bold" numberOfLines={1}>
                  {item.label.toUpperCase()}
                </Txt>
                <Txt weight="semibold" tabular numberOfLines={1}>
                  {item.value}
                </Txt>
                <Txt variant="caption" color="faint" tabular numberOfLines={1}>
                  {item.delta}
                </Txt>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {sinceLast ? (
        <Card style={styles.block}>
          <Txt variant="caption" color="faint" weight="bold">
            {t('sinceLast').toUpperCase()}
          </Txt>
          {changeRows(sinceLast)}

          {sinceFirst && sinceFirst.fromDate !== sinceLast.fromDate ? (
            <>
              <Divider style={styles.innerDivider} />
              {disclosure(t('sinceFirst'), showFirst, () => setShowFirst((open) => !open))}
              {showFirst ? changeRows(sinceFirst) : null}
            </>
          ) : null}
        </Card>
      ) : (
        <Card style={styles.block}>
          <Txt variant="label" color="muted">
            {t('firstReading')}
          </Txt>
        </Card>
      )}

      {rest.length > 0 ? (
        <Card padded={false} style={styles.block}>
          {disclosure(t('detailTitle'), showDetail, () => setShowDetail((open) => !open), styles.disclosureInset)}
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
                    accessibilityLabel={t('figureSpoken', { label: t(metric.labelKey), value: text })}
                    style={styles.detailRow}
                  >
                    <Txt variant="label" color="muted" style={styles.detailLabel} numberOfLines={2}>
                      {t(metric.labelKey)}
                    </Txt>
                    <Txt variant="label" weight="semibold" tabular numberOfLines={1}>
                      {text}
                    </Txt>
                  </View>
                );
              })}
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card style={styles.block}>
        <Txt variant="caption" color="faint" weight="bold" style={styles.cardTitle}>
          {t('trend').toUpperCase()}
        </Txt>
        <ScanTrendChart scans={ordered} />
      </Card>

      {latest.segmentalLeanKg || latest.segmentalFatKg ? (
        <Card style={styles.block}>
          <Txt variant="caption" color="faint" weight="bold">
            {t('segmental').toUpperCase()}
          </Txt>
          <Txt variant="caption" color="faint" style={styles.cardSubtitle}>
            {dayLabel(latest.date)}
          </Txt>
          <SegmentalChart scan={latest} />
        </Card>
      ) : null}

      <Txt variant="caption" color="faint" weight="bold" style={styles.listTitle}>
        {t('allReadings').toUpperCase()}
      </Txt>
      <Card padded={false} style={styles.block}>
        {newestFirst.map((scan, index) => (
          <React.Fragment key={scan.id}>
            {index > 0 ? <Divider inset /> : null}
            <ScanRow scan={scan} onPress={() => openScan(scan)} onDelete={() => removeScan(scan)} />
          </React.Fragment>
        ))}
      </Card>

      <View style={styles.actions}>
        <Button label={t('emptyAction')} icon="qr-code-outline" onPress={openImport} fullWidth />
        <Button
          label={t('typeItIn')}
          icon="create-outline"
          variant="secondary"
          onPress={openAdd}
          fullWidth
        />
      </View>

      <Txt variant="caption" color="faint" align="center" style={styles.foot}>
        {t('disclaimer')}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  block: {
    marginTop: spacing.md,
  },
  cardTitle: {
    marginBottom: spacing.md,
  },
  cardSubtitle: {
    marginBottom: spacing.sm,
  },
  hero: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  heroFigure: {
    alignItems: 'baseline',
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  heroUnit: {
    marginStart: spacing.xs + 1,
  },
  highlights: {
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginTop: spacing.lg,
  },
  highlight: {
    borderRadius: radius.md,
    flex: 1,
    padding: spacing.md,
    rowGap: 2,
  },
  changeSpan: {
    marginBottom: spacing.sm,
    marginTop: 2,
  },
  changeRow: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    minHeight: 28,
  },
  changeLabel: {
    flex: 1,
  },
  innerDivider: {
    marginTop: spacing.md,
  },
  disclosure: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 44,
  },
  disclosureInset: {
    paddingHorizontal: spacing.lg,
  },
  disclosureText: {
    flex: 1,
  },
  detailBody: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    rowGap: spacing.xs,
  },
  detailHint: {
    marginBottom: spacing.sm,
  },
  detailRow: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  detailLabel: {
    flex: 1,
  },
  listTitle: {
    marginTop: spacing.xl,
  },
  actions: {
    marginTop: spacing.xl,
    rowGap: spacing.sm,
  },
  foot: {
    marginTop: spacing.lg,
  },
  empty: {
    marginTop: spacing.xl,
  },
  emptyAlt: {
    alignSelf: 'flex-start',
    marginStart: spacing.lg,
  },
});
