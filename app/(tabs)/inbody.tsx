import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';

import {
  ReadingHero,
  type ReadingHeroMetric,
  type ReadingHeroTone,
} from '@/components/body/ReadingHero';
import { ScanTimeline } from '@/components/body/ScanTimeline';
import { ScanTrendChart } from '@/components/body/ScanTrendChart';
import { useScanDate } from '@/components/body/useScanDate';
import { BmiScale } from '@/components/profile/BmiScale';
import { ControlSummary } from '@/components/profile/ControlSummary';
import { ProgressRate, type ProgressRateMetric } from '@/components/profile/ProgressRate';
import { RangeBar } from '@/components/profile/RangeBar';
import { SheetHeader } from '@/components/profile/SheetHeader';
import {
  AppHeader,
  Badge,
  Button,
  Divider,
  EmptyState,
  IconButton,
  ListRow,
  LoadingView,
  Screen,
  Section,
  Txt,
  type BadgeTone,
  type TxtAlign,
} from '@/components/ui';
import {
  SCAN_METRICS,
  SEGMENT_LABEL_KEYS,
  latestScan,
  scanChange,
  type ScanChange,
} from '@/domain/bodyScan';
import { formatAmount, formatCount, formatDelta, formatPercent } from '@/domain/format';
import { todayKey } from '@/domain/date';
import { bmiCategory, bodyMassIndex, type BmiCategory } from '@/domain/nutrition';
import { phaseProgress } from '@/domain/phase';
import { useDirection } from '@/i18n';
import { useApp } from '@/state/AppStore';
import { layout, spacing } from '@/theme';
import type { PhaseKind, ScanRange, SegmentalValues } from '@/types';

/**
 * Decorative nodes are hidden from assistive tech with the prop the platform
 * understands: the native pair is not valid on a DOM element.
 */
const DECORATIVE: Pick<
  ViewProps,
  'aria-hidden' | 'accessibilityElementsHidden' | 'importantForAccessibility'
> =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

/** Separates two facts in one line. Kept in a single run so Arabic cannot reorder it. */
const DOT = ' · ';

/**
 * Which physical edge a column of figures lands on.
 *
 * Not `align="end"`. A text node carries dir="auto" and resolves it from its
 * own content, and a figure's content depends on its unit: "12.3 كجم" is
 * Arabic and ends on the left, while "98.5 ٪", "0.92" and "—" have no strong
 * character at all and end on the right. Aligning logically therefore splits
 * one column down the middle, row by row, according to what each unit happens
 * to contain. The same reasoning is written out at app/(tabs)/dashboard.tsx.
 */
const useFigureEnd = (): TxtAlign => (useDirection().isRTL ? 'left' : 'right');

/** A phase is named by what it is for, in the same words the phases screen uses. */
const PHASE_KIND_KEYS = {
  cut: 'phaseKindCut',
  maintain: 'phaseKindMaintain',
  build: 'phaseKindBuild',
} as const satisfies Record<PhaseKind, string>;

/** The band an InBody sheet prints beside the visceral fat level. */
const VISCERAL_BAND = 10;
/** Above this the sheet's own obesity line is worth qualifying. */
const BMI_OVERWEIGHT = 25;

/** The band is said in a word; the tone only tints that word. */
const BMI_TONE: Record<BmiCategory, BadgeTone> = {
  Underweight: 'warning',
  Healthy: 'default',
  Overweight: 'warning',
  Obese: 'danger',
};

const BMI_KEYS = {
  Underweight: 'bmiUnderweight',
  Healthy: 'bmiHealthy',
  Overweight: 'bmiOverweight',
  Obese: 'bmiObese',
} as const satisfies Record<BmiCategory, string>;

/**
 * The composition table, in the order the machine prints it: what the body is
 * made of, finishing with the weight those parts add up to.
 */
const COMPOSITION_ROWS = [
  { key: 'totalBodyWaterL', labelKey: 'rowWater', unit: 'litre', decimals: 1 },
  { key: 'proteinKg', labelKey: 'rowProtein', unit: 'kg', decimals: 1 },
  { key: 'mineralsKg', labelKey: 'rowMinerals', unit: 'kg', decimals: 2 },
  { key: 'bodyFatKg', labelKey: 'rowFatMass', unit: 'kg', decimals: 1 },
  { key: 'weightKg', labelKey: 'rowWeight', unit: 'kg', decimals: 1 },
] as const satisfies readonly {
  key: 'totalBodyWaterL' | 'proteinKg' | 'mineralsKg' | 'bodyFatKg' | 'weightKg';
  labelKey: string;
  unit: 'kg' | 'litre';
  decimals: number;
}[];

/** Segments in the order the sheet stacks them. */
const SEGMENT_ORDER = ['rightArm', 'leftArm', 'trunk', 'rightLeg', 'leftLeg'] as const;

/**
 * What a rate over time is worth reading. Every one of these also exists on a
 * ScanChange, so the span can be printed without a second lookup.
 */
const PROGRESS_KEYS = [
  'weightKg',
  'skeletalMuscleKg',
  'bodyFatKg',
  'bodyFatPercent',
  'inBodyScore',
] as const;

type ProgressKey = (typeof PROGRESS_KEYS)[number];

/**
 * The figures the hero leads with. Weight first: it is the one every reading
 * has, and the one the timeline speaks. The score is here rather than only in
 * its own section near the foot of the page — it is the machine's own summary
 * of the whole sheet, and four screens down is not where a summary belongs.
 */
const HERO_KEYS = [
  'weightKg',
  'skeletalMuscleKg',
  'bodyFatPercent',
  'inBodyScore',
] as const;

type HeroKey = (typeof HERO_KEYS)[number];

/** True when a value sits above the band the sheet printed for it. */
const aboveBand = (value: number | undefined, range: ScanRange | undefined) =>
  value !== undefined && range !== undefined && value > range.max;

/** Nothing here is an alarm, so a move in the wrong direction is amber, never red. */
const toneOf = (delta: number, higherIsBetter: boolean | null): ReadingHeroTone => {
  if (delta === 0 || higherIsBetter === null) return 'flat';
  return delta > 0 === higherIsBetter ? 'good' : 'bad';
};

/**
 * One printed line of the sheet: a label and the figure beside it, with the
 * band or caveat the machine prints underneath when there is one.
 */
function ReadingRow({
  label,
  value,
  unit,
  decimals,
  note,
}: {
  label: string;
  value: number;
  /** Already translated; empty for a bare index such as a level or a ratio. */
  unit?: string;
  decimals: number;
  note?: string;
}) {
  const { t } = useTranslation('profile');
  const figureEnd = useFigureEnd();
  const shown = formatAmount(value, decimals);

  return (
    <View
      accessible
      accessibilityLabel={t('rowSpoken', { label, value: shown, unit: unit ?? '' }).trim()}
      style={styles.readingRow}
    >
      <View style={styles.readingHead}>
        <Txt numberOfLines={2} style={styles.readingLabel}>
          {label}
        </Txt>
        {/* The figure and its unit are one run: as siblings Arabic reorders them. */}
        <Txt tabular numberOfLines={1} align={figureEnd} style={styles.readingValue}>
          {shown}
          {unit ? (
            <Txt variant="label" color="faint">
              {` ${unit}`}
            </Txt>
          ) : null}
        </Txt>
      </View>
      {note ? (
        <Txt variant="caption" color="faint" numberOfLines={2} style={styles.readingNote}>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * One group of the segmental table: five parts, each with its mass and how
 * that compares with the ideal the machine works out for this height.
 */
function SegmentalTable({
  mass,
  percent,
  unit,
}: {
  mass: SegmentalValues;
  percent?: SegmentalValues;
  unit: string;
}) {
  const { t } = useTranslation(['profile', 'body', 'units']);
  const figureEnd = useFigureEnd();

  const rows = SEGMENT_ORDER.flatMap((key) => {
    const value = mass[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return [];
    return [{ key, part: t(SEGMENT_LABEL_KEYS[key]), value, share: percent?.[key] }];
  });

  if (rows.length === 0) return null;

  const hasShare = rows.some((row) => row.share !== undefined);

  return (
    <View>
      {hasShare ? (
        <View style={styles.segHead} {...DECORATIVE}>
          <Txt variant="caption" color="faint" align={figureEnd} numberOfLines={1}>
            {t('segmentalIdeal')}
          </Txt>
        </View>
      ) : null}

      {rows.map((row, index) => (
        <View key={row.key}>
          {index > 0 ? <Divider /> : null}
          <View
            accessible
            accessibilityLabel={
              row.share === undefined
                ? t('segmentalSpokenPlain', {
                    part: row.part,
                    value: formatAmount(row.value, 2),
                    unit,
                  })
                : t('segmentalSpoken', {
                    part: row.part,
                    value: formatAmount(row.value, 2),
                    unit,
                    percent: formatAmount(row.share, 1),
                  })
            }
            style={styles.segRow}
          >
            <Txt numberOfLines={1} style={styles.segLabel}>
              {row.part}
            </Txt>
            {/* Mass and unit in one run, share and its sign in another: two
                numbers as siblings collide into one in Arabic. */}
            <Txt tabular numberOfLines={1} align={figureEnd} style={styles.segValue}>
              {formatAmount(row.value, 2)}
              <Txt variant="label" color="faint">
                {` ${unit}`}
              </Txt>
            </Txt>
            {/* The share carries the translated percent sign rather than
                formatPercent's Latin one, so the two columns of this table do
                not print ٪ and % side by side on the same Arabic page. */}
            <Txt
              variant="label"
              color="muted"
              tabular
              numberOfLines={1}
              align={figureEnd}
              style={styles.segShare}
            >
              {row.share === undefined ? (
                '—'
              ) : (
                <>
                  {formatAmount(row.share, 1)}
                  <Txt variant="caption" color="faint">
                    {` ${t('units:percent')}`}
                  </Txt>
                </>
              )}
            </Txt>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function InBodyScreen() {
  const { ready, profile, bodyScans, activePhase } = useApp();
  const router = useRouter();
  const { t } = useTranslation(['profile', 'units', 'body']);
  const { dayLabel, shortDay } = useScanDate();

  // Null means the newest. Holding an id rather than an index keeps the page
  // pointed at the same reading when an older one is deleted from under it.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ordered = useMemo(
    () =>
      [...bodyScans].sort((a, b) =>
        a.date === b.date ? a.takenAt.localeCompare(b.takenAt) : a.date.localeCompare(b.date),
      ),
    [bodyScans],
  );

  // A reading deleted elsewhere leaves the id pointing at nothing, and a blank
  // page is the worst answer to that; the newest one always exists.
  const selected = useMemo(
    () => ordered.find((scan) => scan.id === selectedId) ?? latestScan(bodyScans),
    [ordered, selectedId, bodyScans],
  );

  if (!ready) {
    return (
      <Screen>
        <AppHeader title={t('title')} />
        <LoadingView message={t('loading')} />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen scroll>
        <AppHeader title={t('title')} />
        <EmptyState
          icon="person-add-outline"
          title={t('emptyTitle')}
          message={t('emptyMessage')}
          actionLabel={t('emptyAction')}
          onAction={() => router.replace('/onboarding')}
        />
      </Screen>
    );
  }

  const oldest = ordered[0] ?? null;
  const newest = ordered[ordered.length - 1] ?? null;

  /*
    Arabic counts in four shapes, and i18next's plural categories cannot be
    used here: they would need six keys in Arabic against two in English, and
    the two locale files are checked for identical key sets. Choosing the key
    in code keeps both files the same shape and still says "قراءتان" for two
    and "12 قراءة" for twelve, which "12 قراءات" would get wrong.
  */
  const readingCount = (n: number) =>
    n === 1
      ? t('readingsOne')
      : n === 2
        ? t('readingsTwo')
        : n <= 10
          ? t('readingsFew', { n: formatCount(n) })
          : t('readingsMany', { n: formatCount(n) });

  const headerSubtitle =
    oldest === null || newest === null
      ? t('subtitle')
      : ordered.length === 1
        ? t('readingsOne')
        : `${readingCount(ordered.length)}${DOT}${t('readingsSpan', {
            from: shortDay(oldest.date),
            to: shortDay(newest.date),
          })}`;

  const header = (
    <AppHeader
      title={t('title')}
      subtitle={headerSubtitle}
      right={
        <IconButton
          icon="add"
          onPress={() => router.push('/body/import')}
          accessibilityLabel={t('body:addReading')}
        />
      }
    />
  );

  const detailsRow = (
    <ListRow
      title={t('detailsRow')}
      subtitle={t('detailsRowHint')}
      chevron
      onPress={() => router.push('/profile/edit')}
    />
  );

  /* ------------------------------------------------ nothing imported yet -- */
  /* The first thing anyone with no sheet sees, so it has to be a way in
     rather than an empty box: import, type it in, or go and set the plan up. */
  if (selected === null) {
    return (
      <Screen scroll>
        {header}

        <Section first>
          <EmptyState
            icon="body-outline"
            title={t('scanEmptyTitle')}
            message={t('scanEmptyMessage')}
            actionLabel={t('scanEmptyAction')}
            onAction={() => router.push('/body/import')}
          />

          <Button
            label={t('emptyTypeAction')}
            onPress={() => router.push('/body/add')}
            variant="ghost"
            size="sm"
            style={styles.ghostAction}
          />

          <Txt variant="label" color="muted" style={styles.emptyLead}>
            {t('emptyLead')}
          </Txt>

          <View style={styles.linkList}>
            <Divider />
            {detailsRow}
          </View>
        </Section>
      </Screen>
    );
  }

  const phaseToday = activePhase ? phaseProgress(activePhase, todayKey()) : null;

  const index = ordered.indexOf(selected);
  const previous = index > 0 ? (ordered[index - 1] ?? null) : null;
  const isLatest = newest !== null && newest.id === selected.id;

  const sincePrevious = previous ? scanChange(previous, selected) : null;
  const sinceFirst =
    oldest && previous && oldest.id !== previous.id ? scanChange(oldest, selected) : null;

  /* Repeated under every section heading: four screens below the timeline,
     the date is the only thing that says which reading these numbers are. */
  const sheetDay = shortDay(selected.date);

  /* A reading is printed in the machine's units, whatever the screen is set to. */
  const sheetMassUnit = t('units:kg');
  const sheetWaterUnit = t('units:litre');
  const percentUnit = t('units:percent');

  const sheetFacts = [
    t(profile.sex === 'female' ? 'female' : 'male'),
    `${formatCount(selected.age ?? profile.age)} ${t('units:years')}`,
    t('heightMetric', { value: formatCount(selected.heightCm ?? profile.heightCm) }),
  ];

  const heroMetrics = HERO_KEYS.flatMap<ReadingHeroMetric>((key: HeroKey) => {
    const value = selected[key];
    if (value === undefined) return [];
    const def = SCAN_METRICS.find((metric) => metric.key === key);
    if (!def) return [];
    const delta = sincePrevious?.[key];
    return [
      {
        key,
        label: t(def.labelKey),
        value: formatAmount(value, def.decimals),
        unit: def.unitKey ? t(def.unitKey) : '',
        delta: delta === undefined ? undefined : formatDelta(delta, def.decimals),
        deltaTone: delta === undefined ? undefined : toneOf(delta, def.higherIsBetter),
      },
    ];
  });

  const progressMetrics = (change: ScanChange): ProgressRateMetric[] =>
    PROGRESS_KEYS.flatMap((key: ProgressKey) => {
      const delta = change[key];
      if (delta === undefined) return [];
      const def = SCAN_METRICS.find((metric) => metric.key === key);
      if (!def) return [];
      return [
        {
          key,
          label: t(def.labelKey),
          delta,
          decimals: def.decimals,
          unit: def.unitKey ? t(def.unitKey) : '',
          higherIsBetter: def.higherIsBetter,
        },
      ];
    });

  /* --------------------------------------------------------- the sheet -- */

  const compositionRows = COMPOSITION_ROWS.flatMap((row) => {
    const value = selected[row.key];
    if (value === undefined) return [];
    return [
      {
        key: row.key,
        label: t(row.labelKey),
        value,
        decimals: row.decimals,
        unit: row.unit === 'litre' ? sheetWaterUnit : sheetMassUnit,
        range: selected.ranges?.[row.key],
      },
    ];
  });

  // Never the profile weight: that may be months newer than the reading on
  // screen, and the whole page is about one reading at a time.
  const bmi = selected.bmi ?? bodyMassIndex(profile.heightCm, selected.weightKg);
  const category = bmiCategory(bmi);

  /* BMI alone cannot tell muscle from fat, and on this sheet that is not a
     throwaway caveat: the protein and minerals above their bands are exactly
     what the index is counting as excess weight. */
  const buildAboveNormal =
    bmi >= BMI_OVERWEIGHT &&
    aboveBand(selected.proteinKg, selected.ranges?.proteinKg) &&
    aboveBand(selected.mineralsKg, selected.ranges?.mineralsKg);

  return (
    <Screen scroll>
      {header}

      {/* ------------------------------------------------------- timeline -- */}
      <Section
        first
        title={t('timelineTitle')}
        subtitle={t(ordered.length === 1 ? 'timelineOne' : 'timelineHint')}
      >
        <ScanTimeline scans={ordered} selectedId={selected.id} onSelect={setSelectedId} />
      </Section>

      {/* -------------------------------------------- the selected reading -- */}
      <Section>
        <View style={styles.sheetTop}>
          {/* The day is the heading. On a page that can show any reading,
              it is the one line that says which one is on screen, so the
              machine's name goes above it rather than taking the size. */}
          <SheetHeader
            eyebrow={
              selected.device ? `${t('sheetTitle')}${DOT}${selected.device}` : t('sheetTitle')
            }
            title={dayLabel(selected.date)}
            facts={sheetFacts}
            note={t('sheetUnitsNote')}
            style={styles.sheetHead}
          />
          {isLatest ? <Badge label={t('latestBadge')} variant="plain" /> : null}
        </View>

        {isLatest ? null : (
          <Txt variant="label" color="muted" style={styles.selectedHint}>
            {t('sheetSelectedHint', { day: shortDay(selected.date) })}
          </Txt>
        )}

        <ReadingHero
          metrics={heroMetrics}
          // Empty means first reading; the hero says so itself, and saying it
          // here too would print it twice.
          sinceLabel={previous ? t('heroSince', { day: shortDay(previous.date) }) : ''}
          style={styles.hero}
        />
      </Section>

      {/* ------------------------------------------------------- progress -- */}
      <Section title={t('progressTitle')} subtitle={t('progressHint')}>
        {/* A rate per month means little on its own; what the phase is asking
            for is the thing it should be read against. */}
        {phaseToday && activePhase ? (
          <Txt variant="label" color="muted" style={styles.phaseLine}>
            {t('phaseRowActive', {
              kind: t(PHASE_KIND_KEYS[activePhase.kind]),
              day: formatCount(phaseToday.dayNumber),
              total: formatCount(phaseToday.totalDays),
            })}
          </Txt>
        ) : null}

        {ordered.length === 1 ? (
          <Txt color="muted" style={styles.paragraph}>
            {t('progressNone')}
          </Txt>
        ) : (
          <>
            {sincePrevious === null ? (
              /* The earliest reading has nothing before it, so the two spans
                 above are empty and the section would otherwise promise what
                 moved and then show nothing at all. */
              <Txt color="muted" style={styles.paragraph}>
                {t('progressEarliest')}
              </Txt>
            ) : (
              <ProgressRate
                title={t('progressSincePrevious', {
                  day: shortDay(sincePrevious.fromDate),
                })}
                days={sincePrevious.days}
                metrics={progressMetrics(sincePrevious)}
              />
            )}

            {sinceFirst === null ? null : (
              <ProgressRate
                title={t('progressSinceFirst', { day: shortDay(sinceFirst.fromDate) })}
                days={sinceFirst.days}
                metrics={progressMetrics(sinceFirst)}
                style={sincePrevious === null ? undefined : styles.secondSpan}
              />
            )}

            {/* The chart holds every reading, not just the span above it, so it
                stays on the page even when the oldest one is selected. */}
            <Txt variant="label" weight="semibold" style={styles.chartTitle}>
              {t('progressChartTitle')}
            </Txt>
            <ScanTrendChart scans={ordered} />
          </>
        )}
      </Section>

      {/* ----------------------------------------------- the printed sheet -- */}
      {compositionRows.length > 0 ? (
        <Section title={t('compositionTitle')} subtitle={`${t('compositionHint')}${DOT}${sheetDay}`}>
          {compositionRows.map((row) => (
            <RangeBar
              key={row.key}
              label={row.label}
              value={row.value}
              decimals={row.decimals}
              unit={row.unit}
              range={row.range}
            />
          ))}
        </Section>
      ) : null}

      <Section title={t('obesityTitle')} subtitle={`${t('obesityHint')}${DOT}${sheetDay}`}>
        <BmiScale bmi={bmi} categoryLabel={t(BMI_KEYS[category])} tone={BMI_TONE[category]} />

        <Txt variant="label" color="muted" style={styles.bmiCopy}>
          {buildAboveNormal
            ? `${t('obesityNote')} ${t('obesityNoteAbove', { value: formatAmount(bmi) })}`
            : t('obesityNote')}
        </Txt>

        <View style={styles.sheetRows}>
          {selected.waistHipRatio === undefined ? null : (
            <ReadingRow
              label={t('waistHipTitle')}
              value={selected.waistHipRatio}
              decimals={2}
            />
          )}
          {selected.visceralFatLevel === undefined ? null : (
            <>
              {selected.waistHipRatio === undefined ? null : <Divider />}
              <ReadingRow
                label={t('rowVisceral')}
                value={selected.visceralFatLevel}
                decimals={0}
                note={t('visceralBand', { value: formatCount(VISCERAL_BAND) })}
              />
            </>
          )}
        </View>
      </Section>

      {selected.segmentalLeanKg ? (
        <Section title={t('segmentalLeanTitle')} subtitle={`${t('segmentalHint')}${DOT}${sheetDay}`}>
          <SegmentalTable
            mass={selected.segmentalLeanKg}
            percent={selected.segmentalLeanPercent}
            unit={sheetMassUnit}
          />
        </Section>
      ) : null}

      {selected.segmentalFatKg ? (
        <Section title={t('segmentalFatTitle')} subtitle={sheetDay}>
          <SegmentalTable
            mass={selected.segmentalFatKg}
            percent={selected.segmentalFatPercent}
            unit={sheetMassUnit}
          />
        </Section>
      ) : null}

      <Section title={t('scoreTitle')} subtitle={`${t('scoreHint')}${DOT}${sheetDay}`}>
        <ControlSummary
          score={selected.inBodyScore}
          targetWeightKg={selected.targetWeightKg}
          weightControlKg={selected.weightControlKg}
          fatControlKg={selected.fatControlKg}
          muscleControlKg={selected.muscleControlKg}
          unit={sheetMassUnit}
        />
      </Section>

      {/* ---------------------------------------------------------- links -- */}
      <Section divider gap="none" contentStyle={styles.lastLinks}>
        <ListRow
          title={t('scanHistory')}
          subtitle={t('scanHistoryHint')}
          chevron
          onPress={() => router.push('/body')}
        />
        <Divider />
        {detailsRow}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    maxWidth: layout.maxTextWidth,
  },
  phaseLine: {
    marginBottom: spacing.md,
    maxWidth: layout.maxTextWidth,
  },
  linkList: {
    marginTop: spacing.lg,
  },
  lastLinks: {
    marginBottom: spacing.xl,
  },

  /* nothing imported yet */
  /* The two ways in and the line explaining them line up with the empty
     state's own title and button, rather than each finding its own centre. */
  ghostAction: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  emptyLead: {
    marginTop: spacing.lg,
    maxWidth: layout.maxTextWidth,
  },

  /* the selected reading */
  sheetTop: {
    alignItems: 'flex-start',
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  sheetHead: {
    flex: 1,
  },
  selectedHint: {
    marginTop: spacing.md,
    maxWidth: layout.maxTextWidth,
  },
  hero: {
    marginTop: spacing.xl,
  },

  /* the sheet */
  readingRow: {
    minHeight: 34,
    paddingVertical: spacing.sm,
  },
  readingHead: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  readingLabel: {
    flexShrink: 1,
  },
  readingValue: {
    flexShrink: 0,
  },
  readingNote: {
    marginTop: spacing.xs,
    maxWidth: layout.maxTextWidth,
  },
  sheetRows: {
    marginTop: spacing.lg,
  },
  segHead: {
    alignItems: 'flex-end',
    marginBottom: spacing.xs,
  },
  segRow: {
    alignItems: 'baseline',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 34,
    paddingVertical: spacing.sm,
  },
  segLabel: {
    flex: 1,
  },
  segValue: {
    flexShrink: 0,
  },
  segShare: {
    flexShrink: 0,
    minWidth: 62,
  },
  bmiCopy: {
    marginTop: spacing.lg,
    maxWidth: layout.maxTextWidth,
  },

  /* progress */
  secondSpan: {
    marginTop: spacing.xl,
  },
  chartTitle: {
    marginBottom: spacing.sm,
    marginTop: spacing.xl,
  },
});
