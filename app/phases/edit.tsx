import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps,
} from 'react-native';

import { useDayText } from '@/components/history/dayText';
import { PHASE_KIND_LABEL_KEYS } from '@/components/phase/PhaseBar';
import {
  AppHeader,
  Badge,
  Button,
  Chip,
  EmptyState,
  LoadingView,
  NumberField,
  Screen,
  Section,
  SegmentedControl,
  StatTile,
  TextField,
  Txt,
  type SegmentedOption,
} from '@/components/ui';
import { addDays, parseDateKey, toDateKey, todayKey } from '@/domain/date';
import { formatCount } from '@/domain/format';
import { makeId } from '@/domain/id';
import {
  MAX_PHASE_DAYS,
  MIN_PHASE_DAYS,
  PHASE_KINDS,
  phaseLengthDays,
  targetsForPhase,
  validatePhase,
  type PhaseIssue,
} from '@/domain/phase';
import { mirrorIcon, useDirection } from '@/i18n';
import { useApp } from '@/state/AppStore';
import { layout, radius, spacing, useTheme } from '@/theme';
import type { Phase, PhaseKind } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Decoration only: the control beside it already carries the label. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

/** What each kind does to the daily target, in one line. */
const KIND_EFFECT_KEYS = {
  cut: 'phases:cutEffect',
  maintain: 'phases:maintainEffect',
  build: 'phases:buildEffect',
} as const satisfies Record<PhaseKind, string>;

/** The four figures a phase can carry by hand, in the order they are read. */
type TargetKey = 'calories' | 'protein' | 'carbs' | 'fat';

const TARGET_FIELDS = [
  { key: 'calories', labelKey: 'macros:calories', unitKey: 'units:kcal', max: 8000 },
  { key: 'protein', labelKey: 'macros:protein', unitKey: 'units:gram', max: 500 },
  { key: 'carbs', labelKey: 'macros:carbs', unitKey: 'units:gram', max: 1200 },
  { key: 'fat', labelKey: 'macros:fat', unitKey: 'units:gram', max: 400 },
] as const satisfies readonly { key: TargetKey; labelKey: string; unitKey: string; max: number }[];

type Overrides = Record<TargetKey, number | null>;

const NO_OVERRIDES: Overrides = { calories: null, protein: null, carbs: null, fat: null };

/** The ones that make a phase impossible rather than merely unusual. */
const BLOCKING: PhaseIssue[] = ['errorBadDates', 'errorEndBeforeStart', 'errorOverlap'];

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

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Last day of the month a date falls in. Day 0 of the next month is that day. */
function endOfMonth(key: string): string {
  const at = parseDateKey(key);
  return toDateKey(new Date(at.getFullYear(), at.getMonth() + 1, 0));
}

function endOfYear(key: string): string {
  return toDateKey(new Date(parseDateKey(key).getFullYear(), 11, 31));
}

function firstOfNextMonth(key: string): string {
  const at = parseDateKey(key);
  return toDateKey(new Date(at.getFullYear(), at.getMonth() + 1, 1));
}

/** Inclusive end of a phase `weeks` weeks long: four weeks is 28 days, not 29. */
function endAfterWeeks(start: string, weeks: number): string {
  return addDays(start, weeks * 7 - 1);
}

function overridesFrom(phase: Phase): Overrides {
  return {
    calories: phase.calories ?? null,
    protein: phase.proteinG ?? null,
    carbs: phase.carbsG ?? null,
    fat: phase.fatG ?? null,
  };
}

/**
 * The phase editor.
 *
 * A phase is two dates, a kind, and whatever figures the user wants to pin by
 * hand. Everything else is worked out from the body profile and shown live, so
 * the screen always says what the phase would actually ask for.
 */
export default function PhaseEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation(['phases', 'common', 'macros', 'units']);
  const { colors } = useTheme();
  const { isRTL } = useDirection();
  const { dayLabel, shortDay } = useDayText();
  const { ready, profile, phases, savePhase, deletePhase } = useApp();

  const editingId = firstParam(params.id) ?? '';
  const existing = useMemo(
    () => (editingId ? (phases.find((phase) => phase.id === editingId) ?? null) : null),
    [phases, editingId],
  );

  const today = todayKey();

  const [phaseId] = useState(() => editingId || makeId('ph'));
  const [createdAt] = useState(() => new Date().toISOString());
  const [kind, setKind] = useState<PhaseKind>('cut');
  const [startDate, setStartDate] = useState(today);
  // Four weeks is the shortest span worth planning that still reads as a block
  // of time, so a new phase opens on one and the presets do the rest.
  const [endDate, setEndDate] = useState(() => endAfterWeeks(today, 4));
  const [overrides, setOverrides] = useState<Overrides>(NO_OVERRIDES);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A stored phase only reaches the form after the first load, so it fills the
  // fields once and never again over whatever has been typed since.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !existing) return;
    hydrated.current = true;
    setKind(existing.kind);
    setStartDate(existing.startDate);
    setEndDate(existing.endDate);
    setOverrides(overridesFrom(existing));
    setNote(existing.note ?? '');
  }, [existing]);

  const missing = editingId !== '' && ready && !existing && !removing;

  const candidate = useMemo<Phase>(() => {
    const phase: Phase = {
      id: phaseId,
      kind,
      startDate,
      endDate,
      createdAt: existing?.createdAt ?? createdAt,
      updatedAt: createdAt,
    };
    if (overrides.calories !== null) phase.calories = overrides.calories;
    if (overrides.protein !== null) phase.proteinG = overrides.protein;
    if (overrides.carbs !== null) phase.carbsG = overrides.carbs;
    if (overrides.fat !== null) phase.fatG = overrides.fat;
    const trimmed = note.trim();
    if (trimmed) phase.note = trimmed.slice(0, 200);
    return phase;
  }, [phaseId, kind, startDate, endDate, overrides, note, existing, createdAt]);

  const issues = useMemo(() => validatePhase(candidate, phases), [candidate, phases]);
  const blocked = issues.some((issue) => BLOCKING.includes(issue));

  const stepStart = useCallback((days: number) => {
    setTouched(true);
    setError(null);
    setStartDate((current) => addDays(current, days));
  }, []);

  const stepEnd = useCallback((days: number) => {
    setTouched(true);
    setError(null);
    setEndDate((current) => addDays(current, days));
  }, []);

  const jumpStart = useCallback((next: string) => {
    setTouched(true);
    setError(null);
    setStartDate(next);
  }, []);

  const jumpEnd = useCallback((next: string) => {
    setTouched(true);
    setError(null);
    setEndDate(next);
  }, []);

  const setOverride = useCallback((key: TargetKey, next: number | null) => {
    setTouched(true);
    setError(null);
    setOverrides((current) => ({ ...current, [key]: next }));
  }, []);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/phases');
  }, [router]);

  const handleBack = useCallback(() => {
    if (!touched) {
      goBack();
      return;
    }
    confirmAction({
      title: t('phases:discardTitle'),
      message: t('phases:discardMessage'),
      confirmLabel: t('phases:discard'),
      cancelLabel: t('common:cancel'),
      onConfirm: goBack,
    });
  }, [touched, goBack, t]);

  const handleSave = useCallback(() => {
    if (saving || blocked) return;
    setSaving(true);
    setError(null);
    void savePhase(candidate)
      .then(goBack)
      .catch(() => {
        setSaving(false);
        setError(t('phases:saveFailed'));
      });
  }, [saving, blocked, savePhase, candidate, goBack, t]);

  const handleDelete = useCallback(() => {
    if (!existing) return;
    confirmAction({
      title: t('phases:deleteTitle'),
      message: t('phases:deleteMessage', {
        kind: t(PHASE_KIND_LABEL_KEYS[existing.kind]),
        dates: t('phases:dateRange', {
          from: shortDay(existing.startDate),
          to: shortDay(existing.endDate),
        }),
      }),
      confirmLabel: t('common:delete'),
      cancelLabel: t('common:cancel'),
      onConfirm: () => {
        setRemoving(true);
        void deletePhase(existing.id)
          .then(goBack)
          .catch(() => {
            setRemoving(false);
            setError(t('phases:saveFailed'));
          });
      },
    });
  }, [existing, deletePhase, goBack, shortDay, t]);

  /** One validation message, in the reader's language. */
  const issueText = (issue: PhaseIssue): string => {
    switch (issue) {
      case 'errorBadDates':
        return t('phases:errorBadDates');
      case 'errorEndBeforeStart':
        return t('phases:errorEndBeforeStart');
      case 'errorTooShort':
        return t('phases:errorTooShort', { days: formatCount(MIN_PHASE_DAYS) });
      case 'errorTooLong':
        return t('phases:errorTooLong', { days: formatCount(MAX_PHASE_DAYS) });
      case 'errorOverlap':
        return t('phases:errorOverlap');
    }
  };

  if (!ready) {
    return (
      <Screen edges={['top', 'bottom']}>
        <AppHeader title={t('phases:editTitle')} onBack={goBack} />
        <LoadingView message={t('phases:loading')} />
      </Screen>
    );
  }

  if (missing) {
    return (
      <Screen scroll edges={['top', 'bottom']}>
        <AppHeader title={t('phases:notFoundTitle')} onBack={goBack} />
        <Section first>
          <Txt color="muted" style={styles.measure}>
            {t('phases:notFoundBody')}
          </Txt>
          <Button
            label={t('phases:backToList')}
            onPress={goBack}
            variant="secondary"
            style={styles.backButton}
          />
        </Section>
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen scroll edges={['top', 'bottom']}>
        <AppHeader title={t('phases:addTitle')} onBack={goBack} />
        <EmptyState
          icon="person-add-outline"
          title={t('phases:needProfileTitle')}
          message={t('phases:needProfileBody')}
          actionLabel={t('phases:needProfileAction')}
          onAction={() => router.replace('/onboarding')}
        />
      </Screen>
    );
  }

  const kindOptions: SegmentedOption<PhaseKind>[] = PHASE_KINDS.map((option) => ({
    value: option,
    label: t(PHASE_KIND_LABEL_KEYS[option]),
  }));

  /** What the phase asks for as it stands, override by override. */
  const plan = targetsForPhase(profile, candidate);
  const gram = t('units:gram');
  const length = phaseLengthDays(candidate);
  const dates = t('phases:dateRange', {
    from: shortDay(startDate),
    to: shortDay(endDate),
  });

  /** Calories are the only figure here that is not measured in grams. */
  const unitFor = (key: TargetKey): string => (key === 'calories' ? t('units:kcal') : gram);

  /** Day and week steppers either side of the date, with the presets under them. */
  const renderDate = (
    label: string,
    value: string,
    step: (days: number) => void,
    presets: { key: string; label: string; onPress: () => void }[],
  ) => (
    <View style={styles.dateBlock}>
      <Txt variant="label" color="muted">
        {label}
      </Txt>
      <View style={[styles.dateRow, { borderColor: colors.border }]}>
        {[
          { icon: 'play-back', days: -7, action: t('phases:stepWeekBack'), size: 15 },
          { icon: 'chevron-back', days: -1, action: t('phases:stepDayBack'), size: 18 },
        ].map((control) => (
          <Pressable
            key={control.action}
            onPress={() => step(control.days)}
            accessibilityRole="button"
            accessibilityLabel={t('phases:stepSpoken', { field: label, action: control.action })}
            style={({ pressed }) => [styles.step, pressed ? styles.pressed : null]}
          >
            <View {...DECORATIVE}>
              <Ionicons
                name={mirrorIcon(control.icon, isRTL) as IconName}
                size={control.size}
                color={colors.textMuted}
              />
            </View>
          </Pressable>
        ))}

        <View style={styles.dateLabel}>
          <Txt weight="semibold" align="center" numberOfLines={1}>
            {dayLabel(value)}
          </Txt>
          <Txt variant="caption" color="faint" align="center" numberOfLines={1} tabular>
            {shortDay(value)}
          </Txt>
        </View>

        {[
          { icon: 'chevron-forward', days: 1, action: t('phases:stepDayForward'), size: 18 },
          { icon: 'play-forward', days: 7, action: t('phases:stepWeekForward'), size: 15 },
        ].map((control) => (
          <Pressable
            key={control.action}
            onPress={() => step(control.days)}
            accessibilityRole="button"
            accessibilityLabel={t('phases:stepSpoken', { field: label, action: control.action })}
            style={({ pressed }) => [styles.step, pressed ? styles.pressed : null]}
          >
            <View {...DECORATIVE}>
              <Ionicons
                name={mirrorIcon(control.icon, isRTL) as IconName}
                size={control.size}
                color={colors.textMuted}
              />
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.presets}>
        {presets.map((preset) => (
          <Chip key={preset.key} label={preset.label} onPress={preset.onPress} />
        ))}
      </View>
    </View>
  );

  return (
    <Screen scroll edges={['top', 'bottom']} keyboardAvoiding>
      <AppHeader
        title={existing ? t('phases:editTitle') : t('phases:addTitle')}
        subtitle={dates}
        onBack={handleBack}
      />

      <Section title={t('phases:kindTitle')} first gap="tight">
        <SegmentedControl
          options={kindOptions}
          value={kind}
          onChange={(next) => {
            setTouched(true);
            setError(null);
            setKind(next);
          }}
          style={styles.segments}
        />
        <Txt variant="label" color="muted" style={styles.measure}>
          {t(KIND_EFFECT_KEYS[kind])}
        </Txt>
      </Section>

      <Section title={t('phases:datesTitle')} gap="tight">
        {renderDate(t('phases:startLabel'), startDate, stepStart, [
          { key: 'today', label: t('phases:presetToday'), onPress: () => jumpStart(today) },
          {
            key: 'tomorrow',
            label: t('phases:presetTomorrow'),
            onPress: () => jumpStart(addDays(today, 1)),
          },
          {
            key: 'nextMonth',
            label: t('phases:presetNextMonth'),
            onPress: () => jumpStart(firstOfNextMonth(today)),
          },
        ])}

        {renderDate(t('phases:endLabel'), endDate, stepEnd, [
          {
            key: 'endOfMonth',
            label: t('phases:presetEndOfMonth'),
            onPress: () => jumpEnd(endOfMonth(startDate)),
          },
          {
            key: 'endOfYear',
            label: t('phases:presetEndOfYear'),
            onPress: () => jumpEnd(endOfYear(startDate)),
          },
          {
            key: 'weeks4',
            label: t('phases:presetFourWeeks'),
            onPress: () => jumpEnd(endAfterWeeks(startDate, 4)),
          },
          {
            key: 'weeks8',
            label: t('phases:presetEightWeeks'),
            onPress: () => jumpEnd(endAfterWeeks(startDate, 8)),
          },
          {
            key: 'weeks12',
            label: t('phases:presetTwelveWeeks'),
            onPress: () => jumpEnd(endAfterWeeks(startDate, 12)),
          },
        ])}

        {/* A span is only worth printing once there is one; an inverted pair
            says what is wrong in the line underneath instead. */}
        {length > 0 ? (
          <Txt variant="label" color="muted" tabular style={styles.span}>
            {t('phases:lengthDays', { days: formatCount(length) })}
          </Txt>
        ) : null}

        {issues.length > 0 ? (
          <View style={styles.issues}>
            {issues.map((issue) => {
              const stops = BLOCKING.includes(issue);
              return (
                <View key={issue} style={styles.issueRow}>
                  <View {...DECORATIVE}>
                    <Ionicons
                      name="alert-circle"
                      size={13}
                      color={stops ? colors.danger : colors.warning}
                    />
                  </View>
                  <Txt variant="caption" color={stops ? 'danger' : 'warning'} style={styles.measure}>
                    {issueText(issue)}
                  </Txt>
                </View>
              );
            })}
          </View>
        ) : null}
      </Section>

      <Section title={t('phases:targetTitle')} subtitle={t('phases:targetSubtitle')}>
        {/*
          The calorie figure leads at display size with its unit nested in the
          same run, and the three macros sit under it as figures of their own.
        */}
        <View style={styles.figureLine}>
          <Txt variant="display" color="accent" tabular numberOfLines={1}>
            {formatCount(plan.calories)}
            <Txt variant="label" color="faint" weight="medium">
              {` ${t('units:kcal')}`}
            </Txt>
          </Txt>
        </View>

        <View style={styles.macros}>
          {TARGET_FIELDS.filter((field) => field.key !== 'calories').map((field) => (
            <StatTile
              key={field.key}
              label={t(field.labelKey)}
              value={formatCount(plan[field.key])}
              unit={gram}
              style={styles.macroTile}
            />
          ))}
        </View>

        <View style={styles.fields}>
          {TARGET_FIELDS.map((field) => {
            const overridden = overrides[field.key] !== null;
            const label = t(field.labelKey);
            return (
              <View key={field.key} style={styles.field}>
                <NumberField
                  label={label}
                  value={overrides[field.key]}
                  onChange={(next) => setOverride(field.key, next)}
                  suffix={unitFor(field.key)}
                  placeholder={formatCount(plan[field.key])}
                  hint={
                    overridden
                      ? undefined
                      : t('phases:derivedValue', {
                          value: `${formatCount(plan[field.key])} ${unitFor(field.key)}`,
                        })
                  }
                  min={0}
                  max={field.max}
                />
                {/* A figure the user pinned says so, and says how to let go of it. */}
                {overridden ? (
                  <View style={styles.byHand}>
                    <Badge label={t('phases:byHand')} tone="accent" variant="plain" />
                    <Pressable
                      onPress={() => setOverride(field.key, null)}
                      accessibilityRole="button"
                      accessibilityLabel={t('phases:useDerivedSpoken', { label })}
                      hitSlop={{ top: 12, bottom: 12, left: spacing.sm, right: spacing.sm }}
                      style={({ pressed }) => [styles.reset, pressed ? styles.pressed : null]}
                    >
                      <Txt variant="caption" color="muted" numberOfLines={1}>
                        {t('phases:useDerived')}
                      </Txt>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </Section>

      <Section gap="tight">
        <TextField
          label={t('phases:noteLabel')}
          value={note}
          onChangeText={(next) => {
            setTouched(true);
            setNote(next);
          }}
          placeholder={t('phases:notePlaceholder')}
          maxLength={200}
          multiline
        />
      </Section>

      <Section>
        {error ? (
          <Txt variant="label" color="danger" style={styles.error}>
            {error}
          </Txt>
        ) : null}
        <Button
          label={t('common:save')}
          onPress={handleSave}
          disabled={blocked}
          loading={saving}
          fullWidth
        />
        {existing ? (
          <Button
            label={t('phases:deletePhase')}
            onPress={handleDelete}
            variant="danger"
            loading={removing}
            fullWidth
            style={styles.delete}
          />
        ) : null}
        <Txt variant="caption" color="faint" style={styles.foot}>
          {t('phases:disclaimer')}
        </Txt>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  measure: {
    maxWidth: layout.maxTextWidth,
  },
  backButton: {
    marginTop: spacing.lg,
  },
  segments: {
    marginBottom: spacing.md,
  },
  dateBlock: {
    marginTop: spacing.md,
  },
  dateRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  step: {
    alignItems: 'center',
    height: layout.minTarget,
    justifyContent: 'center',
    width: layout.minTarget,
  },
  dateLabel: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  presets: {
    columnGap: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    rowGap: spacing.sm,
  },
  span: {
    marginTop: spacing.lg,
  },
  issues: {
    marginTop: spacing.md,
    rowGap: spacing.xs,
  },
  issueRow: {
    alignItems: 'center',
    columnGap: spacing.xs + 1,
    flexDirection: 'row',
  },
  figureLine: {
    flexDirection: 'row',
  },
  macroTile: {
    // Three figures share one row on a phone, so the tile's own floor comes down.
    minWidth: 96,
  },
  macros: {
    columnGap: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.lg,
    rowGap: spacing.lg,
  },
  fields: {
    marginTop: spacing.xl,
  },
  field: {
    marginBottom: spacing.lg,
  },
  byHand: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xs + 2,
    rowGap: spacing.xs,
  },
  reset: {
    justifyContent: 'center',
    minHeight: 32,
  },
  error: {
    marginBottom: spacing.md,
  },
  delete: {
    marginTop: spacing.md,
  },
  foot: {
    marginTop: spacing.xl,
    maxWidth: layout.maxTextWidth,
  },
});
