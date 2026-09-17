/**
 * InBody-style result sheets -> a draft body-composition reading.
 *
 * Two ways in, one shape out. `analyzeScanDocument` sends a photo or a PDF of a
 * sheet to the Anthropic Messages API, forced into a single tool call, exactly as
 * `vision.ts` does for meal photos. `fetchInBodyQr` downloads the public result
 * page an InBody QR code points at and reads labelled numbers out of the markup.
 *
 * Neither one produces a saved reading. Both return a draft that the manual form
 * shows for confirmation first, which is what makes a tolerant parser safe: the
 * worst case is a number the user corrects, never a number the user never saw.
 */

import { File as FsFile } from 'expo-file-system';
import { Platform } from 'react-native';

import { DEFAULT_SETTINGS } from '@/storage/repository';
import { getApiKey } from '@/storage/secrets';
import type { SegmentalValues, Settings } from '@/types';

import { describeVisionError, VisionError, type VisionErrorDescription } from './vision';

/** Everything a sheet can contribute, before the user confirms any of it. */
export interface ScanDraft {
  /** Local calendar day, 'YYYY-MM-DD'. */
  date?: string;
  device?: string;
  note?: string;
  weightKg?: number;
  skeletalMuscleKg?: number;
  bodyFatKg?: number;
  bodyFatPercent?: number;
  fatFreeMassKg?: number;
  totalBodyWaterL?: number;
  proteinKg?: number;
  mineralsKg?: number;
  bmi?: number;
  bmrKcal?: number;
  visceralFatLevel?: number;
  visceralFatAreaCm2?: number;
  waistHipRatio?: number;
  inBodyScore?: number;
  targetWeightKg?: number;
  segmentalLeanKg?: SegmentalValues;
  segmentalFatKg?: SegmentalValues;
}

export interface ScanExtraction {
  draft: ScanDraft;
  /** How many numeric fields were actually read off the sheet. */
  fieldCount: number;
  /** True when too little was read to treat the sheet as understood. */
  partial: boolean;
}

/** QR-side failures. API failures keep using VisionError, as vision.ts defines it. */
export type ScanErrorCode = 'bad-url' | 'blocked' | 'network' | 'not-found' | 'unreadable';

/** Every message on a ScanError is written to be shown to the user as-is. */
export class ScanError extends Error {
  readonly code: ScanErrorCode;

  constructor(code: ScanErrorCode, message: string) {
    super(message);
    this.name = 'ScanError';
    this.code = code;
    Object.setPrototypeOf(this, ScanError.prototype);
  }
}

export type ScanErrorDescription = VisionErrorDescription;

export type ScanDocumentKind = 'image' | 'pdf';

export interface AnalyzeScanDocumentInput {
  uri: string;
  base64?: string;
  mimeType?: string;
  kind: ScanDocumentKind;
  settings: Settings;
  signal?: AbortSignal;
}

export interface FetchInBodyQrInput {
  url: string;
  signal?: AbortSignal;
}

const TOOL_NAME = 'record_body_scan';
const API_VERSION = '2023-06-01';
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 2048;
/** Transport limit; roughly 4.5 MB of base64 text. */
const MAX_BASE64_CHARS = 4_500_000;
/** A QR page is a few hundred kilobytes at most; anything larger is not it. */
const MAX_HTML_CHARS = 600_000;
const QR_TIMEOUT_MS = 30_000;
/** Below this many numbers the sheet counts as unread, not as a thin result. */
const MIN_CONFIDENT_FIELDS = 3;

const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];
const DEFAULT_IMAGE_MEDIA_TYPE: ImageMediaType = 'image/jpeg';
const PDF_MEDIA_TYPE = 'application/pdf';

/* ------------------------------------------------------------- the fields -- */

type NumericDraftKey = Exclude<
  keyof ScanDraft,
  'date' | 'device' | 'note' | 'segmentalLeanKg' | 'segmentalFatKg'
>;

/**
 * Plausible printed ranges, wide enough for any adult and any machine. A number
 * outside its range is a mis-read label, not a reading, so it is dropped.
 */
const RANGES: Record<NumericDraftKey, readonly [number, number]> = {
  weightKg: [20, 300],
  skeletalMuscleKg: [5, 80],
  bodyFatKg: [0.5, 150],
  bodyFatPercent: [1, 75],
  fatFreeMassKg: [10, 200],
  totalBodyWaterL: [5, 120],
  proteinKg: [1, 40],
  mineralsKg: [0.5, 12],
  bmi: [8, 80],
  bmrKcal: [500, 5000],
  visceralFatLevel: [1, 30],
  visceralFatAreaCm2: [10, 400],
  waistHipRatio: [0.4, 1.6],
  inBodyScore: [10, 100],
  targetWeightKg: [20, 300],
};

const SEGMENT_KEYS = ['rightArm', 'leftArm', 'trunk', 'rightLeg', 'leftLeg'] as const;
/** One limb of lean or fat mass, in kilograms. */
const SEGMENT_RANGE: readonly [number, number] = [0.1, 60];

/**
 * Labels to hunt for on a QR page, most specific first: 'target weight' has to be
 * claimed before plain 'weight' can match the same words.
 */
const QR_LABELS: { key: NumericDraftKey; aliases: string[] }[] = [
  {
    key: 'targetWeightKg',
    aliases: ['target weight', 'الوزن المستهدف', 'الوزن المثالي', '적정체중'],
  },
  {
    key: 'skeletalMuscleKg',
    aliases: [
      'skeletal muscle mass',
      'skeletal muscle',
      'smm',
      'كتلة العضلات الهيكلية',
      'العضلات الهيكلية',
      'كتلة العضلات',
      '골격근량',
    ],
  },
  {
    key: 'bodyFatKg',
    aliases: ['body fat mass', 'fat mass', 'bfm', 'كتلة الدهون', 'كتلة دهون الجسم', '체지방량'],
  },
  {
    key: 'bodyFatPercent',
    aliases: [
      'percent body fat',
      'body fat percentage',
      'body fat percent',
      'pbf',
      'نسبة الدهون',
      'نسبة دهون الجسم',
      'النسبة المئوية للدهون',
      '체지방률',
    ],
  },
  {
    key: 'fatFreeMassKg',
    aliases: [
      'fat free mass',
      'lean body mass',
      'ffm',
      'الكتلة الخالية من الدهون',
      'الكتلة بدون دهون',
      '제지방량',
    ],
  },
  {
    key: 'totalBodyWaterL',
    aliases: [
      'total body water',
      'tbw',
      'إجمالي مياه الجسم',
      'اجمالي مياه الجسم',
      'الماء الكلي',
      'مياه الجسم',
      '체수분',
    ],
  },
  {
    key: 'visceralFatAreaCm2',
    aliases: ['visceral fat area', 'vfa', 'مساحة الدهون الحشوية', '내장지방면적'],
  },
  {
    key: 'visceralFatLevel',
    aliases: [
      'visceral fat level',
      'visceral fat',
      'vfl',
      'مستوى الدهون الحشوية',
      'الدهون الحشوية',
      '내장지방레벨',
    ],
  },
  {
    key: 'waistHipRatio',
    aliases: [
      'waist hip ratio',
      'waist to hip ratio',
      'whr',
      'نسبة الخصر إلى الورك',
      'نسبة الخصر الى الورك',
      'نسبة الخصر للورك',
      '복부지방률',
    ],
  },
  {
    key: 'inBodyScore',
    aliases: ['inbody score', 'total score', 'نقاط إنبادي', 'نقاط انبادي', 'التقييم الكلي', '인바디점수'],
  },
  {
    key: 'bmrKcal',
    aliases: [
      'basal metabolic rate',
      'bmr',
      'معدل الأيض الأساسي',
      'معدل الايض الاساسي',
      'معدل الحرق',
      '기초대사량',
    ],
  },
  { key: 'bmi', aliases: ['body mass index', 'bmi', 'مؤشر كتلة الجسم', '체질량지수'] },
  { key: 'proteinKg', aliases: ['protein', 'البروتين', 'بروتين', '단백질'] },
  { key: 'mineralsKg', aliases: ['minerals', 'mineral', 'المعادن', 'معادن', '무기질'] },
  { key: 'weightKg', aliases: ['weight', 'الوزن', 'وزن', '체중'] },
];

/* ---------------------------------------------------------------- public -- */

/**
 * Sends one sheet to the model and returns what it read. An image goes in an
 * image block and a PDF in a document block; everything else about the request
 * matches `vision.ts`, including the browser-access header the web build needs.
 */
export async function analyzeScanDocument(
  input: AnalyzeScanDocumentInput,
): Promise<ScanExtraction> {
  const { settings } = input;

  if (settings.photoAnalysis !== 'ai') {
    throw new VisionError(
      'unsupported',
      'Reading sheets automatically is switched off. Turn photo analysis on in Settings, or type the numbers in.',
    );
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new VisionError(
      'no-key',
      'No API key is saved yet. Add an Anthropic API key in Settings, or type the numbers in.',
    );
  }

  const base64 = input.base64 ?? (await readBase64(input.uri));
  if (!base64) {
    throw new VisionError(
      'unsupported',
      'That file could not be read from this device. Pick it again, or type the numbers in.',
    );
  }
  if (base64.length > MAX_BASE64_CHARS) {
    throw new VisionError(
      'too-large',
      'That file is too large to send. Use a smaller photo or a shorter PDF, or type the numbers in.',
    );
  }

  const source =
    input.kind === 'pdf'
      ? { type: 'base64', media_type: PDF_MEDIA_TYPE, data: base64 }
      : { type: 'base64', media_type: imageMediaType(input.mimeType), data: base64 };

  const body = {
    model: settings.aiModel.trim() || DEFAULT_SETTINGS.aiModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [RECORD_SCAN_TOOL],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [
      {
        role: 'user',
        content: [
          { type: input.kind === 'pdf' ? 'document' : 'image', source },
          { type: 'text', text: USER_PROMPT },
        ],
      },
    ],
  };

  const payload = await postMessage(messagesUrl(settings.aiBaseUrl), apiKey, body, input.signal);
  return extractionFrom(draftFromRecord(toolInputFrom(payload)));
}

/**
 * Downloads the public InBody result page behind a QR code and reads the numbers
 * out of it. The markup is not a documented format, so a thin result is expected
 * and reported as such through `partial` rather than dressed up as a reading.
 */
export async function fetchInBodyQr(input: FetchInBodyQrInput): Promise<ScanExtraction> {
  const url = inBodyUrl(input.url);
  const html = await getHtml(url, input.signal);
  return extractionFrom(parseInBodyHtml(html));
}

const SCAN_HEADLINES: Record<ScanErrorCode, string> = {
  'bad-url': 'That link is not an InBody page',
  blocked: 'The browser blocked the page',
  network: 'Connection problem',
  'not-found': 'Page not available',
  unreadable: 'Sheet could not be read',
};

const SCAN_FALLBACKS: Record<ScanErrorCode, string> = {
  'bad-url': 'Scan the QR code on the printout again, or type the numbers in.',
  blocked: 'Open the link in a browser tab and type the numbers in.',
  network: 'Check your connection and try again, or type the numbers in.',
  'not-found': 'The result may have expired. Type the numbers in instead.',
  unreadable: 'Type the numbers in instead.',
};

/** Ready-made copy for the import screen, so it never switches on codes itself. */
export function describeScanError(error: unknown): ScanErrorDescription {
  const code = scanErrorCode(error);
  if (code) {
    const message = error instanceof Error ? error.message.trim() : '';
    return { headline: SCAN_HEADLINES[code], suggestion: message || SCAN_FALLBACKS[code] };
  }
  if (isVisionError(error)) return describeVisionError(error);
  return {
    headline: 'Import failed',
    suggestion: 'That sheet could not be read. Try again, or type the numbers in.',
  };
}

/** Draft -> route param. Kept next to the reader so the two never drift. */
export function serializeScanDraft(draft: ScanDraft): string {
  return JSON.stringify(draft);
}

/** Route param -> draft. Anything unreadable or out of range is dropped. */
export function parseScanDraft(raw: string): ScanDraft {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? draftFromRecord(parsed) : {};
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------- the prompt -- */

const SYSTEM_PROMPT = [
  'You are reading one body-composition result sheet from a body analyser such as an InBody machine.',
  'The sheet may be written in Arabic, Korean or English, and the numbers may sit in a table, a bar chart or both.',
  'Report only numbers that are actually printed on the sheet. Leave a field out when you cannot read it,',
  'and never calculate, estimate or guess a value the sheet does not show.',
  'Use these units: mass in kilograms, total body water in litres, energy in kilocalories.',
  'Convert pounds to kilograms when the sheet is imperial.',
  'Arabic labels you will meet: الوزن weight, كتلة العضلات الهيكلية skeletal muscle mass,',
  'كتلة الدهون body fat mass, نسبة الدهون percent body fat, الكتلة الخالية من الدهون fat free mass,',
  'إجمالي مياه الجسم total body water, البروتين protein, المعادن minerals, مؤشر كتلة الجسم BMI,',
  'معدل الأيض الأساسي basal metabolic rate, مستوى الدهون الحشوية visceral fat level,',
  'نسبة الخصر إلى الورك waist-hip ratio, الوزن المستهدف target weight,',
  'and for the segmental analysis الذراع اليمنى right arm, الذراع اليسرى left arm, الجذع trunk,',
  'الساق اليمنى right leg, الساق اليسرى left leg.',
  'Do not interpret the reading, do not comment on the body it describes, and do not give medical,',
  'dietary or training advice.',
  `Report everything through the ${TOOL_NAME} tool.`,
].join(' ');

const USER_PROMPT =
  'Read this body composition sheet and record every value printed on it, including the test date and the machine name when they are shown.';

const SEGMENT_SCHEMA = {
  type: 'object',
  properties: {
    rightArm: { type: 'number', description: 'Right arm, kilograms.' },
    leftArm: { type: 'number', description: 'Left arm, kilograms.' },
    trunk: { type: 'number', description: 'Trunk, kilograms.' },
    rightLeg: { type: 'number', description: 'Right leg, kilograms.' },
    leftLeg: { type: 'number', description: 'Left leg, kilograms.' },
  },
};

const RECORD_SCAN_TOOL = {
  name: TOOL_NAME,
  description:
    'Record the values printed on one body-composition result sheet. Omit any field the sheet does not show.',
  input_schema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Test date printed on the sheet, formatted YYYY-MM-DD.',
      },
      device: {
        type: 'string',
        description: 'Machine named on the sheet, for example "InBody 270".',
      },
      weightKg: { type: 'number', description: 'Body weight in kilograms.' },
      skeletalMuscleKg: { type: 'number', description: 'Skeletal muscle mass in kilograms.' },
      bodyFatKg: { type: 'number', description: 'Body fat mass in kilograms.' },
      bodyFatPercent: { type: 'number', description: 'Percent body fat, 0 to 100.' },
      fatFreeMassKg: { type: 'number', description: 'Fat free mass in kilograms.' },
      totalBodyWaterL: { type: 'number', description: 'Total body water in litres.' },
      proteinKg: { type: 'number', description: 'Protein in kilograms.' },
      mineralsKg: { type: 'number', description: 'Minerals in kilograms.' },
      bmi: { type: 'number', description: 'Body mass index.' },
      bmrKcal: { type: 'number', description: 'Basal metabolic rate in kilocalories per day.' },
      visceralFatLevel: {
        type: 'number',
        description: 'Visceral fat level, the 1 to 20 index mid-range machines print.',
      },
      visceralFatAreaCm2: {
        type: 'number',
        description: 'Visceral fat area in square centimetres, when the sheet prints an area instead.',
      },
      waistHipRatio: { type: 'number', description: 'Waist-hip ratio.' },
      inBodyScore: { type: 'number', description: 'InBody score out of 100.' },
      targetWeightKg: { type: 'number', description: 'Target weight in kilograms.' },
      segmentalLeanKg: {
        ...SEGMENT_SCHEMA,
        description: 'Segmental lean mass per limb, in kilograms.',
      },
      segmentalFatKg: {
        ...SEGMENT_SCHEMA,
        description: 'Segmental fat mass per limb, in kilograms.',
      },
    },
  },
};

/* ------------------------------------------------------------- transport -- */

function messagesUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  // Tolerate a base URL that already carries the version segment.
  const root = trimmed.replace(/\/v1$/, '') || DEFAULT_SETTINGS.aiBaseUrl;
  return `${root}/v1/messages`;
}

function imageMediaType(value: string | undefined): ImageMediaType {
  const normalized = value?.split(';')[0]?.trim().toLowerCase();
  if (normalized === 'image/jpg') return 'image/jpeg';
  return IMAGE_MEDIA_TYPES.find((type) => type === normalized) ?? DEFAULT_IMAGE_MEDIA_TYPE;
}

async function readBase64(uri: string): Promise<string> {
  if (uri.startsWith('data:')) {
    const marker = uri.indexOf(';base64,');
    if (marker === -1) {
      throw new VisionError(
        'unsupported',
        'That file is in a format the app cannot send. Pick another one, or type the numbers in.',
      );
    }
    return uri.slice(marker + ';base64,'.length);
  }
  if (Platform.OS === 'web') {
    // Browsers cannot read a local path; the pickers hand over base64 instead.
    throw new VisionError(
      'unsupported',
      'This file could not be read in the browser. Choose it again so the app can attach the data.',
    );
  }
  try {
    return await new FsFile(uri).base64();
  } catch {
    throw new VisionError(
      'unsupported',
      'That file could not be read from this device. Pick it again, or type the numbers in.',
    );
  }
}

async function postMessage(
  url: string,
  apiKey: string,
  body: unknown,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', forwardAbort);
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        // Required for the browser build, ignored everywhere else.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) throw statusError(response.status, raw);

    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new VisionError(
        'bad-response',
        'The service sent a reply the app could not read. Try again in a moment.',
      );
    }
  } catch (error) {
    if (error instanceof VisionError) throw error;
    // A caller-driven cancellation is not a failure worth dressing up.
    if (signal?.aborted) throw error;
    if (timedOut) {
      throw new VisionError(
        'network',
        'Reading the sheet took longer than a minute. Try again on a stronger connection.',
      );
    }
    throw new VisionError(
      'network',
      'Could not reach the analysis service. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

function statusError(status: number, raw: string): VisionError {
  if (status === 429) {
    return new VisionError(
      'rate-limit',
      'The analysis service is busy with this key right now. Wait a minute and try again.',
    );
  }
  if (status >= 500) {
    return new VisionError(
      'network',
      'The analysis service is having trouble right now. Try again in a moment.',
    );
  }
  const detail = apiErrorDetail(raw);
  if (status === 401 || status === 403) {
    return new VisionError(
      'bad-response',
      `The saved API key was rejected${detail ? ` (${detail})` : ''}. Check it in Settings.`,
    );
  }
  return new VisionError(
    'bad-response',
    detail
      ? `The analysis service rejected the request: ${detail}`
      : 'The analysis service rejected the request. Try again, or type the numbers in.',
  );
}

/** Pulls the API's own error sentence out of the body, when there is one. */
function apiErrorDetail(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return '';
    const error = parsed.error;
    if (!isRecord(error) || typeof error.message !== 'string') return '';
    return error.message.trim().slice(0, 160);
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------ tool output -- */

function toolInputFrom(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new VisionError('bad-response', 'The reply came back empty. Try again in a moment.');
  }
  if (payload.stop_reason === 'refusal') {
    throw new VisionError(
      'bad-response',
      'The model declined to read this sheet. Type the numbers in instead.',
    );
  }
  const content = payload.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (
        isRecord(block) &&
        block.type === 'tool_use' &&
        block.name === TOOL_NAME &&
        isRecord(block.input)
      ) {
        return block.input;
      }
    }
  }
  if (payload.stop_reason === 'max_tokens') {
    throw new VisionError(
      'bad-response',
      'The reading was cut off before it finished. Try again, or type the numbers in.',
    );
  }
  throw new VisionError(
    'bad-response',
    'The analysis service replied in an unexpected shape. Try again, or type the numbers in.',
  );
}

/** Builds a draft out of one record of loose values, dropping what cannot hold. */
function draftFromRecord(raw: Record<string, unknown>): ScanDraft {
  const draft: ScanDraft = {};

  for (const key of Object.keys(RANGES) as NumericDraftKey[]) {
    const value = inRange(toNumber(raw[key]), RANGES[key]);
    if (value !== null) draft[key] = value;
  }

  const date = normalizeDate(raw.date);
  if (date) draft.date = date;

  const device = typeof raw.device === 'string' ? raw.device.trim().slice(0, 60) : '';
  if (device) draft.device = device;

  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 200) : '';
  if (note) draft.note = note;

  const lean = segmentsFrom(raw.segmentalLeanKg);
  if (lean) draft.segmentalLeanKg = lean;
  const fat = segmentsFrom(raw.segmentalFatKg);
  if (fat) draft.segmentalFatKg = fat;

  return draft;
}

function segmentsFrom(raw: unknown): SegmentalValues | null {
  if (!isRecord(raw)) return null;
  const values: SegmentalValues = {};
  let found = 0;
  for (const key of SEGMENT_KEYS) {
    const value = inRange(toNumber(raw[key]), SEGMENT_RANGE);
    if (value !== null) {
      values[key] = value;
      found += 1;
    }
  }
  return found > 0 ? values : null;
}

function extractionFrom(draft: ScanDraft): ScanExtraction {
  const fieldCount = countFields(draft);
  return { draft, fieldCount, partial: fieldCount < MIN_CONFIDENT_FIELDS };
}

/** Numbers only: a date and a machine name say nothing about how well it read. */
function countFields(draft: ScanDraft): number {
  let count = 0;
  for (const key of Object.keys(RANGES) as NumericDraftKey[]) {
    if (draft[key] !== undefined) count += 1;
  }
  for (const segments of [draft.segmentalLeanKg, draft.segmentalFatKg]) {
    if (!segments) continue;
    for (const key of SEGMENT_KEYS) {
      if (segments[key] !== undefined) count += 1;
    }
  }
  return count;
}

/* ------------------------------------------------------------- QR reading -- */

const INBODY_HOSTS = ['inbody.com', 'lookinbody.com'];

/**
 * Only InBody's own result hosts are fetched; a scanned code is untrusted input.
 * Parsed by hand rather than with URL, whose React Native build accepts strings a
 * browser would reject.
 */
function inBodyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ScanError('bad-url', 'Paste the link from the QR code first.');
  }

  const match = /^(https?):\/\/([^/?#\s]+)/i.exec(trimmed);
  if (!match) {
    throw new ScanError(
      'bad-url',
      'That is not a web link. Scan the QR code on the printout, or type the numbers in.',
    );
  }

  const authority = match[2] ?? '';
  const host = (authority.split('@').pop() ?? '').split(':')[0]?.toLowerCase() ?? '';
  const allowed = INBODY_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (!allowed) {
    throw new ScanError(
      'bad-url',
      `${host || 'That address'} is not an InBody result page, so the app will not open it. Type the numbers in instead.`,
    );
  }

  return trimmed;
}

async function getHtml(url: string, signal: AbortSignal | undefined): Promise<string> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, QR_TIMEOUT_MS);

  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', forwardAbort);
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
    });

    if (response.status === 404 || response.status === 410) {
      throw new ScanError(
        'not-found',
        'That result page is gone. InBody links expire, so type the numbers in instead.',
      );
    }
    if (!response.ok) {
      throw new ScanError(
        'network',
        `The result page answered with an error (${response.status}). Try again, or type the numbers in.`,
      );
    }

    const text = await response.text();
    return text.slice(0, MAX_HTML_CHARS);
  } catch (error) {
    if (error instanceof ScanError) throw error;
    if (signal?.aborted) throw error;
    if (timedOut) {
      throw new ScanError(
        'network',
        'The result page took too long to answer. Try again, or type the numbers in.',
      );
    }
    // In a browser a cross-site page that sends no CORS header fails exactly here,
    // as a TypeError with no status, and no request can fix it from this side.
    if (Platform.OS === 'web') {
      throw new ScanError(
        'blocked',
        'This browser will not let the app read a page from inbody.com, so the sheet cannot be fetched here. Open the link yourself and type the numbers in.',
      );
    }
    throw new ScanError(
      'network',
      'Could not reach the result page. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (match) => ENTITIES[match] ?? match)
    .replace(/&#(\d{1,6});/g, (_match, code: string) => {
      const point = Number(code);
      return Number.isFinite(point) && point > 0 && point < 0x10ffff
        ? String.fromCodePoint(point)
        : ' ';
    });
}

/** Arabic-Indic and Persian digits, so an Arabic sheet reads like any other. */
function westernDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  })
    .replace(/٫/g, '.')
    .replace(/٬/g, '');
}

function visibleText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  return westernDigits(decodeEntities(stripped));
}

/**
 * Folds away the things markup varies on - case, spacing, underscores, hyphens -
 * so one alias matches "Body Fat Mass", "body-fat-mass" and "bodyFatMass" alike.
 * A number that ends a cell keeps a marker behind it, because closing the gap
 * between two cells would otherwise glue their two numbers into one.
 */
function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/(\d)[\s\u00a0]+/g, '$1;')
    .replace(/[\s_\-\u200f\u200e]+/g, '');
}

interface Span {
  start: number;
  end: number;
}

function overlaps(spans: Span[], start: number, end: number): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}

/**
 * Finds `alias` in `haystack` and takes the first number after it, as long as the
 * gap is short enough to still be the same cell of the same table.
 */
function findLabelled(
  haystack: string,
  alias: string,
  range: readonly [number, number],
  claimed: Span[],
  maxGap: number,
  separatorRequired: boolean,
): { value: number; span: Span } | null {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(alias, from);
    if (at === -1) return null;
    const labelEnd = at + alias.length;
    from = labelEnd;
    if (overlaps(claimed, at, labelEnd)) continue;

    const window = haystack.slice(labelEnd, labelEnd + maxGap);
    const match = /\d+(?:[.,]\d+)?/.exec(window);
    if (!match) continue;

    const gap = window.slice(0, match.index);
    if (separatorRequired && !/[:=>"']/.test(gap)) continue;
    // Anything wordy between a label and its number means they are unrelated.
    if (/[a-z؀-ۿ]{4,}/.test(gap)) continue;

    const value = inRange(Number(match[0].replace(',', '.')), range);
    if (value === null) continue;

    return {
      value,
      span: { start: at, end: labelEnd + match.index + match[0].length },
    };
  }
}

/**
 * Reads what it can out of an InBody result page. The markup is not a published
 * format, so this is deliberately forgiving: two passes, ranges on every number,
 * and silence rather than a guess.
 */
function parseInBodyHtml(html: string): ScanDraft {
  const draft: ScanDraft = {};

  try {
    const text = visibleText(html);
    const passes: { haystack: string; claimed: Span[]; maxGap: number; separator: boolean }[] = [
      // The rendered page, where a label and its value sit side by side.
      { haystack: fold(text), claimed: [], maxGap: 24, separator: false },
      // Whatever is left in scripts and attributes, where a separator is the rule.
      { haystack: fold(westernDigits(html)), claimed: [], maxGap: 12, separator: true },
    ];

    for (const { key, aliases } of QR_LABELS) {
      for (const pass of passes) {
        if (draft[key] !== undefined) break;
        for (const alias of aliases) {
          const hit = findLabelled(
            pass.haystack,
            fold(alias),
            RANGES[key],
            pass.claimed,
            pass.maxGap,
            pass.separator,
          );
          if (hit) {
            draft[key] = hit.value;
            pass.claimed.push(hit.span);
            break;
          }
        }
      }
    }

    const date = firstDateIn(text);
    if (date) draft.date = date;

    const device = /inbody\s*(\d{3})/i.exec(text);
    if (device) draft.device = `InBody ${device[1]}`;
  } catch {
    // A parser that throws on odd markup would lose the fields it already had.
    return draft;
  }

  return draft;
}

/** First printed test date, written 2026-05-30, 2026.05.30 or 2026/05/30. */
function firstDateIn(text: string): string | undefined {
  const match = /(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(text);
  if (!match) return undefined;
  return normalizeDate(`${match[1]}-${match[2]}-${match[3]}`);
}

/* ----------------------------------------------------------------- utils -- */

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(value.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100) return undefined;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function inRange(value: number | null, [min, max]: readonly [number, number]): number | null {
  if (value === null || value < min || value > max) return null;
  return Math.round(value * 100) / 100;
}

function scanErrorCode(error: unknown): ScanErrorCode | null {
  if (error instanceof ScanError) return error.code;
  // Survives a class identity mismatch across bundles.
  if (isRecord(error) && error.name === 'ScanError' && typeof error.code === 'string') {
    const code = error.code as ScanErrorCode;
    if (code in SCAN_HEADLINES) return code;
  }
  return null;
}

function isVisionError(error: unknown): boolean {
  if (error instanceof VisionError) return true;
  return isRecord(error) && error.name === 'VisionError' && typeof error.code === 'string';
}
