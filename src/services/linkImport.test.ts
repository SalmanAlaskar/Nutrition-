/**
 * The link importer, which is the only path that can put someone's readings on
 * their phone for them. Its two failure modes are both silent, which is why
 * they are pinned down here: a payload left in the address bar imports twice on
 * the next reload, and a payload that arrives at an already-open page is never
 * read at all.
 */

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import {
  buildLinkImport,
  hasLinkImport,
  subscribeLinkImport,
  takeLinkImport,
} from './linkImport';

type Listener = () => void;

/**
 * Enough of a browser to exercise the module: a fragment that can be rewritten,
 * a `replaceState` that behaves like the real one in the way that matters here
 * (it never fires `hashchange`), and the two events the module listens for.
 */
function fakeWindow(hash: string) {
  const listeners = new Map<string, Set<Listener>>();
  return {
    location: { pathname: '/Nutrition-/', search: '', hash },
    history: {
      replaceState(_state: unknown, _title: string, url: string) {
        const at = url.indexOf('#');
        this.calls += 1;
        win.location.hash = at === -1 ? '' : url.slice(at);
      },
      calls: 0,
    },
    addEventListener(type: string, fn: Listener) {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
    /** Stands in for the browser's own same-document navigation. */
    navigateToHash(next: string) {
      win.location.hash = next;
      listeners.get('hashchange')?.forEach((fn) => fn());
    },
    countListeners(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

let win: ReturnType<typeof fakeWindow>;
let original: PropertyDescriptor | undefined;

function install(hash: string) {
  win = fakeWindow(hash);
  Object.defineProperty(globalThis, 'window', {
    value: win,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  original = Object.getOwnPropertyDescriptor(globalThis, 'window');
});

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'window', original);
  else delete (globalThis as { window?: unknown }).window;
});

const PAYLOAD = '{"version":1,"phases":[]}';

describe('takeLinkImport', () => {
  it('hands back the payload a link was carrying', () => {
    install(buildLinkImport(PAYLOAD));
    expect(takeLinkImport()).toBe(PAYLOAD);
  });

  it('clears the payload, so a reload does not import it a second time', () => {
    install(buildLinkImport(PAYLOAD));
    takeLinkImport();
    expect(win.location.hash).toBe('');
    expect(takeLinkImport()).toBeNull();
  });

  it('leaves anything else in the fragment alone', () => {
    install(`#tab=training&${buildLinkImport(PAYLOAD).slice(1)}`);
    expect(takeLinkImport()).toBe(PAYLOAD);
    expect(win.location.hash).toBe('#tab=training');
  });

  it('is null when there is no payload', () => {
    install('#tab=training');
    expect(takeLinkImport()).toBeNull();
    // Nothing to take means nothing to tidy: the address bar is left untouched.
    expect(win.history.calls).toBe(0);
  });

  it('is null rather than throwing on a payload that will not decode', () => {
    install('#import=%E0%A4%A');
    expect(takeLinkImport()).toBeNull();
  });
});

describe('hasLinkImport', () => {
  it('reports a payload without consuming it', () => {
    install(buildLinkImport(PAYLOAD));
    expect(hasLinkImport()).toBe(true);
    expect(hasLinkImport()).toBe(true);
    expect(takeLinkImport()).toBe(PAYLOAD);
  });

  it('is false for a fragment carrying something else', () => {
    install('#tab=training');
    expect(hasLinkImport()).toBe(false);
  });
});

describe('subscribeLinkImport', () => {
  it('reads a payload that arrives at a page already open', () => {
    install('');
    const seen: string[] = [];
    const stop = subscribeLinkImport((payload) => seen.push(payload));

    // Tapping the link with the app open changes only the fragment: no reload,
    // so this event is the one and only chance to read the data.
    win.navigateToHash(buildLinkImport(PAYLOAD));

    expect(seen).toEqual([PAYLOAD]);
    expect(win.location.hash).toBe('');
    stop();
  });

  it('stays quiet for a fragment change that carries no payload', () => {
    install('');
    const seen: string[] = [];
    const stop = subscribeLinkImport((payload) => seen.push(payload));

    win.navigateToHash('#tab=training');

    expect(seen).toEqual([]);
    stop();
  });

  it('reads each payload once, however many arrive', () => {
    install('');
    const seen: string[] = [];
    const stop = subscribeLinkImport((payload) => seen.push(payload));

    win.navigateToHash(buildLinkImport(PAYLOAD));
    win.navigateToHash(buildLinkImport('{"version":1,"scans":[]}'));

    expect(seen).toEqual([PAYLOAD, '{"version":1,"scans":[]}']);
    stop();
  });

  it('detaches both listeners when it is stopped', () => {
    install('');
    const seen: string[] = [];
    const stop = subscribeLinkImport((payload) => seen.push(payload));
    expect(win.countListeners('hashchange')).toBe(1);
    expect(win.countListeners('popstate')).toBe(1);

    stop();

    expect(win.countListeners('hashchange')).toBe(0);
    expect(win.countListeners('popstate')).toBe(0);
    win.navigateToHash(buildLinkImport(PAYLOAD));
    expect(seen).toEqual([]);
  });
});
