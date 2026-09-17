/// <reference types="jest" />
import { DEFAULT_SETTINGS } from '@/storage/repository';
import { getApiKey } from '@/storage/secrets';
import type { PhotoAnalysisResult, Settings } from '@/types';

import {
  VisionError,
  type VisionErrorCode,
  analyzeMealPhoto,
  describeVisionError,
  entriesFromAnalysis,
} from './vision';

// The real module talks to the device keychain; nothing here may reach it.
jest.mock('@/storage/secrets', () => ({
  getApiKey: jest.fn(),
  setApiKey: jest.fn(),
  clearApiKey: jest.fn(),
  hasApiKey: jest.fn(),
}));

const getApiKeyMock = getApiKey as jest.MockedFunction<typeof getApiKey>;

const API_KEY = 'sk-ant-test-key';
const BASE64 = 'aGVsbG8td29ybGQ=';

const aiSettings = (overrides: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  photoAnalysis: 'ai',
  ...overrides,
});

interface RawItem {
  [key: string]: unknown;
}

const item = (overrides: RawItem = {}): RawItem => ({
  name: 'Grilled chicken',
  quantityGrams: 150,
  calories: 165,
  protein: 10,
  carbs: 20,
  fat: 5,
  confidence: 0.8,
  ...overrides,
});

const toolUseBody = (input: unknown, extra: Record<string, unknown> = {}) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5',
  stop_reason: 'tool_use',
  content: [
    { type: 'text', text: 'Here is the plate.' },
    { type: 'tool_use', id: 'toolu_test', name: 'log_meal', input },
  ],
  ...extra,
});

const fetchMock = jest.fn();
const originalFetch = globalThis.fetch;

/** Queue one HTTP reply for the next `fetch`. */
function reply(status: number, body: unknown): void {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  });
}

function replyWithItems(items: RawItem[], extra: Record<string, unknown> = {}): void {
  reply(200, toolUseBody({ items, ...extra }));
}

const analyze = (overrides: Partial<Parameters<typeof analyzeMealPhoto>[0]> = {}) =>
  analyzeMealPhoto({
    uri: 'file:///tmp/meal.jpg',
    base64: BASE64,
    mimeType: 'image/jpeg',
    settings: aiSettings(),
    ...overrides,
  });

/** Runs `run`, asserts it rejected with a VisionError, and hands the error back. */
async function rejection(run: () => Promise<unknown>): Promise<VisionError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof VisionError) return error;
    throw error;
  }
  throw new Error('expected the call to reject with a VisionError');
}

const requestBody = (): Record<string, unknown> =>
  JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<string, unknown>;

beforeAll(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  getApiKeyMock.mockResolvedValue(API_KEY);
});

describe('the outgoing request', () => {
  it('posts the documented Anthropic headers', async () => {
    replyWithItems([item()]);
    await analyze();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    // The key travels in a header, never in the URL.
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(API_KEY);
  });

  it('forces a single log_meal tool call', async () => {
    replyWithItems([item()]);
    await analyze();

    const body = requestBody();
    expect(body.max_tokens).toBe(8192);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'log_meal' });
    expect((body.tools as { name: string }[]).map((tool) => tool.name)).toEqual(['log_meal']);
    expect(typeof body.system).toBe('string');
  });

  it('sends the image as a base64 block followed by the prompt', async () => {
    replyWithItems([item()]);
    await analyze();

    const messages = requestBody().messages as {
      role: string;
      content: { type: string; source?: { type: string; media_type: string; data: string } }[];
    }[];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content[0].source).toEqual({
      type: 'base64',
      media_type: 'image/jpeg',
      data: BASE64,
    });
    expect(messages[0].content[1].type).toBe('text');
  });

  it.each([
    ['image/png', 'image/png'],
    ['image/webp', 'image/webp'],
    ['image/gif', 'image/gif'],
    ['image/jpg', 'image/jpeg'],
    ['IMAGE/PNG', 'image/png'],
    ['image/png; charset=binary', 'image/png'],
    ['image/heic', 'image/jpeg'],
    [undefined, 'image/jpeg'],
  ])('maps the mime type %p to %s', async (mimeType, expected) => {
    replyWithItems([item()]);
    await analyze({ mimeType });

    const messages = requestBody().messages as {
      content: { source?: { media_type: string } }[];
    }[];
    expect(messages[0].content[0].source?.media_type).toBe(expected);
  });

  it.each([
    ['https://api.anthropic.com', 'https://api.anthropic.com/v1/messages'],
    ['https://api.anthropic.com/', 'https://api.anthropic.com/v1/messages'],
    ['https://api.anthropic.com///', 'https://api.anthropic.com/v1/messages'],
    ['https://proxy.example.com/v1', 'https://proxy.example.com/v1/messages'],
    ['https://proxy.example.com/v1/', 'https://proxy.example.com/v1/messages'],
    ['  https://proxy.example.com/gateway  ', 'https://proxy.example.com/gateway/v1/messages'],
    ['', 'https://api.anthropic.com/v1/messages'],
    ['   ', 'https://api.anthropic.com/v1/messages'],
  ])('normalises the base URL %p to %s', async (aiBaseUrl, expected) => {
    replyWithItems([item()]);
    await analyze({ settings: aiSettings({ aiBaseUrl }) });
    expect(fetchMock.mock.calls[0][0]).toBe(expected);
  });

  it('uses the configured model, falling back to the default when blank', async () => {
    replyWithItems([item()]);
    await analyze({ settings: aiSettings({ aiModel: '  claude-custom-1  ' }) });
    expect(requestBody().model).toBe('claude-custom-1');

    fetchMock.mockReset();
    replyWithItems([item()]);
    await analyze({ settings: aiSettings({ aiModel: '   ' }) });
    expect(requestBody().model).toBe(DEFAULT_SETTINGS.aiModel);
  });
});

describe('parsing a well-formed reply', () => {
  it('turns the tool input into detected foods', async () => {
    replyWithItems(
      [
        item({ name: 'Grilled chicken', quantityGrams: 150, note: '  assumed no added oil  ' }),
        item({ name: 'White rice', quantityGrams: 200, calories: 260, protein: 5, carbs: 56, fat: 1, confidence: 0.6 }),
      ],
      { slot: 'lunch', summary: '  Chicken and rice  ' },
    );

    const result = await analyze();
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      name: 'Grilled chicken',
      quantityGrams: 150,
      macros: { calories: 165, protein: 10, carbs: 20, fat: 5 },
      confidence: 0.8,
      note: 'assumed no added oil',
    });
    expect(result.items[1].name).toBe('White rice');
    expect(result.slot).toBe('lunch');
    expect(result.summary).toBe('Chicken and rice');
  });

  it('takes the tool_use block even when text blocks come first, and ignores other tools', async () => {
    reply(200, {
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'thinking' },
        { type: 'tool_use', id: 't1', name: 'some_other_tool', input: { items: [] } },
        { type: 'tool_use', id: 't2', name: 'log_meal', input: { items: [item()] } },
      ],
    });
    const result = await analyze();
    expect(result.items).toHaveLength(1);
  });

  it('omits slot and summary when the model gives none it can use', async () => {
    replyWithItems([item()], { slot: 'brunch', summary: '   ' });
    const result = await analyze();
    expect('slot' in result).toBe(false);
    expect('summary' in result).toBe(false);
  });

  it.each([
    ['Snacks', 'snack'],
    ['snack', 'snack'],
    ['  DINNER ', 'dinner'],
    ['Breakfast', 'breakfast'],
  ])('normalises the slot %p to %s', async (slot, expected) => {
    replyWithItems([item()], { slot });
    expect((await analyze()).slot).toBe(expected);
  });

  it('accepts an empty item list without failing', async () => {
    replyWithItems([]);
    const result = await analyze();
    expect(result.items).toEqual([]);
  });

  it('caps the number of items it will return', async () => {
    replyWithItems(Array.from({ length: 20 }, (_, i) => item({ name: `Food ${i}` })));
    const result = await analyze();
    expect(result.items).toHaveLength(12);
    expect(result.items[11].name).toBe('Food 11');
  });

  it('truncates an over-long summary, name and note', async () => {
    replyWithItems([item({ name: 'n'.repeat(200), note: 'x'.repeat(300) })], {
      summary: 's'.repeat(400),
    });
    const result = await analyze();
    expect(result.items[0].name).toHaveLength(80);
    expect(result.items[0].note).toHaveLength(160);
    expect(result.summary).toHaveLength(240);
  });
});

describe('repairing the model numbers', () => {
  it('recomputes calories that contradict the macros by more than 25%', async () => {
    // 10 protein + 20 carbs + 5 fat implies 165 kcal.
    replyWithItems([item({ calories: 500 })]);
    expect((await analyze()).items[0].macros.calories).toBe(165);
  });

  it('keeps a reported figure that is within 25% of the macros', async () => {
    replyWithItems([item({ calories: 170 })]);
    expect((await analyze()).items[0].macros.calories).toBe(170);

    fetchMock.mockReset();
    // 206 is 24.8% above 165: just inside the tolerance.
    replyWithItems([item({ calories: 206 })]);
    expect((await analyze()).items[0].macros.calories).toBe(206);
  });

  it('fills in calories the model left at zero', async () => {
    replyWithItems([item({ calories: 0 })]);
    expect((await analyze()).items[0].macros.calories).toBe(165);
  });

  it('keeps the reported calories when the macros imply nothing', async () => {
    replyWithItems([item({ protein: 0, carbs: 0, fat: 0, calories: 250 })]);
    expect((await analyze()).items[0].macros).toEqual({
      calories: 250,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });

  it('drops an item whose portion weight is missing or unusable', async () => {
    replyWithItems([
      item({ name: 'No grams', quantityGrams: null }),
      item({ name: 'Not a number', quantityGrams: 'about a plateful' }),
      item({ name: 'Negative', quantityGrams: -50 }),
      item({ name: 'Zero', quantityGrams: 0 }),
      item({ name: '   ' }),
      item({ name: 42 }),
      item({ name: 'Good one' }),
    ]);
    const names = (await analyze()).items.map((food) => food.name);
    expect(names).toEqual(['Good one']);
  });

  it('drops a non-object entry in the item list', async () => {
    replyWithItems([item({ name: 'Good one' })]);
    fetchMock.mockReset();
    reply(200, toolUseBody({ items: ['just a string', null, 42, item({ name: 'Good one' })] }));
    const result = await analyze();
    expect(result.items.map((food) => food.name)).toEqual(['Good one']);
  });

  it('floors negative and unparseable macros at zero', async () => {
    replyWithItems([item({ protein: -3, carbs: 'lots', fat: null, calories: 90 })]);
    const macros = (await analyze()).items[0].macros;
    expect(macros.protein).toBe(0);
    expect(macros.carbs).toBe(0);
    expect(macros.fat).toBe(0);
    expect(macros.calories).toBe(90);
  });

  it('rounds macros to one decimal and reads numeric strings', async () => {
    replyWithItems([item({ protein: '12.34', carbs: 20.06, fat: 5 })]);
    const macros = (await analyze()).items[0].macros;
    expect(macros.protein).toBe(12.3);
    expect(macros.carbs).toBe(20.1);
  });

  it.each([
    [5000, 2000],
    [2000, 2000],
    [0.4, 1],
    [150.6, 151],
    ['180', 180],
  ])('clamps a portion weight of %p to %p grams', async (quantityGrams, expected) => {
    replyWithItems([item({ quantityGrams })]);
    expect((await analyze()).items[0].quantityGrams).toBe(expected);
  });

  it.each([
    [0.8, 0.8],
    [0, 0],
    [1, 1],
    [85, 0.85],
    [100, 1],
    [200, 1],
    [-1, 0],
    ['0.4', 0.4],
    [undefined, 0.5],
    ['very sure', 0.5],
  ])('clamps a confidence of %p to %p', async (confidence, expected) => {
    replyWithItems([item({ confidence })]);
    expect((await analyze()).items[0].confidence).toBe(expected);
  });

  it('omits a blank or missing note', async () => {
    replyWithItems([item({ note: '   ' }), item({ name: 'Second', note: undefined })]);
    const result = await analyze();
    expect('note' in result.items[0]).toBe(false);
    expect('note' in result.items[1]).toBe(false);
  });
});

describe('failures', () => {
  const codeFor = async (
    run: () => Promise<unknown>,
  ): Promise<VisionErrorCode> => (await rejection(run)).code;

  it('refuses before any network call when photo analysis is set to manual', async () => {
    const error = await rejection(() => analyze({ settings: aiSettings({ photoAnalysis: 'manual' }) }));
    expect(error.code).toBe('unsupported');
    expect(error.message).toMatch(/Settings/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getApiKeyMock).not.toHaveBeenCalled();
  });

  it('reports a missing API key without calling out', async () => {
    getApiKeyMock.mockResolvedValue(null);
    expect(await codeFor(() => analyze())).toBe('no-key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a photo that is too large to send', async () => {
    expect(await codeFor(() => analyze({ base64: 'a'.repeat(4_500_001) }))).toBe('too-large');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns HTTP 429 into a rate-limit error', async () => {
    reply(429, { error: { type: 'rate_limit_error', message: 'slow down' } });
    const error = await rejection(() => analyze());
    expect(error.code).toBe('rate-limit');
    expect(error.message.length).toBeGreaterThan(0);
  });

  it.each([500, 502, 503, 529])('turns HTTP %i into a network error', async (status) => {
    reply(status, { error: { message: 'overloaded' } });
    expect(await codeFor(() => analyze())).toBe('network');
  });

  it('turns a rejected key into a bad-response error carrying the API detail', async () => {
    reply(401, { error: { message: 'invalid x-api-key' } });
    const error = await rejection(() => analyze());
    expect(error.code).toBe('bad-response');
    expect(error.message).toContain('invalid x-api-key');
  });

  it('turns a transport failure into a network error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await codeFor(() => analyze())).toBe('network');
  });

  it('rejects a 200 whose body is not JSON', async () => {
    reply(200, '<html>gateway</html>');
    expect(await codeFor(() => analyze())).toBe('bad-response');
  });

  it('rejects a body with no tool_use block', async () => {
    reply(200, {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'I think that is a sandwich.' }],
    });
    expect(await codeFor(() => analyze())).toBe('bad-response');
  });

  it('rejects a tool_use block that is not log_meal', async () => {
    reply(200, {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't1', name: 'other_tool', input: { items: [] } }],
    });
    expect(await codeFor(() => analyze())).toBe('bad-response');
  });

  it.each([
    ['a refusal', { stop_reason: 'refusal', content: [] }],
    ['a truncated reply', { stop_reason: 'max_tokens', content: [{ type: 'text', text: '' }] }],
    ['an empty body', {}],
    ['a JSON array', []],
  ])('rejects %s', async (_label, body) => {
    reply(200, body);
    expect(await codeFor(() => analyze())).toBe('bad-response');
  });

  it('rejects tool input whose items are not a list', async () => {
    reply(200, toolUseBody({ items: 'chicken and rice' }));
    expect(await codeFor(() => analyze())).toBe('bad-response');
    fetchMock.mockReset();
    reply(200, toolUseBody({ summary: 'no items at all' }));
    expect(await codeFor(() => analyze())).toBe('bad-response');
  });
});

describe('describeVisionError', () => {
  it('uses the error message the service wrote for the user', async () => {
    reply(429, {});
    const error = await rejection(() => analyze());
    expect(describeVisionError(error)).toEqual({
      headline: 'Too many requests',
      suggestion: error.message,
    });
  });

  it('falls back to generic copy for anything that is not a VisionError', () => {
    const described = describeVisionError(new Error('boom'));
    expect(described.headline).toBe('Analysis failed');
    expect(described.suggestion.length).toBeGreaterThan(0);
  });

  it('recognises a VisionError-shaped object from another bundle', () => {
    const lookalike = { name: 'VisionError', code: 'no-key', message: 'Add a key.' };
    expect(describeVisionError(lookalike).headline).toBe('API key needed');
  });

  it('uses the stock suggestion when the error has no message', () => {
    const blank = new VisionError('network', '   ');
    expect(describeVisionError(blank).suggestion).toBe(
      'Check your connection and try again, or add the foods by hand.',
    );
  });
});

describe('entriesFromAnalysis', () => {
  const result: PhotoAnalysisResult = {
    items: [
      {
        name: 'Grilled chicken',
        quantityGrams: 150,
        macros: { calories: 248, protein: 46.5, carbs: 0, fat: 5.4 },
        confidence: 0.82,
        note: 'assumed no added oil',
      },
      {
        name: 'White rice',
        quantityGrams: 200,
        macros: { calories: 260, protein: 5.4, carbs: 56, fat: 0.6 },
        confidence: 0.35,
      },
    ],
  };

  it('marks every line as photo-derived and keeps the confidence', () => {
    const entries = entriesFromAnalysis(result);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.source)).toEqual(['photo', 'photo']);
    expect(entries.map((entry) => entry.confidence)).toEqual([0.82, 0.35]);
  });

  it('never claims a database food id and labels the estimated portion', () => {
    const entries = entriesFromAnalysis(result);
    expect(entries[0].foodId).toBeUndefined();
    expect(entries[0].name).toBe('Grilled chicken');
    expect(entries[0].quantityGrams).toBe(150);
    expect(entries[0].servingLabel).toBe('About 150 g');
  });

  it('copies the macros instead of sharing them with the analysis', () => {
    const entries = entriesFromAnalysis(result);
    expect(entries[0].macros).toEqual(result.items[0].macros);
    expect(entries[0].macros).not.toBe(result.items[0].macros);
  });

  it('gives every line a distinct id', () => {
    const entries = [...entriesFromAnalysis(result), ...entriesFromAnalysis(result)];
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });

  it('returns nothing for an empty analysis', () => {
    expect(entriesFromAnalysis({ items: [] })).toEqual([]);
  });
});
