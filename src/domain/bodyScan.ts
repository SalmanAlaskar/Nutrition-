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

export interface ScanMetricDef {
  key: ScanMetricKey;
  label: string;
  /** Display unit, empty for a bare index such as BMI or the InBody score. */
  unit: string;
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
  { key: 'weightKg', label: 'Weight', unit: 'kg', decimals: 1, higherIsBetter: null },
  { key: 'skeletalMuscleKg', label: 'Skeletal muscle', unit: 'kg', decimals: 1, higherIsBetter: true },
  { key: 'bodyFatKg', label: 'Body fat mass', unit: 'kg', decimals: 1, higherIsBetter: false },
  { key: 'bodyFatPercent', label: 'Body fat', unit: '%', decimals: 1, higherIsBetter: false },
  { key: 'fatFreeMassKg', label: 'Fat free mass', unit: 'kg', decimals: 1, higherIsBetter: true },
  { key: 'totalBodyWaterL', label: 'Total body water', unit: 'L', decimals: 1, higherIsBetter: null },
  { key: 'proteinKg', label: 'Protein', unit: 'kg', decimals: 1, higherIsBetter: true },
  { key: 'mineralsKg', label: 'Minerals', unit: 'kg', decimals: 2, higherIsBetter: true },
  { key: 'bmi', label: 'BMI', unit: '', decimals: 1, higherIsBetter: null },
  { key: 'bmrKcal', label: 'BMR', unit: 'kcal', decimals: 0, higherIsBetter: true },
  { key: 'visceralFatLevel', label: 'Visceral fat level', unit: '', decimals: 0, higherIsBetter: false },
  { key: 'visceralFatAreaCm2', label: 'Visceral fat area', unit: 'cm²', decimals: 1, higherIsBetter: false },
  { key: 'waistHipRatio', label: 'Waist-hip ratio', unit: '', decimals: 2, higherIsBetter: false },
  { key: 'inBodyScore', label: 'InBody score', unit: '', decimals: 0, higherIsBetter: true },
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

const SEGMENT_LABELS: Record<keyof SegmentalValues, string> = {
  rightArm: 'right arm',
  leftArm: 'left arm',
  trunk: 'trunk',
  rightLeg: 'right leg',
  leftLeg: 'left leg',
};

function segmentProblems(values: SegmentalValues | undefined, what: string): string[] {
  if (!values) return [];
  const problems: string[] = [];
  for (const key of Object.keys(SEGMENT_LABELS) as (keyof SegmentalValues)[]) {
    const value = values[key];
    if (value !== undefined && value < 0) {
      problems.push(`Segmental ${what} for the ${SEGMENT_LABELS[key]} cannot be negative.`);
    }
  }
  return problems;
}

/**
 * Everything wrong with a reading, phrased for the person fixing it. An empty
 * list means the numbers are internally consistent, not that they are correct.
 */
export function validateScan(scan: BodyScan): string[] {
  const problems: string[] = [];

  if (!Number.isFinite(scan.weightKg) || scan.weightKg <= 0) {
    problems.push('Weight is required and must be greater than zero.');
  }

  for (const metric of SCAN_METRICS) {
    const value = scan[metric.key];
    if (value === undefined) continue;
    if (!Number.isFinite(value)) {
      problems.push(`${metric.label} is not a number.`);
    } else if (value < 0) {
      problems.push(`${metric.label} cannot be negative.`);
    }
  }

  if (scan.targetWeightKg !== undefined && scan.targetWeightKg < 0) {
    problems.push('Target weight cannot be negative.');
  }

  problems.push(...segmentProblems(scan.segmentalLeanKg, 'lean mass'));
  problems.push(...segmentProblems(scan.segmentalFatKg, 'fat mass'));

  const { bodyFatPercent, bodyFatKg, fatFreeMassKg, skeletalMuscleKg, weightKg } = scan;

  if (
    bodyFatPercent !== undefined &&
    Number.isFinite(bodyFatPercent) &&
    (bodyFatPercent < MIN_BODY_FAT_PERCENT || bodyFatPercent > MAX_BODY_FAT_PERCENT)
  ) {
    problems.push(
      `Percent body fat of ${round(bodyFatPercent, 1)}% is outside the readable ` +
        `${MIN_BODY_FAT_PERCENT}-${MAX_BODY_FAT_PERCENT}% range.`,
    );
  }

  if (
    skeletalMuscleKg !== undefined &&
    fatFreeMassKg !== undefined &&
    skeletalMuscleKg > fatFreeMassKg
  ) {
    problems.push(
      `Skeletal muscle (${round(skeletalMuscleKg, 1)} kg) cannot be more than ` +
        `fat free mass (${round(fatFreeMassKg, 1)} kg).`,
    );
  }

  if (fatFreeMassKg !== undefined && weightKg > 0 && fatFreeMassKg > weightKg) {
    problems.push(
      `Fat free mass (${round(fatFreeMassKg, 1)} kg) cannot be more than ` +
        `weight (${round(weightKg, 1)} kg).`,
    );
  }

  if (bodyFatKg !== undefined && bodyFatPercent !== undefined && weightKg > 0) {
    const expected = (weightKg * bodyFatPercent) / 100;
    if (expected > 0 && Math.abs(bodyFatKg - expected) / expected > FAT_MASS_TOLERANCE) {
      problems.push(
        `Body fat mass of ${round(bodyFatKg, 1)} kg does not match ` +
          `${round(bodyFatPercent, 1)}% of ${round(weightKg, 1)} kg ` +
          `(${round(expected, 1)} kg).`,
      );
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
