import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps,
} from 'react-native';

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
import { deriveMissing, validateScan } from '@/domain/bodyScan';
import { addDays, formatDayLabel, formatShortDay, parseDateKey, todayKey } from '@/domain/date';
import { makeId } from '@/domain/id';
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

const SEGMENT_LABELS: Record<SegmentKey, string> = {
  rightArm: 'Right arm',
  leftArm: 'Left arm',
  trunk: 'Trunk',
  rightLeg: 'Right leg',
  leftLeg: 'Left leg',
};

interface FieldDef {
  key: NumberKey;
  label: string;
  suffix?: string;
  max: number;
  placeholder?: string;
}

/** The four every sheet prints, and the four people actually track. */
const MAIN_FIELDS: FieldDef[] = [
  { key: 'weightKg', label: 'Weight', suffix: 'kg', max: 400, placeholder: '77.1' },
  { key: 'skeletalMuscleKg', label: 'Skeletal muscle mass', suffix: 'kg', max: 150 },
  { key: 'bodyFatKg', label: 'Body fat mass', suffix: 'kg', max: 250 },
  { key: 'bodyFatPercent', label: 'Percent body fat', suffix: '%', max: 100 },
];

const MORE_FIELDS: FieldDef[] = [
  { key: 'fatFreeMassKg', label: 'Fat free mass', suffix: 'kg', max: 300 },
  { key: 'totalBodyWaterL', label: 'Total body water', suffix: 'L', max: 200 },
  { key: 'proteinKg', label: 'Protein', suffix: 'kg', max: 60 },
  { key: 'mineralsKg', label: 'Minerals', suffix: 'kg', max: 20 },
  { key: 'bmi', label: 'BMI', max: 100 },
  { key: 'bmrKcal', label: 'BMR', suffix: 'kcal', max: 8000 },
  { key: 'visceralFatLevel', label: 'Visceral fat level', max: 60 },
  { key: 'visceralFatAreaCm2', label: 'Visceral fat area', suffix: 'cm²', max: 500 },
  { key: 'waistHipRatio', label: 'Waist-hip ratio', max: 3 },
  { key: 'inBodyScore', label: 'InBody score', max: 100 },
  { key: 'targetWeightKg', label: 'Target weight', suffix: 'kg', max: 400 },
];

/** Why a field filled itself in, said plainly so nobody mistakes it for the sheet. */
const CALCULATED_HINTS: Partial<Record<NumberKey, string>> = {
  bodyFatKg: 'Calculated from weight and percent body fat. Type over it to use the sheet.',
  bodyFatPercent: 'Calculated from weight and body fat mass. Type over it to use the sheet.',
  fatFreeMassKg: 'Calculated from weight and body fat mass. Type over it to use the sheet.',
  bmi: 'Calculated from your profile height and this weight. Type over it to use the sheet.',
};

const SOURCE_NOTES: Record<ScanSource, string> = {
  manual: '',
  qr: 'Read from the InBody page. Check every number against the printout before you save.',
  photo: 'Read from your photo by the model. Check every number against the sheet before you save.',
  document: 'Read from your PDF by the model. Check every number against the sheet before you save.',
};

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
  const { colors } = useTheme();
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
      title: 'Discard this reading?',
      message: 'The numbers you entered have not been saved yet.',
      confirmLabel: 'Discard',
      onConfirm: goBack,
    });
  }, [touched, goBack]);

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
        setError('That reading could not be saved. Try again.');
      });
  }, [saving, derived, saveBodyScan, router]);

  const renderField = (def: FieldDef) => {
    const typed = values[def.key];
    // Only the four fields an identity can fill show a number nobody typed.
    const calculatedHint = CALCULATED_HINTS[def.key];
    const calculated = typed === null && calculatedHint ? (derived[def.key] ?? null) : null;
    return (
      <NumberField
        key={def.key}
        label={def.label}
        value={typed ?? calculated}
        onChange={(next) => setValue(def.key, next)}
        suffix={def.suffix}
        placeholder={def.placeholder}
        hint={calculated === null ? undefined : calculatedHint}
        min={0}
        max={def.max}
        error={def.key === 'weightKg' && touched && typed === null ? 'Weight is needed to save.' : undefined}
        style={styles.field}
      />
    );
  };

  const disclosure = (
    title: string,
    caption: string,
    open: boolean,
    onToggle: () => void,
  ) => (
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
        <AppHeader title="Edit reading" onBack={goBack} />
        <LoadingView message="Loading this reading" />
      </Screen>
    );
  }

  if (missing) {
    return (
      <Screen scroll edges={['top', 'bottom']}>
        <AppHeader title="Reading not found" onBack={goBack} />
        <Card>
          <Txt color="muted">
            That reading is no longer in your history. It may have been deleted on this device.
          </Txt>
          <Button label="Back to body scans" onPress={goBack} variant="secondary" style={styles.notFoundAction} />
        </Card>
      </Screen>
    );
  }

  const sourceNote = SOURCE_NOTES[source];

  return (
    <Screen scroll edges={['top', 'bottom']} keyboardAvoiding>
      <AppHeader
        title={existing ? 'Edit reading' : 'Add a reading'}
        subtitle={formatDayLabel(date, today)}
        onBack={handleBack}
      />

      {sourceNote ? (
        <Card style={[styles.block, { backgroundColor: colors.accentSoft }]}>
          <Txt variant="label" color="muted">
            {sourceNote}
          </Txt>
        </Card>
      ) : null}

      <Card style={styles.block}>
        <Txt variant="label" color="muted" weight="semibold" style={styles.fieldLabel}>
          Day of the scan
        </Txt>
        <View style={[styles.dateRow, { borderColor: colors.border }]}>
          <IconButton
            icon="chevron-back"
            variant="surface"
            size={18}
            onPress={() => shiftDate(-1)}
            accessibilityLabel="Move this reading to the previous day"
          />
          <View style={styles.dateLabel}>
            <Txt weight="semibold" align="center" numberOfLines={1}>
              {formatDayLabel(date, today)}
            </Txt>
            <Txt variant="caption" color="faint" align="center">
              {formatShortDay(date)}
            </Txt>
          </View>
          <IconButton
            icon="chevron-forward"
            variant="surface"
            size={18}
            disabled={date >= today}
            onPress={() => shiftDate(1)}
            accessibilityLabel="Move this reading to the next day"
          />
        </View>
      </Card>

      <Card style={styles.block}>
        <Txt variant="caption" color="faint" weight="bold" style={styles.sectionTitle}>
          FROM THE TOP OF THE SHEET
        </Txt>
        {MAIN_FIELDS.map(renderField)}
      </Card>

      <Card padded={false} style={styles.block}>
        {disclosure(
          'More from the sheet',
          'Water, protein, minerals, BMI, BMR, visceral fat, waist-hip ratio, score and target weight.',
          showMore,
          () => setShowMore((open) => !open),
        )}
        {showMore ? (
          <View style={styles.disclosureBody}>
            {MORE_FIELDS.map(renderField)}
            <TextField
              label="Machine"
              value={device}
              onChangeText={(next) => {
                setTouched(true);
                setDevice(next);
              }}
              placeholder="InBody 270"
              maxLength={60}
              autoCapitalize="words"
              style={styles.field}
            />
          </View>
        ) : null}
      </Card>

      <Card padded={false} style={styles.block}>
        {disclosure(
          'Segmental analysis',
          'Lean and fat mass for each arm, the trunk and each leg.',
          showSegments,
          () => setShowSegments((open) => !open),
        )}
        {showSegments ? (
          <View style={styles.disclosureBody}>
            <Txt variant="caption" color="faint" weight="bold" style={styles.sectionTitle}>
              LEAN MASS, KG
            </Txt>
            {SEGMENT_KEYS.map((key) => (
              <NumberField
                key={`lean-${key}`}
                label={SEGMENT_LABELS[key]}
                value={lean[key]}
                onChange={(next) => setSegment('lean', key, next)}
                suffix="kg"
                min={0}
                max={80}
                style={styles.field}
              />
            ))}

            <Txt variant="caption" color="faint" weight="bold" style={styles.sectionTitleSpaced}>
              FAT MASS, KG
            </Txt>
            {SEGMENT_KEYS.map((key) => (
              <NumberField
                key={`fat-${key}`}
                label={SEGMENT_LABELS[key]}
                value={fat[key]}
                onChange={(next) => setSegment('fat', key, next)}
                suffix="kg"
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
          label="Note"
          value={note}
          onChangeText={(next) => {
            setTouched(true);
            setNote(next);
          }}
          placeholder="Morning, before breakfast"
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
            <Txt weight="semibold">Worth a second look</Txt>
          </View>
          {problems.map((problem) => (
            <Txt key={problem} variant="label" color="muted" style={styles.warning}>
              {problem}
            </Txt>
          ))}
          <Txt variant="caption" color="faint" style={styles.warningFoot}>
            You can still save. These are checks on the numbers, not on you.
          </Txt>
        </Card>
      ) : null}

      {error ? (
        <Txt variant="label" color="danger" style={styles.error}>
          {error}
        </Txt>
      ) : null}

      <Button
        label={existing ? 'Save changes' : 'Save reading'}
        onPress={handleSave}
        disabled={derived.weightKg <= 0}
        loading={saving}
        accessibilityHint={
          derived.weightKg <= 0 ? 'Enter a weight first' : 'Adds this reading to your history'
        }
        fullWidth
        style={styles.save}
      />

      <Txt variant="caption" color="faint" align="center" style={styles.foot}>
        Everything except weight is optional. Fill in what your sheet shows.
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
