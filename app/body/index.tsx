import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
} from 'react-native';

import { ScanRow } from '@/components/body/ScanRow';
import { ScanTrendChart } from '@/components/body/ScanTrendChart';
import { SegmentalChart } from '@/components/body/SegmentalChart';
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
import { SCAN_METRICS, scanChange, type ScanChange, type ScanMetricDef } from '@/domain/bodyScan';
import { formatDayLabel, formatShortDay } from '@/domain/date';
import { useApp } from '@/state/AppStore';
import { spacing, useTheme } from '@/theme';
import type { BodyScan } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Decoration only: the surrounding text already carries the meaning. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

/** The four a comparison is worth making on. Each one exists on ScanChange. */
type ChangeKey = 'weightKg' | 'skeletalMuscleKg' | 'bodyFatKg' | 'bodyFatPercent';

const CHANGE_KEYS: ChangeKey[] = [
  'weightKg',
  'skeletalMuscleKg',
  'bodyFatKg',
  'bodyFatPercent',
];

const CHANGE_METRICS: (ScanMetricDef & { key: ChangeKey })[] = SCAN_METRICS.filter(
  (metric): metric is ScanMetricDef & { key: ChangeKey } =>
    (CHANGE_KEYS as string[]).includes(metric.key),
);

/** Alert is a no-op on react-native-web, so the browser gets its own confirm. */
function confirmAction(options: {
  title: string;
  message: string;
  confirmLabel: string;
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
    { text: 'Cancel', style: 'cancel' },
    { text: options.confirmLabel, style: 'destructive', onPress: options.onConfirm },
  ]);
}

function dayWord(days: number): string {
  if (days <= 0) return 'the same day';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

interface Movement {
  key: ChangeKey;
  label: string;
  /** 'up 0.9 kg', 'down 0.4 %', 'unchanged'. */
  text: string;
  icon: IconName;
  favourable: boolean;
}

/** Turns one signed difference into words. Direction first, never a verdict. */
function movement(metric: ScanMetricDef & { key: ChangeKey }, change: ScanChange): Movement | null {
  const delta = change[metric.key];
  if (delta === undefined || !Number.isFinite(delta)) return null;

  // Below half the printed resolution the machines disagree with themselves.
  const threshold = 0.5 * 10 ** -metric.decimals;
  const unit = metric.unit ? ` ${metric.unit}` : '';

  if (Math.abs(delta) < threshold) {
    return { key: metric.key, label: metric.label, text: 'unchanged', icon: 'remove', favourable: false };
  }

  const up = delta > 0;
  return {
    key: metric.key,
    label: metric.label,
    text: `${up ? 'up' : 'down'} ${Math.abs(delta).toFixed(metric.decimals)}${unit}`,
    icon: up ? 'arrow-up' : 'arrow-down',
    favourable: metric.higherIsBetter === null ? false : metric.higherIsBetter === up,
  };
}

function movements(change: ScanChange): Movement[] {
  const list: Movement[] = [];
  for (const metric of CHANGE_METRICS) {
    const moved = movement(metric, change);
    if (moved) list.push(moved);
  }
  return list;
}

export default function BodyScansScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { ready, bodyScans, deleteBodyScan } = useApp();

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
        title: 'Delete this reading?',
        message: `The reading from ${formatDayLabel(scan.date)} will be removed from your history.`,
        confirmLabel: 'Delete',
        onConfirm: () => {
          void deleteBodyScan(scan.id);
        },
      });
    },
    [deleteBodyScan],
  );

  const changeBlock = (title: string, change: ScanChange) => {
    const moved = movements(change);
    if (moved.length === 0) return null;
    return (
      <View style={styles.changeBlock}>
        <Txt variant="caption" color="faint" weight="bold">
          {title.toUpperCase()}
        </Txt>
        <Txt variant="caption" color="faint" style={styles.changeSpan}>
          {`${formatShortDay(change.fromDate)} to ${formatShortDay(change.toDate)}, ${dayWord(change.days)} apart`}
        </Txt>
        {moved.map((item) => (
          <View
            key={item.key}
            accessible
            accessibilityLabel={`${item.label} ${item.text}`}
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
            >
              {item.text}
            </Txt>
          </View>
        ))}
      </View>
    );
  };

  if (!ready) {
    return (
      <Screen edges={['top', 'bottom']}>
        <AppHeader title="Body scans" onBack={goBack} />
        <LoadingView message="Loading your readings" />
      </Screen>
    );
  }

  if (!latest) {
    return (
      <Screen scroll edges={['top', 'bottom']}>
        <AppHeader title="Body scans" onBack={goBack} />
        <EmptyState
          icon="body-outline"
          title="No readings yet"
          message="Add an InBody result and the app tracks muscle, fat and the balance between your limbs over time."
          actionLabel="Import a sheet"
          onAction={openImport}
          style={styles.empty}
        />
        <Button
          label="Type a reading in"
          variant="ghost"
          onPress={openAdd}
          style={styles.emptyAlt}
        />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      contentStyle={styles.content}
    >
      <AppHeader
        title="Body scans"
        subtitle={`${ordered.length} ${ordered.length === 1 ? 'reading' : 'readings'}`}
        onBack={goBack}
        right={
          <IconButton
            icon="add"
            variant="surface"
            onPress={openImport}
            accessibilityLabel="Add a reading"
          />
        }
      />

      <Card style={styles.block}>
        <Txt variant="caption" color="faint" weight="bold">
          LATEST READING
        </Txt>
        <View style={styles.latestRow}>
          <Txt variant="display" tabular>
            {latest.weightKg.toFixed(1)}
          </Txt>
          <Txt variant="label" color="faint" weight="medium" style={styles.latestUnit}>
            kg
          </Txt>
        </View>
        <Txt variant="label" color="muted">
          {formatDayLabel(latest.date)}
        </Txt>

        {sinceLast ? changeBlock('Since the scan before', sinceLast) : null}
        {sinceFirst && sinceLast && sinceFirst.fromDate !== sinceLast.fromDate
          ? changeBlock('Since your first scan', sinceFirst)
          : null}
        {!sinceLast ? (
          <Txt variant="label" color="muted" style={styles.changeBlock}>
            This is your first reading. The next one starts the comparison.
          </Txt>
        ) : null}
      </Card>

      <Card style={styles.block}>
        <Txt variant="caption" color="faint" weight="bold" style={styles.cardTitle}>
          TREND
        </Txt>
        <ScanTrendChart scans={ordered} />
      </Card>

      {latest.segmentalLeanKg || latest.segmentalFatKg ? (
        <Card style={styles.block}>
          <Txt variant="caption" color="faint" weight="bold">
            SEGMENTAL ANALYSIS
          </Txt>
          <Txt variant="caption" color="faint" style={styles.cardSubtitle}>
            {formatDayLabel(latest.date)}
          </Txt>
          <SegmentalChart scan={latest} />
        </Card>
      ) : null}

      <Txt variant="caption" color="faint" weight="bold" style={styles.listTitle}>
        ALL READINGS
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
        <Button label="Import a sheet" icon="qr-code-outline" onPress={openImport} fullWidth />
        <Button
          label="Type a reading in"
          icon="create-outline"
          variant="secondary"
          onPress={openAdd}
          fullWidth
        />
      </View>

      <Txt variant="caption" color="faint" align="center" style={styles.foot}>
        These are the numbers your machine printed, tracked over time. They are not a health
        assessment.
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
  latestRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  latestUnit: {
    marginLeft: spacing.xs + 1,
  },
  changeBlock: {
    marginTop: spacing.lg,
  },
  changeSpan: {
    marginBottom: spacing.sm,
    marginTop: 2,
  },
  changeRow: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    minHeight: 26,
  },
  changeLabel: {
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
    marginLeft: spacing.lg,
  },
});
