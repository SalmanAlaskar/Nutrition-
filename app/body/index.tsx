import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { ScanRow } from '@/components/body/ScanRow';
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
import { formatCount } from '@/domain/format';
import { useApp } from '@/state/AppStore';
import { layout, spacing } from '@/theme';
import type { BodyScan } from '@/types';

/**
 * The ledger behind the InBody tab: every reading as a row, to open, correct or
 * delete.
 *
 * It used to lead with the latest reading, what had moved since the one before
 * it, a trend chart and a segmental chart — all of which the InBody tab now
 * shows, and shows better, for whichever reading you pick. Two screens
 * answering the same question is one screen too many, so this one kept the only
 * job the tab does not do.
 */

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

export default function BodyScansScreen() {
  const router = useRouter();
  const { t } = useTranslation(['body', 'common']);
  const { dayLabel } = useScanDate();
  const { ready, bodyScans, deleteBodyScan } = useApp();

  // Storage sorts by day alone, so two readings from one day are ordered here by
  // the time they were taken. Newest first: this is a list you scan from the top.
  const newestFirst = useMemo(
    () =>
      [...bodyScans].sort((a, b) =>
        a.date === b.date ? b.takenAt.localeCompare(a.takenAt) : b.date.localeCompare(a.date),
      ),
    [bodyScans],
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/inbody');
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

  if (!ready) {
    return (
      <Screen edges={['top', 'bottom']}>
        <AppHeader title={t('allReadings')} onBack={goBack} />
        <LoadingView message={t('loading')} />
      </Screen>
    );
  }

  if (newestFirst.length === 0) {
    return (
      <Screen scroll edges={['top', 'bottom']}>
        <AppHeader title={t('allReadings')} onBack={goBack} />
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

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <AppHeader
        title={t('allReadings')}
        subtitle={
          newestFirst.length === 1
            ? t('readingOne')
            : t('readingMany', { n: formatCount(newestFirst.length) })
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

      <Section first gap="tight">
        {newestFirst.map((scan, index) => (
          <React.Fragment key={scan.id}>
            {index > 0 ? <Divider /> : null}
            <ScanRow scan={scan} onPress={() => openScan(scan)} onDelete={() => removeScan(scan)} />
          </React.Fragment>
        ))}
      </Section>

      <Section>
        {/* Nothing on this screen is an accent: it is a list you came to from
            somewhere else, and the two ways in sit under the readings they add to. */}
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
