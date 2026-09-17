/**
 * Meal photo -> food estimates, through the Anthropic Messages API.
 *
 * Plain `fetch` rather than an SDK so the identical code path runs on iOS,
 * Android and react-native-web. The model is forced into a single tool call, so
 * the response is structured data and never prose that has to be scraped.
 */

import { File as FsFile } from 'expo-file-system';
import { Platform } from 'react-native';

import { makeId } from '@/domain/id';
import { caloriesFromMacros } from '@/domain/nutrition';
import { MEAL_SLOTS } from '@/domain/totals';
import { DEFAULT_SETTINGS } from '@/storage/repository';
import { getApiKey } from '@/storage/secrets';
import type {
  DetectedFood,
  Macros,
  MealEntry,
  MealSlot,
  PhotoAnalysisResult,
  Settings,
} from '@/types';

export type VisionErrorCode =
  | 'no-key'
  | 'network'
  | 'rate-limit'
  | 'bad-response'
  | 'unsupported'
  | 'too-large';

/** Every message on a VisionError is written to be shown to the user as-is. */
export class VisionError extends Error {
  readonly code: VisionErrorCode;

  constructor(code: VisionErrorCode, message: string) {
    super(message);
    this.name = 'VisionError';
    this.code = code;
    Object.setPrototypeOf(this, VisionError.prototype);
  }
}

export interface AnalyzeMealPhotoInput {
  uri: string;
  base64?: string;
  mimeType?: string;
  settings: Settings;
  signal?: AbortSignal;
}

export interface VisionErrorDescription {
  headline: string;
  suggestion: string;
}

const TOOL_NAME = 'log_meal';
const API_VERSION = '2023-06-01';
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 8192;
const MAX_ITEMS = 12;
/** Transport limit; roughly 4.5 MB of base64 text. */
const MAX_BASE64_CHARS = 4_500_000;
const MIN_GRAMS = 1;
const MAX_GRAMS = 2000;
/** How far the model's calorie figure may drift from its own macros. */
const CALORIE_TOLERANCE = 0.25;

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type MediaType = (typeof MEDIA_TYPES)[number];
const DEFAULT_MEDIA_TYPE: MediaType = 'image/jpeg';

const SYSTEM_PROMPT = [
  'You are a careful nutrition estimator looking at one photograph of a meal.',
  'Identify every distinct food and drink on the plate and report each one separately.',
  'Estimate the cooked, as-served weight of each portion in grams, using the visible scale cues:',
  'plate and bowl diameters, cutlery, glasses, cans, hands and packaging.',
  'Report calories, protein, carbohydrate and fat for the portion you estimated - per portion, never per 100 g.',
  'Give each item a confidence between 0 and 1, and use the note field to state what you assumed',
  'about cooking method, sauces, dressings, added oil and other fats you cannot see.',
  'Never refuse and never ask for a better photo. A rough number with low confidence is far more',
  'useful than no answer, so when the plate is unclear, estimate anyway and lower the confidence.',
  "The user's daily calorie and macro targets are not your concern: do not judge the meal, do not",
  'comment on how healthy it is, and do not give medical, dietary or weight-loss advice.',
  `Report everything through the ${TOOL_NAME} tool.`,
].join(' ');

const USER_PROMPT =
  'Estimate what is in this meal photo and log it. Include a short summary of the plate, and the meal of the day when the food makes it obvious.';

const LOG_MEAL_TOOL = {
  name: TOOL_NAME,
  description:
    'Record every food and drink visible in the photo, with an estimated portion weight and the nutrients for that portion.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'One entry per distinct food or drink on the plate.',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Short name of the food, for example "grilled chicken thigh".',
            },
            quantityGrams: {
              type: 'number',
              description: 'Estimated cooked, as-served weight of this portion in grams.',
            },
            calories: { type: 'number', description: 'Kilocalories in this portion.' },
            protein: { type: 'number', description: 'Grams of protein in this portion.' },
            carbs: { type: 'number', description: 'Grams of carbohydrate in this portion.' },
            fat: { type: 'number', description: 'Grams of fat in this portion.' },
            confidence: {
              type: 'number',
              description: 'How sure you are about this item, from 0 to 1.',
            },
            note: {
              type: 'string',
              description:
                'What you assumed about cooking method, sauces or hidden fats, in one short sentence.',
            },
          },
          required: ['name', 'quantityGrams', 'calories', 'protein', 'carbs', 'fat', 'confidence'],
        },
      },
      slot: {
        type: 'string',
        enum: ['breakfast', 'lunch', 'dinner', 'snack'],
        description: 'Which meal of the day this plate looks like, when the food suggests one.',
      },
      summary: {
        type: 'string',
        description: 'One sentence describing the plate as a whole.',
      },
    },
    required: ['items'],
  },
};

/* ----------------------------------------------------------------- public -- */

export async function analyzeMealPhoto(
  input: AnalyzeMealPhotoInput,
): Promise<PhotoAnalysisResult> {
  const { settings } = input;

  if (settings.photoAnalysis !== 'ai') {
    throw new VisionError(
      'unsupported',
      'Automatic photo analysis is switched off. Turn it on in Settings, or add the foods by hand.',
    );
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new VisionError(
      'no-key',
      'No API key is saved yet. Add an Anthropic API key in Settings to analyse photos.',
    );
  }

  const base64 = input.base64 ?? (await readBase64(input.uri));
  if (!base64) {
    throw new VisionError(
      'unsupported',
      'That photo could not be read from this device. Take it again, or add the foods by hand.',
    );
  }
  if (base64.length > MAX_BASE64_CHARS) {
    throw new VisionError(
      'too-large',
      'That photo is too large to send. Take a new one, or pick a smaller image.',
    );
  }

  const body = {
    model: settings.aiModel.trim() || DEFAULT_SETTINGS.aiModel,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [LOG_MEAL_TOOL],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType(input.mimeType),
              data: base64,
            },
          },
          { type: 'text', text: USER_PROMPT },
        ],
      },
    ],
  };

  const payload = await postMessage(messagesUrl(settings.aiBaseUrl), apiKey, body, input.signal);
  return resultFromToolInput(toolInputFrom(payload));
}

/** Turns detected foods into meal lines. Photo entries never claim a foodId. */
export function entriesFromAnalysis(result: PhotoAnalysisResult): MealEntry[] {
  return result.items.map(
    (item): MealEntry => ({
      id: makeId('e'),
      name: item.name,
      quantityGrams: item.quantityGrams,
      servingLabel: `About ${Math.round(item.quantityGrams)} g`,
      macros: { ...item.macros },
      source: 'photo',
      confidence: item.confidence,
    }),
  );
}

const HEADLINES: Record<VisionErrorCode, string> = {
  'no-key': 'API key needed',
  network: 'Connection problem',
  'rate-limit': 'Too many requests',
  'bad-response': 'Analysis failed',
  unsupported: 'Photo analysis unavailable',
  'too-large': 'Photo too large',
};

const FALLBACK_SUGGESTIONS: Record<VisionErrorCode, string> = {
  'no-key': 'Add an Anthropic API key in Settings, then try again.',
  network: 'Check your connection and try again, or add the foods by hand.',
  'rate-limit': 'Wait a minute and try again, or add the foods by hand.',
  'bad-response': 'Try again, or add the foods by hand.',
  unsupported: 'Add the foods by hand instead.',
  'too-large': 'Take a new photo, or pick a smaller image.',
};

/** Ready-made copy for the review screen, so it never switches on codes itself. */
export function describeVisionError(error: unknown): VisionErrorDescription {
  const code = visionErrorCode(error);
  if (!code) {
    return {
      headline: 'Analysis failed',
      suggestion: 'Something went wrong reading this photo. Try again, or add the foods by hand.',
    };
  }
  const message = error instanceof Error ? error.message.trim() : '';
  return { headline: HEADLINES[code], suggestion: message || FALLBACK_SUGGESTIONS[code] };
}

/* ------------------------------------------------------------- transport -- */

function messagesUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  // Tolerate a base URL that already carries the version segment.
  const root = trimmed.replace(/\/v1$/, '') || DEFAULT_SETTINGS.aiBaseUrl;
  return `${root}/v1/messages`;
}

function mediaType(value: string | undefined): MediaType {
  const normalized = value?.split(';')[0]?.trim().toLowerCase();
  if (normalized === 'image/jpg') return 'image/jpeg';
  return MEDIA_TYPES.find((type) => type === normalized) ?? DEFAULT_MEDIA_TYPE;
}

async function readBase64(uri: string): Promise<string> {
  if (uri.startsWith('data:')) {
    const marker = uri.indexOf(';base64,');
    if (marker === -1) {
      throw new VisionError(
        'unsupported',
        'That image is in a format the app cannot send. Pick another photo, or add the foods by hand.',
      );
    }
    return uri.slice(marker + ';base64,'.length);
  }
  if (Platform.OS === 'web') {
    // Browsers cannot read a local file path; the picker hands over base64 instead.
    throw new VisionError(
      'unsupported',
      'This photo could not be read in the browser. Choose it again so the app can attach the image data.',
    );
  }
  try {
    return await new FsFile(uri).base64();
  } catch {
    throw new VisionError(
      'unsupported',
      'That photo could not be read from this device. Take it again, or add the foods by hand.',
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
        'The analysis service sent a reply the app could not read. Try again in a moment.',
      );
    }
  } catch (error) {
    if (error instanceof VisionError) throw error;
    // A caller-driven cancellation is not a failure worth dressing up.
    if (signal?.aborted) throw error;
    if (timedOut) {
      throw new VisionError(
        'network',
        'Analysing the photo took longer than a minute. Try again on a stronger connection.',
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
      : 'The analysis service rejected the request. Try again, or add the foods by hand.',
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

/* ---------------------------------------------------------------- parsing -- */

function toolInputFrom(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new VisionError('bad-response', 'The analysis came back empty. Try again in a moment.');
  }
  if (payload.stop_reason === 'refusal') {
    throw new VisionError(
      'bad-response',
      'The model declined to estimate this photo. Add the foods by hand instead.',
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
      'The estimate was cut off before it finished. Try again, or add the foods by hand.',
    );
  }
  throw new VisionError(
    'bad-response',
    'The analysis service replied in an unexpected shape. Try again, or add the foods by hand.',
  );
}

function resultFromToolInput(input: Record<string, unknown>): PhotoAnalysisResult {
  const rawItems = input.items;
  if (!Array.isArray(rawItems)) {
    throw new VisionError(
      'bad-response',
      'The analysis came back without any food in it. Try again, or add the foods by hand.',
    );
  }

  const items: DetectedFood[] = [];
  for (const raw of rawItems) {
    const item = normalizeItem(raw);
    if (item) items.push(item);
    if (items.length === MAX_ITEMS) break;
  }

  const result: PhotoAnalysisResult = { items };
  const slot = normalizeSlot(input.slot);
  if (slot) result.slot = slot;
  const summary = typeof input.summary === 'string' ? input.summary.trim().slice(0, 240) : '';
  if (summary) result.summary = summary;
  return result;
}

/** Repairs one model-supplied item, or drops it when it cannot be trusted. */
function normalizeItem(raw: unknown): DetectedFood | null {
  if (!isRecord(raw)) return null;

  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '';
  if (!name) return null;

  const grams = toNumber(raw.quantityGrams);
  // Without a usable portion weight the macros cannot be scaled or re-checked.
  if (grams === null || grams <= 0) return null;
  const quantityGrams = Math.round(clamp(grams, MIN_GRAMS, MAX_GRAMS));

  const protein = roundTo1(nonNegative(raw.protein));
  const carbs = roundTo1(nonNegative(raw.carbs));
  const fat = roundTo1(nonNegative(raw.fat));
  const macros: Macros = {
    calories: reconcileCalories(Math.round(nonNegative(raw.calories)), { protein, carbs, fat }),
    protein,
    carbs,
    fat,
  };

  const item: DetectedFood = {
    name,
    quantityGrams,
    macros,
    confidence: normalizeConfidence(raw.confidence),
  };
  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 160) : '';
  if (note) item.note = note;
  return item;
}

/** The macro grams are the more reliable half of the answer, so they win. */
function reconcileCalories(reported: number, macros: Pick<Macros, 'protein' | 'carbs' | 'fat'>): number {
  const implied = caloriesFromMacros(macros);
  if (implied <= 0) return reported;
  if (reported <= 0) return implied;
  return Math.abs(reported - implied) / implied > CALORIE_TOLERANCE ? implied : reported;
}

function normalizeConfidence(value: unknown): number {
  const parsed = toNumber(value);
  if (parsed === null) return 0.5;
  // Models occasionally answer in percent.
  const scaled = parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
  return clamp(scaled, 0, 1);
}

function normalizeSlot(value: unknown): MealSlot | undefined {
  if (typeof value !== 'string') return undefined;
  const candidate = value.trim().toLowerCase();
  const normalized = candidate === 'snacks' ? 'snack' : candidate;
  return MEAL_SLOTS.find((slot) => slot === normalized);
}

/* ----------------------------------------------------------------- utils -- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nonNegative(value: unknown): number {
  const parsed = toNumber(value);
  return parsed === null || parsed < 0 ? 0 : parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

function visionErrorCode(error: unknown): VisionErrorCode | null {
  if (error instanceof VisionError) return error.code;
  // Survives a class identity mismatch across bundles.
  if (isRecord(error) && error.name === 'VisionError' && typeof error.code === 'string') {
    const code = error.code as VisionErrorCode;
    if (code in HEADLINES) return code;
  }
  return null;
}
