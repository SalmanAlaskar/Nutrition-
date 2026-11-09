import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View, type AccessibilityProps } from 'react-native';

import { useDayText } from '@/components/history/dayText';
import { PHASE_KIND_LABEL_KEYS } from '@/components/phase/PhaseBar';
import { PhaseCard } from '@/components/phase/PhaseCard';
import {
  AppHeader,
  Button,
  EmptyState,
  IconButton,
  LoadingView,
  Screen,
  Section,
  StatTile,
  Txt,
} from '@/components/ui';
import { todayKey } from '@/domain/date';
import { formatCount } from '@/domain/format';
import { pastPhases, phaseProgress, targetsForPhase, upcomingPhases } from '@/domain/phase';
import { useApp } from '@/state/AppStore';
import { layout, radius, spacing, useTheme } from '@/theme';
import type { Phase } from '@/types';

/** Decoration only: the block around it already carries the whole sentence. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

/**
 * The phases the user has set.
 *
 * The one running today leads the screen, because it is the one answering the
 * question the screen exists for: what is the target, and for how much longer.
 * Everything else is a row.
 */
export default function PhasesScreen() {
  const router = useRouter();
  const { t } = useTranslation(['phases', 'common', 'macros', 'units']);
  const { colors } = useTheme();
  const { shortDay } = useDayText();
  const { ready, profile, phases, activePhase } = useApp();

  const today = todayKey();

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const openPhase = useCallback(
    (phase: Phase) => router.push({ pathname: '/phases/edit', params: { id: phase.id } }),
    [router],
  );

  const addPhase = useCallback(() => router.push('/phases/edit'), [router]);

  const openProfile = useCallback(() => router.replace('/onboarding'), [router]);

  /**
   * Validation keeps phases from overlapping, but an imported file can still
   * carry two that do. The store picks one of them to be active; the others
   * still cover today, so they are listed with it rather than vanishing.
   */
  const alsoRunning = useMemo(
    () =>
      phases.filter(
        (phase) =>
          phase.id !== activePhase?.id && phase.startDate <= today && phase.endDate >= today,
      ),
    [phases, activePhase, today],
  );
  const upcoming = useMemo(() => upcomingPhases(phases, today), [phases, today]);
  const past = useMemo(() => pastPhases(phases, today), [phases, today]);

  if (!ready) {
    return (
      <Screen edges={['top', 'bottom']}>
        <AppHeader title={t('phases:title')} onBack={goBack} />
        <LoadingView message={t('phases:loading')} />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen scroll edges={['top', 'bottom']}>
        <AppHeader title={t('phases:title')} onBack={goBack} />
        <EmptyState
          icon="person-add-outline"
          title={t('phases:needProfileTitle')}
          message={t('phases:needProfileBody')}
          actionLabel={t('phases:needProfileAction')}
          onAction={openProfile}
        />
      </Screen>
    );
  }

  const body = profile;
  const targetsFor = (phase: Phase) => targetsForPhase(body, phase);
  const dateRange = (phase: Phase) =>
    t('phases:dateRange', { from: shortDay(phase.startDate), to: shortDay(phase.endDate) });

  /** How much of a running phase is still to come, in words. */
  const daysLeftText = (daysLeft: number): string => {
    if (daysLeft <= 0) return t('phases:daysLeftNone');
    if (daysLeft === 1) return t('phases:daysLeftOne');
    return t('phases:daysLeftMany', { days: formatCount(daysLeft) });
  };

  /** The phase running today, set as the head of the page rather than a row. */
  const renderLead = (phase: Phase) => {
    const targets = targetsFor(phase);
    const { dayNumber, totalDays, daysLeft, ratio } = phaseProgress(phase, today);

    const kind = t(PHASE_KIND_LABEL_KEYS[phase.kind]);
    const dates = dateRange(phase);
    const left = daysLeftText(daysLeft);
    const dayLine = t('phases:dayOfTotal', {
      day: formatCount(dayNumber),
      total: formatCount(totalDays),
    });

    const gram = t('units:gram');
    const macros = [
      { key: 'protein', label: t('macros:protein'), value: formatCount(targets.protein) },
      { key: 'carbs', label: t('macros:carbs'), value: formatCount(targets.carbs) },
      { key: 'fat', label: t('macros:fat'), value: formatCount(targets.fat) },
    ];

    const figure = (label: string, value: string) => t('phases:figureSpoken', { label, value });

    const spoken = t('phases:cardSpoken', {
      kind,
      status: t('phases:statusRunning'),
      dates,
      figures: [
        figure(t('phases:targetLabel'), `${formatCount(targets.calories)} ${t('units:kcal')}`),
        ...macros.map((macro) => figure(macro.label, `${macro.value} ${gram}`)),
        t('phases:progressSpoken', { day: dayLine, left }),
      ].join(t('phases:listSeparator')),
    });

    return (
      <Pressable
        onPress={() => openPhase(phase)}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint={t('phases:cardHint')}
        style={({ pressed }) => [
          styles.lead,
          pressed ? { backgroundColor: colors.surfaceAlt } : null,
        ]}
      >
        <Txt variant="label" color="muted" numberOfLines={1}>
          {t('phases:runningTitle')}
        </Txt>
        <Txt variant="title" numberOfLines={1} style={styles.leadTitle}>
          {kind}
        </Txt>
        <Txt variant="label" color="muted" numberOfLines={1} tabular>
          {dates}
        </Txt>

        {/*
          The figure is the one accent on this screen, and its unit is nested in
          the same run: as siblings Arabic reorders them and the unit glues
          itself onto the number.
        */}
        <View style={styles.figureLine}>
          <Txt variant="display" color="accent" tabular numberOfLines={1}>
            {formatCount(targets.calories)}
            <Txt variant="label" color="faint" weight="medium">
              {` ${t('units:kcal')}`}
            </Txt>
          </Txt>
        </View>
        <Txt variant="label" color="muted" numberOfLines={1}>
          {t('phases:targetLabel')}
        </Txt>

        <View style={styles.macros}>
          {macros.map((macro) => (
            <StatTile
              key={macro.key}
              label={macro.label}
              value={macro.value}
              unit={gram}
              style={styles.macroTile}
            />
          ))}
        </View>

        {/* Progress as a hairline rail under a line of text, never a loud bar. */}
        <View style={styles.progress}>
          <Txt variant="caption" color="faint" numberOfLines={1} tabular>
            {`${dayLine} · ${left}`}
          </Txt>
          <View style={[styles.rail, { backgroundColor: colors.track }]} {...DECORATIVE}>
            <View
              style={[
                styles.railFill,
                { backgroundColor: colors.textMuted, width: `${Math.round(ratio * 100)}%` },
              ]}
            />
          </View>
        </View>

        {phase.note ? (
          <Txt variant="label" color="muted" numberOfLines={2} style={styles.leadNote}>
            {phase.note}
          </Txt>
        ) : null}
      </Pressable>
    );
  };

  const renderCards = (list: Phase[]) =>
    list.map((phase) => (
      <PhaseCard
        key={phase.id}
        phase={phase}
        targets={targetsFor(phase)}
        today={today}
        onPress={() => openPhase(phase)}
      />
    ));

  if (phases.length === 0) {
    return (
      <Screen scroll edges={['top', 'bottom']}>
        <AppHeader title={t('phases:title')} subtitle={t('phases:subtitle')} onBack={goBack} />
        <EmptyState
          icon="calendar-outline"
          title={t('phases:emptyTitle')}
          message={t('phases:emptyMessage')}
          actionLabel={t('phases:emptyAction')}
          onAction={addPhase}
        />
        <Txt variant="caption" color="faint" style={styles.foot}>
          {t('phases:disclaimer')}
        </Txt>
      </Screen>
    );
  }

  const count =
    phases.length === 1
      ? t('phases:countOne')
      : t('phases:countMany', { n: formatCount(phases.length) });

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <AppHeader
        title={t('phases:title')}
        subtitle={count}
        onBack={goBack}
        right={
          <IconButton
            icon="add"
            variant="surface"
            onPress={addPhase}
            accessibilityLabel={t('phases:addPhase')}
          />
        }
      />

      {activePhase ? <Section first>{renderLead(activePhase)}</Section> : null}

      {alsoRunning.length > 0 ? (
        <Section gap="tight">{renderCards(alsoRunning)}</Section>
      ) : null}

      {upcoming.length > 0 ? (
        <Section title={t('phases:upcomingTitle')} gap="tight" first={!activePhase}>
          {renderCards(upcoming)}
        </Section>
      ) : null}

      {past.length > 0 ? (
        <Section
          title={t('phases:pastTitle')}
          gap="tight"
          first={!activePhase && upcoming.length === 0}
        >
          {renderCards(past)}
        </Section>
      ) : null}

      <Section>
        <Button
          label={t('phases:addPhase')}
          icon="add"
          variant="secondary"
          onPress={addPhase}
          fullWidth
        />
        <Txt variant="caption" color="faint" style={styles.foot}>
          {t('phases:disclaimer')}
        </Txt>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: {
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
  },
  leadTitle: {
    marginBottom: 2,
    marginTop: spacing.xs,
  },
  figureLine: {
    flexDirection: 'row',
    marginTop: spacing.lg,
  },
  macroTile: {
    // Three figures share one row on a phone, so the tile's own floor comes down.
    minWidth: 96,
  },
  macros: {
    columnGap: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xl,
    rowGap: spacing.lg,
  },
  progress: {
    marginTop: spacing.xl,
    rowGap: spacing.sm,
  },
  rail: {
    borderRadius: radius.pill,
    height: 4,
    overflow: 'hidden',
    width: '100%',
  },
  railFill: {
    borderRadius: radius.pill,
    height: '100%',
  },
  leadNote: {
    marginTop: spacing.lg,
    maxWidth: layout.maxTextWidth,
  },
  foot: {
    marginTop: spacing.xl,
    maxWidth: layout.maxTextWidth,
  },
});
