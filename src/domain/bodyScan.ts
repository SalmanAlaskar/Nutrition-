/**
 * Body-composition readings: which metrics exist, how they change between two
 * scans, what can be derived from a partly filled sheet and what makes an
 * imported sheet implausible.
 *
 * Mass is in kilograms, water in litres, energy in kilocalories. Everything
 * here is arithmetic on the numbers the machine printed; none of it is a
 * medical assessment.
 */

import type { BodyScan, SegmentalValues } from '@/types';

import { daysBetween } from './date';
import { bodyMassIndex } from './nutrition';

/** Every numeric field of a scan, so metric lists stay in step with the type. */
export type ScanMetricKey = {
  [K in keyof BodyScan]-?: BodyScan[K] extends number | undefined ? K : never;
}[keyof BodyScan];

/**
 * Every label here is a translation key, namespaced for `t()`. The sheet is
 * printed in Arabic or English depending on the machine, so nothing in this file
 * carries finished copy: the screen resolves the key in the reader's language.
 */
export type ScanMetricLabelKey =
  | 'body:fieldWeight'
  | 'body:fieldMuscle'
  | 'body:fieldFatMass'
  | 'body:fieldFatPercent'
  | 'body:fieldLeanMass'
  | 'body:fieldWater'
  | 'body:fieldProtein'
  | 'body:fieldMinerals'
  | 'body:fieldBmi'
  | 'body:fieldBmr'
  | 'body:fieldVisceralLevel'
  | 'body:fieldVisceralArea'
  | 'body:fieldWaistHip'
  | 'body:fieldScore'
  | 'body:fieldTargetWeight';

/** Unit keys, absent for a bare index such as BMI or the InBody score. */
export type ScanUnitKey = 'units:kg' | 'units:percent' | 'units:litre' | 'units:kcal' | 'body:unitCm2';

export interface ScanMetricDef {
  key: ScanMetricKey;
  labelKey: ScanMetricLabelKey;
  unitKey?: ScanUnitKey;
  /** Decimal places to show. */
  decimals: number;
  /**
   * Direction of a good change: true when more is better, false when less is,
   * null when it depends on the goal (weight, water, BMI, BMR).
   */
  higherIsBetter: boolean | null;
}

/** The measured metrics, in the order a summary should list them. */
export const SCAN_METRICS: ScanMetricDef[] = [
  { key: 'weightKg', labelKey: 'body:fieldWeight', unitKey: 'units:kg', decimals: 1, higherIsBetter: null },
  { key: 'skeletalMuscleKg', labelKey: 'body:fieldMuscle', unitKey: 'units:kg', decimals: 1, higherIsBetter: true },
  { key: 'bodyFatKg', labelKey: 'body:fieldFatMass', unitKey: 'units:kg', decimals: 1, higherIsBetter: false },
  { key: 'bodyFatPercent', labelKey: 'body:fieldFatPercent', unitKey: 'units:percent', decimals: 1, higherIsBetter: false },
  { key: 'fatFreeMassKg', labelKey: 'body:fieldLeanMass', unitKey: 'units:kg', decimals: 1, higherIsBetter: true },
  { key: 'totalBodyWaterL', labelKey: 'body:fieldWater', unitKey: 'units:litre', decimals: 1, higherIsBetter: null },
  { key: 'proteinKg', labelKey: 'body:fieldProtein', unitKey: 'units:kg', decimals: 1, higherIsBetter: true },
  { key: 'mineralsKg', labelKey: 'body:fieldMinerals', unitKey: 'units:kg', decimals: 2, higherIsBetter: true },
  { key: 'bmi', labelKey: 'body:fieldBmi', decimals: 1, higherIsBetter: null },
  { key: 'bmrKcal', labelKey: 'body:fieldBmr', unitKey: 'units:kcal', decimals: 0, higherIsBetter: true },
  { key: 'visceralFatLevel', labelKey: 'body:fieldVisceralLevel', decimals: 0, higherIsBetter: false },
  { key: 'visceralFatAreaCm2', labelKey: 'body:fieldVisceralArea', unitKey: 'body:unitCm2', decimals: 1, higherIsBetter: false },
  { key: 'waistHipRatio', labelKey: 'body:fieldWaistHip', decimals: 2, higherIsBetter: false },
  { key: 'inBodyScore', labelKey: 'body:fieldScore', decimals: 0, higherIsBetter: true },
];

/** Signed differences between two scans. A metric is absent unless both have it. */
export interface ScanChange {
  fromDate: string;
  toDate: string;
  /** Calendar days from the earlier scan to the later one. */
  days: number;
  weightKg: number;
  skeletalMuscleKg?: number;
  bodyFatKg?: number;
  bodyFatPercent?: number;
  fatFreeMassKg?: number;
  totalBodyWaterL?: number;
  proteinKg?: number;
  mineralsKg?: number;
  bmi?: number;
  visceralFatLevel?: number;
  waistHipRatio?: number;
  inBodyScore?: number;
}

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const delta = (from?: number, to?: number): number | undefined =>
  from === undefined || to === undefined ? undefined : round(to - from, 2);

/** The most recent reading, by calendar day then by time taken. */
export function latestScan(scans: BodyScan[]): BodyScan | null {
  let latest: BodyScan | null = null;
  for (const scan of scans) {
    if (
      latest === null ||
      scan.date > latest.date ||
      (scan.date === latest.date && scan.takenAt > latest.takenAt)
    ) {
      latest = scan;
    }
  }
  return latest;
}

/** Signed change from an earlier scan to a later one. */
export function scanChange(from: BodyScan, to: BodyScan): ScanChange {
  return {
    fromDate: from.date,
    toDate: to.date,
    days: daysBetween(from.date, to.date),
    weightKg: round(to.weightKg - from.weightKg, 2),
    skeletalMuscleKg: delta(from.skeletalMuscleKg, to.skeletalMuscleKg),
    bodyFatKg: delta(from.bodyFatKg, to.bodyFatKg),
    bodyFatPercent: delta(from.bodyFatPercent, to.bodyFatPercent),
    fatFreeMassKg: delta(from.fatFreeMassKg, to.fatFreeMassKg),
    totalBodyWaterL: delta(from.totalBodyWaterL, to.totalBodyWaterL),
    proteinKg: delta(from.proteinKg, to.proteinKg),
    mineralsKg: delta(from.mineralsKg, to.mineralsKg),
    bmi: delta(from.bmi, to.bmi),
    visceralFatLevel: delta(from.visceralFatLevel, to.visceralFatLevel),
    waistHipRatio: delta(from.waistHipRatio, to.waistHipRatio),
    inBodyScore: delta(from.inBodyScore, to.inBodyScore),
  };
}

/**
 * Fills in what the sheet left out, using the identities that always hold.
 * Only absent fields are written, so anything the machine printed survives.
 * `heightCm` comes from the profile and is the only outside input; without it
 * BMI is left alone.
 */
export function deriveMissing(scan: BodyScan, heightCm?: number): BodyScan {
  const next: BodyScan = { ...scan };

  if (next.weightKg > 0) {
    if (next.bodyFatKg === undefined && next.bodyFatPercent !== undefined) {
      next.bodyFatKg = round((next.weightKg * next.bodyFatPercent) / 100, 1);
    }
    if (next.bodyFatKg === undefined && next.fatFreeMassKg !== undefined) {
      next.bodyFatKg = round(next.weightKg - next.fatFreeMassKg, 1);
    }
    if (next.bodyFatPercent === undefined && next.bodyFatKg !== undefined) {
      next.bodyFatPercent = round((next.bodyFatKg / next.weightKg) * 100, 1);
    }
    if (next.fatFreeMassKg === undefined && next.bodyFatKg !== undefined) {
      next.fatFreeMassKg = round(next.weightKg - next.bodyFatKg, 1);
    }
  }

  if (next.bmi === undefined && heightCm !== undefined && heightCm > 0) {
    next.bmi = bodyMassIndex(heightCm, next.weightKg);
  }

  return next;
}

/* ------------------------------------------------------------ validation -- */

const MIN_BODY_FAT_PERCENT = 3;
const MAX_BODY_FAT_PERCENT = 70;
/** How far body fat mass may sit from weight x percent before it is suspect. */
const FAT_MASS_TOLERANCE = 0.05;

/** Segment labels, as translation keys. */
export type ScanSegmentLabelKey =
  | 'body:segmentRightArm'
  | 'body:segmentLeftArm'
  | 'body:segmentTrunk'
  | 'body:segmentRightLeg'
  | 'body:segmentLeftLeg';

export const SEGMENT_LABEL_KEYS: Record<keyof SegmentalValues, ScanSegmentLabelKey> = {
  rightArm: 'body:segmentRightArm',
  leftArm: 'body:segmentLeftArm',
  trunk: 'body:segmentTrunk',
  rightLeg: 'body:segmentRightLeg',
  leftLeg: 'body:segmentLeftLeg',
};

/** Anything this file can name inside a problem sentence. */
export type ScanLabelKey = ScanMetricLabelKey | ScanSegmentLabelKey | 'body:leanMass' | 'body:fatMass';

export type ScanProblemKey =
  | 'body:problemWeightRequired'
  | 'body:problemNotNumber'
  | 'body:problemNegative'
  | 'body:problemSegmentNegative'
  | 'body:problemFatRange'
  | 'body:problemMuscleOverLean'
  | 'body:problemLeanOverWeight'
  | 'body:problemFatMismatch';

/**
 * One thing worth checking, as a key and its parts rather than a sentence, so
 * the screen can say it in the reader's language.
 */
export interface ScanProblem {
  key: ScanProblemKey;
  /** Interpolations whose value is itself a translation key. */
  labels?: Record<string, ScanLabelKey>;
  /** Interpolations that are numbers, for the screen to format. */
  values?: Record<string, number>;
}

function segmentProblems(
  values: SegmentalValues | undefined,
  kind: 'body:leanMass' | 'body:fatMass',
): ScanProblem[] {
  if (!values) return [];
  const problems: ScanProblem[] = [];
  for (const key of Object.keys(SEGMENT_LABEL_KEYS) as (keyof SegmentalValues)[]) {
    const value = values[key];
    if (value !== undefined && value < 0) {
      problems.push({
        key: 'body:problemSegmentNegative',
        labels: { kind, part: SEGMENT_LABEL_KEYS[key] },
      });
    }
  }
  return problems;
}

/**
 * Everything worth a second look on a reading. An empty list means the numbers
 * are internally consistent, not that they are correct.
 */
export function validateScan(scan: BodyScan): ScanProblem[] {
  const problems: ScanProblem[] = [];

  if (!Number.isFinite(scan.weightKg) || scan.weightKg <= 0) {
    problems.push({ key: 'body:problemWeightRequired' });
  }

  for (const metric of SCAN_METRICS) {
    const value = scan[metric.key];
    if (value === undefined) continue;
    if (!Number.isFinite(value)) {
      problems.push({ key: 'body:problemNotNumber', labels: { label: metric.labelKey } });
    } else if (value < 0) {
      problems.push({ key: 'body:problemNegative', labels: { label: metric.labelKey } });
    }
  }

  if (scan.targetWeightKg !== undefined && scan.targetWeightKg < 0) {
    problems.push({ key: 'body:problemNegative', labels: { label: 'body:fieldTargetWeight' } });
  }

  problems.push(...segmentProblems(scan.segmentalLeanKg, 'body:leanMass'));
  problems.push(...segmentProblems(scan.segmentalFatKg, 'body:fatMass'));

  const { bodyFatPercent, bodyFatKg, fatFreeMassKg, skeletalMuscleKg, weightKg } = scan;

  if (
    bodyFatPercent !== undefined &&
    Number.isFinite(bodyFatPercent) &&
    (bodyFatPercent < MIN_BODY_FAT_PERCENT || bodyFatPercent > MAX_BODY_FAT_PERCENT)
  ) {
    problems.push({
      key: 'body:problemFatRange',
      values: {
        value: round(bodyFatPercent, 1),
        min: MIN_BODY_FAT_PERCENT,
        max: MAX_BODY_FAT_PERCENT,
      },
    });
  }

  if (
    skeletalMuscleKg !== undefined &&
    fatFreeMassKg !== undefined &&
    skeletalMuscleKg > fatFreeMassKg
  ) {
    problems.push({
      key: 'body:problemMuscleOverLean',
      values: { muscle: round(skeletalMuscleKg, 1), lean: round(fatFreeMassKg, 1) },
    });
  }

  if (fatFreeMassKg !== undefined && weightKg > 0 && fatFreeMassKg > weightKg) {
    problems.push({
      key: 'body:problemLeanOverWeight',
      values: { lean: round(fatFreeMassKg, 1), weight: round(weightKg, 1) },
    });
  }

  if (bodyFatKg !== undefined && bodyFatPercent !== undefined && weightKg > 0) {
    const expected = (weightKg * bodyFatPercent) / 100;
    if (expected > 0 && Math.abs(bodyFatKg - expected) / expected > FAT_MASS_TOLERANCE) {
      problems.push({
        key: 'body:problemFatMismatch',
        values: {
          fat: round(bodyFatKg, 1),
          percent: round(bodyFatPercent, 1),
          weight: round(weightKg, 1),
          expected: round(expected, 1),
        },
      });
    }
  }

  return problems;
}

/**
 * Left-to-right difference in segmental lean mass, in kilograms. Positive means
 * the right side reads heavier. Null when either pair is incomplete.
 */
export function segmentalBalance(
  scan: BodyScan,
): { armDiff: number; legDiff: number } | null {
  const lean = scan.segmentalLeanKg;
  if (!lean) return null;
  const { rightArm, leftArm, rightLeg, leftLeg } = lean;
  if (
    rightArm === undefined ||
    leftArm === undefined ||
    rightLeg === undefined ||
    leftLeg === undefined
  ) {
    return null;
  }
  return {
    armDiff: round(rightArm - leftArm, 2),
    legDiff: round(rightLeg - leftLeg, 2),
  };
}
