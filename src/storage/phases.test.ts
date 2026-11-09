/// <reference types="jest" />
/**
 * Phases in storage.
 *
 * Exercises the real AsyncStorage jest mock, as the rest of the repository
 * tests do: the point is that a phase survives a write, an edit, an export and
 * an import of that export, and that a file carrying a broken phase adds
 * nothing rather than writing rubbish into the store.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Phase, Profile } from '@/types';

import { KEYS } from './keys';
import {
  clearAll,
  deletePhase,
  exportAll,
  getPhases,
  importBundle,
  savePhase,
  saveProfile,
} from './repository';

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  sex: 'male',
  age: 28,
  heightCm: 178,
  weightKg: 78,
  activityLevel: 'active',
  goal: 'gain',
  units: 'metric',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...overrides,
});

const phase = (
  overrides: Partial<Phase> & Pick<Phase, 'id' | 'startDate' | 'endDate'>,
): Phase => ({
  kind: 'cut',
  createdAt: `${overrides.startDate}T00:00:00.000Z`,
  updatedAt: `${overrides.startDate}T00:00:00.000Z`,
  ...overrides,
});

/** The owner's own cut: 8 November to 31 December 2026. */
const ownerCut = (): Phase =>
  phase({
    id: 'p_cut_2026',
    kind: 'cut',
    startDate: '2026-11-08',
    endDate: '2026-12-31',
    calories: 2450,
    proteinG: 180,
    carbsG: 285,
    fatG: 65,
    note: 'Muscle up, trunk fat flat across three readings.',
  });

const stored = async (): Promise<unknown> => {
  const raw = await AsyncStorage.getItem(KEYS.phases);
  return raw === null ? null : (JSON.parse(raw) as unknown);
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('getPhases and savePhase', () => {
  it('returns an empty list before anything is saved', async () => {
    expect(await getPhases()).toEqual([]);
  });

  it('round-trips a phase with every optional figure on it', async () => {
    const saved = await savePhase(ownerCut());
    expect(saved).toHaveLength(1);

    const [loaded] = await getPhases();
    expect(loaded.id).toBe('p_cut_2026');
    expect(loaded.kind).toBe('cut');
    expect(loaded.startDate).toBe('2026-11-08');
    expect(loaded.endDate).toBe('2026-12-31');
    expect(loaded.calories).toBe(2450);
    expect(loaded.proteinG).toBe(180);
    expect(loaded.carbsG).toBe(285);
    expect(loaded.fatG).toBe(65);
    expect(loaded.note).toBe('Muscle up, trunk fat flat across three readings.');
  });

  it('round-trips a phase carrying no target figures at all', async () => {
    await savePhase(phase({ id: 'bare', kind: 'maintain', startDate: '2027-01-01', endDate: '2027-02-28' }));
    const [loaded] = await getPhases();
    expect(loaded.calories).toBeUndefined();
    expect(loaded.proteinG).toBeUndefined();
    expect(loaded.carbsG).toBeUndefined();
    expect(loaded.fatG).toBeUndefined();
  });

  it('writes under the app key and nowhere else', async () => {
    await savePhase(ownerCut());
    expect(await AsyncStorage.getAllKeys()).toEqual([KEYS.phases]);
    expect(Array.isArray(await stored())).toBe(true);
  });

  it('stamps updatedAt on the way in', async () => {
    const [saved] = await savePhase(ownerCut());
    expect(saved.updatedAt).not.toBe('2026-11-08T00:00:00.000Z');
    expect(Number.isNaN(Date.parse(saved.updatedAt))).toBe(false);
  });

  it('replaces the phase carrying the same id rather than duplicating it', async () => {
    await savePhase(ownerCut());
    const edited: Phase = { ...ownerCut(), calories: 2500, note: 'Eased it up a little.' };
    const next = await savePhase(edited);

    expect(next).toHaveLength(1);
    expect(next[0].calories).toBe(2500);
    expect(next[0].note).toBe('Eased it up a little.');
    expect(await getPhases()).toHaveLength(1);
  });

  it('keeps the day an edited phase was first set', async () => {
    const [first] = await savePhase(ownerCut());
    const [again] = await savePhase({
      ...ownerCut(),
      createdAt: '2030-01-01T00:00:00.000Z',
      calories: 2500,
    });
    expect(again.createdAt).toBe(first.createdAt);
  });

  it('keeps the list sorted by start date however the phases arrive', async () => {
    await savePhase(phase({ id: 'build', kind: 'build', startDate: '2027-01-01', endDate: '2027-03-31' }));
    await savePhase(ownerCut());
    await savePhase(phase({ id: 'early', kind: 'maintain', startDate: '2026-09-01', endDate: '2026-11-07' }));

    expect((await getPhases()).map((item) => item.id)).toEqual([
      'early',
      'p_cut_2026',
      'build',
    ]);
  });

  it('re-sorts when an edit moves a phase earlier', async () => {
    await savePhase(ownerCut());
    await savePhase(phase({ id: 'build', kind: 'build', startDate: '2027-01-01', endDate: '2027-03-31' }));
    await savePhase({ ...ownerCut(), startDate: '2027-04-01', endDate: '2027-05-31' });

    expect((await getPhases()).map((item) => item.id)).toEqual(['build', 'p_cut_2026']);
  });

  it('sorts what an older write left out of order', async () => {
    await AsyncStorage.setItem(
      KEYS.phases,
      JSON.stringify([
        phase({ id: 'late', startDate: '2027-01-01', endDate: '2027-03-31' }),
        ownerCut(),
      ]),
    );
    expect((await getPhases()).map((item) => item.id)).toEqual(['p_cut_2026', 'late']);
  });

  it('returns an empty list rather than throwing when the stored value is corrupt', async () => {
    // The repository logs the bad read; that warning is expected here, not noise.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await AsyncStorage.setItem(KEYS.phases, '[{broken');
    expect(await getPhases()).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('deletePhase', () => {
  it('removes one phase and leaves the rest', async () => {
    await savePhase(ownerCut());
    await savePhase(phase({ id: 'build', kind: 'build', startDate: '2027-01-01', endDate: '2027-03-31' }));

    const next = await deletePhase('p_cut_2026');
    expect(next.map((item) => item.id)).toEqual(['build']);
    expect((await getPhases()).map((item) => item.id)).toEqual(['build']);
  });

  it('leaves the store alone when the id is unknown', async () => {
    await savePhase(ownerCut());
    const next = await deletePhase('never-existed');
    expect(next.map((item) => item.id)).toEqual(['p_cut_2026']);
    expect(await getPhases()).toHaveLength(1);
  });

  it('empties the list when the last phase goes', async () => {
    await savePhase(ownerCut());
    expect(await deletePhase('p_cut_2026')).toEqual([]);
    expect(await stored()).toEqual([]);
  });
});

describe('exportAll and importBundle', () => {
  it('carries phases out in the bundle', async () => {
    await savePhase(ownerCut());
    const bundle = await exportAll();

    expect(bundle.phases).toHaveLength(1);
    expect(bundle.phases[0].id).toBe('p_cut_2026');
    expect(bundle.phases[0].calories).toBe(2450);
  });

  it('exports an empty list when there are none', async () => {
    expect((await exportAll()).phases).toEqual([]);
  });

  it('brings every phase back through an import of its own export', async () => {
    await saveProfile(profile());
    await savePhase(ownerCut());
    await savePhase(phase({ id: 'build', kind: 'build', startDate: '2027-01-01', endDate: '2027-03-31' }));
    const exported = (await exportAll()).phases;

    await clearAll();
    expect(await getPhases()).toEqual([]);

    const result = await importBundle(JSON.stringify({ version: 1, phases: exported }));
    expect(result.ok).toBe(true);
    expect(result.counts.phases).toEqual({ added: 2, replaced: 0, skipped: 0 });
    expect(await getPhases()).toEqual(exported);
  });

  it('replaces rather than duplicates when the same file is read twice', async () => {
    await savePhase(ownerCut());
    const raw = JSON.stringify({ version: 1, phases: (await exportAll()).phases });

    const second = await importBundle(raw);
    expect(second.counts.phases).toEqual({ added: 0, replaced: 1, skipped: 0 });
    expect(await getPhases()).toHaveLength(1);
  });

  it('merges an imported phase alongside the ones already here, sorted', async () => {
    await savePhase(ownerCut());
    const result = await importBundle(
      JSON.stringify({
        version: 1,
        phases: [phase({ id: 'build', kind: 'build', startDate: '2027-01-01', endDate: '2027-03-31' })],
      }),
    );

    expect(result.counts.phases.added).toBe(1);
    expect((await getPhases()).map((item) => item.id)).toEqual(['p_cut_2026', 'build']);
  });

  it('fills in timestamps an imported phase does not carry', async () => {
    await importBundle(
      JSON.stringify({
        version: 1,
        phases: [
          { id: 'p1', kind: 'cut', startDate: '2026-11-08', endDate: '2026-12-31' },
        ],
      }),
    );
    const [loaded] = await getPhases();
    expect(loaded.createdAt).toBe('2026-11-08T00:00:00.000Z');
    expect(loaded.updatedAt).toBe('2026-11-08T00:00:00.000Z');
  });

  it('skips a malformed phase rather than writing it', async () => {
    const result = await importBundle(
      JSON.stringify({
        version: 1,
        phases: [
          ownerCut(),
          null,
          { id: 'no-kind', kind: 'bulk', startDate: '2027-01-01', endDate: '2027-02-01' },
          { id: 'bad-day', kind: 'cut', startDate: '2026-02-30', endDate: '2026-03-10' },
          { id: 'inverted', kind: 'cut', startDate: '2027-03-31', endDate: '2027-01-01' },
          { kind: 'cut', startDate: '2027-05-01', endDate: '2027-06-01' },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.counts.phases).toEqual({ added: 1, replaced: 0, skipped: 5 });
    expect((await getPhases()).map((item) => item.id)).toEqual(['p_cut_2026']);

    const codes = result.problems.map((problem) => problem.code);
    expect(codes).toEqual(['badRecord', 'badFields', 'badDate', 'badFields', 'badRecord']);
    expect(result.problems.map((problem) => problem.kind)).toEqual(
      Array.from({ length: 5 }, () => 'phases'),
    );
    expect(result.problems[2]).toEqual({
      code: 'badDate',
      kind: 'phases',
      position: 4,
      id: 'bad-day',
    });
  });

  it('writes nothing at all when every phase in the file is broken', async () => {
    const result = await importBundle(
      JSON.stringify({ version: 1, phases: [{ id: 'x' }, 'not a phase'] }),
    );
    expect(result.counts.phases.skipped).toBe(2);
    expect(await stored()).toBeNull();
    expect(await getPhases()).toEqual([]);
  });

  it('keeps the first of two phases sharing an id and reports the second', async () => {
    const result = await importBundle(
      JSON.stringify({
        version: 1,
        phases: [
          ownerCut(),
          { ...ownerCut(), calories: 3000 },
        ],
      }),
    );

    expect(result.counts.phases).toEqual({ added: 1, replaced: 0, skipped: 1 });
    expect(result.problems[0]).toEqual({
      code: 'duplicate',
      kind: 'phases',
      position: 2,
      id: 'p_cut_2026',
    });
    expect((await getPhases())[0].calories).toBe(2450);
  });

  it('refuses the whole key when phases is not a list', async () => {
    await savePhase(ownerCut());
    const result = await importBundle(JSON.stringify({ version: 1, phases: { id: 'p1' } }));

    expect(result.problems).toEqual([{ code: 'wrongShape', kind: 'phases' }]);
    expect(result.counts.phases.skipped).toBe(0);
    expect((await getPhases())[0].calories).toBe(2450);
  });

  it('counts a dry run without writing a byte', async () => {
    const result = await importBundle(
      JSON.stringify({ version: 1, phases: [ownerCut()] }),
      { dryRun: true },
    );

    expect(result.counts.phases.added).toBe(1);
    expect(await stored()).toBeNull();
    expect(await getPhases()).toEqual([]);
  });
});

describe('clearAll', () => {
  it('removes the phases it wrote', async () => {
    await savePhase(ownerCut());
    expect(await stored()).not.toBeNull();

    await clearAll();

    expect(await stored()).toBeNull();
    expect(await getPhases()).toEqual([]);
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});
