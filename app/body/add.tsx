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

import { useScanDate } from '@/components/body/useScanDate';
import {
  AppHeader,
  Button,
  Card,
  IconButton,
  LoadingView,
  NumberField,
  Screen,
  TextField,
  Txt,
} from '@/components/ui';
import {
  SEGMENT_LABEL_KEYS,
  deriveMissing,
  validateScan,
  type ScanMetricLabelKey,
  type ScanProblem,
  type ScanUnitKey,
} from '@/domain/bodyScan';
import { addDays, parseDateKey, todayKey } from '@/domain/date';
import { formatAmount } from '@/domain/format';
import { makeId } from '@/domain/id';
import { mirrorIcon, useDirection } from '@/i18n';
import { parseScanDraft, type ScanDraft } from '@/services/bodyScan';
import { useApp } from '@/state/AppStore';
import { radius, spacing, useTheme } from '@/theme';
import type { BodyScan, ScanSource, SegmentalValues } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Decoration only: the surrounding control already carries the label. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

const NUMBER_KEYS = [
  'weightKg',
  'skeletalMuscleKg',
  'bodyFatKg',
  'bodyFatPercent',
  'fatFreeMassKg',
  'totalBodyWaterL',
  'proteinKg',
  'mineralsKg',
  'bmi',
  'bmrKcal',
  'visceralFatLevel',
  'visceralFatAreaCm2',
  'waistHipRatio',
  'inBodyScore',
  'targetWeightKg',
] as const;

type NumberKey = (typeof NUMBER_KEYS)[number];
type Values = Record<NumberKey, number | null>;

const EMPTY_VALUES: Values = {
  weightKg: null,
  skeletalMuscleKg: null,
  bodyFatKg: null,
  bodyFatPercent: null,
  fatFreeMassKg: null,
  totalBodyWaterL: null,
  proteinKg: null,
  mineralsKg: null,
  bmi: null,
  bmrKcal: null,
  visceralFatLevel: null,
  visceralFatAreaCm2: null,
  waistHipRatio: null,
  inBodyScore: null,
  targetWeightKg: null,
};

const SEGMENT_KEYS = ['rightArm', 'leftArm', 'trunk', 'rightLeg', 'leftLeg'] as const;
type SegmentKey = (typeof SEGMENT_KEYS)[number];
type Segments = Record<SegmentKey, number | null>;

const EMPTY_SEGMENTS: Segments = {
  rightArm: null,
  leftArm: null,
  trunk: null,
  rightLeg: null,
  leftLeg: null,
};

interface FieldDef {
  key: NumberKey;
  /** Wording taken from the sheet itself, so the form reads like the printout. */
  labelKey: ScanMetricLabelKey;
  unitKey?: ScanUnitKey;
  max: number;
  placeholderKey?: 'weightPlaceholder';
}

/** The four every sheet prints, and the four he actually tracks. */
const MAIN_FIELDS: FieldDef[] = [
  {
    key: 'weightKg',
    labelKey: 'body:fieldWeight',
    unitKey: 'units:kg',
    max: 400,
    placeholderKey: 'weightPlaceholder',
  },
  { key: 'skeletalMuscleKg', labelKey: 'body:fieldMuscle', unitKey: 'units:kg', max: 150 },
  { key: 'bodyFatKg', labelKey: 'body:fieldFatMass', unitKey: 'units:kg', max: 250 },
  { key: 'bodyFatPercent', labelKey: 'body:fieldFatPercent', unitKey: 'units:percent', max: 100 },
];

const MORE_FIELDS: FieldDef[] = [
  { key: 'fatFreeMassKg', labelKey: 'body:fieldLeanMass', unitKey: 'units:kg', max: 300 },
  { key: 'totalBodyWaterL', labelKey: 'body:fieldWater', unitKey: 'units:litre', max: 200 },
  { key: 'proteinKg', labelKey: 'body:fieldProtein', unitKey: 'units:kg', max: 60 },
  { key: 'mineralsKg', labelKey: 'body:fieldMinerals', unitKey: 'units:kg', max: 20 },
  { key: 'bmi', labelKey: 'body:fieldBmi', max: 100 },
  { key: 'bmrKcal', labelKey: 'body:fieldBmr', unitKey: 'units:kcal', max: 8000 },
  { key: 'visceralFatLevel', labelKey: 'body:fieldVisceralLevel', max: 60 },
  { key: 'visceralFatAreaCm2', labelKey: 'body:fieldVisceralArea', unitKey: 'body:unitCm2', max: 500 },
  { key: 'waistHipRatio', labelKey: 'body:fieldWaistHip', max: 3 },
  { key: 'inBodyScore', labelKey: 'body:fieldScore', max: 100 },
  { key: 'targetWeightKg', labelKey: 'body:fieldTargetWeight', unitKey: 'units:kg', max: 400 },
];

/** Why a field filled itself in, said plainly so nobody mistakes it for the sheet. */
const CALCULATED_HINT_KEYS = {
  bodyFatKg: 'calcFromPercent',
  bodyFatPercent: 'calcFromFatMass',
  fatFreeMassKg: 'calcFromFatMass',
  bmi: 'calcBmi',
} as const satisfies Partial<Record<NumberKey, string>>;

const SOURCE_NOTE_KEYS = {
  manual: null,
  qr: 'sourceNoteQr',
  photo: 'sourceNotePhoto',
  document: 'sourceNoteDocument',
} as const satisfies Record<ScanSource, string | null>;

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

function readSource(value: string | undefined): ScanSource {
  const sources: ScanSource[] = ['manual', 'qr', 'photo', 'document'];
  return sources.find((source) => source === value) ?? 'manual';
}

function readDate(value: string | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayKey();
}

/** Midday on a back-dated reading, so the ordering inside a day stays stable. */
function timestampFor(date: string): string {
  if (date === todayKey()) return new Date().toISOString();
  const at = parseDateKey(date);
  at.setHours(12, 0, 0, 0);
  return at.toISOString();
}

function valuesFrom(source: BodyScan | ScanDraft): Values {
  const next: Values = { ...EMPTY_VALUES };
  for (const key of NUMBER_KEYS) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) next[key] = value;
  }
  return next;
}

function segmentsFrom(values: SegmentalValues | undefined): Segments {
  const next: Segments = { ...EMPTY_SEGMENTS };
  if (!values) return next;
  for (const key of SEGMENT_KEYS) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value)) next[key] = value;
  }
  return next;
}

function segmentalFrom(values: Segments): SegmentalValues | null {
  const next: SegmentalValues = {};
  let filled = 0;
  for (const key of SEGMENT_KEYS) {
    const value = values[key];
    if (value !== null) {
      next[key] = value;
      filled += 1;
    }
  }
  return filled > 0 ? next : null;
}

export default function AddBodyScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    draft?: string;
    source?: string;
    sourceUri?: string;
  }>();
  const { t } = useTranslation(['body', 'common', 'units']);
  const { colors } = useTheme();
  const { isRTL } = useDirection();
  const { dayLabel, shortDay } = useScanDate();
  const { ready, profile, bodyScans, saveBodyScan } = useApp();

  const editingId = firstParam(params.id) ?? '';
  const draftParam = firstParam(params.draft) ?? '';
  const sourceUri = firstParam(params.sourceUri) ?? '';

  const existing = useMemo(
    () => (editingId ? (bodyScans.find((scan) => scan.id === editingId) ?? null) : null),
    [bodyScans, editingId],
  );

  // Whatever the import screen handed over, read once and never re-read: from here
  // on the form owns these numbers.
  const [draft] = useState<ScanDraft>(() => (draftParam ? parseScanDraft(draftParam) : {}));

  const [scanId] = useState(() => editingId || makeId('s'));
  const [source, setSource] = useState<ScanSource>(() => readSource(firstParam(params.source)));
  const [date, setDate] = useState<string>(() => readDate(draft.date));
  const [takenAt, setTakenAt] = useState<string>(() => timestampFor(readDate(draft.date)));
  const [values, setValues] = useState<Values>(() => valuesFrom(draft));
  const [lean, setLean] = useState<Segments>(() => segmentsFrom(draft.segmentalLeanKg));
  const [fat, setFat] = useState<Segments>(() => segmentsFrom(draft.segmentalFatKg));
  const [device, setDevice] = useState(() => draft.device ?? '');
  const [note, setNote] = useState(() => draft.note ?? '');

  const [showMore, setShowMore] = useState(false);
  const [showSegments, setShowSegments] = useState(
    () => Boolean(draft.segmentalLeanKg ?? draft.segmentalFatKg),
  );
  // Numbers that arrived from an import are worth a confirmation before they are
  // thrown away, exactly like numbers that were typed.
  const [touched, setTouched] = useState(() => Object.keys(draft).length > 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An edited reading is only in the store after the first load, so it fills the
  // form once, and never again over whatever the user has typed since.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !existing) return;
    hydrated.current = true;
    setSource(existing.source);
    setDate(existing.date);
    setTakenAt(existing.takenAt);
    setValues(valuesFrom(existing));
    setLean(segmentsFrom(existing.segmentalLeanKg));
    setFat(segmentsFrom(existing.segmentalFatKg));
    setDevice(existing.device ?? '');
    setNote(existing.note ?? '');
    if (existing.segmentalLeanKg || existing.segmentalFatKg) setShowSegments(true);
  }, [existing]);

  const today = todayKey();
  const missing = editingId !== '' && ready && !existing;

  const candidate = useMemo<BodyScan>(() => {
    const scan: BodyScan = {
      id: scanId,
      date,
      takenAt,
      source,
      weightKg: values.weightKg ?? 0,
    };
    for (const key of NUMBER_KEYS) {
      const value = values[key];
      if (value !== null) scan[key] = value;
    }
    const leanValues = segmentalFrom(lean);
    if (leanValues) scan.segmentalLeanKg = leanValues;
    const fatValues = segmentalFrom(fat);
    if (fatValues) scan.segmentalFatKg = fatValues;
    if (device.trim()) scan.device = device.trim().slice(0, 60);
    if (note.trim()) scan.note = note.trim().slice(0, 300);
    const uri = existing?.sourceUri ?? (sourceUri || '');
    if (uri) scan.sourceUri = uri;
    return scan;
  }, [scanId, date, takenAt, source, values, lean, fat, device, note, existing, sourceUri]);

  // Derivation runs on every keystroke, but only once there is a weight to derive
  // from: without one, every identity would fill itself with zero.
  const derived = useMemo(
    () => (candidate.weightKg > 0 ? deriveMissing(candidate, profile?.heightCm) : candidate),
    [candidate, profile?.heightCm],
  );

  const problems = useMemo(
    () => (derived.weightKg > 0 ? validateScan(derived) : []),
    [derived],
  );

  const setValue = useCallback((key: NumberKey, next: number | null) => {
    setTouched(true);
    setError(null);
    setValues((current) => ({ ...current, [key]: next }));
  }, []);

  const setSegment = useCallback(
    (which: 'lean' | 'fat', key: SegmentKey, next: number | null) => {
      setTouched(true);
      setError(null);
      const update = (current: Segments) => ({ ...current, [key]: next });
      if (which === 'lean') setLean(update);
      else setFat(update);
    },
    [],
  );

  const shiftDate = useCallback(
    (days: number) => {
      setTouched(true);
      setDate((current) => {
        const next = addDays(current, days);
        if (!existing) setTakenAt(timestampFor(next));
        return next;
      });
    },
    [existing],
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/body');
  }, [router]);

  const handleBack = useCallback(() => {
    if (!touched) {
      goBack();
      return;
    }
    confirmAction({
      title: t('discardTitle'),
      message: t('discardMessage'),
      confirmLabel: t('discard'),
      cancelLabel: t('common:cancel'),
      onConfirm: goBack,
    });
  }, [touched, goBack, t]);

  const handleSave = useCallback(() => {
    if (saving || derived.weightKg <= 0) return;
    setSaving(true);
    setError(null);
    void saveBodyScan(derived)
      .then(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/body');
      })
      .catch(() => {
        setSaving(false);
        setError(t('saveFailed'));
      });
  }, [saving, derived, saveBodyScan, router, t]);

  /**
   * One problem, in the reader's language. Each key is named on its own line
   * because i18next checks the interpolations of a key it can see.
   */
  const problemText = (problem: ScanProblem): string => {
    const label = (name: string): string => {
      const key = problem.labels?.[name];
      return key ? t(key) : '';
    };
    const num = (name: string): string => {
      const value = problem.values?.[name];
      return value === undefined ? '' : formatAmount(value, 2);
    };

    switch (problem.key) {
      case 'body:problemWeightRequired':
        return t('body:problemWeightRequired');
      case 'body:problemNotNumber':
        return t('body:problemNotNumber', { label: label('label') });
      case 'body:problemNegative':
        return t('body:problemNegative', { label: label('label') });
      case 'body:problemSegmentNegative':
        return t('body:problemSegmentNegative', { kind: label('kind'), part: label('part') });
      case 'body:problemFatRange':
        return t('body:problemFatRange', {
          value: num('value'),
          min: num('min'),
          max: num('max'),
        });
      case 'body:problemMuscleOverLean':
        return t('body:problemMuscleOverLean', { muscle: num('muscle'), lean: num('lean') });
      case 'body:problemLeanOverWeight':
        return t('body:problemLeanOverWeight', { lean: num('lean'), weight: num('weight') });
      case 'body:problemFatMismatch':
        return t('body:problemFatMismatch', {
          fat: num('fat'),
          percent: num('percent'),
          weight: num('weight'),
          expected: num('expected'),
        });
    }
  };

  const renderField = (def: FieldDef) => {
    const typed = values[def.key];
    // Only the four fields an identity can fill show a number nobody typed.
    const hintKey = def.key in CALCULATED_HINT_KEYS
      ? CALCULATED_HINT_KEYS[def.key as keyof typeof CALCULATED_HINT_KEYS]
      : undefined;
    const calculated = typed === null && hintKey ? (derived[def.key] ?? null) : null;
    return (
      <NumberField
        key={def.key}
        label={t(def.labelKey)}
        value={typed ?? calculated}
        onChange={(next) => setValue(def.key, next)}
        suffix={def.unitKey ? t(def.unitKey) : undefined}
        placeholder={def.placeholderKey ? t(def.placeholderKey) : undefined}
        hint={calculated === null || !hintKey ? undefined : t(hintKey)}
        min={0}
        max={def.max}
        error={
          def.key === 'weightKg' && touched && typed === null ? t('weightNeeded') : undefined
        }
        style={styles.field}
      />
    );
  };

  const disclosure = (title: string, caption: string, open: boolean, onToggle: () => void) => (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={caption}
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [
        styles.disclosure,
        pressed ? { backgroundColor: colors.surfaceAlt } : null,
      ]}
    >
      <View style={styles.disclosureText}>
        <Txt weight="semibold">{title}</Txt>
        <Txt variant="caption" color="faint" numberOfLines={2}>
          {caption}
        </Txt>
      </View>
      <View {...DECORATIVE}>
        <Ionicons
          name={(open ? 'chevron-up' : 'chevron-down') as IconName}
          size={18}
          color={colors.textFaint}
        />
      </View>
    </Pressable>
  );

  // Readings arrive with the first load from storage, so an edit waits for them
  // rather than showing an empty form it would then overwrite.
  if (editingId !== '' && !ready) {
    return (
      <Screen edges={['top', 'bottom']}>
        <AppHeader title={t('editTitle')} onBack={goBack} />
        <LoadingView message={t('loadingOne')} />
      </Screen>
    );
  }

  if (missing) {
    return (
      <Screen scroll edges={['top', 'bottom']}>
        <AppHeader title={t('notFoundTitle')} onBack={goBack} />
        <Card>
          <Txt color="muted">{t('notFoundBody')}</Txt>
          <Button
            label={t('backToList')}
            onPress={goBack}
            variant="secondary"
            style={styles.notFoundAction}
          />
        </Card>
      </Screen>
    );
  }

  const sourceNoteKey = SOURCE_NOTE_KEYS[source];

  return (
    <Screen scroll edges={['top', 'bottom']} keyboardAvoiding>
      <AppHeader
        title={existing ? t('editTitle') : t('addTitle')}
        subtitle={dayLabel(date)}
        onBack={handleBack}
      />

      {sourceNoteKey ? (
        <Card style={[styles.block, { backgroundColor: colors.accentSoft }]}>
          <Txt variant="label" color="muted">
            {t(sourceNoteKey)}
          </Txt>
        </Card>
      ) : null}

      <Card style={styles.block}>
        <Txt variant="label" color="muted" weight="semibold" style={styles.fieldLabel}>
          {t('dayOfScan')}
        </Txt>
        <View style={[styles.dateRow, { borderColor: colors.border }]}>
          <IconButton
            icon={mirrorIcon('chevron-back', isRTL)}
            variant="surface"
            size={18}
            onPress={() => shiftDate(-1)}
            accessibilityLabel={t('prevDay')}
          />
          <View style={styles.dateLabel}>
            <Txt weight="semibold" align="center" numberOfLines={1}>
              {dayLabel(date)}
            </Txt>
            <Txt variant="caption" color="faint" align="center">
              {shortDay(date)}
            </Txt>
          </View>
          <IconButton
            icon={mirrorIcon('chevron-forward', isRTL)}
            variant="surface"
            size={18}
            disabled={date >= today}
            onPress={() => shiftDate(1)}
            accessibilityLabel={t('nextDay')}
          />
        </View>
      </Card>

      <Card style={styles.block}>
        <Txt variant="caption" color="faint" weight="bold" style={styles.sectionTitle}>
          {t('sectionMain').toUpperCase()}
        </Txt>
        {MAIN_FIELDS.map(renderField)}
      </Card>

      <Card padded={false} style={styles.block}>
        {disclosure(t('moreFields'), t('moreFieldsHint'), showMore, () =>
          setShowMore((open) => !open),
        )}
        {showMore ? (
          <View style={styles.disclosureBody}>
            {MORE_FIELDS.map(renderField)}
            <TextField
              label={t('machine')}
              value={device}
              onChangeText={(next) => {
                setTouched(true);
                setDevice(next);
              }}
              placeholder={t('machinePlaceholder')}
              maxLength={60}
              autoCapitalize="words"
              style={styles.field}
            />
          </View>
        ) : null}
      </Card>

      <Card padded={false} style={styles.block}>
        {disclosure(t('segmental'), t('segmentalHint'), showSegments, () =>
          setShowSegments((open) => !open),
        )}
        {showSegments ? (
          <View style={styles.disclosureBody}>
            <Txt variant="caption" color="faint" weight="bold" style={styles.sectionTitle}>
              {`${t('segmentalLean')} · ${t('units:kg')}`.toUpperCase()}
            </Txt>
            {SEGMENT_KEYS.map((key) => (
              <NumberField
                key={`lean-${key}`}
                label={t(SEGMENT_LABEL_KEYS[key])}
                value={lean[key]}
                onChange={(next) => setSegment('lean', key, next)}
                suffix={t('units:kg')}
                min={0}
                max={80}
                style={styles.field}
              />
            ))}

            <Txt variant="caption" color="faint" weight="bold" style={styles.sectionTitleSpaced}>
              {`${t('segmentalFat')} · ${t('units:kg')}`.toUpperCase()}
            </Txt>
            {SEGMENT_KEYS.map((key) => (
              <NumberField
                key={`fat-${key}`}
                label={t(SEGMENT_LABEL_KEYS[key])}
                value={fat[key]}
                onChange={(next) => setSegment('fat', key, next)}
                suffix={t('units:kg')}
                min={0}
                max={80}
                style={styles.field}
              />
            ))}
          </View>
        ) : null}
      </Card>

      <Card style={styles.block}>
        <TextField
          label={t('note')}
          value={note}
          onChangeText={(next) => {
            setTouched(true);
            setNote(next);
          }}
          placeholder={t('notePlaceholder')}
          maxLength={300}
          multiline
        />
      </Card>

      {problems.length > 0 ? (
        <Card style={[styles.block, { borderColor: colors.warning }]}>
          <View style={styles.warningHead}>
            <View {...DECORATIVE}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
            </View>
            <Txt weight="semibold">{t('checkTitle')}</Txt>
          </View>
          {problems.map((problem, index) => (
            <Txt
              key={`${problem.key}-${index}`}
              variant="label"
              color="muted"
              style={styles.warning}
            >
              {problemText(problem)}
            </Txt>
          ))}
          <Txt variant="caption" color="faint" style={styles.warningFoot}>
            {t('checkFoot')}
          </Txt>
        </Card>
      ) : null}

      {error ? (
        <Txt variant="label" color="danger" style={styles.error}>
          {error}
        </Txt>
      ) : null}

      <Button
        label={existing ? t('saveEdit') : t('saveNew')}
        onPress={handleSave}
        disabled={derived.weightKg <= 0}
        loading={saving}
        accessibilityHint={derived.weightKg <= 0 ? t('saveHintBlocked') : t('saveHintReady')}
        fullWidth
        style={styles.save}
      />

      <Txt variant="caption" color="faint" align="center" style={styles.foot}>
        {t('addFoot')}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  sectionTitleSpaced: {
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  fieldLabel: {
    marginBottom: spacing.sm,
  },
  field: {
    marginBottom: spacing.md,
  },
  dateRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dateLabel: {
    flex: 1,
  },
  disclosure: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  disclosureText: {
    flex: 1,
    rowGap: 2,
  },
  disclosureBody: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  warningHead: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  warning: {
    marginTop: spacing.xs,
  },
  warningFoot: {
    marginTop: spacing.md,
  },
  error: {
    marginTop: spacing.md,
  },
  save: {
    marginTop: spacing.xl,
  },
  foot: {
    marginTop: spacing.md,
  },
  notFoundAction: {
    marginTop: spacing.lg,
  },
});
